// C:\Projects\koalens-backend\src\services\ingredientDatabase.ts
// Import the necessary function from utils
import { checkIngredientStatus as checkStatusFromUtils } from '../utils/ingredientsDatabase'; 

class IngredientDatabase {
  constructor() {
    console.log("[Service] IngredientDatabase initialized. Relies on utils/ingredientsDatabase for data.");
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

    // Delegate the check to the function in utils
    const statusResult = checkStatusFromUtils(ingredient);

    // Adapt the result from checkStatusFromUtils to the expected return type
    if (statusResult.isVegan === false) {
      // Non-vegan
      return {
        isVegan: false,
        confidence: 1.0, // High confidence for known non-vegan
        description: statusResult.reason || statusResult.matchedItem?.description
      };
    } else if (statusResult.isUncertain) {
      // Uncertain
      return {
        isVegan: false, // Treat uncertain as non-vegan for now?
        confidence: 0.5, // Low confidence
        description: statusResult.reason || statusResult.matchedItem?.description
      };
    } else if (statusResult.isVegan === true) {
      // Known vegan
      return {
        isVegan: true,
        confidence: 1.0, // High confidence for known vegan
        description: statusResult.reason || statusResult.matchedItem?.description
      };
    } else {
      // Unknown - default assumption (as per original logic)
      return {
        isVegan: true,
        confidence: 0.8
      };
    }
  }
}

export const ingredientDB = new IngredientDatabase();