import { PrismaClient } from '@prisma/client';
import { config } from './env.js';
import { logger } from '../utils/logger.js';

// Centralized global singleton instance for PrismaClient
// Prevents multiple instances during hot-reloading and avoids exhausting connection pools on Neon
const globalForPrisma = globalThis;

export const prisma =
  globalForPrisma.prisma ||
  new PrismaClient({
    log: config.nodeEnv === 'development' ? ['warn', 'error'] : ['error']
  });

if (config.nodeEnv !== 'production') {
  globalForPrisma.prisma = prisma;
}

/**
 * Checks the database connection and measures response latency
 * @returns {Promise<{ connected: boolean, latencyMs?: number, error?: string }>}
 */
export const checkDatabaseHealth = async () => {
  const startTime = Date.now();
  try {
    // Run a lightweight query to confirm Neon PostgreSQL connection
    await prisma.$queryRaw`SELECT 1 as health_check`;
    const latencyMs = Date.now() - startTime;
    return { connected: true, latencyMs };
  } catch (error) {
    logger.error('Database connection health check failed:', error.message);
    return { connected: false, error: error.message };
  }
};

export default prisma;
