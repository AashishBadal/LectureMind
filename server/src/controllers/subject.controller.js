import crypto from 'crypto';
import { prisma } from '../config/prisma.js';
import { logger } from '../utils/logger.js';

/**
 * Generate a clean, human-friendly 8-character invite code (e.g. LM-8A3K9B)
 */
export function generateInviteCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = 'LM-';
  for (let i = 0; i < 6; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
}

/**
 * POST /api/subjects
 * Create a new subject as teacher
 */
export const createSubject = async (req, res) => {
  try {
    const { name, code, description, color } = req.body;

    if (!name || typeof name !== 'string' || !name.trim()) {
      return res.status(400).json({
        success: false,
        error: { message: 'Subject name is required.' }
      });
    }

    const cleanName = name.trim();
    const cleanCode = (code || '').trim().toUpperCase() || null;
    const cleanDesc = (description || '').trim() || null;
    const themeColor = color || 'indigo';

    // Generate unique invite code
    let inviteCode = generateInviteCode();
    let isUnique = false;
    let attempts = 0;
    while (!isUnique && attempts < 5) {
      const existing = await prisma.subject.findUnique({ where: { inviteCode } });
      if (!existing) {
        isUnique = true;
      } else {
        inviteCode = generateInviteCode();
        attempts++;
      }
    }

    // Create subject and enroll creator as TEACHER in a single transaction
    const subject = await prisma.$transaction(async (tx) => {
      const newSub = await tx.subject.create({
        data: {
          name: cleanName,
          code: cleanCode,
          description: cleanDesc,
          color: themeColor,
          teacherId: req.user.id,
          inviteCode
        }
      });

      await tx.subjectMember.create({
        data: {
          subjectId: newSub.id,
          userId: req.user.id,
          role: 'TEACHER'
        }
      });

      return newSub;
    });

    logger.info(`Subject created: ${subject.id} ("${subject.name}") by teacher ${req.user.id}`);

    return res.status(201).json({
      success: true,
      message: 'Subject created successfully.',
      subject
    });
  } catch (error) {
    logger.error('Error creating subject:', error);
    return res.status(500).json({
      success: false,
      error: { message: 'Failed to create subject.' }
    });
  }
};

/**
 * GET /api/subjects
 * List all subjects the authenticated user teaches or is enrolled in
 */
export const getSubjects = async (req, res) => {
  try {
    const subjects = await prisma.subject.findMany({
      where: {
        OR: [
          { teacherId: req.user.id },
          { members: { some: { userId: req.user.id } } }
        ]
      },
      orderBy: { updatedAt: 'desc' },
      include: {
        teacher: {
          select: { id: true, name: true, email: true }
        },
        members: {
          where: { userId: req.user.id },
          select: { role: true, joinedAt: true }
        },
        _count: {
          select: {
            members: true,
            lectures: true
          }
        }
      }
    });

    const formatted = subjects.map((sub) => {
      const isTeacher = sub.teacherId === req.user.id;
      const userMember = sub.members[0];
      const role = isTeacher ? 'TEACHER' : userMember?.role || 'STUDENT';

      return {
        id: sub.id,
        name: sub.name,
        code: sub.code,
        description: sub.description,
        color: sub.color || 'indigo',
        inviteCode: sub.inviteCode,
        createdAt: sub.createdAt,
        updatedAt: sub.updatedAt,
        teacherId: sub.teacherId,
        teacher: sub.teacher,
        isTeacher,
        role,
        userRole: role,
        memberCount: sub._count.members,
        lectureCount: sub._count.lectures,
        _count: {
          members: sub._count.members,
          lectures: sub._count.lectures
        }
      };
    });

    return res.status(200).json({
      success: true,
      subjects: formatted,
      total: formatted.length
    });
  } catch (error) {
    logger.error('Error listing subjects:', error);
    return res.status(500).json({
      success: false,
      error: { message: 'Failed to retrieve subjects.' }
    });
  }
};

/**
 * GET /api/subjects/:id
 * Retrieve subject details, members, and lectures grouped date by date
 */
