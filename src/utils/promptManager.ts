import { logger } from './logger';

export interface PromptTemplateVars {
  [key: string]: string | string[] | number | boolean | null;
}

/**
 * Manages prompt templates and provides functionality to fill in variables
 */
export class PromptManager {
  private templates: Map<string, string> = new Map();
  
  /**
   * Add or update a template
   */
  addTemplate(name: string, template: string): void {
    this.templates.set(name, template);
    logger.debug(`Added prompt template: ${name}`);
  }
  
  /**
   * Get a template
   */
  getTemplate(name: string): string | null {
    return this.templates.get(name) || null;
  }
  
  /**
   * Format a template with variables
   */
  format(templateName: string, vars: PromptTemplateVars): string {
    const template = this.getTemplate(templateName);
    if (!template) {
      logger.warn(`Prompt template not found: ${templateName}`);
      return '';
    }
    
    // Replace variables in the template
    let result = template;
    for (const [key, value] of Object.entries(vars)) {
      const placeholder = `{{${key}}}`;
      if (value === null) {
        result = result.replace(new RegExp(placeholder, 'g'), '');
      } else if (Array.isArray(value)) {
        result = result.replace(new RegExp(placeholder, 'g'), value.join(', '));
      } else {
        result = result.replace(new RegExp(placeholder, 'g'), String(value));
      }
    }
    
    return result;
  }
  
  /**
   * Load default templates for ingredient analysis
   */
  loadDefaultTemplates(): void {
    // Template for text-based ingredient analysis
    this.addTemplate(
      'ingredientsAnalysis',
      `Analyze the following ingredients list and determine if the product is vegan:
      
      Ingredients: {{ingredients}}
      
      Reply in the following JSON format:
      {
        "isVegan": boolean or null if uncertain,
        "confidence": number between 0 and 1 representing certainty,
        "productName": "name of the product if visible, otherwise empty string",
        "ingredientList": [list of all identified ingredients],
        "nonVeganIngredients": [list of identified non-vegan ingredients],
        "reasoning": "explanation of your reasoning"
      }`
    );
    
    // Template for image analysis of ingredients
    this.addTemplate(
      'imageIngredientsAnalysis',
      `Analyze this product packaging image and identify the ingredients list.
      Determine if the product is vegan based on the ingredients.
      
      Reply in the following JSON format:
      {
        "isVegan": boolean or null if uncertain,
        "confidence": number between 0 and 1 representing certainty,
        "productName": "name of the product if visible, otherwise empty string",
        "ingredientList": [list of all identified ingredients],
        "nonVeganIngredients": [list of identified non-vegan ingredients],
        "reasoning": "explanation of your reasoning"
      }`
    );
    
    // Template for video analysis
    this.addTemplate(
      'videoIngredientsAnalysis',
      `Analyze the video of the product packaging and identify the ingredients list.
      Look carefully at all sides of the packaging to find the complete ingredients list.
      Determine if the product is vegan based on the ingredients.
      
      Reply in the following JSON format:
      {
        "isVegan": boolean or null if uncertain,
        "confidence": number between 0 and 1 representing certainty,
        "productName": "name of the product if visible, otherwise empty string",
        "ingredientList": [list of all identified ingredients],
        "nonVeganIngredients": [list of identified non-vegan ingredients],
        "reasoning": "explanation of your reasoning"
      }`
    );

    // Template for cropped image analysis (just the ingredients list)
    this.addTemplate(
      'croppedImageIngredientsAnalysis',
      `This is a cropped image showing just the ingredients list of a product.
      Analyze the ingredients and determine if the product is vegan.
      Make sure to look at each ingredient carefully.
      
      Reply in the following JSON format:
      {
        "isVegan": boolean or null if uncertain,
        "confidence": number between 0 and 1 representing certainty,
        "productName": "name of the product if visible, otherwise empty string",
        "ingredientList": [list of all identified ingredients],
        "nonVeganIngredients": [list of identified non-vegan ingredients],
        "reasoning": "explanation of your reasoning"
      }`
    );
    
    logger.info('Default prompt templates loaded');
  }
}

// Export a singleton instance
export default new PromptManager();