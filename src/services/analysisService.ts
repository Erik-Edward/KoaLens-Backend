import { AIServiceFactory } from './aiServiceFactory';
import promptManager from '../utils/promptManager';
import outputParser, { AnalysisResult } from '../utils/outputParser';
import { logger } from '../utils/logger';
import { ingredientDB } from './ingredientDatabase';
import languageDetector from '../utils/languageDetector';
import { loadTextAnalysisPrompts } from '../config/prompts';
import { loadImagePromptTemplates } from '../config/imagePrompts';
import { imageProcessor } from './imageProcessor';
import { performance } from 'perf_hooks';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';

// Constants for performance monitoring
const PERF_THRESHOLD_WARNING = 5000; // 5 seconds
const PERF_THRESHOLD_ERROR = 15000;  // 15 seconds

// Cache configuration
interface CacheConfig {
  enabled: boolean;
  directory: string;
  ttl: number; // Time to live in milliseconds
}

/**
 * Service for analyzing ingredients and determining vegan status
 */
export class AnalysisService {
  private cacheConfig: CacheConfig;
  
  constructor() {
    // Load the enhanced text analysis templates
    loadTextAnalysisPrompts(promptManager);
    
    // Load the image analysis templates
    loadImagePromptTemplates(promptManager);
    
    // Setup cache configuration
    this.cacheConfig = {
      enabled: process.env.ENABLE_ANALYSIS_CACHE === 'true',
      directory: path.join(process.cwd(), 'cache', 'analysis'),
      ttl: parseInt(process.env.ANALYSIS_CACHE_TTL || '86400000') // Default 24 hours
    };
    
    // Create cache directory
    if (this.cacheConfig.enabled) {
      try {
        if (!fs.existsSync(this.cacheConfig.directory)) {
          fs.mkdirSync(this.cacheConfig.directory, { recursive: true });
        }
      } catch (error: any) {
        logger.error('Failed to create analysis cache directory', { error: error.message });
      }
    }
    
    logger.info('AnalysisService initialized with enhanced prompt templates');
  }

  /**
   * Analyze a list of ingredients to determine if a product is vegan
   */
  async analyzeIngredients(ingredients: string[]): Promise<AnalysisResult> {
    try {
      // Get the AI service instance
      const aiService = await AIServiceFactory.getService();
      
      // Preprocess ingredients
      const processedIngredients = this.preprocessIngredients(ingredients);
      const ingredientsText = processedIngredients.join(', ');
      
      // Determine the appropriate prompt template based on language and structure
      const promptTemplate = languageDetector.selectPromptTemplate(ingredientsText);
      
      logger.info('Analyzing ingredients', { 
        count: processedIngredients.length,
        template: promptTemplate,
        firstFew: processedIngredients.slice(0, 3).join(', ')
      });
      
      // Format the prompt with the processed ingredients
      const prompt = promptManager.format(promptTemplate, {
        ingredients: ingredientsText,
        text: ingredientsText // For unstructured template
      });
      
      // Generate content with the AI service
      const response = await aiService.generateContent(prompt);
      
      // Parse and validate the result
      let result = outputParser.parseAnalysisResult(response);
      
      // Enhance the result with local validation
      result = await this.enhanceWithLocalValidation(result, processedIngredients);
      
      return result;
    } catch (error: any) {
      logger.error('Error analyzing ingredients', { error: error.message, stack: error.stack });
      throw new Error(`Failed to analyze ingredients: ${error.message}`);
    }
  }
  
