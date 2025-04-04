import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { v4 as uuidv4 } from 'uuid';
import { logger } from '../utils/logger';
import { VideoOptimizer } from '../utils/videoOptimizer';
import geminiService from './geminiService';
import {
  logVideoAnalysisRequest,
  logVideoAnalysisResponse,
  logIngredientCorrection
} from '../utils/videoLogger';
import { checkIngredientStatus } from '../utils/ingredientsDatabase';
import { z } from 'zod';

// Import necessary types from @google/generative-ai
import { 
  FunctionDeclaration, 
  GenerateContentResult, 
  FunctionDeclarationsTool,
  SchemaType
} from '@google/generative-ai';

// Type definitions (borrowed from ../types/analysisTypes.ts)
interface IngredientAnalysisResult {
  name: string;
  isVegan: boolean;
  confidence: number;
  isUncertain?: boolean; // Markerar om ingrediensen är osäker (kan vara vegansk eller ej)
}

interface VideoAnalysisResult {
  ingredients: IngredientAnalysisResult[];
  isVegan: boolean;
  isUncertain?: boolean; // Ny status för osäkra produkter
  confidence: number;
  reasoning?: string; // Explanation for vegan classification
  uncertainReasons?: string[]; // Anledningar till osäker status
}

// -- Start: Define Zod Schema --
const ingredientAnalysisArgsSchema = z.object({
  product_status: z.enum(["sannolikt vegansk", "sannolikt icke-vegansk", "oklart"]),
  overall_confidence: z.number().min(0).max(1),
  ingredients: z.array(z.object({
    name: z.string().min(1, "Ingredient name cannot be empty (original language)"),
    translated_name: z.string().min(1, "Translated ingredient name cannot be empty"),
    status: z.enum(["vegansk", "icke-vegansk", "osäker"]),
    reasoning: z.string(),
    confidence: z.number().min(0).max(1),
  })).min(0),
});
// -- End: Define Zod Schema --

// -- Start: Define Function Declaration and Argument Type --
const recordIngredientAnalysisFunctionDeclaration: FunctionDeclaration = {
  name: "recordIngredientAnalysis",
  description: "Records the analysis of an ingredient list, classifying the overall product and each individual ingredient regarding its vegan status, including original and translated names.",
  parameters: {
    type: SchemaType.OBJECT,
    properties: {
      product_status: {
        type: SchemaType.STRING,
        description: "Overall status of the product based on the ingredient analysis.",
        enum: ["sannolikt vegansk", "sannolikt icke-vegansk", "oklart"],
        format: 'enum'
      },
      overall_confidence: {
        type: SchemaType.NUMBER,
        description: "Overall confidence score (0.0 to 1.0) for the product status assessment.",
      },
      ingredients: {
        type: SchemaType.ARRAY,
        description: "An array containing the analysis for each identified ingredient.",
        items: {
          type: SchemaType.OBJECT,
          properties: {
            name: {
              type: SchemaType.STRING,
              description: "The original name of the ingredient as found on the packaging.",
            },
            translated_name: {
              type: SchemaType.STRING,
              description: "The name of the ingredient translated to the requested language.",
            },
            status: {
              type: SchemaType.STRING,
              description: "Classification of the ingredient.",
              enum: ["vegansk", "icke-vegansk", "osäker"],
              format: 'enum'
            },
            reasoning: {
              type: SchemaType.STRING,
              description: "Brief explanation for why the ingredient received its status, especially if 'icke-vegansk' or 'osäker'.",
            },
            confidence: {
              type: SchemaType.NUMBER,
              description: "Confidence score (0.0 to 1.0) for the classification.",
            },
          },
          required: ["name", "translated_name", "status", "reasoning", "confidence"],
        },
      },
    },
    required: ["product_status", "overall_confidence", "ingredients"],
  },
};

