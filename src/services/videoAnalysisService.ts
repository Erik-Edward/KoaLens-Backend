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
    try {
      // Attempt to parse JSON from the result
      // First, find a JSON block if it exists
      const jsonMatch = result.match(/```json\s*([\s\S]*?)\s*```/) || 
                        result.match(/\{[\s\S]*\}/);
      
      let parsedResult: any;
      
      if (jsonMatch) {
        // Extract the JSON content from the match
        const jsonContent = jsonMatch[1] || jsonMatch[0];
        // Sanera JSON-strängen - ta bort oönskade tecken som kan orsaka parsningsfel
        const sanitizedJson = jsonContent
          .replace(/\n/g, ' ')
          .replace(/\r/g, ' ')
          .replace(/\t/g, ' ')
          .replace(/\\/g, '\\\\')
          .replace(/"/g, '\\"')
          .replace(/true\/false/g, 'true') // Ersätt instruktionstext (om den finns)
          .replace(/0\.0-1\.0/g, '0.5');   // Ersätt instruktionstext (om den finns)
        
        try {
          parsedResult = JSON.parse(sanitizedJson);
          logger.debug('Parsed JSON result', { 
            fullParsedResult: JSON.stringify(parsedResult)
          });
        } catch (jsonError) {
          // Om JSON-parsning misslyckas, försök med en mindre strikt approach
          logger.warn('JSON parsing failed, trying to extract with regex', { jsonError });
          parsedResult = this.extractWithRegex(jsonContent);
        }
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
        logger.warn('No ingredients found or invalid structure, creating empty array');
        parsedResult.ingredients = [];
      }
      
      // Ensure isVegan is a boolean
      if (typeof parsedResult.isVegan !== 'boolean') {
        if (typeof parsedResult.isVegan === 'string') {
          parsedResult.isVegan = parsedResult.isVegan.toLowerCase() === 'true';
        } else {
          // Om inga ingredienser eller om vi inte har ett isVegan-värde, 
          // behandla som icke-vegansk för säkerhets skull
          parsedResult.isVegan = parsedResult.ingredients.length > 0 ? false : false;
        }
      }
      
      // Ensure confidence is a number between 0 and 1
      if (typeof parsedResult.confidence !== 'number' || parsedResult.confidence < 0 || parsedResult.confidence > 1) {
        parsedResult.confidence = parsedResult.ingredients.length > 0 ? 0.5 : 0.0;
      }
      
      // För loggning, spara detekterade språk om de finns
      const detectedLanguages = parsedResult.detectedLanguages;
      if (detectedLanguages && Array.isArray(detectedLanguages) && detectedLanguages.length > 0) {
        logger.debug('Languages detected by AI', { detectedLanguages });
      }
      
      // Validate and correct ingredient classifications using our database
      const { hasNonVegan, hasUncertain, uncertainReasons } = this.validateIngredients(parsedResult.ingredients);
      
      // Process and deduplicate ingredients
      this.processMultilingualIngredients(parsedResult.ingredients, detectedLanguages);
      
      // Om vi fortfarande inte har några ingredienser, returnera ett tomt resultat
      if (parsedResult.ingredients.length === 0) {
        logger.warn('No ingredients found after processing');
        return {
          ingredients: [],
          isVegan: false,
          isUncertain: false,
          confidence: 0.0,
          reasoning: 'Inga ingredienser kunde identifieras'
        };
      }
      
      // Additional logging for debugging
      logger.info('Parsed ingredients data', { 
        ingredientsData: JSON.stringify(parsedResult.ingredients)
      });
      
      // Re-evaluate overall vegan status based on corrected ingredients
      const nonVeganIngredients = parsedResult.ingredients.filter((i: any) => !i.isVegan);
      
      // Bestäm den slutliga statusen för produkten
      let isVegan = false;
      let isUncertain = false;
      
      if (hasNonVegan) {
        // Om det finns definitiva icke-veganska ingredienser är produkten inte vegansk
        isVegan = false;
        isUncertain = false;
      } else if (hasUncertain) {
        // Om det finns osäkra ingredienser men inga definitiva icke-veganska,
        // markerar vi produkten som "osäker"
        isVegan = false;
        isUncertain = true;
      } else if (nonVeganIngredients.length === 0) {
        // Om det inte finns några icke-veganska eller osäkra ingredienser,
        // markeras produkten som vegansk
        isVegan = true;
        isUncertain = false;
      } else {
        // Annars, om AI har klassat några ingredienser som icke-veganska
        // som vi inte har korrigerat, markeras produkten som icke-vegansk
        isVegan = false;
        isUncertain = false;
      }
      
      // Ta bort detectedLanguages om det finns kvar i resultatet
      delete parsedResult.detectedLanguages;
      
      // Skapa reasoning-text baserat på vegan-status och osäkerhet
      let reasoning = '';
      if (isVegan) {
        reasoning = 'Alla ingredienser är veganska';
      } else if (isUncertain) {
        reasoning = 'Osäker vegan-status: ' + uncertainReasons.join('; ');
      } else if (nonVeganIngredients.length > 0) {
        const nonVeganNames = nonVeganIngredients.map((i: IngredientAnalysisResult) => i.name).join(', ');
        reasoning = `Innehåller icke-veganska ingredienser: ${nonVeganNames}`;
      }
      
      return {
        ...parsedResult,
        isVegan,
        isUncertain,
        uncertainReasons: uncertainReasons.length > 0 ? uncertainReasons : undefined,
        reasoning: reasoning || parsedResult.reasoning
      } as VideoAnalysisResult;
    } catch (error) {
      logger.error('Error parsing analysis result', { error });
      // Returnera ett tomt men giltigt resultat vid fel
      return {
        ingredients: [],
        isVegan: false,
        isUncertain: false,
        confidence: 0.0,
        reasoning: 'Ett fel uppstod vid analys av ingredienser'
      };
    }
  }
  
  /**
   * Försök extrahera JSON med regex när vanlig parsning misslyckas
   */
  private extractWithRegex(text: string): any {
    const result: any = {
      ingredients: [],
      isVegan: false,
      confidence: 0.5
    };
    
    // Försök hitta ingredienslistan
    const ingredientsMatch = text.match(/"ingredients"\s*:\s*\[([\s\S]*?)\]/);
    if (ingredientsMatch && ingredientsMatch[1]) {
      // Hitta alla individuella ingrediensobjekt
      const ingredientMatches = ingredientsMatch[1].match(/{[\s\S]*?}/g);
      if (ingredientMatches) {
        ingredientMatches.forEach(ingredientText => {
          try {
            // Extrahera namn
            const nameMatch = ingredientText.match(/"name"\s*:\s*"([^"]*)"/);
            // Extrahera isVegan
            const isVeganMatch = ingredientText.match(/"isVegan"\s*:\s*(true|false)/);
            // Extrahera confidence
            const confidenceMatch = ingredientText.match(/"confidence"\s*:\s*([0-9.]*)/);
            
            if (nameMatch && nameMatch[1]) {
              const ingredient = {
                name: nameMatch[1],
                isVegan: isVeganMatch && isVeganMatch[1] === 'true' ? true : false,
                confidence: confidenceMatch && !isNaN(parseFloat(confidenceMatch[1])) 
                  ? parseFloat(confidenceMatch[1]) 
                  : 0.5
              };
              result.ingredients.push(ingredient);
            }
          } catch (e) {
            logger.warn('Failed to parse ingredient with regex', { ingredientText, error: e });
          }
        });
      }
    }
    
    // Extrahera isVegan för hela produkten
    const isVeganMatch = text.match(/"isVegan"\s*:\s*(true|false)/);
    if (isVeganMatch && isVeganMatch[1]) {
      result.isVegan = isVeganMatch[1] === 'true';
    }
    
    // Extrahera confidence för hela produkten
    const confidenceMatch = text.match(/"confidence"\s*:\s*([0-9.]*)/);
    if (confidenceMatch && !isNaN(parseFloat(confidenceMatch[1]))) {
      result.confidence = parseFloat(confidenceMatch[1]);
    }
    
    return result;
  }
  
  /**
   * Validate and correct ingredient classifications using our database
   * @param ingredients List of ingredients to validate
   * @returns Information om produktens veganska status baserat på ingredienserna
   */
  private validateIngredients(ingredients: any[]): {
    hasNonVegan: boolean;
    hasUncertain: boolean;
    uncertainReasons: string[];
  } {
    if (!ingredients || !Array.isArray(ingredients)) {
      return { hasNonVegan: false, hasUncertain: false, uncertainReasons: [] };
    }
    
    logger.debug('Validating ingredient classifications', { 
      ingredientCount: ingredients.length 
    });
    
    let hasNonVegan = false;
    let hasUncertain = false;
    const uncertainReasons: string[] = [];
    
    for (const ingredient of ingredients) {
      if (!ingredient.name) continue;
      
      // Store original values for logging
      const originalIsVegan = ingredient.isVegan;
      
      // Check against our database of known ingredients
      const { isVegan, isUncertain, reason } = checkIngredientStatus(ingredient.name);
      
      // Uppdatera ingrediensens status baserat på databasen
      if (isVegan !== null) {
        // Vi har definitiv information (vegansk eller icke-vegansk)
        ingredient.isVegan = isVegan;
        ingredient.confidence = 0.98; // High confidence for database matches
        
        // Markera om produkten innehåller icke-veganska ingredienser
        if (!isVegan) {
          hasNonVegan = true;
        }
        
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
      } else if (isUncertain) {
        // Vi är osäkra på denna ingrediens (kan vara vegansk eller ej)
        ingredient.isVegan = false; // Sätt till false för säkerhets skull i gränssnittet
        ingredient.isUncertain = true; // Markera att denna ingrediens är osäker
        hasUncertain = true;
        
        // Spara anledningen till osäkerheten
        if (reason && !uncertainReasons.includes(reason)) {
          uncertainReasons.push(reason);
        }
        
        // Log att vi markerade ingrediensen som osäker
        logIngredientCorrection({
          ingredient: ingredient.name,
          originalStatus: originalIsVegan,
          correctedStatus: false,
          isUncertain: true,
          reason: reason || 'Uncertain ingredient',
          confidence: 0.5
        });
      }
    }
    
    return { hasNonVegan, hasUncertain, uncertainReasons };
  }
  
  /**
   * Process ingredients to ensure they are in Swedish and deduplicated
   * @param ingredients List of ingredients to process
   */
  private processMultilingualIngredients(ingredients: any[], detectedLanguages?: string[]): void {
    if (!ingredients || !Array.isArray(ingredients) || ingredients.length === 0) return;
    
    // Set to track processed ingredient names (case-insensitive)
    const processedNames = new Set<string>();
    const uniqueIngredients: any[] = [];
    
    // För debugging, logga originalspråken om de identifierats
    if (detectedLanguages && detectedLanguages.length > 0) {
      logger.debug('Detected languages on packaging (for internal logging only)', {
        detectedLanguages
      });
    }
    
    // Process each ingredient
    for (const ingredient of ingredients) {
      if (!ingredient.name) continue;
      
      // Normalisera namn för avduplikering
      const normalizedName = ingredient.name.toLowerCase().trim();
      
      // Om vi redan har denna ingrediens, hoppa över den (efter normalisering)
      if (processedNames.has(normalizedName)) {
        continue;
      }
      
      // Markera som bearbetad
      processedNames.add(normalizedName);
      
      // Ta bort eventuella originalName och detectedLanguage fält
      // eftersom vi inte längre skickar den informationen till frontend
      const processedIngredient = {
        name: ingredient.name,
        isVegan: ingredient.isVegan,
        confidence: ingredient.confidence
      };
      
      // Lägg till i den unika listan
      uniqueIngredients.push(processedIngredient);
    }
    
    // Ersätt originallistan med deduplikerade ingredienser
    ingredients.length = 0;
    ingredients.push(...uniqueIngredients);
    
    logger.debug('Processed ingredients', {
      finalCount: uniqueIngredients.length
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
    
    // Först, försök hitta en struktur som liknar en ingredienslista
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
        
        // Remove list markers if they exist
        ingredientName = ingredientName.replace(/^[-*•]\s*/, '');
        
        // Look for vegan indicators in the line
        let isVegan = true; // Default to vegan
        
        // Kolla efter icke-veganska indikatorer
        if (ingredientName.toLowerCase().includes('non-vegan') || 
            ingredientName.toLowerCase().includes('animal') ||
            ingredientName.toLowerCase().includes('mjölk') ||
            ingredientName.toLowerCase().includes('ägg') ||
            ingredientName.toLowerCase().includes('ost') ||
            ingredientName.toLowerCase().includes('smör') ||
            ingredientName.toLowerCase().includes('honung') ||
            ingredientName.toLowerCase().includes('gelatin')) {
          isVegan = false;
        }
        
        // Om namnet innehåller information om vegansk status, rensa namnet
        ingredientName = ingredientName
          .replace(/\(vegansk\)/i, '')
          .replace(/\(icke-vegansk\)/i, '')
          .replace(/\(non-vegan\)/i, '')
          .replace(/\(vegan\)/i, '')
          .trim();
        
        // Försök identifiera ett konfidenstal om det finns
        let confidence = 0.7; // Default
        const confidenceMatch = ingredientName.match(/\(konfidensgrad:?\s*([0-9.]+)\)/i);
        if (confidenceMatch && confidenceMatch[1]) {
          const parsedConfidence = parseFloat(confidenceMatch[1]);
          if (!isNaN(parsedConfidence)) {
            confidence = parsedConfidence <= 1 ? parsedConfidence : parsedConfidence / 100;
            // Ta bort konfidenstexten från namnet
            ingredientName = ingredientName.replace(/\(konfidensgrad:?\s*[0-9.]+\)/i, '').trim();
          }
        }
        
        // Lägg till ingrediensen om vi har ett meningsfullt namn
        if (ingredientName && ingredientName.length > 1) {
          ingredientsList.push({
            name: ingredientName,
            isVegan: isVegan,
            confidence: confidence
          });
        }
      }
    }
    
    // Fallback: Om vi inte hittade någon ingredienslista, försök identifiera individuella ingredienser
    if (ingredientsList.length === 0) {
      // Vanliga inledare för ingredienssektioner
      const ingredientKeywords = [
        'ingredienser:', 'ingredients:', 'innehåll:', 'innehåller:',
        'ingredienser är:', 'ingredients are:'
      ];
      
      // Hitta en potentiell ingredienssektion
      let ingredientSection = '';
      for (const keyword of ingredientKeywords) {
        const keywordIndex = text.toLowerCase().indexOf(keyword);
        if (keywordIndex !== -1) {
          ingredientSection = text.substring(keywordIndex + keyword.length);
          break;
        }
      }
      
      if (ingredientSection) {
        // Dela upp texten och hitta potentiella ingredienser
        const items = ingredientSection.split(/[,.;:\n()\/]+/);
        for (const item of items) {
          const trimmedItem = item.trim();
          // Ignorera för korta strängar och siffror
          if (trimmedItem.length > 2 && !/^\d+$/.test(trimmedItem)) {
            // Kolla om denna ingrediens är vegansk baserat på vissa nyckelord
            const isVegan = !(
              trimmedItem.toLowerCase().includes('mjölk') ||
              trimmedItem.toLowerCase().includes('ägg') ||
              trimmedItem.toLowerCase().includes('ost') ||
              trimmedItem.toLowerCase().includes('kött') ||
              trimmedItem.toLowerCase().includes('fisk') ||
              trimmedItem.toLowerCase().includes('honung') ||
              trimmedItem.toLowerCase().includes('gelatin')
            );
            
            ingredientsList.push({
              name: trimmedItem,
              isVegan: isVegan,
              confidence: 0.6 // Lägre konfidensgrad för denna fallback-metod
            });
            
            // Begränsa till 20 ingredienser för att undvika att hitta för många falska positiva
            if (ingredientsList.length >= 20) break;
          }
        }
      }
    }
    
    // Rensa och deduplicera för säkerhets skull
    const uniqueIngredients: IngredientAnalysisResult[] = [];
    const seenNames = new Set<string>();
    
    for (const ingredient of ingredientsList) {
      const normalizedName = ingredient.name.toLowerCase().trim();
      if (normalizedName && !seenNames.has(normalizedName)) {
        seenNames.add(normalizedName);
        uniqueIngredients.push(ingredient);
      }
    }
    
    logger.debug('Extracted ingredients from text response', {
      extractedCount: uniqueIngredients.length
    });
    
    return uniqueIngredients;
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