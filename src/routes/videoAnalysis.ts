import { Router, Request, Response, RequestHandler } from 'express';
import { logger } from '../utils/logger';
import { VideoAnalysisService } from '../services/videoAnalysisService';
import { checkIngredientStatus } from "../utils/ingredientsDatabase";
// import { checkUserLimit } from '../services/supabaseService'; // Removed unused import
// import { z } from 'zod'; // Removed unused import
import { VideoAnalysisResult, IngredientAnalysisResult } from '../types/analysisTypes'; // Re-added VideoAnalysisResult

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

const videoAnalysisService = new VideoAnalysisService();

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
 * Helper function to process video analysis requests
 * This is extracted to avoid code duplication between the endpoints
 */
async function processVideoAnalysisRequest(req: Request, res: Response): Promise<void> {
  const startTime = Date.now();
  
  // Ny loggning för att se exakt vad som kommer in i begäran
  logger.info('Video analysis request details', { 
    bodyKeys: req.body ? Object.keys(req.body) : [],
    bodySize: req.body ? JSON.stringify(req.body).length : 0,
    hasBase64Data: !!req.body?.base64Data,
    hasMimeType: !!req.body?.mimeType,
    headers: {
      accept: req.headers['accept'],
      'content-length': req.headers['content-length'],
      'content-type': req.headers['content-type'],
      'user-agent': req.headers['user-agent'],
    },
    ip: req.ip,
    method: req.method,
    url: req.originalUrl
  });
  
  // Update request statistics
  apiStats.requestsReceived++;
  apiStats.lastRequestTimestamp = new Date().toISOString();
  
  try {
    const { base64Data, mimeType, preferredLanguage, requestId } = req.body as MediaAnalysisRequest;
    
    // Validate required fields
    if (!base64Data) {
      logger.warn('Video analysis request missing base64Data field');
      apiStats.requestsFailed++;
      res.status(400).json({
        success: false,
        error: 'Missing required field: base64Data'
      });
      return;
    }
    
    if (!mimeType) {
      logger.warn('Video analysis request missing mimeType field');
      apiStats.requestsFailed++;
      res.status(400).json({
        success: false,
        error: 'Missing required field: mimeType'
      });
      return;
    }
    
    // Validate mimeType format
    if (!mimeType.startsWith('video/')) {
      logger.warn(`Invalid mimeType received: ${mimeType}`);
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
      requestId: requestId || 'not-provided',
      endpoint: req.originalUrl // Log which endpoint was used
    });
    
    // Process the video with VideoAnalysisService
    const result = await videoAnalysisService.analyzeVideo(
      base64Data,
      mimeType,
      preferredLanguage || 'sv' // Default to Swedish if not provided
    );
    
    const processingTime = (Date.now() - startTime) / 1000;
    logger.info('Video analysis completed by service', { 
      processingTimeSec: processingTime.toFixed(2),
      ingredientCount: result.ingredients.length,
      isVegan: result.isVegan,
      isUncertain: result.isUncertain,
      requestId: requestId || 'not-provided'
    });
    
    // Transform the result to the format expected by the frontend
    const transformedResult = {
      success: true,
      status: result.isVegan === null 
        ? (result.isUncertain ? 'uncertain' : 'unknown') 
        : (result.isVegan ? 'vegan' : 'non-vegan'),
      isVegan: result.isVegan,
      isUncertain: result.isUncertain,
      confidence: result.confidence,
      ingredientList: result.ingredients.map((ingredient: IngredientAnalysisResult) => ({
        name: ingredient.name,
        status: ingredient.isUncertain 
          ? 'uncertain' 
          : (ingredient.isVegan === null ? 'unknown' : (ingredient.isVegan ? 'vegan' : 'non-vegan')),
        statusColor: ingredient.isUncertain 
          ? '#FFBF00' 
          : (ingredient.isVegan === null ? 'grey' : (ingredient.isVegan ? '#90EE90' : '#FF6347')),
        description: ingredient.isUncertain 
          ? `Ingrediensen "${ingredient.name}" kan vara vegansk eller icke-vegansk.`
          : (ingredient.isVegan === null ? `Status okänd för "${ingredient.name}".` : (ingredient.isVegan ? `Ingrediensen "${ingredient.name}" är vegansk.` : `Ingrediensen "${ingredient.name}" är inte vegansk.`))
      })),
      // Format ingredients for frontend status display
      // This is the list that frontend uses for coloring and status display
      watchedIngredients: result.ingredients
        .filter((ingredient: IngredientAnalysisResult) => !ingredient.isVegan || ingredient.isUncertain) // Correct type: IngredientAnalysisResult
        .map((ingredient: IngredientAnalysisResult) => ({ // Correct type: IngredientAnalysisResult
          name: ingredient.name, 
          status: ingredient.isUncertain ? 'uncertain' : 'non-vegan',
          statusColor: ingredient.isUncertain ? '#FFBF00' : '#FF6347', // Orange/Yellow for uncertain, Red for non-vegan
          reason: ingredient.isUncertain ? 'Potentiellt icke-vegansk' : 'Icke-vegansk',
          description: ingredient.isUncertain 
            ? 'Denna ingrediens kan vara antingen växt- eller djurbaserad.'
            : 'Denna ingrediens är av animaliskt ursprung.'
        })),
      // Gruppera explicitt per status
      veganIngredients: result.ingredients
        .filter((ingredient: IngredientAnalysisResult) => ingredient.isVegan === true) // Correct type: IngredientAnalysisResult
        .map((ingredient: IngredientAnalysisResult) => ingredient.name), // Correct type: IngredientAnalysisResult
      nonVeganIngredients: result.ingredients
        .filter((ingredient: IngredientAnalysisResult) => ingredient.isVegan === false && !ingredient.isUncertain) // Correct type: IngredientAnalysisResult
        .map((ingredient: IngredientAnalysisResult) => ingredient.name), // Correct type: IngredientAnalysisResult
      uncertainIngredients: result.ingredients
        .filter((ingredient: IngredientAnalysisResult) => ingredient.isUncertain === true) // Correct type: IngredientAnalysisResult
        .map((ingredient: IngredientAnalysisResult) => ingredient.name), // Correct type: IngredientAnalysisResult
      // Lägg till information om problemingrediens som orsakar "Ej vegansk" status
      problemIngredient: result.ingredients.find((ingredient: IngredientAnalysisResult) => ingredient.isVegan === false && !ingredient.isUncertain)?.name || null, // Correct type: IngredientAnalysisResult
      uncertainReasons: result.uncertainReasons || [],
      reasoning: result.reasoning || '',
      // Add usage info if available
      usageInfo: result.usageInfo || {
        analysesUsed: 0,
        analysesLimit: 10, // Default limit if not available
        remaining: 10,      // Default remaining if not available
        isPremium: false   // Default premium status
      }
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
    
    // Logga exakt vilken respons som skickas till klienten
    logger.info('Sending analysis response to client', {
      responseData: JSON.stringify({
        success: true,
        result: transformedResult
      }),
      isVegan: transformedResult.isVegan,
      isUncertain: transformedResult.isUncertain,
      status: transformedResult.status,
      ingredientCount: transformedResult.ingredientList?.length || 0,
      veganCount: transformedResult.veganIngredients?.length || 0,
      nonVeganCount: transformedResult.nonVeganIngredients?.length || 0, 
      uncertainCount: transformedResult.uncertainIngredients?.length || 0,
      problemIngredient: transformedResult.problemIngredient,
      confidence: transformedResult.confidence
    });
    
    // Return the analysis result in the format expected by the frontend
    res.status(200).json({
      success: true,
      result: transformedResult
    });
  } catch (error: any) {
    logger.error('Error processing video analysis', { 
      error: error.message,
      stack: error.stack,
      endpoint: req.originalUrl
    });
    
    apiStats.requestsFailed++;
    
    // Send a user-friendly error response
    res.status(500).json({
      success: false,
      error: 'Video analysis failed',
      message: error.message || 'Unknown error'
    });
  }
}

