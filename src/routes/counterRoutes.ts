// src/routes/counterRoutes.ts
import express, { Request, Response } from 'express';
import { getCounter, incrementCounter, checkCounterLimit } from '../services/counterService';

const router = express.Router();

/**
 * Hämta en räknare för en användare
 * GET /api/counters/:userId/:counterName
 */
router.get('/:userId/:counterName', async (req: Request, res: Response) => {
  try {
    const { userId, counterName } = req.params;
    
    if (!userId || !counterName) {
      return res.status(400).json({ 
        error: 'INVALID_PARAMS', 
        message: 'Användar-ID och räknarnamn krävs'
      });
    }
    
    const counter = await getCounter(userId, counterName);
    return res.status(200).json(counter);
  } catch (error) {
    console.error('Error in counter GET endpoint:', error);
    return res.status(500).json({ 
      error: 'SERVER_ERROR', 
      message: 'Ett fel uppstod vid hämtning av räknare'
    });
  }
});

/**
 * Öka en räknare för en användare
 * POST /api/counters/:userId/:counterName/increment
 */
router.post('/:userId/:counterName/increment', async (req: Request, res: Response) => {
  try {
    const { userId, counterName } = req.params;
    const { increment = 1 } = req.body;
    
    if (!userId || !counterName) {
      return res.status(400).json({ 
        error: 'INVALID_PARAMS', 
        message: 'Användar-ID och räknarnamn krävs'
      });
    }
    
    const counter = await incrementCounter(userId, counterName, increment);
    return res.status(200).json(counter);
  } catch (error) {
    console.error('Error in counter INCREMENT endpoint:', error);
    return res.status(500).json({ 
      error: 'SERVER_ERROR', 
      message: 'Ett fel uppstod vid ökning av räknare'
    });
  }
});

/**
 * Kontrollera om en användare har nått sin räknargräns
 * GET /api/counters/:userId/:counterName/limit
 */
router.get('/:userId/:counterName/limit', async (req: Request, res: Response) => {
  try {
    const { userId, counterName } = req.params;
    
    if (!userId || !counterName) {
      return res.status(400).json({ 
        error: 'INVALID_PARAMS', 
        message: 'Användar-ID och räknarnamn krävs'
      });
    }
    
    const limitInfo = await checkCounterLimit(userId, counterName);
    return res.status(200).json(limitInfo);
  } catch (error) {
    console.error('Error in counter LIMIT endpoint:', error);
    return res.status(500).json({ 
      error: 'SERVER_ERROR', 
      message: 'Ett fel uppstod vid kontroll av räknargräns'
    });
  }
});

export default router;