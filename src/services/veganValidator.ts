// C:\Projects\koalens-backend\src\services\veganValidator.ts
import { distance } from 'fastest-levenshtein';
import { 
  DEFINITELY_NON_VEGAN, 
  POTENTIALLY_NON_VEGAN, 
  ANIMAL_INDICATORS,
  SAFE_EXCEPTIONS 
} from '@/constants/veganIngredients';

export interface ValidationResult {
  isVegan: boolean;
  confidence: number;
  nonVeganIngredients: string[];
  uncertainIngredients: string[];
  reasoning: string;
  debug?: {
    fuzzyMatches?: Array<{
      ingredient: string;
      matchedWith: string;
      similarity: number;
    }>;
  };
}

/**
 * Normaliserar en sträng genom att hantera svenska tecken och formatering
 */
export function normalizeString(str: string): string {
  return str
    .toLowerCase()
    .trim()
    .replace(/å/g, 'a')
    .replace(/ä/g, 'a')
    .replace(/ö/g, 'o')
    .replace(/é/g, 'e')
    .replace(/è/g, 'e')
    .replace(/ë/g, 'e');
}

/**
 * Jämför två strängar med fuzzy matching och stöd för svenska tecken
 */
export function fuzzyMatch(input: string, target: string, threshold: number = 0.8): boolean {
  if (!input || !target) return input === target;

  const normalizedInput = normalizeString(input);
  const normalizedTarget = normalizeString(target);
  
  // Exakt match efter normalisering
  if (normalizedInput === normalizedTarget) return true;
  
  // Beräkna Levenshtein-distans på de normaliserade strängarna
  const maxLength = Math.max(normalizedInput.length, normalizedTarget.length);
  const maxDistance = Math.floor(maxLength * (1 - threshold));
  const actualDistance = distance(normalizedInput, normalizedTarget);
  
  return actualDistance <= maxDistance;
}

/**
 * Hittar bästa matchningen i en uppsättning av strängar
 */
export function findBestMatch(input: string, targets: Set<string>, isStrict: boolean = false): { match: string | null; similarity: number } {
  let bestMatch = null;
  let bestSimilarity = 0;

  const normalizedInput = normalizeString(input);

  // Om vi letar efter exakta matchningar (för sammansatta ord)
  if (isStrict) {
    for (const target of targets) {
      if (normalizeString(target) === normalizedInput) {
        return { match: target, similarity: 1.0 };
      }
    }
  }

  // Annars gör fuzzy matching
  for (const target of targets) {
    const normalizedTarget = normalizeString(target);
    const similarity = 1 - (distance(normalizedInput, normalizedTarget) / Math.max(normalizedInput.length, normalizedTarget.length));
    
    if (similarity > bestSimilarity && similarity >= 0.8) {
      bestMatch = target;
      bestSimilarity = similarity;
    }
  }

  return { match: bestMatch, similarity: bestSimilarity };
}

/**
 * Validerar en lista med ingredienser och avgör om de är veganska
 */
