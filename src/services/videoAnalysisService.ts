import fs from 'fs';
import path from 'path';
import os from 'os';
import { VideoOptimizer } from '../utils/videoOptimizer';
import geminiService from './geminiService';
import { logger } from '../utils/logger';
import { v4 as uuidv4 } from 'uuid';
import { checkIngredientStatus } from '../utils/ingredientsDatabase';
import { z } from 'zod';
import {
  logVideoAnalysisRequest,
  logIngredientCorrection
} from '../utils/videoLogger';

// Import necessary types from @google/generative-ai
import { 
  FunctionDeclaration, 
  FunctionDeclarationsTool,
  SchemaType
} from '@google/generative-ai';

// Type definitions (borrowed from ../types/analysisTypes.ts)
interface IngredientAnalysisResult {
  name: string;
  isVegan: boolean;
  isUncertain?: boolean;
  confidence: number;
}

export interface VideoAnalysisResult {
  ingredients: IngredientAnalysisResult[];
  isVegan: boolean;
  isUncertain?: boolean;
  confidence: number;
  reasoning?: string;
  uncertainReasons?: string[];
  videoProcessed?: boolean;
  preferredLanguage?: string;
}

// -- Start: Define Zod Schema --
const ingredientAnalysisArgsSchema = z.object({
  product_status: z.enum(["sannolikt vegansk", "sannolikt icke-vegansk", "oklart"]),
  overall_confidence: z.number().min(0).max(1),
  ingredients: z.array(z.object({
    name: z.string().min(1, "Ingredient name cannot be empty (original language)"),
    translated_name: z.string().min(1, "Translated ingredient name cannot be empty"),
    status: z.enum(["vegansk", "icke-vegansk", "osäker"]),
    reasoning: z.string().optional(),
    confidence: z.number().min(0).max(1),
  })).min(0),
});
// -- End: Define Zod Schema --

// Definiera IngredientAnalysisArgs igen eftersom den behövs i koden
type IngredientAnalysisArgs = {
  product_status: "sannolikt vegansk" | "sannolikt icke-vegansk" | "oklart";
  overall_confidence: number;
  ingredients: {
    name: string;
    translated_name: string;
    status: "vegansk" | "icke-vegansk" | "osäker";
    reasoning?: string;
    confidence: number;
  }[];
};

// Interface för en ingrediens
export interface Ingredient {
  name: string;
  isVegan: boolean;
  isUncertain?: boolean;
}

/**
 * Service class to handle video analysis using Gemini
 * Manages temporary storage, optimization, and analysis of video files
 */
export class VideoAnalysisService {
  private readonly tempDir: string;
  private readonly videoOptimizer: VideoOptimizer;
  private readonly maxVideoSizeBytes: number = 20 * 1024 * 1024; // 20MB default max

  constructor() {
    // Create temp directory for video processing
    this.tempDir = path.join(os.tmpdir(), 'koalens-videos');
    if (!fs.existsSync(this.tempDir)) {
      fs.mkdirSync(this.tempDir, { recursive: true });
      logger.debug('Created temporary directory for video processing', { tempDir: this.tempDir });
    }
    
    this.videoOptimizer = new VideoOptimizer();
    
    // Check if ffmpeg is installed
    try {
      if (!this.videoOptimizer.isFfmpegInstalled()) {
        logger.error('ffmpeg is not installed or not detected!');
        throw new Error('ffmpeg is required for video processing but was not found.');
      }
    } catch (error: any) {
      logger.warn('Error checking ffmpeg installation', { error: error.message });
    }
    
    logger.info('VideoAnalysisService initialized', { 
      tempDir: this.tempDir, 
      maxVideoSizeBytes: this.maxVideoSizeBytes,
      ffmpegInstalled: this.videoOptimizer.isFfmpegInstalled()
    });
  }
  
  /**
   * Check if ffmpeg is installed and available for use
   * @returns boolean indicating if ffmpeg is available
   */
  isFfmpegInstalled(): boolean {
    return this.videoOptimizer.isFfmpegInstalled();
  }
  
