import express, { Request, Response, RequestHandler } from 'express';
import analysisService from '../services/analysisService';
import { logger } from '../utils/logger';
import { AnalysisResult } from '../utils/outputParser';
import { incrementCounter } from '../services/counterService';
import { imageProcessor } from '../services/imageProcessor';
import { performance } from 'perf_hooks';

const router = express.Router();

/**
 * Endpoint for analyzing ingredient text
 * POST /api/analyze/text
 */
router.post('/text', (async (req: Request, res: Response) => {
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
      res.status(400).json({
        error: 'MISSING_CONTENT',
        message: 'No ingredients or text provided for analysis'
      });
      return;
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
      
      res.status(400).json({
        error: 'INVALID_CONTENT_FORMAT',
        message: 'The provided ingredients or text has an invalid format'
      });
      return;
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
    
    res.json(result);
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
    res.status(500).json({
      error: 'ANALYSIS_ERROR',
      message: `An error occurred during analysis: ${error.message}`
    });
  }
}) as RequestHandler);

/**
 * Endpoint for analyzing images
 * POST /api/analyze/image
 */
router.post('/image', (async (req: Request, res: Response) => {
  const startTime = performance.now();
  const userId = req.body.userId || 'anonymous';
  
  try {
    const { image, preferredLanguage } = req.body;
    
    // Track image analysis request
    await incrementCounter(userId, 'image_analysis_requests');
    
    // Validate request content
    if (!image) {
      logger.warn('Missing image in analysis request', { userId });
      res.status(400).json({
        error: 'MISSING_IMAGE',
        message: 'No image provided for analysis'
      });
      return;
    }
    
    // Extract base64 data from image string (handle data URI format)
    let imageBase64: string;
    if (typeof image === 'string') {
      if (image.startsWith('data:image')) {
        imageBase64 = image.split(',')[1];
      } else {
        imageBase64 = image;
      }
    } else {
      logger.warn('Invalid image format in request', { userId });
      res.status(400).json({
        error: 'INVALID_IMAGE_FORMAT',
        message: 'The provided image has an invalid format'
      });
      return;
    }
    
    // Get image size for logging
    const initialSize = Math.ceil(imageBase64.length * 0.75); // Approximate size in bytes
    logger.info('Image analysis request received', { 
      userId,
      sizeKB: Math.round(initialSize / 1024),
      preferredLanguage
    });
    
    // Improved image processing for Gemini 2.5 Pro
    try {
      // For large images, use more aggressive compression to optimize for Gemini 2.5 Pro
      if (initialSize > 1024 * 1024 * 1) { // 1MB threshold (lowered from 2MB)
        logger.info('Compressing large image for Gemini 2.5 Pro', { originalSizeKB: Math.round(initialSize / 1024) });
        
        // Enhanced compression strategy optimized for Gemini 2.5 Pro's image processing capabilities
        imageBase64 = await imageProcessor.compressImage(imageBase64, {
          quality: 85,          // Optimized quality for Gemini 2.5 Pro
          width: 1200,          // Reduced from 1500 for better performance
          height: 1200          // Reduced from 1500 for better performance
        });
        
        const compressedSize = Math.ceil(imageBase64.length * 0.75);
        logger.info('Image optimized for Gemini 2.5 Pro', { 
          newSizeKB: Math.round(compressedSize / 1024),
          reductionPercent: Math.round((1 - compressedSize / initialSize) * 100)
        });
      }
    } catch (compressionError: any) {
      logger.warn('Image compression failed, continuing with original image', { 
        error: compressionError.message,
        errorType: compressionError.name
      });
      // Continue with original image if compression fails
    }
    
    // Analyze the image
    const result = await analysisService.analyzeImage(imageBase64, preferredLanguage);
    
    // Calculate processing time
    const processingTime = performance.now() - startTime;
    
    // Log analysis results
    logger.info('Image analysis completed', {
      userId,
      isVegan: result.isVegan,
      confidence: result.confidence,
      ingredientCount: result.ingredientList.length,
      nonVeganCount: result.nonVeganIngredients.length,
      processingTimeMs: Math.round(processingTime)
    });
    
    // Track analysis results
    if (result.isVegan === true) {
      await incrementCounter(userId, 'vegan_products_found');
    } else if (result.isVegan === false) {
      await incrementCounter(userId, 'non_vegan_products_found');
    } else {
      await incrementCounter(userId, 'uncertain_products_found');
    }
    
    // Track image quality metrics
    if (result.imageQualityIssues && result.imageQualityIssues.length > 0) {
      await incrementCounter(userId, 'low_quality_images');
      
      // Log quality issues for monitoring
      logger.info('Image quality issues detected', { 
        userId, 
        issues: result.imageQualityIssues
      });
    }
    
    res.json(result);
  } catch (error: any) {
    // Calculate processing time even for errors
    const processingTime = performance.now() - startTime;
    
    // Log error details
    logger.error('Error in image analysis endpoint', { 
      userId,
      error: error.message, 
      stack: error.stack,
      processingTimeMs: Math.round(processingTime)
    });
    
    // Track error
    await incrementCounter(userId, 'image_analysis_errors');
    
    // Provide appropriate error response
    res.status(500).json({
      error: 'IMAGE_ANALYSIS_ERROR',
      message: `An error occurred during image analysis: ${error.message}`
    });
  }
}) as RequestHandler);

/**
 * Endpoint for language detection test
 * POST /api/analyze/detect-language
 */
router.post('/detect-language', (async (req: Request, res: Response) => {
  try {
    const { text } = req.body;
    
    if (!text || typeof text !== 'string') {
      res.status(400).json({
        error: 'MISSING_TEXT',
        message: 'No text provided for language detection'
      });
      return;
    }
    
    // Import the language detector
    const languageDetector = await import('../utils/languageDetector').then(m => m.default);
    
    // Detect language and structure
    const language = languageDetector.detectLanguage(text);
    const isStructured = languageDetector.isStructuredIngredientList(text);
    const promptTemplate = languageDetector.selectPromptTemplate(text);
    
    res.json({
      language,
      isStructured,
      promptTemplate,
      text: text.substring(0, 100) + (text.length > 100 ? '...' : '')
    });
  } catch (error: any) {
    logger.error('Error in language detection endpoint', { error: error.message, stack: error.stack });
    res.status(500).json({
      error: 'DETECTION_ERROR',
      message: `An error occurred during language detection: ${error.message}`
    });
  }
}) as RequestHandler);

export default router; 