import { logger } from './logger';

export interface AnalysisResult {
  isVegan: boolean | null;
  confidence: number;
  productName?: string;
  ingredientList: string[];
  nonVeganIngredients: string[];
  reasoning: string;
  imageQualityIssues?: string[];
  extractedFrom?: string;
  [key: string]: any; // Allow additional fields
}

/**
 * Parses and validates AI responses
 */
export class OutputParser {
  /**
   * Extract JSON from AI response text with improved robustness
   */
  private extractJson(text: string): any {
    try {
      if (!text) {
        logger.warn('Empty text provided to JSON extractor');
        return null;
      }
      
      // First, try to parse the text directly in case it's already JSON
      try {
        return JSON.parse(text.trim());
      } catch (directParseError) {
        // Ignore this error and continue with regex extraction
      }
      
      // Find the first occurrence of a JSON object using regex
      // This pattern looks for curly braces and everything between them
      const jsonMatches = text.match(/\{[\s\S]*?\}/g);
      
      if (!jsonMatches || jsonMatches.length === 0) {
        logger.warn('No JSON object found in AI response', { 
          textLength: text.length,
          textSnippet: text.substring(0, 100) + (text.length > 100 ? '...' : '')
        });
        return null;
      }
      
      // Try each JSON match until we find a valid one
      for (const jsonString of jsonMatches) {
        try {
          const parsedJson = JSON.parse(jsonString);
          // If parsing succeeds and it looks like our expected structure
          if (
            parsedJson && 
            (typeof parsedJson.isVegan !== 'undefined' || 
             Array.isArray(parsedJson.ingredientList) ||
             Array.isArray(parsedJson.nonVeganIngredients))
          ) {
            return parsedJson;
          }
        } catch (error) {
          // Continue to the next match
          continue;
        }
      }
      
      // If we've tried all matches and none worked, try the largest one
      // Sort matches by length (descending) and try the longest one
      const sortedMatches = [...jsonMatches].sort((a, b) => b.length - a.length);
      
      try {
        return JSON.parse(sortedMatches[0]);
      } catch (error: any) {
        logger.error('Failed to parse any JSON object', { 
          error: error.message, 
          longestMatch: sortedMatches[0].substring(0, 100) + (sortedMatches[0].length > 100 ? '...' : '')
        });
        return null;
      }
    } catch (error: any) {
      logger.error('Error extracting JSON from AI response', { 
        error: error.message, 
        textSnippet: text.substring(0, 100) + (text.length > 100 ? '...' : '')
      });
      return null;
    }
  }
  
