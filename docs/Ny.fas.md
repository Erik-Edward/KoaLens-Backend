# KoaLens Videoanalys: Identifierade Problem och Rekommenderade Lösningar

Detta dokument sammanfattar de identifierade problemen och rekommenderade lösningarna för KoaLens videoanalys-funktion. Analysen baseras på granskning av backend-kod och loggutdata, samt testresultat från olika produktanalyser.

## 1. Felaktig Klassificering av Veganska Ingredienser

### Problem
Videoanalysfunktionen felklassificerar ibland veganska ingredienser som icke-veganska. Ett specifikt exempel är "sojabönspasta", som felaktigt markerades som icke-vegansk trots att det är en helt växtbaserad produkt.

### Orsaker
- Gemini AI gör ibland felaktiga bedömningar om veganska egenskaper
- Det saknas en validering eller korrigeringssteg för kända veganska/icke-veganska ingredienser
- AI-modellen kanske inte har tillräcklig träning för att känna igen vissa kulturspecifika ingredienser

### Lösning
1. **Förbättra AI-instruktioner:**
   - Uppdatera prompten med tydligare riktlinjer för att identifiera veganska ingredienser
   - Inkludera specifika instruktioner kring sojabaserade och andra växtbaserade produkter

2. **Implementera whitelist/blacklist:**
   ```typescript
   const knownVeganIngredients = ['sojabönor', 'sojaböna', 'sojabönspasta', 'tofu', ...];
   const knownNonVeganIngredients = ['grädde', 'mjölk', 'ägg', 'kött', ...];
   
   // Verifiera AI-resultatet mot kända listor
   result.ingredients.forEach(ingredient => {
     // Korrigera felklassificerade kända veganska ingredienser
     if (knownVeganIngredients.some(veganIng => 
           ingredient.name.toLowerCase().includes(veganIng.toLowerCase()))) {
       ingredient.isVegan = true;
     }
     
     // Säkerställ att kända icke-veganska ingredienser är korrekt märkta
     if (knownNonVeganIngredients.some(nonVeganIng => 
           ingredient.name.toLowerCase().includes(nonVeganIng.toLowerCase()))) {
       ingredient.isVegan = false;
     }
   });
   ```

3. **Självlärande system:**
   - Implementera feedback-mekanismer där användare kan rapportera felklassificerade ingredienser
   - Använd denna data för att kontinuerligt förbättra whitelists/blacklists

## 2. Problem med Upprepade Loggar och API-anrop

### Problem
Loggar visar att samma video skickas för analys flera gånger i snabb följd, vilket leder till onödiga API-anrop och ökade kostnader.

### Orsaker
- Brist på låsmekanism i frontend för att förhindra multipla anrop
- Navigeringsfel som leder till automatiska omförsök utan tillräcklig fördröjning
- Reaktiv state-hantering som kan utlösa flera API-anrop under samma användarinteraktion

### Lösning
1. **Implementera låsmekanism i frontend:**
   ```typescript
   // I VideoScreen-komponenten
   const [isSubmitting, setIsSubmitting] = useState(false);
   const requestIdRef = useRef<string | null>(null);
   
   const handleVideoSubmit = async (uri: string) => {
     // Förhindra parallella anrop för samma video
     if (isSubmitting) {
       console.log('En analys pågår redan, avbryter duplikat-anrop');
       return;
     }
     
     // Sätt sessionsunik identifierare
     requestIdRef.current = uuidv4();
     const requestId = requestIdRef.current;
     
     try {
       setIsSubmitting(true);
       setIsLoading(true);
       
       // Anropa API med request ID
       const response = await axios.post(`${API_BASE_URL}/api/video/analyze-video`, {
         base64Data: videoBase64,
         mimeType: 'video/mp4',
         requestId, // Skicka med unik ID för detta anrop
         preferredLanguage: 'sv'
       });
       
       // Resten av hanteringen...
     } finally {
       setIsSubmitting(false);
       setIsLoading(false);
     }
   };
   ```

2. **Backend request-deduplicering:**
   ```typescript
   // I videoAnalysis.ts, i router.post-hanteraren
   const recentRequests = new Map();  // RequestID -> timestamp
   const DEDUPE_WINDOW_MS = 5000;     // 5 sekunder deduplicering
   
   // Kontrollera om det är ett duplikat-anrop
   const requestId = req.body.requestId || 'unknown';
   const now = Date.now();
   
   if (recentRequests.has(requestId) && 
       now - recentRequests.get(requestId) < DEDUPE_WINDOW_MS) {
     logger.warn('Detected duplicate request within dedupe window', { requestId });
     res.status(429).json({
       success: false,
       error: 'Duplicate request, analysis already in progress'
     });
     return;
   }
   
   // Spara request ID med tidstämpel
   recentRequests.set(requestId, now);
   
   // Rensa gamla entries periodvis
   if (recentRequests.size > 100) {
     // Rensa entries äldre än DEDUPE_WINDOW_MS
     for (const [id, timestamp] of recentRequests.entries()) {
       if (now - timestamp > DEDUPE_WINDOW_MS) {
         recentRequests.delete(id);
       }
     }
   }
   ```

