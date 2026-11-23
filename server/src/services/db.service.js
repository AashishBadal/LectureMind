import prisma, { checkDatabaseHealth } from '../config/prisma.js';
import { logger } from '../utils/logger.js';

/**
 * Centralized Database Service
 * Provides access to Prisma Client instance and connection lifecycle methods
 */
export const dbService = {
  client: prisma,

  /**
   * Connect explicitly to database
   */
  async connect() {
    try {
      await prisma.$connect();
      logger.info('Successfully connected to Neon PostgreSQL.');
      return true;
    } catch (error) {
      logger.error('Failed to connect to Neon PostgreSQL:', error);
      throw error;
    }
  },

  /**
   * Disconnect database connection
   */
  async disconnect() {
    try {
      await prisma.$disconnect();
      logger.info('Disconnected from database.');
    } catch (error) {
      logger.error('Error disconnecting from database:', error);
    }
  },

  /**
   * Check connection status and latency
   */
  async ping() {
    return await checkDatabaseHealth();
  }
};

export { prisma };
export default dbService;
