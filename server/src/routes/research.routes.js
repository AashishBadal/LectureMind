import { Router } from 'express';
import { askLibraryQuestion } from '../controllers/research.controller.js';
import { requireAuth } from '../middleware/auth.js';

const router = Router();
router.use(requireAuth);
router.post('/ask', askLibraryQuestion);

export default router;
