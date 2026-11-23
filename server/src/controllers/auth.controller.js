import crypto from 'crypto';
import { OAuth2Client } from 'google-auth-library';
import { prisma } from '../config/prisma.js';
import {
  hashPassword,
  comparePassword,
  generateToken,
  setAuthCookie,
  clearAuthCookie
} from '../utils/auth.js';
import { sendPasswordResetOtpEmail, sendPasswordResetEmail, sendRegistrationOtpEmail } from '../services/email.service.js';
import { logger } from '../utils/logger.js';
import { config } from '../config/env.js';

// Simple email regex for validation
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Standardize sanitized user response with profile and onboarding metadata
 */
export const sanitizeUser = (user) => {
  if (!user) return null;
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    credits: user.credits ?? 10,
    role: user.role || 'STUDENT',
    institution: user.institution || null,
    fieldOfStudy: user.fieldOfStudy || null,
    academicLevel: user.academicLevel || null,
    primaryGoal: user.primaryGoal || null,
    aiTonePreference: user.aiTonePreference || 'BALANCED',
    onboardingCompleted: Boolean(user.onboardingCompleted),
    createdAt: user.createdAt,
    updatedAt: user.updatedAt
  };
};

// Google OAuth2 client (lazy — only used when GOOGLE_CLIENT_ID is set)
const googleClient = config.googleClientId ? new OAuth2Client(config.googleClientId) : null;

/**
 * In-memory store for pending registrations (email -> { otpHash, name, passwordHash, expiresAt })
 * Entries expire after 10 minutes; cleaned up on each access.
 */
const pendingRegistrations = new Map();

/**
 * POST /api/auth/send-registration-otp
 * Step 1 of registration: validate fields, check email availability, send OTP
 */
export const sendRegistrationOtp = async (req, res) => {
  try {
    const { name, email, password } = req.body;

    if (!name || typeof name !== 'string' || !name.trim()) {
      return res.status(400).json({
        success: false,
        error: { message: 'Name is required and cannot be empty.' }
      });
    }

    if (!email || typeof email !== 'string' || !EMAIL_REGEX.test(email.trim())) {
      return res.status(400).json({
        success: false,
        error: { message: 'Please provide a valid email address.' }
      });
    }

    if (!password || typeof password !== 'string' || password.length < 6) {
      return res.status(400).json({
        success: false,
        error: { message: 'Password must be at least 6 characters long.' }
      });
    }

    const cleanEmail = email.trim().toLowerCase();
    const cleanName = name.trim();

    // Check if email already registered
    const existingUser = await prisma.user.findUnique({ where: { email: cleanEmail } });
    if (existingUser) {
      return res.status(409).json({
        success: false,
        error: { message: 'An account with this email address already exists.' }
      });
    }

    // Hash password upfront so we don't store plaintext in memory
    const passwordHash = await hashPassword(password);

    // Generate 6-digit OTP and hash it
    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    const otpHash = crypto.createHash('sha256').update(`${cleanEmail}:${otp}`).digest('hex');
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes

    // Store in pending registrations map
    pendingRegistrations.set(cleanEmail, { otpHash, name: cleanName, passwordHash, expiresAt });

    // Send verification email
    try {
      await sendRegistrationOtpEmail({ to: cleanEmail, name: cleanName, otp });
      logger.info(`[AUTH] Registration OTP sent to ${cleanEmail}`);
    } catch (mailError) {
      pendingRegistrations.delete(cleanEmail);
      logger.error(`[AUTH] Failed to send registration OTP: ${mailError.message}`);
      return res.status(500).json({
        success: false,
        error: { message: 'Failed to send verification email. Please try again later.' }
      });
    }

    return res.status(200).json({
      success: true,
      message: 'A 6-digit verification code has been sent to your email address.',
      email: cleanEmail
    });
  } catch (error) {
    logger.error('Send registration OTP error:', error);
    return res.status(500).json({
      success: false,
      error: { message: 'Internal server error while sending verification code.' }
    });
  }
};

/**
 * POST /api/auth/register
 * Step 2 of registration: verify OTP and create the user account
 */
