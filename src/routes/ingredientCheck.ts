import express from 'express';
import { checkIngredientStatus } from '../utils/ingredientsDatabase';
import { logger } from '../utils/logger';

const router = express.Router();

// Existing endpoints...

/**
 * Endpoint to check E304 directly
 */
router.get('/check-e304', (_req, res) => {
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

/**
 * GET /ingredient - Check the status of a single ingredient.
 * Query parameter: ?name=<ingredient_name>
 */
router.get('/ingredient', (_req: express.Request, _res: express.Response) => {
  // Entire logic commented out as it was unused and causing errors
  /*
  const ingredientName = _req.query.name as string;

  // If no ingredient name is provided, return an error
  if (!ingredientName) {
    return _res.status(400).json({
      error: 'No ingredient name provided'
    });
  }
  
  const result = checkIngredientStatus(ingredientName);
  logger.info(`${ingredientName} check result: ${JSON.stringify(result)}`);
  
  _res.json({
    message: 'Ingredient check completed',
    ingredientName,
    result
  });
  */
});

export default router; 