/**
 * Database of known vegan and non-vegan ingredients with translations
 * Used for validating and correcting AI-generated ingredient classifications
 */

// Known vegan ingredients, including processed soy products and plant-based foods
export const knownVeganIngredients: string[] = [
  // Soy products
  'sojabönor', 'sojaböna', 'sojabönspasta', 'tofu', 'tempeh', 'sojamjölk', 'sojasås', 'miso',
  'textured soy protein', 'texturerat sojaprotein', 'sojalecitin', 'edamame', 'yuba',
  // Other plant-based proteins
  'seitan', 'quinoa', 'kikärtor', 'linser', 'bönor', 'nötter', 'frön',
  // Vegetables and fruits
  'grönsaker', 'frukt', 'bär', 'potatis', 'morötter', 'lök', 'vitlök', 'tomater', 'paprika',
  // Grains and cereals
  'ris', 'havre', 'korn', 'vete', 'majs', 'råg', 'bulgur', 'couscous', 'pasta',
  // Nuts and seeds
  'mandel', 'hasselnöt', 'valnöt', 'paranöt', 'pistagenöt', 'macadamianöt', 'solrosfrön', 'pumpafrön',
  'chiafrön', 'linfrön', 'hampafrön', 'sesamfrön',
  // Oils and fats
  'olivolja', 'rapsolja', 'solrosolja', 'sesamolja', 'kokosolja', 'linfröolja',
  // Sweeteners
  'socker', 'agavesirap', 'lönnsirap', 'honung', 'fruktjuice',
  // Miscellaneous
  'jäst', 'bakpulver', 'bikarbonat', 'salt', 'kryddor', 'örter', 'vinäger', 'surdeg',
  'alger', 'nori', 'spirulina', 'chlorella'
];

// Known non-vegan ingredients, including animal products and derivatives
export const knownNonVeganIngredients: string[] = [
  // Dairy products
  'mjölk', 'grädde', 'smör', 'ost', 'yoghurt', 'kefir', 'filmjölk', 'vassle', 'kasein', 'laktos',
  'skummjölkspulver', 'helmjölkspulver', 'kondenserad mjölk', 'glass',
  // Eggs
  'ägg', 'äggula', 'äggvita', 'äggpulver', 'ägglecitin', 'äggalbumin',
  // Meat and fish
  'kött', 'nötkött', 'fläskkött', 'kyckling', 'kalkon', 'lamm', 'vilt', 'korv', 'fisk', 'skaldjur',
  'räkor', 'hummer', 'krabba', 'musslor', 'ostron', 'bläckfisk', 'tonfisk', 'lax',
  // Animal-derived ingredients
  'gelatin', 'animaliskt fett', 'talgfett', 'ister', 'lard', 'schmaltz', 'ghi', 'bivax',
  'honung', 'propolis', 'royal jelly', 'karmin', 'shellac', 'animaliskt rennet',
  'pepsin', 'lanolin', 'kollagen', 'elastin', 'keratin', 'benmjöl', 'köttbuljong',
  'hönsfond', 'oxfond'
];

// Common translations of ingredients (for multilingual support)
export const ingredientTranslations: Record<string, string[]> = {
  // Swedish to other languages - format: 'swedish': ['english', 'german', 'french', 'spanish', 'italian', 'dutch']
  'socker': ['sugar', 'zucker', 'sucre', 'azúcar', 'zucchero', 'suiker'],
  'salt': ['salt', 'salz', 'sel', 'sal', 'sale', 'zout'],
  'mjölk': ['milk', 'milch', 'lait', 'leche', 'latte', 'melk'],
  'grädde': ['cream', 'sahne', 'crème', 'crema', 'panna', 'room'],
  'smör': ['butter', 'butter', 'beurre', 'mantequilla', 'burro', 'boter'],
  'ägg': ['egg', 'ei', 'œuf', 'huevo', 'uovo', 'ei'],
  'vetemjöl': ['wheat flour', 'weizenmehl', 'farine de blé', 'harina de trigo', 'farina di frumento', 'tarwebloem'],
  'kött': ['meat', 'fleisch', 'viande', 'carne', 'carne', 'vlees'],
  'fisk': ['fish', 'fisch', 'poisson', 'pescado', 'pesce', 'vis'],
  'ost': ['cheese', 'käse', 'fromage', 'queso', 'formaggio', 'kaas'],
  'vatten': ['water', 'wasser', 'eau', 'agua', 'acqua', 'water'],
  'olja': ['oil', 'öl', 'huile', 'aceite', 'olio', 'olie'],
  'jäst': ['yeast', 'hefe', 'levure', 'levadura', 'lievito', 'gist'],
  'sojasås': ['soy sauce', 'sojasoße', 'sauce soja', 'salsa de soja', 'salsa di soia', 'sojasaus'],
  'tofu': ['tofu', 'tofu', 'tofu', 'tofu', 'tofu', 'tofu'],
  'ris': ['rice', 'reis', 'riz', 'arroz', 'riso', 'rijst'],
  'potatis': ['potato', 'kartoffel', 'pomme de terre', 'patata', 'patata', 'aardappel'],
  'tomater': ['tomatoes', 'tomaten', 'tomates', 'tomates', 'pomodori', 'tomaten'],
  'lök': ['onion', 'zwiebel', 'oignon', 'cebolla', 'cipolla', 'ui'],
  'vitlök': ['garlic', 'knoblauch', 'ail', 'ajo', 'aglio', 'knoflook'],
  'nötter': ['nuts', 'nüsse', 'noix', 'nueces', 'noci', 'noten'],
  'frukt': ['fruit', 'frucht', 'fruit', 'fruta', 'frutta', 'fruit'],
  'bär': ['berries', 'beeren', 'baies', 'bayas', 'bacche', 'bessen'],
  'choklad': ['chocolate', 'schokolade', 'chocolat', 'chocolate', 'cioccolato', 'chocolade'],
  'honung': ['honey', 'honig', 'miel', 'miel', 'miele', 'honing'],
  'yoghurt': ['yogurt', 'joghurt', 'yaourt', 'yogur', 'yogurt', 'yoghurt'],
  'vinäger': ['vinegar', 'essig', 'vinaigre', 'vinagre', 'aceto', 'azijn'],
  'senap': ['mustard', 'senf', 'moutarde', 'mostaza', 'senape', 'mosterd'],
  'kanel': ['cinnamon', 'zimt', 'cannelle', 'canela', 'cannella', 'kaneel'],
  'peppar': ['pepper', 'pfeffer', 'poivre', 'pimienta', 'pepe', 'peper']
};

