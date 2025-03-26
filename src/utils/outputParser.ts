import { logger } from './logger';

export interface AnalysisResult {
  isVegan: boolean | null;
  confidence: number;
  productName?: string;
  ingredientList: string[];
  nonVeganIngredients: string[];
  reasoning: string;
  [key: string]: any; // Allow additional fields
}

/**
 * Parses and validates AI responses
 */
export class OutputParser {
  /**
   * Extract JSON from AI response text
   */
  private extractJson(text: string): any {
    try {
      // Try to find JSON in the text
      const jsonMatches = text.match(/\{[\s\S]*\}/);
      
      if (!jsonMatches || jsonMatches.length === 0) {
        logger.warn('No JSON found in AI response');
        return null;
      }
      
      const jsonString = jsonMatches[0];
      return JSON.parse(jsonString);
    } catch (error: any) {
      logger.error('Failed to extract JSON from AI response', { error: error.message, text: text.substring(0, 200) });
      return null;
    }
  }
  
  /**
   * Parse and validate an analysis result
   */
  parseAnalysisResult(text: string): AnalysisResult {
    const extractedJson = this.extractJson(text);
    
    if (!extractedJson) {
      // Return a default response when extraction fails
      return {
        isVegan: null,
        confidence: 0,
        ingredientList: [],
        nonVeganIngredients: [],
        reasoning: 'Could not interpret the response from the AI service.'
      };
    }
    
    // Validate and ensure all required fields are present
    const result: AnalysisResult = {
      isVegan: extractedJson.isVegan === true || extractedJson.isVegan === false ? extractedJson.isVegan : null,
      confidence: typeof extractedJson.confidence === 'number' ? extractedJson.confidence : 0,
      ingredientList: Array.isArray(extractedJson.ingredientList) ? extractedJson.ingredientList : [],
      nonVeganIngredients: Array.isArray(extractedJson.nonVeganIngredients) ? extractedJson.nonVeganIngredients : [],
      reasoning: typeof extractedJson.reasoning === 'string' ? extractedJson.reasoning : 'No explanation available.'
    };
    
    // Add optional product name if available
    if (typeof extractedJson.productName === 'string') {
      result.productName = extractedJson.productName;
    }
    
    // Clean up ingredient lists
    result.ingredientList = result.ingredientList.map(ing => String(ing).trim()).filter(Boolean);
    result.nonVeganIngredients = result.nonVeganIngredients.map(ing => String(ing).trim()).filter(Boolean);
    
    // Apply sanity checks
    this.applySanityChecks(result);
    
    // Log the result for monitoring
    logger.info('Parsed analysis result', { 
      isVegan: result.isVegan, 
      confidence: result.confidence,
      ingredientCount: result.ingredientList.length,
      nonVeganCount: result.nonVeganIngredients.length
    });
    
    return result;
  }

  /**
   * Apply sanity checks to the analysis result
   */
  private applySanityChecks(result: AnalysisResult): void {
    // Check for contradictions: nonVeganIngredients present but isVegan=true
    if (result.nonVeganIngredients.length > 0 && result.isVegan === true) {
      logger.warn('Contradiction in analysis result: nonVeganIngredients present but isVegan=true', {
        nonVeganIngredients: result.nonVeganIngredients,
        isVegan: result.isVegan
      });
      // Correct the contradiction
      result.isVegan = false;
      result.confidence = Math.min(result.confidence, 0.7);
      result.reasoning += '\n\nNOTE: Result corrected due to contradiction. Non-vegan ingredients present but product was initially marked as vegan.';
    }

    // Check for contradictions: no nonVeganIngredients but isVegan=false
    if (result.nonVeganIngredients.length === 0 && result.isVegan === false) {
      logger.warn('Contradiction in analysis result: no nonVeganIngredients but isVegan=false');
      // Lower confidence but don't change the result in this case - there might be reasons not in the list
      result.confidence = Math.min(result.confidence, 0.6);
    }

    // Check for very short ingredient lists that might indicate incomplete analysis
    if (result.ingredientList.length < 2 && result.confidence > 0.7) {
      logger.warn('Suspiciously short ingredient list with high confidence', {
        ingredientCount: result.ingredientList.length,
        confidence: result.confidence
      });
      result.confidence = 0.5;
    }

    // Check for uncertainty phrases in reasoning
    const uncertaintyPhrases = [
      'cannot determine', 'could not determine', 'unclear', 'not clear',
      'insufficient information', 'unable to', 'difficult to', 'hard to',
      'kunde inte avgöra', 'kan inte avgöra', 'svårt att', 'otydlig',
      'osäker', 'inte tillräcklig', 'kan inte läsa'
    ];

    if (uncertaintyPhrases.some(phrase => result.reasoning.toLowerCase().includes(phrase))) {
      logger.info('Uncertainty detected in reasoning', {
        originalIsVegan: result.isVegan,
        originalConfidence: result.confidence
      });
      
      // If there's uncertainty in the reasoning but isVegan is definite, adjust confidence
      if (result.isVegan !== null) {
        result.confidence = Math.min(result.confidence, 0.6);
      }
      
      // If confidence is very low, set isVegan to null
      if (result.confidence < 0.4) {
        result.isVegan = null;
      }
    }
  }
}

// Export a singleton instance
export default new OutputParser();