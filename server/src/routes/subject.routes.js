import express from 'express';
import { requireAuth,optionalAuth } from '../middleware/auth.js';
import {
  createSubject,
  getSubjects,
  getSubjectById,
  getSubjectByInviteCode,
  joinSubject,
  deleteSubject
} from '../controllers/subject.controller.js';

const router = express.Router();

// Preview invite link is public (optionalAuth attaches user if logged in)
router.get('/invite/:inviteCode', optionalAuth, getSubjectByInviteCode);

// Require authentication for all protected subject operations
router.use(requireAuth);

// Subject CRUD & Listing
router.post('/', createSubject);
router.get('/', getSubjects);

// Joining (requires authenticated student)
router.post('/join', joinSubject);

// Single Subject operations
router.get('/:id', getSubjectById);
router.delete('/:id', deleteSubject);

export default router;
