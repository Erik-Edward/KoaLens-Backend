// src/routes/index.ts
import { Router } from 'express';
import analyzeRoutes from './analyzeRoutes';
import aiRoutes from './aiRoutes';
import counterRoutes from './counterRoutes';
import reportRoutes from './reportRoutes';
import videoAnalysisRoutes from './videoAnalysis';
import testGeminiRoutes from './testGemini';
import { logger } from '../utils/logger';

// Create a router instance
const router = Router();

// Basic healthcheck endpoint
router.get('/', (_req, res) => {
  res.json({
    status: 'ok',
    message: 'KoaLens API is running',
    environment: process.env.NODE_ENV || 'development',
    timestamp: new Date().toISOString()
  });
});

// Mount the routes
router.use('/analyze', analyzeRoutes);
router.use('/ai', aiRoutes);
router.use('/counter', counterRoutes);
router.use('/reports', reportRoutes);
router.use('/video', videoAnalysisRoutes);

// Mount diagnostic and test routes
// Not mounted in production by default for security
if (process.env.NODE_ENV !== 'production' || process.env.ENABLE_TEST_ROUTES === 'true') {
  logger.info('Mounting test routes - accessible in non-production or with ENABLE_TEST_ROUTES=true');
  router.use('/test', testGeminiRoutes);
} else {
  logger.info('Test routes not mounted in production. Set ENABLE_TEST_ROUTES=true to enable.');
}

export default router;