  /**
   * Analyze an image to identify ingredients and determine vegan status
   */
  async analyzeImage(imageBase64: string, preferredLanguage?: string): Promise<AnalysisResult> {
    const startTime = performance.now();
    
    try {
      // Check for cached result first
      const imageHash = crypto.createHash('md5').update(imageBase64).digest('hex');
      const cachedResult = await this.getCachedAnalysis(`image_${imageHash}`);
      
      if (cachedResult) {
        logger.info('Using cached image analysis result', { imageHash });
        const perfTime = performance.now() - startTime;
        logger.debug('Image analysis performance (cached)', { timeMs: Math.round(perfTime) });
        return cachedResult;
      }
      
      // Get the AI service
      const aiService = await AIServiceFactory.getService();
      
      // Optimize image for analysis
      logger.debug('Optimizing image for analysis', { imageHash });
      const optimizedImage = await imageProcessor.optimizeForOCR(imageBase64);
      
      // Choose appropriate prompt template based on preferred language
      let promptTemplate = 'imageAnalysis';
      if (preferredLanguage === 'en') {
        promptTemplate = 'imageAnalysis_en';
      } else if (preferredLanguage === 'sv') {
        promptTemplate = 'imageAnalysis_sv';
      }
      
      // Get the prompt template text
      const prompt = promptManager.getTemplate(promptTemplate);
      if (!prompt) {
        throw new Error(`Prompt template '${promptTemplate}' not found`);
      }
      
      logger.info('Analyzing image with Gemini', { 
        preferredLanguage,
        template: promptTemplate,
        imageHashSuffix: imageHash.substring(0, 8)
      });
      
      // Generate content from the image with retry logic
      let response = '';
      let retryCount = 0;
      const maxRetries = 2;
      
      while (retryCount <= maxRetries) {
        try {
          response = await aiService.generateContentFromMedia(
            prompt,
            optimizedImage,
            'image/jpeg'
          );
          break; // Break if successful
        } catch (error: any) {
          retryCount++;
          
          if (retryCount > maxRetries) {
            throw error; // Re-throw if max retries reached
          }
          
          logger.warn(`Retry ${retryCount} for image analysis`, {
            error: error.message,
            imageHashSuffix: imageHash.substring(0, 8)
          });
          
          // Wait before retrying (exponential backoff)
          await new Promise(resolve => setTimeout(resolve, 1000 * retryCount));
        }
      }
      
      // Parse and validate the result
      let result = outputParser.parseAnalysisResult(response);
      
      // If the AI found ingredients, enhance with local validation
      if (result.ingredientList && result.ingredientList.length > 0) {
        result = await this.enhanceWithLocalValidation(result, result.ingredientList);
      } 
      // If quality issues were reported and confidence is low, try enhanced approach
      else if (
        (result.imageQualityIssues && result.imageQualityIssues.length > 0) || 
        result.confidence < 0.5
      ) {
        logger.info('Low quality image detected, trying enhanced analysis', {
          qualityIssues: result.imageQualityIssues,
          confidence: result.confidence
        });
        
        // Try with enhanced image processing
        const enhancedImage = await imageProcessor.enhanceIngredientList(imageBase64);
        const enhancedPrompt = promptManager.getTemplate('imageAnalysis_enhanced');
        
        if (enhancedPrompt) {
          // Generate content with enhanced prompt and image
          const enhancedResponse = await aiService.generateContentFromMedia(
            enhancedPrompt,
            enhancedImage,
            'image/jpeg'
          );
          
          // Parse the enhanced result
          const enhancedResult = outputParser.parseAnalysisResult(enhancedResponse);
          
          // If enhanced result is better (found more ingredients or higher confidence)
          if (
            enhancedResult.ingredientList.length > result.ingredientList.length ||
            enhancedResult.confidence > result.confidence
          ) {
            logger.info('Enhanced analysis provided better results', {
              originalIngredientCount: result.ingredientList.length,
              enhancedIngredientCount: enhancedResult.ingredientList.length,
              originalConfidence: result.confidence,
              enhancedConfidence: enhancedResult.confidence
            });
            
            // Use enhanced result
            result = enhancedResult;
            
            // Enhance with local validation
            if (result.ingredientList.length > 0) {
              result = await this.enhanceWithLocalValidation(result, result.ingredientList);
            }
          }
        }
      }
      
      // Cache the result
      await this.cacheAnalysisResult(`image_${imageHash}`, result);
      
      // Track performance
      const perfTime = performance.now() - startTime;
      if (perfTime > PERF_THRESHOLD_ERROR) {
        logger.error('Image analysis performance very slow', { timeMs: Math.round(perfTime) });
      } else if (perfTime > PERF_THRESHOLD_WARNING) {
        logger.warn('Image analysis performance slow', { timeMs: Math.round(perfTime) });
      } else {
        logger.debug('Image analysis performance', { timeMs: Math.round(perfTime) });
      }
      
      return result;
    } catch (error: any) {
      const perfTime = performance.now() - startTime;
      logger.error('Error analyzing image', { 
        error: error.message, 
        stack: error.stack,
        timeMs: Math.round(perfTime)
      });
      throw new Error(`Failed to analyze image: ${error.message}`);
    }
  }
  
