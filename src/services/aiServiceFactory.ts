import { AIProvider } from '../types/aiProvider';
import config from '../config/ai-config';
import { logger } from '../utils/logger';

// Dynamic import for lazy-loading
let geminiService: AIProvider | null = null;
let claudeService: AIProvider | null = null;

export class AIServiceFactory {
  /**
   * Returns the current active AI service based on configuration
   */
  static async getService(): Promise<AIProvider> {
    const provider = config.provider.toLowerCase();
    
    logger.info(`Getting AI service for provider: ${provider}`);
    
    switch (provider) {
      case 'gemini':
        if (!geminiService) {
          // Dynamic import to load the Gemini service on demand
          const GeminiModule = await import('./geminiService');
          geminiService = GeminiModule.default;
        }
        return geminiService;
        
      case 'claude':
        if (!claudeService) {
          // Dynamic import to load the Claude service on demand
          const ClaudeModule = await import('./claudeService');
          claudeService = ClaudeModule.default;
        }
        return claudeService;
        
      default:
        logger.warn(`Unknown AI provider: ${provider}, defaulting to Gemini`);
        if (!geminiService) {
          const GeminiModule = await import('./geminiService');
          geminiService = GeminiModule.default;
        }
        return geminiService;
    }
  }
}

export default AIServiceFactory;