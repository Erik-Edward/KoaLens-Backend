import { GoogleGenerativeAI, HarmCategory, HarmBlockThreshold, GenerationConfig, GenerateContentResult, FunctionDeclarationsTool } from '@google/generative-ai';
import { AIProvider } from '../types/aiProvider';
import config from '../config/ai-config';
import { logger, logAIRequest, logAIResponse } from '../utils/logger';

// Validate environment variables from the imported config
if (!config.gemini.apiKey) {
    logger.error("Missing GEMINI_API_KEY environment variable.");
    process.exit(1);
}

/**
 * Service class to handle all interactions with Google Gemini 2.5 Pro API
 */
export class GeminiService implements AIProvider {
  private genAI: GoogleGenerativeAI;
  private modelName: string;
  private maxOutputTokens: number;
  private temperature: number;
  private topK: number;
  private topP: number;
  private maxRetries: number = 2;
  private retryDelay: number = 1000;

  constructor() {
    // Get configuration from the imported config object
    this.genAI = new GoogleGenerativeAI(config.gemini.apiKey);
    this.modelName = config.gemini.modelName;
    this.maxOutputTokens = config.gemini.maxOutputTokens;
    this.temperature = config.gemini.temperature;
    this.topK = config.gemini.topK;
    this.topP = config.gemini.topP;

    logger.info('GeminiService initialized', { 
      modelName: this.modelName,
      maxOutputTokens: this.maxOutputTokens,
      temperature: this.temperature,
      topK: this.topK,
      topP: this.topP,
    });
  }

  /**
   * Generate content from a text prompt with automatic retry on failure
   */
  async generateContent(prompt: string): Promise<string> {
    return this.withRetry(async () => {
      const model = this.genAI.getGenerativeModel({ model: this.modelName });
      
      // Configure safety settings
      const safetySettings = [
        {
          category: HarmCategory.HARM_CATEGORY_HARASSMENT,
          threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE,
        },
        {
          category: HarmCategory.HARM_CATEGORY_HATE_SPEECH,
          threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE,
        },
        {
          category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT,
          threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE,
        },
        {
          category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT,
          threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE,
        },
      ];
      
      // Configure generation settings
      const generationConfig: GenerationConfig = {
        temperature: this.temperature,
        topK: this.topK,
        topP: this.topP,
        maxOutputTokens: this.maxOutputTokens,
      };
      
      // Log request for monitoring
      logAIRequest('gemini', { prompt, generationConfig });
      
      // Construct the request object correctly for generateContent
      const result = await model.generateContent({
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        safetySettings,
        generationConfig,
      });
      
      const response = result.response;
      const text = response.text();
      
      // Log response for monitoring
      logAIResponse('gemini', { 
        responseText: text.substring(0, 100) + (text.length > 100 ? '...' : ''),
        promptTokens: prompt.length / 4, // Estimate
        completionTokens: text.length / 4 // Estimate
      });
      
      return text;
    });
  }

  /**
   * Retry helper method for API calls
   */
  private async withRetry<T>(fn: () => Promise<T>, retries: number = this.maxRetries): Promise<T> {
    try {
      return await fn();
    } catch (error: any) {
      if (retries > 0) {
        logger.warn('Gemini API call failed, retrying...', { 
          errorMessage: error.message,
          retriesLeft: retries,
          retryDelay: this.retryDelay
        });
        
        // Wait before retry
        await new Promise(resolve => setTimeout(resolve, this.retryDelay));
        
        // Exponential backoff
        this.retryDelay *= 2;
        
        // Retry with more conservative settings
        return this.withRetry(fn, retries - 1);
      } else {
        logger.error('Gemini API call failed after retries', { error: error.message });
        throw error;
      }
    }
  }

  /**
   * Analyze image/video and generate content with automatic retry
   */
  async generateContentFromMedia(prompt: string, mediaBase64: string, mimeType: string): Promise<string> {
    return this.withRetry(async () => {
      const model = this.genAI.getGenerativeModel({ model: this.modelName });
      
      // Create media part
      const mediaPart = {
        inlineData: {
          data: mediaBase64,
          mimeType: mimeType
        }
      };
      
      // Configure generation settings
      const generationConfig = {
        temperature: this.temperature,
        topK: this.topK,
        topP: this.topP,
        maxOutputTokens: this.maxOutputTokens,
      };
      
      // Log request for monitoring
      logAIRequest('gemini', { 
        prompt, 
        mediaType: mimeType,
        mediaSizeBytes: mediaBase64.length * 0.75, // Approximation of Base64 size
        generationConfig 
      });
      
      try {
        // Construct the request object correctly for generateContent
        const result = await model.generateContent({
          contents: [{ role: "user", parts: [{ text: prompt }, mediaPart] }],
          generationConfig,
        });
        
        const response = result.response;
        const text = response.text();
        
        // Log response for monitoring
        logAIResponse('gemini', { 
          responseText: text.substring(0, 100) + (text.length > 100 ? '...' : ''),
          promptTokens: prompt.length / 4, // Estimate
          mediaTokens: 'Multimodal content', 
          completionTokens: text.length / 4 // Estimate
        });
        
        return text;
      } catch (error: any) {
        // If image might be too large, try with reduced quality settings for retry
        if (error.message.includes('content too large') || error.message.includes('payload size')) {
          throw new Error(`Image too large for processing: ${error.message}`);
        }
        throw error;
      }
    });
  }