  /**
   * Analyze a video to identify ingredients
   * @param base64Data Base64 encoded video data
   * @param mimeType MIME type of the video
   * @param preferredLanguage Preferred language for the response
   * @returns Analysis result with ingredients
   */
  async analyzeVideo(
    base64Data: string, 
    mimeType: string,
    preferredLanguage: string = 'en'
  ): Promise<VideoAnalysisResult> {
    logger.info('Video analysis request received', {
      dataSize: base64Data.length,
      mimeType,
      preferredLanguage,
      hasApiKey: !!process.env.GEMINI_API_KEY,
      model: process.env.GEMINI_MODEL || 'gemini-2.0-flash'
    });
    
    logVideoAnalysisRequest({
      mimeType,
      preferredLanguage,
      dataSize: base64Data.length
    });
    
    let tempVideoPath = '';
    let optimizedVideoPath = '';
    let useOriginalVideo = false;
    
    try {
      // Validate video data
      if (!base64Data || !mimeType.startsWith('video/')) {
        logger.error('Invalid video data or MIME type', { mimeType });
        throw new Error('Invalid video data or MIME type');
      }
      
      // Check API key availability
      if (!process.env.GEMINI_API_KEY) {
        logger.error('Missing GEMINI_API_KEY environment variable');
        throw new Error('Gemini API key is not configured. Video analysis is unavailable.');
      }
      
      // Check video size
      const videoSizeBytes = Buffer.from(base64Data, 'base64').length;
      if (videoSizeBytes > this.maxVideoSizeBytes * 4) { // 4x buffer because we can optimize
        logger.warn('Video size exceeds maximum allowed size', { 
          videoSizeBytes,
          maxVideoSizeBytes: this.maxVideoSizeBytes * 4
        });
        throw new Error(`Video size exceeds maximum allowed size (${Math.round(this.maxVideoSizeBytes * 4 / (1024 * 1024))}MB)`);
      }
      
      // Save video to temp file
      const videoId = uuidv4();
      tempVideoPath = path.join(this.tempDir, `${videoId}-original.${this.getFileExtension(mimeType)}`);
      const buffer = Buffer.from(base64Data, 'base64');
      
      try {
        fs.writeFileSync(tempVideoPath, buffer);
        logger.debug('Saved video to temporary file', { 
          tempVideoPath, 
          sizeBytes: buffer.length 
        });
      } catch (fsError) {
        logger.error('Failed to save video to temp file, using in-memory video instead', {
          error: fsError instanceof Error ? fsError.message : String(fsError),
          tempDir: this.tempDir
        });
        useOriginalVideo = true;
      }
      
      // Optimize video if possible and if we could save the temp file
      optimizedVideoPath = tempVideoPath;
      if (!useOriginalVideo) {
        try {
          logger.debug('Starting video optimization');
          if (!this.videoOptimizer.isFfmpegInstalled()) {
            logger.warn('FFMPEG not installed, skipping optimization and using original video');
            useOriginalVideo = true;
          } else {
            optimizedVideoPath = await this.videoOptimizer.optimize(
              tempVideoPath, 
              path.join(this.tempDir, `${videoId}-optimized.mp4`)
            );
            logger.debug('Video optimization completed', { 
              optimizedVideoPath,
              originalPath: tempVideoPath 
            });
          }
        } catch (error: any) {
          logger.error('Video optimization failed, will use original video', { 
            error: error.message 
          });
          useOriginalVideo = true;
          // Continue with original video
        }
      }
      
      // Get the video data for analysis - either optimized or original
      let videoForAnalysis: string;
      if (useOriginalVideo) {
        logger.info('Using original unoptimized video for analysis');
        videoForAnalysis = base64Data;
      } else {
        // Read the optimized video file
        try {
          const optimizedBuffer = fs.readFileSync(optimizedVideoPath);
          videoForAnalysis = optimizedBuffer.toString('base64');
        } catch (readError) {
          logger.error('Failed to read optimized video, falling back to original', {
            error: readError instanceof Error ? readError.message : String(readError)
          });
          videoForAnalysis = base64Data;
        }
      }
      
      logger.debug('Analysis metadata', {
        originalVideoFileSize: base64Data.length,
        tempVideoFileSize: fs.existsSync(tempVideoPath) ? fs.statSync(tempVideoPath).size : 0,
        optimizedVideoFileSize: fs.existsSync(optimizedVideoPath) ? fs.statSync(optimizedVideoPath).size : 0,
        originalMimeType: mimeType,
        tempFilePath: tempVideoPath,
        optimizedFilePath: optimizedVideoPath,
        optimizedFileCreated: !!optimizedVideoPath && optimizedVideoPath !== tempVideoPath && fs.existsSync(optimizedVideoPath),
        apiKeyConfigured: !!process.env.GEMINI_API_KEY,
        ffmpegInstalled: this.videoOptimizer.isFfmpegInstalled(),
        useOriginalVideo: useOriginalVideo
      });
      
      // Create a prompt for AI video analysis
      const prompt = this.buildAnalysisPrompt(preferredLanguage);
      
      // Replace the functionDeclarations creation code with a call to the new method
      const functionDeclarations = this.createFunctionDeclarations();
      
      try {
        // Generate content with Gemini using FunctionCalling
        logger.debug('Calling Gemini API for video analysis', { 
          promptLength: prompt.length,
          videoSize: videoForAnalysis.length,
          functionCallingEnabled: true 
        });
        
        const result = await geminiService.generateContentFromVideo(
          prompt,
          videoForAnalysis,
          mimeType,
          functionDeclarations
        );
        
        const response = result.response;
        const { functionCalls, firstFunctionCall } = this.safetyCheckFunctionCalls(response);
        
        if (!functionCalls || functionCalls.length === 0) {
          logger.warn('No function calls detected in Gemini response, falling back to simplified approach');
          
          // Fallback to text-based response
          const rawText = response.text();
          logger.debug('Falling back to text-based parsing', { 
            textResponseLength: rawText.length 
          });
          
          // Parse the raw text with regex
          const preliminaryResult = this.parseAnalysisResult(rawText);
          
          // Enhance the result with database checks
          return this.enhanceAnalysisResult(preliminaryResult);
        }
        
        // Process the function call
        const functionCall = firstFunctionCall; // Get the first function call
        
        // Safety check - ensure functionCall exists
        if (!functionCall) {
          logger.warn('Function calls array exists but first element is undefined');
          // Fallback to text-based response
          const rawText = response.text();
          const preliminaryResult = this.parseAnalysisResult(rawText);
          return this.enhanceAnalysisResult(preliminaryResult);
        }
        
        // Validate that it's the expected function
        if (functionCall.name !== 'recordIngredientAnalysis') {
          logger.warn('Unexpected function call name', { 
            expectedFunction: 'recordIngredientAnalysis',
            actualFunction: functionCall.name 
          });
          
          // NEW: Handle extractRecipeData function call as a fallback
          if (functionCall.name === 'extractRecipeData') {
            logger.info('Handling extractRecipeData function call as fallback', {
              functionName: functionCall.name
            });
            
            try {
              // Parse the function arguments
              const argsString = typeof functionCall.args === 'string' 
                ? functionCall.args 
                : JSON.stringify(functionCall.args);
                
              const args = JSON.parse(argsString) as unknown;
              
              // Extract ingredients from the extractRecipeData args
              if (args && typeof args === 'object' && 'ingredients' in args && Array.isArray(args.ingredients)) {
                logger.info('Successfully extracted ingredients from extractRecipeData', {
                  ingredientCount: args.ingredients.length
                });
                
                // Create preliminary result from extractRecipeData response
                const preliminaryResult = this.mapExtractRecipeDataToPreliminaryResult(args);
                
                // Enhance the result with database checks
                return this.enhanceAnalysisResult(preliminaryResult);
              } else {
                logger.error('Invalid extractRecipeData response format', { args });
                throw new Error('Invalid extractRecipeData response format');
              }
            } catch (parseError: any) {
              logger.error('Error parsing extractRecipeData function call', {
                error: parseError.message,
                args: functionCall.args
              });
              throw new Error('Failed to parse extractRecipeData: ' + parseError.message);
            }
          } else {
            // If not a recognized function, throw error
            throw new Error('Unexpected function call in AI response');
          }
        }
        
        try {
          // Parse the function arguments - handle as unknown first
          const argsString = typeof functionCall.args === 'string' 
            ? functionCall.args 
            : JSON.stringify(functionCall.args);
            
          const args = JSON.parse(argsString) as unknown;
          
          // Validate with Zod schema
          const validatedArgs = ingredientAnalysisArgsSchema.parse(args);
          
          // Convert from function call format to our internal format
          const preliminaryResult = this.mapFunctionArgsToPreliminaryResult(validatedArgs);
          
          // Enhance the result with database checks
          return this.enhanceAnalysisResult(preliminaryResult);
        } catch (parseError: any) {
          logger.error('Error parsing function call arguments', { 
            error: parseError.message,
            args: functionCall.args
          });
          
          // Fallback to text-based response if available
          if (response.text) {
            const rawText = response.text();
            const preliminaryResult = this.parseAnalysisResult(rawText);
            return this.enhanceAnalysisResult(preliminaryResult);
          }
          
          throw new Error('Failed to parse ingredient analysis result: ' + parseError.message);
        }
      } catch (aiError: any) {
        // If the error is related to video format, try a simpler approach
        logger.error('Error in primary video analysis approach', { 
          error: aiError.message
        });
        
        // Try fallback with simpler prompt if it's a specific type of error
        if (aiError.message.includes('too large') || 
            aiError.message.includes('unsupported') ||
            aiError.message.includes('model does not support')) {
          
          logger.info('Attempting simplified fallback approach');
          
          // Try to generate a simple analysis without function calling
          const fallbackPrompt = this.buildSimplifiedRetryPrompt();
          
          try {
            const fallbackResult = await geminiService.generateContentFromMedia(
              fallbackPrompt, 
              videoForAnalysis, 
              mimeType
            );
            
            const preliminaryResult = this.parseAnalysisResult(fallbackResult);
            return this.enhanceAnalysisResult(preliminaryResult);
          } catch (fallbackError: any) {
            logger.error('Fallback approach also failed', { 
              error: fallbackError.message 
            });
            throw new Error(`Video analysis failed: ${fallbackError.message}`);
          }
        }
        
        // Rethrow the original error with extra context
        throw new Error(`Gemini video analysis failed: ${aiError.message}`);
      }
    } catch (error: any) {
      // Log with detailed diagnostic information
      logger.error('Video analysis failed', { 
        error: error.message,
        stack: error.stack,
        mimeType,
        dataSize: base64Data.length,
        tempFileCreated: !!tempVideoPath && fs.existsSync(tempVideoPath),
        optimizedFileCreated: !!optimizedVideoPath && optimizedVideoPath !== tempVideoPath && fs.existsSync(optimizedVideoPath),
        apiKeyConfigured: !!process.env.GEMINI_API_KEY,
        ffmpegInstalled: this.videoOptimizer.isFfmpegInstalled()
      });
      
      throw error;
    } finally {
      // Clean up temporary files
      this.cleanupTempFiles(tempVideoPath, optimizedVideoPath);
    }
  }
  