/**
 * Determine if an ingredient name is likely vegan based on known lists
 * @param ingredientName The ingredient name to check
 * @returns {boolean|null} true if known vegan, false if known non-vegan, null if unknown
 */
export function isIngredientVegan(ingredientName: string): boolean | null {
  const normalizedName = ingredientName.toLowerCase().trim();
  
  // Check against known vegan ingredients
  if (knownVeganIngredients.some(veganIngredient => 
    normalizedName.includes(veganIngredient.toLowerCase()))) {
    return true;
  }
  
  // Check against known non-vegan ingredients
  if (knownNonVeganIngredients.some(nonVeganIngredient => 
    normalizedName.includes(nonVeganIngredient.toLowerCase()))) {
    return false;
  }
  
  // Unknown status
  return null;
}

/**
 * Attempt to translate an ingredient name to Swedish
 * @param ingredientName The ingredient name to translate
 * @returns The Swedish translation if found, or the original name if not found
 */
export function translateToSwedish(ingredientName: string): string {
  const normalizedName = ingredientName.toLowerCase().trim();
  
  // Check each translation entry
  for (const [swedish, translations] of Object.entries(ingredientTranslations)) {
    // If any translation matches, return the Swedish name
    if (translations.some(translation => 
      normalizedName.includes(translation.toLowerCase()))) {
      return swedish;
    }
  }
  
  // Return the original if no translation found
  return ingredientName;
}

/**
 * Simple language detection based on common words and character patterns
 * @param text The text to analyze
 * @returns The detected language code or 'unknown'
 */
export function detectLanguage(text: string): string {
  const normalized = text.toLowerCase();
  
  // Check for distinctive characters
  if (/[åäö]/.test(normalized)) return 'sv';
  if (/[ñáéíóúü]/.test(normalized)) return 'es';
  if (/[èéêëàâçîïôùûÿœæ]/.test(normalized)) return 'fr';
  if (/[äöüß]/.test(normalized)) return 'de';
  if (/[àèéìíòóù]/.test(normalized)) return 'it';
  if (/[ëïéèêçàäöü]/.test(normalized)) return 'nl';
  
  // Check for common words
  const words = normalized.split(/\s+/);
  
  // Count language-specific word matches
  const langMatches = {
    en: 0, sv: 0, es: 0, fr: 0, de: 0, it: 0, nl: 0
  };
  
  // Common words in different languages
  const langWords: Record<string, string[]> = {
    en: ['the', 'and', 'ingredients', 'contains', 'may', 'product'],
    sv: ['och', 'innehåller', 'ingredienser', 'kan', 'produkt'],
    es: ['los', 'las', 'ingredientes', 'contiene', 'puede', 'producto'],
    fr: ['les', 'des', 'ingrédients', 'contient', 'peut', 'produit'],
    de: ['die', 'und', 'zutaten', 'enthält', 'kann', 'produkt'],
    it: ['gli', 'ingredienti', 'contiene', 'può', 'prodotto'],
    nl: ['de', 'en', 'ingrediënten', 'bevat', 'kan', 'product']
  };
  
  // Count word matches
  for (const word of words) {
    for (const [lang, wordList] of Object.entries(langWords)) {
      if (wordList.includes(word)) {
        langMatches[lang as keyof typeof langMatches]++;
      }
    }
  }
  
  // Find language with most matches
  let maxLang = 'unknown';
  let maxCount = 0;
  
  for (const [lang, count] of Object.entries(langMatches)) {
    if (count > maxCount) {
      maxCount = count;
      maxLang = lang;
    }
  }
  
  return maxCount > 0 ? maxLang : 'unknown';
} 