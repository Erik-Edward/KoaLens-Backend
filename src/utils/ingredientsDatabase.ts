/**
 * Database of known vegan and non-vegan ingredients with translations
 * Used for validating and correcting AI-generated ingredient classifications
 */
import * as fs from 'fs';
import * as path from 'path';
import { logger } from './logger';
import { normalizeString } from '../services/veganValidator';

interface IngredientData {
  name: string;
  eNumber?: string;
  description?: string;
}

// Cache for CSV data
let nonVeganCache: IngredientData[] | null = null;
let uncertainCache: IngredientData[] | null = null;
let veganCache: IngredientData[] | null = null; // Cache for vegan ingredients

// Known vegan ingredients, including processed soy products and plant-based foods
// export const knownVeganIngredients: string[] = [...];

// Known non-vegan ingredients, including animal products and derivatives
// export const knownNonVeganIngredients: string[] = [...];

/**
 * Ladda icke-veganska ingredienser från CSV-filen
 * @returns Lista med icke-veganska ingredienser
 */
export function loadNonVeganIngredients(): IngredientData[] {
  if (nonVeganCache !== null) {
    return nonVeganCache;
  }

  try {
    // Use __dirname to construct path relative to the compiled file location
    const filePath = path.join(__dirname, '..', 'data', 'non-vegan.csv');
    logger.info(`[Utils] Attempting to load: ${filePath}`);
    const content = fs.readFileSync(filePath, 'utf8');
    
    const rows = content.split('\n').filter(row => row.trim() && !row.startsWith('"name,e_number'));
    const ingredients: IngredientData[] = [];
    
    for (const row of rows) {
      const fields = row.split(','); // Dela direkt
      if (fields.length >= 1) { // Behöver minst ett namn-fält
          const name = fields[0]?.replace(/^"|"$/g, '').trim() || '';
          const eNumber = fields[1]?.replace(/^"|"$/g, '').trim() || ''; // Hantera fält 1 (kan vara tomt)
          const description = fields[2]?.replace(/^"|"$/g, '').trim() || ''; // Hantera fält 2 (kan vara tomt)

          if (name) {
              ingredients.push({ name, eNumber, description });
          } else {
               logger.warn(`Skipping row with empty name in non-vegan.csv: ${row}`); 
          }
      } else {
          logger.warn(`Skipping invalid row in non-vegan.csv: ${row}`); 
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
    // Use __dirname to construct path relative to the compiled file location
    const filePath = path.join(__dirname, '..', 'data', 'uncertain.csv');
    logger.info(`[Utils] Attempting to load: ${filePath}`);
    const content = fs.readFileSync(filePath, 'utf8');
    
    // Debug log the entire file for debugging purposes
    logger.debug(`[loadUncertainIngredients] Content: ${content}`);
    
    // More robust CSV parsing - support both CRLF and LF line endings
    const lines = content.replace(/\r\n/g, '\n').split('\n');
    const rows = lines.filter(row => row.trim() && !row.startsWith('"name,e_number'));
    
    logger.info(`[loadUncertainIngredients] Found ${rows.length} total rows in uncertain.csv`);
    
    const ingredients: IngredientData[] = [];
    
    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      // More robust CSV parsing - handle quotes correctly
      const fields = row.split(',').map(field => field.replace(/^"|"$/g, '').trim());

      if (fields.length >= 3) {
        const name = fields[0];
        const eNumber = fields[1];
        const description = fields[2];

        // Special handling for E304 to debug
        if (eNumber === 'E304') {
          logger.info(`[loadUncertainIngredients] Found E304 in uncertain.csv: ${name}, ${eNumber}, ${description}`);
        }

        if (name) {
          ingredients.push({
            name,
            eNumber: eNumber || undefined,
            description: description || undefined
          });
        } else {
          logger.warn(`Skipping row with empty name in uncertain.csv: ${row}`);
        }
      } else {
        logger.warn(`Skipping invalid row in uncertain.csv - expected at least 3 fields, got ${fields.length}: ${row}`);
      }
    }
    
    // Log all ingredients with E-numbers for debugging
    const eNumberIngredients = ingredients.filter(ing => ing.eNumber);
    logger.info(`[loadUncertainIngredients] Loaded ${eNumberIngredients.length} ingredients with E-numbers`);
    eNumberIngredients.forEach(ing => {
      logger.debug(`  - ${ing.name}: ${ing.eNumber}`);
    });
    
    uncertainCache = ingredients;
    logger.info(`Loaded ${ingredients.length} uncertain ingredients from database`);
    return ingredients;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error(`Failed to load uncertain ingredients database: ${errorMessage}`, { error });
    return [];
  }
}

/**
 * Ladda veganska ingredienser från CSV-filen
 * @returns Lista med veganska ingredienser
 */
export function loadVeganIngredients(): IngredientData[] {
  if (veganCache !== null) {
    return veganCache;
  }

  try {
    // Use __dirname to construct path relative to the compiled file location
    const filePath = path.join(__dirname, '..', 'data', 'vegan - vegan.csv'); // Ensure correct filename
    logger.info(`[Utils] Attempting to load: ${filePath}`);
    const content = fs.readFileSync(filePath, 'utf8');
    
    const rows = content.split('\n').filter(row => row.trim() && !row.startsWith('"name,e_number'));
    const ingredients: IngredientData[] = [];
    
    for (const row of rows) {
      const fields = row.split(','); // Dela direkt
      if (fields.length >= 1) { // Behöver minst ett namn-fält
          const name = fields[0]?.replace(/^"|"$/g, '').trim() || '';
          const eNumber = fields[1]?.replace(/^"|"$/g, '').trim() || ''; // Hantera fält 1 (kan vara tomt)
          const description = fields[2]?.replace(/^"|"$/g, '').trim() || ''; // Hantera fält 2 (kan vara tomt)

          if (name) {
              ingredients.push({ name, eNumber, description });
          } else {
               logger.warn(`Skipping row with empty name in vegan - vegan.csv: ${row}`); 
          }
      } else {
          logger.warn(`Skipping invalid row in vegan - vegan.csv: ${row}`); 
      }
    }
    
    veganCache = ingredients;
    logger.info(`Loaded ${ingredients.length} vegan ingredients from database`);
    return ingredients;
  } catch (error) {
    logger.error('Failed to load vegan ingredients database', { error });
    return [];
  }
}

/**
 * Kontrollera om en ingrediens är vegansk, icke-vegansk eller osäker baserat på databaser.
 * Ordning: Icke-vegansk -> Osäker -> Vegansk
 * @param ingredientName Ingrediensens namn att kontrollera
 * @returns Objekt med {isVegan, isUncertain, reason, matchedItem}
 */
export function checkIngredientStatus(ingredientName: string): { 
  isVegan: boolean | null,
  isUncertain: boolean,
  reason?: string,
  matchedItem?: IngredientData // Add matched item for better reasoning
} {
  // Add debug for E304 - for testing the issue
  const isE304Check = ingredientName.toUpperCase().includes('E304');
  if (isE304Check) {
    logger.info(`[checkIngredientStatus] Checking E304 ingredient: ${ingredientName}`);
  }
  
  // Normalisera namn för jämförelse med den delade funktionen
  const normalizedName = normalizeString(ingredientName);
  
  // Kontrollera efter E-nummer
  const eNumberMatch = normalizedName.match(/e([0-9]{3,4}[a-z]?)/i);
  let eNumber: string | null = null;
  
  if (eNumberMatch) {
    eNumber = `E${eNumberMatch[1].toUpperCase()}`; // Normalize E-number format
    
    // Add debug for E304
    if (eNumber === 'E304') {
      logger.info(`[checkIngredientStatus] Detected E304 in pattern matching: ${ingredientName} => ${eNumber}`);
    }
  }
  
  // Ladda databaser (cache hanteras inuti funktionerna)
  const nonVeganList = loadNonVeganIngredients();
  const uncertainList = loadUncertainIngredients();
  const veganList = loadVeganIngredients(); // Ladda nya veganska listan
  
  // DEBUG: For E304 testing, log the uncertain list
  if (isE304Check) {
    const e304InUncertain = uncertainList.find(item => item.eNumber === 'E304');
    logger.info(`[checkIngredientStatus] E304 found in uncertain list: ${!!e304InUncertain}, details: ${JSON.stringify(e304InUncertain)}`);
  }
  
  // 1. Kontrollera om ingrediensen är känd icke-vegansk
  const nonVeganMatch = nonVeganList.find(item => 
    normalizedName.includes(normalizeString(item.name)) ||
    (eNumber && item.eNumber && item.eNumber.toUpperCase() === eNumber)
  );
  
  if (nonVeganMatch) {
    if (isE304Check) {
      logger.info(`[checkIngredientStatus] E304 matched as non-vegan: ${JSON.stringify(nonVeganMatch)}`);
    }
    return { 
      isVegan: false, 
      isUncertain: false,
      reason: `${nonVeganMatch.name} är inte veganskt${nonVeganMatch.description ? `: ${nonVeganMatch.description}` : ''}`,
      matchedItem: nonVeganMatch
    };
  }
  
  // 2. Kontrollera om ingrediensen är osäker
  const uncertainMatch = uncertainList.find(item => 
    normalizedName.includes(normalizeString(item.name)) ||
    (eNumber && item.eNumber && item.eNumber.toUpperCase() === eNumber)
  );
  
  if (uncertainMatch) {
    if (isE304Check) {
      logger.info(`[checkIngredientStatus] E304 matched as uncertain: ${JSON.stringify(uncertainMatch)}`);
    }
    return { 
      isVegan: null, // Explicitly null as it's not confirmed either way
      isUncertain: true,
      reason: `${uncertainMatch.name} har osäker status${uncertainMatch.description ? `: ${uncertainMatch.description}` : ''}`,
      matchedItem: uncertainMatch
    };
  }

  // 3. Kontrollera om ingrediensen är känd vegansk
  const veganMatch = veganList.find(item => 
    normalizedName.includes(normalizeString(item.name)) ||
    (eNumber && item.eNumber && item.eNumber.toUpperCase() === eNumber)
  );

  if (veganMatch) {
    if (isE304Check) {
      logger.info(`[checkIngredientStatus] E304 matched as vegan: ${JSON.stringify(veganMatch)}`);
    }
    return {
      isVegan: true,
      isUncertain: false,
      reason: `${veganMatch.name} är veganskt${veganMatch.description ? `: ${veganMatch.description}` : ''}`,
      matchedItem: veganMatch
    };
  }
  
  // Okänd status - ingen match i någon lista
  if (isE304Check) {
    logger.info(`[checkIngredientStatus] E304 not matched in any list`);
  }
  return { isVegan: null, isUncertain: false };
}

// Initialisera databaserna vid start
loadNonVeganIngredients();
loadUncertainIngredients();
loadVeganIngredients(); // Ladda veganska listan vid start