  /**
   * Parse and validate an analysis result with improved validation
   */
  parseAnalysisResult(text: string): AnalysisResult {
    const extractedJson = this.extractJson(text);
    
    if (!extractedJson) {
      // Return a default response when extraction fails
      logger.warn('Using default analysis result due to JSON extraction failure');
      return {
        isVegan: null,
        confidence: 0,
        ingredientList: [],
        nonVeganIngredients: [],
        reasoning: 'Could not interpret the response from the AI service.'
      };
    }
    
    // Create a new result with default values
    const result: AnalysisResult = {
      isVegan: null,
      confidence: 0,
      ingredientList: [],
      nonVeganIngredients: [],
      reasoning: 'No explanation available.'
    };
    
    // Parse boolean fields with null fallback
    result.isVegan = extractedJson.isVegan === true || extractedJson.isVegan === false 
      ? extractedJson.isVegan 
      : null;
    
    // Parse confidence as number with validation
    if (typeof extractedJson.confidence === 'number') {
      // Ensure confidence is between 0 and 1
      result.confidence = Math.min(Math.max(extractedJson.confidence, 0), 1);
    } else if (typeof extractedJson.confidence === 'string') {
      // Try to parse string confidence as number
      const parsedConfidence = parseFloat(extractedJson.confidence);
      result.confidence = isNaN(parsedConfidence) ? 0 : Math.min(Math.max(parsedConfidence, 0), 1);
    }
    
    // Parse arrays with validation
    result.ingredientList = Array.isArray(extractedJson.ingredientList) 
      ? extractedJson.ingredientList.map((ing: any) => String(ing).trim()).filter(Boolean)
      : [];
    
    result.nonVeganIngredients = Array.isArray(extractedJson.nonVeganIngredients) 
      ? extractedJson.nonVeganIngredients.map((ing: any) => String(ing).trim()).filter(Boolean)
      : [];
    
    // Parse reasoning with fallback
    result.reasoning = typeof extractedJson.reasoning === 'string' 
      ? extractedJson.reasoning 
      : 'No explanation available.';
    
    // Parse optional product name if available
    if (typeof extractedJson.productName === 'string' && extractedJson.productName.trim()) {
      result.productName = extractedJson.productName.trim();
    }
    
    // Parse optional image quality issues if available
    if (Array.isArray(extractedJson.imageQualityIssues)) {
      result.imageQualityIssues = extractedJson.imageQualityIssues
        .map((issue: any) => String(issue).trim())
        .filter(Boolean);
    }
    
    // Parse optional extracted text source
    if (typeof extractedJson.extractedFrom === 'string' && extractedJson.extractedFrom.trim()) {
      result.extractedFrom = extractedJson.extractedFrom.trim();
    }
    
    // Normalize the ingredient lists (remove duplicates, standardize casing)
    result.ingredientList = this.normalizeIngredientList(result.ingredientList);
    result.nonVeganIngredients = this.normalizeIngredientList(result.nonVeganIngredients);
    
    // Apply additional validation and sanity checks
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
   * Normalize ingredient list (remove duplicates, standardize casing)
   */
  private normalizeIngredientList(ingredients: string[]): string[] {
    // Create a case-insensitive map to remove duplicates while preserving best casing
    const normalizedMap = new Map<string, string>();
    
    for (const ingredient of ingredients) {
      const normalized = ingredient.trim().toLowerCase();
      
      // Skip empty ingredients
      if (!normalized) continue;
      
      // If we haven't seen this ingredient before, or the new one has better casing
      if (!normalizedMap.has(normalized) || 
          this.hasBetterCasing(ingredient, normalizedMap.get(normalized)!)) {
        normalizedMap.set(normalized, ingredient);
      }
    }
    
    return Array.from(normalizedMap.values());
  }
  
  /**
   * Determine if a string has better casing (more proper nouns, less all caps)
   */
  private hasBetterCasing(newStr: string, oldStr: string): boolean {
    // Prefer strings with proper casing (not all lowercase or all uppercase)
    const newHasProperCase = /[A-Z][a-z]/.test(newStr);
    const oldHasProperCase = /[A-Z][a-z]/.test(oldStr);
    
    // Avoid ALL CAPS strings
    const newIsAllCaps = /^[A-Z\s]+$/.test(newStr);
    const oldIsAllCaps = /^[A-Z\s]+$/.test(oldStr);
    
    // Prefer proper case over all caps or all lowercase
    if (newHasProperCase && !oldHasProperCase) return true;
    if (!newHasProperCase && oldHasProperCase) return false;
    
    // Avoid all caps
    if (oldIsAllCaps && !newIsAllCaps) return true;
    
    // Prefer longer strings for more information
    return newStr.length > oldStr.length;
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
      'osäker', 'inte tillräcklig', 'kan inte läsa', 'kan ej avgöra',
      'otillräcklig', 'oklar', 'otydligt', 'svårläst', 'kan inte se',
      'not enough information', 'may contain', 'might contain', 'possibly contains',
      'kan innehålla', 'möjligen innehåller', 'eventuellt innehåller',
      'uncertain', 'unknown', 'okänd', 'osäkert'
    ];

    const reasoningLower = result.reasoning.toLowerCase();
    const foundUncertaintyPhrases = uncertaintyPhrases.filter(phrase => 
      reasoningLower.includes(phrase.toLowerCase())
    );

    if (foundUncertaintyPhrases.length > 0) {
      logger.info('Uncertainty detected in reasoning', {
        originalIsVegan: result.isVegan,
        originalConfidence: result.confidence,
        uncertaintyPhrases: foundUncertaintyPhrases
      });
      
      // If there's uncertainty in the reasoning but isVegan is definite, adjust confidence
      if (result.isVegan !== null) {
        // More phrases = lower confidence
        const confidenceReduction = Math.min(0.1 * foundUncertaintyPhrases.length, 0.3);
        result.confidence = Math.max(0.3, result.confidence - confidenceReduction);
      }
      
      // If confidence is very low, set isVegan to null
      if (result.confidence < 0.4) {
        result.isVegan = null;
      }
    }
    
    // Check for image quality issues mentioned in reasoning or imageQualityIssues
    const imageQualityIssues = result.imageQualityIssues || [];
    const qualityPhrases = [
      'blur', 'blurry', 'unclear', 'poor quality', 'low resolution',
      'oskarp', 'otydlig', 'dålig kvalitet', 'lågupplöst',
      'incomplete', 'partial', 'cut off', 'missing',
      'ofullständig', 'partiell', 'avklippt', 'saknas',
      'poor lighting', 'dark', 'overexposed', 'underexposed',
      'dålig belysning', 'mörk', 'överexponerad', 'underexponerad'
    ];
    
    const hasQualityIssues = qualityPhrases.some(phrase => 
      reasoningLower.includes(phrase.toLowerCase())
    ) || imageQualityIssues.length > 0;
    
    if (hasQualityIssues) {
      logger.info('Image quality issues detected', {
        originalConfidence: result.confidence,
        imageQualityIssues
      });
      
      // Reduce confidence based on image quality issues
      result.confidence = Math.min(result.confidence, 0.6);
      
      // If confidence is very low due to image quality, set isVegan to null
      if (result.confidence < 0.4) {
        result.isVegan = null;
        result.reasoning += '\n\nImage quality issues detected, making the analysis unreliable.';
      }
    }
    
    // Ensure nonVeganIngredients is a subset of ingredientList
    result.nonVeganIngredients = result.nonVeganIngredients.filter(nonVegan => {
      // Normalize for comparison
      const nonVeganLower = nonVegan.toLowerCase();
      
      // Check if the ingredient or a similar one is in the ingredientList
      return result.ingredientList.some(ingredient => {
        const ingredientLower = ingredient.toLowerCase();
        return ingredientLower.includes(nonVeganLower) || 
               nonVeganLower.includes(ingredientLower) ||
               this.areIngredientsAlmostEqual(ingredientLower, nonVeganLower);
      });
    });
  }
  
  /**
   * Check if two ingredients are very similar (accounting for minor differences)
   */
  private areIngredientsAlmostEqual(a: string, b: string): boolean {
    if (a === b) return true;
    
    // If one is much longer than the other, they're probably different
    if (Math.abs(a.length - b.length) > 3) return false;
    
    // Count character differences
    let differences = 0;
    const maxLength = Math.max(a.length, b.length);
    
    for (let i = 0; i < maxLength; i++) {
      if (a[i] !== b[i]) differences++;
      // If too many differences, stop early
      if (differences > 2) return false;
    }
    
    // Allow up to 2 character differences for similar ingredients
    return differences <= 2;
  }
}

// Export a singleton instance
export default new OutputParser();