export const register = async (req, res) => {
  try {
    const { email, otp } = req.body;

    if (!email || typeof email !== 'string' || !EMAIL_REGEX.test(email.trim())) {
      return res.status(400).json({
        success: false,
        error: { message: 'Please provide a valid email address.' }
      });
    }

    if (!otp || typeof otp !== 'string') {
      return res.status(400).json({
        success: false,
        error: { message: 'Verification code is required.' }
      });
    }

    const cleanEmail = email.trim().toLowerCase();
    const cleanOtp = String(otp).trim().replace(/\D/g, '');

    // Look up pending registration
    const pending = pendingRegistrations.get(cleanEmail);

    if (!pending) {
      return res.status(400).json({
        success: false,
        error: { message: 'No pending registration found for this email. Please request a new code.' }
      });
    }

    // Check expiry
    if (new Date() > pending.expiresAt) {
      pendingRegistrations.delete(cleanEmail);
      return res.status(400).json({
        success: false,
        error: { message: 'Verification code has expired. Please start the registration again.' }
      });
    }

    // Verify OTP hash
    const expectedHash = crypto.createHash('sha256').update(`${cleanEmail}:${cleanOtp}`).digest('hex');
    if (expectedHash !== pending.otpHash) {
      return res.status(400).json({
        success: false,
        error: { message: 'Invalid verification code. Please check your email and try again.' }
      });
    }

    // OTP verified — remove from pending map
    pendingRegistrations.delete(cleanEmail);

    // Double-check email not taken (race condition guard)
    const existingUser = await prisma.user.findUnique({ where: { email: cleanEmail } });
    if (existingUser) {
      return res.status(409).json({
        success: false,
        error: { message: 'An account with this email address already exists.' }
      });
    }

    // Create user with 10 initial credits
    const newUser = await prisma.$transaction(async (tx) => {
      const u = await tx.user.create({
        data: {
          name: pending.name,
          email: cleanEmail,
          passwordHash: pending.passwordHash,
          emailVerified: true,
          credits: 10,
          role: 'STUDENT',
          onboardingCompleted: false
        }
      });

      await tx.creditTransaction.create({
        data: {
          userId: u.id,
          amount: 10,
          balanceAfter: 10,
          type: 'INITIAL_BONUS',
          description: 'Welcome bonus: 10 free credits for lecture analysis'
        }
      });

      return u;
    });

    // Generate token and set HTTP-only cookie
    const token = generateToken({ id: newUser.id, email: newUser.email });
    setAuthCookie(res, token);

    logger.info(`User registered successfully: ${newUser.id} (${newUser.email}) with 10 free credits`);

    return res.status(201).json({
      success: true,
      message: 'Registration successful. 10 free credits added to your account!',
      user: sanitizeUser(newUser),
      token
    });
  } catch (error) {
    logger.error('Registration error:', error);
    return res.status(500).json({
      success: false,
      error: { message: 'Internal server error during registration.' }
    });
  }
};

/**
 * POST /api/auth/google
 * Google OAuth sign-in / sign-up — handles both in one shot
 */
export const googleAuth = async (req, res) => {
  try {
    if (!googleClient) {
      return res.status(503).json({
        success: false,
        error: { message: 'Google sign-in is not configured on this server.' }
      });
    }

    const { credential } = req.body;
    if (!credential) {
      return res.status(400).json({
        success: false,
        error: { message: 'Google credential token is required.' }
      });
    }

    // Verify the Google ID token
    let payload;
    try {
      const ticket = await googleClient.verifyIdToken({
        idToken: credential,
        audience: config.googleClientId
      });
      payload = ticket.getPayload();
    } catch (verifyErr) {
      logger.warn(`[AUTH] Invalid Google token: ${verifyErr.message}`);
      return res.status(401).json({
        success: false,
        error: { message: 'Invalid or expired Google credential. Please try again.' }
      });
    }

    const { sub: googleId, email, name, email_verified } = payload;

    if (!email) {
      return res.status(400).json({
        success: false,
        error: { message: 'Google account does not have an email address.' }
      });
    }

    const cleanEmail = email.trim().toLowerCase();

    // Find or create user — upsert by googleId first, then fall back to email
    let user = await prisma.user.findUnique({ where: { googleId } });

    if (!user) {
      // Check if an email-based account already exists
      const emailUser = await prisma.user.findUnique({ where: { email: cleanEmail } });

      if (emailUser) {
        // Link Google account to existing email-based account
        user = await prisma.user.update({
          where: { id: emailUser.id },
          data: {
            googleId,
            emailVerified: email_verified ?? true
          }
        });
      } else {
        // Brand new user — create with 10 credits
        user = await prisma.$transaction(async (tx) => {
          const u = await tx.user.create({
            data: {
              name: name || cleanEmail.split('@')[0],
              email: cleanEmail,
              googleId,
              emailVerified: email_verified ?? true,
              credits: 10,
              role: 'STUDENT',
              onboardingCompleted: false
            }
          });

          await tx.creditTransaction.create({
            data: {
              userId: u.id,
              amount: 10,
              balanceAfter: 10,
              type: 'INITIAL_BONUS',
              description: 'Welcome bonus: 10 free credits for lecture analysis'
            }
          });

          return u;
        });
      }
    }

    const token = generateToken({ id: user.id, email: user.email });
    setAuthCookie(res, token);

    logger.info(`[AUTH] Google sign-in: ${user.id} (${user.email})`);

    return res.status(200).json({
      success: true,
      message: 'Google sign-in successful.',
      user: sanitizeUser(user),
      token
    });
  } catch (error) {
    logger.error('Google auth error:', error);
    return res.status(500).json({
      success: false,
      error: { message: 'Internal server error during Google sign-in.' }
    });
  }
};

