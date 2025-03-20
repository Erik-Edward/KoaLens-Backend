// src/routes/counterRoutes.ts
import express, { Request, Response, RequestHandler } from 'express';
import { getCounter, incrementCounter, checkCounterLimit } from '../services/counterService';

const router = express.Router();

/**
 * Hämta en räknare för en användare
 * GET /api/counters/:userId/:counterName
 */
router.get('/:userId/:counterName', (async (req: Request, res: Response) => {
  try {
    const { userId, counterName } = req.params;
    
    if (!userId || !counterName) {
      res.status(400).json({ 
        error: 'INVALID_PARAMS', 
        message: 'Användar-ID och räknarnamn krävs'
      });
      return;
    }
    
    const counter = await getCounter(userId, counterName);
    res.status(200).json(counter);
  } catch (error) {
    console.error('Error in counter GET endpoint:', error);
    res.status(500).json({ 
      error: 'SERVER_ERROR', 
      message: 'Ett fel uppstod vid hämtning av räknare'
    });
  }
}) as RequestHandler);

/**
 * Öka en räknare för en användare
 * POST /api/counters/:userId/:counterName/increment
 */
router.post('/:userId/:counterName/increment', (async (req: Request, res: Response) => {
  try {
    const { userId, counterName } = req.params;
    const { increment = 1 } = req.body;
    
    if (!userId || !counterName) {
      res.status(400).json({ 
        error: 'INVALID_PARAMS', 
        message: 'Användar-ID och räknarnamn krävs'
      });
      return;
    }
    
    const counter = await incrementCounter(userId, counterName, increment);
    res.status(200).json(counter);
  } catch (error) {
    console.error('Error in counter INCREMENT endpoint:', error);
    res.status(500).json({ 
      error: 'SERVER_ERROR', 
      message: 'Ett fel uppstod vid ökning av räknare'
    });
  }
}) as RequestHandler);

/**
 * Kontrollera om en användare har nått sin räknargräns
 * GET /api/counters/:userId/:counterName/limit
 */
router.get('/:userId/:counterName/limit', (async (req: Request, res: Response) => {
  try {
    const { userId, counterName } = req.params;
    
    if (!userId || !counterName) {
      res.status(400).json({ 
        error: 'INVALID_PARAMS', 
        message: 'Användar-ID och räknarnamn krävs'
      });
      return;
    }
    
    const limitInfo = await checkCounterLimit(userId, counterName);
    res.status(200).json(limitInfo);
  } catch (error) {
    console.error('Error in counter LIMIT endpoint:', error);
    res.status(500).json({ 
      error: 'SERVER_ERROR', 
      message: 'Ett fel uppstod vid kontroll av räknargräns'
    });
  }
}) as RequestHandler);

export default router;