  /**
   * Parse the AI's response and convert to a preliminary structured format
   * NO LONGER calls enhanceAnalysisResult
   * @param result Raw AI response text
   * @returns Preliminary analysis result
   */
  private parseAnalysisResult(result: string): VideoAnalysisResult {
    let parsedResult: any;
    let rawJsonResponse: string | null = null;

    try {
      // 1. Prioritize extracting JSON from ```json blocks
      const jsonBlockMatch = result.match(/```json\s*([\s\S]*?)\s*```/);
      if (jsonBlockMatch && jsonBlockMatch[1]) {
        rawJsonResponse = jsonBlockMatch[1].trim();
        try {
          parsedResult = JSON.parse(rawJsonResponse);
          logger.debug('Successfully parsed JSON from ```json block');
        } catch (jsonError: any) {
          logger.warn('Failed to parse JSON from ```json block, attempting direct parse', {
            error: jsonError.message,
            rawJson: rawJsonResponse
          });
          parsedResult = null;
        }
      }

      // 2. If no valid JSON from block, try parsing the first/largest standalone object
      if (!parsedResult) {
        const standaloneJsonMatch = result.match(/\{[\s\S]*\}/);
        if (standaloneJsonMatch && standaloneJsonMatch[0]) {
          rawJsonResponse = standaloneJsonMatch[0].trim();
          try {
            parsedResult = JSON.parse(rawJsonResponse);
            logger.debug('Successfully parsed JSON from standalone object');
          } catch (jsonError: any) {
            logger.warn('Failed to parse JSON from standalone object', {
              error: jsonError.message,
              rawJson: rawJsonResponse
            });
            parsedResult = null;
          }
        }
      }

      // 3. If direct JSON parsing failed, use regex as a last resort
      if (!parsedResult) {
        logger.warn('Direct JSON parsing failed for AI response. Falling back to regex extraction.', {
            fullResponse: result
        });
        parsedResult = this.extractIngredientsWithRegex(result);
      }

      // 4. NEW: Handle Gemini structured response with 'ingredientAnalysis' instead of 'ingredients'
      if (parsedResult && Array.isArray(parsedResult.ingredientAnalysis) && !Array.isArray(parsedResult.ingredients)) {
        logger.info('Detected Gemini format with ingredientAnalysis array, converting to expected format');
        
        // Map from Gemini's format to our expected format
        const ingredients = parsedResult.ingredientAnalysis.map((item: any) => {
          return {
            name: item.name || item.translated_name || "Unknown ingredient",
            isVegan: item.status === "vegansk",
            isUncertain: item.status === "osäker",
            confidence: item.confidence || 0.5,
            reasoning: item.reasoning || ""
          };
        });
        
        // Determine overall status
        let isVegan = parsedResult.overallStatus === "sannolikt vegansk";
        let isUncertain = parsedResult.overallStatus === "oklart";
        let confidence = parsedResult.overallConfidence || 0.5;
        
        // Create a new result object with the mapped data
        parsedResult = {
          ingredients: ingredients,
          isVegan: isVegan,
          isUncertain: isUncertain,
          confidence: confidence,
          reasoning: parsedResult.reasoning || `Produkt analyserad: ${parsedResult.overallStatus}`,
          uncertainReasons: []
        };
        
        logger.debug('Successfully converted Gemini format to expected structure', {
          ingredientCount: ingredients.length,
          isVegan: isVegan,
          confidence: confidence
        });
      }

      // Basic validation of the parsed structure - expanded validation
      if (!parsedResult) {
        throw new Error('No valid result structure found in AI response');
      }
      
      // Check if ingredients array exists, or create from available data
      if (!Array.isArray(parsedResult.ingredients)) {
        logger.warn('No ingredients array found in parsed result, attempting recovery');
        
        // Try to recover from other data structures
        if (Array.isArray(parsedResult.ingredientAnalysis)) {
          parsedResult.ingredients = parsedResult.ingredientAnalysis.map((item: any) => {
            return {
              name: item.name || "Unknown ingredient",
              isVegan: item.status === "vegansk" || (typeof item.isVegan === 'boolean' ? item.isVegan : false),
              isUncertain: item.status === "osäker",
              confidence: item.confidence || 0.5
            };
          });
        } else if (parsedResult.ingredients && typeof parsedResult.ingredients === 'string') {
          // Handle case where ingredients might be a comma-separated string
          parsedResult.ingredients = parsedResult.ingredients.split(/,\s*/).map((name: string) => {
            return { name, isVegan: true, confidence: 0.5 };
          });
        } else {
          // Last resort: create empty array
          parsedResult.ingredients = [];
          throw new Error('Could not recover ingredients data from parsed result');
        }
      }
      
      // Ensure confidence and isVegan exist at the top level (even if regex was used)
      if (typeof parsedResult.isVegan !== 'boolean') {
        if (parsedResult.overallStatus) {
          parsedResult.isVegan = parsedResult.overallStatus === "sannolikt vegansk";
        } else {
          parsedResult.isVegan = false; // Default to false if missing
        }
      }
      
      if (typeof parsedResult.confidence !== 'number') {
        parsedResult.confidence = parsedResult.overallConfidence || 0.5; // Default confidence if missing
      }

      // NOTE: We no longer call enhanceAnalysisResult here. 
      // The preliminary result will be enhanced later in analyzeVideo
      
      logger.info('Successfully parsed AI analysis text to preliminary result', {
        ingredientCount: parsedResult.ingredients.length,
        preliminaryIsVegan: parsedResult.isVegan, // May change after enhancement
        source: Array.isArray(parsedResult.ingredientAnalysis) ? 'gemini-direct-json' : 'standard-format'
      });

      // Return preliminary result
      return {
        ingredients: parsedResult.ingredients || [],
        isVegan: parsedResult.isVegan || false,
        isUncertain: parsedResult.isUncertain || false,
        confidence: parsedResult.confidence || 0.5,
        reasoning: parsedResult.reasoning || '',
        uncertainReasons: parsedResult.uncertainReasons || []
      };

    } catch (error: any) {
      logger.error('Fatal error processing AI analysis text result', {
          error: error.message,
          originalResponse: result
      });
      // Return a default empty result on fatal processing error
      return {
        ingredients: [],
        isVegan: false,
        isUncertain: false,
        confidence: 0,
        reasoning: 'Error processing analysis result',
        uncertainReasons: []
      };
    }
  }
  
