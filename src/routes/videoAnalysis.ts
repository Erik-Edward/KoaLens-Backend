import { Router, Request, Response, RequestHandler } from 'express';
import { logger } from '../utils/logger';
import videoAnalysisService from '../services/videoAnalysisService';

// Local type definition for request
interface MediaAnalysisRequest {
  base64Data: string;
  mimeType: string;
  preferredLanguage?: string;
}

const router = Router();

/**
 * Endpoint for analyzing a video to identify ingredients
 * POST /api/analyze-video
 * Body: {
 *   base64Data: string,   // Base64 encoded video data
 *   mimeType: string,     // MIME type of the video
 *   preferredLanguage?: string // Optional preferred language
 * }
 */
router.post('/analyze-video', (async (req: Request, res: Response) => {
  const startTime = Date.now();
  
  try {
    const { base64Data, mimeType, preferredLanguage } = req.body as MediaAnalysisRequest;
    
    // Validate required fields
    if (!base64Data) {
      res.status(400).json({
        success: false,
        error: 'Missing required field: base64Data'
      });
      return;
    }
    
    if (!mimeType) {
      res.status(400).json({
        success: false,
        error: 'Missing required field: mimeType'
      });
      return;
    }
    
    // Validate mimeType format
    if (!mimeType.startsWith('video/')) {
      res.status(400).json({
        success: false,
        error: 'Invalid mimeType: Must be a video type (video/*)'
      });
      return;
    }
    
    logger.info('Video analysis request received', { 
      mimeType,
      preferredLanguage,
      dataSize: base64Data.length
    });
    
    // Process the video with VideoAnalysisService
    const result = await videoAnalysisService.analyzeVideo(
      base64Data,
      mimeType,
      preferredLanguage
    );
    
    const processingTime = (Date.now() - startTime) / 1000;
    logger.info('Video analysis completed', { 
      processingTimeSec: processingTime.toFixed(2),
      ingredientCount: result.ingredients.length,
      isVegan: result.isVegan
    });
    
    // Transform the result to match the expected frontend structure
    const transformedResult = {
      isVegan: result.isVegan,
      confidence: result.confidence,
      ingredientList: result.ingredients.map(ingredient => ingredient.name),
      watchedIngredients: result.ingredients
        .filter(ingredient => !ingredient.isVegan)
        .map(ingredient => ({
          name: ingredient.name,
          reason: 'non-vegan',
          description: `The ingredient "${ingredient.name}" is not vegan.`
        })),
      // För debugging och för att följa eventuell svensk lokalisering
      reasoning: "",
      detectedLanguage: preferredLanguage || "sv"
    };
    
    // Log the original and transformed results for debugging
    logger.info('Video analysis transformation details', { 
      originalResult: {
        isVegan: result.isVegan,
        confidence: result.confidence,
        ingredientCount: result.ingredients.length,
        ingredients: result.ingredients
      },
      transformedResult: {
        isVegan: transformedResult.isVegan,
        confidence: transformedResult.confidence,
        ingredientCount: transformedResult.ingredientList.length,
        ingredientList: transformedResult.ingredientList,
        watchedIngredients: transformedResult.watchedIngredients
      }
    });
    
    // Return the analysis result in the expected frontend format
    res.status(200).json({
      success: true,
      result: transformedResult,
      processingTime
    });
    
    // Log the full response for debugging
    logger.debug('Video analysis response sent to client', { 
      resultStructure: {
        isVegan: transformedResult.isVegan,
        confidence: transformedResult.confidence,
        ingredientCount: transformedResult.ingredientList?.length || 0,
        ingredientsList: transformedResult.ingredientList,
        watchedIngredients: transformedResult.watchedIngredients,
        responseSize: JSON.stringify(transformedResult).length
      }
    });
  } catch (error: any) {
    // Handle errors
    logger.error('Video analysis error', { 
      error: error.message,
      stack: error.stack
    });
    
    // Determine appropriate status code based on error type
    let statusCode = 500;
    if (error.message.includes('size exceeds')) {
      statusCode = 413; // Payload Too Large
    } else if (error.message.includes('Invalid')) {
      statusCode = 400; // Bad Request
    }
    
    res.status(statusCode).json({
      success: false,
      error: error.message
    });
  }
}) as RequestHandler);

export default router; 