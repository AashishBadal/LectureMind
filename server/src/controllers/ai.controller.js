import {
  testGeminiConnection,
  generateSummary,
  extractConcepts,
  extractRelationships,
  generateLearningMap
} from '../services/gemini/index.js';
import { config } from '../config/env.js';
import { logger } from '../utils/logger.js';

/**
 * GET /api/ai/status
 * Confirms Gemini API configuration and live connectivity without leaking credentials
 */
export const getAiStatus = async (req, res) => {
  const result = await testGeminiConnection();

  if (!result.connected) {
    return res.status(503).json({
      success: false,
      ai: {
        provider: 'google-gemini',
        model: result.model,
        connected: false,
        error: result.error
      }
    });
  }

  return res.status(200).json({
    success: true,
    ai: {
      provider: 'google-gemini',
      model: result.model,
      connected: true,
      latencyMs: result.latencyMs
    }
  });
};

/**
 * POST /api/ai/test-analyze
 * Runs end-to-end grounded analysis on a sample transcript
 */
export const testAnalyzeTranscript = async (req, res) => {
  try {
    const { transcript } = req.body;

    if (!transcript || typeof transcript !== 'string' || !transcript.trim()) {
      return res.status(400).json({
        success: false,
        error: { message: 'Please provide a non-empty lecture transcript string.' }
      });
    }

    // Step 1: Grounded concept extraction
    const concepts = await extractConcepts(transcript, { maxConcepts: 8 });

    // Step 2: Grounded relationship extraction
    const relationships = await extractRelationships(concepts, transcript);

    // Step 3: Learning map graph synthesis
    const learningMap = await generateLearningMap(concepts, relationships);

    // Step 4: Grounded summary generation
    const summary = await generateSummary(transcript);

    return res.status(200).json({
      success: true,
      data: {
        summary,
        concepts,
        relationships,
        learningMap
      }
    });
  } catch (error) {
    logger.error('Error in AI test-analyze:', error);
    const status = error.status || 500;
    return res.status(status).json({
      success: false,
      error: {
        message: error.message,
        code: error.code || 'AI_ANALYSIS_FAILED'
      }
    });
  }
};
