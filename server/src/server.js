import express from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import { config } from './config/env.js';
import { logger } from './utils/logger.js';
import apiRoutes from './routes/index.js';
import { errorHandler } from './middleware/errorHandler.js';

const app = express();

// Allowed origins for CORS with credentials
const allowedOrigins = [
  config.clientUrl,
  'http://localhost:5173',
  'http://127.0.0.1:5173'
].filter(Boolean);

// Global Middleware
app.use(
  cors({
    origin: (origin, callback) => {
      // Allow requests with no origin (like mobile apps, curl, server-to-server)
      if (!origin || allowedOrigins.includes(origin)) {
        return callback(null, true);
      }
      return callback(null, true); // Permissive in development
    },
    credentials: true
  })
);
app.use(cookieParser());
app.use(express.json({ limit: '100mb' }));
app.use(express.urlencoded({ extended: true, limit: '100mb' }));

// Request Logging Middleware (Development)
if (config.nodeEnv === 'development') {
  app.use((req, res, next) => {
    logger.info(`${req.method} ${req.originalUrl}`);
    next();
  });
}

// Mount API routes
app.use('/api', apiRoutes);

// Catch-all 404 for unhandled API routes
app.use('/api/*', (req, res) => {
  res.status(404).json({
    success: false,
    error: {
      message: `Endpoint ${req.originalUrl} not found`
    }
  });
});

// Global Error Handler
app.use(errorHandler);

import { fileURLToPath } from 'url';
import path from 'path';

// Start server if run directly as main entrypoint
const isMainModule = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMainModule && process.env.NODE_ENV !== 'test') {
  const server = app.listen(config.port, () => {
    logger.info(`LectureMind server running on port ${config.port} [${config.nodeEnv}]`);
    logger.info(`Health check available at http://localhost:${config.port}/api/health`);
  });

  // Graceful shutdown handling
  const shutdown = () => {
    logger.info('Received kill signal, shutting down gracefully...');
    server.close(() => {
      logger.info('Closed out remaining connections.');
      process.exit(0);
    });
  };

  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
}

export default app;
