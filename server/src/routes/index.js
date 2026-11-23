import { Router } from 'express';
import healthRoutes from './health.routes.js';
import authRoutes from './auth.routes.js';
import lectureRoutes from './lecture.routes.js';
import aiRoutes from './ai.routes.js';
import subjectRoutes from './subject.routes.js';
import paymentRoutes from './payment.routes.js';
import researchRoutes from './research.routes.js';

const router = Router();

// Mount sub-routes
router.use('/health', healthRoutes);
router.use('/auth', authRoutes);
router.use('/lectures', lectureRoutes);
router.use('/ai', aiRoutes);
router.use('/subjects', subjectRoutes);
router.use('/payments', paymentRoutes);
router.use('/research', researchRoutes);

export default router;

