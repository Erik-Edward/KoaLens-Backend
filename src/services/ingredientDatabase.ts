// C:\Projects\koalens-backend\src\services\ingredientDatabase.ts
import { createReadStream } from 'fs';
import { parse, Parser } from 'csv-parse';
import path from 'path';
import fs from 'fs';

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
    this.loadDatabaseSync('non-vegan.csv', this.nonVeganIngredients);
    this.loadDatabaseSync('uncertain.csv', this.uncertainIngredients);
  }

  private loadDatabaseSync(filename: string, targetMap: Map<string, IngredientInfo>) {
    const filePath = path.join(__dirname, '..', 'data', filename);
    try {
      const content = fs.readFileSync(filePath, 'utf8');
      const rows = content.split('\n').filter(row => row.trim());
      const header = rows[0]?.toLowerCase().includes('name');
      const dataRows = header ? rows.slice(1) : rows;

      for (const row of dataRows) {
        const fields = row.split(',').map(field => field.replace(/^"|"$/g, '').trim());
        if (fields.length > 0 && fields[0]) {
          targetMap.set(fields[0].toLowerCase(), {
            name: fields[0],
            e_number: fields[1] || undefined,
            description: fields[2] || undefined
          });
        } else {
          console.warn(`Skipping invalid row in ${filename}:`, row);
        }
      }
      console.log(`Successfully loaded ${targetMap.size} entries from ${filename} synchronously.`);
    } catch (error) {
      console.error(`Error loading ${filename} synchronously:`, error);
    }
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