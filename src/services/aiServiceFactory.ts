import { AIProvider } from '../types/aiProvider';
import config from '../config/ai-config';
import { logger } from '../utils/logger';

// Dynamic import for lazy-loading
let geminiService: AIProvider | null = null;
let claudeService: AIProvider | null = null;

export class AIServiceFactory {
  /**
   * Returns the Gemini AI service - Claude service kept for backward compatibility
   * but no longer actively used
   */
  static async getService(): Promise<AIProvider> {
    // Always use Gemini regardless of config
    if (!geminiService) {
      // Dynamic import to load the Gemini service on demand
      const GeminiModule = await import('./geminiService');
      geminiService = GeminiModule.default;
      logger.info('Initialized Gemini service');
    }
    return geminiService;
  }
}

export default AIServiceFactory;