export const getSubjectById = async (req, res) => {
  try {
    const { id } = req.params;

    const subject = await prisma.subject.findUnique({
      where: { id },
      include: {
        teacher: {
          select: { id: true, name: true, email: true }
        },
        members: {
          include: {
            user: {
              select: { id: true, name: true, email: true }
            }
          },
          orderBy: { joinedAt: 'asc' }
        },
        lectures: {
          orderBy: [
            { lectureDate: 'desc' },
            { createdAt: 'desc' }
          ],
          include: {
            transcript: { select: { id: true } },
            summary: { select: { id: true } },
            learningMap: { select: { id: true } },
            _count: {
              select: {
                concepts: true,
                relationships: true,
                bookmarks: true
              }
            }
          }
        }
      }
    });

    if (!subject) {
      return res.status(404).json({
        success: false,
        error: { message: 'Subject not found.' }
      });
    }

    const isTeacher = subject.teacherId === req.user.id;
    const isEnrolled = subject.members.some((m) => m.userId === req.user.id);

    if (!isTeacher && !isEnrolled) {
      return res.status(403).json({
        success: false,
        error: { message: 'Access denied. You are not enrolled in this subject.' }
      });
    }

    const userMembership = subject.members.find((m) => m.userId === req.user.id);
    const role = isTeacher ? 'TEACHER' : userMembership?.role || 'STUDENT';

    // Format lectures with status indicators
    const formattedLectures = subject.lectures.map((lec) => ({
      ...lec,
      hasTranscript: Boolean(lec.transcript),
      hasSummary: Boolean(lec.summary),
      hasLearningMap: Boolean(lec.learningMap),
      conceptCount: lec._count?.concepts || 0,
      relationshipCount: lec._count?.relationships || 0,
      bookmarkCount: lec._count?.bookmarks || 0
    }));

    // Group lectures date by date (ISO date string YYYY-MM-DD as key)
    const dateGroupsMap = new Map();
    for (const lec of formattedLectures) {
      const rawDate = lec.lectureDate || lec.createdAt;
      const dateKey = new Date(rawDate).toISOString().split('T')[0];

      if (!dateGroupsMap.has(dateKey)) {
        const displayDate = new Date(rawDate).toLocaleDateString('en-US', {
          weekday: 'long',
          year: 'numeric',
          month: 'short',
          day: 'numeric'
        });

        dateGroupsMap.set(dateKey, {
          date: dateKey,
          displayDate,
          formattedDate: displayDate,
          lectures: []
        });
      }
      dateGroupsMap.get(dateKey).lectures.push(lec);
    }

    const dateGroups = Array.from(dateGroupsMap.values());

    return res.status(200).json({
      success: true,
      subject: {
        id: subject.id,
        name: subject.name,
        code: subject.code,
        description: subject.description,
        color: subject.color || 'indigo',
        inviteCode: subject.inviteCode,
        createdAt: subject.createdAt,
        updatedAt: subject.updatedAt,
        teacherId: subject.teacherId,
        teacher: subject.teacher,
        isTeacher,
        role,
        userRole: role,
        members: subject.members.map((m) => ({
          id: m.id,
          userId: m.user?.id || m.userId,
          name: m.user?.name || null,
          email: m.user?.email || null,
          user: {
            id: m.user?.id || m.userId,
            name: m.user?.name || null,
            email: m.user?.email || null
          },
          role: m.role,
          joinedAt: m.joinedAt
        })),
        lectures: formattedLectures,
        dateGroups,
        memberCount: subject.members.length,
        lectureCount: formattedLectures.length,
        _count: {
          members: subject.members.length,
          lectures: formattedLectures.length
        },
        totalLectures: formattedLectures.length,
        totalStudents: subject.members.filter((m) => m.role === 'STUDENT').length
      },
      dateGroups
    });
  } catch (error) {
    logger.error('Error fetching subject details:', error);
    return res.status(500).json({
      success: false,
      error: { message: 'Failed to retrieve subject details.' }
    });
  }
};

/**
 * GET /api/subjects/invite/:inviteCode
 * Preview subject information from an invite link before joining
 */
