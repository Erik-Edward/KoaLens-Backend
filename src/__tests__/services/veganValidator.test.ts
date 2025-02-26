// C:\Projects\koalens-backend\src\__tests__\services\veganValidator.test.ts
import { validateIngredients, fuzzyMatch, testIngredient } from '@/services/veganValidator';

describe('VeganValidator', () => {
  describe('fuzzyMatch', () => {
    it('should match exact strings', () => {
      expect(fuzzyMatch('mjölk', 'mjölk')).toBe(true);
      expect(fuzzyMatch('vassle', 'vassle')).toBe(true);
    });

    it('should match strings with common spelling variations', () => {
      expect(fuzzyMatch('mjolk', 'mjölk')).toBe(true);
      expect(fuzzyMatch('vasle', 'vassle')).toBe(true);
      expect(fuzzyMatch('kärnmjölk', 'karnmjolk')).toBe(true);
    });

    it('should not match different words with similar prefixes', () => {
      expect(fuzzyMatch('mjölksyra', 'mjölk')).toBe(false);
      expect(fuzzyMatch('kokosmjölk', 'mjölk')).toBe(false);
      expect(fuzzyMatch('havremjölk', 'mjölk')).toBe(false);
    });

    it('should handle whitespace and case variations', () => {
      expect(fuzzyMatch('  Mjölk  ', 'mjölk')).toBe(true);
      expect(fuzzyMatch('VASSLE', 'vassle')).toBe(true);
    });

    it('should handle empty or null inputs', () => {
      expect(fuzzyMatch('', 'mjölk')).toBe(false);
      expect(fuzzyMatch('mjölk', '')).toBe(false);
      expect(fuzzyMatch('', '')).toBe(true);
    });
  });

  describe('validateIngredients', () => {
    describe('Basic Ingredient Validation', () => {
      it('should identify single non-vegan ingredients', () => {
        const result = validateIngredients(['mjölk']);
        expect(result.isVegan).toBe(false);
        expect(result.nonVeganIngredients).toContain('mjölk');
      });

      it('should identify multiple non-vegan ingredients', () => {
        const result = validateIngredients(['mjölk', 'vassle', 'socker']);
        expect(result.isVegan).toBe(false);
        expect(result.nonVeganIngredients).toContain('mjölk');
        expect(result.nonVeganIngredients).toContain('vassle');
        expect(result.nonVeganIngredients).not.toContain('socker');
      });

      it('should handle safe exceptions correctly', () => {
        const result = validateIngredients(['mjölksyra', 'kokosmjölk', 'havremjölk']);
        expect(result.isVegan).toBe(true);
        expect(result.nonVeganIngredients).toHaveLength(0);
      });

      it('should identify uncertain ingredients with lower confidence', () => {
        const result = validateIngredients(['E471', 'lecitin']);
        expect(result.uncertainIngredients).toContain('E471');
        expect(result.uncertainIngredients).toContain('lecitin');
        expect(result.confidence).toBeLessThan(1);
      });
    });

    describe('Edge Cases', () => {
      it('should handle empty ingredients list', () => {
        const result = validateIngredients([]);
        expect(result.isVegan).toBe(true);
        expect(result.confidence).toBe(1);
      });

      it('should handle null or undefined values', () => {
        const result = validateIngredients(['mjölk', '', undefined, null].filter(Boolean) as string[]);
        expect(result.nonVeganIngredients).toContain('mjölk');
        expect(result.nonVeganIngredients.length).toBe(1);
      });

      it('should handle case variations', () => {
        const result = validateIngredients(['MJÖLK', 'Vassle', 'KokosMJÖLK']);
        expect(result.nonVeganIngredients).toContain('MJÖLK');
        expect(result.nonVeganIngredients).toContain('Vassle');
        expect(result.isVegan).toBe(false);
      });
    });

    describe('Complex Cases', () => {
      it('should handle compound ingredients correctly', () => {
        const result = validateIngredients([
          'kärnmjölkspulver',
          'havremjölkspulver',
          'kokosmjölkspulver'
        ]);
        expect(result.nonVeganIngredients).toContain('kärnmjölkspulver');
        expect(result.nonVeganIngredients).not.toContain('havremjölkspulver');
        expect(result.nonVeganIngredients).not.toContain('kokosmjölkspulver');
      });

      it('should validate common E-numbers correctly', () => {
        const result = validateIngredients(['E120', 'E471', 'E300']);
        expect(result.nonVeganIngredients).toContain('E120'); // Karmin (inte veganskt)
        expect(result.uncertainIngredients).toContain('E471'); // Kan vara animaliskt
        expect(result.nonVeganIngredients).not.toContain('E300'); // Askorbinsyra (veganskt)
      });

      it('should handle mixed vegan and non-vegan ingredients', () => {
        const result = validateIngredients([
          'socker',
          'mjölkprotein',
          'havremjölk',
          'salt',
          'äggpulver'
        ]);
        expect(result.isVegan).toBe(false);
        expect(result.nonVeganIngredients).toEqual(['mjölkprotein', 'äggpulver']);
        expect(result.nonVeganIngredients).not.toContain('havremjölk');
        expect(result.nonVeganIngredients).not.toContain('socker');
        expect(result.nonVeganIngredients).not.toContain('salt');
      });
    });

    describe('Reasoning and Debug Info', () => {
      it('should provide clear reasoning for non-vegan ingredients', () => {
        const result = validateIngredients(['mjölk', 'vassle']);
        expect(result.reasoning).toContain('inte veganska');
        expect(result.reasoning).toContain('mjölk');
        expect(result.reasoning).toContain('vassle');
      });

      it('should include debug information in development mode', () => {
        process.env.NODE_ENV = 'development';
        const result = validateIngredients(['mjölk']);
        expect(result.debug?.fuzzyMatches).toBeDefined();
        expect(result.debug?.fuzzyMatches?.length).toBeGreaterThan(0);
        const match = result.debug?.fuzzyMatches?.[0];
        expect(match?.ingredient).toBe('mjölk');
        expect(match?.similarity).toBeGreaterThan(0.8);
      });

      it('should provide appropriate confidence levels', () => {
        const result1 = validateIngredients(['mjölk']); // Definitivt inte veganskt
        expect(result1.confidence).toBe(1.0);

        const result2 = validateIngredients(['E471']); // Osäker ingrediens
        expect(result2.confidence).toBeLessThan(1.0);
      });
    });
  });

  describe('testIngredient helper function', () => {
    it('should work with single ingredients', () => {
      const result = testIngredient('mjölk');
      expect(result.isVegan).toBe(false);
      expect(result.nonVeganIngredients).toContain('mjölk');
    });

    it('should handle safe exceptions', () => {
      const result = testIngredient('kokosmjölk');
      expect(result.isVegan).toBe(true);
      expect(result.nonVeganIngredients).toHaveLength(0);
    });
  });
});