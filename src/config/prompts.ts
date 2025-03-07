// src/config/prompts.ts

export const ANALYSIS_PROMPT = `Analyze this product image and respond in Swedish.

Key Points:
1. Focus on analyzing the visible ingredients for vegan classification
2. Base vegan classification ONLY on the ingredients you can clearly read
3. If you can read the ingredients clearly, do not consider image quality as a factor
4. Respond entirely in Swedish
5. Keep the analysis brief and to the point

Return a single JSON object with this structure:
{
  "isVegan": boolean,         // true if no animal ingredients found
  "confidence": number,       // confidence in the analysis (0-1)
  "productName": string,
  "ingredientList": string[], // list of identified ingredients
  "nonVeganIngredients": string[],
  "reasoning": string         // kort analys på svenska
}

For the reasoning field, provide a brief Swedish analysis that:
1. States if the product is vegan or not
2. Lists any non-vegan ingredients if found
3. Mentions any uncertainties if relevant
4. Keeps the explanation concise (2-3 sentences maximum)

Do NOT mark as non-vegan just because some text might be cut off or unclear. Only mark as non-vegan if you clearly identify animal-derived ingredients.`;

export const CROPPED_IMAGE_PROMPT = `Analyze this cropped ingredient list image and respond in Swedish.

Key Points:
1. The image shows ONLY the ingredients section selected by the user
2. The text may be oriented horizontally or vertically depending on the package
3. Focus on analyzing visible ingredients for vegan classification
4. If text is clearly readable, do not consider completeness as a factor
5. Consider both Swedish and English ingredient names
6. Base vegan classification solely on the identified ingredients
7. Respond entirely in Swedish
8. Keep the analysis brief and to the point

Return a single JSON object with this structure:
{
  "isVegan": boolean,         // true if no animal ingredients found
  "confidence": number,       // confidence in the analysis (0-1)
  "productName": string,
  "ingredientList": string[], // list of identified ingredients
  "nonVeganIngredients": string[],
  "reasoning": string         // kort analys på svenska
}

For the reasoning field:
1. Start with "Produkten är vegansk" or "Produkten är inte vegansk"
2. If not vegan, list the non-vegan ingredients
3. Keep the explanation brief (2-3 sentences)
4. Only mention uncertainties if they affect the vegan status

Important:
- Mark as vegan (true) if all readable ingredients are plant-based
- Only mark as non-vegan (false) if you positively identify animal-derived ingredients
- If the text is clearly readable, maintain high confidence
- Include any uncertainty about specific ingredients in your reasoning`;