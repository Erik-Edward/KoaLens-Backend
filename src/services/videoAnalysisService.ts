import fs from 'fs';
import path from 'path';
import os from 'os';
import { VideoOptimizer } from '../utils/videoOptimizer';
import geminiService from './geminiService';
import { logger } from '../utils/logger';
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
  uncertainIngredients: string[];
  nonVeganIngredients: string[];
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

// Module-level variable to track first analysis run
let _isFirstRun = true;

/**
 * Helper function to track first analysis run
 * Uses module-level variable to avoid state maintained in instance
 */
function isFirstAnalysisRun(): boolean {
  if (_isFirstRun) {
    _isFirstRun = false;
    return true;
  }
  return false;
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
    preferredLanguage: string = 'sv'
  ): Promise<VideoAnalysisResult> {
    const startTime = Date.now();
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
      
      // OPTIMIZATION: Check video size and recommend smaller size if too large
      const videoSizeBytes = Buffer.from(base64Data, 'base64').length;
      const videoSizeMB = videoSizeBytes / (1024 * 1024);
      if (videoSizeBytes > this.maxVideoSizeBytes * 4) { // 4x buffer because we can optimize
        logger.warn('Video size exceeds maximum allowed size', { 
          videoSizeBytes,
          maxVideoSizeBytes: this.maxVideoSizeBytes * 4
        });
        throw new Error(`Video size exceeds maximum allowed size (${Math.round(this.maxVideoSizeBytes * 4 / (1024 * 1024))}MB)`);
      } else if (videoSizeMB > 10) {
        // If video is large but acceptable, log recommendation for future optimization
        logger.warn('Video is large, future optimizations should reduce size for faster processing', {
          videoSizeMB: Math.round(videoSizeMB * 10) / 10
        });
      }
      
      // PERFORMANCE: Skip heavy optimization for smaller videos
      const isSmallVideo = videoSizeMB < 6; // Skip optimization for videos under 6MB (tidigare 3MB)
      if (isSmallVideo) {
        logger.info('Skipping optimization for small video', { videoSizeMB });
        useOriginalVideo = true;
      }
      
      // OPTIMIZATION: Use a more efficient ID generation for better performance
      const videoId = Date.now().toString(36) + Math.random().toString(36).substring(2, 7);
      tempVideoPath = path.join(this.tempDir, `${videoId}-original.${this.getFileExtension(mimeType)}`);
      const buffer = Buffer.from(base64Data, 'base64');
      
      // OPTIMIZATION: Fire-and-forget file cleanup after 30 minutes to handle edge cases
      setTimeout(() => {
        try {
          this.cleanupTempFiles(tempVideoPath, optimizedVideoPath);
        } catch (e) {
          // Ignore errors in delayed cleanup
        }
      }, 30 * 60 * 1000);
      
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
      
      // OPTIMIZATION: Process in parallel - start with original and optimize in background
      let videoOptimizationPromise: Promise<string> | null = null;
      
      // Start video optimization in parallel if needed (non-small videos)
      if (!useOriginalVideo && !isSmallVideo) {
        // OPTIMIZATION: Aggressively optimize video if size is larger than 5MB
        let targetResolution = '360p'; // Default modest resolution
        if (videoSizeMB > 5) {
          targetResolution = '240p'; // More aggressive for larger videos
          logger.info('Using aggressive video optimization for large video', { videoSizeMB, targetResolution });
        }
        
        // Start optimization in background
        videoOptimizationPromise = (async () => {
          try {
            if (!this.videoOptimizer.isFfmpegInstalled()) {
              logger.warn('FFMPEG not installed, skipping optimization and using original video');
              return base64Data;
            }
            
            logger.debug('Starting video optimization in background');
            
            // Välj optimeringsmetod baserat på filstorlek
            let optimizedPath;
            
            // Använd snabb optimering för mellanstor video (6-20MB)
            if (videoSizeMB > 6 && videoSizeMB <= 20) {
              logger.info('Using FAST optimization method for medium video', { videoSizeMB });
              optimizedPath = await this.videoOptimizer.optimizeFast(
                tempVideoPath, 
                path.join(this.tempDir, `${videoId}-optimized-fast.mp4`)
              );
            } else {
              // Standard optimering för stora videos (>20MB)
              optimizedPath = await this.videoOptimizer.optimize(
                tempVideoPath, 
                path.join(this.tempDir, `${videoId}-optimized.mp4`)
              );
            }
            
            optimizedVideoPath = optimizedPath;
            
            // Log compression ratio
            try {
              const optimizedStats = fs.statSync(optimizedPath);
              const originalStats = fs.statSync(tempVideoPath);
              const compressionRatio = (originalStats.size / optimizedStats.size).toFixed(2);
              const originalSizeMB = (originalStats.size / (1024 * 1024)).toFixed(2);
              const optimizedSizeMB = (optimizedStats.size / (1024 * 1024)).toFixed(2);
              
              logger.info('Video optimization completed', { 
                compressionRatio,
                originalSizeMB,
                optimizedSizeMB
              });
            } catch (statError) {
              logger.debug('Could not calculate compression stats', { 
                error: statError instanceof Error ? statError.message : String(statError)
              });
            }
            
            // Read and return the optimized video in base64
            try {
              const optimizedBuffer = fs.readFileSync(optimizedPath);
              return optimizedBuffer.toString('base64');
            } catch (readError) {
              logger.error('Failed to read optimized video, falling back to original', {
                error: readError instanceof Error ? readError.message : String(readError)
              });
              return base64Data;
            }
          } catch (error: any) {
            logger.error('Video optimization failed, will use original video', { 
              error: error.message 
            });
            return base64Data;
          }
        })();
      }
      
      // While optimization is running in background, prepare prompt and other data
      
      // OPTIMIZATION: Use different prompts based on video size for better performance
      const prompt = videoSizeMB > 8
        ? this.buildCompactAnalysisPrompt(preferredLanguage) // More compact prompt for larger videos
        : this.buildAnalysisPrompt();      // Standard detailed prompt
      
      // Create function declarations for Gemini
      const functionDeclarations = this.createFunctionDeclarations();
      
      // Determine which video to use - use race condition to process as early as possible
      let videoForAnalysis: string;
      
      if (useOriginalVideo || isSmallVideo) {
        videoForAnalysis = base64Data;
        logger.info('Using original video for analysis (skipped optimization)', { 
          useOriginalVideo,
          isSmallVideo
        });
      } else {
        // Wait for the optimization to complete or timeout
        try {
          // Set a timeout to ensure we don't wait too long for optimization
          const timeoutPromise = new Promise<string>((resolve) => {
            setTimeout(() => {
              logger.warn('Video optimization timed out, using original video');
              resolve(base64Data);
            }, 8000); // 8 second timeout (tidigare 10 sekunder)
          });
          
          // Race between optimization and timeout
          videoForAnalysis = await Promise.race([
            videoOptimizationPromise as Promise<string>,
            timeoutPromise
          ]);
        } catch (error) {
          logger.warn('Error waiting for video optimization, using original video', {
            error: error instanceof Error ? error.message : String(error)
          });
          videoForAnalysis = base64Data;
        }
      }
      
      try {
        // PERFORMANCE: Log processing time at key stages
        const beforeGeminiTime = Date.now();
        
        // Generate content with Gemini using FunctionCalling
        logger.debug('Calling Gemini API for video analysis', { 
          promptLength: prompt.length,
          videoSize: videoForAnalysis.length,
          functionCallingEnabled: true,
          elapsedMsBeforeGeminiCall: beforeGeminiTime - startTime
        });
        
        const result = await geminiService.generateContentFromVideo(
          prompt,
          videoForAnalysis,
          mimeType,
          functionDeclarations
        );
        
        const afterGeminiTime = Date.now();
        logger.info('Gemini API call completed', { 
          geminiApiCallMs: afterGeminiTime - beforeGeminiTime,
          totalElapsedMs: afterGeminiTime - startTime
        });
        
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
          
          // PERFORMANCE: Track finishing stats
          const processingTimeMs = Date.now() - startTime;
          logger.info('Video analysis completed (text-based fallback)', { 
            processingTimeMs,
            ingredientCount: preliminaryResult.ingredients.length
          });
          
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
          let validatedArgs: IngredientAnalysisArgs;
          try {
            validatedArgs = ingredientAnalysisArgsSchema.parse(args);
            
            // *** ÄNDRA TILL INFO FÖR ATT SÄKERSTÄLLA SYNLIGHET I FLY.IO LOGGAR ***
            logger.info('Raw validated AI function call arguments (validatedArgs):', JSON.stringify(validatedArgs, null, 2)); 
            // ******************************************************
          } catch (validationError) {
            logger.error('Error parsing function call arguments', { 
              error: validationError.message,
              args: functionCall.args
            });
            
            // Fallback to text-based response if available
            if (response.text) {
              const rawText = response.text();
              const preliminaryResult = this.parseAnalysisResult(rawText);
              return this.enhanceAnalysisResult(preliminaryResult);
            }
            
            throw new Error('Failed to parse ingredient analysis result: ' + validationError.message);
          }
          
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
        // Log the error with performance data
        const processingTimeMs = Date.now() - startTime;
        logger.error('Error in primary video analysis approach', { 
          error: aiError.message,
          processingTimeMs
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
      // PERF: Clean up temporary files asynchronously
      if (tempVideoPath || optimizedVideoPath) {
        setTimeout(() => {
          this.cleanupTempFiles(tempVideoPath, optimizedVideoPath);
        }, 100); // Small delay to not block the response
      }
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

      // 4. Handle Gemini structured response with 'ingredientAnalysis' instead of 'ingredients'
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
        
        // Determine overall status - DEFAULT TO UNCERTAIN INSTEAD OF NON-VEGAN
        let isVegan = parsedResult.overallStatus === "sannolikt vegansk";
        // Change default behavior: uncertain instead of non-vegan
        let isUncertain = parsedResult.overallStatus === "oklart" || !parsedResult.overallStatus;
        let confidence = parsedResult.overallConfidence || 0.5;
        
        // Create a new result object with the mapped data
        parsedResult = {
          ingredients: ingredients,
          isVegan: isVegan,
          isUncertain: isUncertain,
          confidence: confidence,
          reasoning: parsedResult.reasoning || `Produkt analyserad: ${parsedResult.overallStatus || 'oklar status'}`,
          uncertainReasons: []
        };
        
        logger.debug('Successfully converted Gemini format to expected structure', {
          ingredientCount: ingredients.length,
          isVegan: isVegan,
          confidence: confidence
        });
      }

      // 5. Final safety checks for required properties
      // Check if ingredients exist and set default if needed
      if (!parsedResult || !parsedResult.ingredients || !Array.isArray(parsedResult.ingredients)) {
        logger.warn('No valid ingredients found in the result, setting empty array');
        parsedResult = parsedResult || {};
        parsedResult.ingredients = [];
      }

      // Make sure isVegan, isUncertain and confidence have valid values
      if (typeof parsedResult.isVegan !== 'boolean') {
        // If there are ingredients that are clearly non-vegan, set isVegan to false
        const hasNonVeganIngredients = parsedResult.ingredients.some((i: IngredientAnalysisResult) => i.isVegan === false && i.isUncertain !== true);
        
        if (hasNonVeganIngredients) {
          parsedResult.isVegan = false;
          logger.info('Setting isVegan=false based on ingredient analysis (first-run protection)');
        } else {
          // IMPORTANT: For first-run, default to uncertain rather than non-vegan
          parsedResult.isVegan = false; // Still false but we'll set isUncertain to true
          parsedResult.isUncertain = true;
          logger.info('First-run protection: Setting isUncertain=true instead of immediate non-vegan default');
        }
      }

      // If isUncertain isn't specified but we have uncertain ingredients, set it
      if (typeof parsedResult.isUncertain !== 'boolean') {
        const hasUncertainIngredients = parsedResult.ingredients.some((i: IngredientAnalysisResult) => i.isUncertain === true);
        parsedResult.isUncertain = hasUncertainIngredients;
      }

      if (typeof parsedResult.confidence !== 'number') {
        parsedResult.confidence = parsedResult.overallConfidence || 0.5; // Default confidence if missing
      }

      // NOTE: We no longer call enhanceAnalysisResult here. 
      // The preliminary result will be enhanced later in analyzeVideo
      
      logger.info('Successfully parsed AI analysis text to preliminary result', {
        ingredientCount: parsedResult.ingredients.length,
        preliminaryIsVegan: parsedResult.isVegan, // May change after enhancement
        isUncertainSet: parsedResult.isUncertain === true, // Log whether uncertain was set
        source: Array.isArray(parsedResult.ingredientAnalysis) ? 'gemini-direct-json' : 'standard-format'
      });

      // Return preliminary result
      return {
        ingredients: parsedResult.ingredients || [],
        isVegan: parsedResult.isVegan || false,
        isUncertain: parsedResult.isUncertain || false,
        confidence: parsedResult.confidence || 0.5,
        reasoning: parsedResult.reasoning || '',
        uncertainReasons: parsedResult.uncertainReasons || [],
        videoProcessed: true,
        preferredLanguage: 'sv',
        uncertainIngredients: [],
        nonVeganIngredients: []
      };

    } catch (error: any) {
      logger.error('Fatal error processing AI analysis text result', {
          error: error.message,
          originalResponse: result
      });
      // Return a default empty result on fatal processing error - SET UNCERTAIN TO TRUE
      return {
        ingredients: [],
        isVegan: false,
        isUncertain: true, // CHANGE: Default to uncertain on error
        confidence: 0, 
        reasoning: 'Kunde inte bearbeta analysresultatet. Osäker på produktens veganska status.',
        uncertainReasons: ['Tekniskt fel vid analys'],
        videoProcessed: true,
        preferredLanguage: 'sv',
        uncertainIngredients: [],
        nonVeganIngredients: []
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
   * Enhances the preliminary AI result by validating against the database,
   * determining final vegan/uncertain status, and generating reasoning.
   * @param preliminaryResult The preliminary result object (from function call mapping or text parsing).
   * @returns The final, enhanced VideoAnalysisResult.
   */
  private enhanceAnalysisResult(preliminaryResult: VideoAnalysisResult): VideoAnalysisResult {
    logger.debug('Enhancing preliminary analysis result with database checks and final status determination.');
    
    // NEW: Track system state to identify first-time run
    const isFirstTimeRun = isFirstAnalysisRun();
    if (isFirstTimeRun) {
      logger.info('FIRST-TIME RUN DETECTED: Applying special handling for first analysis');
    }
    
    // Track uncertain and non-vegan ingredients throughout the process
    const nonVeganIngredients: string[] = [...(preliminaryResult.nonVeganIngredients || [])];
    const uncertainIngredients: string[] = [...(preliminaryResult.uncertainIngredients || [])];
    
    // 1. Validate ingredients against database and update status/confidence
    for (const ingredient of preliminaryResult.ingredients) {
      // --- BEGIN DEBUG LOGGING --- 
      const ingredientNameForLog = ingredient.name.substring(0, 40) + (ingredient.name.length > 40 ? '...' : '');
      logger.debug(`[Enhance Step 1] Processing ingredient "${ingredientNameForLog}"`, {
          originalIsVegan: ingredient.isVegan,
          originalIsUncertain: ingredient.isUncertain,
          originalConfidence: ingredient.confidence
      });
      // --- END DEBUG LOGGING --- 

      // Preserve original status for logging
      const originalIsVegan = ingredient.isVegan;
      const originalIsUncertain = ingredient.isUncertain;
      
      // Check against database
      const dbStatus = checkIngredientStatus(ingredient.name);
      
      // --- BEGIN DEBUG LOGGING --- 
      const dbStatusString = dbStatus.isVegan === null 
          ? 'unknown' 
          : dbStatus.isVegan 
              ? 'vegan' 
              : 'non-vegan';
              
      logger.debug(`[Enhance Step 2] DB check result for "${ingredientNameForLog}"`, {
          dbStatus: dbStatusString,
          dbIsUncertain: dbStatus.isUncertain,
          dbReason: dbStatus.reason || ''
      });
      // --- END DEBUG LOGGING --- 

      // Update ingredient status based on database - Fix: check for matchedItem instead of match
      if (dbStatus.matchedItem) {
        if (dbStatus.isVegan === false) {
          // Definitely non-vegan according to database
          if (ingredient.isVegan !== false || ingredient.isUncertain === true) {
            logIngredientCorrection({
              ingredient: ingredient.name,
              originalStatus: originalIsVegan,
              originalIsUncertain: originalIsUncertain,
              correctedStatus: false,
              isUncertain: false,
              reason: `Database match (Non-vegan): ${dbStatus.reason || 'Known non-vegan ingredient'}`,
              confidence: 0.98
            });
          }
          ingredient.isVegan = false;
          ingredient.isUncertain = false;
          ingredient.confidence = 0.98; // High confidence from DB
          
          // Add to nonVeganIngredients if not already there
          if (!nonVeganIngredients.includes(ingredient.name)) {
            nonVeganIngredients.push(ingredient.name);
          }
          // Remove from uncertainIngredients if it was there
          const uncertainIndex = uncertainIngredients.indexOf(ingredient.name);
          if (uncertainIndex !== -1) {
            uncertainIngredients.splice(uncertainIndex, 1);
          }
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
          
          // Remove from both arrays if present
          const nonVeganIndex = nonVeganIngredients.indexOf(ingredient.name);
          if (nonVeganIndex !== -1) {
            nonVeganIngredients.splice(nonVeganIndex, 1);
          }
          const uncertainIndex = uncertainIngredients.indexOf(ingredient.name);
          if (uncertainIndex !== -1) {
            uncertainIngredients.splice(uncertainIndex, 1);
          }
        } else if (dbStatus.isUncertain) {
          // Uncertain according to database
          if (!ingredient.isUncertain) {
            logIngredientCorrection({
              ingredient: ingredient.name,
              originalStatus: originalIsVegan,
              originalIsUncertain: originalIsUncertain,
              correctedStatus: false,
              isUncertain: true,
              reason: `Database match (Uncertain): ${dbStatus.reason || 'Uncertain vegan status'}`,
              confidence: 0.5
            });
          }
          ingredient.isVegan = false;
          ingredient.isUncertain = true;
          ingredient.confidence = 0.5; // Lower confidence for uncertain
          
          // Add to uncertainIngredients if not already there
          if (!uncertainIngredients.includes(ingredient.name)) {
            uncertainIngredients.push(ingredient.name);
          }
          // Remove from nonVeganIngredients if it was there
          const nonVeganIndex = nonVeganIngredients.indexOf(ingredient.name);
          if (nonVeganIndex !== -1) {
            nonVeganIngredients.splice(nonVeganIndex, 1);
          }
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
    }
    
    // 2. Determine overall product vegan status based on ingredient analysis
    let finalIsVegan = true;
    let finalIsUncertain = false;
    const finalUncertainReasons: string[] = [];
    
    // Check if any ingredient is non-vegan but not uncertain
    const hasNonVegan = preliminaryResult.ingredients.some(ing => ing.isVegan === false && ing.isUncertain === false);
    
    // Check if any ingredient is uncertain about status
    const hasUncertainIngredient = preliminaryResult.ingredients.some(ing => ing.isUncertain === true);
    
    if (hasNonVegan) {
      // Definitely not vegan
      finalIsVegan = false;
      finalIsUncertain = false;
    } else if (hasUncertainIngredient) {
      // Uncertain
      finalIsVegan = false;
      finalIsUncertain = true;
      finalUncertainReasons.push('Osäker vegansk status på grund av ingredienser som kan vara icke-veganska.');
    }
    
    // 3. Collect detailed reasoning for improved explainability
    const uncertainOrNonVeganIngredients = preliminaryResult.ingredients.filter(ing => 
      ing.isVegan === false || ing.isUncertain === true
    );
    
    // Ensure we have uncertainReasons to start with
    if (preliminaryResult.uncertainReasons && preliminaryResult.uncertainReasons.length > 0) {
      finalUncertainReasons.push(...preliminaryResult.uncertainReasons);
    }
    
    // Build final reasoning based on status
    let finalReasoning = "";
    if (finalIsVegan) {
      finalReasoning = "Produkten bedöms vara vegansk. Alla ingredienser verkar vara av växtbaserat ursprung.";
    } else if (finalIsUncertain) {
      // Find the uncertain ingredients and list them
      const uncertainNames = uncertainOrNonVeganIngredients
        .filter(ing => ing.isUncertain)
        .map(ing => ing.name);
      
      finalReasoning = "Osäker vegansk status. ";
      
      if (uncertainNames.length > 0) {
        finalReasoning += `Följande ingredienser har osäker status: ${uncertainNames.join(', ')}. `;
      }
      
      if (finalUncertainReasons.length > 0) {
        finalReasoning += finalUncertainReasons.join(' ');
      }
    } else {
      // Non-vegan - list the problematic ingredients
      const nonVeganNames = uncertainOrNonVeganIngredients
        .filter(ing => !ing.isVegan && !ing.isUncertain)
        .map(ing => ing.name);
      
      finalReasoning = `Produkten är inte vegansk. `;
      
      if (nonVeganNames.length > 0) {
        finalReasoning += `Innehåller icke-veganska ingredienser: ${nonVeganNames.join(', ')}.`;
      } else {
        finalReasoning += "Innehåller animaliska ämnen.";
      }
    }
    
    // Calculate an overall confidence score based on the uncertainties
    const confidenceFactor = hasUncertainIngredient ? 0.7 : 0.9;
    const avgIngredientConfidence = preliminaryResult.ingredients.reduce(
      (sum, ing) => sum + ing.confidence, 0
    ) / preliminaryResult.ingredients.length;
    
    const finalConfidence = Math.min(
      0.95, // Cap at 0.95 to avoid overconfidence
      avgIngredientConfidence * confidenceFactor
    );
    
    // Ensure final status has proper structure
    const finalStatus = {
      isVegan: finalIsVegan,
      isUncertain: finalIsUncertain,
      confidence: finalConfidence,
      uncertainReasons: finalUncertainReasons,
      // Include the explicit lists
      nonVeganIngredients: nonVeganIngredients,
      uncertainIngredients: uncertainIngredients
    };
    
    logger.info('Enhanced analysis result complete', {
      originalIsVegan: preliminaryResult.isVegan,
      originalIsUncertain: preliminaryResult.isUncertain || false,
      finalIsVegan: finalStatus.isVegan,
      finalIsUncertain: finalStatus.isUncertain,
      ingredientCount: preliminaryResult.ingredients.length,
      nonVeganCount: nonVeganIngredients.length,
      uncertainCount: uncertainIngredients.length,
      finalConfidence: finalStatus.confidence.toFixed(2)
    });
    
    return {
      ingredients: preliminaryResult.ingredients,
      isVegan: finalStatus.isVegan,
      isUncertain: finalStatus.isUncertain,
      confidence: finalStatus.confidence,
      reasoning: finalReasoning,
      uncertainReasons: finalStatus.uncertainReasons.length > 0 ? finalStatus.uncertainReasons : undefined,
      videoProcessed: true,
      preferredLanguage: 'sv',
      uncertainIngredients: finalStatus.uncertainIngredients,
      nonVeganIngredients: finalStatus.nonVeganIngredients
    };
  }
  
  /**
   * Maps arguments from the recordIngredientAnalysis function call to a PRELIMINARY VideoAnalysisResult.
   * Uses the translated_name provided by the AI.
   * @param args The arguments object from the function call.
   * @returns A preliminary VideoAnalysisResult object.
   */
  private mapFunctionArgsToPreliminaryResult(args: IngredientAnalysisArgs): VideoAnalysisResult {
    // Map product status to isVegan & isUncertain
    let isVegan = false;
    let isUncertain = false;
    
    if (args.product_status === "sannolikt vegansk") {
      isVegan = true;
      isUncertain = false;
    } else if (args.product_status === "sannolikt icke-vegansk") {
      isVegan = false;
      isUncertain = false;
    } else if (args.product_status === "oklart") {
      isVegan = false;
      isUncertain = true;
    }
    
    // Samla anledningar till osäkerhet om det behövs
    const uncertainReasons: string[] = [];
    
    // Create specific lists for frontend display
    const uncertainIngredients: string[] = [];
    const nonVeganIngredients: string[] = [];
    
    // Mappa ingredienser
    const mappedIngredients: IngredientAnalysisResult[] = args.ingredients.map(ingredient => {
      // Använd det översatta namnet istället för originalnamnet
      const name = ingredient.translated_name || ingredient.name;
      
      let isIngredientVegan = true;
      let isIngredientUncertain = false;
      
      if (ingredient.status === "icke-vegansk") {
        isIngredientVegan = false;
        isIngredientUncertain = false;
        nonVeganIngredients.push(name);
        // Lägg endast till anledning om den finns
        if (ingredient.reasoning) {
          uncertainReasons.push(`Ingrediensen "${name}" är inte vegansk: ${ingredient.reasoning}`);
        }
      } else if (ingredient.status === "osäker") {
        isIngredientVegan = false;
        isIngredientUncertain = true;
        uncertainIngredients.push(name);
        // Lägg endast till anledning om den finns
        if (ingredient.reasoning) {
          uncertainReasons.push(`Ingrediensen "${name}" har osäker vegansk status: ${ingredient.reasoning}`);
        }
      }
      
      return {
        name, // Använd det översatta namnet i appen
        isVegan: isIngredientVegan,
        isUncertain: isIngredientUncertain,
        confidence: ingredient.confidence
      };
    });

    // Check if any ingredient is marked as uncertain
    const hasUncertainIngredient = mappedIngredients.some(ingredient => ingredient.isUncertain);
    
    // If we have an uncertain ingredient, always mark the product as uncertain
    if (hasUncertainIngredient) {
      isVegan = false;
      isUncertain = true;
    }
    
    // Om vi inte har några specifika anledningar men resultatet är osäkert,
    // lägg till en generisk förklaring
    if (isUncertain && uncertainReasons.length === 0) {
      uncertainReasons.push("Osäker vegansk status. Några ingredienser har oklar vegansk status.");
    }

    // Skapa lämplig reasoning-text
    let reasoning = isVegan 
                  ? "Produkten innehåller inga icke-veganska ingredienser."
                  : isUncertain
                    ? "Osäker vegansk status. Orsaker: " + uncertainReasons.join("; ")
                    : "Innehåller icke-veganska ingredienser: " + nonVeganIngredients.join(", ") + ".";

    return {
      ingredients: mappedIngredients,
      isVegan: isVegan,
      isUncertain: isUncertain,
      confidence: args.overall_confidence || 0.8,
      reasoning: reasoning,
      uncertainReasons: uncertainReasons,
      // Add explicit lists for frontend display
      uncertainIngredients: uncertainIngredients,
      nonVeganIngredients: nonVeganIngredients,
      videoProcessed: true,
      preferredLanguage: 'sv'
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
      uncertainReasons: [],
      videoProcessed: true,
      preferredLanguage: 'sv',
      uncertainIngredients: [],
      nonVeganIngredients: []
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
   */
  private buildAnalysisPrompt(): string {
    // HÅRDKODAT KRAV: Alltid svenska!
    const targetLanguage = 'sv'; 
    const languageName = 'Swedish';

    // Updated prompt instructing AI to translate to Swedish
    return `
Du är en expert på att analysera matprodukter och identifiera deras ingredienser för att avgöra om produkten är vegansk.

MÅLSPRÅK för översättning och ALLA returnerade ingrediensnamn: ${languageName} (${targetLanguage})

INSTRUKTIONER:
1. Analysera videon NOGGRANT. Identifiera ingredienserna som tydligt VISAS på produktens förpackning.
2. Använd verktyget 'recordIngredientAnalysis' för att strukturera och returnera ditt svar.
3. För varje identifierad ingrediens:
   a. Ange ingrediensens **originalnamn** (som det står på förpackningen) i fältet 'name'.
   b. **Översätt originalnamnet till ${languageName}.** Ange den svenska översättningen i fältet 'translated_name'. **DET ÄR KRITISKT VIKTIGT att 'translated_name' ALLTID innehåller den korrekta svenska översättningen.** Om en översättning mot förmodan inte är möjlig, ange originalnamnet i 'translated_name' och notera detta i 'reasoning'.
   c. Ange dess status: 'vegansk', 'icke-vegansk', 'osäker'.
   d. SPECIFIK REGEL: Ingrediensen 'Arom' (eller motsvarande) ska klassificeras som 'osäker' om dess ursprung inte specificeras.
   e. Ange en konfidenspoäng (0.0-1.0).
   f. VIKTIGT: För 'icke-vegansk' eller 'osäker' status, MÅSTE du ange en kort motivering ('reasoning') på ${languageName}.
4. Ange produktens övergripande status ('sannolikt vegansk', 'sannolikt icke-vegansk', 'oklart') och en övergripande konfidenspoäng.
5. Inkludera ALLA identifierade ingredienser, men lista varje unik ingrediens endast EN gång (baserat på originalnamn).
6. Basera din analys ENDAST på vad som FAKTISKT SYNS i videon.

Använd verktyget 'recordIngredientAnalysis'. **SÄKERSTÄLL ATT ALLA INGREDIENSNAMN DU RETURNERAR I FUNKTIONSANROPETS ARGUMENT, SÄRSKILT I FÄLTET 'translated_name', ALLTID ÄR PÅ ${languageName} (${targetLanguage}).**
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

  /**
   * Build a more compact analysis prompt for larger videos
   * Optimized version of buildAnalysisPrompt with fewer tokens
   */
  private buildCompactAnalysisPrompt(preferredLanguage: string): string {
    const prompt = `
Analysera videon för att snabbt identifiera ingredienser på produktens förpackning.

SPRÅK: ${preferredLanguage || 'Swedish'}

UPPGIFT:
1. Identifiera ingredienser som visas på förpackningen
2. Klassificera varje ingrediens som "vegansk", "icke-vegansk" eller "osäker"
3. Ange en konfidenspoäng (0.0-1.0) för varje klassificering
4. Ge en övergripande bedömning av produkten
5. Använd verktyget "recordIngredientAnalysis" för att strukturera svaret

Fokusera enbart på vad som faktiskt visas i videon.
`;
    return prompt;
  }
}

// Export a singleton instance
const videoAnalysisService = new VideoAnalysisService();
export default videoAnalysisService; 