/**
 * POST /video/analyze-video
 * Main endpoint for analyzing a video
 * Request Body: {
 *   base64Data: string, // Required, base64-encoded video data
 *   mimeType: string,   // Required, must be 'video/*' format
 *   preferredLanguage?: string // Optional preferred language
 *   requestId?: string    // Optional client-generated request ID for deduplication
 * }
 */
router.post('/analyze-video', (async (req: Request, res: Response) => {
  // Set CORS headers to ensure mobile app can access this endpoint
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization');
  
  logger.info('Request received at /video/analyze-video endpoint', {
    originalUrl: req.originalUrl,
    baseUrl: req.baseUrl,
    path: req.path,
    method: req.method,
    contentType: req.headers['content-type'],
    contentLength: req.headers['content-length'],
    hasBody: !!req.body,
    bodyKeys: req.body ? Object.keys(req.body) : [],
    hasBase64Data: !!req.body?.base64Data,
    hasMimeType: !!req.body?.mimeType
  });
  
  await processVideoAnalysisRequest(req, res);
}) as RequestHandler);

/**
 * OPTIONS /video/analyze-video
 * Handle preflight CORS requests for the analyze-video endpoint
 */
router.options('/analyze-video', ((_req: Request, res: Response) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization');
  res.sendStatus(200);
}) as RequestHandler);

/**
 * POST /video/debug-video-api
 * Diagnostic endpoint to check if the video API is working
 * and provide detailed feedback on request issues
 */