  /**
   * Preprocess ingredient text for better analysis
   */
  private preprocessIngredients(ingredients: string[]): string[] {
    if (!ingredients || ingredients.length === 0) {
      return [];
    }
    
    return ingredients
      .map(ingredient => {
        if (!ingredient) return '';
        
        return ingredient
          .trim()
          // Remove percentage amounts
          .replace(/\s*\(\s*\d+(?:[,.]\d+)?%\s*\)/g, '')
          // Remove parentheses content (but preserve E-numbers)
          .replace(/\([^)]*\)/g, (match) => {
            // Preserve E-numbers in parentheses
            return /E\d{3}/.test(match) ? match : '';
          })
          // Remove common bullet points and markers
          .replace(/^[•*\-–—]\s*/, '')
          // Normalize whitespace
          .replace(/\s+/g, ' ')
          .trim();
      })
      // Remove empty strings
      .filter(ingredient => ingredient.length > 0);
  }
  
  /**
   * Enhance analysis results with local validation
   */
  private async enhanceWithLocalValidation(
    result: AnalysisResult,
    originalIngredients: string[]
  ): Promise<AnalysisResult> {
    // If AI couldn't identify ingredients but we have original ones, use those
    if (result.ingredientList.length === 0 && originalIngredients.length > 0) {
      result.ingredientList = [...originalIngredients];
      logger.info('Using original ingredients as AI did not identify any');
    }

    // Check ingredients against local database
    const locallyIdentifiedNonVegan: string[] = [];
    const enhancedConfidences: number[] = [];
    
    // Check each ingredient against the local database
    for (const ingredient of result.ingredientList) {
      const dbCheck = ingredientDB.checkIngredient(ingredient);
      
      // If the ingredient is definitely non-vegan according to our database
      if (dbCheck.isVegan === false) {
        if (!result.nonVeganIngredients.includes(ingredient)) {
          locallyIdentifiedNonVegan.push(ingredient);
        }
        enhancedConfidences.push(Math.max(dbCheck.confidence, 0.9));
      } else if (dbCheck.confidence > 0.7) {
        // If we have high confidence in the database result
        enhancedConfidences.push(dbCheck.confidence);
      }
    }
    
    // Create a new result to avoid mutating the original
    const enhancedResult = { ...result };
    
    // Add locally identified non-vegan ingredients
    if (locallyIdentifiedNonVegan.length > 0) {
      enhancedResult.nonVeganIngredients = [
        ...new Set([...result.nonVeganIngredients, ...locallyIdentifiedNonVegan])
      ];
      
      logger.info('Added locally identified non-vegan ingredients', { 
        count: locallyIdentifiedNonVegan.length, 
        ingredients: locallyIdentifiedNonVegan 
      });
      
      // Update reasoning
      enhancedResult.reasoning += locallyIdentifiedNonVegan.length > 0 
        ? `\n\nLocalDB: Identifierade följande icke-veganska ingredienser: ${locallyIdentifiedNonVegan.join(', ')}.`
        : '';
    }
    
    // Apply validation rules and adjust confidence
    
    // Rule 1: If we found non-vegan ingredients but AI said product is vegan
    if (enhancedResult.nonVeganIngredients.length > 0 && enhancedResult.isVegan === true) {
      enhancedResult.isVegan = false;
      enhancedResult.confidence = Math.max(0.85, result.confidence);
      enhancedResult.reasoning += '\n\nKorrektion: Produkten markeras som icke-vegansk eftersom den innehåller icke-veganska ingredienser.';
      
      logger.info('Corrected vegan status due to presence of non-vegan ingredients');
    }
    
    // Rule 2: If no non-vegan ingredients found but AI said product is non-vegan
    else if (enhancedResult.nonVeganIngredients.length === 0 && enhancedResult.isVegan === false) {
      // Lower confidence but don't change decision (AI might have good reason)
      enhancedResult.confidence = Math.min(enhancedResult.confidence, 0.7);
      
      logger.info('Reduced confidence due to no non-vegan ingredients found');
    }
    
    // Rule 3: If confidence is very low, set to null (uncertain)
    if (enhancedResult.confidence < 0.4) {
      enhancedResult.isVegan = null;
      enhancedResult.reasoning += '\n\nOBS: Tillförlitligheten är för låg för att göra en definitiv bedömning.';
      
      logger.info('Changed status to uncertain due to low confidence');
    }
    
    // If we have database confidence values, consider them in the overall confidence
    if (enhancedConfidences.length > 0) {
      // Calculate average confidence, weighted with the original confidence
      const avgDbConfidence = enhancedConfidences.reduce((sum, val) => sum + val, 0) / enhancedConfidences.length;
      enhancedResult.confidence = (enhancedResult.confidence + avgDbConfidence) / 2;
      
      logger.debug('Adjusted confidence based on local database', { 
        originalConfidence: result.confidence,
        databaseConfidence: avgDbConfidence,
        newConfidence: enhancedResult.confidence
      });
    }
    
    return enhancedResult;
  }
  
  /**
   * Analyze a single text that might contain ingredients
   * This is useful for processing unstructured text from images or documents
   */
  async analyzeText(text: string): Promise<AnalysisResult> {
    try {
      if (!text || text.trim().length === 0) {
        throw new Error('Empty text provided for analysis');
      }
      
      // If the text appears to be a structured ingredient list
      if (languageDetector.isStructuredIngredientList(text)) {
        // Split by common ingredient separators and analyze as ingredients
        const ingredients = this.splitTextToIngredients(text);
        return this.analyzeIngredients(ingredients);
      }
      
      // Otherwise, treat as unstructured text
      const promptTemplate = 'ingredientsAnalysis_unstructured';
      const aiService = await AIServiceFactory.getService();
      
      logger.info('Analyzing unstructured text', { 
        textLength: text.length,
        firstPart: text.substring(0, 50) + (text.length > 50 ? '...' : '')
      });
      
      const prompt = promptManager.format(promptTemplate, { text });
      const response = await aiService.generateContent(prompt);
      
      // Parse and validate the result
      let result = outputParser.parseAnalysisResult(response);
      
      // If we got ingredients from the text, enhance with local validation
      if (result.ingredientList.length > 0) {
        result = await this.enhanceWithLocalValidation(result, result.ingredientList);
      }
      
      return result;
    } catch (error: any) {
      logger.error('Error analyzing text', { error: error.message, stack: error.stack });
      throw new Error(`Failed to analyze text: ${error.message}`);
    }
  }
  
  /**
   * Split text into ingredients for analysis
   */
  private splitTextToIngredients(text: string): string[] {
    // Remove common headers
    const cleanedText = text
      .replace(/^(?:ing?redien(?:s|t)er|innehåll|inneh[åa]ller|ingredients|contents)\s*:\s*/i, '')
      .trim();
    
    // Split by common ingredient separators
    return cleanedText
      .split(/\s*[,;]\s*|\s*[•*\-–—]\s*|\s+och\s+|\s+and\s+|\s*\r?\n\s*/)
      .map(part => part.trim())
      .filter(part => part.length > 0);
  }
  
  /**
   * Cache an analysis result
   */
  private async cacheAnalysisResult(key: string, result: AnalysisResult): Promise<void> {
    if (!this.cacheConfig.enabled) return;
    
    try {
      const cacheFile = path.join(this.cacheConfig.directory, `${key}.json`);
      const cacheData = {
        timestamp: Date.now(),
        result
      };
      
      await fs.promises.writeFile(cacheFile, JSON.stringify(cacheData));
      logger.debug('Cached analysis result', { key });
    } catch (error: any) {
      logger.error('Failed to cache analysis result', { key, error: error.message });
    }
  }
  
  /**
   * Get a cached analysis result
   */
  private async getCachedAnalysis(key: string): Promise<AnalysisResult | null> {
    if (!this.cacheConfig.enabled) return null;
    
    try {
      const cacheFile = path.join(this.cacheConfig.directory, `${key}.json`);
      
      if (!fs.existsSync(cacheFile)) {
        return null;
      }
      
      const cacheData = JSON.parse(await fs.promises.readFile(cacheFile, 'utf-8'));
      
      // Check if cache is expired
      if (Date.now() - cacheData.timestamp > this.cacheConfig.ttl) {
        await fs.promises.unlink(cacheFile).catch(() => {});
        return null;
      }
      
      return cacheData.result;
    } catch (error: any) {
      logger.error('Failed to retrieve cached analysis', { key, error: error.message });
      return null;
    }
  }
}

// Export a singleton instance for convenience
export default new AnalysisService(); 