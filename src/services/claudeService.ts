import { Anthropic } from '@anthropic-ai/sdk';
import { AIProvider } from '../types/aiProvider';
import config from '../config/ai-config';
import { logger, logAIRequest, logAIResponse } from '../utils/logger';

// Define the Message type locally since it's not exported from the SDK
type Message = {
  role: string;
  content: Array<{
    type: string;
    text?: string;
    source?: {
      type: string;
      media_type: string;
      data: string;
    };
  }>;
};

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
      
      // Create message with text and media content
      const messageContent = [
        {
          role: 'user',
          content: [
            {
              type: 'image',
              source: {
                type: 'base64',
                media_type: mimeType,
                data: mediaBase64,
              },
            },
            {
              type: 'text',
              text: prompt,
            },
          ],
        },
      ];
      
      // Perform API call with multimodal input
      const message = await this.client.messages.create({
        model: this.modelName,
        max_tokens: this.maxTokens,
        temperature: this.temperature,
        messages: messageContent,
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