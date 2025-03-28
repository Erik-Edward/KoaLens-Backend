// src/routes/index.ts
import express, { Request, Response } from 'express';
import counterRoutes from './counterRoutes';
import testGeminiRoutes from './testGemini';
import analyzeRoutes from './analyzeRoutes';
import aiRoutes from './aiRoutes';
import videoAnalysisRoutes from './videoAnalysis';

const router = express.Router();

// Register counter-routes under /api/counters
router.use('/counters', counterRoutes);

// Register analysis routes
router.use('/analyze', analyzeRoutes);

// Register AI routes - includes both test routes and compatibility routes
router.use('/ai', aiRoutes);
router.use('/ai', testGeminiRoutes);

// Register video analysis routes
router.use('/video', videoAnalysisRoutes);

// Add other routes here as needed
// e.g. router.use('/products', productRoutes);

// Health check
router.get('/health', (_req: Request, res: Response) => {
  res.status(200).json({ status: 'OK', message: 'API is running' });
});

export default router;