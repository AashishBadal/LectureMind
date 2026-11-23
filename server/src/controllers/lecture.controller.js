import { prisma } from '../config/prisma.js';
import { transcribeAudio } from '../services/gemini/transcription.service.js';
import { analyzeLecture } from '../services/gemini/analysis.service.js';
import { extractRelationships } from '../services/gemini/relationshipExtraction.service.js';
import { generateLearningMap, validateLearningMapIntegrity } from '../services/gemini/learningMap.service.js';
import { chatWithLecture } from '../services/gemini/ragChat.service.js';
import { indexLectureTranscript } from '../services/rag/indexer.js';
import { sanitizeFileName, validateAudioBuffer } from '../middleware/upload.js';
import { logger } from '../utils/logger.js';
import { calculateLectureCredits, COST_PER_LECTURE_ANALYSIS } from '../services/esewa.service.js';
import * as mm from 'music-metadata';
import fs from 'fs/promises';
import path from 'path';

/**
 * Automatically segments plain text transcripts into structured timestamped dialogue segments.
 * If audioDuration is supplied, timestamps scale proportionally across the full recording.
 * @param {string} content
 * @param {number|null} [audioDuration=null]
 * @returns {Array<{ id: number, start: number, end: number, speaker: string, text: string }>}
 */
export function parseTranscriptIntoSegments(content, audioDuration = null) {
  if (!content || typeof content !== 'string') return [];

  // Split by double newlines (paragraphs) or single newlines with non-empty text
  const rawBlocks = content
    .split(/\r?\n\s*\r?\n|\r?\n/)
    .map(p => p.trim())
    .filter(p => p.length > 0);

  if (rawBlocks.length === 0) return [];

  const totalWords = rawBlocks.reduce((sum, b) => sum + b.split(/\s+/).filter(Boolean).length, 0);
  const targetDuration = Number.isFinite(audioDuration) && audioDuration > 0
    ? audioDuration
    : Math.max(60, Math.round((totalWords / 130) * 60));

  let currentStart = 0;
  const segments = [];

  for (let i = 0; i < rawBlocks.length; i++) {
    const text = rawBlocks[i];
    const wordCount = text.split(/\s+/).filter(Boolean).length;
    const ratio = totalWords > 0 ? wordCount / totalWords : 1 / rawBlocks.length;
    const blockDuration = Math.max(4, Math.round(ratio * targetDuration));
    const end = Math.min(targetDuration, currentStart + blockDuration);

    // Detect if text starts with a speaker indicator like "Professor Smith:" or "Speaker 1:"
    let speaker = 'Lecturer';
    let cleanText = text;
    const speakerMatch = text.match(/^([A-Za-z0-9\s._-]{2,25}):\s+(.+)$/s);
    if (speakerMatch) {
      speaker = speakerMatch[1].trim();
      cleanText = speakerMatch[2].trim();
    }

    segments.push({
      id: i + 1,
      start: currentStart,
      end: end > currentStart ? end : currentStart + blockDuration,
      speaker,
      text: cleanText
    });

    currentStart = end;
  }

  return segments;
}

/**
 * Helper to check if a user has read access to a lecture.
 * A user can view a lecture if:
 * 1. They are the owner (userId === req.user.id)
 * 2. The lecture belongs to a subject that the user is enrolled in or teaches
 */
export const canAccessLecture = async (lecture, userId) => {
  if (!lecture) return false;
  if (lecture.userId === userId) return true;
  if (lecture.subjectId) {
    const subject = await prisma.subject.findUnique({
      where: { id: lecture.subjectId },
      select: { teacherId: true }
    });
    if (subject?.teacherId === userId) return true;

    const member = await prisma.subjectMember.findUnique({
      where: {
        subjectId_userId: {
          subjectId: lecture.subjectId,
          userId
        }
      }
    });
    return Boolean(member);
  }
  return false;
};

/**
 * GET /api/lectures
 * List lectures belonging ONLY to the authenticated user.
 * Supports query parameter `search` or `q` for case-insensitive multi-attribute search.
 */
export const getLectures = async (req, res) => {
  try {
    const { search, q } = req.query;
    const searchQuery = (search || q || '').trim();

    const accessCondition = {
      OR: [
        { userId: req.user.id }, // Direct user ownership
        { subject: { members: { some: { userId: req.user.id } } } }, // Enrolled in subject
        { subject: { teacherId: req.user.id } } // Teaching the subject
      ]
    };

    const where = searchQuery
      ? {
          AND: [
            accessCondition,
            {
              OR: [
                { title: { contains: searchQuery, mode: 'insensitive' } },
                { originalFileName: { contains: searchQuery, mode: 'insensitive' } },
                { transcript: { content: { contains: searchQuery, mode: 'insensitive' } } },
                { summary: { content: { contains: searchQuery, mode: 'insensitive' } } },
                { concepts: { some: { name: { contains: searchQuery, mode: 'insensitive' } } } },
                { concepts: { some: { description: { contains: searchQuery, mode: 'insensitive' } } } }
              ]
            }
          ]
        }
      : accessCondition;

    const lectures = await prisma.lecture.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      include: {
        subject: {
          select: { id: true, name: true, code: true, color: true }
        },
        transcript: {
          select: { id: true, updatedAt: true }
        },
        summary: {
          select: { id: true, updatedAt: true }
        },
        learningMap: {
          select: { id: true, updatedAt: true }
        },
        _count: {
          select: {
            concepts: true,
            relationships: true,
            bookmarks: true
          }
        }
      }
    });

    const formattedLectures = lectures.map((lec) => {
      const hasTranscript = Boolean(lec.transcript);
      const hasSummary = Boolean(lec.summary);
      const hasLearningMap = Boolean(lec.learningMap);

      return {
        ...lec,
        processingStatus: lec.status,
        transcriptStatus: hasTranscript
          ? 'READY'
          : lec.status === 'PROCESSING' || lec.status === 'TRANSCRIBING'
          ? 'IN_PROGRESS'
          : 'MISSING',
        summaryStatus: hasSummary ? 'READY' : 'MISSING',
        learningMapStatus: hasLearningMap ? 'READY' : 'MISSING',
        hasTranscript,
        hasSummary,
        hasLearningMap,
        conceptCount: lec._count?.concepts || 0,
        relationshipCount: lec._count?.relationships || 0,
        bookmarkCount: lec._count?.bookmarks || 0
      };
    });

    return res.status(200).json({
      success: true,
      lectures: formattedLectures,
      total: formattedLectures.length,
      searchQuery: searchQuery || null
    });
  } catch (error) {
    logger.error('Error fetching lectures:', error);
    return res.status(500).json({
      success: false,
      error: { message: 'Failed to retrieve lectures.' }
    });
  }
};

/**
 * POST /api/lectures
 * Create a new lecture under the authenticated user's account
 * Supports assigning to a subject and specific lecture date
 */
