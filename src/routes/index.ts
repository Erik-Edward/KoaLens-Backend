// src/routes/index.ts
import express, { Request, Response } from 'express';
import counterRoutes from './counterRoutes';

const router = express.Router();

// Registrera counter-routes under /api/counters
router.use('/counters', counterRoutes);

// Lägga till andra routes här vid behov
// t.ex. router.use('/products', productRoutes);

// Hälsokontroll
router.get('/health', (_req: Request, res: Response) => {
  res.status(200).json({ status: 'OK', message: 'API is running' });
});

export default router;