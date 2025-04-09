# Frontend Changes for Enhanced Ingredient Display

This document outlines the necessary changes in the frontend codebase (React Native) to correctly handle the updated API response structure from the backend, which now provides more detailed information about ingredient statuses.

## 1. Update Data Structures/Types

The core data models used to represent product information need to be updated to align with the backend's richer data. These changes likely reside in `models/productModel.ts` or similar type definition files.

**Key Interfaces to Update:**

*   **`WatchedIngredient`:** This interface describes ingredients specifically flagged by the backend (non-vegan or uncertain).
    *   Ensure fields exist for:
        *   `name: string`
        *   `reason: string` (e.g., 'non-vegan', 'uncertain', 'potentially-non-vegan')
        *   `status: 'vegan' | 'non-vegan' | 'uncertain'`
        *   `description?: string` (Optional detailed description/explanation)

*   **`ProductAnalysis`:** Represents the overall analysis result.
    *   Modify `isVegan` to accept `null`: `isVegan: boolean | null;` (`null` signifies an uncertain overall status).
    *   Ensure `isUncertain: boolean;` exists.
    *   Replace simpler lists of ingredient names (like `detectedNonVeganIngredients`, `uncertainIngredients`) with a single, detailed list: `watchedIngredients: WatchedIngredient[];` This list contains all ingredients with a specific status remark from the backend.
    *   Retain other fields like `confidence`, `reasoning`, `detectedLanguage`.

*   **`Product`:** The main product object.
    *   **Crucially**, change the `ingredients` field to hold a list of detailed items, not just strings: `ingredients: IngredientListItem[];` (See `IngredientListItem` definition below).

**New Interface Required:**

*   **`IngredientListItem`:** Define a new interface to represent each item in the *main* `Product.ingredients` list. This list includes *all* detected ingredients, not just the flagged ones.
    ```typescript
    export interface IngredientListItem {
      name: string;
      // Status reflects the final determination for display
      status: 'vegan' | 'non-vegan' | 'uncertain' | 'unknown';
      // Hex color code (#RRGGBB) for easy styling
      statusColor: string;
      // Optional description, potentially from watchedIngredients
      description?: string;
    }
    ```
    *   `status: 'unknown'` and a default `statusColor` should be used for ingredients that were detected but not specifically flagged in `watchedIngredients`.

## 2. Update Logic in Result Screen (`app/(tabs)/(scan)/result.tsx`)

The component responsible for displaying the analysis results needs significant updates.

*   **`createProductFromAnalysis` (or equivalent data transformation function):**
    *   **Input:** This function must now expect the updated analysis result structure from the API/backend.
    *   **Output:** It should construct the `Product` object according to the updated types defined above.
    *   **Logic:**
        *   **Populate `Product.analysis`:** Directly map the fields from the backend result (`isVegan`, `isUncertain`, `watchedIngredients`, etc.).
        *   **Populate `Product.ingredients` (`IngredientListItem[]`):**
            1.  Get the list of *all* ingredient names from the backend response (this might be a separate field or inferred from the source text).
            2.  Iterate through this list of all ingredient names.
            3.  For each ingredient name, check if it exists in the `analysis.watchedIngredients` list received from the backend.
            4.  If **found** in `watchedIngredients`: Create an `IngredientListItem` using the `name`, `status`, `description` from the matched `WatchedIngredient`. Determine the `statusColor` based on the `status` (e.g., red for 'non-vegan', orange for 'uncertain').
            5.  If **not found** in `watchedIngredients`: Create an `IngredientListItem` with `status: 'unknown'` and a default `statusColor` (e.g., gray or black).
        *   Populate `Product.metadata` as before.

*   **`IngredientsList` Component:**
    *   **Props:** Update the component to accept `ingredients: IngredientListItem[]` as its primary data prop.
    *   **Rendering:**
        *   Iterate over the received `IngredientListItem[]`.
        *   For each item, render the `item.name`.
        *   Use the `item.statusColor` to style the text color, background color, or add a status indicator (like a colored dot) for that ingredient row.
        *   Optionally display `item.description` if available (e.g., in a tooltip or secondary text line).

*   **Overall Status Display:**
    *   Update the UI logic that shows the main result ("Vegan", "Non-Vegan", "Uncertain").
    *   It should now correctly interpret:
        *   `analysis.isVegan === false` -> "Non-Vegan"
        *   `analysis.isVegan === true` -> "Vegan"
        *   `analysis.isVegan === null` (and/or `analysis.isUncertain === true`) -> "Uncertain" / "Osäker"

*   **"Problematic" Ingredients Section:**
    *   This section should now directly use the `analysis.watchedIngredients: WatchedIngredient[]` list.
    *   For each `WatchedIngredient`, display its `name` and potentially its `reason` or `description` to clarify *why* it was flagged. Use appropriate styling (colors) based on the `status`.

## Summary of Goal

The objective is to transition from displaying simple lists of ingredient names to a richer display where:
1.  The main ingredient list shows *all* ingredients.
2.  Each ingredient in the main list is visually styled (e.g., colored text/background) according to its determined status (non-vegan, uncertain, unknown).
3.  A separate section clearly lists only the non-vegan and uncertain ingredients, explaining *why* they are flagged, using the detailed `watchedIngredients` data.
4.  The overall product status accurately reflects uncertainty (`isVegan: null`).