  /**
   * Attempts to extract ingredient data using Regex as a fallback when JSON parsing fails.
   * @param text The raw AI response text.
   * @returns A preliminary parsed result object, potentially incomplete.
   */
  private extractIngredientsWithRegex(text: string): any {
    const result: any = {
      ingredients: [],
      isVegan: false, // Default
      confidence: 0.5 // Default
    };

    logger.debug('Attempting regex extraction from raw text', { textLength: text.length });

    // NEW: First try to find the Gemini format (ingredientAnalysis)
    const ingredientAnalysisMatch = text.match(/"ingredientAnalysis"\s*:\s*\[([\s\S]*?)\]/);
    if (ingredientAnalysisMatch && ingredientAnalysisMatch[1]) {
      logger.debug('Found ingredientAnalysis pattern in text');
      const ingredientObjectsText = ingredientAnalysisMatch[1];
      // Match individual { ... } objects within the array text
      const individualIngredientMatches = ingredientObjectsText.match(/\{[\s\S]*?\}/g);

      if (individualIngredientMatches) {
        const tempIngredients: any[] = [];
        individualIngredientMatches.forEach(ingredientText => {
          const nameMatch = ingredientText.match(/"name"\s*:\s*"([^"]*)"/);
          const translatedNameMatch = ingredientText.match(/"translated_name"\s*:\s*"([^"]*)"/);
          const statusMatch = ingredientText.match(/"status"\s*:\s*"([^"]*)"/);
          const confidenceMatch = ingredientText.match(/"confidence"\s*:\s*([0-9.]+)/);

          if ((nameMatch && nameMatch[1]) || (translatedNameMatch && translatedNameMatch[1])) {
            tempIngredients.push({
              name: (nameMatch && nameMatch[1]) || (translatedNameMatch && translatedNameMatch[1]) || "Unknown",
              isVegan: statusMatch ? statusMatch[1] === 'vegansk' : false,
              isUncertain: statusMatch ? statusMatch[1] === 'osäker' : true,
              confidence: confidenceMatch ? parseFloat(confidenceMatch[1]) : 0.5
            });
          }
        });