/**
 * POST /api/auth/login
 * Authenticate existing user and issue session token
 */
export const login = async (req, res) => {
  try {
    const { email, password } = req.body;

    // Validate input presence
    if (!email || !password) {
      return res.status(400).json({
        success: false,
        error: { message: 'Both email and password are required.' }
      });
    }

    const cleanEmail = String(email).trim().toLowerCase();

    // Find user in Prisma
    const user = await prisma.user.findUnique({
      where: { email: cleanEmail }
    });

    if (!user) {
      return res.status(401).json({
        success: false,
        error: { message: 'Invalid email or password.' }
      });
    }

    // Compare password with stored bcrypt hash
    const isMatch = await comparePassword(password, user.passwordHash);
    if (!isMatch) {
      return res.status(401).json({
        success: false,
        error: { message: 'Invalid email or password.' }
      });
    }

    // Generate token and set HTTP-only cookie
    const token = generateToken({ id: user.id, email: user.email });
    setAuthCookie(res, token);

    logger.info(`User logged in: ${user.id} (${user.email})`);

    return res.status(200).json({
      success: true,
      message: 'Login successful.',
      user: sanitizeUser(user),
      token
    });
  } catch (error) {
    logger.error('Login error:', error);
    return res.status(500).json({
      success: false,
      error: { message: 'Internal server error during login.' }
    });
  }
};

/**
 * GET /api/auth/me
 * Return current authenticated user profile
 */
export const getMe = async (req, res) => {
  // req.user is populated by requireAuth middleware
  return res.status(200).json({
    success: true,
    user: sanitizeUser(req.user)
  });
};

/**
 * PUT /api/auth/profile
 * Update user profile details
 */
export const updateProfile = async (req, res) => {
  try {
    const userId = req.user.id;
    const {
      name,
      role,
      institution,
      fieldOfStudy,
      academicLevel,
      primaryGoal,
      aiTonePreference
    } = req.body;

    const updateData = {};

    if (typeof name === 'string' && name.trim()) {
      updateData.name = name.trim();
    }
    if (typeof role === 'string' && ['STUDENT', 'TEACHER', 'RESEARCHER', 'OTHER'].includes(role.toUpperCase())) {
      updateData.role = role.toUpperCase();
    }
    if (institution !== undefined) {
      updateData.institution = typeof institution === 'string' ? institution.trim() : null;
    }
    if (fieldOfStudy !== undefined) {
      updateData.fieldOfStudy = typeof fieldOfStudy === 'string' ? fieldOfStudy.trim() : null;
    }
    if (academicLevel !== undefined) {
      updateData.academicLevel = typeof academicLevel === 'string' ? academicLevel.trim() : null;
    }
    if (primaryGoal !== undefined) {
      updateData.primaryGoal = typeof primaryGoal === 'string' ? primaryGoal.trim() : null;
    }
    if (typeof aiTonePreference === 'string' && ['CONCISE', 'BALANCED', 'IN_DEPTH', 'SOCRATIC'].includes(aiTonePreference.toUpperCase())) {
      updateData.aiTonePreference = aiTonePreference.toUpperCase();
    }

    const updatedUser = await prisma.user.update({
      where: { id: userId },
      data: updateData
    });

    return res.status(200).json({
      success: true,
      message: 'Profile updated successfully.',
      user: sanitizeUser(updatedUser)
    });
  } catch (error) {
    logger.error('Update profile error:', error);
    return res.status(500).json({
      success: false,
      error: { message: 'Internal server error while updating profile.' }
    });
  }
};

/**
 * POST /api/auth/onboarding
 * Complete initial user onboarding wizard
 */
