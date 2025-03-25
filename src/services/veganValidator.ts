// C:\Projects\koalens-backend\src\services\veganValidator.ts
import { distance } from 'fastest-levenshtein';
import { 
  DEFINITELY_NON_VEGAN, 
  POTENTIALLY_NON_VEGAN, 
  ANIMAL_INDICATORS,
  SAFE_EXCEPTIONS 
} from '@/constants/veganIngredients';

export interface ValidationResult {
  isVegan: boolean | null;
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

  // Handle empty ingredient list as a special case - may indicate a problem with image recognition
  if (!ingredients || ingredients.length === 0) {
    return {
      isVegan: null,
      confidence: 0.3,
      nonVeganIngredients: [],
      uncertainIngredients: [],
      reasoning: 'Inga ingredienser kunde identifieras, vilket kan indikera problem med bildkvaliteten.',
      debug: {
        fuzzyMatches: []
      }
    };
  }

  // Detect suspicious ingredients that may indicate misreading
  const suspiciousIngredients = ingredients.some(ingredient => 
    ingredient.includes('(något)') || 
    ingredient.includes('(...)') ||
    ingredient.includes('...') ||
    ingredient.includes('???')
  );
  
  // Check for partial words that may indicate unclear reading
  const partialWordPatterns = ingredients.some(ingredient => {
    // Check for words followed by parentheses indicating partial reading
    return /\w+\s*\([^)]*\)/.test(ingredient) || 
           // Check for short words (likely partial readings)
           (ingredient.length <= 4 && !/salt|mjöl|olja|ris|kli|malt|ägg|soja|vax|jäst|miso|tofu/i.test(ingredient));
  });
  
  // If we have suspicious patterns that indicate text misreading
  if (suspiciousIngredients || partialWordPatterns) {
    confidence = Math.min(confidence, 0.4); // Significantly lower confidence
    debugInfo.push('Misstänkta läsfel detekterade i ingredienslistan.');
  }

  // If we have too few ingredients (likely image recognition error)
  if (ingredients.length <= 2) {
    confidence = Math.min(confidence, 0.7); // Lower confidence for very short lists
    debugInfo.push('Väldigt få ingredienser identifierade - möjligt att vissa saknas.');
  }

  // Check for inconsistent ingredient naming that may indicate misreading
  const ingredientLengths = ingredients.map(i => i.length);
  const medianLength = ingredientLengths.sort((a, b) => a - b)[Math.floor(ingredientLengths.length / 2)];
  const hasInconsistentLengths = ingredients.some(ingredient => 
    ingredient.length < 3 || (ingredient.length > medianLength * 3)
  );
  
  if (hasInconsistentLengths) {
    confidence = Math.min(confidence, 0.6);
    debugInfo.push('Ingrediensnamnen har inkonsekvent längd, vilket kan indikera läsfel.');
  }

  // Detect nonsensical ingredients that are not even close to any known ingredients
  const possibleGibberish = ingredients.filter(ingredient => {
    // Normalize for checking
    const normalized = normalizeString(ingredient);
    
    // Skip very short ingredients
    if (normalized.length <= 2) return false;
    
    // Check against all known ingredients (both safe and non-vegan)
    const allKnownIngredients = new Set([
      ...Array.from(DEFINITELY_NON_VEGAN),
      ...Array.from(POTENTIALLY_NON_VEGAN),
      ...Array.from(SAFE_EXCEPTIONS)
    ]);
    
    // Find best match against any known ingredient
    const bestMatch = findBestMatch(normalized, allKnownIngredients);
    
    // If similarity is very low, it might be gibberish or misreading
    return bestMatch.similarity < 0.4;
  });
  
  if (possibleGibberish.length > 0) {
    confidence = Math.min(confidence, 0.5);
    debugInfo.push(`Potentiellt fellästa ingredienser: ${possibleGibberish.join(', ')}`);
  }

  // Main ingredient analysis loop
  for (const ingredient of ingredients) {
    if (!ingredient) continue;
    
    // Skip processing ingredients that appear to be partial reads
    if ((/\w+\s*\([^)]*\)/.test(ingredient) && 
         ingredient.includes('något') || 
         ingredient.includes('...') || 
         ingredient.includes('???')) || 
        (ingredient.length <= 3 && !/ris|kli|olja|ägg|vax|soja/i.test(ingredient))) {
      
      uncertainFound.push(ingredient);
      confidence = Math.min(confidence, 0.5);
      debugInfo.push(`${ingredient} ser ut att vara ofullständigt avläst och har markerats som osäker`);
      continue;
    }
    
    const normalizedIngredient = normalizeString(ingredient);

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
        // If we suspect misreading, be more cautious about declaring non-vegan
        if (suspiciousIngredients || partialWordPatterns || possibleGibberish.includes(ingredient)) {
          uncertainFound.push(ingredient);
          confidence = Math.min(confidence, 0.5);
          debugInfo.push(`${ingredient} matchade icke-vegansk ingrediens men misstänks vara felläst: ${nonVeganMatch.match}`);
        } else {
          nonVeganFound.push(ingredient);
          fuzzyMatches.push({
            ingredient: normalizedIngredient,
            matchedWith: nonVeganMatch.match,
            similarity: nonVeganMatch.similarity
          });
          debugInfo.push(`${ingredient} matchade icke-vegansk ingrediens: ${nonVeganMatch.match} (${(nonVeganMatch.similarity * 100).toFixed(1)}% likhet)`);
        }
        continue;
      } else {
        debugInfo.push(`${ingredient} ignorerades som säkert sammansatt ord`);
      }
    }

    // Kontrollera potentiellt icke-veganska ingredienser med högre känslighet
    const potentialMatch = findBestMatch(normalizedIngredient, POTENTIALLY_NON_VEGAN);
    if (potentialMatch.match) {
      uncertainFound.push(ingredient);
      // Significant reduction in confidence for uncertain ingredients
      confidence = Math.min(confidence, 0.7);
      fuzzyMatches.push({
        ingredient: normalizedIngredient,
        matchedWith: potentialMatch.match,
        similarity: potentialMatch.similarity
      });
      debugInfo.push(`${ingredient} matchade potentiellt icke-vegansk ingrediens: ${potentialMatch.match} (${(potentialMatch.similarity * 100).toFixed(1)}% likhet)`);
    }

    // Kontrollera animaliska indikatorer i ingrediensnamnet
    const hasAnimalIndicator = Array.from(ANIMAL_INDICATORS).some((indicator: string) => 
      normalizedIngredient.includes(normalizeString(indicator))
    );
    if (hasAnimalIndicator) {
      confidence = Math.min(confidence, 0.8);
      debugInfo.push(`${ingredient} innehåller en animalisk indikator`);
    }
  }

  // If we have a lot of uncertain ingredients, this is a problem
  if (uncertainFound.length > 2 || uncertainFound.length > ingredients.length * 0.3) {
    confidence = Math.min(confidence, 0.5);
  }

  // Reduce confidence if we found image quality or reading issues
  if (suspiciousIngredients || partialWordPatterns || hasInconsistentLengths || possibleGibberish.length > 0) {
    confidence = Math.min(confidence, 0.6);
  }

  // Bygg resonemang
  const reasoningParts: string[] = [];
  
  if (nonVeganFound.length > 0) {
    reasoningParts.push(`Följande ingredienser är inte veganska: ${nonVeganFound.join(', ')}.`);
  }
  
  if (uncertainFound.length > 0) {
    reasoningParts.push(`Följande ingredienser kan vara icke-veganska och bör kontrolleras närmare: ${uncertainFound.join(', ')}.`);
  }
  
  // Add warning about potential misreading if applicable
  if (suspiciousIngredients || partialWordPatterns || possibleGibberish.length > 0) {
    reasoningParts.push(`Varning: Möjliga läsfel i ingredienslistan detekterade. Resultatet kan vara mindre tillförlitligt.`);
  }
  
  // Lägg till debug-information i utvecklingsläge
  if (process.env.NODE_ENV === 'development') {
    reasoningParts.push('\nDetaljerad analysdata:\n' + debugInfo.join('\n'));
  }

  // Determine isVegan status based on our findings
  let isVegan: boolean | null = nonVeganFound.length === 0;
  
  // If confidence is too low, we can't make a reliable determination
  if (confidence < 0.5) {
    isVegan = null;
    reasoningParts.unshift('Osäker analys av ingredienslistan. Fler detaljer behövs för en säker bedömning.');
  }

  return {
    isVegan: isVegan,
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