type IngredientAnalysisArgs = {
  product_status: "sannolikt vegansk" | "sannolikt icke-vegansk" | "oklart";
  overall_confidence: number;
  ingredients: {
    name: string;
    translated_name: string;
    status: "vegansk" | "icke-vegansk" | "osäker";
    reasoning: string;
    confidence: number;
  }[];
};
// -- End: Define Function Declaration and Argument Type --

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
    
    logger.info('VideoAnalysisService initialized', { 
      tempDir: this.tempDir, 
      maxVideoSizeBytes: this.maxVideoSizeBytes
    });
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
    // Log the analysis request
    logVideoAnalysisRequest({
      mimeType,
      preferredLanguage,
      dataSize: base64Data.length
    });
    
    let tempVideoPath = '';
    let optimizedVideoPath = '';
    
    try {
      // Validate video data
      if (!base64Data || !mimeType.startsWith('video/')) {
        throw new Error('Invalid video data or MIME type');
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
      fs.writeFileSync(tempVideoPath, buffer);
      logger.debug('Saved video to temporary file', { 
        tempVideoPath, 
        sizeBytes: buffer.length 
      });
      
      // Optimize video if possible
      optimizedVideoPath = tempVideoPath;
      try {
        optimizedVideoPath = await this.videoOptimizer.optimize(
          tempVideoPath, 
          path.join(this.tempDir, `${videoId}-optimized.mp4`)
        );
        logger.debug('Video optimized', { 
          originalPath: tempVideoPath, 
          optimizedPath: optimizedVideoPath,
          originalSizeBytes: fs.statSync(tempVideoPath).size,
          optimizedSizeBytes: fs.statSync(optimizedVideoPath).size
        });
      } catch (error) {
        logger.warn('Failed to optimize video, proceeding with original', { error });
        // Continue with original video
      }
      
      // Read the video file for analysis
      const videoBuffer = fs.readFileSync(optimizedVideoPath);
      const videoBase64 = videoBuffer.toString('base64');
      
      // Build prompt for Gemini
      const prompt = this.buildAnalysisPrompt(preferredLanguage);
      
      // Define the tools to be passed to the Gemini API
      const tools: FunctionDeclarationsTool[] = [
        { functionDeclarations: [recordIngredientAnalysisFunctionDeclaration] }
      ];

      // Send to Gemini for analysis
      logger.info('Sending video for AI analysis', { 
        videoSizeKB: Math.round(videoBuffer.length / 1024),
        promptLength: prompt.length
      });
      
      let mappedResult: IngredientAnalysisArgs | null = null;
      let preliminaryResult: VideoAnalysisResult | null = null;
      let attemptCount = 0;
      const maxAttempts = 2;
      
      try {
        // First Attempt
        attemptCount++;
        logger.info('Attempting video analysis with function calling', { attempt: attemptCount });
        const aiResult: GenerateContentResult = await geminiService.generateContentFromVideo(
          prompt, videoBase64, 'video/mp4', tools
        );
        const response = aiResult.response;
        const functionCalls = response.functionCalls();

        if (functionCalls && functionCalls.length > 0) {
          const analysisCall = functionCalls.find(fc => fc.name === 'recordIngredientAnalysis');
          if (analysisCall) {
            logger.info('Received function call from Gemini', { functionName: analysisCall.name });
            // Store raw args for potential validation
            mappedResult = analysisCall.args as IngredientAnalysisArgs; 
            
            // --- BEGIN DEBUG LOGGING --- 
            // Log the raw arguments received directly from the function call
            logger.debug('[AnalyzeVideo] Raw function call arguments received:', { 
              args: JSON.stringify(mappedResult) // Stringify for easier viewing of the whole object
            });
            // --- END DEBUG LOGGING --- 
            
          } else {
            logger.warn('Received function call, but not the expected one', {
              receivedCalls: functionCalls.map(fc => fc.name)
            });
          }
        }

        // Fallback to text parsing if no function call
        if (mappedResult === null) {
          logger.info('No function call received, falling back to text parsing');
          const textResponse = response.text();
          if (!textResponse) {
            throw new Error('AI response missing text content and no function call found.');
          }
          // Parse text to preliminary result
          preliminaryResult = this.parseAnalysisResult(textResponse); 
        }

      } catch (error: any) {
        logger.warn('First video analysis attempt failed', { 
          error: error.message,
          attempt: attemptCount
        });
        
        // Retry Logic
        if (attemptCount < maxAttempts) {
          logger.info('Retrying video analysis with simplified prompt and function calling', { attempt: attemptCount + 1 });
          attemptCount++;
          const simplifiedPrompt = this.buildSimplifiedRetryPrompt();
          
          const aiResultRetry: GenerateContentResult = await geminiService.generateContentFromVideo(
            simplifiedPrompt, videoBase64, 'video/mp4', tools
          );
          const responseRetry = aiResultRetry.response;
          const functionCallsRetry = responseRetry.functionCalls();

          if (functionCallsRetry && functionCallsRetry.length > 0) {
            const analysisCallRetry = functionCallsRetry.find(fc => fc.name === 'recordIngredientAnalysis');
            if (analysisCallRetry) {
              logger.info('Received function call from Gemini on retry', { functionName: analysisCallRetry.name });
              mappedResult = analysisCallRetry.args as IngredientAnalysisArgs; // Store raw args
            } else {
               logger.warn('Received function call on retry, but not the expected one', {
                 receivedCalls: functionCallsRetry.map(fc => fc.name)
               });
            }
          }

          // Fallback to text parsing on retry
          if (mappedResult === null) {
            logger.info('No function call received on retry, falling back to text parsing');
            const textResponseRetry = responseRetry.text();
            if (!textResponseRetry) {
              throw new Error('AI retry response missing text content and no function call found.');
            }
            preliminaryResult = this.parseAnalysisResult(textResponseRetry);
          }

        } else {
          logger.error('All video analysis attempts failed.');
          throw error; // Re-throw if all attempts failed
        }
      }
      
      // --- Start: Processing and final validation --- 
      // Convert function call args to preliminary result if we have them
      if (mappedResult) {
        try {
          ingredientAnalysisArgsSchema.parse(mappedResult);
          logger.info('Function call arguments successfully validated against Zod schema.');
          // Map the validated args to a preliminary result structure
          preliminaryResult = this.mapFunctionArgsToPreliminaryResult(mappedResult);
        } catch (zodError: any) {
          logger.error('Zod validation failed for function call arguments', { 
            error: zodError.errors,
            args: mappedResult 
          });
          throw new Error('AI response via function call failed schema validation.');
        }
      }
      
      // Ensure we have a preliminary result at this point
      if (!preliminaryResult) {
        throw new Error('Failed to obtain analysis result after all attempts and fallbacks.');
      }

      // CRUCIAL STEP: Always enhance the preliminary result to ensure consistent status determination
      // This applies database checks and determines the final vegan/uncertain status
      const finalResult = this.enhanceAnalysisResult(preliminaryResult);
      // --- End: Processing and final validation --- 

      // Log the analysis completion
      logVideoAnalysisResponse({
        processingTimeSec: (Date.now() - new Date().getTime()) / 1000,
        ingredientCount: finalResult.ingredients.length,
        isVegan: finalResult.isVegan,
        isUncertain: finalResult.isUncertain || false,
        confidenceScore: finalResult.confidence,
        uncertainIngredientsCount: finalResult.ingredients.filter((i: IngredientAnalysisResult) => i.isUncertain).length,
        statusCode: 200
      });
      
      // Clean up temp files
      this.cleanupTempFiles(tempVideoPath, optimizedVideoPath);
      
      return finalResult; // Return the final enhanced result
    } catch (error: any) {
      // Log the error
      logVideoAnalysisResponse({
        processingTimeSec: (Date.now() - new Date().getTime()) / 1000,
        ingredientCount: 0,
        isVegan: false,
        isUncertain: false,
        confidenceScore: 0,
        uncertainIngredientsCount: 0,
        statusCode: 500,
        errorMessage: error.message
      });
      
      logger.error('Error analyzing video', { 
        error: error.message,
        stack: error.stack
      });
      
      // Clean up temp files even on error
      this.cleanupTempFiles(tempVideoPath, optimizedVideoPath);
      
      throw error;
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

      // Basic validation of the parsed structure
      if (!parsedResult || !Array.isArray(parsedResult.ingredients)) {
         throw new Error('Invalid or incomplete analysis result structure after parsing attempts');
      }
      
      // Ensure confidence and isVegan exist at the top level (even if regex was used)
      if (typeof parsedResult.isVegan !== 'boolean') {
          parsedResult.isVegan = false; // Default to false if missing
      }
      if (typeof parsedResult.confidence !== 'number') {
          parsedResult.confidence = 0.5; // Default confidence if missing
      }

      // NOTE: We no longer call enhanceAnalysisResult here. 
      // The preliminary result will be enhanced later in analyzeVideo
      
      logger.info('Successfully parsed AI analysis text to preliminary result', {
        ingredientCount: parsedResult.ingredients.length,
        preliminaryIsVegan: parsedResult.isVegan, // May change after enhancement
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

    // Try finding the ingredients array structure
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
        // Fallback: If no "ingredients": [...] structure found, try extracting from general text
        // (Using simplified logic from original extractIngredientsFromText)
        const items = text.split(/[,.;:\n()\/]+/);
        for (const item of items) {
            const trimmedItem = item.trim();
             if (trimmedItem.length > 2 && !/^\d+$/.test(trimmedItem) && !trimmedItem.toLowerCase().includes('ingredient')) {
                 const isVeganGuess = !(trimmedItem.toLowerCase().includes('mjölk') || trimmedItem.toLowerCase().includes('ägg')); // Very basic guess
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
      .map(ing => `${ing.translated_name}: ${ing.reasoning}`); // Use translated name in reason

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
}

// Export a singleton instance
const videoAnalysisService = new VideoAnalysisService();
export default videoAnalysisService; 