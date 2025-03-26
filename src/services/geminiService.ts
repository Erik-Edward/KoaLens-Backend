import { GoogleGenerativeAI, HarmCategory, HarmBlockThreshold, GenerationConfig } from '@google/generative-ai';
import { AIProvider } from '../types/aiProvider';
import config from '../config/ai-config';
import { logger, logAIRequest, logAIResponse } from '../utils/logger';

/**
 * Service class to handle all interactions with Google Gemini API
 */
export class GeminiService implements AIProvider {
  private genAI: GoogleGenerativeAI;
  private modelName: string;
  private maxOutputTokens: number;
  private temperature: number;
  private topK: number;
  private topP: number;

  constructor() {
    // Get configuration from environment variables via config module
    this.genAI = new GoogleGenerativeAI(config.gemini.apiKey);
    this.modelName = config.gemini.modelName;
    this.maxOutputTokens = config.gemini.maxOutputTokens;
    this.temperature = config.gemini.temperature;
    this.topK = config.gemini.topK;
    this.topP = config.gemini.topP;

    logger.info('GeminiService initialized', { 
      modelName: this.modelName,
      maxOutputTokens: this.maxOutputTokens 
    });
  }

  /**
   * Generate content from a text prompt
   */
  async generateContent(prompt: string): Promise<string> {
    try {
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
      
      // Perform API call
      const result = await model.generateContent({
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
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
    } catch (error: any) {
      // Implement retry logic for specific errors
      if (error.message && (
          error.message.includes('overloaded') || 
          error.message.includes('rate limit') ||
          error.message.includes('503')
        )) {
        logger.warn('Gemini API overloaded, retrying once after delay...', { error: error.message });
        
        // Wait for 2 seconds and retry once
        await new Promise(resolve => setTimeout(resolve, 2000));
        try {
          return await this.retryGenerateContent(prompt);
        } catch (retryError: any) {
          logger.error('Gemini API retry also failed', { error: retryError.message });
          throw new Error(`Gemini API overloaded and retry failed: ${retryError.message}`);
        }
      }
      
      logger.error('Gemini API error', { error: error.message, stack: error.stack });
      throw new Error(`Gemini API error: ${error.message}`);
    }
  }

  /**
   * Simplified retry method with fewer settings to reduce chances of failure
   */
  private async retryGenerateContent(prompt: string): Promise<string> {
    const model = this.genAI.getGenerativeModel({ model: this.modelName });
    
    // Use more conservative generation config for retry
    const generationConfig: GenerationConfig = {
      temperature: Math.max(0.1, this.temperature - 0.2),
      maxOutputTokens: this.maxOutputTokens,
    };
    
    logAIRequest('gemini-retry', { prompt, generationConfig });
    
    const result = await model.generateContent({
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      generationConfig,
    });
    
    const text = result.response.text();
    return text;
  }

  /**
   * Analyze image/video and generate content
   */
  async generateContentFromMedia(prompt: string, mediaBase64: string, mimeType: string): Promise<string> {
    try {
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
      
      // Perform API call with multimodal input
      const result = await model.generateContent({
        contents: [{ role: 'user', parts: [{ text: prompt }, mediaPart] }],
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
      // Handle media-specific errors
      if (error.message && (
        error.message.includes('payload too large') || 
        error.message.includes('content size') || 
        error.message.includes('exceeds maximum')
      )) {
        logger.error('Gemini API media size error', { error: error.message });
        throw new Error('Media file too large for analysis. Please try with a smaller or compressed image.');
      }
      
      logger.error('Gemini API media processing error', { error: error.message, stack: error.stack });
      throw new Error(`Gemini API media processing error: ${error.message}`);
    }
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
}

// Export singleton instance
export default new GeminiService();