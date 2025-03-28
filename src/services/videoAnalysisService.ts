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
   * Build prompt for Gemini to analyze video
   */
  private buildAnalysisPrompt(language: string): string {
    const basePrompt = language === 'sv' ? 
      `Du är en expert på att analysera matvaror och ingredienser från video. Din uppgift är att analysera videon och identifiera alla ingredienser som visas.

Analysera den tillhandahållna videon och identifiera alla ingredienser som visas. Svara med en JSON-struktur i följande format:

\`\`\`json
{
  "ingredients": [
    {
      "name": "ingrediensnamn",
      "isVegan": boolean,
      "confidence": number mellan 0 och 1
    }
  ],
  "isVegan": boolean,
  "confidence": number mellan 0 och 1
}
\`\`\`

Var extra uppmärksam på:
1. Alla synliga ingredienser
2. Förpackningar och etiketter som visas
3. Om det finns några animaliska ingredienser (mjölk, ägg, kött, etc.)

Svara ENDAST med JSON-data enligt formatet ovan. Lägg inte till några förklaringar eller övrig text.` :
      
      `You are an expert at analyzing food products and ingredients from video. Your task is to analyze the video and identify all ingredients shown.

Analyze the provided video and identify all ingredients shown. Respond with a JSON structure in the following format:

\`\`\`json
{
  "ingredients": [
    {
      "name": "ingredient name",
      "isVegan": boolean,
      "confidence": number between 0 and 1
    }
  ],
  "isVegan": boolean,
  "confidence": number between 0 and 1
}
\`\`\`

Pay special attention to:
1. All visible ingredients
2. Packaging and labels shown
3. If there are any animal-derived ingredients (milk, eggs, meat, etc.)

Respond ONLY with the JSON data as per the format above. Do not add any explanations or additional text.`;
    
    return basePrompt;
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