/**
 * Database of known vegan and non-vegan ingredients with translations
 * Used for validating and correcting AI-generated ingredient classifications
 */
import * as fs from 'fs';
import * as path from 'path';
import { logger } from './logger';

interface IngredientData {
  name: string;
  eNumber?: string;
  description?: string;
}

// Cache for CSV data
let nonVeganCache: IngredientData[] | null = null;
let uncertainCache: IngredientData[] | null = null;

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
  'socker', 'agavesirap', 'lönnsirap', 'fruktjuice',
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
 * Ladda icke-veganska ingredienser från CSV-filen
 * @returns Lista med icke-veganska ingredienser
 */
export function loadNonVeganIngredients(): IngredientData[] {
  if (nonVeganCache !== null) {
    return nonVeganCache;
  }

  try {
    const filePath = path.join(process.cwd(), 'src', 'data', 'non-vegan.csv');
    const content = fs.readFileSync(filePath, 'utf8');
    
    const rows = content.split('\n').filter(row => row.trim() && !row.startsWith('"name,e_number'));
    const ingredients: IngredientData[] = [];
    
    for (const row of rows) {
      // Ta bort citattecken och separera fält
      const cleanRow = row.replace(/^"|"$/g, '').replace(/","/g, '","');
      const [name, eNumber, description] = cleanRow.split(',').map(field => 
        field?.replace(/^"|"$/g, '') || ''
      );
      
      if (name) {
        ingredients.push({ name, eNumber, description });
      }
    }
    
    nonVeganCache = ingredients;
    logger.info(`Loaded ${ingredients.length} non-vegan ingredients from database`);
    return ingredients;
  } catch (error) {
    logger.error('Failed to load non-vegan ingredients database', { error });
    return [];
  }
}

/**
 * Ladda osäkra ingredienser från CSV-filen
 * @returns Lista med osäkra ingredienser
 */
export function loadUncertainIngredients(): IngredientData[] {
  if (uncertainCache !== null) {
    return uncertainCache;
  }

  try {
    const filePath = path.join(process.cwd(), 'src', 'data', 'uncertain.csv');
    const content = fs.readFileSync(filePath, 'utf8');
    
    const rows = content.split('\n').filter(row => row.trim() && !row.startsWith('"name,e_number'));
    const ingredients: IngredientData[] = [];
    
    for (const row of rows) {
      // Ta bort citattecken och separera fält
      const cleanRow = row.replace(/^"|"$/g, '').replace(/","/g, '","');
      const [name, eNumber, description] = cleanRow.split(',').map(field => 
        field?.replace(/^"|"$/g, '') || ''
      );
      
      if (name) {
        ingredients.push({ name, eNumber, description });
      }
    }
    
    uncertainCache = ingredients;
    logger.info(`Loaded ${ingredients.length} uncertain ingredients from database`);
    return ingredients;
  } catch (error) {
    logger.error('Failed to load uncertain ingredients database', { error });
    return [];
  }
}

/**
 * Kontrollera om en ingrediens är vegansk, icke-vegansk eller osäker
 * @param ingredientName Ingrediensens namn att kontrollera
 * @returns Objekt med {isVegan, isUncertain, reason}
 */
export function checkIngredientStatus(ingredientName: string): { 
  isVegan: boolean | null,
  isUncertain: boolean,
  reason?: string
} {
  // Normalisera namn för jämförelse
  const normalizedName = ingredientName.toLowerCase().trim();
  
  // Kontrollera efter E-nummer
  const eNumberMatch = normalizedName.match(/e([0-9]{3,4}[a-z]?)/i);
  let eNumber: string | null = null;
  
  if (eNumberMatch) {
    eNumber = `E${eNumberMatch[1]}`;
  }
  
  // Ladda databaser
  const nonVeganList = loadNonVeganIngredients();
  const uncertainList = loadUncertainIngredients();
  
  // Kontrollera om ingrediensen är känd icke-vegansk
  const nonVeganMatch = nonVeganList.find(item => 
    normalizedName.includes(item.name.toLowerCase()) || 
    (eNumber && item.eNumber && item.eNumber.toLowerCase() === eNumber.toLowerCase())
  );
  
  if (nonVeganMatch) {
    return { 
      isVegan: false, 
      isUncertain: false,
      reason: `Innehåller ${nonVeganMatch.name}${nonVeganMatch.description ? ` (${nonVeganMatch.description})` : ''}`
    };
  }
  
  // Kontrollera om ingrediensen är osäker
  const uncertainMatch = uncertainList.find(item => 
    normalizedName.includes(item.name.toLowerCase()) || 
    (eNumber && item.eNumber && item.eNumber.toLowerCase() === eNumber.toLowerCase())
  );
  
  if (uncertainMatch) {
    return { 
      isVegan: null, 
      isUncertain: true,
      reason: `Innehåller ${uncertainMatch.name}${uncertainMatch.description ? ` (${uncertainMatch.description})` : ''}`
    };
  }
  
  // Fallback till den enklare kontrollen för kända veganska/icke-veganska ingredienser
  if (knownVeganIngredients.some(veganIngredient => 
    normalizedName.includes(veganIngredient.toLowerCase()))) {
    return { isVegan: true, isUncertain: false };
  }
  
  if (knownNonVeganIngredients.some(nonVeganIngredient => 
    normalizedName.includes(nonVeganIngredient.toLowerCase()))) {
    return { 
      isVegan: false, 
      isUncertain: false,
      reason: `Innehåller animalisk ingrediens (${normalizedName})`
    };
  }
  
  // Okänd status
  return { isVegan: null, isUncertain: false };
}

/**
 * Determine if an ingredient name is likely vegan based on known lists
 * @param ingredientName The ingredient name to check
 * @returns {boolean|null} true if known vegan, false if known non-vegan, null if unknown
 */
export function isIngredientVegan(ingredientName: string): boolean | null {
  const { isVegan } = checkIngredientStatus(ingredientName);
  return isVegan;
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