        if (tempIngredients.length > 0) {
          result.ingredients = tempIngredients;
          logger.debug(`Extracted ${tempIngredients.length} ingredients using Gemini format regex`);
        }
      }

      // Try to extract overall status
      const overallStatusMatch = text.match(/"overallStatus"\s*:\s*"([^"]*)"/);
      if (overallStatusMatch && overallStatusMatch[1]) {
        result.isVegan = overallStatusMatch[1] === 'sannolikt vegansk';
        result.isUncertain = overallStatusMatch[1] === 'oklart';
      }

      const overallConfidenceMatch = text.match(/"overallConfidence"\s*:\s*([0-9.]+)/);
      if (overallConfidenceMatch && !isNaN(parseFloat(overallConfidenceMatch[1]))) {
        result.confidence = parseFloat(overallConfidenceMatch[1]);
      }

      // If we found ingredients in Gemini format, return early
      if (result.ingredients.length > 0) {
        return result;
      }
    }

    // If Gemini format wasn't found, try regular ingredients array pattern
    const ingredientsMatch = text.match(/"ingredients"\s*:\s*\[([\s\S]*?)\]/);
    if (ingredientsMatch && ingredientsMatch[1]) {
      const ingredientObjectsText = ingredientsMatch[1];
      // Match individual { ... } objects within the array text
      const individualIngredientMatches = ingredientObjectsText.match(/\{[\s\S]*?\}/g);

      if (individualIngredientMatches) {
        individualIngredientMatches.forEach(ingredientText => {
          const nameMatch = ingredientText.match(/"name"\s*:\s*"([^"]*)"/);
          const isVeganMatch = ingredientText.match(/"isVegan"\s*:\s*(true|false)/);
          const confidenceMatch = ingredientText.match(/"confidence"\s*:\s*([0-9.]+)/);

          if (nameMatch && nameMatch[1]) {
            result.ingredients.push({
              name: nameMatch[1],
              isVegan: isVeganMatch ? isVeganMatch[1] === 'true' : false, // Default false if not found
              confidence: confidenceMatch ? parseFloat(confidenceMatch[1]) : 0.5 // Default 0.5
            });
          }
        });
      }
    } else {
        // Fallback: If no structured data found, try extracting from general text
        // (Using simplified logic from original extractIngredientsFromText)
        const items = text.split(/[,.;:\n()\/]+/);
        for (const item of items) {
            const trimmedItem = item.trim();
             if (trimmedItem.length > 2 && !/^\d+$/.test(trimmedItem) && !trimmedItem.toLowerCase().includes('ingredient')) {
                 const isVeganGuess = !(trimmedItem.toLowerCase().includes('mjölk') || 
                                        trimmedItem.toLowerCase().includes('ägg') || 
                                        trimmedItem.toLowerCase().includes('grädde') ||
                                        trimmedItem.toLowerCase().includes('ost'));
                 result.ingredients.push({
                    name: trimmedItem,
                    isVegan: isVeganGuess,
                    confidence: 0.3 // Lower confidence for this method
                 });
                 if (result.ingredients.length >= 20) break; // Limit
             }
        }
    }

    // Try extracting top-level isVegan and confidence
    const topLevelIsVeganMatch = text.match(/"isVegan"\s*:\s*(true|false)/);
    if (topLevelIsVeganMatch) {
      result.isVegan = topLevelIsVeganMatch[1] === 'true';
    }
    const topLevelConfidenceMatch = text.match(/"confidence"\s*:\s*([0-9.]+)/);
     if (topLevelConfidenceMatch && !isNaN(parseFloat(topLevelConfidenceMatch[1]))) {
      result.confidence = parseFloat(topLevelConfidenceMatch[1]);
    }

    logger.debug('Extracted data using regex fallback', {
        ingredientCount: result.ingredients.length,
        foundIsVegan: result.isVegan,
        foundConfidence: result.confidence
    });
    return result; // Return whatever was found, even if incomplete
  }
  
  /**
   * Determines the final vegan/uncertain status based on the processed ingredient list.
   * @param ingredients Array of ingredients with validated isVegan/isUncertain status.
   * @returns Object containing final isVegan, isUncertain, and uncertainReasons.
   */
  private _determineFinalStatusFromIngredients(ingredients: IngredientAnalysisResult[]): { 
    isVegan: boolean; 
    isUncertain: boolean; 
    uncertainReasons: string[] 
  } {
    let finalIsVegan = true;
    let finalIsUncertain = false;
    const uncertainReasons: string[] = [];

    // Process all ingredients to determine final status
    for (const ingredient of ingredients) {
      // If any ingredient is definitely non-vegan, the product is non-vegan
      if (!ingredient.isVegan && !ingredient.isUncertain) {
        finalIsVegan = false;
        finalIsUncertain = false;
        return { isVegan: false, isUncertain: false, uncertainReasons: [] };
      }
      
      // If any ingredient is uncertain, the product is uncertain (but continue checking for non-vegan)
      if (ingredient.isUncertain) {
        finalIsVegan = false;
        finalIsUncertain = true;
        const reason = `Ingrediensen "${ingredient.name}" har osäker vegansk status.`;
        if (!uncertainReasons.includes(reason)) {
          uncertainReasons.push(reason);
        }
      }
    }

    return { 
      isVegan: finalIsVegan, 
      isUncertain: finalIsUncertain, 
      uncertainReasons: uncertainReasons 
    };
  }
  
  /**
   * Enhances the preliminary AI result by validating against the database,
   * determining final vegan/uncertain status, and generating reasoning.
   * @param preliminaryResult The preliminary result object (from function call mapping or text parsing).
   * @returns The final, enhanced VideoAnalysisResult.
   */
  private enhanceAnalysisResult(preliminaryResult: VideoAnalysisResult): VideoAnalysisResult {
    logger.debug('Enhancing preliminary analysis result with database checks and final status determination.');
    
    // 1. Validate ingredients against database and update status/confidence
    for (const ingredient of preliminaryResult.ingredients) {
      if (!ingredient || !ingredient.name) {
        logger.warn('Skipping invalid ingredient during enhancement', { ingredient });
        continue;
      }

      const ingredientNameForLog = ingredient.name; // Capture name for logging
      // --- BEGIN DEBUG LOGGING --- 
      logger.debug(`[Enhance Step 1] Processing ingredient: "${ingredientNameForLog}"`, {
          initialIsVegan: ingredient.isVegan,
          initialIsUncertain: ingredient.isUncertain,
          initialConfidence: ingredient.confidence
      });
      // --- END DEBUG LOGGING --- 

      const originalIsVegan = ingredient.isVegan;
      const originalIsUncertain = ingredient.isUncertain || false;

      const dbStatus = checkIngredientStatus(ingredient.name);
      
      // --- BEGIN DEBUG LOGGING --- 
      logger.debug(`[Enhance Step 2] DB status for "${ingredientNameForLog}"`, { dbStatus });
      // --- END DEBUG LOGGING --- 

      if (dbStatus.isVegan === false) {
        // Definitely non-vegan according to database
        if (ingredient.isVegan !== false || ingredient.isUncertain === true) {
          logIngredientCorrection({
            ingredient: ingredient.name,
            originalStatus: originalIsVegan,
            originalIsUncertain: originalIsUncertain,
            correctedStatus: false,
            isUncertain: false,
            reason: `Database match (Non-Vegan): ${dbStatus.reason || 'Known non-vegan ingredient'}`,
            confidence: 0.99
          });
        }
        ingredient.isVegan = false;
        ingredient.isUncertain = false;
        ingredient.confidence = 0.99; // High confidence from DB
      } else if (dbStatus.isUncertain === true) {
        // Uncertain according to database
        if (ingredient.isUncertain !== true) {
          logIngredientCorrection({
            ingredient: ingredient.name,
            originalStatus: originalIsVegan,
            originalIsUncertain: originalIsUncertain,
            correctedStatus: false, // Uncertain treated as non-vegan
            isUncertain: true,
            reason: `Database match (Uncertain): ${dbStatus.reason || 'Known uncertain ingredient'}`,
            confidence: 0.5
          });
        }
        ingredient.isVegan = false; // Uncertain ingredients treated as non-vegan
        ingredient.isUncertain = true;
        ingredient.confidence = 0.5; // Medium confidence
      } else if (dbStatus.isVegan === true) {
        // Definitely vegan according to database
        if (ingredient.isVegan !== true || ingredient.isUncertain === true) {
          logIngredientCorrection({
            ingredient: ingredient.name,
            originalStatus: originalIsVegan,
            originalIsUncertain: originalIsUncertain,
            correctedStatus: true,
            isUncertain: false,
            reason: `Database match (Vegan): ${dbStatus.reason || 'Known vegan ingredient'}`,
            confidence: 0.98
          });
        }
        ingredient.isVegan = true;
        ingredient.isUncertain = false;
        ingredient.confidence = 0.98; // High confidence from DB
      }
      // If no database match, keep AI's assessment
      
      // --- BEGIN DEBUG LOGGING --- 
      logger.debug(`[Enhance Step 3] Final status for "${ingredientNameForLog}" after DB check`, {
          finalIsVegan: ingredient.isVegan,
          finalIsUncertain: ingredient.isUncertain,
          finalConfidence: ingredient.confidence
      });
      // --- END DEBUG LOGGING --- 
    }
    
    // 2. Process and deduplicate ingredients
    const processedNames = new Set<string>();
    const uniqueIngredients: IngredientAnalysisResult[] = [];

    for (const ingredient of preliminaryResult.ingredients) {
      if (ingredient && ingredient.name) {
        const normalizedName = ingredient.name.toLowerCase().trim();
        if (!processedNames.has(normalizedName)) {
          processedNames.add(normalizedName);
          uniqueIngredients.push({
            name: ingredient.name,
            isVegan: typeof ingredient.isVegan === 'boolean' ? ingredient.isVegan : false,
            confidence: typeof ingredient.confidence === 'number' ? ingredient.confidence : 0.5,
            isUncertain: typeof ingredient.isUncertain === 'boolean' ? ingredient.isUncertain : false
          });
        }
      }
    }
    
    preliminaryResult.ingredients = uniqueIngredients;
    
    // 3. Determine final product status based on ingredients
    const finalStatus = this._determineFinalStatusFromIngredients(preliminaryResult.ingredients);
    
    // 4. Generate reasoning text
    let finalReasoning = '';
    if (finalStatus.isVegan) {
      finalReasoning = 'Alla identifierade ingredienser är veganska baserat på databas och AI-analys.';
    } else if (finalStatus.isUncertain) {
      finalReasoning = 'Osäker vegansk status. ' + 
        (finalStatus.uncertainReasons.length ? 'Orsaker: ' + finalStatus.uncertainReasons.join('; ') : 'Innehåller ingredienser med osäker status.');
    } else {
      const nonVeganNames = preliminaryResult.ingredients
        .filter(i => i.isVegan === false && i.isUncertain !== true)
        .map(i => i.name)
        .join(', ');
      
      if (nonVeganNames) {
        finalReasoning = `Innehåller icke-veganska ingredienser: ${nonVeganNames}.`;
      } else {
        finalReasoning = 'Produkten bedöms inte vara vegansk, men specifik icke-vegansk ingrediens kunde inte fastställas.';
      }
    }

    // 5. Construct the final result object
    return {
      ingredients: preliminaryResult.ingredients,
      isVegan: finalStatus.isVegan,
      isUncertain: finalStatus.isUncertain,
      confidence: preliminaryResult.confidence, // Keep the original confidence from AI
      reasoning: finalReasoning,
      uncertainReasons: finalStatus.uncertainReasons.length > 0 ? finalStatus.uncertainReasons : undefined
    };
  }
  
  /**
   * Maps arguments from the recordIngredientAnalysis function call to a PRELIMINARY VideoAnalysisResult.
   * Uses the translated_name provided by the AI.
   * @param args The arguments object from the function call.
   * @returns A preliminary VideoAnalysisResult object.
   */
  private mapFunctionArgsToPreliminaryResult(args: IngredientAnalysisArgs): VideoAnalysisResult {
    logger.debug('Mapping function call args to preliminary result structure using translated names.');
    
    const mappedIngredients = args.ingredients.map(ing => {
      const isVeganIngredient = ing.status === 'vegansk';
      const isUncertainIngredient = ing.status === 'osäker';
      return {
        name: ing.translated_name, // Use the translated name from AI
        // originalName: ing.name, // Optional: Keep original name if needed elsewhere
        isVegan: isVeganIngredient,
        isUncertain: isUncertainIngredient,
        confidence: ing.confidence,
      };
    });

    // Collect reasoning for uncertain ingredients (using translated name for clarity)
    const uncertainReasons = args.ingredients
      .filter(ing => ing.status === 'osäker')
      .map(ing => `${ing.translated_name}: ${ing.reasoning || 'Okänd anledning'}`); // Lägg till fallback för saknat reasoning-fält

    // Return preliminary structure, status determined later by enhanceAnalysisResult
    return {
      ingredients: mappedIngredients,
      isVegan: args.product_status === 'sannolikt vegansk',
      isUncertain: args.product_status === 'oklart',
      confidence: args.overall_confidence,
      uncertainReasons: uncertainReasons,
      reasoning: `AI-bedömning: ${args.product_status}`
    };
  }
  
  /**
   * Maps arguments from the extractRecipeData function call to a PRELIMINARY VideoAnalysisResult.
   * @param args The arguments object from the extractRecipeData function call.
   * @returns A preliminary VideoAnalysisResult object.
   */
  private mapExtractRecipeDataToPreliminaryResult(args: any): VideoAnalysisResult {
    logger.debug('Mapping extractRecipeData response to preliminary result structure.');
    
    // Handle raw ingredient strings from extractRecipeData function
    const mappedIngredients = args.ingredients.map((ingredient: string) => {
      // Simple heuristic to determine if an ingredient is likely vegan
      const nonVeganIndicators = [
        'mjölk', 'milk', 'cream', 'grädde', 'ägg', 'egg', 'cheese', 'ost', 
        'honey', 'honung', 'meat', 'kött', 'beef', 'nöt', 'chicken', 'kyckling',
        'pork', 'fläsk', 'butter', 'smör', 'gelatin', 'fish', 'fisk'
      ];
      
      const containsNonVegan = nonVeganIndicators.some(indicator => 
        ingredient.toLowerCase().includes(indicator.toLowerCase())
      );
      
      // Check for common uncertain ingredients
      const uncertainIndicators = [
        'arom', 'flavor', 'e-number', 'e-nummer', 'emulgator', 'emulsifier',
        'färgämne', 'coloring', 'tillsats', 'additive'
      ];
      
      const isUncertain = uncertainIndicators.some(indicator => 
        ingredient.toLowerCase().includes(indicator.toLowerCase())
      );
      
      return {
        name: ingredient.trim(),
        isVegan: !containsNonVegan && !isUncertain,
        isUncertain: isUncertain,
        confidence: 0.6, // Lower confidence as this is based on heuristics
      };
    });

    // Use titles array if available to help determine overall vegan status
    let overallVeganStatus = true; // Default optimistic
    let confidence = 0.5;
    
    // If any ingredient is non-vegan, the product is non-vegan
    if (mappedIngredients.some((ing: IngredientAnalysisResult) => ing.isVegan === false && ing.isUncertain !== true)) {
      overallVeganStatus = false;
      confidence = 0.7;
    }
    // If only uncertain ingredients, mark as uncertain
    else if (mappedIngredients.some((ing: IngredientAnalysisResult) => ing.isUncertain === true)) {
      overallVeganStatus = false; // Not definitively vegan
      confidence = 0.5;
    }
    
    // Look for vegan indicators in titles if available
    if (args.titles && Array.isArray(args.titles) && args.titles.length > 0) {
      const veganIndicatorsInTitle = args.titles.some((title: string) => 
        title.toLowerCase().includes('vegan') || title.toLowerCase().includes('vegansk')
      );
      
      if (veganIndicatorsInTitle) {
        confidence = Math.min(confidence + 0.2, 0.9); // Boost confidence but cap at 0.9
      }
    }

    return {
      ingredients: mappedIngredients,
      isVegan: overallVeganStatus,
      isUncertain: mappedIngredients.some((ing: IngredientAnalysisResult) => ing.isUncertain === true),
      confidence: confidence,
      reasoning: 'Baserat på extraherade ingredienser från livsmedelsförpackningen',
      uncertainReasons: []
    };
  }
  
  /**
   * Builds the simplified prompt used for retry attempts
   */
  private buildSimplifiedRetryPrompt(): string {
    return `
Analysera denna matprodukt. Använd verktyget 'recordIngredientAnalysis' för att strukturera ditt svar.
Lista alla ingredienser du kan se på förpackningen. Översätt ingredienserna till svenska.
För varje ingrediens, ange status ('vegansk', 'icke-vegansk', 'osäker'). Ge en kort motivering ('reasoning').
Ange en konfidens (0.0-1.0).

Specifik Regel: 'Arom' utan specificerad källa ska klassas som 'osäker'.

Ange produktens övergripande status ('sannolikt vegansk', 'sannolikt icke-vegansk', 'oklart') och konfidens.
`;
  }
  
  /**
   * Build a prompt for the AI to analyze food product ingredients and translate them.
   * @param preferredLanguage The target language for translation (e.g., 'en', 'sv').
   */
  private buildAnalysisPrompt(preferredLanguage: string): string {
    // Ensure language code is lowercase for consistency if needed, though Gemini might handle various cases.
    const targetLanguage = preferredLanguage.toLowerCase(); 
    const languageName = targetLanguage === 'en' ? 'English' : 'Swedish'; // Simple mapping for prompt clarity

    // Updated prompt instructing AI to translate to preferredLanguage
    return `
Du är en expert på att analysera matprodukter och identifiera deras ingredienser för att avgöra om produkten är vegansk.

MÅLSPRÅK för översättning: ${languageName} (${targetLanguage})

INSTRUKTIONER:
1. Analysera videon NOGGRANT. Identifiera ingredienserna som tydligt VISAS på produktens förpackning.
2. Använd verktyget 'recordIngredientAnalysis' för att strukturera och returnera ditt svar.
3. För varje identifierad ingrediens:
   a. Ange ingrediensens **originalnamn** (som det står på förpackningen) i fältet 'name'.
   b. **Översätt originalnamnet till målspråket (${languageName})** och ange det i fältet 'translated_name'. Om du inte kan översätta, ange originalnamnet även i 'translated_name'.
   c. Ange dess status: 'vegansk', 'icke-vegansk', 'osäker'.
   d. SPECIFIK REGEL: Ingrediensen 'Arom' (eller motsvarande på andra språk) ska klassificeras som 'osäker' om dess ursprung inte specificeras.
   e. Ange en konfidenspoäng (0.0-1.0) för statusklassificeringen.
   f. VIKTIGT: För 'icke-vegansk' eller 'osäker' status, MÅSTE du ange en kort motivering ('reasoning').
4. Ange produktens övergripande status ('sannolikt vegansk', 'sannolikt icke-vegansk', 'oklart') och en övergripande konfidenspoäng.
5. Inkludera ALLA identifierade ingredienser, men lista varje unik ingrediens endast EN gång baserat på dess originalnamn.
6. Basera din analys ENDAST på vad som FAKTISKT SYNS i videon.

Använd verktyget 'recordIngredientAnalysis' för att returnera resultatet med både originalnamn ('name') och namn översatta till ${languageName} ('translated_name').
`;
  }
  
  /**
   * Get file extension based on MIME type
   */
  private getFileExtension(mimeType: string): string {
    const mimeToExt: Record<string, string> = {
      'video/mp4': 'mp4',
      'video/quicktime': 'mov',
      'video/x-msvideo': 'avi',
      'video/webm': 'webm',
      'video/3gpp': '3gp',
      'video/x-matroska': 'mkv'
    };
    
    return mimeToExt[mimeType] || 'mp4'; // Default to mp4
  }
  
  /**
   * Clean up temporary files
   */
  private cleanupTempFiles(...filePaths: string[]): void {
    for (const filePath of filePaths) {
      try {
        if (filePath && fs.existsSync(filePath)) {
          fs.unlinkSync(filePath);
          logger.debug('Cleaned up temporary file', { filePath });
        }
      } catch (error) {
        logger.warn('Failed to clean up temporary file', { filePath, error });
      }
    }
  }

  // Fixa funktionsdeklaration så att den returnerar rätt typ
  private createFunctionDeclarations(): FunctionDeclarationsTool[] {
    // Definiera ett korrekt funktionsdeklarationsobjekt som matchar förväntat format
    const extractRecipeFunction: FunctionDeclaration = {
      name: "extractRecipeData",
      description: "Extracts recipe ingredients, instructions, and title from video",
      parameters: {
        type: SchemaType.OBJECT,
        properties: {
          ingredients: {
            type: SchemaType.ARRAY,
            items: {
              type: SchemaType.STRING
            },
            description: "List of ingredients mentioned in the video"
          },
          instructions: {
            type: SchemaType.ARRAY,
            items: {
              type: SchemaType.STRING
            },
            description: "List of cooking instructions shown in the video"
          },
          titles: {
            type: SchemaType.ARRAY,
            items: {
              type: SchemaType.STRING
            },
            description: "Possible titles for this recipe based on the video content"
          }
        },
        required: ["ingredients", "instructions", "titles"]
      }
    };
    
    // Definiera även den ursprungliga funktionen vi hoppades använda
    const recordIngredientAnalysisFunction: FunctionDeclaration = {
      name: "recordIngredientAnalysis",
      description: "Records analysis of ingredients from a food product to determine vegan status",
      parameters: {
        type: SchemaType.OBJECT,
        properties: {
          product_status: {
            type: SchemaType.STRING,
            enum: ["sannolikt vegansk", "sannolikt icke-vegansk", "oklart"],
            description: "The overall vegan status of the product based on ingredient analysis",
            format: "enum"
          },
          overall_confidence: {
            type: SchemaType.NUMBER,
            description: "Confidence score (0.0-1.0) for the overall vegan status determination"
          },
          ingredients: {
            type: SchemaType.ARRAY,
            items: {
              type: SchemaType.OBJECT,
              properties: {
                name: {
                  type: SchemaType.STRING,
                  description: "Original ingredient name as shown on the packaging"
                },
                translated_name: {
                  type: SchemaType.STRING,
                  description: "Ingredient name translated to requested language"
                },
                status: {
                  type: SchemaType.STRING,
                  enum: ["vegansk", "icke-vegansk", "osäker"],
                  description: "Vegan status of the individual ingredient",
                  format: "enum"
                },
                reasoning: {
                  type: SchemaType.STRING,
                  description: "Reasoning for non-vegan or uncertain status"
                },
                confidence: {
                  type: SchemaType.NUMBER,
                  description: "Confidence score (0.0-1.0) for this ingredient's status"
                }
              },
              required: ["name", "translated_name", "status", "confidence"]
            },
            description: "List of ingredients with their vegan status analysis"
          }
        },
        required: ["product_status", "overall_confidence", "ingredients"]
      }
    };

    // Returnera en array med båda funktionsdeklarationerna
    return [
      {
        functionDeclarations: [recordIngredientAnalysisFunction, extractRecipeFunction]
      }
    ];
  }

  /**
   * Hjälpfunktion som säkerhetskontrollerar function calls
   */
  private safetyCheckFunctionCalls(response: any): { functionCalls: any[] | null; firstFunctionCall: any | null; functionCallName: string } {
    // Kontrollera om response.functionCalls är en funktion
    const hasFunctionCalls = response && 
                           typeof response.functionCalls === 'function';
    
    let functionCalls: any[] | null = null;
    let firstFunctionCall: any | null = null;
    let functionCallName = 'none';
    
    if (hasFunctionCalls) {
      try {
        functionCalls = response.functionCalls();
        if (Array.isArray(functionCalls) && functionCalls.length > 0) {
          firstFunctionCall = functionCalls[0];
          if (firstFunctionCall && typeof firstFunctionCall.name === 'string') {
            functionCallName = firstFunctionCall.name;
          }
        }
      } catch (error: any) {
        logger.warn('Error accessing function calls', { error: error.message });
      }
    }
    
    logger.debug('Received response from Gemini', { 
      hasFunctionCalls: !!functionCalls && functionCalls.length > 0,
      functionCallName
    });
    
    return { functionCalls, firstFunctionCall, functionCallName };
  }
}

// Export a singleton instance
const videoAnalysisService = new VideoAnalysisService();
export default videoAnalysisService; 