import { Anthropic } from '@anthropic-ai/sdk';
import { AIProvider } from '../types/aiProvider';
import config from '../config/ai-config';
import { logger, logAIRequest, logAIResponse } from '../utils/logger';

/**
 * Service class to handle all interactions with Anthropic Claude API
 */
export class ClaudeService implements AIProvider {
  private client: Anthropic;
  private modelName: string;
  private maxTokens: number;
  private temperature: number;

  constructor() {
    // Get configuration from environment variables via config module
    this.client = new Anthropic({
      apiKey: config.claude.apiKey,
    });
    this.modelName = config.claude.modelName;
    this.maxTokens = config.claude.maxTokens;
    this.temperature = config.claude.temperature;

    logger.info('ClaudeService initialized', { 
      modelName: this.modelName,
      maxTokens: this.maxTokens 
    });
  }

  /**
   * Generate content from a text prompt
   */
  async generateContent(prompt: string): Promise<string> {
    try {
      // Log request for monitoring
      logAIRequest('claude', { 
        prompt, 
        modelName: this.modelName,
        maxTokens: this.maxTokens,
        temperature: this.temperature
      });
      
      // Perform API call
      const message = await this.client.messages.create({
        model: this.modelName,
        max_tokens: this.maxTokens,
        temperature: this.temperature,
        messages: [
          {
            role: 'user',
            content: prompt
          }
        ],
      });
      
      const content = message.content[0];
      if (content.type !== 'text') {
        throw new Error('Unexpected response type from Claude API');
      }
      
      const text = content.text;
      
      // Log response for monitoring
      logAIResponse('claude', { 
        responseText: text.substring(0, 100) + (text.length > 100 ? '...' : ''),
        usage: message.usage,
      });
      
      return text;
    } catch (error: any) {
      logger.error('Claude API error', { error: error.message, stack: error.stack });
      throw new Error(`Claude API error: ${error.message}`);
    }
  }

  /**
   * Analyze image/video and generate content
   */
  async generateContentFromMedia(prompt: string, mediaBase64: string, mimeType: string): Promise<string> {
    try {
      // Log request for monitoring
      logAIRequest('claude', { 
        prompt, 
        mediaType: mimeType,
        mediaSizeBytes: mediaBase64.length * 0.75, // Approximation of Base64 size
        modelName: this.modelName,
        maxTokens: this.maxTokens,
        temperature: this.temperature
      });
      
      // Ensure the mime type is one of the supported types
      const supportedTypes = ["image/jpeg", "image/png", "image/gif", "image/webp"] as const;
      type SupportedMediaType = typeof supportedTypes[number];
      
      // Default to image/jpeg if the provided type is not supported
      let mediaType: SupportedMediaType = "image/jpeg";
      if (supportedTypes.includes(mimeType as SupportedMediaType)) {
        mediaType = mimeType as SupportedMediaType;
      }
      
      // Use proper Anthropic message format for media content
      const message = await this.client.messages.create({
        model: this.modelName,
        max_tokens: this.maxTokens,
        temperature: this.temperature,
        messages: [
          {
            role: 'user',
            content: [
              {
                type: 'image',
                source: {
                  type: 'base64',
                  media_type: mediaType,
                  data: mediaBase64
                }
              },
              {
                type: 'text',
                text: prompt
              }
            ]
          }
        ]
      });
      
      const content = message.content[0];
      if (content.type !== 'text') {
        throw new Error('Unexpected response type from Claude API');
      }
      
      const text = content.text;
      
      // Log response for monitoring
      logAIResponse('claude', { 
        responseText: text.substring(0, 100) + (text.length > 100 ? '...' : ''),
        usage: message.usage,
      });
      
      return text;
    } catch (error: any) {
      logger.error('Claude API media processing error', { error: error.message, stack: error.stack });
      throw new Error(`Claude API media processing error: ${error.message}`);
    }
  }

  /**
   * Generate content from text and video
   * Note: Claude does not support video processing directly, this method throws an error
   * @param prompt The text prompt to guide the video analysis
   * @param videoBase64 The base64-encoded video data
   * @param mimeType The MIME type of the video
   * @returns Promise resolving to the generated content
   * @throws Error since Claude does not support video processing
   */
  async generateContentFromVideo(prompt: string, videoBase64: string, mimeType: string = 'video/mp4'): Promise<string> {
    logger.error('Video processing attempted with Claude API, which does not support video', { 
      promptLength: prompt.length,
      videoDataSize: videoBase64.length,
      mimeType
    });
    
    throw new Error('Claude API does not support video processing. Please use Gemini for video analysis.');
  }

  /**
   * Count tokens for a prompt (approximate estimate)
   * Claude doesn't have a direct countTokens method, so we use an estimate
   */
  async countTokens(prompt: string): Promise<number> {
    try {
      // Claude doesn't have a countTokens endpoint, so we estimate
      // A very rough approximation is 1 token = 4 characters
      return Math.ceil(prompt.length / 4);
    } catch (error: any) {
      logger.error('Claude token counting error', { error: error.message });
      return Math.ceil(prompt.length / 4);
    }
  }
}

// Export singleton instance
export default new ClaudeService();