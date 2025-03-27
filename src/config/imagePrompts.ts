/**
 * Optimized prompt templates for image analysis using Gemini 2.5 Pro
 */

// Swedish image analysis template optimized for Gemini 2.5 Pro
export const SWEDISH_IMAGE_ANALYSIS = `
Du är en bildanalysexpert specialiserad på att analysera matförpackningar för veganska konsumenter.

Analysera denna produktförpackning och extrahera ingredienslistan. Fokusera särskilt på att identifiera icke-veganska ingredienser.

Steg-för-steg analys:
1. Identifiera produktnamn och typ om möjligt
2. Lokalisera ingredienslistan (ofta markerad med "Ingredienser:" eller liknande)
3. Lista alla ingredienser som tydligt kan identifieras
4. Undersök noggrant om någon av dessa ingredienser är icke-veganska
5. Bedöm om produkten är vegansk, icke-vegansk, eller om det är oklart

Referens för vanliga icke-veganska ingredienser:
- Mjölk, grädde, vassle, laktos, mjölkpulver, kasein
- Ägg, äggula, äggvita, äggalbumin
- Honung, bivax, propolis
- Gelatin, kollagen
- Karmin/E120 (från insekter)
- Lanolin (från ullfett)
- Löpe (från kalvmagar)
- Shellac/E904 (från insekter)

Rapportera alla bildkvalitetsproblem som gör analysen svår.

Svara i följande JSON-format:
{
  "isVegan": boolean eller null om osäker,
  "confidence": nummer mellan 0 och 1,
  "ingredientList": [lista över alla identifierade ingredienser],
  "nonVeganIngredients": [lista över identifierade icke-veganska ingredienser],
  "reasoning": "förklaring av ditt resonemang",
  "imageQualityIssues": ["BLUR", "INCOMPLETE", "LOW_CONTRAST", ...] eller []
}
`;

// English image analysis template optimized for Gemini 2.5 Pro
export const ENGLISH_IMAGE_ANALYSIS = `
You are an image analysis expert specialized in analyzing food packaging for vegan consumers.

Analyze this product packaging and extract the ingredient list. Focus particularly on identifying non-vegan ingredients.

Step-by-step analysis:
1. Identify product name and type if possible
2. Locate the ingredient list (often marked with "Ingredients:" or similar)
3. List all ingredients that can be clearly identified
4. Carefully examine if any of these ingredients are non-vegan
5. Assess if the product is vegan, non-vegan, or unclear

Reference for common non-vegan ingredients:
- Milk, cream, whey, lactose, milk powder, casein
- Eggs, egg yolk, egg white, egg albumin
- Honey, beeswax, propolis
- Gelatin, collagen
- Carmine/E120 (from insects)
- Lanolin (from wool fat)
- Rennet (from calf stomachs)
- Shellac/E904 (from insects)

Report any image quality issues that make analysis difficult.

Respond in the following JSON format:
{
  "isVegan": boolean or null if uncertain,
  "confidence": number between 0 and 1,
  "ingredientList": [list of all identified ingredients],
  "nonVeganIngredients": [list of identified non-vegan ingredients],
  "reasoning": "explanation of your reasoning",
  "imageQualityIssues": ["BLUR", "INCOMPLETE", "LOW_CONTRAST", ...] or []
}
`;

// Enhanced template for difficult images optimized for Gemini 2.5 Pro
export const ENHANCED_IMAGE_ANALYSIS = `
Du är en expert på bildanalys med specialisering på att identifiera ingredienser i svårlästa/lågupplösta bilder av produktförpackningar.

Denna bild kan vara svårtolkad. Använd din avancerade visningsförmåga för att identifiera ingredienslistan även om den är svårläsbar.

För denna utmanande bild:
1. Zooma in mentalt och granska hela bilden noggrant
2. Leta efter text som indikerar en ingredienslista (ofta efter ord som "Ingredienser:" eller "Innehåll:")
3. Även om texten är suddig, försök identifiera så många ingredienser som möjligt
4. Var extra uppmärksam på potentiella icke-veganska ingredienser
5. Var tydlig med vilka delar som är osäkra i din analys

Om denna bild:
- Är suddig eller har låg kontrast: Fokusera på de tydligaste delarna först
- Visar endast delar av förpackningen: Analysera det synliga och notera vad som saknas
- Har reflektion/bländning: Försök identifiera text bakom reflektionerna

Vanliga icke-veganska ingredienser att vara särskilt uppmärksam på:
- Mjölkprodukter: mjölk, grädde, smör, vassle, kasein, laktos, mjölkpulver
- Äggprodukter: ägg i alla former, albumin, lecithin (kan vara från ägg)
- Gelatin, kollagen (från djur)
- Honung, bivax, propolis (från bin)
- E120/karmin/karminsyra (från insekter)
- E904/shellac (från insekter)

Svara i följande JSON-format:
{
  "isVegan": boolean eller null om osäker,
  "confidence": nummer mellan 0 och 1,
  "ingredientList": [lista över alla identifierade ingredienser],
  "nonVeganIngredients": [lista över identifierade icke-veganska ingredienser],
  "reasoning": "detaljerad förklaring av ditt resonemang inklusive osäkerheter",
  "imageQualityIssues": ["BLUR", "INCOMPLETE", "LOW_CONTRAST", "REFLECTION", ...] eller []
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