export const completeOnboarding = async (req, res) => {
  try {
    const userId = req.user.id;
    const {
      role,
      institution,
      fieldOfStudy,
      academicLevel,
      primaryGoal,
      aiTonePreference
    } = req.body;

    const data = {
      onboardingCompleted: true
    };

    if (role && ['STUDENT', 'TEACHER', 'RESEARCHER', 'OTHER'].includes(role.toUpperCase())) {
      data.role = role.toUpperCase();
    }
    if (institution !== undefined) {
      data.institution = typeof institution === 'string' ? institution.trim() : null;
    }
    if (fieldOfStudy !== undefined) {
      data.fieldOfStudy = typeof fieldOfStudy === 'string' ? fieldOfStudy.trim() : null;
    }
    if (academicLevel !== undefined) {
      data.academicLevel = typeof academicLevel === 'string' ? academicLevel.trim() : null;
    }
    if (primaryGoal !== undefined) {
      data.primaryGoal = typeof primaryGoal === 'string' ? primaryGoal.trim() : null;
    }
    if (aiTonePreference && ['CONCISE', 'BALANCED', 'IN_DEPTH', 'SOCRATIC'].includes(aiTonePreference.toUpperCase())) {
      data.aiTonePreference = aiTonePreference.toUpperCase();
    }

    const updatedUser = await prisma.user.update({
      where: { id: userId },
      data
    });

    logger.info(`[AUTH] User ${userId} completed onboarding with role ${updatedUser.role}`);

    return res.status(200).json({
      success: true,
      message: 'Onboarding completed successfully!',
      user: sanitizeUser(updatedUser)
    });
  } catch (error) {
    logger.error('Complete onboarding error:', error);
    return res.status(500).json({
      success: false,
      error: { message: 'Internal server error while completing onboarding.' }
    });
  }
};

/**
 * POST /api/auth/logout
 * Invalidate session and clear HTTP-only cookie
 */
export const logout = async (req, res) => {
  clearAuthCookie(res);
  return res.status(200).json({
    success: true,
    message: 'Logged out successfully.'
  });
};

/**
 * POST /api/auth/forgot-password
 * Initiate password reset by generating a 6-digit numeric OTP and emailing it via Brevo SMTP
 */
export const forgotPassword = async (req, res) => {
  try {
    const { email } = req.body;

    if (!email || typeof email !== 'string' || !EMAIL_REGEX.test(email.trim())) {
      return res.status(400).json({
        success: false,
        error: { message: 'Please provide a valid email address.' }
      });
    }

    const cleanEmail = email.trim().toLowerCase();

    // Look up user by email
    const user = await prisma.user.findUnique({
      where: { email: cleanEmail }
    });

    // If user does not exist in database, return clear error
    if (!user) {
      logger.info(`[AUTH] Password reset requested for non-existent email: ${cleanEmail}`);
      return res.status(404).json({
        success: false,
        error: { message: 'No account found with this email address. Please check your email or register.' }
      });
    }

    // Generate secure 6-digit numeric OTP (e.g. 100000 - 999999)
    const otp = Math.floor(100000 + Math.random() * 900000).toString();

    // Hash the OTP with the user's email as salt for unique storage in Prisma
    const otpHash = crypto.createHash('sha256').update(`${cleanEmail}:${otp}`).digest('hex');

    // Retain previous active OTP if unexpired so earlier recent emails still validate smoothly
    const previousTokens = (user.resetPasswordExpires && user.resetPasswordExpires > new Date() && user.resetPasswordToken)
      ? user.resetPasswordToken.split('|').slice(0, 2)
      : [];

    const storedTokens = [otpHash, ...previousTokens.filter((t) => t !== otpHash)].slice(0, 2).join('|');

    // OTP expires in 15 minutes
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000);

    await prisma.user.update({
      where: { id: user.id },
      data: {
        resetPasswordToken: storedTokens,
        resetPasswordExpires: expiresAt
      }
    });

    // Construct client direct reset URL fallback
    const clientUrl = process.env.CLIENT_URL || 'http://localhost:5173';
    const resetUrl = `${clientUrl}/reset-password?email=${encodeURIComponent(cleanEmail)}&otp=${otp}`;

    // Send email via Brevo SMTP service
    try {
      await sendPasswordResetOtpEmail({
        to: user.email,
        name: user.name || 'Student',
        otp,
        resetUrl
      });
      logger.info(`[AUTH] Password reset OTP dispatched via Brevo SMTP for user ${user.id} (${cleanEmail})`);
    } catch (mailError) {
      logger.error(`[AUTH] Brevo SMTP delivery failed: ${mailError.message}`);
      return res.status(500).json({
        success: false,
        error: { message: 'Failed to deliver verification code email via SMTP. Please try again later.' }
      });
    }

    return res.status(200).json({
      success: true,
      message: 'A 6-digit verification code has been sent to your email address.',
      email: cleanEmail
    });
  } catch (error) {
    logger.error('Forgot password error:', error);
    return res.status(500).json({
      success: false,
      error: { message: 'Internal server error while processing password reset request.' }
    });
  }
};

