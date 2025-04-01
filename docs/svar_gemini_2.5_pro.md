\*\*Rapport: Förbättra Extraktion av Strukturerad JSON från LLM för Ingrediensanalys\*\*

\*\*Introduktion\*\*  
Denna rapport adresserar utmaningarna med att använda stora språkmodeller (LLM) som Gemini för att extrahera och klassificera ingredienser från livsmedelsetiketter och returnera resultaten i ett strukturerat JSON-format. Målet är att presentera strategier för att öka pålitligheten i JSON-genereringen och noggrannheten i den veganska klassificeringen.

\---

\*\*1. Prompt Engineering för Pålitlig JSON\*\*

Att noggrant utforma prompten är avgörande för att få modellen att konsekvent returnera giltig JSON.

\*   \*\*Specifika Instruktioner:\*\* Var extremt tydlig med vad du förväntar dig.  
    \*   Inled prompten med en tydlig instruktion: "Analysera följande ingredienslista. Extrahera varje ingrediens, klassificera dess veganska status (som 'vegansk', 'icke-vegansk' eller 'osäker'), och returnera resultatet \*\*endast\*\* som ett giltigt JSON-objekt. Inkludera \*\*ingen\*\* förklarande text, kommentarer eller markdown-formatering före eller efter JSON-objektet."  
    \*   Betona: "Svaret måste vara ett JSON-objekt som följer det specificerade schemat nedan och ingenting annat."

