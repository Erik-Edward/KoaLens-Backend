import { Router, Request, Response, RequestHandler } from 'express';
import { logger } from '../utils/logger';
import videoAnalysisService from '../services/videoAnalysisService';
import { 
  ingredientTranslations
} from '../utils/ingredientsDatabase';

// Local type definition for request
interface MediaAnalysisRequest {
  base64Data: string;
  mimeType: string;
  preferredLanguage?: string;
  requestId?: string; // Added for deduplication
}

const router = Router();

// Request deduplication cache
const recentRequests = new Map<string, number>();
const DEDUPE_WINDOW_MS = 5000; // 5 second window for deduplication
const MAX_CACHE_SIZE = 100;

// Monitoring statistics for the API
const apiStats = {
  requestsReceived: 0,
  requestsProcessed: 0, 
  requestsFailed: 0,
  totalProcessingTimeMs: 0,
  averageProcessingTimeMs: 0,
  lastRequestTimestamp: new Date().toISOString(),
  duplicateRequestsBlocked: 0,
  ingredientCorrections: 0
};

/**
 * Clean up old request entries from the deduplication cache
 */
function cleanupOldRequests(): void {
  const now = Date.now();
  let removedCount = 0;
  
  // Remove old entries
  for (const [id, timestamp] of recentRequests.entries()) {
    if (now - timestamp > DEDUPE_WINDOW_MS) {
      recentRequests.delete(id);
      removedCount++;
    }
  }
  
  if (removedCount > 0) {
    logger.debug('Cleaned up deduplication cache', { 
      removedCount, 
      remainingCount: recentRequests.size 
    });
  }
}

/**
 * GET /api/video/stats
 * Get API usage statistics for monitoring
 */
