import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { v4 as uuidv4 } from 'uuid';
import { logger } from '../utils/logger';
import { VideoOptimizer } from '../utils/videoOptimizer';
import geminiService from './geminiService';

// Type definitions (borrowed from ../types/analysisTypes.ts)
interface IngredientAnalysisResult {
  name: string;
  isVegan: boolean;
  confidence: number;
}

interface VideoAnalysisResult {
  ingredients: IngredientAnalysisResult[];
  isVegan: boolean;
  confidence: number;
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
    logger.info('Starting video analysis', { mimeType, preferredLanguage });
    
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
      
      const result = await geminiService.generateContentFromVideo(prompt, videoBase64, 'video/mp4');
      
      // Parse result and ensure it contains required fields
      const analysisResult = this.parseAnalysisResult(result);
      
      logger.info('Video analysis completed successfully', {
        ingredientCount: analysisResult.ingredients?.length || 0,
        isVegan: analysisResult.isVegan,
        confidence: analysisResult.confidence
      });
      
      // Clean up temp files
      this.cleanupTempFiles(tempVideoPath, optimizedVideoPath);
      
      return analysisResult;
    } catch (error: any) {
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
      
      // Additional logging for debugging
      logger.info('Parsed ingredients data', { 
        ingredientsData: JSON.stringify(parsedResult.ingredients)
      });
      
      return parsedResult as VideoAnalysisResult;
    } catch (error) {
      logger.error('Error parsing analysis result', { error });
      throw new Error('Failed to parse analysis result from AI');
    }
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
   * Build the prompt for video analysis
   * @param language Preferred language for the prompt
   * @returns Prompt for the AI to analyze the video
   */
  private buildAnalysisPrompt(language: string): string {
    // Prompt optimized for Gemini 2.0 Flash and structured output
    if (language === 'sv') {
      return `
Du är en expert på att analysera matprodukter och identifiera deras ingredienser.

INSTRUKTIONER:
1. Analysera videon NOGGRANT. Leta efter alla ingredienser som visas på förpackningen.
2. Titta igenom hela videon. Om det finns en ingredienslista eller näringsinnehåll, fokusera på den.
3. Identifiera ALLA ord i ingredienslistan. Var extra uppmärksam på korta ingredienser som "salt", "olja", "vatten", etc.
4. Var speciellt noggrann med att identifiera alla animaliska ingredienser.
5. Missa inte vanliga ingredienser som "palmolja", "salt", "socker", "konserveringsmedel" etc.
6. Översätt inte ingredienserna - använd dem exakt som de är skrivna.

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
  "confidence": 0.0-1.0
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
  "confidence": 0.97
}
\`\`\`

Se till att:
1. ALLTID följa det exakta JSON-formatet
2. Ordningen på fälten ska vara: "name", "isVegan", "confidence" för varje ingrediens
3. Identifiera ALLA ingredienser, även de kortaste som "salt"
4. Ange "confidence" som ett nummer mellan 0 och 1
5. Inkludera ALLA ingredienser du kan identifiera i videon
`;
    } else {
      // Default to English
      return `
You are an expert at analyzing food products and identifying their ingredients.

INSTRUCTIONS:
1. Carefully analyze the video. Look for all ingredients shown on the packaging.
2. Look through the entire video. If there's an ingredient list or nutritional information, focus on that.
3. Identify ALL words in the ingredient list. Pay extra attention to short ingredients like "salt", "oil", "water", etc.
4. Be especially thorough in identifying any animal-derived ingredients.
5. Don't miss common ingredients like "palm oil", "salt", "sugar", "preservatives" etc.
6. Do not translate ingredients - use them exactly as written.

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
  "confidence": 0.0-1.0
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
  "confidence": 0.97
}
\`\`\`

Make sure to:
1. ALWAYS follow the exact JSON format
2. The order of fields should be: "name", "isVegan", "confidence" for each ingredient
3. Identify ALL ingredients, even the shortest ones like "salt"
4. Specify "confidence" as a number between 0 and 1
5. Include ALL ingredients you can identify in the video
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