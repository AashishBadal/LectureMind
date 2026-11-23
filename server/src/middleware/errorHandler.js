import { logger } from '../utils/logger.js';

export const errorHandler = (err, req, res, next) => {
  logger.error(`Unhandled error at ${req.method} ${req.originalUrl}:`, err);

  const statusCode = err.statusCode || err.status || 500;
  const rawMessage = err.message || 'Internal Server Error';

  // Scrub any accidental credential or key leaks from error message
  const sanitizedMessage = rawMessage
    .replace(/[A-Za-z0-9_-]{35,}/g, '[REDACTED_KEY]')
    .replace(/(?:postgresql|postgres):\/\/[^\s]+/gi, '[REDACTED_DATABASE_URL]');

  res.status(statusCode).json({
    success: false,
    error: {
      message: sanitizedMessage,
      ...(process.env.NODE_ENV === 'development' && { stack: err.stack })
    }
  });
};
