// src/config/prompts.ts

// REMOVED OLD IMAGE PROMPTS
/*
export const ANALYSIS_PROMPT = `...`;

export const CROPPED_IMAGE_PROMPT = `...`;
*/

// Add new enhanced text analysis prompt templates
export const TEXT_ANALYSIS_PROMPTS = {
  // Swedish template with enhanced structure and examples
  sv: `Du är en expertanalytiker för veganska produkter. Analysera följande ingredienslista och bedöm med precision om produkten är vegansk eller inte.

INGREDIENSER ATT ANALYSERA: {{ingredients}}

REFERENSGUIDE:
- ICKE-VEGANSKA INGREDIENSER inkluderar: mjölk, ost, smör, grädde, vassle, yoghurt, ägg, gelatin, honung, löpe, kasein, laktos, bivax, lanolin, och karmin (E120).
- OSÄKRA INGREDIENSER som kan vara både animaliska eller vegetabiliska inkluderar: E471, lecitin (kan vara från ägg eller soja), naturlig arom, glycerin, och vissa vitaminer (särskilt D3).
- VEGANSKA INGREDIENSER inkluderar alla grönsaker, frukter, nötter, frön, baljväxter, och vegetabiliska oljor och fetter.

Var särskilt vaksam på:
1. E-nummer som kan vara animaliska (E120, E441, E542, E901, E904, E920)
2. Sammansatta ingredienser som "mjölkfett" eller "äggpulver"
3. Processade ingredienser som kan dölja animaliskt ursprung
4. Synonymer för animaliska produkter (t.ex. kasein = mjölkprotein)

SVARSFORMAT:
Svara uteslutande i följande JSON-format utan inledande eller avslutande text:
{
  "isVegan": boolean eller null (om osäker),
  "confidence": nummer mellan 0.0 och 1.0,
  "ingredientList": ["ingrediens1", "ingrediens2", ...],
  "nonVeganIngredients": ["icke-vegansk ingrediens1", ...],
  "reasoning": "Detaljerat resonemang med analys av kritiska ingredienser"
}
`,

  // English template with enhanced structure and examples
  en: `You are an expert vegan product analyst. Analyze the following ingredient list and precisely determine if the product is vegan or not.

INGREDIENTS TO ANALYZE: {{ingredients}}

REFERENCE GUIDE:
- NON-VEGAN INGREDIENTS include: milk, cheese, butter, cream, whey, yogurt, eggs, gelatin, honey, rennet, casein, lactose, beeswax, lanolin, and carmine (E120).
- UNCERTAIN INGREDIENTS that can be either animal or plant-based include: E471, lecithin (can be from eggs or soy), natural flavor, glycerin, and certain vitamins (especially D3).
- VEGAN INGREDIENTS include all vegetables, fruits, nuts, seeds, legumes, and vegetable oils and fats.

Be particularly vigilant about:
1. E-numbers that may be animal-derived (E120, E441, E542, E901, E904, E920)
2. Compound ingredients like "milk fat" or "egg powder"
3. Processed ingredients that might hide animal origin
4. Synonyms for animal products (e.g., casein = milk protein)

RESPONSE FORMAT:
Reply exclusively in the following JSON format without any introductory or concluding text:
{
  "isVegan": boolean or null (if uncertain),
  "confidence": number between 0.0 and 1.0,
  "ingredientList": ["ingredient1", "ingredient2", ...],
  "nonVeganIngredients": ["non-vegan ingredient1", ...],
  "reasoning": "Detailed reasoning with analysis of critical ingredients"
}
`,

  // Unstructured text analysis template
  unstructured: `Du är en expertanalytiker för veganska produkter. Analysera följande text och identifiera eventuella ingredienslistor. Bedöm sedan om produkten är vegansk eller inte.

TEXT ATT ANALYSERA: {{text}}

INSTRUKTIONER:
1. Identifiera ingredienslistan i texten, även om den är inbäddad i annat innehåll.
2. Bestäm om produkten är vegansk baserat på ingredienserna.
3. Var uppmärksam på textsektioner som börjar med "Ingredienser:", "Innehåll:", eller liknande.

REFERENSGUIDE:
- ICKE-VEGANSKA INGREDIENSER inkluderar: mjölk, ost, smör, grädde, vassle, yoghurt, ägg, gelatin, honung, löpe, kasein, laktos, bivax, lanolin, och karmin (E120).
- OSÄKRA INGREDIENSER som kan vara både animaliska eller vegetabiliska inkluderar: E471, lecitin, naturlig arom, glycerin, och vissa vitaminer (särskilt D3).

SVARSFORMAT:
Svara uteslutande i följande JSON-format utan inledande eller avslutande text:
{
  "isVegan": boolean eller null (om osäker),
  "confidence": nummer mellan 0.0 och 1.0,
  "ingredientList": ["ingrediens1", "ingrediens2", ...],
  "nonVeganIngredients": ["icke-vegansk ingrediens1", ...],
  "reasoning": "Detaljerat resonemang med analys av kritiska ingredienser",
  "extractedFrom": "Den del av texten där ingredienslistan hittades"
}
`
};

// Add new template loader function
export function loadTextAnalysisPrompts(manager: any): void {
  // Load text analysis templates for different languages and formats
  manager.addTemplate('ingredientsAnalysis_sv', TEXT_ANALYSIS_PROMPTS.sv);
  manager.addTemplate('ingredientsAnalysis_en', TEXT_ANALYSIS_PROMPTS.en);
  manager.addTemplate('ingredientsAnalysis_unstructured', TEXT_ANALYSIS_PROMPTS.unstructured);
  
  // Update the default template with the enhanced Swedish version
  manager.addTemplate('ingredientsAnalysis', TEXT_ANALYSIS_PROMPTS.sv);
}