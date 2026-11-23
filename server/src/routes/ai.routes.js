import { Router } from 'express';
import { getAiStatus, testAnalyzeTranscript } from '../controllers/ai.controller.js';
import { requireAuth } from '../middleware/auth.js';

const router = Router();

// Endpoint to check AI connectivity (public for health status / diagnostics)
router.get('/status', getAiStatus);

// Protected testing and analysis endpoint
router.post('/test-analyze', requireAuth, testAnalyzeTranscript);

export default router;
