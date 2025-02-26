// C:\Projects\koalens-backend\src\services\ingredientDatabase.ts
import { createReadStream } from 'fs';
import { parse, Parser } from 'csv-parse';
import path from 'path';

interface IngredientInfo {
  name: string;
  e_number?: string;
  description?: string;
}

interface CSVRow {
  name: string;
  e_number: string;
  description: string;
}

class IngredientDatabase {
  private nonVeganIngredients: Map<string, IngredientInfo> = new Map();
  private uncertainIngredients: Map<string, IngredientInfo> = new Map();

  constructor() {
    this.loadDatabase('non-vegan.csv', this.nonVeganIngredients);
    this.loadDatabase('uncertain.csv', this.uncertainIngredients);
  }

  private loadDatabase(filename: string, targetMap: Map<string, IngredientInfo>) {
    const filePath = path.join(__dirname, '..', 'data', filename);
    
    createReadStream(filePath)
      .pipe(parse({ 
        columns: true, 
        skip_empty_lines: true,
        trim: true // Trimma whitespace från värden
      }) as Parser)
      .on('data', (row: CSVRow) => {
        // Validera att vi har ett namn innan vi försöker använda det
        if (row && row.name && typeof row.name === 'string') {
          targetMap.set(row.name.toLowerCase(), {
            name: row.name,
            e_number: row.e_number || undefined,
            description: row.description || undefined
          });
        } else {
          console.warn('Skipping invalid row in CSV:', row);
        }
      })
      .on('error', (error: Error) => {
        console.error(`Error loading ${filename}:`, error);
      });
  }

  public checkIngredient(ingredient: string): {
    isVegan: boolean;
    confidence: number;
    description?: string;
  } {
    if (!ingredient || typeof ingredient !== 'string') {
      console.warn('Invalid ingredient provided to checkIngredient:', ingredient);
      return {
        isVegan: true,
        confidence: 0.5
      };
    }

    const normalizedIngredient = ingredient.toLowerCase().trim();
    
    // Kolla i non-vegan databasen
    const nonVegan = this.nonVeganIngredients.get(normalizedIngredient);
    if (nonVegan) {
      return {
        isVegan: false,
        confidence: 1.0,
        description: nonVegan.description
      };
    }

    // Kolla i uncertain databasen
    const uncertain = this.uncertainIngredients.get(normalizedIngredient);
    if (uncertain) {
      return {
        isVegan: false,
        confidence: 0.5,
        description: uncertain.description
      };
    }

    // Om ingrediensen inte finns i någon databas, anta att den är vegansk
    return {
      isVegan: true,
      confidence: 0.8
    };
  }
}

export const ingredientDB = new IngredientDatabase();