\*   \*\*Definiera JSON-schemat i Prompten:\*\* Gör det otvetydigt hur JSON-strukturen ska se ut.  
    \*   Använd en klar beskrivning, exempelvis inom en kod-block i prompten:  
        \`\`\`json  
        // Förväntat JSON-schema:  
        {  
          "product\_status": "string", // ('vegansk', 'icke-vegansk', 'osäker')  
          "overall\_confidence": "float", // (0.0 till 1.0)  
          "ingredients": \[  
            {  
              "name": "string", // Ingrediensens namn  
              "status": "string", // ('vegansk', 'icke-vegansk', 'osäker')  
              "reasoning": "string", // (Kort motivering, särskilt för 'osäker' eller 'icke-vegansk')  
              "confidence": "float" // (0.0 till 1.0 för denna specifika ingrediens)  
            }  
            // ... fler ingredienser  
          \]  
        }  
        \`\`\`  
    \*   Specificera datatyper (string, float, array of objects) tydligt.

\*   \*\*Formateringsexempel (Few-Shot Prompting):\*\* Ge modellen ett eller flera konkreta exempel på en input och den förväntade outputen. Detta hjälper modellen att förstå \*formatet\* bättre än bara instruktioner.

    \`\`\`text  
    Analysera följande ingredienslista och returnera resultatet som ett JSON-objekt enligt det specificerade schemat.

    \*\*Schema:\*\*  
    { ... (schema som ovan) ... }

    \*\*Exempel 1:\*\*  
    Input Text: "Vatten, socker, kakaomassa, mjölkpulver, arom."  
    Output JSON:  
    {  
      "product\_status": "icke-vegansk",  
      "overall\_confidence": 0.95,  
      "ingredients": \[  
        { "name": "Vatten", "status": "vegansk", "reasoning": "Grundläggande ingrediens.", "confidence": 1.0 },  
        { "name": "Socker", "status": "vegansk", "reasoning": "Vanligtvis veganskt, antar standardprocess.", "confidence": 0.9 },  
        { "name": "Kakaomassa", "status": "vegansk", "reasoning": "Ursprung från växt.", "confidence": 1.0 },  
        { "name": "Mjölkpulver", "status": "icke-vegansk", "reasoning": "Animaliskt ursprung (mjölk).", "confidence": 1.0 },  
        { "name": "Arom", "status": "osäker", "reasoning": "Kan vara av animaliskt eller vegetabiliskt ursprung, källa ospecificerad.", "confidence": 0.8 }  
      \]  
    }

    \*\*Exempel 2:\*\*  
    Input Text: "Havregryn, vatten, salt."  
    Output JSON:  
    {  
      "product\_status": "vegansk",  
      "overall\_confidence": 1.0,  
      "ingredients": \[  
        { "name": "Havregryn", "status": "vegansk", "reasoning": "Spannmål.", "confidence": 1.0 },  
        { "name": "Vatten", "status": "vegansk", "reasoning": "Grundläggande ingrediens.", "confidence": 1.0 },  
        { "name": "Salt", "status": "vegansk", "reasoning": "Mineral.", "confidence": 1.0 }  
      \]  
    }

    \*\*Nuvarande Uppgift:\*\*  
    Input Text: "\[Här klistrar du in den OCR-extraherade texten från bilden/videon\]"  
    Output JSON:  
    \`\`\`

\*   \*\*Systemmeddelanden:\*\* Om API:et stöder systemmeddelanden kan du sätta den övergripande instruktionen om att \*alltid\* returnera JSON där.

\---

\*\*2. API Parameterjustering\*\*

Vissa API-parametrar kan påverka utdatans struktur och förutsägbarhet.

\*   \*\*\`response\_mime\_type='application/json'\` (om tillgängligt i Gemini):\*\* Detta är den \*starkaste\* signalen till API:et att du förväntar dig JSON. Om Gemini API erbjuder denna parameter (eller liknande, som \`output\_format\` eller \`response\_format\`), använd den absolut. Detta instruerar API:et att försöka serialisera sitt interna svar till giltig JSON. \*Notera:\* Även med denna parameter kan fel uppstå, men sannolikheten för korrekt JSON ökar markant.  
\*   \*\*\`temperature\`:\*\* Denna parameter styr slumpmässigheten (kreativiteten) i svaret. För strukturerad data som JSON vill du ha förutsägbarhet.  
    \*   \*\*Rekommendation:\*\* Sätt \`temperature\` till ett lågt värde, t.ex. \`0.0\`, \`0.1\` eller \`0.2\`. Detta minskar risken för att modellen "hittar på" oväntad text eller avviker från den instruerade strukturen.  
\*   \*\*\`top\_p\` och \`top\_k\`:\*\* Dessa parametrar begränsar också vilka ord/tokens modellen kan välja från vid varje steg. Med låg \`temperature\` är deras inverkan mindre dramatisk, men:  
    \*   \*\*\`top\_p\`:\*\* Kan sättas till ett lågt värde (t.ex. \< 1.0) för att ytterligare begränsa urvalet, men är oftast mindre nödvändigt för JSON-struktur än låg \`temperature\`.  
    \*   \*\*\`top\_k\`:\*\* Kan sättas till ett litet heltal (t.ex. \`1\` eller \`2\`) för extrem determinism, men detta kan ibland leda till repetitiva eller suboptimala svar om modellen "fastnar".  
    \*   \*\*Rekommendation:\*\* Fokusera på låg \`temperature\` först. Justera \`top\_p\`/\`top\_k\` endast om du fortfarande ser problem med oväntade variationer i \*innehållet\* (inte formatet).

\*\*Sammanfattning Rekommenderade Inställningar:\*\*  
1\.  Använd \`response\_mime\_type='application/json'\` om det finns.  
2\.  Sätt \`temperature\` till \`0.0\` eller \`0.1\`.

\---

\*\*3. Function Calling / Tool Use\*\*

Att använda Geminis inbyggda funktioner för "function calling" (eller "tool use") är sannolikt den \*\*mest robusta metoden\*\* för att få strukturerad data.

\*   \*\*Hur det fungerar:\*\*  
    1\.  Du definierar en "funktion" (eller ett "verktyg") i din API-förfrågan. Denna definition inkluderar ett namn, en beskrivning och framför allt ett schema för de parametrar funktionen förväntar sig (vilket blir ditt JSON-schema).  
    2\.  Du skickar din prompt (t.ex. ingredienslistan) tillsammans med funktionsdefinitionen till LLM:en.  
    3\.  Istället för att generera fritext, förstår LLM:en att den ska "anropa" din definierade funktion och fyller i parametrarna baserat på prompten.  
    4\.  API-svaret innehåller inte nödvändigtvis en direkt JSON-sträng, utan snarare en indikation på att din funktion ska anropas, tillsammans med argumenten (som \*är\* strukturerade enligt ditt schema, ofta redan som ett JSON-objekt eller motsvarande).

\*   \*\*Implementation (Konceptuellt Exempel):\*\*

    Du skulle definiera en funktion, t.ex. \`recordIngredientAnalysis\`:

    \`\`\`json  
    // Funktionsdefinition (skickas med API-anropet)  
    {  
      "name": "recordIngredientAnalysis",  
      "description": "Sparar analysresultaten för en ingredienslista, inklusive vegansk status för varje ingrediens och produkten som helhet.",  
      "parameters": {  
        "type": "object",  
        "properties": {  
          "product\_status": {  
            "type": "string",  
            "description": "Övergripande vegansk status för produkten ('vegansk', 'icke-vegansk', 'osäker')."  
          },  
          "overall\_confidence": {  
            "type": "number",  
            "description": "Konfidensnivå (0.0-1.0) för den övergripande produktstatusen."  
          },  
          "ingredients": {  
            "type": "array",  
            "description": "Lista över analyserade ingredienser.",  
            "items": {  
              "type": "object",  
              "properties": {  
                "name": { "type": "string", "description": "Ingrediensens namn." },  
                "status": { "type": "string", "description": "Vegansk status ('vegansk', 'icke-vegansk', 'osäker')." },  
                "reasoning": { "type": "string", "description": "Kort motivering för klassificeringen." },  
                "confidence": { "type": "number", "description": "Konfidensnivå (0.0-1.0) för ingrediensens status." }  
              },  
              "required": \["name", "status", "reasoning", "confidence"\]  
            }  
          }  
        },  
        "required": \["product\_status", "overall\_confidence", "ingredients"\]  
      }  
    }  
    \`\`\`

    När du sedan skickar prompten med ingredienslistan och denna funktionsdefinition, kommer API-svaret (om modellen anser att funktionen ska anropas) att innehålla något i stil med:

    \`\`\`json  
    // Exempel på API-svar (förenklat)  
    {  
      "functionCall": {  
        "name": "recordIngredientAnalysis",  
        "arguments": { // Detta är din strukturerade data\!  
          "product\_status": "icke-vegansk",  
          "overall\_confidence": 0.95,  
          "ingredients": \[  
            { "name": "Vatten", "status": "vegansk", "reasoning": "...", "confidence": 1.0 },  
            { "name": "Mjölkpulver", "status": "icke-vegansk", "reasoning": "...", "confidence": 1.0 },  
            { "name": "Arom", "status": "osäker", "reasoning": "...", "confidence": 0.8 }  
          \]  
        }  
      }  
    }  
    \`\`\`  
    Du extraherar sedan \`arguments\`-objektet, som garanterat (eller med mycket hög sannolikhet) följer schemat du definierade.

\*   \*\*Fördelar:\*\* Mycket högre pålitlighet för strukturerad output, tydligare separation mellan instruktion och dataformat, mindre känsligt för prompt-variationer.

\---

\*\*4. Förbättra Klassificeringsnoggrannhet\*\*

Felklassificeringar ("Arom" som vegansk) kräver specifik vägledning.

\*   \*\*Prompt Engineering för Noggrannhet:\*\*  
    \*   \*\*Ge Specifika Regler:\*\* Instruera modellen om kända fallgropar. Exempel: "Ingrediensen 'Arom' ska klassificeras som 'osäker' om inte ytterligare information ges (t.ex. 'vegetabilisk arom'). Ingredienser som 'E120', 'karmin', 'shellack', 'mjölksyra' (om ej specificerat vegetabilisk källa), 'kasein' ska klassificeras som 'icke-vegansk'. 'Lecitin' är 'osäker' om inte 'sojalecitin' eller 'solroslecitin' anges."  
    \*   \*\*Begär Motivering:\*\* Som i JSON-schemat ovan, inkludera ett \`reasoning\`-fält. Att tvinga modellen att motivera sitt val kan förbättra noggrannheten och underlättar felsökning. "Motivera kort varför varje ingrediens fick sin status, särskilt för 'icke-vegansk' och 'osäker'."

\*   \*\*Inkludera Interna Databaser i Prompten:\*\*  
    \*   \*\*Metod:\*\* Inkludera listor över kända icke-veganska och osäkra ingredienser direkt i promptens kontext.  
        \`\`\`text  
        Här är listor för att hjälpa till med klassificeringen:  
        Kända Icke-Veganska Ingredienser: \[lista med ingredienser som mjölkpulver, ägg, honung, E120, gelatin, ...\]  
        Kända Osäkra Ingredienser (kräver specifikation): \[lista med ingredienser som arom, mono- och diglycerider av fettsyror, mjölksyra, vitamin D, ...\]

        Analysera nu följande ingredienslista baserat på dessa listor och allmän kunskap...  
        \`\`\`  
    \*   \*\*Fördelar:\*\* Ger modellen direkt tillgång till er specifika domänkunskap, kan avsevärt minska fel för de listade ingredienserna.  
    \*   \*\*Nackdelar:\*\*  
        \*   \*\*Token-gränser:\*\* Prompter har en maximal längd (kontextfönster). Långa listor kan överskrida gränsen eller göra prompten dyr.  
        \*   \*\*Kostnad:\*\* Längre prompter kostar mer per anrop.  
        \*   \*\*Underhåll:\*\* Listorna i prompten måste hållas uppdaterade.  
        \*   \*\*Generalisering:\*\* Modellen kanske förlitar sig för mycket på listan och presterar sämre på ingredienser som \*inte\* finns med.  
    \*   \*\*Balans:\*\* Överväg att inkludera de \*vanligaste\* eller mest \*problematiska\* ingredienserna snarare än en heltäckande databas.

\---

\*\*5. Alternativa Arbetsflödesdesigner\*\*

Att dela upp uppgiften i flera steg kan öka robustheten.

\*   \*\*Flerstegsmetod:\*\*  
    1\.  \*\*Steg 1: OCR / Textextraktion:\*\* Använd LLM:en (eller ett dedikerat OCR-verktyg/modell) med en mycket enkel prompt fokuserad \*enbart\* på att extrahera den råa texten från ingredienslistan så korrekt som möjligt.  
        \*   \*Prompt:\* "Extrahera endast texten från ingredienslistan i följande bild/text. Inkludera inga tolkningar eller formatering."  
    2\.  \*\*Steg 2: Klassificering och JSON-formatering:\*\*  
        \*   \*\*Alternativ A (Separat LLM-anrop):\*\* Mata den extraherade texten till ett \*andra\* LLM-anrop. Denna prompt fokuserar helt på klassificering och JSON-generering, och kan inkludera de interna listorna (punkt 4\) och använda Function Calling (punkt 3\) eller strikta JSON-instruktioner (punkt 1).  
        \*   \*\*Alternativ B (Regelbaserad Logik \+ Intern Databas):\*\* Parsa den extraherade texten med kod (t.ex. dela upp vid kommatecken, rensa). Slå upp varje ingrediens i er interna databas. Använd regelbaserad logik för kända mönster. \*Endast\* om en ingrediens är okänd eller tvetydig enligt databasen/reglerna, kan ni eventuellt skicka \*just den\* ingrediensen (eller en liten grupp) till en LLM för en begränsad bedömning. Konstruera sedan JSON-objektet baserat på resultaten från databasen/reglerna/LLM:en.

\*   \*\*Fördelar med Flerstegsmetoden:\*\*  
    \*   \*\*Ökad Pålitlighet:\*\* Varje steg är enklare och har ett mer begränsat mål, vilket minskar risken för fel.  
    \*   \*\*Bättre Felsökning:\*\* Lättare att identifiera var i kedjan ett fel uppstår (är det OCR:en eller klassificeringen?).  
    \*   \*\*Flexibilitet:\*\* Möjlighet att använda det bästa verktyget för varje jobb (t.ex. en specialiserad OCR-modell, er interna databas, en LLM).  
    \*   \*\*Potentiell Kostnadsbesparing:\*\* Steg 2 (Alternativ B) kan vara betydligt billigare om de flesta ingredienser kan hanteras av databasen/reglerna.

\*   \*\*Nackdelar:\*\*  
    \*   \*\*Ökad Latens:\*\* Flera API-anrop eller processteg tar längre tid.  
    \*   \*\*Mer Komplex Infrastruktur:\*\* Kräver mer kod för att hantera flödet mellan stegen.

\---

\*\*6. Robust Felhantering på Klientsidan\*\*

Oavsett metod måste er kod vara beredd på att LLM-svaret inte är perfekt.

\*   \*\*JSON-Parsing:\*\*  
    \*   Använd alltid en standard JSON-parser (t.ex. \`json.loads()\` i Python) inom ett \`try...except\`-block för att fånga \`JSONDecodeError\` eller motsvarande.  
\*   \*\*Hantering av Ogiltig JSON:\*\*  
    \*   \*\*Primär Lösning:\*\* Om \`response\_mime\_type\` eller Function Calling används, bör detta vara sällsynt. Om det ändå inträffar, logga felet och rå-svaret för analys.  
    \*   \*\*Sekundär Lösning (Rensning):\*\* Om du inte använder \`response\_mime\_type\`/Function Calling och får text blandat med JSON: Försök att extrahera JSON-delen. Du kan använda heuristik (hitta första \`{\` och sista \`}\`) eller regex, men var medveten om att detta är bräckligt. Logga när denna fallback används. \*Exempel (Python-liknande):\*  
        \`\`\`python  
        raw\_response \= llm\_api\_call(...)  
        try:  
            \# Försök parsa direkt  
            data \= json.loads(raw\_response)  
        except json.JSONDecodeError:  
            try:  
                \# Försök hitta JSON-blocket med regex (förenklat exempel)  
                match \= re.search(r'\\{.\*\\}', raw\_response, re.DOTALL)  
                if match:  
                    potential\_json \= match.group(0)  
                    data \= json.loads(potential\_json)  
                else:  
                    raise ValueError("Kunde inte hitta eller parsa JSON i svaret.") \# Hantera felet  
            except json.JSONDecodeError:  
                raise ValueError("Extraherad text var inte giltig JSON.") \# Hantera felet  
            except Exception as e:  
                 \# Annat fel, logga och hantera  
                 log\_error("Kunde inte parsa LLM svar", raw\_response)  
                 data \= None \# Eller annan felhantering  
        \`\`\`  
\*   \*\*Schema-Validering:\*\* Även om svaret är \*giltig\* JSON, kanske det inte följer ert \*förväntade schema\*. Använd ett JSON Schema-valideringsbibliotek (t.ex. \`jsonschema\` i Python) för att verifiera att alla nödvändiga fält finns, har rätt typ, etc. \*efter\* att du lyckats parsa JSON.  
\*   \*\*Återförsök (Retries):\*\* Implementera en strategi för återförsök med exponentiell backoff vid API-fel (t.ex. timeouts, rate limits) och potentiellt även vid valideringsfel (kanske med en lätt justerad prompt om det verkar vara ett prompt-relaterat problem).  
\*   \*\*Loggning och Övervakning:\*\* Logga alla API-anrop, svar (särskilt felaktiga), parsningsförsök och valideringsresultat. Detta är avgörande för att förstå felmönster och iterativt förbättra processen.

\---

\*\*Slutsats och Rekommendationer\*\*

För att uppnå högsta möjliga pålitlighet och noggrannhet rekommenderas följande strategi:

1\.  \*\*Prioritera Function Calling / Tool Use:\*\* Detta är den mest robusta metoden för att få korrekt formaterad JSON från Gemini API. Definiera ditt schema noggrant i funktionsparametrarna.  
2\.  \*\*Om Function Calling inte är möjligt/lämpligt:\*\* Använd \`response\_mime\_type='application/json'\` och sätt \`temperature\` till ett mycket lågt värde (t.ex. 0.1). Kombinera detta med mycket tydliga instruktioner och few-shot exempel i prompten som definierar JSON-schemat.  
3\.  \*\*Överväg en Flerstegsmetod:\*\* Separera OCR från klassificering/JSON-generering. Detta ökar robustheten avsevärt. Använd er interna databas för klassificering där det är möjligt (Steg 2, Alternativ B) för bästa noggrannhet och kostnadseffektivitet.  
4\.  \*\*Förbättra Klassificering:\*\* Inkludera nyckeldelar av er interna databas (vanliga/problematiska icke-veganska/osäkra ingredienser) i prompten för klassificeringssteget, och instruera modellen att motivera sina val.  
5\.  \*\*Implementera Robust Felhantering:\*\* Förvänta er fel. Använd \`try-except\` för JSON-parsing, validera mot ert schema, och ha en fallback (om än bräcklig som regex) endast som sista utväg. Logga allt.

Genom att kombinera dessa tekniker, särskilt Function Calling eller en flerstegsmetod med databasintegration, bör ni kunna bygga en betydligt mer pålitlig pipeline för er ingrediensanalys.  
