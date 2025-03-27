/**
 * Specialized prompt templates for image analysis using Gemini 2.5 Pro
 */

// Swedish image analysis template
export const SWEDISH_IMAGE_ANALYSIS = `
Analysera denna bild av en produktförpackning och identifiera ingredienslistan.

Steg 1: Hitta och läs ingredienslistan på förpackningen.
Steg 2: Lista alla ingredienser som identifieras.
Steg 3: Identifiera eventuella icke-veganska ingredienser (som mjölk, ägg, honung, gelatin).
Steg 4: Bedöm om produkten är vegansk baserat på ingredienserna.

OBSERVERA: Var extra noga med att läsa all text på förpackningen. Ingredienser kan finnas i små teckensnitt eller i olika sektioner. Om bilden är oklar, rapportera det.

Referens för icke-veganska ingredienser:
- Mjölk och mjölkderivat (vassle, kasein, laktos)
- Ägg och äggderivat
- Honung och propolis
- Gelatin (från djurhudar och ben)
- Lanolin (från ullfett)
- Karmin/Karminrött/E120 (från insekter)
- Löpe (från kalvmagar)
- Shellac (E904, från insekter)

Svara i följande JSON-format:
{
  "isVegan": boolean eller null om osäker,
  "confidence": nummer mellan 0 och 1 som representerar säkerheten,
  "ingredientList": [lista över alla identifierade ingredienser],
  "nonVeganIngredients": [lista över identifierade icke-veganska ingredienser],
  "reasoning": "förklaring av ditt resonemang",
  "imageQualityIssues": ["BLUR", "INCOMPLETE", ...] eller [] om inga problem
}
`;

// English image analysis template
export const ENGLISH_IMAGE_ANALYSIS = `
Analyze this image of a product packaging and identify the ingredient list.

Step 1: Find and read the ingredient list on the packaging.
Step 2: List all ingredients identified.
Step 3: Identify any non-vegan ingredients (such as milk, eggs, honey, gelatin).
Step 4: Assess whether the product is vegan based on the ingredients.

NOTE: Be especially careful to read all text on the packaging. Ingredients may be in small fonts or in different sections. If the image is unclear, report this.

Reference for non-vegan ingredients:
- Milk and milk derivatives (whey, casein, lactose)
- Eggs and egg derivatives
- Honey and propolis
- Gelatin (from animal skins and bones)
- Lanolin (from wool fat)
- Carmine/E120 (from insects)
- Rennet (from calf stomachs)
- Shellac (E904, from insects)

Respond in the following JSON format:
{
  "isVegan": boolean or null if uncertain,
  "confidence": number between 0 and 1 representing certainty,
  "ingredientList": [list of all identified ingredients],
  "nonVeganIngredients": [list of identified non-vegan ingredients],
  "reasoning": "explanation of your reasoning",
  "imageQualityIssues": ["BLUR", "INCOMPLETE", ...] or [] if no issues
}
`;

// Enhanced template for difficult images
export const ENHANCED_IMAGE_ANALYSIS = `
Analysera mycket noga denna bild av en produktetikett.

Denna bild kan ha ingredienserna i mycket svårläst text, med låg kontrast, eller delvis dold. Använd alla visuella ledtrådar för att identifiera ingredienslistan. Leta efter text efter "Ingredienser:", "Innehåll:", eller liknande markörer.

Steg 1: Skanna hela bilden efter ingredienslistan, även om den är liten, delvis synlig, eller av dålig kvalitet.
Steg 2: Lista alla ingredienser som kan identifieras, även om du bara är delvis säker.
Steg 3: Identifiera specifikt icke-veganska ingredienser och bedöm om produkten är vegansk.
Steg 4: Rapportera tydligt om bildkvalitetsproblem som otydlighet, dålig belysning, eller ofullständighet.

Var extra uppmärksam på vanliga animaliska ingredienser som:
- Mjölk, grädde, smör, vassle, kasein, mjölkprotein
- Äggvita, äggulor, ägg
- Honung
- Gelatin
- Laktos (från mjölk)
- Animaliska fetter
- E120 (karmin, från insekter)
- Löpe, vassleprotein
- E904 (shellac, från insekter)

Svara i följande JSON-format:
{
  "isVegan": boolean eller null om osäker,
  "confidence": nummer mellan 0 och 1 som representerar säkerheten,
  "ingredientList": [lista över alla identifierade ingredienser],
  "nonVeganIngredients": [lista över identifierade icke-veganska ingredienser],
  "reasoning": "förklaring av ditt resonemang, inkludera detaljer om eventuella svårigheter att läsa texten",
  "imageQualityIssues": ["BLUR", "INCOMPLETE", "POOR_LIGHTING", "LOW_RESOLUTION", etc] eller [] om inga problem
}
`;

/**
 * Add the image analysis templates to the prompt manager
 */
export function loadImagePromptTemplates(manager: any): void {
  manager.addTemplate('imageAnalysis_sv', SWEDISH_IMAGE_ANALYSIS);
  manager.addTemplate('imageAnalysis_en', ENGLISH_IMAGE_ANALYSIS);
  manager.addTemplate('imageAnalysis_enhanced', ENHANCED_IMAGE_ANALYSIS);
  
  // Set the default template to Swedish
  manager.addTemplate('imageAnalysis', SWEDISH_IMAGE_ANALYSIS);
} 