router.get('/stats', (async (_req: Request, res: Response) => {
  try {
    // Check for admin authorization in production
    // TODO: Add proper auth mechanism
    
    // Return the current statistics
    res.status(200).json({
      success: true,
      stats: {
        ...apiStats,
        recentRequestsCount: recentRequests.size,
        uptime: process.uptime()
      }
    });
  } catch (error: any) {
    logger.error('Error retrieving API stats', { error });
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
}) as RequestHandler);

/**
 * POST /api/video/reset-stats
 * Reset API usage statistics (admin only)
 */
router.post('/reset-stats', (async (_req, res) => {
  try {
    // Check for admin authorization in production
    // TODO: Add proper auth mechanism
    
    // Reset statistics
    apiStats.requestsReceived = 0;
    apiStats.requestsProcessed = 0;
    apiStats.requestsFailed = 0;
    apiStats.totalProcessingTimeMs = 0;
    apiStats.averageProcessingTimeMs = 0;
    apiStats.lastRequestTimestamp = new Date().toISOString();
    apiStats.duplicateRequestsBlocked = 0;
    apiStats.ingredientCorrections = 0;
    
    // Clear request cache
    recentRequests.clear();
    
    res.status(200).json({
      success: true,
      message: 'Statistics reset successfully'
    });
  } catch (error: any) {
    logger.error('Error resetting API stats', { error });
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
}) as RequestHandler);

/**
 * Endpoint for analyzing a video to identify ingredients
 * POST /api/analyze-video
 * Body: {
 *   base64Data: string,   // Base64 encoded video data
 *   mimeType: string,     // MIME type of the video
 *   preferredLanguage?: string // Optional preferred language
 *   requestId?: string    // Optional client-generated request ID for deduplication
 * }
 */
router.post('/analyze-video', (async (req: Request, res: Response) => {
  const startTime = Date.now();
  
  // Update request statistics
  apiStats.requestsReceived++;
  apiStats.lastRequestTimestamp = new Date().toISOString();
  
  try {
    const { base64Data, mimeType, preferredLanguage, requestId } = req.body as MediaAnalysisRequest;
    
    // Validate required fields
    if (!base64Data) {
      apiStats.requestsFailed++;
      res.status(400).json({
        success: false,
        error: 'Missing required field: base64Data'
      });
      return;
    }
    
    if (!mimeType) {
      apiStats.requestsFailed++;
      res.status(400).json({
        success: false,
        error: 'Missing required field: mimeType'
      });
      return;
    }
    
    // Validate mimeType format
    if (!mimeType.startsWith('video/')) {
      apiStats.requestsFailed++;
      res.status(400).json({
        success: false,
        error: 'Invalid mimeType: Must be a video type (video/*)'
      });
      return;
    }
    
    // Check for duplicate requests if requestId is provided
    if (requestId) {
      const now = Date.now();
      
      if (recentRequests.has(requestId) && 
          now - recentRequests.get(requestId)! < DEDUPE_WINDOW_MS) {
        logger.warn('Detected duplicate request within dedupe window', { requestId });
        apiStats.duplicateRequestsBlocked++;
        res.status(429).json({
          success: false,
          error: 'Duplicate request, analysis already in progress',
          retryAfterMs: DEDUPE_WINDOW_MS - (now - recentRequests.get(requestId)!)
        });
        return;
      }
      
      // Store request ID with timestamp
      recentRequests.set(requestId, now);
      
      // Clean up old entries if cache is too large
      if (recentRequests.size > MAX_CACHE_SIZE) {
        cleanupOldRequests();
      }
    }
    
    logger.info('Video analysis request received', { 
      mimeType,
      preferredLanguage,
      dataSize: base64Data.length,
      requestId: requestId || 'not-provided'
    });
    
    // Process the video with VideoAnalysisService
    const result = await videoAnalysisService.analyzeVideo(
      base64Data,
      mimeType,
      preferredLanguage || 'sv' // Default to Swedish
    );
    
    const processingTime = (Date.now() - startTime) / 1000;
    logger.info('Video analysis completed', { 
      processingTimeSec: processingTime.toFixed(2),
      ingredientCount: result.ingredients.length,
      isVegan: result.isVegan,
      requestId: requestId || 'not-provided'
    });
    
    // Transform the result to match the expected frontend structure
    const transformedResult = {
      isVegan: result.isVegan,
      isUncertain: result.isUncertain || false,
      confidence: result.confidence,
      ingredientList: result.ingredients.map(ingredient => ingredient.name),
      watchedIngredients: result.ingredients
        .filter(ingredient => !ingredient.isVegan || ingredient.isUncertain) // Inkludera alla ingredienser som antingen inte är veganska eller osäkra
        .map(ingredient => ({
          name: ingredient.name,
          // Behåll 'reason' för bakåtkompatibilitet, men lägg också till 'status' för framtida användning
          reason: ingredient.isUncertain ? 'uncertain' : 'non-vegan',
          status: ingredient.isUncertain ? 'uncertain' : 'non-vegan',
          description: ingredient.isUncertain 
            ? `Ingrediensen "${ingredient.name}" kan vara vegansk eller icke-vegansk.`
            : `Ingrediensen "${ingredient.name}" är inte vegansk.`
        })),
      // Separata listor för osäkra och icke-veganska ingredienser
      nonVeganIngredients: result.ingredients
        .filter(ingredient => !ingredient.isVegan && !ingredient.isUncertain)
        .map(ingredient => ingredient.name),
      uncertainIngredients: result.ingredients
        .filter(ingredient => ingredient.isUncertain)
        .map(ingredient => ingredient.name),
      uncertainReasons: result.uncertainReasons || [],
      reasoning: result.reasoning || ''
    };
    
    // Remove the requestId from the deduplication cache after successful processing
    if (requestId) {
      recentRequests.delete(requestId);
    }
    
    // Update success statistics
    apiStats.requestsProcessed++;
    const processingTimeMs = Date.now() - startTime;
    apiStats.totalProcessingTimeMs += processingTimeMs;
    apiStats.averageProcessingTimeMs = apiStats.totalProcessingTimeMs / apiStats.requestsProcessed;
    
    // Return the analysis result in the format expected by the frontend
    res.status(200).json({
      success: true,
      responseData: transformedResult
    });
    
    // Log the full response for debugging
    logger.debug('Video analysis response sent to client', { 
      resultStructure: {
        isVegan: transformedResult.isVegan,
        confidence: transformedResult.confidence,
        ingredientCount: transformedResult.ingredientList?.length || 0,
        ingredientsList: transformedResult.ingredientList,
        watchedIngredients: transformedResult.watchedIngredients,
        responseSize: JSON.stringify(transformedResult).length,
        requestId: requestId || 'not-provided'
      }
    });
  } catch (error: any) {
    // Update error statistics
    apiStats.requestsFailed++;
    
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
    } else if (error.message.includes('duplicate')) {
      statusCode = 429; // Too Many Requests
    }
    
    res.status(statusCode).json({
      success: false,
      error: error.message
    });
  }
}) as RequestHandler);

/**
 * GET /api/video/ingredients 
 * Return the current ingredients database for monitoring
 */
router.get('/ingredients', (async (_req: Request, res: Response) => {
  try {
    // Return the current database
    res.status(200).json({
      success: true,
      data: {
        veganIngredients: [],
        nonVeganIngredients: [],
        translations: ingredientTranslations
      }
    });
  } catch (error: any) {
    logger.error('Error retrieving ingredients database', { error });
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
}) as RequestHandler);

/**
 * POST /api/video/ingredients/suggest
 * Suggest a new ingredient classification or update
 */
router.post('/ingredients/suggest', (async (req: Request, res: Response) => {
  try {
    const { ingredient, isVegan, suggestedBy } = req.body;
    
    if (!ingredient) {
      res.status(400).json({
        success: false,
        error: 'Missing required field: ingredient'
      });
      return;
    }
    
    if (typeof isVegan !== 'boolean') {
      res.status(400).json({
        success: false,
        error: 'Missing or invalid field: isVegan (must be boolean)'
      });
      return;
    }
    
    // Log the suggestion for later review
    logger.info('Ingredient classification suggestion received', {
      ingredient,
      isVegan,
      suggestedBy: suggestedBy || 'anonymous',
      timestamp: new Date().toISOString()
    });
    
    // In a production system, this would store the suggestion in a database
    // for review and eventual inclusion in the official lists
    
    res.status(200).json({
      success: true,
      message: 'Thank you for your suggestion. It will be reviewed by our team.'
    });
  } catch (error: any) {
    logger.error('Error processing ingredient suggestion', { error });
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
}) as RequestHandler);

export default router; 