  /**
   * Specialized method for video analysis with optimized handling for Gemini 2.5 Pro
   * @param prompt The text prompt to guide the video analysis
   * @param videoBase64 The base64-encoded video data
   * @param mimeType The MIME type of the video, default is video/mp4
   * @param tools Optional tools (like function declarations) to provide to the model
   * @returns Promise resolving to the full GenerateContentResult object
   */
  async generateContentFromVideo(
    prompt: string, 
    videoBase64: string, 
    mimeType: string = 'video/mp4',
    tools?: FunctionDeclarationsTool[]
  ): Promise<GenerateContentResult> {
    return this.withRetry(async () => {
      const model = this.genAI.getGenerativeModel({ model: this.modelName });
      
      // Configure generation settings with video-optimized parameters
      const generationConfig = {
        temperature: this.temperature,
        topK: this.topK,
        topP: this.topP,
        maxOutputTokens: this.maxOutputTokens * 1.5, // Increase for video analysis
      };
      
      // Log request for monitoring
      logAIRequest('gemini', { 
        prompt, 
        mediaType: mimeType,
        mediaSizeBytes: videoBase64.length * 0.75, // Approximation of Base64 size
        generationConfig,
        toolsProvided: !!tools
      });
      
      try {
        // Use the object format to include tools
        const result = await model.generateContent({
          contents: [{
            role: 'user',
            parts: [
              { text: prompt },
              { inlineData: { data: videoBase64, mimeType: mimeType } }
            ]
          }],
          generationConfig,
          tools
        });
        
        const response = result.response;
        const responseText = response.text ? response.text() : '[No text response]';
        const functionCalls = response.functionCalls();

        // Log response for monitoring (adjusted)
        logAIResponse('gemini', { 
          responseText: responseText.substring(0, 100) + (responseText.length > 100 ? '...' : ''),
          promptTokens: prompt.length / 4, // Estimate
          mediaTokens: 'Video content', 
          completionTokens: responseText.length / 4, // Estimate
          functionCallPresent: !!functionCalls && functionCalls.length > 0,
          functionCallNames: functionCalls?.map((fc: { name: string }) => fc.name).join(', ') || 'N/A'
        });
        
        return result;
      } catch (error: any) {
        // Handle video-specific errors
        if (error.message.includes('content too large') || error.message.includes('payload size')) {
          throw new Error(`Video too large for processing: ${error.message}`);
        } else if (error.message.includes('unsupported media type')) {
          throw new Error(`Unsupported video format: ${error.message}`);
        } else if (error.message.includes('model not found') || error.message.includes('model does not support')) {
          throw new Error(`Model does not support video analysis: ${error.message}`);
        }
        
        // Rethrow other errors
        throw error;
      }
    });
  }

  /**
   * Count tokens for a prompt (approximate estimate)
   */
  async countTokens(prompt: string): Promise<number> {
    try {
      const model = this.genAI.getGenerativeModel({ model: this.modelName });
      const result = await model.countTokens({
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
      });
      return result.totalTokens;
    } catch (error: any) {
      logger.error('Gemini token counting error', { error: error.message });
      // Return an estimate if the API call fails
      return Math.ceil(prompt.length / 4);
    }
  }

  async analyzeContent(prompt: string): Promise<string | null> {
    let requestSize = Buffer.byteLength(prompt, 'utf-8'); 
    // Log AI Request (update to reflect removed parameters)
    logAIRequest('gemini', { requestContent: prompt.substring(0, 100) + (prompt.length > 100 ? '...' : ''), requestSize });

    // Construct parts without image or tools
    const parts = [{ text: prompt }];

    try {
      const model = this.genAI.getGenerativeModel({ model: this.modelName });
      const generationConfig = {
        temperature: this.temperature,
        topK: this.topK,
        topP: this.topP,
        maxOutputTokens: this.maxOutputTokens,
      };

      // Construct the request object correctly for generateContent
      const result = await model.generateContent({
        contents: [{ role: "user", parts }],
        generationConfig,
      });

      const response = result.response;
      const text = response.text();

      logAIResponse('gemini', { 
        responseText: text.substring(0, 100) + (text.length > 100 ? '...' : ''),
        promptTokens: prompt.length / 4,
        completionTokens: text.length / 4
      });

      return text;
    } catch (error) {
      logger.error('Gemini analyzeContent error', { error: error.message });
      return null;
    }
  }
}

// Export an instance
const geminiService = new GeminiService();
export default geminiService;