export const createLecture = async (req, res) => {
  try {
    const { title, originalFileName, duration, audioUrl, storagePath, subjectId, lectureDate, transcriptText, transcript } = req.body;

    const rawTranscript = (typeof transcriptText === 'string' ? transcriptText : typeof transcript === 'string' ? transcript : '').trim();
    const hasPastedTranscript = rawTranscript.length > 0;

    let lectureTitle = (title || req.file?.originalname || '').trim();
    if (!lectureTitle && hasPastedTranscript) {
      // Auto-extract title from first non-empty line
      const firstLine = rawTranscript.split(/\r?\n/).map(l => l.trim()).find(l => l.length > 0);
      lectureTitle = firstLine ? firstLine.slice(0, 60).replace(/[#*_-]/g, '').trim() : 'Pasted Lecture Transcript';
    } else if (!lectureTitle) {
      lectureTitle = 'Untitled Lecture';
    }

    if (!lectureTitle || typeof lectureTitle !== 'string' || !lectureTitle.trim()) {
      return res.status(400).json({
        success: false,
        error: { message: 'Lecture title is required.' }
      });
    }

    // If subjectId is supplied, verify caller has permission (only instructors can add lectures to a subject)
    if (subjectId) {
      const subject = await prisma.subject.findUnique({
        where: { id: subjectId },
        select: { id: true, teacherId: true }
      });

      if (!subject) {
        return res.status(404).json({
          success: false,
          error: { message: 'Subject not found.' }
        });
      }

      const isTeacher = subject.teacherId === req.user.id;
      if (!isTeacher) {
        const membership = await prisma.subjectMember.findUnique({
          where: {
            subjectId_userId: {
              subjectId,
              userId: req.user.id
            }
          }
        });

        if (!membership || membership.role !== 'TEACHER') {
          return res.status(403).json({
            success: false,
            error: { message: 'Students are not allowed to add lectures to subjects. Only instructors can add lectures.' }
          });
        }
      }
    }

    // Validate buffer if a file was submitted directly
    if (req.file?.buffer) {
      const bufferCheck = validateAudioBuffer(req.file.buffer);
      if (!bufferCheck.valid) {
        return res.status(400).json({
          success: false,
          error: { message: bufferCheck.error || 'Invalid audio file.' }
        });
      }
    }

    const rawFileName = req.file?.originalname || originalFileName || (hasPastedTranscript ? 'Direct Transcript' : null);
    const fileName = rawFileName ? sanitizeFileName(rawFileName) : null;
    const initialStatus = hasPastedTranscript ? 'TRANSCRIBED' : req.file ? 'UPLOADED' : 'PENDING';

    const parsedDate = lectureDate ? new Date(lectureDate) : new Date();

    // Calculate duration from client or audio buffer metadata
    let calcDuration = duration ? parseInt(duration, 10) : null;
    if (!calcDuration && req.file?.buffer) {
      try {
        const metadata = await mm.parseBuffer(req.file.buffer, req.file.mimetype || 'audio/mp3');
        if (metadata.format?.duration) {
          calcDuration = Math.round(metadata.format.duration);
          logger.info(`Extracted physical audio duration in createLecture: ${calcDuration}s (${(calcDuration / 60).toFixed(1)} mins)`);
        }
      } catch (metaErr) {
        logger.warn('Could not extract duration from req.file.buffer:', metaErr.message);
      }
    }

    if (!calcDuration && hasPastedTranscript) {
      const wordCount = rawTranscript.split(/\s+/).filter(Boolean).length;
      calcDuration = Math.max(30, Math.round((wordCount / 130) * 60)); // Estimate ~130 words/min
    }

    let createdTranscript = null;
    const lecture = await prisma.$transaction(async (tx) => {
      const lec = await tx.lecture.create({
        data: {
          userId: req.user.id, // Enforce authenticated user ownership
          title: lectureTitle.trim(),
          originalFileName: fileName,
          duration: calcDuration,
          audioUrl: audioUrl || null,
          storagePath: storagePath || null,
          status: initialStatus,
          subjectId: subjectId || null,
          lectureDate: isNaN(parsedDate.getTime()) ? new Date() : parsedDate
        }
      });

      if (hasPastedTranscript) {
        const generatedSegments = parseTranscriptIntoSegments(rawTranscript);
        createdTranscript = await tx.transcript.create({
          data: {
            lectureId: lec.id,
            content: rawTranscript,
            segments: generatedSegments
          }
        });
      }

      return lec;
    });

    logger.info(`Lecture created: ${lecture.id} (Status: ${lecture.status}, HasTranscript: ${hasPastedTranscript}) by user ${req.user.id}`);

    // Background RAG indexing for pasted transcripts (non-blocking)
    if (hasPastedTranscript && createdTranscript) {
      indexLectureTranscript(lecture.id, {
        content: createdTranscript.content,
        segments: createdTranscript.segments
      }).catch(err =>
        logger.warn(`[RAG] Background indexing failed for lecture ${lecture.id}: ${err.message}`)
      );
    }

    return res.status(201).json({
      success: true,
      lecture: {
        ...lecture,
        hasTranscript: hasPastedTranscript,
        transcript: createdTranscript
      }
    });
  } catch (error) {
    logger.error('Error creating lecture:', error);
    return res.status(500).json({
      success: false,
      error: { message: 'Failed to create lecture.' }
    });
  }
};

/**
 * GET /api/lectures/:id
 * Retrieve a specific lecture with user access enforcement (owner or subject member)
 */
export const getLectureById = async (req, res) => {
  try {
    const { id } = req.params;

    const lecture = await prisma.lecture.findUnique({
      where: { id },
      include: {
        subject: {
          select: { id: true, name: true, code: true, color: true }
        },
        transcript: true,
        summary: true,
        concepts: {
          include: {
            outgoingRelations: true,
            incomingRelations: true
          }
        },
        relationships: {
          include: {
            sourceConcept: true,
            targetConcept: true
          }
        },
        learningMap: true,
        bookmarks: true
      }
    });

    if (!lecture) {
      return res.status(404).json({
        success: false,
        error: { message: 'Lecture not found.' }
      });
    }

    // USER ACCESS CHECK (Owner or enrolled subject member)
    const hasAccess = await canAccessLecture(lecture, req.user.id);
    if (!hasAccess) {
      logger.warn(`User ${req.user.id} attempted unauthorized access to lecture ${id} owned by ${lecture.userId}`);
      return res.status(403).json({
        success: false,
        error: { message: 'Access denied. You do not have permission to view this lecture.' }
      });
    }

    // Auto-backfill physical audio duration if missing or inaccurate (e.g. defaulted to 10s fallback)
    if ((!lecture.duration || lecture.duration <= 10) && lecture.storagePath) {
      try {
        const storageDir = path.resolve(process.env.AUDIO_STORAGE_DIR || path.join(process.cwd(), 'storage', 'audio'));
        const audioPath = path.resolve(storageDir, path.basename(lecture.storagePath));
        const meta = await mm.parseFile(audioPath);
        if (meta.format?.duration) {
          const detected = Math.round(meta.format.duration);
          lecture.duration = detected;
          prisma.lecture.update({
            where: { id: lecture.id },
            data: { duration: detected }
          }).catch((err) => logger.warn('Failed to persist backfilled duration:', err.message));
        }
      } catch (durErr) {
        logger.warn(`Could not backfill physical audio duration for lecture ${id}:`, durErr.message);
      }
    }

    // Auto-backfill segments if transcript content exists but segments is missing/empty
    if (
      lecture.transcript &&
      (!lecture.transcript.segments || !Array.isArray(lecture.transcript.segments) || lecture.transcript.segments.length <= 1) &&
      lecture.transcript.content &&
      lecture.transcript.content.trim()
    ) {
      // If single giant segment exists or missing, re-segment cleanly across lecture duration
      const isSingleGiant = lecture.transcript.segments?.length === 1 && (lecture.transcript.segments[0].text?.length || 0) > 500;
      if (!lecture.transcript.segments || lecture.transcript.segments.length === 0 || isSingleGiant) {
        const generated = parseTranscriptIntoSegments(lecture.transcript.content, lecture.duration);
        lecture.transcript.segments = generated;
        prisma.transcript.update({
          where: { id: lecture.transcript.id },
          data: { segments: generated }
        }).catch((err) => logger.warn('Background segments backfill error:', err));
      }
    }

    const requiredCredits = calculateLectureCredits(lecture.duration, lecture.transcript?.content);

    return res.status(200).json({
      success: true,
      lecture: {
        ...lecture,
        requiredCredits
      }
    });
  } catch (error) {
    logger.error('Error fetching lecture by id:', error);
    return res.status(500).json({
      success: false,
      error: { message: 'Failed to retrieve lecture.' }
    });
  }
};

/**
 * POST /api/lectures/:id/transcribe
 * Saves lecture audio and transcribes it with the configured Gemini audio model.
 */
export const transcribeLecture = async (req, res) => {
  const { id } = req.params;

  try {
    // 1. Check ownership
    const lecture = await prisma.lecture.findUnique({
      where: { id }
    });

    if (!lecture) {
      return res.status(404).json({
        success: false,
        error: { message: 'Lecture not found.' }
      });
    }

    if (lecture.userId !== req.user.id) {
      return res.status(403).json({
        success: false,
        error: { message: 'Access denied. You do not have permission to transcribe this lecture.' }
      });
    }

    // 2. Validate and persist original audio. The file name is generated from the
    // lecture id; user supplied paths are never used for storage.
    let audioBuffer = null;
    let audioMime = 'audio/mp3';

    if (req.file) {
      audioBuffer = req.file.buffer;
      audioMime = req.file.mimetype || audioMime;
    } else if (req.body.audioBase64) {
      audioBuffer = Buffer.from(req.body.audioBase64, 'base64');
      audioMime = req.body.mimeType || audioMime;
    } else {
      return res.status(400).json({
        success: false,
        error: { message: 'No audio file or audio data provided for transcription.' }
      });
    }

    // Validate audio buffer magic bytes / file signature
    const bufferCheck = validateAudioBuffer(audioBuffer);
    if (!bufferCheck.valid) {
      return res.status(400).json({
        success: false,
        error: { message: bufferCheck.error || 'Invalid or unrecognizable audio file signature.' }
      });
    }

    const extension = path.extname(sanitizeFileName(req.file?.originalname || lecture.originalFileName || 'audio.mp3')).toLowerCase() || '.mp3';
    const storageDir = path.resolve(process.env.AUDIO_STORAGE_DIR || path.join(process.cwd(), 'storage', 'audio'));
    await fs.mkdir(storageDir, { recursive: true });
    const audioPath = path.join(storageDir, `${id}${extension}`);
    await fs.writeFile(audioPath, audioBuffer);
    await prisma.lecture.update({ where: { id }, data: { storagePath: path.basename(audioPath) } });

    // Extract exact physical duration from audio buffer using music-metadata
    let detectedDuration = null;
    try {
      const meta = await mm.parseBuffer(audioBuffer, audioMime);
      if (meta.format?.duration) {
        detectedDuration = Math.round(meta.format.duration);
        logger.info(`Detected physical duration in transcribeLecture: ${detectedDuration}s (${(detectedDuration / 60).toFixed(1)} mins)`);
      }
    } catch (err) {
      logger.warn('Could not extract duration in transcribeLecture:', err.message);
    }

    await prisma.lecture.update({ where: { id }, data: { status: 'TRANSCRIBING' } });
    logger.info(`Starting Gemini transcription for lecture ${id} (${lecture.title})...`);
    let transcriptResult;
    try {
      transcriptResult = await transcribeAudio({
        audioData: audioBuffer,
        mimeType: audioMime,
        lectureTitle: lecture.title,
        durationSeconds: detectedDuration
      });
    } catch (aiError) {
      await prisma.lecture.update({ where: { id }, data: { status: 'FAILED' } });
      throw aiError;
    }

    const lastSegment = transcriptResult.segments?.at(-1);
    const segmentDuration = Number.isFinite(lastSegment?.end) ? Math.round(lastSegment.end) : null;
    const finalDuration = detectedDuration || transcriptResult.duration || segmentDuration || lecture.duration;

    const savedTranscript = await prisma.transcript.upsert({
      where: { lectureId: id },
      create: { lectureId: id, content: transcriptResult.content, segments: transcriptResult.segments },
      update: { content: transcriptResult.content, segments: transcriptResult.segments }
    });
    const updatedLecture = await prisma.lecture.update({
      where: { id },
      data: { status: 'TRANSCRIBED', duration: finalDuration || undefined, storagePath: path.basename(audioPath) }
    });
    indexLectureTranscript(id, { content: transcriptResult.content, segments: transcriptResult.segments }).catch(err =>
      logger.warn(`[RAG] Background indexing failed for lecture ${id}: ${err.message}`)
    );
    return res.status(200).json({
      success: true,
      message: 'Lecture transcribed successfully.',
      status: 'TRANSCRIBED',
      lecture: updatedLecture,
      transcript: savedTranscript
    });

  } catch (error) {
    logger.error(`Failed transcribing lecture ${id}:`, error);
    const status = error.status || 500;
    return res.status(status).json({
      success: false,
      error: {
        message: error.message || 'Failed to transcribe audio.',
        code: error.code || 'TRANSCRIPTION_FAILED'
      }
    });
  }
};

/** Stream stored audio with byte-range support so the browser can seek. */
export const getLectureAudio = async (req, res) => {
  try {
    const lecture = await prisma.lecture.findUnique({ where: { id: req.params.id } });
    if (!lecture) return res.status(404).json({ success: false, error: { message: 'Lecture not found.' } });
    if (!(await canAccessLecture(lecture, req.user.id))) {
      return res.status(403).json({ success: false, error: { message: 'Access denied.' } });
    }
    if (!lecture.storagePath) return res.status(404).json({ success: false, error: { message: 'No audio recording is stored for this lecture.' } });
    const storageDir = path.resolve(process.env.AUDIO_STORAGE_DIR || path.join(process.cwd(), 'storage', 'audio'));
    const audioPath = path.resolve(storageDir, path.basename(lecture.storagePath));
    if (!audioPath.startsWith(`${storageDir}${path.sep}`)) return res.status(400).end();
    await fs.access(audioPath);
    res.setHeader('Cache-Control', 'private, max-age=3600');
    return res.sendFile(audioPath);
  } catch (error) {
    if (error.code === 'ENOENT') return res.status(404).json({ success: false, error: { message: 'Audio file is unavailable on this server.' } });
    logger.error('Error streaming lecture audio:', error);
    return res.status(500).json({ success: false, error: { message: 'Unable to stream lecture audio.' } });
  }
};

/**
 * GET /api/lectures/:id/transcript
 * Retrieve the saved transcript for a lecture
 * Only the lecture owner can view the transcript.
 */
export const getTranscript = async (req, res) => {
  const { id } = req.params;

  try {
    const lecture = await prisma.lecture.findUnique({
      where: { id }
    });

    if (!lecture) {
      return res.status(404).json({
        success: false,
        error: { message: 'Lecture not found.' }
      });
    }

    // User access check (Owner or subject member)
    const hasAccess = await canAccessLecture(lecture, req.user.id);
    if (!hasAccess) {
      return res.status(403).json({
        success: false,
        error: { message: 'Access denied. You do not have permission to view this transcript.' }
      });
    }

    const transcript = await prisma.transcript.findUnique({
      where: { lectureId: id }
    });

    if (!transcript) {
      return res.status(404).json({
        success: false,
        error: { message: 'Transcript not found for this lecture.' }
      });
    }

    // Auto-backfill segments if missing
    if (
      (!transcript.segments || !Array.isArray(transcript.segments) || transcript.segments.length === 0) &&
      transcript.content &&
      transcript.content.trim()
    ) {
      const generated = parseTranscriptIntoSegments(transcript.content);
      transcript.segments = generated;
      prisma.transcript.update({
        where: { id: transcript.id },
        data: { segments: generated }
      }).catch((err) => logger.warn('Background segments backfill in getTranscript error:', err));
    }

    return res.status(200).json({
      success: true,
      transcript
    });
  } catch (error) {
    logger.error('Error fetching transcript:', error);
    return res.status(500).json({
      success: false,
      error: { message: 'Failed to retrieve transcript.' }
    });
  }
};

/**
 * PUT /api/lectures/:id/transcript
 * Update/edit the transcript content or segments
 * Only the lecture owner can edit the transcript.
 */
export const updateTranscript = async (req, res) => {
  const { id } = req.params;

  try {
    const lecture = await prisma.lecture.findUnique({
      where: { id }
    });

    if (!lecture) {
      return res.status(404).json({
        success: false,
        error: { message: 'Lecture not found.' }
      });
    }

    // User ownership check
    if (lecture.userId !== req.user.id) {
      return res.status(403).json({
        success: false,
        error: { message: 'Access denied. You do not have permission to edit this transcript.' }
      });
    }

    const { content, segments } = req.body;

    if (!content || typeof content !== 'string' || !content.trim()) {
      return res.status(400).json({
        success: false,
        error: { message: 'Transcript content is required and cannot be empty.' }
      });
    }

    const finalSegments = Array.isArray(segments) && segments.length > 0
      ? segments
      : parseTranscriptIntoSegments(content.trim());

    const updatedTranscript = await prisma.transcript.upsert({
      where: { lectureId: id },
      create: {
        lectureId: id,
        content: content.trim(),
        segments: finalSegments
      },
      update: {
        content: content.trim(),
        segments: finalSegments
      }
    });

    // Rebuild embeddings after an edit. The chat path also compares sourceHash,
    // so it will repair the index on demand if this background job fails.
    indexLectureTranscript(id, updatedTranscript).catch(err =>
      logger.warn(`[RAG] Re-index after transcript edit failed for lecture ${id}: ${err.message}`)
    );

    logger.info(`Transcript for lecture ${id} updated by user ${req.user.id}`);

    return res.status(200).json({
      success: true,
      message: 'Transcript updated successfully.',
      transcript: updatedTranscript
    });
  } catch (error) {
    logger.error('Error updating transcript:', error);
    return res.status(500).json({
      success: false,
      error: { message: 'Failed to update transcript.' }
    });
  }
};

/**
 * DELETE /api/lectures/:id
 * Delete a specific lecture with strict user ownership enforcement
 */
export const deleteLecture = async (req, res) => {
  try {
    const { id } = req.params;

    const lecture = await prisma.lecture.findUnique({
      where: { id }
    });

    if (!lecture) {
      return res.status(404).json({
        success: false,
        error: { message: 'Lecture not found.' }
      });
    }

    // STRICT USER OWNERSHIP CHECK
    if (lecture.userId !== req.user.id) {
      logger.warn(`User ${req.user.id} attempted unauthorized deletion of lecture ${id} owned by ${lecture.userId}`);
      return res.status(403).json({
        success: false,
        error: { message: 'Access denied. You do not have permission to delete this lecture.' }
      });
    }

    await prisma.lecture.delete({
      where: { id }
    });
    if (lecture.storagePath) {
      const storageDir = path.resolve(process.env.AUDIO_STORAGE_DIR || path.join(process.cwd(), 'storage', 'audio'));
      fs.unlink(path.join(storageDir, path.basename(lecture.storagePath))).catch(() => {});
    }

    return res.status(200).json({
      success: true,
      message: 'Lecture deleted successfully.'
    });
  } catch (error) {
    logger.error('Error deleting lecture:', error);
    return res.status(500).json({
      success: false,
      error: { message: 'Failed to delete lecture.' }
    });
  }
};

/**
 * POST /api/lectures/:id/analyze
 * Transforms existing lecture transcript into structured academic summary and key concepts.
 * Grounded exclusively in the transcript text using Gemini.
 */
export const analyzeLectureController = async (req, res) => {
  const { id } = req.params;

  try {
    const lecture = await prisma.lecture.findUnique({
      where: { id },
      include: { transcript: true }
    });

    if (!lecture) {
      return res.status(404).json({
        success: false,
        error: { message: 'Lecture not found.' }
      });
    }

    // STRICT USER OWNERSHIP CHECK
    if (lecture.userId !== req.user.id) {
      logger.warn(`User ${req.user.id} unauthorized attempt to analyze lecture ${id}`);
      return res.status(403).json({
        success: false,
        error: { message: 'Access denied. You do not have permission to analyze this lecture.' }
      });
    }

    // Require non-empty transcript
    if (!lecture.transcript || !lecture.transcript.content || !lecture.transcript.content.trim()) {
      return res.status(400).json({
        success: false,
        error: {
          message: 'Lecture must be transcribed before analysis can be performed.',
          code: 'TRANSCRIPT_REQUIRED'
        }
      });
    }

    // Reuse cached analysis when force is not requested (Performance & AI Caching)
    const isForce = req.query.force === 'true' || req.body?.force === true;
    if (!isForce) {
      const existingSummary = await prisma.summary.findUnique({ where: { lectureId: id } });
      const existingConcepts = await prisma.concept.findMany({
        where: { lectureId: id },
        orderBy: { importance: 'desc' }
      });

      if (existingSummary && existingConcepts.length > 0) {
        logger.info(`Lecture ${id}: Reusing existing cached analysis (force=false)`);
        const formattedConcepts = existingConcepts.map((c) => ({
          id: c.id,
          name: c.name,
          description: c.description,
          importanceScore: c.importance,
          importance: c.importance >= 3 ? 'high' : c.importance <= 1 ? 'low' : 'medium',
          createdAt: c.createdAt
        }));

        return res.status(200).json({
          success: true,
          message: 'Retrieved existing lecture analysis.',
          cached: true,
          status: 'ANALYZED',
          lecture,
          summary: existingSummary,
          concepts: formattedConcepts
        });
      }
    }

    // Auto-detect & persist physical audio duration if missing or defaulted to fallback (e.g. 10s)
    if ((!lecture.duration || lecture.duration <= 10) && lecture.storagePath) {
      try {
        const storageDir = path.resolve(process.env.AUDIO_STORAGE_DIR || path.join(process.cwd(), 'storage', 'audio'));
        const audioPath = path.resolve(storageDir, path.basename(lecture.storagePath));
        const meta = await mm.parseFile(audioPath);
        if (meta.format?.duration) {
          const detected = Math.round(meta.format.duration);
          lecture.duration = detected;
          await prisma.lecture.update({ where: { id }, data: { duration: detected } });
          logger.info(`Backfilled physical audio duration for lecture ${id}: ${detected}s`);
        }
      } catch (err) {
        logger.warn(`Could not backfill audio duration for lecture ${id}:`, err.message);
      }
    }

    // Time-based Credit Enforcement (1 Credit per 10 minutes, min 1 credit)
    const requiredCredits = calculateLectureCredits(lecture.duration, lecture.transcript?.content);
    const durationMinutes = lecture.duration
      ? Math.max(1, Math.round(lecture.duration / 60))
      : Math.round(requiredCredits * 10);

    const currentUser = await prisma.user.findUnique({
      where: { id: req.user.id },
      select: { id: true, credits: true }
    });

    const userCredits = currentUser?.credits ?? 0;
    if (userCredits < requiredCredits) {
      logger.warn(`User ${req.user.id} has insufficient credits (${userCredits}) for analysis of lecture ${id} (requires ${requiredCredits} credits for ${durationMinutes} mins)`);
      return res.status(402).json({
        success: false,
        error: {
          message: `Insufficient credits. Analyzing this ${durationMinutes}-minute lecture requires ${requiredCredits} credits (1 credit per 10 minutes), but your current balance is ${userCredits} credits.`,
          code: 'INSUFFICIENT_CREDITS',
          requiredCredits,
          currentCredits: userCredits,
          durationMinutes
        }
      });
    }

    // Update status to ANALYZING
    await prisma.lecture.update({
      where: { id },
      data: { status: 'ANALYZING' }
    });

    logger.info(`Starting Gemini lecture analysis for lecture ${id} (${lecture.title})...`);

    let analysisResult;
    try {
      analysisResult = await analyzeLecture(lecture.transcript.content);
    } catch (aiError) {
      // Revert status to TRANSCRIBED or FAILED
      await prisma.lecture.update({
        where: { id },
        data: { status: 'TRANSCRIBED' }
      });
      throw aiError;
    }

    // Save Summary, Concepts, and Deduct Credits atomically in a Prisma interactive transaction
    const { savedSummary, savedConcepts, updatedLecture, remainingCredits } = await prisma.$transaction(async (tx) => {
      // 1. Upsert Summary
      const summary = await tx.summary.upsert({
        where: { lectureId: id },
        create: {
          lectureId: id,
          content: analysisResult.summary
        },
        update: {
          content: analysisResult.summary
        }
      });

      // 2. Remove previous concepts to avoid duplication on re-analysis
      await tx.concept.deleteMany({
        where: { lectureId: id }
      });

      // 3. Create newly extracted concepts
      await tx.concept.createMany({
        data: analysisResult.concepts.map((c) => ({
          lectureId: id,
          name: c.name,
          description: c.description,
          importance: c.importanceScore || 2
        }))
      });

      // 4. Update lecture status to ANALYZED
      const updatedLec = await tx.lecture.update({
        where: { id },
        data: { status: 'ANALYZED' }
      });

      // 5. Deduct time-based credits from user
      const updatedUser = await tx.user.update({
        where: { id: req.user.id },
        data: {
          credits: {
            decrement: requiredCredits
          }
        },
        select: {
          credits: true
        }
      });

      // 6. Record credit transaction ledger entry
      await tx.creditTransaction.create({
        data: {
          userId: req.user.id,
          amount: -requiredCredits,
          balanceAfter: updatedUser.credits,
          type: 'LECTURE_ANALYSIS',
          lectureId: id,
          description: `Lecture analysis deduction (${durationMinutes} min): "${lecture.title}" (-${requiredCredits} credits)`
        }
      });

      // 7. Fetch the newly created concepts
      const concepts = await tx.concept.findMany({
        where: { lectureId: id },
        orderBy: { importance: 'desc' }
      });

      return {
        savedSummary: summary,
        savedConcepts: concepts,
        updatedLecture: updatedLec,
        remainingCredits: updatedUser.credits
      };
    });

    const formattedConcepts = savedConcepts.map((c) => ({
      id: c.id,
      name: c.name,
      description: c.description,
      importanceScore: c.importance,
      importance: c.importance >= 3 ? 'high' : c.importance <= 1 ? 'low' : 'medium',
      createdAt: c.createdAt
    }));

    logger.info(`Lecture ${id} analyzed successfully. ${formattedConcepts.length} concepts and summary saved. User remaining credits: ${remainingCredits}`);

    return res.status(200).json({
      success: true,
      message: 'Lecture analysis completed successfully.',
      status: 'ANALYZED',
      lecture: updatedLecture,
      summary: savedSummary,
      concepts: formattedConcepts,
      credits: remainingCredits,
      cost: requiredCredits,
      durationMinutes
    });
  } catch (error) {
    logger.error(`Failed analyzing lecture ${id}:`, error);
    const status = error.status || 500;
    return res.status(status).json({
      success: false,
      error: {
        message: error.message || 'Failed to analyze lecture transcript.',
        code: error.code || 'ANALYSIS_FAILED'
      }
    });
  }
};

/**
 * GET /api/lectures/:id/summary
 * Retrieve the saved summary for a lecture
 * Only the lecture owner can view the summary.
 */
export const getLectureSummaryController = async (req, res) => {
  const { id } = req.params;

  try {
    const lecture = await prisma.lecture.findUnique({
      where: { id }
    });

    if (!lecture) {
      return res.status(404).json({
        success: false,
        error: { message: 'Lecture not found.' }
      });
    }

    const hasAccess = await canAccessLecture(lecture, req.user.id);
    if (!hasAccess) {
      return res.status(403).json({
        success: false,
        error: { message: 'Access denied. You do not have permission to view this summary.' }
      });
    }

    const summary = await prisma.summary.findUnique({
      where: { lectureId: id }
    });

    if (!summary) {
      return res.status(404).json({
        success: false,
        error: { message: 'Summary not found. Please run lecture analysis first.' }
      });
    }

    return res.status(200).json({
      success: true,
      summary
    });
  } catch (error) {
    logger.error('Error fetching lecture summary:', error);
    return res.status(500).json({
      success: false,
      error: { message: 'Failed to retrieve lecture summary.' }
    });
  }
};

/**
 * GET /api/lectures/:id/concepts
 * Retrieve all extracted concepts for a lecture ordered by importance
 * Only the lecture owner can view concepts.
 */
export const getLectureConceptsController = async (req, res) => {
  const { id } = req.params;

  try {
    const lecture = await prisma.lecture.findUnique({
      where: { id }
    });

    if (!lecture) {
      return res.status(404).json({
        success: false,
        error: { message: 'Lecture not found.' }
      });
    }

    const hasAccess = await canAccessLecture(lecture, req.user.id);
    if (!hasAccess) {
      return res.status(403).json({
        success: false,
        error: { message: 'Access denied. You do not have permission to view concepts for this lecture.' }
      });
    }

    const concepts = await prisma.concept.findMany({
      where: { lectureId: id },
      orderBy: { importance: 'desc' }
    });

    const formattedConcepts = concepts.map((c) => ({
      id: c.id,
      name: c.name,
      description: c.description,
      importanceScore: c.importance,
      importance: c.importance >= 3 ? 'high' : c.importance <= 1 ? 'low' : 'medium',
      createdAt: c.createdAt
    }));

    return res.status(200).json({
      success: true,
      count: formattedConcepts.length,
      concepts: formattedConcepts
    });
  } catch (error) {
    logger.error('Error fetching lecture concepts:', error);
    return res.status(500).json({
      success: false,
      error: { message: 'Failed to retrieve lecture concepts.' }
    });
  }
};

/**
 * POST /api/lectures/:id/relationships
 * Identifies and persists directional academic relationships between lecture concepts using Gemini.
 * Performs safe regeneration via transactional replacement.
 */
export const extractRelationshipsController = async (req, res) => {
  const { id } = req.params;

  try {
    const lecture = await prisma.lecture.findUnique({
      where: { id },
      include: {
        transcript: true,
        concepts: true
      }
    });

    if (!lecture) {
      return res.status(404).json({
        success: false,
        error: { message: 'Lecture not found.' }
      });
    }

    // STRICT USER OWNERSHIP ENFORCEMENT
    if (lecture.userId !== req.user.id) {
      logger.warn(`User ${req.user.id} unauthorized attempt to extract relationships for lecture ${id}`);
      return res.status(403).json({
        success: false,
        error: { message: 'Access denied. You do not have permission to manage relationships for this lecture.' }
      });
    }

    // Precondition 1: Transcript must exist
    if (!lecture.transcript || !lecture.transcript.content || !lecture.transcript.content.trim()) {
      return res.status(400).json({
        success: false,
        error: {
          message: 'Lecture must be transcribed before relationship extraction can be performed.',
          code: 'TRANSCRIPT_REQUIRED'
        }
      });
    }

    // Precondition 2: At least 2 concepts must exist
    if (!lecture.concepts || lecture.concepts.length < 2) {
      return res.status(400).json({
        success: false,
        error: {
          message: 'Lecture must have at least 2 extracted concepts before relationships can be identified. Please analyze the lecture first.',
          code: 'CONCEPTS_REQUIRED'
        }
      });
    }

    // Reuse cached relationships when force is not requested (Performance & AI Caching)
    const isForce = req.query.force === 'true' || req.body?.force === true;
    if (!isForce) {
      const existingRelationships = await prisma.relationship.findMany({
        where: { lectureId: id },
        include: {
          sourceConcept: {
            select: { id: true, name: true, description: true, importance: true }
          },
          targetConcept: {
            select: { id: true, name: true, description: true, importance: true }
          }
        },
        orderBy: { createdAt: 'asc' }
      });

      if (existingRelationships.length > 0) {
        logger.info(`Lecture ${id}: Reusing existing extracted relationships (force=false)`);
        return res.status(200).json({
          success: true,
          message: 'Retrieved existing conceptual relationships.',
          cached: true,
          count: existingRelationships.length,
          relationships: existingRelationships
        });
      }
    }

    logger.info(`Extracting relationships for lecture ${id} with ${lecture.concepts.length} concepts...`);

    // Call Gemini relationship extraction service
    const extractedRels = await extractRelationships(
      lecture.concepts,
      lecture.transcript.content
    );

    // Atomic regeneration via Prisma transaction:
    // 1. Delete existing relationships for this lecture (prevents duplicates upon regeneration)
    // 2. Insert newly extracted relationships
    const [, createdResult] = await prisma.$transaction([
      prisma.relationship.deleteMany({
        where: { lectureId: id }
      }),
      prisma.relationship.createMany({
        data: extractedRels.map((rel) => ({
          lectureId: id,
          sourceConceptId: rel.sourceConceptId,
          targetConceptId: rel.targetConceptId,
          relationshipType: rel.relationshipType,
          description: rel.description
        }))
      })
    ]);

    // Retrieve full relationship records with source and target concept details
    const savedRelationships = await prisma.relationship.findMany({
      where: { lectureId: id },
      include: {
        sourceConcept: {
          select: { id: true, name: true, description: true, importance: true }
        },
        targetConcept: {
          select: { id: true, name: true, description: true, importance: true }
        }
      },
      orderBy: { createdAt: 'asc' }
    });

    logger.info(`Lecture ${id}: ${savedRelationships.length} relationships saved/regenerated successfully.`);

    return res.status(200).json({
      success: true,
      message: 'Relationships extracted successfully.',
      count: savedRelationships.length,
      relationships: savedRelationships
    });
  } catch (error) {
    logger.error(`Failed extracting relationships for lecture ${id}:`, error);
    const status = error.status || 500;
    return res.status(status).json({
      success: false,
      error: {
        message: error.message || 'Failed to extract conceptual relationships.',
        code: error.code || 'RELATIONSHIP_EXTRACTION_FAILED'
      }
    });
  }
};

/**
 * GET /api/lectures/:id/relationships
 * Retrieve all conceptual relationships for a lecture with source & target details.
 * Only the lecture owner can view relationships.
 */
export const getLectureRelationshipsController = async (req, res) => {
  const { id } = req.params;

  try {
    const lecture = await prisma.lecture.findUnique({
      where: { id }
    });

    if (!lecture) {
      return res.status(404).json({
        success: false,
        error: { message: 'Lecture not found.' }
      });
    }

    // USER ACCESS CHECK (Owner or enrolled subject member)
    const hasAccess = await canAccessLecture(lecture, req.user.id);
    if (!hasAccess) {
      return res.status(403).json({
        success: false,
        error: { message: 'Access denied. You do not have permission to view relationships for this lecture.' }
      });
    }

    const relationships = await prisma.relationship.findMany({
      where: { lectureId: id },
      include: {
        sourceConcept: {
          select: { id: true, name: true, description: true, importance: true }
        },
        targetConcept: {
          select: { id: true, name: true, description: true, importance: true }
        }
      },
      orderBy: { createdAt: 'asc' }
    });

    return res.status(200).json({
      success: true,
      count: relationships.length,
      relationships
    });
  } catch (error) {
    logger.error('Error fetching lecture relationships:', error);
    return res.status(500).json({
      success: false,
      error: { message: 'Failed to retrieve lecture relationships.' }
    });
  }
};

/**
 * POST /api/lectures/:id/learning-map
 * Synthesize concept nodes and directional relationships into a visual learning map graph.
 * Upserts into Prisma LearningMap model. Strictly verified by lecture ownership.
 */
export const generateLearningMapController = async (req, res) => {
  const { id } = req.params;

  try {
    const lecture = await prisma.lecture.findUnique({
      where: { id }
    });

    if (!lecture) {
      return res.status(404).json({
        success: false,
        error: { message: 'Lecture not found.' }
      });
    }

    // STRICT USER OWNERSHIP CHECK
    if (lecture.userId !== req.user.id) {
      logger.warn(`User ${req.user.id} attempted unauthorized learning map generation for lecture ${id}`);
      return res.status(403).json({
        success: false,
        error: { message: 'Access denied. You do not have permission to generate a learning map for this lecture.' }
      });
    }

    // Fetch existing concepts
    const concepts = await prisma.concept.findMany({
      where: { lectureId: id },
      orderBy: { importance: 'desc' }
    });

    if (concepts.length < 2) {
      return res.status(400).json({
        success: false,
        error: {
          message: 'At least 2 concepts are required before a learning map can be generated. Please run lecture analysis first.',
          code: 'INSUFFICIENT_CONCEPTS'
        }
      });
    }

    // Fetch existing relationships
    const relationships = await prisma.relationship.findMany({
      where: { lectureId: id },
      include: {
        sourceConcept: {
          select: { id: true, name: true, description: true, importance: true }
        },
        targetConcept: {
          select: { id: true, name: true, description: true, importance: true }
        }
      },
      orderBy: { createdAt: 'asc' }
    });

    // Reuse cached learning map when force is not requested (Performance & AI Caching)
    const isForce = req.query.force === 'true' || req.body?.force === true;
    if (!isForce) {
      const existingMap = await prisma.learningMap.findUnique({ where: { lectureId: id } });
      if (existingMap) {
        logger.info(`Lecture ${id}: Reusing existing learning map (force=false)`);
        return res.status(200).json({
          success: true,
          message: 'Retrieved existing learning map.',
          cached: true,
          learningMap: existingMap
        });
      }
    }

    // Synthesize structured map data
    const mapData = await generateLearningMap(concepts, relationships);

    // Upsert into Neon PostgreSQL via Prisma
    const learningMap = await prisma.learningMap.upsert({
      where: { lectureId: id },
      update: {
        mapData
      },
      create: {
        lectureId: id,
        mapData
      }
    });

    logger.info(`Lecture ${id}: Learning map generated and persisted with ${mapData.nodes.length} nodes and ${mapData.edges.length} edges.`);

    return res.status(200).json({
      success: true,
      message: 'Learning map generated successfully.',
      learningMap
    });
  } catch (error) {
    logger.error(`Error generating learning map for lecture ${id}:`, error);
    return res.status(500).json({
      success: false,
      error: {
        message: error.message || 'Failed to generate learning map.',
        code: 'LEARNING_MAP_GENERATION_FAILED'
      }
    });
  }
};

/**
 * GET /api/lectures/:id/learning-map
 * Retrieve the saved learning map for a lecture.
 * Strictly verified by lecture ownership.
 */
export const getLearningMapController = async (req, res) => {
  const { id } = req.params;

  try {
    const lecture = await prisma.lecture.findUnique({
      where: { id }
    });

    if (!lecture) {
      return res.status(404).json({
        success: false,
        error: { message: 'Lecture not found.' }
      });
    }

    // USER ACCESS CHECK (Owner or enrolled subject member)
    const hasAccess = await canAccessLecture(lecture, req.user.id);
    if (!hasAccess) {
      return res.status(403).json({
        success: false,
        error: { message: 'Access denied. You do not have permission to view this learning map.' }
      });
    }

    const learningMap = await prisma.learningMap.findUnique({
      where: { lectureId: id }
    });

    if (!learningMap) {
      return res.status(404).json({
        success: false,
        error: {
          message: 'Learning map not yet generated for this lecture.',
          code: 'LEARNING_MAP_NOT_FOUND'
        }
      });
    }

    return res.status(200).json({
      success: true,
      learningMap
    });
  } catch (error) {
    logger.error('Error fetching learning map:', error);
    return res.status(500).json({
      success: false,
      error: { message: 'Failed to retrieve learning map.' }
    });
  }
};

/**
 * PUT /api/lectures/:id/learning-map
 * Update the learning map layout (e.g. customized node positions from visual rearrangement).
 * Does NOT modify the underlying analysis or concepts.
 */
export const updateLearningMapController = async (req, res) => {
  const { id } = req.params;
  const { mapData } = req.body;

  try {
    const lecture = await prisma.lecture.findUnique({
      where: { id }
    });

    if (!lecture) {
      return res.status(404).json({
        success: false,
        error: { message: 'Lecture not found.' }
      });
    }

    // STRICT USER OWNERSHIP CHECK
    if (lecture.userId !== req.user.id) {
      return res.status(403).json({
        success: false,
        error: { message: 'Access denied. You do not have permission to modify this learning map.' }
      });
    }

    if (!mapData || !Array.isArray(mapData.nodes)) {
      return res.status(400).json({
        success: false,
        error: {
          message: 'Invalid map data provided. "nodes" array is required.',
          code: 'INVALID_MAP_DATA'
        }
      });
    }

    // Validate graph integrity & prune dangling edges
    const mapCheck = validateLearningMapIntegrity(mapData);
    if (!mapCheck.valid) {
      return res.status(400).json({
        success: false,
        error: {
          message: `Invalid learning map graph structure: ${mapCheck.errors.join('; ')}`,
          code: 'INVALID_MAP_DATA'
        }
      });
    }

    const updated = await prisma.learningMap.upsert({
      where: { lectureId: id },
      update: { mapData: mapCheck.sanitizedMapData },
      create: {
        lectureId: id,
        mapData: mapCheck.sanitizedMapData
      }
    });

    logger.info(`Lecture ${id}: Learning map layout updated by user ${req.user.id}`);

    return res.status(200).json({
      success: true,
      message: 'Learning map layout updated successfully.',
      learningMap: updated
    });
  } catch (error) {
    logger.error('Error updating learning map layout:', error);
    return res.status(500).json({
      success: false,
      error: { message: 'Failed to update learning map layout.' }
    });
  }
};

/**
 * GET /api/lectures/:id/bookmarks
 * Retrieve all bookmarks for an owned lecture
 */
export const getBookmarks = async (req, res) => {
  const { id } = req.params;

  try {
    const lecture = await prisma.lecture.findUnique({
      where: { id }
    });

    if (!lecture) {
      return res.status(404).json({
        success: false,
        error: { message: 'Lecture not found.' }
      });
    }

    if (lecture.userId !== req.user.id) {
      return res.status(403).json({
        success: false,
        error: { message: 'Access denied. You do not have permission to view bookmarks for this lecture.' }
      });
    }

    const bookmarks = await prisma.bookmark.findMany({
      where: { lectureId: id },
      orderBy: [
        { timestamp: 'asc' },
        { createdAt: 'desc' }
      ]
    });

    return res.status(200).json({
      success: true,
      bookmarks
    });
  } catch (error) {
    logger.error(`Error fetching bookmarks for lecture ${id}:`, error);
    return res.status(500).json({
      success: false,
      error: { message: 'Failed to retrieve bookmarks.' }
    });
  }
};

/**
 * POST /api/lectures/:id/bookmarks
 * Create a new bookmark for an owned lecture
 */
export const createBookmark = async (req, res) => {
  const { id } = req.params;
  const { title, note, timestamp, transcriptPosition } = req.body;

  try {
    const lecture = await prisma.lecture.findUnique({
      where: { id }
    });

    if (!lecture) {
      return res.status(404).json({
        success: false,
        error: { message: 'Lecture not found.' }
      });
    }

    if (lecture.userId !== req.user.id) {
      return res.status(403).json({
        success: false,
        error: { message: 'Access denied. You do not have permission to add bookmarks to this lecture.' }
      });
    }

    if (!title || typeof title !== 'string' || !title.trim()) {
      return res.status(400).json({
        success: false,
        error: { message: 'Bookmark title is required.' }
      });
    }

    const bookmark = await prisma.bookmark.create({
      data: {
        lectureId: id,
        title: title.trim(),
        note: note ? note.trim() : null,
        timestamp: typeof timestamp === 'number' ? timestamp : (timestamp !== undefined && timestamp !== null && timestamp !== '' ? parseFloat(timestamp) : null),
        transcriptPosition: typeof transcriptPosition === 'number' ? transcriptPosition : (transcriptPosition !== undefined && transcriptPosition !== null && transcriptPosition !== '' ? parseInt(transcriptPosition, 10) : null)
      }
    });

    logger.info(`Bookmark created for lecture ${id}: "${bookmark.title}" (ID: ${bookmark.id})`);

    return res.status(201).json({
      success: true,
      message: 'Bookmark created successfully.',
      bookmark
    });
  } catch (error) {
    logger.error(`Error creating bookmark for lecture ${id}:`, error);
    return res.status(500).json({
      success: false,
      error: { message: 'Failed to create bookmark.' }
    });
  }
};

/**
 * DELETE /api/lectures/:id/bookmarks/:bookmarkId
 * Delete a specific bookmark with ownership verification
 */
export const deleteBookmark = async (req, res) => {
  const { id, bookmarkId } = req.params;

  try {
    const lecture = await prisma.lecture.findUnique({
      where: { id }
    });

    if (!lecture) {
      return res.status(404).json({
        success: false,
        error: { message: 'Lecture not found.' }
      });
    }

    if (lecture.userId !== req.user.id) {
      return res.status(403).json({
        success: false,
        error: { message: 'Access denied. You do not have permission to delete this bookmark.' }
      });
    }

    const bookmark = await prisma.bookmark.findUnique({
      where: { id: bookmarkId }
    });

    if (!bookmark || bookmark.lectureId !== id) {
      return res.status(404).json({
        success: false,
        error: { message: 'Bookmark not found.' }
      });
    }

    await prisma.bookmark.delete({
      where: { id: bookmarkId }
    });

    logger.info(`Bookmark ${bookmarkId} deleted from lecture ${id}`);

    return res.status(200).json({
      success: true,
      message: 'Bookmark deleted successfully.'
    });
  } catch (error) {
    logger.error(`Error deleting bookmark ${bookmarkId}:`, error);
    return res.status(500).json({
      success: false,
      error: { message: 'Failed to delete bookmark.' }
    });
  }
};

/**
 * GET /api/lectures/:id/export
 * Professional export of lecture materials in multiple formats:
 * - markdown: complete academic study guide
 * - summary: summary and key concepts only
 * - text: plain-text transcript with speaker dialogue
 * - json: structured academic dataset without internal database IDs
 */
export const exportLectureController = async (req, res) => {
  const { id } = req.params;
  const { format = 'markdown', download = 'false' } = req.query;

  try {
    const lecture = await prisma.lecture.findUnique({
      where: { id },
      include: {
        transcript: true,
        summary: true,
        concepts: true,
        relationships: {
          include: {
            sourceConcept: true,
            targetConcept: true
          }
        },
        learningMap: true,
        bookmarks: {
          orderBy: { timestamp: 'asc' }
        }
      }
    });

    if (!lecture) {
      return res.status(404).json({
        success: false,
        error: { message: 'Lecture not found.' }
      });
    }

    // USER ACCESS CHECK (Owner or enrolled subject member)
    const hasAccess = await canAccessLecture(lecture, req.user.id);
    if (!hasAccess) {
      return res.status(403).json({
        success: false,
        error: { message: 'Access denied. You do not have permission to export this lecture.' }
      });
    }

    const safeTitle = (lecture.title || 'Lecture')
      .replace(/[^a-zA-Z0-9_-]/g, '_')
      .replace(/_+/g, '_');
    const formattedDate = new Date(lecture.createdAt).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });
    const durationMinutes = lecture.duration ? `${Math.round(lecture.duration / 60)} minutes` : 'Not specified';

    // Format 1: Plain Text Transcript
    if (format === 'text' || format === 'txt') {
      const segments = Array.isArray(lecture.transcript?.segments)
        ? lecture.transcript.segments
        : [];

      let textOutput = `LECTURE TRANSCRIPT: ${lecture.title}\n`;
      textOutput += `Date: ${formattedDate}\n`;
      textOutput += `Duration: ${durationMinutes}\n`;
      textOutput += `======================================================\n\n`;

      if (segments.length > 0) {
        segments.forEach((seg, idx) => {
          const mins = Math.floor((seg.start || 0) / 60).toString().padStart(2, '0');
          const secs = Math.floor((seg.start || 0) % 60).toString().padStart(2, '0');
          textOutput += `[${mins}:${secs}] ${seg.speaker || 'Speaker'}:\n${seg.text}\n\n`;
        });
      } else {
        textOutput += lecture.transcript?.content || '(No transcript content available)';
      }

      if (download === 'true') {
        res.setHeader('Content-Type', 'text/plain; charset=utf-8');
        res.setHeader('Content-Disposition', `attachment; filename="${safeTitle}_Transcript.txt"`);
        return res.send(textOutput);
      }

      return res.status(200).json({
        success: true,
        format: 'text',
        filename: `${safeTitle}_Transcript.txt`,
        content: textOutput
      });
    }

    // Format 2: Summary & Concepts Markdown Only
    if (format === 'summary') {
      let mdSummary = `# ${lecture.title} — Executive Academic Summary\n\n`;
      mdSummary += `**Date:** ${formattedDate}  \n`;
      mdSummary += `**Duration:** ${durationMinutes}  \n\n`;
      mdSummary += `---\n\n`;
      mdSummary += `## Executive Summary\n\n`;
      mdSummary += `${lecture.summary?.content || 'No summary available.'}\n\n`;
      mdSummary += `## Key Concepts\n\n`;

      if (lecture.concepts && lecture.concepts.length > 0) {
        lecture.concepts.forEach((c) => {
          mdSummary += `### ${c.name} (${c.importance || 'Standard'})\n`;
          mdSummary += `${c.description || ''}\n\n`;
        });
      }

      if (download === 'true') {
        res.setHeader('Content-Type', 'text/markdown; charset=utf-8');
        res.setHeader('Content-Disposition', `attachment; filename="${safeTitle}_Summary.md"`);
        return res.send(mdSummary);
      }

      return res.status(200).json({
        success: true,
        format: 'markdown',
        filename: `${safeTitle}_Summary.md`,
        content: mdSummary
      });
    }

    // Format 3: Sanitized Structured JSON
    if (format === 'json') {
      const sanitized = {
        title: lecture.title,
        date: formattedDate,
        durationSeconds: lecture.duration,
        originalFileName: lecture.originalFileName,
        summary: lecture.summary?.content || null,
        concepts: (lecture.concepts || []).map((c) => ({
          name: c.name,
          description: c.description,
          importance: c.importance
        })),
        relationships: (lecture.relationships || []).map((r) => ({
          sourceConcept: r.sourceConcept?.name || null,
          targetConcept: r.targetConcept?.name || null,
          relationshipType: r.relationshipType,
          description: r.description
        })),
        learningMap: lecture.learningMap?.mapData
          ? {
              nodes: (lecture.learningMap.mapData.nodes || []).map((n) => ({
                name: n.name,
                category: n.category,
                importance: n.importance,
                x: n.x,
                y: n.y
              })),
              edges: (lecture.learningMap.mapData.edges || []).map((e) => ({
                source: e.source,
                target: e.target,
                relationshipType: e.relationshipType,
                description: e.description
              }))
            }
          : null,
        transcriptSegments: Array.isArray(lecture.transcript?.segments)
          ? lecture.transcript.segments.map((s) => ({
              start: s.start,
              end: s.end,
              speaker: s.speaker,
              text: s.text
            }))
          : [],
        bookmarks: (lecture.bookmarks || []).map((b) => ({
          title: b.title,
          timestamp: b.timestamp,
          note: b.note
        }))
      };

      if (download === 'true') {
        res.setHeader('Content-Type', 'application/json; charset=utf-8');
        res.setHeader('Content-Disposition', `attachment; filename="${safeTitle}_Dataset.json"`);
        return res.send(JSON.stringify(sanitized, null, 2));
      }

      return res.status(200).json({
        success: true,
        format: 'json',
        filename: `${safeTitle}_Dataset.json`,
        data: sanitized
      });
    }

    // Format 4: Default Complete Professional Academic Markdown Study Guide
    let fullMarkdown = `# ${lecture.title}\n\n`;
    fullMarkdown += `**Session Date:** ${formattedDate}  \n`;
    fullMarkdown += `**Estimated Duration:** ${durationMinutes}  \n`;
    if (lecture.originalFileName) {
      fullMarkdown += `**Source Audio File:** ${lecture.originalFileName}  \n`;
    }
    fullMarkdown += `\n---\n\n`;

    // 1. Executive Summary
    fullMarkdown += `## 1. Executive Academic Summary\n\n`;
    fullMarkdown += `${lecture.summary?.content || 'Summary not yet generated for this lecture session.'}\n\n`;

    // 2. Key Concepts
    fullMarkdown += `## 2. Core Lecture Concepts\n\n`;
    if (lecture.concepts && lecture.concepts.length > 0) {
      lecture.concepts.forEach((concept, idx) => {
        fullMarkdown += `### 2.${idx + 1}. ${concept.name}\n`;
        fullMarkdown += `- **Importance Ranking:** ${concept.importance || 'Standard'}\n`;
        if (concept.description) {
          fullMarkdown += `- **Explanation:** ${concept.description}\n`;
        }
        fullMarkdown += `\n`;
      });
    } else {
      fullMarkdown += `No key concepts extracted yet.\n\n`;
    }

    // 3. Conceptual Relationships
    fullMarkdown += `## 3. Conceptual Relationships & Knowledge Flow\n\n`;
    if (lecture.relationships && lecture.relationships.length > 0) {
      lecture.relationships.forEach((rel, idx) => {
        const src = rel.sourceConcept?.name || 'Concept';
        const tgt = rel.targetConcept?.name || 'Concept';
        const typeFormatted = (rel.relationshipType || 'relates to').replace(/_/g, ' ');
        fullMarkdown += `- **${src}** *[${typeFormatted}]* -> **${tgt}**\n`;
        if (rel.description) {
          fullMarkdown += `  - *Context:* ${rel.description}\n`;
        }
      });
      fullMarkdown += `\n`;
    } else {
      fullMarkdown += `No conceptual relationships recorded yet.\n\n`;
    }

    // 4. Learning Map Architecture
    if (lecture.learningMap?.mapData?.nodes?.length) {
      fullMarkdown += `## 4. Interactive Learning Map Hierarchy\n\n`;
      fullMarkdown += `This lecture has a synthesized 2D Directed Acyclic Graph containing **${lecture.learningMap.mapData.nodes.length} nodes** and **${lecture.learningMap.mapData.edges?.length || 0} directional relationships**.\n\n`;
    }

    // 5. Bookmarks & Important Student Notes
    if (lecture.bookmarks && lecture.bookmarks.length > 0) {
      fullMarkdown += `## 5. Important Bookmarks & Student Notes\n\n`;
      lecture.bookmarks.forEach((bm) => {
        const timeSec = bm.timestamp || 0;
        const mins = Math.floor(timeSec / 60).toString().padStart(2, '0');
        const secs = Math.floor(timeSec % 60).toString().padStart(2, '0');
        fullMarkdown += `### [${mins}:${secs}] ${bm.title}\n`;
        if (bm.note) {
          fullMarkdown += `> ${bm.note}\n\n`;
        }
      });
    }

    // 6. Complete Verified Dialogue Transcript
    fullMarkdown += `## 6. Complete Dialogue Transcript\n\n`;
    const segs = Array.isArray(lecture.transcript?.segments) ? lecture.transcript.segments : [];
    if (segs.length > 0) {
      segs.forEach((s) => {
        const mins = Math.floor((s.start || 0) / 60).toString().padStart(2, '0');
        const secs = Math.floor((s.start || 0) % 60).toString().padStart(2, '0');
        fullMarkdown += `**[${mins}:${secs}] ${s.speaker || 'Speaker'}:** ${s.text}\n\n`;
      });
    } else if (lecture.transcript?.content) {
      fullMarkdown += `${lecture.transcript.content}\n\n`;
    } else {
      fullMarkdown += `Transcript not available.\n\n`;
    }

    fullMarkdown += `---\n\n`;
    fullMarkdown += `*Generated automatically by LectureMind — AI-Based Smart Learning Map Generator*\n`;

    if (download === 'true') {
      res.setHeader('Content-Type', 'text/markdown; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="${safeTitle}_StudyGuide.md"`);
      return res.send(fullMarkdown);
    }

    return res.status(200).json({
      success: true,
      format: 'markdown',
      filename: `${safeTitle}_StudyGuide.md`,
      content: fullMarkdown
    });
  } catch (error) {
    logger.error('Error exporting lecture:', error);
    return res.status(500).json({
      success: false,
      error: { message: 'Failed to export lecture.' }
    });
  }
};

/**
 * POST /api/lectures/:id/chat
 * RAG Conversational AI Tutor: Ask questions grounded strictly in the lecture content
 */
export const chatWithLectureController = async (req, res) => {
  const { id } = req.params;
  const body = req.body && typeof req.body === 'object' ? req.body : {};
  const rawQuestion = body.message ?? body.question;

  if (typeof rawQuestion !== 'string' || !rawQuestion.trim()) {
    return res.status(400).json({
      success: false,
      error: { message: 'Question or message cannot be empty.' }
    });
  }
  if (rawQuestion.length > 2000) {
    return res.status(413).json({
      success: false,
      error: { message: 'Questions must be 2,000 characters or fewer.' }
    });
  }
  const queryText = rawQuestion.trim();

  try {
    const lecture = await prisma.lecture.findUnique({
      where: { id },
      include: {
        transcript: true
      }
    });

    if (!lecture) {
      return res.status(404).json({
        success: false,
        error: { message: 'Lecture not found.' }
      });
    }

    const hasAccess = await canAccessLecture(lecture, req.user.id);
    if (!hasAccess) {
      return res.status(403).json({
        success: false,
        error: { message: 'Access denied. You do not have permission to access this lecture.' }
      });
    }

    const ragResult = await chatWithLecture({
      lecture,
      question: queryText,
      history: Array.isArray(body.history) ? body.history.slice(-4) : [],
      userPreferences: req.user ? {
        role: req.user.role,
        academicLevel: req.user.academicLevel,
        fieldOfStudy: req.user.fieldOfStudy,
        aiTonePreference: req.user.aiTonePreference
      } : null
    });

    return res.status(200).json({
      success: true,
      answer: ragResult.answer,
      citations: ragResult.citations,
      suggestedQuestions: ragResult.suggestedQuestions,
      retrievedChunks: ragResult.retrievedChunks
    });
  } catch (error) {
    logger.error(`Error in chatWithLectureController for lecture ${id}:`, error);
    return res.status(error.status || 500).json({
      success: false,
      error: {
        message: error.message || 'Failed to generate answer from lecture material.',
        ...(error.code ? { code: error.code } : {})
      }
    });
  }
};

/**
 * POST /api/lectures/:id/index
 * Manually trigger (or re-trigger) RAG indexing for a lecture's transcript.
 * Useful for indexing existing lectures that were created before the RAG pipeline.
 */
export const reIndexLecture = async (req, res) => {
  const { id } = req.params;
  try {
    const lecture = await prisma.lecture.findUnique({
      where: { id },
      include: { transcript: true }
    });

    if (!lecture) {
      return res.status(404).json({ success: false, error: { message: 'Lecture not found.' } });
    }

    const hasAccess = await canAccessLecture(lecture, req.user.id);
    if (!hasAccess) {
      return res.status(403).json({ success: false, error: { message: 'Access denied.' } });
    }

    if (!lecture.transcript?.content) {
      return res.status(400).json({ success: false, error: { message: 'No transcript to index. Please transcribe this lecture first.' } });
    }

    const count = await indexLectureTranscript(id, lecture.transcript);
    logger.info(`[RAG] Manual re-index for lecture ${id}: ${count} chunks indexed.`);
    return res.status(200).json({
      success: true,
      message: `Lecture re-indexed successfully with ${count} chunks.`,
      chunks: count
    });
  } catch (err) {
    logger.error(`[RAG] Re-index error for lecture ${id}:`, err);
    return res.status(500).json({ success: false, error: { message: err.message } });
  }
};