router.post('/debug-video-api', (async (req: Request, res: Response) => {
  logger.info('Debug endpoint called', {
    url: req.originalUrl,
    method: req.method,
    contentType: req.headers['content-type'],
    bodyKeys: Object.keys(req.body || {}),
  });
  
  // Set CORS headers
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization');
  
  try {
    // Check if API key is configured
    const hasGeminiKey = !!process.env.GEMINI_API_KEY;
    
    // Check FFmpeg availability via videoAnalysisService
    const ffmpegStatus = videoAnalysisService.isFfmpegInstalled();
    
    // Validate request body
    const validationResults = {
      hasBase64Data: !!req.body?.base64Data,
      hasMimeType: !!req.body?.mimeType,
      isValidMimeType: req.body?.mimeType?.startsWith('video/'),
      dataFormat: typeof req.body?.base64Data,
      dataSize: req.body?.base64Data ? req.body.base64Data.length : 0,
      bodyContentType: req.headers['content-type'],
    };
    
    const isValidRequest = validationResults.hasBase64Data && 
                           validationResults.hasMimeType &&
                           validationResults.isValidMimeType;
    
    // Return comprehensive debug information
    res.status(200).json({
      success: true,
      apiStatus: {
        endpoint: req.originalUrl,
        geminiApiConfigured: hasGeminiKey,
        ffmpegInstalled: ffmpegStatus,
        environment: process.env.NODE_ENV || 'development',
        enableTestRoutes: process.env.ENABLE_TEST_ROUTES === 'true',
        timestamp: new Date().toISOString()
      },
      requestValidation: validationResults,
      isValidRequest: isValidRequest,
      apiStats: {
        requestsReceived: apiStats.requestsReceived,
        requestsProcessed: apiStats.requestsProcessed,
        requestsFailed: apiStats.requestsFailed,
        averageProcessingTimeMs: apiStats.averageProcessingTimeMs
      },
      message: isValidRequest 
        ? "Request format is valid. If you're experiencing issues, try the /video/analyze-video endpoint."
        : "Request format is invalid. Please check the validation results.",
      correctFormat: {
        endpoint: "/api/video/analyze-video",
        contentType: "application/json",
        method: "POST",
        bodyFormat: {
          base64Data: "BASE64_ENCODED_VIDEO_DATA",
          mimeType: "video/mp4", // or another valid video MIME type
          preferredLanguage: "sv" // optional
        }
      }
    });
  } catch (error: any) {
    logger.error('Error in debug endpoint', { error });
    res.status(500).json({
      success: false,
      error: error.message,
      stack: process.env.NODE_ENV === 'production' ? undefined : error.stack
    });
  }
}) as RequestHandler);

/**
 * GET /api/video/ingredients 
 * Return the current ingredients database for monitoring
 */