3. **Förbättrad navigeringshantering:**
   - Uppdatera navigeringslogiken för att använda setTimeout med tillräcklig fördröjning
   - Använd en tydlig flagga för att indikera pågående navigering

## 3. Problemet med Flerspråkiga Ingredienslistor

### Problem
När produktförpackningar innehåller ingredienslistor på flera språk identifierar AI samma ingredienser flera gånger på olika språk, vilket resulterar i:
- Upprepad information i resultatvyn
- Samma produkt bedöms flera gånger (en gång per språk)
- Användaren får en förvirrande blandning av språk i resultatet trots att appen främst är riktad till svenska användare

### Lösning
1. **Förbättrade AI-instruktioner:**
   - Uppdatera prompten för att specifikt hantera flerspråkiga förpackningar:
   ```
   Du kommer att se ingredienser på flera språk. Identifiera det primära språket på förpackningen. 
   Identifiera alla ingredienser, men returnera endast EN lista utan dubbletter. 
   Om samma ingrediens förekommer på flera språk (t.ex. 'salt', 'salt', 'Salz', 'sel'), 
   inkludera endast den svenska versionen (exempel: 'salt') i listan. 
   Ditt svar MÅSTE vara på svenska oavsett vilket språk som används på förpackningen.
   ```

2. **Post-processning med språkgruppering:**
   ```typescript
   // Gruppera ingredienser efter språk genom enkel språkdetektering
   function detectLanguage(ingredientName) {
     // Förenklade språkregler (kan utökas eller ersättas med bibliotek)
     if (/ä|ö|å/i.test(ingredientName)) return 'sv';
     if (/zout|olie|suiker|tarwe/i.test(ingredientName)) return 'nl';
     if (/sel|sucre|farine/i.test(ingredientName)) return 'fr';
     if (/salz|zucker|mehl/i.test(ingredientName)) return 'de';
     if (/sale|zucchero|farina/i.test(ingredientName)) return 'it';
     if (/sal|azucar|harina/i.test(ingredientName)) return 'es';
     return 'other';
   }
   
   // Skapa översättningsreferens för vanliga ingredienser
   const commonTranslations = {
     // Svenska: [nederländska, franska, tyska, italienska, spanska, engelska]
     'vetemjöl': ['tarwebloem', 'farine de blé', 'weizenmehl', 'farina di frumento', 'harina de trigo', 'wheat flour'],
     'socker': ['suiker', 'sucre', 'zucker', 'zucchero', 'azúcar', 'sugar'],
     'salt': ['zout', 'sel', 'salz', 'sale', 'sal', 'salt'],
     // ...fler översättningar
   };
   
   // Försök översätta främmande ingredienser till svenska
   function translateToSwedish(ingredient) {
     const lowerName = ingredient.name.toLowerCase();
     
     // Sök igenom översättningstabellen
     for (const [swedish, foreignVersions] of Object.entries(commonTranslations)) {
       if (foreignVersions.some(foreign => lowerName.includes(foreign.toLowerCase()))) {
         return {
           ...ingredient,
           name: swedish,
           originalName: ingredient.name  // behåll originalet
         };
       }
     }
     
     return ingredient; // Ingen översättning hittad
   }
   
   // Process för att hantera alla ingredienser
   const processedIngredients = [];
   const seenIngredients = new Set();
   
   // Översätt och deduplicera ingredienser
   for (const ingredient of result.ingredients) {
     const translated = translateToSwedish(ingredient);
     
     // Undvik dubbletter baserat på det svenska namnet
     if (!seenIngredients.has(translated.name.toLowerCase())) {
       seenIngredients.add(translated.name.toLowerCase());
       processedIngredients.push(translated);
     }
   }
   ```

3. **Integration med översättningstjänst:**
   - Använd Google Translate API eller DeepL för mer precisa översättningar
   - Implementeras i backend för att översätta alla non-svenska ingredienser

## Sammanfattning av Rekommendationer

De viktigaste åtgärderna för att förbättra videoanalysfunktionen:

1. **För vegansk klassificering:**
   - Utöka prompten med tydligare riktlinjer för att identifiera veganska ingredienser
   - Implementera en whitelist/blacklist för validering av kända ingredienser
   - Utveckla ett självlärande system baserat på användarfeedback

2. **För att minska onödiga API-anrop:**
   - Implementera låsmekanism i frontend för att förhindra parallella anrop
   - Inkludera unika request IDs för deduplicering i backend
   - Förbättra navigeringshanteringen för att undvika multipla omförsök

3. **För flerspråkiga ingredienslistor:**
   - Uppdatera AI-instruktionerna för att prioritera svensk output
   - Implementera språkbaserad gruppering och deduplicering
   - Integrera översättningsfunktionalitet för icke-svenska ingredienser

Genom att implementera dessa förbättringar kommer KoaLens videoanalysfunktion att bli mer precis, kostnadseffektiv och användarvänlig.
