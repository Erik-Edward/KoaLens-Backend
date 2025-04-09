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
  FunctionDeclarationsTool,
  SchemaType
} from '@google/generative-ai';

// Import types from analysisTypes.ts
import { 
  UsageInfo,
  IngredientAnalysisResult
} from '../types/analysisTypes';

// Type definitions (borrowed from ../types/analysisTypes.ts)
// interface IngredientAnalysisResult {
//   name: string;
//   isVegan: boolean | null;
//   isUncertain?: boolean;
//   confidence: number;
// }

export interface VideoAnalysisResult {
  ingredients: IngredientAnalysisResult[];
  isVegan: boolean | null;
  isUncertain?: boolean;
  confidence: number;
  reasoning?: string;
  uncertainReasons?: string[];
  videoProcessed?: boolean;
  preferredLanguage?: string;
  uncertainIngredients: string[];
  nonVeganIngredients: string[];
  usageInfo?: UsageInfo;
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
  usageInfo?: UsageInfo;
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
        // DETAILED LOGGING ADDED HERE
        logger.info('Raw result object from geminiService.generateContentFromVideo:', JSON.stringify(result, null, 2));
        if (result && result.response) {
          logger.info('Raw result.response object:', JSON.stringify(result.response, null, 2));
          logger.info('Raw result.response.functionCalls object:', JSON.stringify(result.response.functionCalls, null, 2));
        } else {
          logger.warn('result or result.response is missing after geminiService call');
        }
        // END DETAILED LOGGING
        
        logger.info('Gemini API call completed', { 
          geminiApiCallMs: afterGeminiTime - beforeGeminiTime,
          totalElapsedMs: afterGeminiTime - startTime
        });
        
        const response = result.response;
        
        // --- CORRECTED FUNCTION CALL EXTRACTION V2 ---
        let extractedFunctionCalls: any[] = [];
        try {
          // Attempt to access the function call from the corrected path (singular)
          const functionCall = response?.candidates?.[0]?.content?.parts?.[0]?.functionCall;
          
          if (functionCall) {
            // If found, put it into the array
            extractedFunctionCalls = [functionCall]; 
            logger.info(`Successfully extracted 1 function call from response.candidates path.`);
          } else {
             logger.warn('Could not find functionCall in response using the expected path.');
          }
        } catch (extractionError: any) {
          logger.error('Error during function call extraction logic', { error: extractionError.message });
          extractedFunctionCalls = []; // Ensure it's an empty array on error
        }
        const functionCalls = extractedFunctionCalls; 
        const firstFunctionCall = functionCalls.length > 0 ? functionCalls[0] : null;
        // --- END CORRECTION V2 ---
        
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
      if (typeof parsedResult.isVegan !== 'boolean' && parsedResult.isVegan !== null) {
        // Check if there are uncertain ingredients
        const hasUncertainIngredients = parsedResult.ingredients.some((i: IngredientAnalysisResult) => i.isUncertain === true);
        
        if (hasUncertainIngredients) {
          // If we have uncertain ingredients, use null for isVegan
          parsedResult.isVegan = null;
          parsedResult.isUncertain = true;
          logger.info('Setting isVegan=null and isUncertain=true based on uncertain ingredients');
        } else {
          // If there are ingredients that are clearly non-vegan, set isVegan to false
          const hasNonVeganIngredients = parsedResult.ingredients.some((i: IngredientAnalysisResult) => i.isVegan === false && i.isUncertain !== true);
          
          if (hasNonVeganIngredients) {
            parsedResult.isVegan = false;
            logger.info('Setting isVegan=false based on ingredient analysis');
          } else {
            // No uncertain or non-vegan ingredients, assume vegan
            parsedResult.isVegan = true;
            logger.info('Setting isVegan=true as default (no uncertain or non-vegan ingredients found)');
          }
        }
      }
      
      // If isUncertain isn't specified but we have uncertain ingredients, set it
      if (typeof parsedResult.isUncertain !== 'boolean') {
        const hasUncertainIngredients = parsedResult.ingredients.some((i: IngredientAnalysisResult) => i.isUncertain === true);
        parsedResult.isUncertain = hasUncertainIngredients;
        
        // If uncertain, make sure isVegan is null
        if (hasUncertainIngredients) {
          parsedResult.isVegan = null;
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
        isUncertainSet: parsedResult.isUncertain === true, // Log whether uncertain was set
        source: Array.isArray(parsedResult.ingredientAnalysis) ? 'gemini-direct-json' : 'standard-format'
      });

