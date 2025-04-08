import express from 'express';
import { checkIngredientStatus } from '../utils/ingredientsDatabase';
import { logger } from '../utils/logger';

const router = express.Router();

// Existing endpoints...

/**
 * Endpoint to check E304 directly
 */
router.get('/check-e304', (req, res) => {
  logger.info('Running direct check for E304');
  
  // First check the exact E304 string
  const e304Result = checkIngredientStatus('E304');
  logger.info(`E304 exact check result: ${JSON.stringify(e304Result)}`);
  
  // Check a few variations
  const variations = ['e304', 'E-304', 'Askorbylplamitat', 'E304 additive'];
  const results = variations.map(variation => {
    const result = checkIngredientStatus(variation);
    logger.info(`${variation} check result: ${JSON.stringify(result)}`);
    return { variation, result };
  });
  
  res.json({
    message: 'E304 check completed, see logs for details',
    e304Result,
    variationResults: results
  });
});

export default router; 