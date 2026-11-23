import fs from 'fs';
import os from 'os';
import path from 'path';
import { GoogleAIFileManager } from '@google/generative-ai/server';
import { generateWithRetry } from './client.js';
import { parseAndValidateJson, handleGeminiError } from './geminiErrors.js';
import { config } from '../../config/env.js';
import { logger } from '../../utils/logger.js';
import * as mm from 'music-metadata';

/**
 * Converts a MM:SS or HH:MM:SS timestamp string to total seconds.
 */
function timestampToSeconds(timeStr) {
  if (!timeStr) return 0;
  const parts = timeStr.trim().split(':').map(Number);
  if (parts.length === 3) {
    return parts[0] * 3600 + parts[1] * 60 + parts[2];
  }
  if (parts.length === 2) {
    return parts[0] * 60 + parts[1];
  }
  return Number(timeStr) || 0;
}

/**
 * Robustly parses dialogue segments from unstructured or partially formatted model responses
 * (such as regex recovering truncated JSON, [MM:SS] lines, or raw paragraph blocks).
 */
export function extractSegmentsFromRawOutput(rawOutput, fallbackDuration = 600) {
  if (!rawOutput || typeof rawOutput !== 'string') return [];

  const text = rawOutput.trim();

  // 1. Try regex extraction of JSON segments { "id":..., "start":..., "end":..., "speaker":..., "text":... }
  const segmentRegex = /\{\s*(?:"id"\s*:\s*(\d+)\s*,)?\s*"start"\s*:\s*([\d.]+)\s*,\s*"end"\s*:\s*([\d.]+)\s*,\s*"speaker"\s*:\s*"([^"]+)"\s*,\s*"text"\s*:\s*"((?:\\.|[^"\\])*)"\s*\}/g;
  const extracted = [];
  let match;
  while ((match = segmentRegex.exec(text)) !== null) {
    const start = parseFloat(match[2]);
    const end = parseFloat(match[3]);
    const speaker = match[4].trim();
    const segText = match[5].replace(/\\"/g, '"').replace(/\\n/g, ' ').trim();
    if (segText) {
      extracted.push({
        id: extracted.length + 1,
        start: Number.isFinite(start) ? start : extracted.length * 10,
        end: Number.isFinite(end) ? end : (extracted.length + 1) * 10,
        speaker: speaker || 'Speaker 1',
        text: segText
      });
    }
  }

  if (extracted.length > 0) {
    return extracted;
  }

  // 2. Try parsing [MM:SS - MM:SS] Speaker: text or [MM:SS] Speaker: text lines
  const lines = text.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
  const linePatternWithRange = /^\[(\d{1,2}:\d{2}(?::\d{2})?)\s*[-–—]\s*(\d{1,2}:\d{2}(?::\d{2})?)\]\s*(?:([^:]+):)?\s*(.+)$/;
  const linePatternSingle = /^\[(\d{1,2}:\d{2}(?::\d{2})?)\]\s*(?:([^:]+):)?\s*(.+)$/;

  const parsedLines = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const matchRange = line.match(linePatternWithRange);
    if (matchRange) {
      const start = timestampToSeconds(matchRange[1]);
      const end = timestampToSeconds(matchRange[2]);
      const speaker = matchRange[3]?.trim() || 'Speaker 1';
      const cleanText = matchRange[4]?.trim();
      if (cleanText) {
        parsedLines.push({
          id: parsedLines.length + 1,
          start,
          end: end > start ? end : start + 10,
          speaker,
          text: cleanText
        });
      }
      continue;
    }

    const matchSingle = line.match(linePatternSingle);
    if (matchSingle) {
      const start = timestampToSeconds(matchSingle[1]);
      const speaker = matchSingle[2]?.trim() || 'Speaker 1';
      const cleanText = matchSingle[3]?.trim();
      if (cleanText) {
        parsedLines.push({
          id: parsedLines.length + 1,
          start,
          end: start + 15, // default step, will adjust next start
          speaker,
          text: cleanText
        });
      }
    }
  }

  if (parsedLines.length > 0) {
    // Smooth out end timestamps
    for (let i = 0; i < parsedLines.length - 1; i++) {
      if (parsedLines[i].end > parsedLines[i + 1].start) {
        parsedLines[i].end = parsedLines[i + 1].start;
      }
    }
    return parsedLines;
  }

  // 3. Fallback: Clean raw text from markdown / truncated JSON syntax and segment naturally
  let cleaned = text
    .replace(/^```json\s*/i, '')
    .replace(/^```\s*/i, '')
    .replace(/```$/g, '')
    .replace(/^\s*\{\s*"content"\s*:\s*"/, '')
    .replace(/"\s*,\s*"segments"\s*:\s*\[.*$/s, '')
    .replace(/"\s*\}\s*$/, '')
    .replace(/\\"/g, '"')
    .replace(/\\n/g, '\n')
    .trim();

  const paragraphs = cleaned.split(/\r?\n\s*\r?\n|\r?\n/).map(p => p.trim()).filter(Boolean);
  if (paragraphs.length === 0) return [];

  const totalWords = paragraphs.reduce((sum, p) => sum + p.split(/\s+/).filter(Boolean).length, 0);
  const durationToUse = fallbackDuration > 0 ? fallbackDuration : Math.max(60, Math.round((totalWords / 130) * 60));

  let currentStart = 0;
  const segments = [];

  for (let i = 0; i < paragraphs.length; i++) {
    const para = paragraphs[i];
    const words = para.split(/\s+/).filter(Boolean).length;
    const ratio = totalWords > 0 ? words / totalWords : 1 / paragraphs.length;
    const segDuration = Math.max(4, Math.round(ratio * durationToUse));
    const end = Math.min(durationToUse, currentStart + segDuration);

    let speaker = 'Lecturer';
    let cleanPara = para;
    const speakerMatch = para.match(/^([A-Za-z0-9\s._-]{2,30}):\s+(.+)$/s);
    if (speakerMatch) {
      speaker = speakerMatch[1].trim();
      cleanPara = speakerMatch[2].trim();
    }

    segments.push({
      id: i + 1,
      start: currentStart,
      end: end > currentStart ? end : currentStart + segDuration,
      speaker,
      text: cleanPara
    });

    currentStart = end;
  }

  return segments;
}

/**
 * Transcribes classroom lecture audio into structured transcript with speaker diarization and timestamps.
 * Uses GoogleAIFileManager with automatic multi-model fallback and resilient token budgeting.
 *
 * @param {object} params
 * @param {Buffer|string} params.audioData - Raw Buffer or Base64 string of the audio
 * @param {string} [params.mimeType="audio/mp3"] - Audio MIME type
 * @param {string} [params.lectureTitle=""] - Optional lecture title context
 * @param {number} [params.durationSeconds] - Optional known physical audio duration in seconds
 * @returns {Promise<{ content: string, language: string, speakers: string[], duration: number, segments: Array<{ id: number, start: number, end: number, speaker: string, text: string }> }>}
 */
export const transcribeAudio = async ({
  audioData,
  mimeType = 'audio/mp3',
  lectureTitle = '',
  durationSeconds = null
}) => {
  if (!audioData) {
    throw new Error('transcribeAudio: Audio data buffer or base64 string is required.');
  }

  let tempFilePath = null;
  let uploadedFileResource = null;
  let fileManager = null;

  try {
    const isBuffer = Buffer.isBuffer(audioData);
    const audioBuffer = isBuffer ? audioData : Buffer.from(audioData, 'base64');
    const audioLength = audioBuffer.length;

    // Detect exact physical duration from audio buffer if not passed
    let detectedDuration = durationSeconds;
    if (!detectedDuration || detectedDuration <= 0) {
      try {
        const metadata = await mm.parseBuffer(audioBuffer, mimeType);
        if (metadata.format?.duration) {
          detectedDuration = Math.round(metadata.format.duration);
          logger.info(`Detected physical audio duration: ${detectedDuration}s (${(detectedDuration / 60).toFixed(1)} mins)`);
        }
      } catch (err) {
        logger.warn('Could not extract duration from audio metadata:', err.message);
      }
    }

    // High-precision prompt designed to prevent token overflow by focusing on structured segments
    const prompt = `You are LectureMind's High-Fidelity Audio Transcription & Diarization Specialist.
Transcribe this classroom lecture recording${lectureTitle ? ` titled "${lectureTitle}"` : ''} with academic precision from start to finish.

CRITICAL INSTRUCTIONS:
1. SOURCE OF TRUTH: Transcribe exactly what is spoken by the lecturer and any speakers. Do NOT invent commentary or external facts.
2. SPEAKER DIARIZATION: Identify and label distinct speakers (e.g. "Lecturer", "Professor", "Student", or specific names introduced like "Dr. Deborah Tannen", "Richard Davidson").
3. TIMESTAMPS: Provide accurate start and end timestamps (in seconds) for each spoken dialogue segment.
4. COMPLETE COVERAGE: Transcribe the full lecture continuously from beginning (0:00) to the very end without skipping or looping.
5. FORMAT: Output MUST strictly be valid JSON matching this schema:

{
  "language": "en",
  "speakers": ["Speaker 1"],
  "segments": [
    {
      "id": 1,
      "start": 0.0,
      "end": 15.0,
      "speaker": "Speaker 1",
      "text": "Verbatim sentence spoken in this interval"
    }
  ]
}

DO NOT include a separate redundant "content" string in the JSON output. Output only language, speakers, and segments.`;

    logger.info(`Transcribing audio (${(audioLength / 1024).toFixed(1)} KB, detected duration: ${detectedDuration || 'unknown'}s)...`);

    let audioPart;
    if (audioLength > 1024 * 1024 && config.geminiApiKey) {
      fileManager = new GoogleAIFileManager(config.geminiApiKey.trim());
      const ext = mimeType.includes('wav') ? '.wav' : mimeType.includes('m4a') ? '.m4a' : '.mp3';
      tempFilePath = path.join(os.tmpdir(), `lecturemind_audio_${Date.now()}${ext}`);
      fs.writeFileSync(tempFilePath, audioBuffer);

      logger.info(`Uploading audio to Gemini File API: ${path.basename(tempFilePath)}...`);
      const uploadResult = await fileManager.uploadFile(tempFilePath, {
        mimeType,
        displayName: lectureTitle || 'Lecture Audio'
      });

      uploadedFileResource = uploadResult.file;

      // Poll until file is fully ACTIVE
      let fileState = uploadResult.file.state;
      let waitAttempts = 0;
      while (fileState === 'PROCESSING' && waitAttempts < 30) {
        await new Promise((r) => setTimeout(r, 2000));
        const check = await fileManager.getFile(uploadResult.file.name);
        fileState = check.state;
        waitAttempts++;
      }

      audioPart = {
        fileData: {
          fileUri: uploadResult.file.uri,
          mimeType: uploadResult.file.mimeType || mimeType
        }
      };
    } else {
      audioPart = {
        inlineData: {
          mimeType,
          data: audioBuffer.toString('base64')
        }
      };
    }

    // Try reliable multimodal models with automatic fallback
    const audioModelsToTry = [
      'gemini-3.5-flash',
      'gemini-flash-latest',
      'gemini-3.5-flash-lite',
      'gemini-flash-lite-latest',
      config.geminiAudioModel || 'gemini-3.5-transcribe'
    ];

    let response;
    let lastErr = null;

    for (const modelCandidate of audioModelsToTry) {
      try {
        logger.info(`Attempting transcription with model: ${modelCandidate}...`);
        response = await generateWithRetry(
          {
            modelName: modelCandidate,
            systemInstruction: undefined,
            jsonMode: true,
            temperature: 0.1
          },
          [prompt, audioPart],
          1
        );

        if (response?.response?.text()) {
          break;
        }
      } catch (candidateErr) {
        lastErr = candidateErr;
        logger.warn(`Model ${modelCandidate} failed (${candidateErr.message}). Trying next candidate...`);
      }
    }

    if (!response && lastErr) {
      throw lastErr;
    }

    const rawOutput = response?.response?.text() || '';

    // Handle empty audio (e.g. pure silence)
    if (!rawOutput.trim()) {
      logger.info('Model returned no speech tokens, recording non-speech audio descriptor.');
      return {
        content: 'Audio recorded with no intelligible spoken dialogue detected.',
        language: 'en',
        speakers: ['Speaker 1'],
        duration: detectedDuration || 10,
        segments: [
          {
            id: 1,
            start: 0.0,
            end: detectedDuration || 10.0,
            speaker: 'Speaker 1',
            text: '[Audio recorded with no audible speech dialogue]'
          }
        ]
      };
    }

    let parsed = null;
    try {
      parsed = parseAndValidateJson(rawOutput);
    } catch (parseErr) {
      logger.warn('Direct JSON parse failed on raw transcription output, running structured recovery...');
      const recoveredSegments = extractSegmentsFromRawOutput(rawOutput, detectedDuration || 600);
      parsed = {
        language: 'en',
        speakers: Array.from(new Set(recoveredSegments.map(s => s.speaker))),
        segments: recoveredSegments
      };
    }

    const rawSegments = Array.isArray(parsed?.segments) && parsed.segments.length > 0
      ? parsed.segments
      : extractSegmentsFromRawOutput(rawOutput, detectedDuration || 600);

    const formattedSegments = rawSegments.map((seg, idx) => {
      const hasModelTimestamps = Number.isFinite(seg.start) && Number.isFinite(seg.end);
      return {
        id: typeof seg.id === 'number' ? seg.id : idx + 1,
        start: hasModelTimestamps ? Math.max(0, parseFloat(Number(seg.start).toFixed(2))) : idx * 15,
        end: hasModelTimestamps ? Math.max(0, parseFloat(Number(seg.end).toFixed(2))) : (idx + 1) * 15,
        ...(!hasModelTimestamps && { timestampEstimated: true }),
        speaker: seg.speaker ? String(seg.speaker).trim() : 'Speaker 1',
        text: String(seg.text || '').trim()
      };
    });

    // Form final continuous transcript from segments to guarantee complete alignment
    const finalContent = formattedSegments.length > 0
      ? formattedSegments.map((s) => s.text).join(' ')
      : rawOutput.trim();

    const lastSeg = formattedSegments.at(-1);
    const computedDuration = detectedDuration || (Number.isFinite(lastSeg?.end) ? Math.round(lastSeg.end) : null);

    logger.info(`Transcription complete: ${finalContent.length} chars, ${formattedSegments.length} segments, duration: ${computedDuration}s.`);

    return {
      content: finalContent || 'Audio processed with no audible speech detected.',
      language: parsed?.language || 'en',
      speakers: Array.isArray(parsed?.speakers) && parsed.speakers.length > 0
        ? parsed.speakers
        : Array.from(new Set(formattedSegments.map(s => s.speaker))),
      duration: computedDuration,
      segments: formattedSegments
    };
  } catch (error) {
    logger.error('Error in transcribeAudio service:', error);
    throw handleGeminiError(error);
  } finally {
    // Clean up temporary local file
    if (tempFilePath && fs.existsSync(tempFilePath)) {
      try {
        fs.unlinkSync(tempFilePath);
      } catch (_) {}
    }
    // Clean up Gemini File API file
    if (fileManager && uploadedFileResource?.name) {
      fileManager.deleteFile(uploadedFileResource.name).catch((delErr) => {
        logger.warn(`Failed to delete Gemini temporary file ${uploadedFileResource.name}:`, delErr.message);
      });
    }
  }
};
