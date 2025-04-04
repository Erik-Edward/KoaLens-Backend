import { Router, Request, Response, RequestHandler } from 'express';
import AIServiceFactory from '../services/aiServiceFactory';
import promptManager from '../utils/promptManager';
import outputParser from '../utils/outputParser';
import { logger } from '../utils/logger';

const router = Router();

// Simple test endpoint to test Gemini API
router.post('/test-gemini', (async (req: Request, res: Response) => {
  try {
    const { prompt } = req.body;
    
    if (!prompt) {
      res.status(400).json({
        error: 'Missing required field: prompt'
      });
      return;
    }
    
    logger.info('Testing Gemini API with prompt', { promptLength: prompt.length });
    
    // Get the AI service (should be Gemini based on config)
    const aiService = await AIServiceFactory.getService();
    
    // Generate content
    const result = await aiService.generateContent(prompt);
    
    // Return the raw result
    res.json({
      service: 'gemini',
      result
    });
  } catch (error: any) {
    logger.error('Gemini test error', { error: error.message, stack: error.stack });
    res.status(500).json({
      error: 'Gemini API error',
      message: error.message
    });
  }
}) as RequestHandler);

// Test endpoint for ingredient analysis
router.post('/test-ingredients', (async (req: Request, res: Response) => {
  try {
    const { ingredients } = req.body;
    
    if (!ingredients) {
      res.status(400).json({
        error: 'Missing required field: ingredients'
      });
      return;
    }
    
    // Load default templates if not already loaded
    promptManager.loadDefaultTemplates();
    
    // Format the prompt with ingredients
    const prompt = promptManager.format('ingredientsAnalysis', {
      ingredients: Array.isArray(ingredients) ? ingredients.join(', ') : ingredients
    });
    
    logger.info('Testing ingredient analysis', { ingredients });
    
    // Get the AI service
    const aiService = await AIServiceFactory.getService();
    
    // Generate content
    const result = await aiService.generateContent(prompt);
    
    // Parse the result
    const parsedResult = outputParser.parseAnalysisResult(result);
    
    // Return the parsed result
    res.json({
      service: 'gemini',
      rawResult: result,
      parsedResult
    });
  } catch (error: any) {
    logger.error('Ingredient analysis test error', { error: error.message, stack: error.stack });
    res.status(500).json({
      error: 'Ingredient analysis error',
      message: error.message
    });
  }
}) as RequestHandler);

export default router;