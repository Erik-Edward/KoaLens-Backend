import analysisService from '../services/analysisService';
import promptManager from '../utils/promptManager';
import languageDetector from '../utils/languageDetector';
import { loadTextAnalysisPrompts } from '../config/prompts';

describe('Text Analysis Service', () => {
  beforeAll(() => {
    // Load the enhanced prompt templates
    loadTextAnalysisPrompts(promptManager);
  });
  
  describe('Language Detection', () => {
    test('should correctly identify Swedish text', () => {
      const text = 'Ingredienser: Vetemjöl, socker, smör, mjölk, ägg, vaniljsocker, bakpulver, salt';
      const language = languageDetector.detectLanguage(text);
      expect(language).toBe('sv');
    });
    
    test('should correctly identify English text', () => {
      const text = 'Ingredients: Wheat flour, sugar, butter, milk, eggs, vanilla sugar, baking powder, salt';
      const language = languageDetector.detectLanguage(text);
      expect(language).toBe('en');
    });
    
    test('should identify structured ingredient lists', () => {
      const text = 'Vetemjöl, socker, smör, mjölk, ägg, vaniljsocker, bakpulver, salt';
      const isStructured = languageDetector.isStructuredIngredientList(text);
      expect(isStructured).toBe(true);
    });
    
    test('should correctly select template based on content', () => {
      const swedishText = 'Ingredienser: Vetemjöl, socker, smör, mjölk';
      const englishText = 'Ingredients: Wheat flour, sugar, butter, milk';
      const unstructuredText = 'Den här kakan innehåller vetemjöl, socker, smör och mjölk. Den är inte vegansk.';
      
      expect(languageDetector.selectPromptTemplate(swedishText)).toBe('ingredientsAnalysis_sv');
      expect(languageDetector.selectPromptTemplate(englishText)).toBe('ingredientsAnalysis_en');
      expect(languageDetector.selectPromptTemplate(unstructuredText)).toBe('ingredientsAnalysis_unstructured');
    });
  });
  
  describe('Ingredient Analysis', () => {
    test('should correctly identify vegan products', async () => {
      const ingredients = [
        'Vetemjöl',
        'Socker',
        'Vegetabilisk olja',
        'Salt',
        'Jäst',
        'Emulgeringsmedel (E471)',
        'Konserveringsmedel (E282)'
      ];
      
      const result = await analysisService.analyzeIngredients(ingredients);
      
      expect(result.isVegan).toBe(true);
      expect(result.nonVeganIngredients.length).toBe(0);
      expect(result.confidence).toBeGreaterThan(0.7);
    });
    
    test('should correctly identify non-vegan products', async () => {
      const ingredients = [
        'Vetemjöl',
        'Socker',
        'Smör',
        'Mjölk',
        'Ägg',
        'Salt',
        'Bakpulver'
      ];
      
      const result = await analysisService.analyzeIngredients(ingredients);
      
      expect(result.isVegan).toBe(false);
      expect(result.nonVeganIngredients.length).toBeGreaterThan(0);
      expect(result.nonVeganIngredients).toContain('Smör');
      expect(result.nonVeganIngredients).toContain('Mjölk');
      expect(result.nonVeganIngredients).toContain('Ägg');
      expect(result.confidence).toBeGreaterThan(0.7);
    });
    
    test('should handle uncertain ingredients appropriately', async () => {
      const ingredients = [
        'Vetemjöl',
        'Socker',
        'Vegetabilisk olja',
        'E471',
        'Naturlig arom',
        'Lecitin',
        'D-vitamin'
      ];
      
      const result = await analysisService.analyzeIngredients(ingredients);
      
      // The result might be uncertain or false depending on the prompt and AI
      if (result.isVegan === false) {
        expect(result.nonVeganIngredients.length).toBeGreaterThan(0);
      } else if (result.isVegan === null) {
        expect(result.confidence).toBeLessThan(0.7);
      } else {
        expect(result.confidence).toBeLessThan(0.9);
      }
    });
  });
  
  describe('Text Analysis', () => {
    test('should extract ingredients from unstructured text', async () => {
      const text = 'Den här produkten innehåller följande ingredienser: vetemjöl, socker, smör, mjölk och ägg.';
      
      const result = await analysisService.analyzeText(text);
      
      expect(result.isVegan).toBe(false);
      expect(result.ingredientList.length).toBeGreaterThan(0);
      expect(result.nonVeganIngredients.length).toBeGreaterThan(0);
    });
    
    test('should preprocess ingredient text correctly', () => {
      // Access the private method using type assertion
      const processedIngredients = (analysisService as any).preprocessIngredients([
        'Mjölk (3.5%)',
        '• Vetemjöl',
        'Socker (vitt)',
        'Smör (82% fett)',
        '*Ägg'
      ]);
      
      expect(processedIngredients).toEqual([
        'Mjölk',
        'Vetemjöl',
        'Socker',
        'Smör',
        'Ägg'
      ]);
    });
  });
}); 