export function validateIngredients(ingredients: string[]): ValidationResult {
  const nonVeganFound: string[] = [];
  const uncertainFound: string[] = [];
  let confidence = 1.0;
  const debugInfo: string[] = [];
  const fuzzyMatches: Array<{ ingredient: string; matchedWith: string; similarity: number }> = [];

  for (const ingredient of ingredients) {
    if (!ingredient) continue;
    const normalizedIngredient = ingredient.toLowerCase().trim();

    // Först kolla om det är ett exakt säkert undantag
    const exactSafeMatch = findBestMatch(normalizedIngredient, SAFE_EXCEPTIONS, true);
    if (exactSafeMatch.match) {
      fuzzyMatches.push({
        ingredient: normalizedIngredient,
        matchedWith: exactSafeMatch.match,
        similarity: exactSafeMatch.similarity
      });
      debugInfo.push(`${ingredient} matchade exakt säkert undantag: ${exactSafeMatch.match}`);
      continue;
    }

    // Sedan kolla mot säkra undantag med fuzzy matching
    const safeMatch = findBestMatch(normalizedIngredient, SAFE_EXCEPTIONS);
    if (safeMatch.match) {
      fuzzyMatches.push({
        ingredient: normalizedIngredient,
        matchedWith: safeMatch.match,
        similarity: safeMatch.similarity
      });
      debugInfo.push(`${ingredient} matchade säkert undantag: ${safeMatch.match} (${(safeMatch.similarity * 100).toFixed(1)}% likhet)`);
      continue;
    }

    // Kontrollera icke-veganska ingredienser
    const nonVeganMatch = findBestMatch(normalizedIngredient, DEFINITELY_NON_VEGAN);
    if (nonVeganMatch.match) {
      // Extra kontroll för sammansatta ord
      const isCompoundException = Array.from(SAFE_EXCEPTIONS).some(exception => {
        const normalizedException = normalizeString(exception);
        // Kontrollera om hela ingrediensen är ett säkert undantag
        if (normalizedIngredient === normalizedException) {
          return true;
        }
        // Kontrollera om det är ett sammansatt ord som börjar med ett säkert prefix
        const safeWords = ['havre', 'kokos', 'soja', 'mandel', 'ris', 'växt'];
        return safeWords.some(safeWord => 
          normalizedIngredient.startsWith(normalizeString(safeWord))
        );
      });

      if (!isCompoundException) {
        nonVeganFound.push(ingredient);
        fuzzyMatches.push({
          ingredient: normalizedIngredient,
          matchedWith: nonVeganMatch.match,
          similarity: nonVeganMatch.similarity
        });
        debugInfo.push(`${ingredient} matchade icke-vegansk ingrediens: ${nonVeganMatch.match} (${(nonVeganMatch.similarity * 100).toFixed(1)}% likhet)`);
        continue;
      } else {
        debugInfo.push(`${ingredient} ignorerades som säkert sammansatt ord`);
      }
    }

    // Kontrollera potentiellt icke-veganska ingredienser
    const potentialMatch = findBestMatch(normalizedIngredient, POTENTIALLY_NON_VEGAN);
    if (potentialMatch.match) {
      uncertainFound.push(ingredient);
      confidence = Math.min(confidence, 0.8);
      fuzzyMatches.push({
        ingredient: normalizedIngredient,
        matchedWith: potentialMatch.match,
        similarity: potentialMatch.similarity
      });
      debugInfo.push(`${ingredient} matchade potentiellt icke-vegansk ingrediens: ${potentialMatch.match} (${(potentialMatch.similarity * 100).toFixed(1)}% likhet)`);
    }

    // Kontrollera animaliska indikatorer i ingrediensnamnet
    const hasAnimalIndicator = Array.from(ANIMAL_INDICATORS).some((indicator: string) => 
      normalizeString(ingredient).includes(normalizeString(indicator))
    );
    if (hasAnimalIndicator) {
      confidence = Math.min(confidence, 0.9);
      debugInfo.push(`${ingredient} innehåller en animalisk indikator`);
    }
  }

  // Bygg resonemang
  const reasoningParts: string[] = [];
  
  if (nonVeganFound.length > 0) {
    reasoningParts.push(`Följande ingredienser är inte veganska: ${nonVeganFound.join(', ')}.`);
  }
  
  if (uncertainFound.length > 0) {
    reasoningParts.push(`Följande ingredienser kan vara icke-veganska och bör kontrolleras närmare: ${uncertainFound.join(', ')}.`);
  }
  
  // Lägg till debug-information i utvecklingsläge
  if (process.env.NODE_ENV === 'development') {
    reasoningParts.push('\nDetaljerad analysdata:\n' + debugInfo.join('\n'));
  }

  return {
    isVegan: nonVeganFound.length === 0,
    confidence: confidence,
    nonVeganIngredients: nonVeganFound,
    uncertainIngredients: uncertainFound,
    reasoning: reasoningParts.join('\n\n') || 'Alla ingredienser bedöms som veganska.',
    debug: {
      fuzzyMatches
    }
  };
}

/**
 * Hjälpfunktion för att testa validering av enskilda ingredienser
 */
export function testIngredient(ingredient: string): ValidationResult {
  return validateIngredients([ingredient]);
}