      // Return preliminary result
      return {
        ingredients: parsedResult.ingredients || [],
        isVegan: parsedResult.isVegan,
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
      // Return a default empty result on fatal processing error - USE NULL for isVegan when uncertain
      return {
        ingredients: [],
        isVegan: null,
        isUncertain: true, // Error cases should be uncertain
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
      // Preserve original status for logging and comparison
      const originalIsVegan = ingredient.isVegan;
      const originalIsUncertain = ingredient.isUncertain;
      const ingredientNameForLog = ingredient.name.substring(0, 40) + (ingredient.name.length > 40 ? '...' : ''); // For cleaner logs

      logger.debug(`[Enhance Loop Start] Processing: "${ingredientNameForLog}"`, {
          initialIsVegan: originalIsVegan,
          initialIsUncertain: originalIsUncertain,
          initialConfidence: ingredient.confidence
      });

      // Check against database
      const dbStatus = checkIngredientStatus(ingredient.name);

      logger.debug(`[Enhance Loop DB Check] DB Result for "${ingredientNameForLog}"`, {
          dbIsVegan: dbStatus.isVegan,
          dbIsUncertain: dbStatus.isUncertain,
          dbReason: dbStatus.reason || 'N/A',
          dbMatchedItem: dbStatus.matchedItem || 'N/A'
      });

      // Update ingredient status based on database
      let statusChanged = false;
      if (dbStatus.matchedItem) {
        if (dbStatus.isVegan === false) {
          // Definitely non-vegan according to database
          if (ingredient.isVegan !== false || ingredient.isUncertain === true) {
            statusChanged = true;
            logIngredientCorrection({
              ingredient: ingredient.name,
              originalStatus: originalIsVegan === null ? false : originalIsVegan,
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

          // Manage nonVegan/uncertain arrays
          if (!nonVeganIngredients.includes(ingredient.name)) {
            nonVeganIngredients.push(ingredient.name);
          }
          const uncertainIndex = uncertainIngredients.indexOf(ingredient.name);
          if (uncertainIndex !== -1) {
            uncertainIngredients.splice(uncertainIndex, 1);
          }
        } else if (dbStatus.isVegan === true) {
           // Definitely vegan according to database
           if (ingredient.isVegan !== true || ingredient.isUncertain === true) {
            statusChanged = true;
             logIngredientCorrection({
              ingredient: ingredient.name,
              originalStatus: originalIsVegan === null ? false : originalIsVegan,
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

           // Manage nonVegan/uncertain arrays
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
            statusChanged = true;
            logIngredientCorrection({
              ingredient: ingredient.name,
              originalStatus: originalIsVegan === null ? false : originalIsVegan,
              originalIsUncertain: originalIsUncertain,
              correctedStatus: false,
              isUncertain: true,
              reason: `Database match (Uncertain): ${dbStatus.reason || 'Uncertain vegan status'}`,
              confidence: 0.5
            });
          }
          ingredient.isVegan = null;
          ingredient.isUncertain = true;
          ingredient.confidence = 0.5; // Lower confidence for uncertain

          // Manage nonVegan/uncertain arrays
          if (!uncertainIngredients.includes(ingredient.name)) {
            uncertainIngredients.push(ingredient.name);
          }
           const nonVeganIndex = nonVeganIngredients.indexOf(ingredient.name);
           if (nonVeganIndex !== -1) {
             nonVeganIngredients.splice(nonVeganIndex, 1);
           }
        }
      } else {
        // No DB match - log warning but keep AI's assessment
        logger.warn(`[Enhance Loop No Match] No DB match for: "${ingredientNameForLog}". Keeping AI status.`);
        // Ensure it's added to the correct list based on AI assessment if not already managed
        if(ingredient.isVegan === false && !nonVeganIngredients.includes(ingredient.name) && !uncertainIngredients.includes(ingredient.name)) {
            nonVeganIngredients.push(ingredient.name);
        } else if(ingredient.isUncertain === true && !uncertainIngredients.includes(ingredient.name) && !nonVeganIngredients.includes(ingredient.name)) {
            uncertainIngredients.push(ingredient.name);
        }
      }

      logger.debug(`[Enhance Loop End] Status for "${ingredientNameForLog}" after DB check:`, {
          finalIsVegan: ingredient.isVegan,
          finalIsUncertain: ingredient.isUncertain,
          finalConfidence: ingredient.confidence,
          statusChanged: statusChanged
      });
    } // End loop

    // 2. Determine final overall status and confidence
    let finalIsVegan: boolean | null = null; // Start as null
    let finalIsUncertain = false;
    let finalConfidence = 0.5; // Default confidence

    const hasNonVegan = nonVeganIngredients.length > 0;
    const hasUncertain = uncertainIngredients.length > 0;

    if (hasNonVegan) {
        // If any non-vegan ingredient exists, the product is definitely not strictly vegan.
        finalIsVegan = false;
        finalIsUncertain = hasUncertain; // It's non-vegan, but also uncertain if uncertain items exist
        finalConfidence = hasUncertain ? 0.5 : 0.95; // Lower confidence if uncertainty remains, otherwise high
        logger.debug('[Enhance Step 3] Determined status: Non-Vegan', { hasUncertain });
    } else if (hasUncertain) {
        // If only uncertain ingredients (and potentially known vegan ones) exist.
        finalIsVegan = null; // Cannot confirm vegan status due to uncertainty.
        finalIsUncertain = true;
        finalConfidence = 0.5; // Medium confidence due to uncertainty.
        logger.debug('[Enhance Step 3] Determined status: Uncertain');
    } else {
        // Only known vegan ingredients found.
        finalIsVegan = true;
        finalIsUncertain = false;
        finalConfidence = 0.98; // High confidence.
        logger.debug('[Enhance Step 3] Determined status: Vegan');
    }
    
    // 3. Generate reasoning based on the final status
    let reasoning = `Produkt analyserad: ${finalIsVegan === null ? 'oklar status' : finalIsVegan ? 'vegan' : 'icke-vegan'}`;
    let uncertainReasons: string[] = [];
    
    if (finalIsUncertain) {
      reasoning += '. Status är osäker.';
      uncertainReasons.push('Status är osäker');
    }
    
    // 4. Create the final result object
    const finalResult: VideoAnalysisResult = {
      ingredients: preliminaryResult.ingredients,
      isVegan: finalIsVegan,
      isUncertain: finalIsUncertain,
      confidence: finalConfidence,
      reasoning: reasoning,
      uncertainReasons: uncertainReasons,
      videoProcessed: true,
      preferredLanguage: 'sv',
      uncertainIngredients: uncertainIngredients,
      nonVeganIngredients: nonVeganIngredients
    };
    
    logger.info('Successfully enhanced analysis result', {
      ingredientCount: finalResult.ingredients.length,
      isVegan: finalResult.isVegan,
      isUncertain: finalResult.isUncertain,
      confidence: finalResult.confidence,
      reasoning: finalResult.reasoning,
      uncertainReasons: finalResult.uncertainReasons,
      videoProcessed: finalResult.videoProcessed,
      preferredLanguage: finalResult.preferredLanguage,
      uncertainIngredients: finalResult.uncertainIngredients,
      nonVeganIngredients: finalResult.nonVeganIngredients
    });
    
    return finalResult;
  }

  private getFileExtension(mimeType: string): string {
    const extensions: { [key: string]: string } = {
      'video/mp4': 'mp4',
      'video/quicktime': 'mov',
      'video/x-msvideo': 'avi',
      'video/webm': 'webm'
    };
    return extensions[mimeType] || 'mp4';
  }

  private cleanupTempFiles(tempVideoPath: string, optimizedVideoPath: string): void {
    try {
      if (tempVideoPath && fs.existsSync(tempVideoPath)) {
        fs.unlinkSync(tempVideoPath);
      }
      if (optimizedVideoPath && optimizedVideoPath !== tempVideoPath && fs.existsSync(optimizedVideoPath)) {
        fs.unlinkSync(optimizedVideoPath);
      }
    } catch (error) {
      logger.warn('Error cleaning up temporary files', { error });
    }
  }

  private buildCompactAnalysisPrompt(preferredLanguage: string): string {
    // Updated prompt to strongly enforce function calling
    return `Analysera ingredienserna i videon. Använd ALLTID funktionen 'recordIngredientAnalysis' för att rapportera resultatet. Svara INTE med vanlig text, anropa endast funktionen. Analysera på ${preferredLanguage}.`;
  }

  private buildAnalysisPrompt(): string {
    // Updated prompt to strongly enforce function calling
    return `Gör en detaljerad analys av ingredienserna som visas i videon för att avgöra om produkten är vegansk. 
Använd ALLTID funktionen 'recordIngredientAnalysis' för att strukturera och rapportera ditt resultat. 
Svara ENDAST med ett anrop till funktionen 'recordIngredientAnalysis'. Inkludera ALLA identifierade ingredienser. 
Analysera på svenska.`;
  }

  private createFunctionDeclarations(): FunctionDeclarationsTool[] {
    return [{ 
      functionDeclarations: [
        {
          name: 'recordIngredientAnalysis',
          description: 'Record the analysis of ingredients',
          parameters: {
            type: SchemaType.OBJECT,
            properties: {
              product_status: {
                type: SchemaType.STRING,
                enum: ['sannolikt vegansk', 'sannolikt icke-vegansk', 'oklart'] 
              },
              overall_confidence: {
                type: SchemaType.NUMBER,
              },
              ingredients: {
                type: SchemaType.ARRAY,
                items: {
                  type: SchemaType.OBJECT,
                  properties: {
                    name: { type: SchemaType.STRING },
                    translated_name: { type: SchemaType.STRING },
                    status: {
                      type: SchemaType.STRING,
                      enum: ['vegansk', 'icke-vegansk', 'osäker'] 
                    },
                    reasoning: { type: SchemaType.STRING },
                    confidence: {
                      type: SchemaType.NUMBER,
                    }
                  },
                  required: ['name', 'translated_name', 'status', 'confidence']
                }
              }
            },
            required: ['product_status', 'overall_confidence', 'ingredients']
          }
        }
      ]
    }];
  }

  private safetyCheckFunctionCalls(response: any): { functionCalls: any[], firstFunctionCall: any } {
    const functionCalls = response.functionCalls || [];
    const firstFunctionCall = functionCalls.length > 0 ? functionCalls[0] : null;
    return { functionCalls, firstFunctionCall };
  }

  private mapExtractRecipeDataToPreliminaryResult(args: any): VideoAnalysisResult {
    const ingredients = args.ingredients.map((ing: any) => ({
      name: ing.name,
      isVegan: ing.isVegan ?? null,
      isUncertain: ing.isUncertain ?? false,
      confidence: ing.confidence ?? 0.5
    }));

    const hasUncertainIngredients = ingredients.some((ing: IngredientAnalysisResult) => ing.isUncertain);
    const hasNonVeganIngredients = ingredients.some((ing: IngredientAnalysisResult) => ing.isVegan === false);

    return {
      ingredients,
      isVegan: hasUncertainIngredients ? null : !hasNonVeganIngredients,
      isUncertain: hasUncertainIngredients,
      confidence: 0.5,
      reasoning: '',
      uncertainReasons: [],
      videoProcessed: true,
      preferredLanguage: 'sv',
      uncertainIngredients: ingredients.filter((ing: IngredientAnalysisResult) => ing.isUncertain).map((ing: IngredientAnalysisResult) => ing.name),
      nonVeganIngredients: ingredients.filter((ing: IngredientAnalysisResult) => ing.isVegan === false).map((ing: IngredientAnalysisResult) => ing.name)
    };
  }

  private mapFunctionArgsToPreliminaryResult(args: IngredientAnalysisArgs): VideoAnalysisResult {
    const ingredients = args.ingredients.map(ing => ({
      name: ing.translated_name,
      isVegan: ing.status === 'vegansk' ? true : ing.status === 'icke-vegansk' ? false : null,
      isUncertain: ing.status === 'osäker',
      confidence: ing.confidence
    }));

    const result: VideoAnalysisResult = {
      ingredients,
      isVegan: args.product_status === 'sannolikt vegansk' ? true : 
               args.product_status === 'sannolikt icke-vegansk' ? false : null,
      isUncertain: args.product_status === 'oklart',
      confidence: args.overall_confidence,
      reasoning: '',
      uncertainReasons: [],
      videoProcessed: true,
      preferredLanguage: 'sv',
      uncertainIngredients: ingredients.filter((ing: IngredientAnalysisResult) => ing.isUncertain).map((ing: IngredientAnalysisResult) => ing.name),
      nonVeganIngredients: ingredients.filter((ing: IngredientAnalysisResult) => ing.isVegan === false).map((ing: IngredientAnalysisResult) => ing.name)
    };
    
    // Add usageInfo if it exists in args
    if (args.usageInfo) {
      result.usageInfo = args.usageInfo;
    }
    
    return result;
  }

  private buildSimplifiedRetryPrompt(): string {
    return 'Analysera ingredienserna i denna produkt och avgör om den är vegansk. Svara på svenska.';
  }
}