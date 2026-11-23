import { checkDatabaseHealth } from '../config/prisma.js';
import { testGeminiConnection } from '../services/gemini/client.js';

/**
 * Health check controller
 * Confirms service operational status, uptime, system time, Neon database, and Gemini AI connection
 */
export const getHealth = async (req, res) => {
  // Check Neon PostgreSQL
  const dbHealth = await checkDatabaseHealth();

  // Check Gemini AI API
  const aiHealth = await testGeminiConnection();

  res.status(200).json({
    status: 'ok',
    service: 'lecturemind-api',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    database: {
      provider: 'neon-postgresql',
      connected: dbHealth.connected,
      ...(dbHealth.connected ? { latencyMs: dbHealth.latencyMs } : { error: dbHealth.error })
    },
    ai: {
      provider: 'google-gemini',
      model: aiHealth.model,
      connected: aiHealth.connected,
      ...(aiHealth.connected ? { latencyMs: aiHealth.latencyMs } : { error: aiHealth.error })
    }
  });
};
