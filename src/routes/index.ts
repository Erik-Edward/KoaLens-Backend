// src/routes/index.ts
import express, { Request, Response } from 'express';
import counterRoutes from './counterRoutes';
import testGeminiRoutes from './testGemini';
import analyzeRoutes from './analyzeRoutes';

const router = express.Router();

// Register counter-routes under /api/counters
router.use('/counters', counterRoutes);

// Register Gemini test routes
router.use('/ai', testGeminiRoutes);

// Register analysis routes
router.use('/analyze', analyzeRoutes);

// Add other routes here as needed
// e.g. router.use('/products', productRoutes);

// Health check
router.get('/health', (_req: Request, res: Response) => {
  res.status(200).json({ status: 'OK', message: 'API is running' });
});

export default router;