export const getSubjectByInviteCode = async (req, res) => {
  try {
    const { inviteCode } = req.params;

    if (!inviteCode || typeof inviteCode !== 'string') {
      return res.status(400).json({
        success: false,
        error: { message: 'Invite code is required.' }
      });
    }

    const cleanCode = inviteCode.trim().toUpperCase();

    const subject = await prisma.subject.findUnique({
      where: { inviteCode: cleanCode },
      include: {
        teacher: {
          select: { id: true, name: true }
        },
        _count: {
          select: { members: true, lectures: true }
        }
      }
    });

    if (!subject) {
      return res.status(404).json({
        success: false,
        error: { message: 'Invalid invite code. No subject found with this invite link.' }
      });
    }

    const isAlreadyMember = req.user?.id
      ? await prisma.subjectMember.findUnique({
          where: {
            subjectId_userId: {
              subjectId: subject.id,
              userId: req.user.id
            }
          }
        })
      : null;

    return res.status(200).json({
      success: true,
      subject: {
        id: subject.id,
        name: subject.name,
        code: subject.code,
        description: subject.description,
        color: subject.color || 'indigo',
        inviteCode: subject.inviteCode,
        teacherName: subject.teacher?.name || 'Faculty Instructor',
        memberCount: subject._count.members,
        lectureCount: subject._count.lectures,
        isAlreadyMember: Boolean(isAlreadyMember)
      }
    });
  } catch (error) {
    logger.error('Error previewing invite code:', error);
    return res.status(500).json({
      success: false,
      error: { message: 'Failed to verify invite code.' }
    });
  }
};

/**
 * POST /api/subjects/join
 * Join a subject using invite code
 */
export const joinSubject = async (req, res) => {
  try {
    const { inviteCode } = req.body;

    if (!inviteCode || typeof inviteCode !== 'string' || !inviteCode.trim()) {
      return res.status(400).json({
        success: false,
        error: { message: 'Please provide a valid invite code.' }
      });
    }

    const cleanCode = inviteCode.trim().toUpperCase();

    const subject = await prisma.subject.findUnique({
      where: { inviteCode: cleanCode },
      include: {
        teacher: { select: { id: true, name: true } }
      }
    });

    if (!subject) {
      return res.status(404).json({
        success: false,
        error: { message: 'Invalid invite code. Please check the code and try again.' }
      });
    }

    // Check if user is the teacher or already enrolled
    if (subject.teacherId === req.user.id) {
      return res.status(200).json({
        success: true,
        message: 'You are the instructor of this subject.',
        subjectId: subject.id
      });
    }

    const existingMember = await prisma.subjectMember.findUnique({
      where: {
        subjectId_userId: {
          subjectId: subject.id,
          userId: req.user.id
        }
      }
    });

    if (existingMember) {
      return res.status(200).json({
        success: true,
        message: `You are already enrolled in ${subject.name}.`,
        subjectId: subject.id
      });
    }

    // Enroll student
    await prisma.subjectMember.create({
      data: {
        subjectId: subject.id,
        userId: req.user.id,
        role: 'STUDENT'
      }
    });

    logger.info(`User ${req.user.id} enrolled into subject ${subject.id} ("${subject.name}") via code ${cleanCode}`);

    return res.status(200).json({
      success: true,
      message: `Successfully joined ${subject.name}!`,
      subjectId: subject.id
    });
  } catch (error) {
    logger.error('Error joining subject:', error);
    return res.status(500).json({
      success: false,
      error: { message: 'Failed to join subject.' }
    });
  }
};

/**
 * DELETE /api/subjects/:id
 * Delete a subject (Instructor/Teacher only)
 */
export const deleteSubject = async (req, res) => {
  try {
    const { id } = req.params;

    const subject = await prisma.subject.findUnique({
      where: { id }
    });

    if (!subject) {
      return res.status(404).json({
        success: false,
        error: { message: 'Subject not found.' }
      });
    }

    if (subject.teacherId !== req.user.id) {
      return res.status(403).json({
        success: false,
        error: { message: 'Forbidden. Only the course instructor can delete this subject.' }
      });
    }

    await prisma.subject.delete({
      where: { id }
    });

    logger.info(`Subject ${id} deleted by teacher ${req.user.id}`);

    return res.status(200).json({
      success: true,
      message: 'Subject and class roster deleted successfully.'
    });
  } catch (error) {
    logger.error('Error deleting subject:', error);
    return res.status(500).json({
      success: false,
      error: { message: 'Failed to delete subject.' }
    });
  }
};
