import { Router, Request, Response } from 'express';
import analysisService from '../services/analysisService';
import { logger } from '../utils/logger';
import { AnalysisResult } from '../utils/outputParser';
import { incrementCounter } from '../services/counterService';

const router = Router();

/**
 * Endpoint for analyzing ingredient text
 * POST /api/analyze/text
 */
router.post('/text', async (req: Request, res: Response) => {
  const startTime = Date.now();
  const userId = req.body.userId || 'anonymous';
  
  try {
    const { ingredients, text } = req.body;
    
    // Track analysis request
    await incrementCounter(userId, 'text_analysis_requests');
    logger.info('Text analysis request received', { 
      userId,
      hasIngredients: !!ingredients,
      hasText: !!text,
      ingredientsLength: ingredients?.length || 0,
      textLength: text?.length || 0
    });
    
    // Validate request content
    if (!ingredients && !text) {
      logger.warn('Missing content in analysis request', { userId });
      return res.status(400).json({
        error: 'MISSING_CONTENT',
        message: 'No ingredients or text provided for analysis'
      });
    }
    
    let result: AnalysisResult;
    
    // Handle structured ingredients list
    if (ingredients && Array.isArray(ingredients)) {
      result = await analysisService.analyzeIngredients(ingredients);
    } 
    // Handle unstructured text
    else if (text && typeof text === 'string') {
      result = await analysisService.analyzeText(text);
    } 
    // Invalid request format
    else {
      logger.warn('Invalid content format in analysis request', { 
        userId,
        ingredientsType: ingredients ? typeof ingredients : 'undefined',
        textType: text ? typeof text : 'undefined'
      });
      
      return res.status(400).json({
        error: 'INVALID_CONTENT_FORMAT',
        message: 'The provided ingredients or text has an invalid format'
      });
    }
    
    // Calculate processing time
    const processingTime = Date.now() - startTime;
    
    // Log analysis results
    logger.info('Text analysis completed', {
      userId,
      isVegan: result.isVegan,
      confidence: result.confidence,
      ingredientCount: result.ingredientList.length,
      nonVeganCount: result.nonVeganIngredients.length,
      processingTime
    });
    
    // Track analysis results
    if (result.isVegan === true) {
      await incrementCounter(userId, 'vegan_products_found');
    } else if (result.isVegan === false) {
      await incrementCounter(userId, 'non_vegan_products_found');
    } else {
      await incrementCounter(userId, 'uncertain_products_found');
    }
    
    return res.json(result);
  } catch (error: any) {
    // Calculate processing time even for errors
    const processingTime = Date.now() - startTime;
    
    // Log error details
    logger.error('Error in text analysis endpoint', { 
      userId,
      error: error.message, 
      stack: error.stack,
      processingTime
    });
    
    // Track error
    await incrementCounter(userId, 'text_analysis_errors');
    
    // Provide appropriate error response
    return res.status(500).json({
      error: 'ANALYSIS_ERROR',
      message: `An error occurred during analysis: ${error.message}`
    });
  }
});

/**
 * Endpoint for language detection test
 * POST /api/analyze/detect-language
 */
router.post('/detect-language', async (req: Request, res: Response) => {
  try {
    const { text } = req.body;
    
    if (!text || typeof text !== 'string') {
      return res.status(400).json({
        error: 'MISSING_TEXT',
        message: 'No text provided for language detection'
      });
    }
    
    // Import the language detector
    const languageDetector = await import('../utils/languageDetector').then(m => m.default);
    
    // Detect language and structure
    const language = languageDetector.detectLanguage(text);
    const isStructured = languageDetector.isStructuredIngredientList(text);
    const promptTemplate = languageDetector.selectPromptTemplate(text);
    
    return res.json({
      language,
      isStructured,
      promptTemplate,
      text: text.substring(0, 100) + (text.length > 100 ? '...' : '')
    });
  } catch (error: any) {
    logger.error('Error in language detection endpoint', { error: error.message, stack: error.stack });
    return res.status(500).json({
      error: 'DETECTION_ERROR',
      message: `An error occurred during language detection: ${error.message}`
    });
  }
});

export default router; 