router.get('/ingredients', (async (_req: Request, res: Response) => {
  try {
    // Return the current database structure (without actual translations data)
    // We keep the structure for potential monitoring tools that might expect it
    // but avoid loading/sending potentially large translation data unnecessarily.
    res.status(200).json({
      success: true,
      data: {
        // Placeholder arrays, actual data loaded elsewhere when needed
        veganIngredients: [], 
        nonVeganIngredients: [],
        translations: {} // Return empty object instead of removed variable
      }
    });
  } catch (error: any) {
    logger.error('Error retrieving ingredients database structure', { error });
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

/**
 * Test endpoint to check E304 directly - for debugging
 */
router.get("/test-e304", (_req: Request, res: Response) => {
  try {
    const ingredientName = "E304";
    const status = checkIngredientStatus(ingredientName);
    
    // Also try lowercase
    const lowercaseStatus = checkIngredientStatus(ingredientName.toLowerCase());
    
    const response = {
      message: "E304 check completed, see logs for details",
      e304Result: status,
      e304LowercaseResult: lowercaseStatus,
      comparison: {
        original: ingredientName,
        lowercase: ingredientName.toLowerCase(),
        areEqual: status === lowercaseStatus
      }
    };
    
    logger.info("E304 Test:", response);
    
    res.status(200).json(response);
  } catch (error) {
    logger.error("Error testing E304:", error);
    res.status(500).json({ error: "Internal server error testing E304" });
  }
});

/**
 * Test endpoint to simulate a full analysis flow and return the transformed result
 */
router.get('/test-full-analysis', async (_req: Request, res: Response) => {
  const startTime = Date.now();
  logger.info('Running full analysis test endpoint');
  try {
    // Mock data - In a real scenario, this might be more complex or fetched
    const mockAnalysisResult: VideoAnalysisResult = {
      ingredients: [
        { name: 'Majs', isVegan: true, isUncertain: false, confidence: 0.9 },
        { name: 'Mjölk', isVegan: false, isUncertain: false, confidence: 0.99 },
        { name: 'E304', isVegan: null, isUncertain: true, confidence: 0.7 },
        { name: 'Vatten', isVegan: true, isUncertain: false, confidence: 1.0 }
      ],
      isVegan: null, // Overall status derived from ingredients
      isUncertain: true, // Overall status derived from ingredients
      confidence: 0.65, 
      reasoning: 'Produkten innehåller både icke-veganska (Mjölk) och osäkra (E304) ingredienser.',
      uncertainReasons: ['Innehåller E304 som kan ha animaliskt ursprung.'],
      videoProcessed: true,
      preferredLanguage: 'sv',
      usageInfo: { // Add mock usage info
        analysesUsed: 5,
        analysesLimit: 100,
        remaining: 95,
        isPremium: false
      }
    };

    // Simulate calling analyzeVideo (we use mock data directly here for simplicity)
    const result = mockAnalysisResult; 

    const processingTime = (Date.now() - startTime) / 1000;
    logger.info('Mock analysis data generated', { 
      processingTimeSec: processingTime.toFixed(2),
      ingredientCount: result.ingredients.length
    });

    // --- Apply the SAME transformation logic as in processVideoAnalysisRequest ---
    const transformedResult = {
      success: true,
      status: result.isVegan === null 
        ? (result.isUncertain ? 'uncertain' : 'unknown') 
        : (result.isVegan ? 'vegan' : 'non-vegan'),
      isVegan: result.isVegan,
      isUncertain: result.isUncertain,
      confidence: result.confidence,
      ingredientList: result.ingredients.map((ingredient: IngredientAnalysisResult) => ({
        name: ingredient.name,
        status: ingredient.isUncertain 
          ? 'uncertain' 
          : (ingredient.isVegan === null ? 'unknown' : (ingredient.isVegan ? 'vegan' : 'non-vegan')),
        statusColor: ingredient.isUncertain 
          ? '#FFBF00' 
          : (ingredient.isVegan === null ? 'grey' : (ingredient.isVegan ? '#90EE90' : '#FF6347')),
        description: ingredient.isUncertain 
          ? `Ingrediensen "${ingredient.name}" kan vara vegansk eller icke-vegansk.`
          : (ingredient.isVegan === null ? `Status okänd för "${ingredient.name}".` : (ingredient.isVegan ? `Ingrediensen "${ingredient.name}" är vegansk.` : `Ingrediensen "${ingredient.name}" är inte vegansk.`))
      })),
      watchedIngredients: result.ingredients
        .filter((ingredient: IngredientAnalysisResult) => !ingredient.isVegan || ingredient.isUncertain) 
        .map((ingredient: IngredientAnalysisResult) => ({ 
          name: ingredient.name, 
          status: ingredient.isUncertain ? 'uncertain' : 'non-vegan',
          statusColor: ingredient.isUncertain ? '#FFBF00' : '#FF6347', 
          reason: ingredient.isUncertain ? 'Potentiellt icke-vegansk' : 'Icke-vegansk',
          description: ingredient.isUncertain 
            ? 'Denna ingrediens kan vara antingen växt- eller djurbaserad.'
            : 'Denna ingrediens är av animaliskt ursprung.'
        })),
      veganIngredients: result.ingredients
        .filter((ingredient: IngredientAnalysisResult) => ingredient.isVegan === true) 
        .map((ingredient: IngredientAnalysisResult) => ingredient.name), 
      nonVeganIngredients: result.ingredients
        .filter((ingredient: IngredientAnalysisResult) => ingredient.isVegan === false && !ingredient.isUncertain) 
        .map((ingredient: IngredientAnalysisResult) => ingredient.name), 
      uncertainIngredients: result.ingredients
        .filter((ingredient: IngredientAnalysisResult) => ingredient.isUncertain === true) 
        .map((ingredient: IngredientAnalysisResult) => ingredient.name), 
      problemIngredient: result.ingredients.find((ingredient: IngredientAnalysisResult) => ingredient.isVegan === false && !ingredient.isUncertain)?.name || null, 
      uncertainReasons: result.uncertainReasons || [],
      reasoning: result.reasoning || '',
      usageInfo: result.usageInfo || { // Fallback usage info
        analysesUsed: 0,
        analysesLimit: 10, 
        remaining: 10,      
        isPremium: false   
      }
    };
    // --- End transformation logic ---

    logger.info('Sending test analysis response', { transformedResult });
    res.status(200).json(transformedResult); // Return the transformed result directly

  } catch (error: any) {
    logger.error('Error in test-full-analysis endpoint', { error });
    res.status(500).json({
      success: false,
      error: 'Test analysis failed',
      message: error.message || 'Unknown error'
    });
  }
});

export default router; 