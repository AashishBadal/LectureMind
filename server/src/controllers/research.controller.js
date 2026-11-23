import { researchAcrossLectures } from '../services/rag/research.service.js';
import { logger } from '../utils/logger.js';

export async function askLibraryQuestion(req, res) {
  const body = req.body && typeof req.body === 'object' ? req.body : {};
  const question = body.question ?? body.message;
  const history = Array.isArray(body.history) ? body.history : [];
  try {
    const result = await researchAcrossLectures(req.user.id, question, body.subjectId || null, history);
    return res.status(200).json({ success: true, ...result });
  } catch (error) {
    logger.error(`Research Lab failed for user ${req.user.id}:`, error);
    return res.status(error.status || 500).json({
      success: false,
      error: { message: error.message || 'Research could not be completed.', ...(error.code ? { code: error.code } : {}) }
    });
  }
}
