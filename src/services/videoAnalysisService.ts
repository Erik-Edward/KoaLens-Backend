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
      const tempVideoPath = path.join(this.tempDir, `${videoId}-original.${this.getFileExtension(mimeType)}`);
      const buffer = Buffer.from(base64Data, 'base64');
      fs.writeFileSync(tempVideoPath, buffer);
      logger.debug('Saved video to temporary file', { 
        tempVideoPath, 
        sizeBytes: buffer.length 
      });
      
      // Optimize video if possible
      let optimizedVideoPath = tempVideoPath;
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
      
      // Send to Gemini for analysis
      logger.info('Sending video for AI analysis', { 
        videoSizeKB: Math.round(videoBuffer.length / 1024),
        promptLength: prompt.length
      });
      
      // First attempt - with standard processing
      let result: VideoAnalysisResult;
      let attemptCount = 0;
      const maxAttempts = 2;
      
      try {
        attemptCount++;
        const aiResponse = await geminiService.generateContentFromVideo(prompt, videoBase64, 'video/mp4');
        result = this.parseAnalysisResult(aiResponse);
      } catch (error: any) {
        logger.warn('First video analysis attempt failed, retrying with simplified prompt', { 
          error: error.message,
          attempt: attemptCount
        });
        
        // Simplified retry if first attempt failed
        if (attemptCount < maxAttempts) {
          attemptCount++;
          // Simplify prompt for retry
          const simplifiedPrompt = `
Analysera denna matprodukt. Lista alla ingredienser du kan se på förpackningen. 
Översätt ingredienserna till svenska.
För varje ingrediens, ange om den är vegansk (true) eller icke-vegansk (false).

Ingredienser som kommer från djur är icke-veganska: ägg, mjölk, ost, kött, fisk, gelatin, honung.
Växtbaserade ingredienser är veganska: soja, tofu, grönsaker, frukt, nötter, frön.

Svara med ENDAST ett JSON-objekt i detta format:
\`\`\`json
{
  "ingredients": [
    {
      "name": "ingrediensnamn på svenska",
      "isVegan": true/false,
      "confidence": 0.5
    }
  ],
  "isVegan": true/false,
  "confidence": 0.5
}
\`\`\`

Om du inte kan identifiera några ingredienser, svara med:
\`\`\`json
{
  "ingredients": [],
  "isVegan": false,
  "confidence": 0.0
}
\`\`\`
`;
          const aiResponse = await geminiService.generateContentFromVideo(simplifiedPrompt, videoBase64, 'video/mp4');
          result = this.parseAnalysisResult(aiResponse);
        } else {
          throw error; // Re-throw if all attempts failed
        }
      }
      
      // Log the analysis completion
      logVideoAnalysisResponse({
        processingTimeSec: (Date.now() - new Date().getTime()) / 1000,
        ingredientCount: result.ingredients.length,
        isVegan: result.isVegan,
        isUncertain: result.isUncertain || false,
        confidenceScore: result.confidence,
        uncertainIngredientsCount: result.ingredients.filter((i: IngredientAnalysisResult) => i.isUncertain).length,
        statusCode: 200
      });
      
      // Clean up temp files
      this.cleanupTempFiles(tempVideoPath, optimizedVideoPath);
      
      return result;
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
      throw error;
    }
  }
  
  /**
   * Parse the AI's response and convert to structured format
   * @param result Raw AI response text
   * @returns Structured analysis result
   */
  private parseAnalysisResult(result: string): VideoAnalysisResult {
    let parsedResult: any;
    let rawJsonResponse: string | null = null;

    try {
      // 1. Prioritize extracting JSON from ```json blocks
      const jsonBlockMatch = result.match(/```json\\s*([\\s\\S]*?)\\s*```/);
      if (jsonBlockMatch && jsonBlockMatch[1]) {
        rawJsonResponse = jsonBlockMatch[1].trim();
        try {
          parsedResult = JSON.parse(rawJsonResponse);
          logger.debug('Successfully parsed JSON from ```json block');
        } catch (jsonError: any) {
          logger.warn('Failed to parse JSON from ```json block, attempting direct parse', {
            error: jsonError.message,
            rawJson: rawJsonResponse // Log the raw JSON that failed
          });
          parsedResult = null; // Reset for next attempt
        }
      }

      // 2. If no valid JSON from block, try parsing the first/largest standalone object
      if (!parsedResult) {
        const standaloneJsonMatch = result.match(/\\{[\\s\\S]*\\}/);
        if (standaloneJsonMatch && standaloneJsonMatch[0]) {
          rawJsonResponse = standaloneJsonMatch[0].trim();
          try {
            parsedResult = JSON.parse(rawJsonResponse);
            logger.debug('Successfully parsed JSON from standalone object');
          } catch (jsonError: any) {
            logger.warn('Failed to parse JSON from standalone object', {
              error: jsonError.message,
              rawJson: rawJsonResponse // Log the raw JSON that failed
            });
            parsedResult = null;
          }
        }
      }

      // 3. If direct JSON parsing failed, use regex as a last resort (and log a warning)
      if (!parsedResult) {
        logger.warn('Direct JSON parsing failed for AI response. Falling back to regex extraction.', {
            fullResponse: result // Log the entire response when falling back
        });
        // Use the regex extraction method as fallback
        parsedResult = this.extractIngredientsWithRegex(result);
      }

      // Basic validation of the parsed structure
      if (!parsedResult || !Array.isArray(parsedResult.ingredients)) {
          // If even regex failed to produce a basic structure, throw error
         throw new Error('Invalid or incomplete analysis result structure after parsing attempts');
      }
      
      // Ensure confidence and isVegan exist at the top level (even if regex was used)
      if (typeof parsedResult.isVegan !== 'boolean') {
          parsedResult.isVegan = false; // Default to false if missing
      }
       if (typeof parsedResult.confidence !== 'number') {
          parsedResult.confidence = 0.5; // Default confidence if missing
      }

      // Enhance with database validation and uncertainty checks
      const enhancedResult = this.enhanceAnalysisResult(parsedResult);

      logger.info('Successfully parsed and enhanced AI analysis result', {
        ingredientCount: enhancedResult.ingredients.length,
        isVegan: enhancedResult.isVegan,
        isUncertain: enhancedResult.isUncertain || false
      });

      return enhancedResult;

    } catch (error: any) {
      logger.error('Fatal error processing AI analysis result, returning empty result.', {
          error: error.message,
          originalResponse: result // Log the original response on fatal error
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
   * Based on the original `extractWithRegex` logic.
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
   * Enhances the parsed AI result by validating against the database,
   * determining final vegan/uncertain status, and generating reasoning.
   * Incorporates logic from original `validateIngredients` and final processing steps.
   * @param parsedResult The preliminary result object (from JSON or regex).
   * @returns The final, enhanced VideoAnalysisResult.
   */
  private enhanceAnalysisResult(parsedResult: any): VideoAnalysisResult {
    // 1. Validate ingredients against database and update status/confidence
    let hasNonVegan = false;
    let hasUncertain = false;
    const uncertainReasonsAccumulator: string[] = []; // Renamed to avoid conflict

    if (Array.isArray(parsedResult.ingredients)) {
        for (const ingredient of parsedResult.ingredients) {
            if (!ingredient || !ingredient.name) continue;

            const originalIsVegan = ingredient.isVegan;
            const originalIsUncertain = ingredient.isUncertain; // Keep track if AI marked uncertain

            const dbStatus = checkIngredientStatus(ingredient.name);

            if (dbStatus.isVegan === false) {
                 // Definitivt icke-vegansk enligt databas
                 if (ingredient.isVegan !== false || ingredient.isUncertain === true) {
                    // Restore logging details
                    logIngredientCorrection({
                        ingredient: ingredient.name,
                        originalStatus: originalIsVegan,
                        originalIsUncertain: originalIsUncertain,
                        correctedStatus: false,
                        isUncertain: false, // Ensure false here
                        reason: `Database match (Non-Vegan): ${dbStatus.reason}`,
                        confidence: 0.99
                     });
                 }
                 ingredient.isVegan = false;
                 ingredient.isUncertain = false;
                 ingredient.confidence = 0.99; // High confidence from DB
                 hasNonVegan = true;
            } else if (dbStatus.isUncertain === true) {
                 // Osäker enligt databas
                 if (ingredient.isUncertain !== true) {
                     // Restore logging details
                     logIngredientCorrection({
                         ingredient: ingredient.name,
                         originalStatus: originalIsVegan,
                         // originalIsUncertain is implicitly false if we enter here
                         correctedStatus: false, // Uncertain treated as non-vegan
                         isUncertain: true,
                         reason: `Database match (Uncertain): ${dbStatus.reason}`,
                         confidence: 0.5
                     });
                 }
                 ingredient.isVegan = false; // Treat uncertain as non-vegan for safety
                 ingredient.isUncertain = true;
                 ingredient.confidence = 0.5; // Lower confidence
                 hasUncertain = true;
                 if (dbStatus.reason && !uncertainReasonsAccumulator.includes(dbStatus.reason)) {
                    uncertainReasonsAccumulator.push(dbStatus.reason);
                 }
            } else if (dbStatus.isVegan === true) {
                 // Definitivt vegansk enligt databas
                 if (ingredient.isVegan !== true || ingredient.isUncertain === true) {
                    // Restore logging details
                    logIngredientCorrection({
                        ingredient: ingredient.name,
                        originalStatus: originalIsVegan,
                        originalIsUncertain: originalIsUncertain,
                        correctedStatus: true,
                        isUncertain: false,
                        reason: `Database match (Vegan): ${dbStatus.reason}`,
                        confidence: 0.98
                    });
                 }
                 ingredient.isVegan = true;
                 ingredient.isUncertain = false;
                 ingredient.confidence = 0.98; // High confidence
            } else {
                // No DB match, trust AI but update overall flags
                 if (ingredient.isVegan === false && !ingredient.isUncertain) {
                    hasNonVegan = true;
                 }
                 if (ingredient.isUncertain === true) { // If AI marked as uncertain
                    hasUncertain = true;
                     const genericReason = `${ingredient.name} markerades som osäker av AI`;
                     if (!uncertainReasonsAccumulator.some(r => r.startsWith(ingredient.name))) {
                        uncertainReasonsAccumulator.push(genericReason);
                     }
                 }
            }
        }
    } else {
        // Ensure ingredients is an array even if regex failed badly
        parsedResult.ingredients = [];
    }
    
    // 2. Process Multilingual / Deduplicate (Simplified based on original code)
    const processedNames = new Set<string>();
    const uniqueIngredients: IngredientAnalysisResult[] = [];
     if (Array.isArray(parsedResult.ingredients)) {
        for (const ingredient of parsedResult.ingredients) {
           if (ingredient && ingredient.name) {
                const normalizedName = ingredient.name.toLowerCase().trim();
                if (!processedNames.has(normalizedName)) {
                    processedNames.add(normalizedName);
                    // Ensure basic structure
                    uniqueIngredients.push({
                        name: ingredient.name,
                        isVegan: typeof ingredient.isVegan === 'boolean' ? ingredient.isVegan : false,
                        confidence: typeof ingredient.confidence === 'number' ? ingredient.confidence : 0.5,
                        isUncertain: typeof ingredient.isUncertain === 'boolean' ? ingredient.isUncertain : false
                    });
                }
            }
        }
     }
     // Replace original list with unique list
     parsedResult.ingredients = uniqueIngredients;


    // 3. Determine final product status based on ingredient validation
    let finalIsVegan = false;
    let finalIsUncertain = false;

    if (hasNonVegan) {
      finalIsVegan = false;
      finalIsUncertain = false;
    } else if (hasUncertain) {
      finalIsVegan = false; // Uncertain products are not considered vegan
      finalIsUncertain = true;
    } else {
      // If no non-vegan and no uncertain found, it's vegan
      finalIsVegan = true;
      finalIsUncertain = false;
    }

    // 4. Generate reasoning text
    let finalReasoning = '';
    if (finalIsVegan) {
      finalReasoning = 'Alla identifierade ingredienser verkar vara veganska baserat på databas och AI-analys.';
    } else if (finalIsUncertain) {
      finalReasoning = 'Osäker vegansk status. Orsaker: ' + uncertainReasonsAccumulator.join('; ');
    } else { // Must be non-vegan
        const nonVeganNames = parsedResult.ingredients
            .filter((i: IngredientAnalysisResult) => i.isVegan === false && i.isUncertain !== true)
            .map((i: IngredientAnalysisResult) => i.name)
            .join(', ');
         if (nonVeganNames) {
            finalReasoning = `Innehåller ingredienser som inte är veganska: ${nonVeganNames}.`;
         } else {
             finalReasoning = 'Produkten bedöms inte vara vegansk, men specifik icke-vegansk ingrediens kunde inte fastställas.';
         }
    }

    // 5. Construct the final result object
    return {
      ingredients: parsedResult.ingredients, // The validated, unique list
      isVegan: finalIsVegan,
      isUncertain: finalIsUncertain,
      confidence: parsedResult.confidence, // Use the top-level confidence from AI/regex
      reasoning: finalReasoning,
      uncertainReasons: uncertainReasonsAccumulator.length > 0 ? uncertainReasonsAccumulator : undefined
    };
  }
  
  /**
   * Build a prompt for the AI to analyze food product ingredients
   * Optimized based on recommendations for clarity and precision
   */
  private buildAnalysisPrompt(_language: string): string {
    // Vi använder svenska oavsett valt språk för konsekvent output
    return `
Du är en expert på att analysera matprodukter och identifiera deras ingredienser för att avgöra om produkten är vegansk.

INSTRUKTIONER:
1. Analysera videon NOGGRANT. Identifiera ingredienserna som tydligt VISAS på produktens förpackning.
2. Fokusera på ingredienslistan i videon.
3. Översätt ALLA identifierade ingredienser till svenska. Använd vanliga svenska livsmedelsnamn.
4. Bedöm om produkten är vegansk. En ingrediens är *inte* vegansk om den *definitivt* kommer från djur.
   - Icke-veganska ingredienser: ägg, mjölk, ost, grädde, kött, fisk, gelatin, honung, bivax, lanolin, etc.
   - Extra uppmärksam på E-nummer:
     - E120 (karmin), E441 (gelatin), E901 (bivax), E904 (shellack), E920 (L-cystein) är INTE veganska.
     - Andra E-nummer kan vara osäkra, men försök identifiera alla E-nummer du ser i ingredienslistan.
   - Sojabaserade produkter (tofu, tempeh, sojasås, etc.) är ALLTID veganska.
5. Lista varje identifierad ingrediens ENBART EN gång på svenska.

SVARA ENDAST med ett JSON-objekt i detta format (utan extra text före eller efter):

\`\`\`json
{
  "ingredients": [
    {
      "name": "ingrediensnamn på svenska",
      "isVegan": true/false,
      "confidence": 0.0-1.0
    }
  ],
  "isVegan": true/false,
  "confidence": 0.0-1.0
}
\`\`\`

Exempel på korrekt svar:

\`\`\`json
{
  "ingredients": [
    {
      "name": "Majskorn",
      "isVegan": true,
      "confidence": 0.98
    },
    {
      "name": "Palmolja",
      "isVegan": true,
      "confidence": 0.95
    },
    {
      "name": "E471",
      "isVegan": false,
      "confidence": 0.95
    },
    {
      "name": "Salt",
      "isVegan": true,
      "confidence": 0.99
    }
  ],
  "isVegan": false,
  "confidence": 0.97
}
\`\`\`

Exempel på svar om inga ingredienser kan identifieras:

\`\`\`json
{
  "ingredients": [],
  "isVegan": false,
  "confidence": 0.0
}
\`\`\`

Se till att:
1. Följa det exakta JSON-formatet UTAN extra text före eller efter.
2. ALLTID översätta alla identifierade ingredienser till svenska.
3. Ange "confidence" som ett nummer mellan 0 och 1.
4. Markera ingredienser korrekt som veganska/icke-veganska.
5. Inkludera ALLA identifierade ingredienser.
6. Endast inkludera ingredienser som du FAKTISKT KAN SE i videon.
7. Var extra uppmärksam på E-nummer och försök identifiera alla du ser.
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