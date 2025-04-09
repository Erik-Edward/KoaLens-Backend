import { Router, Request, Response } from 'express';
// import multer from 'multer'; // Removed unused/missing module
// import path from 'path'; // Removed unused module
// import { fileFromDataUrl } from '../utils/fileUtils'; // Removed unused/missing module
import { VideoAnalysisService } from '../services/videoAnalysisService'; // Keep named import
import { logger } from '../utils/logger';
import { checkIngredientStatus } from '../utils/ingredientsDatabase';
// import { ensureAuthenticated } from '../middleware/authMiddleware'; // Removed unused/missing module
// import { logScreenAccess } from '../utils/analytics'; // Removed unused/missing module

// Define the type locally instead of importing
type IngredientStatus = "vegansk" | "icke-vegansk" | "osäker";
type ProductStatus = "sannolikt vegansk" | "sannolikt icke-vegansk" | "oklart";

// Define the IngredientAnalysisArgs type locally
interface IngredientAnalysisArgs {
  product_status: ProductStatus;
  overall_confidence: number;
  ingredients: {
    name: string;
    translated_name: string;
    status: IngredientStatus;
    reasoning?: string;
    confidence: number;
  }[];
  usageInfo?: {
    analysesUsed: number;
    analysesLimit: number;
    remaining: number;
    isPremium?: boolean;
  };
}

const router = Router();
// Instantiate the service
const videoAnalysisService = new VideoAnalysisService(); 

// Add a custom test endpoint to check ingredient status handling
router.get('/test-ingredients', async (req: Request, res: Response) => { // Remove unused 'req' parameter later if not needed
  try {
    const ingredientsList = req.query.ingredients 
      ? (req.query.ingredients as string).split(',') 
      : ['majs', 'e304', 'soja'];
    
    logger.info(`Testing ingredients status handling for: ${ingredientsList.join(', ')}`);
    
    // Create a test analysis result with the provided ingredients
    const testResults = ingredientsList.map(ingredient => {
      const status = checkIngredientStatus(ingredient);
      
      return {
        name: ingredient,
        originalStatus: status.isVegan,
        isUncertain: status.isUncertain,
        matchedItem: status.matchedItem,
        reason: status.reason
      };
    });
    
    // Test running the mapper function from videoAnalysisService
    const testArgs: IngredientAnalysisArgs = {
      product_status: "oklart",
      overall_confidence: 0.7,
      ingredients: ingredientsList.map(ing => ({
        name: ing,
        translated_name: ing,
        status: ing.toLowerCase() === 'mjölk' || ing.toLowerCase() === 'milk' ? 'icke-vegansk' : 
                ing.toLowerCase() === 'e304' ? 'osäker' : 'vegansk',
        reasoning: ing.toLowerCase() === 'mjölk' || ing.toLowerCase() === 'milk' ? 'Mjölkprodukt' : 
                   ing.toLowerCase() === 'e304' ? 'Kan vara växt- eller djurbaserad' : '',
        confidence: 0.8
      })),
      usageInfo: {
        analysesUsed: 0,
        analysesLimit: 10,
        remaining: 10,
        isPremium: false
      }
    };
    
    // Use private method through a workaround (this is for testing only)
    const videoServiceAny = videoAnalysisService as any;
    const prelimResult = videoServiceAny.mapFunctionArgsToPreliminaryResult(testArgs);
    const enhancedResult = videoServiceAny.enhanceAnalysisResult(prelimResult);
    
    res.json({
      success: true,
      message: 'Ingredients status test completed',
      testResults,
      prelimResult,
      enhancedResult,
      ingredientTypes: {
        originalTypes: {
          isVegan: typeof prelimResult.isVegan,
          ingredient_isVegan: typeof prelimResult.ingredients[0]?.isVegan // Add safe navigation
        },
        enhancedTypes: {
          isVegan: typeof enhancedResult.isVegan,
          ingredient_isVegan: typeof enhancedResult.ingredients[0]?.isVegan // Add safe navigation
        }
      }
    });
  } catch (error: any) {
    logger.error('Error in test-ingredients endpoint', { error: error.message });
    res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  }
}); 

// Add a second test specifically for E304
router.get('/test-e304', (_req, res) => { // Use _req as it's unused
  try {
    const e304Status = checkIngredientStatus('E304');
    logger.info('E304 check completed', { status: e304Status });
    
    res.json({
      success: true,
      message: 'E304 check completed, see logs for details',
      e304Result: {
        isVegan: e304Status.isVegan,
        isUncertain: e304Status.isUncertain,
        reason: e304Status.reason
      }
    });
  } catch (error) {
    logger.error('E304 test error', { error });
    res.status(500).json({ success: false, error: 'E304 test error' });
  }
});

export default router; 