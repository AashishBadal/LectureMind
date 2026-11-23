import { verifyToken, AUTH_COOKIE_NAME } from '../utils/auth.js';
import { prisma } from '../config/prisma.js';
import { logger } from '../utils/logger.js';

/**
 * Reusable authentication middleware
 * Extracts and verifies JWT from HTTP-only cookie or Authorization header,
 * loads the sanitized user record from Prisma, and attaches it to req.user.
 */
export const requireAuth = async (req, res, next) => {
  try {
    let token = null;

    // 1. Check HTTP-only cookie
    if (req.cookies && (req.cookies[AUTH_COOKIE_NAME] || req.cookies.token)) {
      token = req.cookies[AUTH_COOKIE_NAME] || req.cookies.token;
    }

    // 2. Check Authorization header (Bearer token)
    if (!token && req.headers.authorization) {
      const parts = req.headers.authorization.split(' ');
      if (parts.length === 2 && parts[0] === 'Bearer') {
        token = parts[1];
      }
    }

    if (!token) {
      return res.status(401).json({
        success: false,
        error: { message: 'Authentication required. No session token provided.' }
      });
    }

    // Verify token
    let decoded;
    try {
      decoded = verifyToken(token);
    } catch (jwtErr) {
      return res.status(401).json({
        success: false,
        error: { message: 'Invalid or expired session token.' }
      });
    }

    // Fetch user from Prisma omitting passwordHash
    const user = await prisma.user.findUnique({
      where: { id: decoded.id },
      select: {
        id: true,
        name: true,
        email: true,
        credits: true,
        role: true,
        institution: true,
        fieldOfStudy: true,
        academicLevel: true,
        primaryGoal: true,
        aiTonePreference: true,
        onboardingCompleted: true,
        createdAt: true,
        updatedAt: true
      }
    });

    if (!user) {
      return res.status(401).json({
        success: false,
        error: { message: 'User associated with session not found.' }
      });
    }

    // Attach authenticated user to request
    req.user = user;
    next();
  } catch (error) {
    logger.error('Authentication middleware error:', error);
    return res.status(500).json({
      success: false,
      error: { message: 'Internal server error during authentication.' }
    });
  }
};

/**
 * Optional authentication middleware
 * If valid session token exists, attaches req.user.
 * Otherwise proceeds without error so public routes can customize behavior.
 */
export const optionalAuth = async (req, res, next) => {
  try {
    let token = null;

    if (req.cookies && (req.cookies[AUTH_COOKIE_NAME] || req.cookies.token)) {
      token = req.cookies[AUTH_COOKIE_NAME] || req.cookies.token;
    }

    if (!token && req.headers.authorization) {
      const parts = req.headers.authorization.split(' ');
      if (parts.length === 2 && parts[0] === 'Bearer') {
        token = parts[1];
      }
    }

    if (!token) {
      return next();
    }

    let decoded;
    try {
      decoded = verifyToken(token);
    } catch {
      return next();
    }

    const user = await prisma.user.findUnique({
      where: { id: decoded.id },
      select: {
        id: true,
        name: true,
        email: true,
        credits: true,
        role: true,
        institution: true,
        fieldOfStudy: true,
        academicLevel: true,
        primaryGoal: true,
        aiTonePreference: true,
        onboardingCompleted: true,
        createdAt: true,
        updatedAt: true
      }
    });

    if (user) {
      req.user = user;
    }
    next();
  } catch (error) {
    logger.warn('Optional auth warning:', error);
    next();
  }
};