/**
 * POST /api/auth/verify-otp
 * Verify if the 6-digit OTP for the given email is valid and unexpired
 */
export const verifyOtp = async (req, res) => {
  try {
    const { email, otp } = req.body;

    if (!email || !otp) {
      return res.status(400).json({
        success: false,
        error: { message: 'Both email and 6-digit verification code are required.' }
      });
    }

    const cleanEmail = email.trim().toLowerCase();
    const cleanOtp = String(otp).trim().replace(/\D/g, '');

    const expectedHash = crypto.createHash('sha256').update(`${cleanEmail}:${cleanOtp}`).digest('hex');

    const candidateUser = await prisma.user.findUnique({
      where: { email: cleanEmail }
    });

    const isMatch = candidateUser &&
      candidateUser.resetPasswordToken &&
      candidateUser.resetPasswordToken.split('|').includes(expectedHash) &&
      candidateUser.resetPasswordExpires &&
      candidateUser.resetPasswordExpires > new Date();

    if (!isMatch) {
      return res.status(400).json({
        success: false,
        error: { message: 'Invalid or expired verification code. Please enter the 6-digit code from your latest email, or request a new one.' }
      });
    }

    return res.status(200).json({
      success: true,
      message: 'Verification code verified successfully.'
    });
  } catch (error) {
    logger.error('Verify OTP error:', error);
    return res.status(500).json({
      success: false,
      error: { message: 'Internal server error while verifying code.' }
    });
  }
};

/**
 * POST /api/auth/reset-password
 * Reset user password using 6-digit OTP or link token
 */
export const resetPassword = async (req, res) => {
  try {
    const { email, otp, token, newPassword } = req.body;

    if (!newPassword || typeof newPassword !== 'string' || newPassword.length < 6) {
      return res.status(400).json({
        success: false,
        error: { message: 'New password must be at least 6 characters long.' }
      });
    }

    let user = null;

    if (email && otp) {
      // 1. Verify via 6-digit numeric OTP
      const cleanEmail = String(email).trim().toLowerCase();
      const cleanOtp = String(otp).trim().replace(/\D/g, '');
      const expectedHash = crypto.createHash('sha256').update(`${cleanEmail}:${cleanOtp}`).digest('hex');

      const candidateUser = await prisma.user.findUnique({
        where: { email: cleanEmail }
      });

      if (
        candidateUser &&
        candidateUser.resetPasswordToken &&
        candidateUser.resetPasswordToken.split('|').includes(expectedHash) &&
        candidateUser.resetPasswordExpires &&
        candidateUser.resetPasswordExpires > new Date()
      ) {
        user = candidateUser;
      }
    } else if (token) {
      // 2. Fallback: Verify via hex reset token
      const tokenHash = crypto.createHash('sha256').update(String(token).trim()).digest('hex');

      user = await prisma.user.findFirst({
        where: {
          resetPasswordToken: { contains: tokenHash },
          resetPasswordExpires: {
            gt: new Date()
          }
        }
      });
    } else {
      return res.status(400).json({
        success: false,
        error: { message: 'Please provide either your email and 6-digit verification code, or a valid reset token.' }
      });
    }

    if (!user) {
      return res.status(400).json({
        success: false,
        error: { message: 'Verification code is invalid or has expired. Please check your latest email or request a new code.' }
      });
    }

    // Hash new password securely with bcrypt
    const passwordHash = await hashPassword(newPassword);

    // Update password and clear reset token fields
    await prisma.user.update({
      where: { id: user.id },
      data: {
        passwordHash,
        resetPasswordToken: null,
        resetPasswordExpires: null
      }
    });

    logger.info(`[AUTH] Password reset successfully completed for user ${user.id} (${user.email})`);

    return res.status(200).json({
      success: true,
      message: 'Your password has been successfully reset. You may now log in with your new password.'
    });
  } catch (error) {
    logger.error('Reset password error:', error);
    return res.status(500).json({
      success: false,
      error: { message: 'Internal server error while resetting password.' }
    });
  }
};
