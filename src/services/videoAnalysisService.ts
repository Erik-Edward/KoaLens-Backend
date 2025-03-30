import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { v4 as uuidv4 } from 'uuid';
import { logger } from '../utils/logger';
import { VideoOptimizer } from '../utils/videoOptimizer';
import geminiService from './geminiService';
import { 
  isIngredientVegan, 
  translateToSwedish
} from '../utils/ingredientsDatabase';
import {
  logVideoAnalysisRequest,
  logVideoAnalysisResponse,
  logIngredientCorrection
} from '../utils/videoLogger';

// Type definitions (borrowed from ../types/analysisTypes.ts)
interface IngredientAnalysisResult {
  name: string;
  isVegan: boolean;
  confidence: number;
  originalName?: string; // Original name before translation (if different)
  detectedLanguage?: string; // Language this ingredient was detected in
}

interface VideoAnalysisResult {
  ingredients: IngredientAnalysisResult[];
  isVegan: boolean;
  confidence: number;
  detectedLanguages?: string[]; // Languages detected on packaging
  reasoning?: string; // Explanation for vegan classification
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
      logger.info('Created temporary directory for video processing', { tempDir: this.tempDir });
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
Analyze this food product image. List all ingredients you can see. 
For each ingredient, indicate if it's vegan (true) or non-vegan (false).
Format your response as JSON with ingredients array, each with name, isVegan, and confidence fields.
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
        confidenceScore: result.confidence,
        detectedLanguages: result.detectedLanguages,
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
        confidenceScore: 0,
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
    try {
      // Attempt to parse JSON from the result
      // First, find a JSON block if it exists
      const jsonMatch = result.match(/```json\s*([\s\S]*?)\s*```/) || 
                        result.match(/\{[\s\S]*\}/);
      
      let parsedResult: any;
      
      if (jsonMatch) {
        // Extract the JSON content from the match
        const jsonContent = jsonMatch[1] || jsonMatch[0];
        parsedResult = JSON.parse(jsonContent);
        
        // Log the parsed JSON for debugging
        logger.debug('Parsed JSON result', { 
          fullParsedResult: JSON.stringify(parsedResult)
        });
      } else {
        // If no JSON found, try to extract information from text
        logger.warn('No JSON found in AI response, using fallback parser');
        parsedResult = {
          ingredients: this.extractIngredientsFromText(result),
          isVegan: result.toLowerCase().includes('vegan: true'),
          confidence: 0.5 // Default confidence
        };
      }
      
      // Validate the structure
      if (!parsedResult.ingredients || !Array.isArray(parsedResult.ingredients)) {
        parsedResult.ingredients = [];
      }
      
      // Ensure isVegan is a boolean
      if (typeof parsedResult.isVegan !== 'boolean') {
        if (typeof parsedResult.isVegan === 'string') {
          parsedResult.isVegan = parsedResult.isVegan.toLowerCase() === 'true';
        } else {
          parsedResult.isVegan = false; // Default
        }
      }
      
      // Ensure confidence is a number between 0 and 1
      if (typeof parsedResult.confidence !== 'number' || parsedResult.confidence < 0 || parsedResult.confidence > 1) {
        parsedResult.confidence = 0.5; // Default
      }
      
      // Store detected languages if available
      const detectedLanguages = parsedResult.detectedLanguages || [];
      
      // Validate and correct ingredient classifications using our database
      this.validateIngredients(parsedResult.ingredients);
      
      // Process multilingual ingredients (deduplicate and translate)
      this.processMultilingualIngredients(parsedResult.ingredients, detectedLanguages);
      
      // Additional logging for debugging
      logger.info('Parsed ingredients data', { 
        ingredientsData: JSON.stringify(parsedResult.ingredients)
      });
      
      // Re-evaluate overall vegan status based on corrected ingredients
      const nonVeganIngredients = parsedResult.ingredients.filter((i: any) => !i.isVegan);
      parsedResult.isVegan = nonVeganIngredients.length === 0;
      
      return parsedResult as VideoAnalysisResult;
    } catch (error) {
      logger.error('Error parsing analysis result', { error });
      throw new Error('Failed to parse analysis result from AI');
    }
  }
  
  /**
   * Validate and correct ingredient classifications using our database
   * @param ingredients List of ingredients to validate
   */
  private validateIngredients(ingredients: any[]): void {
    if (!ingredients || !Array.isArray(ingredients)) return;
    
    logger.debug('Validating ingredient classifications', { 
      ingredientCount: ingredients.length 
    });
    
    for (const ingredient of ingredients) {
      if (!ingredient.name) continue;
      
      // Store original values for logging
      const originalIsVegan = ingredient.isVegan;
      
      // Check against our database of known ingredients
      const veganStatus = isIngredientVegan(ingredient.name);
      
      // Only override if we have definitive knowledge about this ingredient
      if (veganStatus !== null) {
        ingredient.isVegan = veganStatus;
        ingredient.confidence = 0.98; // High confidence for database matches
        
        // Log if we corrected the AI's classification
        if (originalIsVegan !== ingredient.isVegan) {
          logIngredientCorrection({
            ingredient: ingredient.name,
            originalStatus: originalIsVegan,
            correctedStatus: ingredient.isVegan,
            reason: 'Database match',
            confidence: ingredient.confidence
          });
        }
      }
    }
  }
  
  /**
   * Process multilingual ingredients to deduplicate and translate to Swedish
   * @param ingredients List of ingredients to process
   * @param detectedLanguages Languages detected on the packaging
   */
  private processMultilingualIngredients(ingredients: any[], detectedLanguages: string[]): void {
    if (!ingredients || !Array.isArray(ingredients) || ingredients.length === 0) return;
    
    // Set to track processed ingredient names (case-insensitive)
    const processedNames = new Set<string>();
    const uniqueIngredients: any[] = [];
    
    // Map to store best translation for each ingredient
    const translationMap = new Map<string, any>();
    
    // Process each ingredient
    for (const ingredient of ingredients) {
      if (!ingredient.name) continue;
      
      // Try to translate to Swedish
      const originalName = ingredient.name;
      const translatedName = translateToSwedish(originalName);
      
      // Normalize for deduplication
      const normalizedName = translatedName.toLowerCase().trim();
      
      // If we already have this ingredient (after translation), skip it
      if (processedNames.has(normalizedName)) {
        // If we have a higher confidence value, update the existing entry
        const existing = translationMap.get(normalizedName);
        if (existing && ingredient.confidence > existing.confidence) {
          existing.confidence = ingredient.confidence;
          existing.isVegan = ingredient.isVegan;
        }
        continue;
      }
      
      // Mark as processed
      processedNames.add(normalizedName);
      
      // Create a new ingredient object with translation
      const processedIngredient = {
        ...ingredient,
        name: translatedName,
        originalName: originalName !== translatedName ? originalName : undefined
      };
      
      // Store in map and unique list
      translationMap.set(normalizedName, processedIngredient);
      uniqueIngredients.push(processedIngredient);
    }
    
    // Replace the original array with deduplicated ingredients
    ingredients.length = 0;
    ingredients.push(...uniqueIngredients);
    
    logger.debug('Processed multilingual ingredients', {
      originalCount: processedNames.size,
      finalCount: uniqueIngredients.length,
      detectedLanguages
    });
  }
  
  /**
   * Extract ingredients from text when JSON parsing fails
   */
  private extractIngredientsFromText(text: string): IngredientAnalysisResult[] {
    const ingredientsList: IngredientAnalysisResult[] = [];
    
    // Look for ingredient lists in the text
    const lines = text.split('\n');
    let inIngredientList = false;
    
    for (const line of lines) {
      const trimmedLine = line.trim();
      
      // Check if this line could be starting an ingredient list
      if (trimmedLine.toLowerCase().includes('ingredient') && 
          (trimmedLine.includes(':') || trimmedLine.endsWith(':'))) {
        inIngredientList = true;
        continue;
      }
      
      // If we're in an ingredient list, parse items
      if (inIngredientList && trimmedLine) {
        // Skip empty lines and list markers
        if (trimmedLine === '-' || trimmedLine === '*' || !trimmedLine) continue;
        
        // Check if we've reached the end of the list
        if (trimmedLine.toLowerCase().startsWith('vegan:') || 
            trimmedLine.toLowerCase().startsWith('confidence:')) {
          inIngredientList = false;
          continue;
        }
        
        // Parse the ingredient line
        let ingredientName = trimmedLine;
        // Remove list markers
        ingredientName = ingredientName.replace(/^[-*]\s*/, '');
        
        // Check for vegan status in the line
        const isVegan = !ingredientName.toLowerCase().includes('non-vegan') && 
                        !ingredientName.toLowerCase().includes('animal');
        
        ingredientsList.push({
          name: ingredientName,
          isVegan: isVegan,
          confidence: 0.7 // Default confidence for this extraction method
        });
      }
    }
    
    return ingredientsList;
  }
  
  /**
   * Build a prompt for the AI to analyze food product ingredients
   * Enhanced to properly handle veganism classification and multilingual packaging
   */
  private buildAnalysisPrompt(language: string): string {
    // Prompt optimized for Gemini to handle multilingual ingredients and vegan classification
    if (language === 'sv') {
      return `
Du är en expert på att analysera matprodukter och identifiera deras ingredienser.

INSTRUKTIONER:
1. Analysera videon NOGGRANT. Leta efter alla ingredienser som visas på förpackningen.
2. Titta igenom hela videon. Om det finns en ingredienslista eller näringsinnehåll, fokusera på den.
3. Identifiera ALLA ord i ingredienslistan. Var extra uppmärksam på korta ingredienser som "salt", "olja", "vatten", etc.
4. Var speciellt noggrann med att identifiera alla animaliska ingredienser.
5. VIKTIGT: Var mycket noggrann med veganska bedömningar. Markera endast ingredienser som "isVegan": false om de DEFINITIVT kommer från djur.
   - Animaliska ingredienser inkluderar: ägg, mjölk, ost, grädde, kött, fisk, gelatin, honung, etc.
   - Växtbaserade ingredienser som sojabaserade produkter (tofu, tempeh, sojasås, etc) är ALLTID veganska.
6. Om det finns flera språk på förpackningen:
   - Identifiera den svenska ingredienslistan om möjligt
   - Undvik att lista samma ingrediens flera gånger på olika språk
   - Ge alltid den svenska versionen om tillgänglig, annars originalet
   - Varje ingrediens ska endast listas en gång (ingen duplicering)

SVARA ENDAST MED ETT JSON-OBJEKT i detta format:
\`\`\`json
{
  "ingredients": [
    {
      "name": "ingrediensnamn",
      "isVegan": true/false,
      "confidence": 0.0-1.0
    },
    ...
  ],
  "isVegan": true/false,
  "confidence": 0.0-1.0,
  "detectedLanguages": ["sv", "en", "de", ...] // Lista över språk du upptäckt på förpackningen
}
\`\`\`

EXEMPEL PÅ KORREKT SVAR:
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
      "name": "Salt",
      "isVegan": true,
      "confidence": 0.99
    }
  ],
  "isVegan": true,
  "confidence": 0.97,
  "detectedLanguages": ["sv", "en"]
}
\`\`\`

Se till att:
1. ALLTID följa det exakta JSON-formatet
2. Ordningen på fälten ska vara: "name", "isVegan", "confidence" för varje ingrediens
3. Identifiera ALLA ingredienser, även de kortaste som "salt"
4. Ange "confidence" som ett nummer mellan 0 och 1
5. Inkludera ALLA ingredienser du kan identifiera i videon
6. Undvika duplicerade ingredienser även om de nämns på flera språk
7. Korrekta klassifikationer av veganska/icke-veganska ingredienser, särskilt för sojabaserade produkter
`;
    } else {
      // Default to English with similar improvements
      return `
You are an expert at analyzing food products and identifying their ingredients.

INSTRUCTIONS:
1. Carefully analyze the video. Look for all ingredients shown on the packaging.
2. Look through the entire video. If there's an ingredient list or nutritional information, focus on that.
3. Identify ALL words in the ingredient list. Pay extra attention to short ingredients like "salt", "oil", "water", etc.
4. Be especially thorough in identifying any animal-derived ingredients.
5. IMPORTANT: Be very precise with vegan assessments. Only mark ingredients as "isVegan": false if they DEFINITELY come from animals.
   - Animal ingredients include: eggs, milk, cheese, cream, meat, fish, gelatin, honey, etc.
   - Plant-based ingredients like soy-based products (tofu, tempeh, soy sauce, etc.) are ALWAYS vegan.
6. If multiple languages appear on the packaging:
   - Identify the main language of the product
   - Avoid listing the same ingredient multiple times in different languages
   - If an ingredient appears in Swedish, prefer that version
   - Each ingredient should only be listed once (no duplication)

RESPOND ONLY WITH A JSON OBJECT in this format:
\`\`\`json
{
  "ingredients": [
    {
      "name": "ingredient name",
      "isVegan": true/false,
      "confidence": 0.0-1.0
    },
    ...
  ],
  "isVegan": true/false,
  "confidence": 0.0-1.0,
  "detectedLanguages": ["en", "sv", "de", ...] // List of languages detected on packaging
}
\`\`\`

EXAMPLE OF CORRECT RESPONSE:
\`\`\`json
{
  "ingredients": [
    {
      "name": "Corn kernels",
      "isVegan": true,
      "confidence": 0.98
    },
    {
      "name": "Palm oil",
      "isVegan": true,
      "confidence": 0.95
    },
    {
      "name": "Salt",
      "isVegan": true,
      "confidence": 0.99
    }
  ],
  "isVegan": true,
  "confidence": 0.97,
  "detectedLanguages": ["en", "fr"]
}
\`\`\`

Make sure to:
1. ALWAYS follow the exact JSON format
2. The order of fields should be: "name", "isVegan", "confidence" for each ingredient
3. Identify ALL ingredients, even the shortest ones like "salt"
4. Specify "confidence" as a number between 0 and 1
5. Include ALL ingredients you can identify in the video
6. Avoid duplicate ingredients even if they appear in multiple languages
7. Correctly classify vegan/non-vegan ingredients, especially for soy-based products
`;
    }
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