import { Router } from 'express';
import { requireAuth, optionalAuth } from '../middleware/auth.js';
import {
  getPackages,
  initiateEsewaPayment,
  verifyEsewaPayment,
  getCreditHistory
} from '../controllers/payment.controller.js';

const router = Router();

// Public: Get packages and credit rules
router.get('/packages', getPackages);

// Protected: Top-up flow & transaction history
router.post('/initiate', requireAuth, initiateEsewaPayment);
router.post('/verify', optionalAuth, verifyEsewaPayment);
router.get('/history', requireAuth, getCreditHistory);

export default router;
