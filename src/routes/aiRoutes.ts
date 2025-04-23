import express from 'express';
import { Request, Response } from 'express';
import analysisService from '../services/analysisService';
import { logger } from '../utils/logger';

const router = express.Router();

/**
 * Test endpoint that doesn't call the AI service
 * This is used to verify routing is working without hitting API limits
 */
router.post('/test-endpoint', (req: Request, res: Response) => {
  logger.info('Test endpoint called', { body: req.body });
  
  res.json({
    message: "Routing test successful",
    endpointPath: "/api/ai/test-endpoint",
    receivedData: {
      hasImage: !!req.body.image,
      hasIngredients: !!req.body.ingredients,
      timestamp: new Date().toISOString()
    }
  });
});

/**
 * Redirect /api/ai/analyze-image to /api/analyze/image
 * This maintains backward compatibility with frontend
 */
// router.post('/analyze-image', ...); // ROUTE REMOVED

/**
 * Redirect /api/ai/analyze-text to /api/analyze/text
 * This maintains backward compatibility with frontend
 */
router.post('/analyze-text', async (req: Request, res: Response) => {
  try {
    const { ingredients, text } = req.body;
    
    // Log the redirect for monitoring
    logger.info('Processing request from /api/ai/analyze-text', {
      hasIngredients: !!ingredients,
      hasText: !!text
    });
    
    // Validate request content
    if (!ingredients && !text) {
      logger.warn('Missing content in analysis request');
      res.status(400).json({
        error: 'MISSING_CONTENT',
        message: 'No ingredients or text provided for analysis'
      });
      return;
    }
    
    // Process request using the analysis service directly
    let result;
    if (ingredients && Array.isArray(ingredients)) {
      result = await analysisService.analyzeIngredients(ingredients);
    } else if (text && typeof text === 'string') {
      result = await analysisService.analyzeText(text);
    } else {
      res.status(400).json({
        error: 'INVALID_CONTENT_FORMAT',
        message: 'The provided ingredients or text has an invalid format'
      });
      return;
    }
    
    res.json(result);
    
  } catch (error: any) {
    logger.error('Error in AI text analysis endpoint', { 
      error: error.message, 
      stack: error.stack
    });
    
    res.status(500).json({
      error: 'TEXT_ANALYSIS_ERROR',
      message: `An error occurred during text analysis: ${error.message}`
    });
  }
});

export default router; 