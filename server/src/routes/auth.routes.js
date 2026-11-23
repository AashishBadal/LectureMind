import { Router } from 'express';
import {
  register,
  login,
  getMe,
  logout,
  forgotPassword,
  verifyOtp,
  resetPassword,
  sendRegistrationOtp,
  googleAuth,
  updateProfile,
  completeOnboarding
} from '../controllers/auth.controller.js';
import { requireAuth } from '../middleware/auth.js';

const router = Router();

// Public routes
router.post('/send-registration-otp', sendRegistrationOtp);
router.post('/register', register);
router.post('/login', login);
router.post('/logout', logout);
router.post('/google', googleAuth);
router.post('/forgot-password', forgotPassword);
router.post('/verify-otp', verifyOtp);
router.post('/reset-password', resetPassword);

// Protected routes
router.get('/me', requireAuth, getMe);
router.put('/profile', requireAuth, updateProfile);
router.post('/onboarding', requireAuth, completeOnboarding);

export default router;
