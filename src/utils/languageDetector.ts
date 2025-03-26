import { logger } from './logger';

/**
 * Utility for detecting language and text format for more accurate analysis
 */
export class LanguageDetector {
  /**
   * Detect language in text based on common words and patterns
   */
  detectLanguage(text: string): 'sv' | 'en' | 'unknown' {
    if (!text) return 'unknown';
    
    const lowerText = text.toLowerCase().trim();
    
    // Common Swedish indicators
    const swedishIndicators = [
      'och', 'eller', 'med', 'av', 'från', 'innehåller', 'ingredienser',
      'mjölk', 'ägg', 'grädde', 'vassle', 'kan innehålla spår av', 'allergi information',
      'socker', 'salt', 'vatten', 'vete', 'råg', 'korn', 'havre'
    ];
    
    // Common English indicators
    const englishIndicators = [
      'and', 'or', 'with', 'from', 'contains', 'ingredients',
      'milk', 'egg', 'cream', 'whey', 'may contain traces of', 'allergy information',
      'sugar', 'salt', 'water', 'wheat', 'rye', 'barley', 'oats'
    ];
    
    // Count matches for each language
    let swedishCount = 0;
    let englishCount = 0;
    
    // Check for Swedish indicators
    for (const word of swedishIndicators) {
      // Match only complete words to avoid false positives
      const regex = new RegExp(`\\b${word}\\b`, 'i');
      if (regex.test(lowerText)) {
        swedishCount++;
      }
    }
    
    // Check for English indicators
    for (const word of englishIndicators) {
      // Match only complete words to avoid false positives
      const regex = new RegExp(`\\b${word}\\b`, 'i');
      if (regex.test(lowerText)) {
        englishCount++;
      }
    }
    
    // Add additional weight to explicit language markers
    if (lowerText.includes('ingredienser:') || lowerText.includes('innehåller:')) {
      swedishCount += 2;
    }
    
    if (lowerText.includes('ingredients:') || lowerText.includes('contains:')) {
      englishCount += 2;
    }
    
    // Log the detection results for monitoring
    logger.debug('Language detection results', { 
      text: text.substring(0, 50) + (text.length > 50 ? '...' : ''),
      swedishCount, 
      englishCount 
    });
    
    // Return detected language or default to Swedish
    if (swedishCount > englishCount) {
      return 'sv';
    } else if (englishCount > swedishCount) {
      return 'en';
    } else if (swedishCount === 0 && englishCount === 0) {
      // If no matches, try to guess based on character frequency
      // Swedish has more å, ä, ö characters
      const scandinavianChars = (text.match(/[åäöÅÄÖ]/g) || []).length;
      return scandinavianChars > 0 ? 'sv' : 'unknown';
    } else {
      // Equal matches, default to Swedish
      return 'sv';
    }
  }
  
  /**
   * Determine if text is a structured ingredient list
   */
  isStructuredIngredientList(text: string): boolean {
    if (!text) return false;
    
    // Structured ingredient lists often have:
    // 1. Many commas separating ingredients
    // 2. Few periods (not many full sentences)
    // 3. Often start with "Ingredients:" or similar
    
    const commaCount = (text.match(/,/g) || []).length;
    const periodCount = (text.match(/\./g) || []).length;
    
    // Check for ingredient list markers
    const hasIngredientMarker = /^(?:ing?redien(?:s|t)er|ingredienser|innehåll|inneh[åa]ller|ingredients|contents)\s*:/i.test(text.trim());
    
    // Check for percentage patterns common in ingredient lists
    const hasPercentages = /\(\s*\d+(?:[,.]\d+)?%\s*\)/g.test(text);
    
    // Check for typographic patterns (e.g., bullet points, asterisks, dash) that often start ingredients
    const hasBulletPoints = /^(?:\s*[•*\-–—]\s*)/m.test(text);
    
    // If it has an ingredient marker, it's very likely a structured list
    if (hasIngredientMarker) {
      return true;
    }
    
    // If it has many commas, percentages, and few periods, it's likely a list
    if (commaCount > 2 && commaCount > periodCount * 2) {
      return true;
    }
    
    // If it has percentage patterns or bullet points, it's likely a list
    if (hasPercentages || hasBulletPoints) {
      return true;
    }
    
    return false;
  }
  
  /**
   * Select appropriate prompt template based on content
   */
  selectPromptTemplate(text: string): string {
    // Default to Swedish structured template
    if (!text) return 'ingredientsAnalysis_sv';
    
    const language = this.detectLanguage(text);
    const isStructured = this.isStructuredIngredientList(text);
    
    logger.debug('Prompt template selection', { language, isStructured });
    
    // Select the appropriate template based on language and structure
    if (!isStructured) {
      return 'ingredientsAnalysis_unstructured';
    }
    
    if (language === 'en') {
      return 'ingredientsAnalysis_en';
    }
    
    // Default to Swedish template (covers 'sv' and 'unknown')
    return 'ingredientsAnalysis_sv';
  }
}

// Export singleton instance
export default new LanguageDetector(); 