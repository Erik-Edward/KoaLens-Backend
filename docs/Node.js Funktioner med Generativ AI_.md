# **Implementering av Function Calling med Googles Node.js SDK @google/generative-ai**

**1\. Introduktion till Function Calling med @google/generative-ai i Node.js**

Function Calling, även känt som Tool Use, är en avancerad funktion hos stora språkmodeller (LLMs) som utökar deras förmåga bortom enbart textgenerering.1 Genom Function Calling kan LLMs generera strukturerade anrop till externa system och data, vilket möjliggör interaktion med verkligheten. Syftet är att ge modellen möjlighet att utföra åtgärder, hämta aktuell information och automatisera komplexa uppgifter, vilket resulterar i mer dynamiska och interaktiva applikationer.1 Denna förmåga att orkestrera handlingar i den verkliga världen representerar ett betydande steg mot mer praktiskt användbara AI-applikationer \[Insight 1\]. LLMs är i grunden begränsade av den information de tränats på. Function Calling erbjuder en mekanism för att kringgå denna begränsning genom att låta modellen begära specifik information eller utföra specifika funktioner från externa källor, vilket skapar en närmare integration mellan modellens resonemang och konkreta handlingar.

För utvecklare som arbetar med Node.js och Googles generativa AI-modeller, som Gemini, är SDK:n @google/generative-ai det officiella verktyget för att implementera Function Calling.4 Att använda den officiella SDK:n ger flera fördelar, inklusive tillgång till de senaste funktionerna, officiell support och överensstämmelse med Googles rekommenderade metoder.4 Det är viktigt att notera att det finns andra SDK:er, såsom @google/genai 4) och Vertex AI SDK 1), men fokus i denna rapport ligger specifikt på @google/generative-ai \[Insight 2\]. Existensen av flera SDK:er från Google Cloud kan initialt skapa förvirring. Därför är det viktigt att understryka att @google/generative-ai-SDK:n är särskilt utformad för Gemini API:et, vilket tydliggör dess specifika användningsområde och hjälper utvecklare att välja rätt verktyg.

**2\. Konfigurera Utvecklingsmiljön**

Innan man kan börja implementera Function Calling med @google/generative-ai-SDK:n är det nödvändigt att konfigurera utvecklingsmiljön korrekt.

Först måste SDK:n installeras i projektet. Detta görs enkelt med npm genom att köra följande kommando i projektets rotkatalog 4:

Bash

npm install @google/generative-ai

När installationen är klar kan SDK:n importeras och klienten initieras. Detta görs genom att lägga till följande kod i din Node.js-fil 3:

JavaScript

import { GoogleGenerativeAI } from '@google/generative-ai';

const genAI \= new GoogleGenerativeAI(process.env.API\_KEY);

För att kunna initiera klienten krävs en API-nyckel. Denna nyckel kan skapas via Google AI Studio.4 Det är av yttersta vikt att hantera API-nyckeln på ett säkert sätt. En rekommenderad metod är att lagra den som en miljövariabel 3) snarare än att hårdkoda den direkt i koden \[Insight 3\]. Att använda miljövariabler är en etablerad säkerhetsstandard som förhindrar oavsiktlig exponering av känslig information.

Slutligen behöver man välja vilken generativ AI-modell som ska användas. Detta görs genom att anropa metoden getGenerativeModel på genAI-objektet och ange modellens namn. Exempelvis för att använda Gemini Pro eller Gemini 2.0 Flash 1:

JavaScript

const model \= genAI.getGenerativeModel({ model: 'gemini-pro' });  
// eller  
const model \= genAI.getGenerativeModel({ model: 'gemini-2.0-flash' });

Det är viktigt att vara medveten om att olika modeller har varierande kapacitet och prissättning, vilket bör beaktas vid valet av modell.

**3\. Definiera Funktionsdeklarationer**

För att använda Function Calling måste man definiera de funktioner som modellen ska kunna anropa. Detta görs genom att skapa en array av objekt som beskriver varje funktion. Denna array kallas vanligtvis functionDeclarations och är en del av tools-parametern i konfigurationen som skickas till modellen.2

Varje objekt i functionDeclarations-arrayen måste innehålla minst tre egenskaper: name, description och parameters. name är ett unikt namn för funktionen, description är en mänskligt läsbar förklaring av vad funktionen gör (vilket hjälper modellen att avgöra när den ska användas), och parameters definierar de indata som funktionen förväntar sig.3

Enligt användarens specifika önskemål ska datatyperna i parameters-objektet definieras med strängliteraler. Här följer exempel på hur man definierar olika typer av parametrar:

* **Exempel 1: Strängparameter:**  
  JavaScript  
  const getCurrentWeatherDeclaration \= {  
    name: 'get\_current\_weather',  
    description: 'Hämta aktuellt väder på en given plats',  
    parameters: {  
      type: 'object',  
      properties: {  
        location: { type: 'string', description: 'Staden och staten, t.ex. San Francisco, CA' },  
        unit: { type: 'string', enum: \['celsius', 'fahrenheit'\], description: 'Enheten som ska användas för temperatur' },  
      },  
      required: \['location'\],  
    },  
  };

  Detta exempel, inspirerat av 2, visar hur man definierar en funktion för att hämta väderinformation med en obligatorisk strängparameter för plats och en valfri strängparameter för enhet.  
* **Exempel 2: Nummerparameter:**  
  JavaScript  
  const setAlarmDeclaration \= {  
    name: 'set\_alarm',  
    description: 'Ställ in ett alarm för en specifik tid',  
    parameters: {  
      type: 'object',  
      properties: {  
        hour: { type: 'number', description: 'Timmen för alarmet (0-23)' },  
        minute: { type: 'number', description: 'Minuten för alarmet (0-59)' },  
      },  
      required: \['hour', 'minute'\],  
    },  
  };

  Här definieras en funktion för att ställa in ett alarm med obligatoriska nummerparametrar för timme och minut.  
* **Exempel 3: Boolesk parameter:**  
  JavaScript  
  const toggleLightDeclaration \= {  
    name: 'toggle\_light',  
    description: 'Slå på eller stäng av ljuset',  
    parameters: {  
      type: 'object',  
      properties: {  
        on: { type: 'boolean', description: 'Om ljuset ska slås på (true) eller av (false)' },  
      },  
      required: \['on'\],  
    },  
  };

  Detta exempel visar en funktion för att styra en lampa med en boolesk parameter som anger om den ska vara på eller av.  
* **Exempel 4: Objektparameter:**  
  JavaScript  
  const sendEmailDeclaration \= {  
    name: 'send\_email',  
    description: 'Skicka ett e-postmeddelande till en specificerad mottagare',  
    parameters: {  
      type: 'object',  
      properties: {  
        recipient: {  
          type: 'object',  
          properties: {  
            name: { type: 'string' },  
            email: { type: 'string', format: 'email' },  
          },  
          required: \['email'\],  
        },  
        subject: { type: 'string' },  
        body: { type: 'string' },  
      },  
      required: \['recipient', 'subject', 'body'\],  
    },  
  };

  I detta fall definieras en funktion för att skicka e-post, där mottagaren är ett objekt med underordnade egenskaper som namn och e-postadress.  
* **Exempel 5: Arrayparameter:**  
  JavaScript  
  const addTasksToTodoListDeclaration \= {  
    name: 'add\_tasks\_to\_todo\_list',  
    description: 'Lägg till en eller flera uppgifter till en att-göra-lista',  
    parameters: {  
      type: 'object',  
      properties: {  
        tasks: {  
          type: 'array',  
          items: { type: 'string' },  
          description: 'En array av uppgifter att lägga till',  
        },  
      },  
      required: \['tasks'\],  
    },  
  };

  Detta exempel visar hur man definierar en funktion som kan ta emot en array av strängar som indata, i detta fall för att lägga till uppgifter i en att-göra-lista.

Dessa exempel illustrerar användningen av strängliteraler för att definiera datatyper, vilket direkt svarar på användarens förfrågan. Även om SDK:n ibland använder Type-enums 3), är det troligt att det underliggande API:et förväntar sig typinformationen som strängar i enlighet med OpenAPI-specifikationen 2\[Insight 4\]. Att förstå representationen med strängliteraler ger en mer fundamental förståelse för hur funktionsdeklarationer är strukturerade och kan vara användbart för kompatibilitet och felsökning.

Slutligen samlas functionDeclarations-arrayen inuti en tools-array i konfigurationsobjektet som skickas till modellen 2:

JavaScript

const config \= {  
  tools: \[{  
    functionDeclarations: \[  
      getCurrentWeatherDeclaration,  
      //... andra funktionsdeklarationer  
    \],  
  }\],  
};

**4\. Utföra API-anrop med Function Calling**

Det finns huvudsakligen två metoder för att interagera med modellen och inkludera funktionsdeklarationer: model.generateContent() för enstaka anrop och chat.sendMessage() för konversationer.

För att använda model.generateContent() skickar man en konfiguration som innehåller tools-arrayen tillsammans med användarens prompt i contents-arrayen 3:

JavaScript

const prompt \= 'Hur är vädret i Stockholm?';  
const generationConfig \= {  
  tools: \[{ functionDeclarations: \[getCurrentWeatherDeclaration\] }\],  
};

const response \= await model.generateContent({  
  contents: \[{ role: 'user', parts: \[{ text: prompt }\] }\],  
  generationConfig,  
});

Alternativt, för att använda Function Calling i en chattkontext, kan man använda chat.sendMessage(). tools-konfigurationen kan antingen anges när man startar chattsessionen med model.startChat() eller inkluderas i varje anrop till sendMessage() 3:

JavaScript

const chat \= model.startChat({  
  tools: \[{ functionDeclarations: \[getCurrentWeatherDeclaration\] }\],  
});

const result \= await chat.sendMessage('Hur är vädret i Göteborg?');  
const response \= result.response;

Valet mellan model.generateContent() och chat.sendMessage() beror på applikationens natur \[Insight 5\]. Om det handlar om en enkel fråga och svar-interaktion kan generateContent() vara tillräckligt. För mer komplexa, konversationella applikationer där historik och kontext är viktiga, är chat.sendMessage() att föredra. chat.sendMessage() underhåller konversationshistoriken, vilket kan vara särskilt fördelaktigt när man använder Function Calling i flera steg.

**5\. Hantera Modellens Svar**

När modellen har bearbetat anropet med funktionsdeklarationerna kan svaret innehålla en indikation på att en eller flera funktioner bör anropas. Denna information finns i functionCalls-arrayen, som är nested inom candidates, content och parts i svaret 3:

JavaScript

if (response?.candidates?.?.content?.parts?.?.functionCall) {  
  const functionCall \= response.candidates.content.parts.functionCall;  
  //... bearbeta funktionsanropet  
}

För chat.sendMessage() kan strukturen vara något annorlunda, till exempel result.response.candidates.content.parts.functionCall.8

Om modellen har beslutat att anropa en funktion kommer functionCall-objektet att innehålla egenskaperna name och args. name är namnet på funktionen som ska anropas, och args är ett JSON-objekt som innehåller de argument som modellen föreslår för funktionen 3:

JavaScript

const functionName \= functionCall.name;  
const functionArguments \= functionCall.args;

console.log('Funktion att anropa:', functionName);  
console.log('Argument:', JSON.stringify(functionArguments, null, 2));

Det är viktigt att notera att modellen kan returnera flera funktionsanrop i ett enda svar, vilket kallas parallell Function Calling.5 I sådana fall kommer functionCalls-arrayen att innehålla flera objekt. Utvecklare bör vara beredda att hantera detta genom att iterera genom arrayen \[Insight 6\]. Förmågan att anropa flera funktioner samtidigt kan öka effektiviteten genom att tillåta modellen att samla information från olika källor eller initiera flera åtgärder parallellt.

Efter att ha extraherat funktionsanropet och dess argument är nästa steg att faktiskt exekvera funktionen i din kod baserat på informationen från modellen. När funktionen har exekverats och returnerat ett resultat måste detta resultat skickas tillbaka till modellen i ett efterföljande anrop. Detta görs genom att konstruera en functionResponse-del och inkludera den i parts-arrayen i anropet till generateContent eller sendMessage 1:

JavaScript

// Antag att du har en funktion \`getCurrentWeather(location, unit)\`  
const weatherData \= await getCurrentWeather(functionArguments.location, functionArguments.unit);

const functionResponse \= {  
  name: functionName,  
  response: { result: weatherData },  
};

const finalResponse \= await chat.sendMessage({  
  parts:,  
});

console.log('Slutligt svar från modellen:', finalResponse.response.text());

Detta steg är avgörande för att modellen ska kunna använda resultatet från funktionsanropet för att generera ett lämpligt svar till användaren.3

**6\. Komplett Kodexempel**

Här är ett komplett exempel som demonstrerar hela processen för att använda Function Calling med @google/generative-ai-SDK:n:

JavaScript

import { GoogleGenerativeAI } from '@google/generative-ai';

// Initiera API-klienten  
const genAI \= new GoogleGenerativeAI(process.env.API\_KEY);  
const model \= genAI.getGenerativeModel({ model: 'gemini-pro' });

// Definiera funktionsdeklarationen  
const getCurrentWeatherDeclaration \= {  
  name: 'get\_current\_weather',  
  description: 'Hämta aktuellt väder på en given plats',  
  parameters: {  
    type: 'object',  
    properties: {  
      location: { type: 'string', description: 'Staden och staten, t.ex. London, UK' },  
      unit: { type: 'string', enum: \['celsius', 'fahrenheit'\], description: 'Enheten som ska användas för temperatur' },  
    },  
    required: \['location'\],  
  },  
};

async function main() {  
  const chat \= model.startChat({  
    tools: \[{ functionDeclarations: \[getCurrentWeatherDeclaration\] }\],  
  });

  const result \= await chat.sendMessage('Hur är vädret i London?');  
  const response \= result.response;

  if (response?.candidates?.?.content?.parts?.?.functionCall) {  
    const functionCall \= response.candidates.content.parts.functionCall;  
    const functionName \= functionCall.name;  
    const functionArguments \= functionCall.args;

    console.log('Modellen vill anropa:', functionName);  
    console.log('Med argument:', JSON.stringify(functionArguments, null, 2));

    // I en verklig applikation skulle du exekvera funktionen här  
    // och skicka resultatet tillbaka till modellen.  
  } else if (response?.candidates?.?.content?.parts?.?.text) {  
    console.log('Modellsvar:', response.candidates.content.parts.text);  
  } else {  
    console.log('Inget funktionsanrop eller textsvar hittades.');  
  }  
}

main().catch(e \=\> console.error(e));

Detta exempel visar hur man importerar SDK:n, initierar klienten och modellen, definierar en funktionsdeklaration för att hämta väderinformation, startar en chattsession med verktyget, skickar en fråga och sedan kontrollerar svaret för ett eventuellt funktionsanrop. I en fullständig applikation skulle man i if-blocket implementera logiken för att anropa den faktiska get\_current\_weather-funktionen och skicka tillbaka resultatet till modellen.

**7\. Länkar till Officiell Dokumentation och Resurser**

För ytterligare information och mer detaljerade exempel rekommenderas följande officiella resurser:

* **Google AI for Developers Dokumentation (ai.google.dev):**  
  * Huvudsidan för Function Calling: https://ai.google.dev/gemini-api/docs/function-calling 3  
  * Function Calling Tutorial: https://ai.google.dev/gemini-api/docs/function-calling/tutorial 3  
  * Genom att söka på "Node.js SDK" och "Function Calling" på denna webbplats kan man hitta ytterligare relevant information.  
* **google-gemini/cookbook GitHub Repository:**  
  * Huvudrepository: https://github.com/google-gemini/cookbook 13  
  * Även om många exempel i denna kokbok är skrivna i Python 9 och notebooks som 1), kan det finnas Node.js-specifika exempel relaterade till Function Calling. Det är rekommenderat att utforska eventuella Node.js-mappar eller filer i repositoryt \[Insight 7\].  
* **@google/generative-ai SDK Repository på GitHub:**  
  * Huvudrepository: https://github.com/google/generative-ai-js 4  
  * I samples-mappen finns troligen relevanta Node.js-exempel, särskilt om man söker efter filer som innehåller "function-calling" 8 som refererar till /samples/node/advanced-function-calling.js) \[Insight 8\]. Det kan också vara värt att granska docs-mappen för API-dokumentation specifik för Node.js SDK:n.

**Slutsatser**

Implementeringen av Function Calling med Googles Node.js SDK @google/generative-ai öppnar upp kraftfulla möjligheter för att skapa mer intelligenta och interaktiva applikationer. Genom att definiera funktionsdeklarationer kan utvecklare ge Gemini-modeller förmågan att interagera med externa system och data, vilket utökar deras användbarhet betydligt. Rapporten har tillhandahållit direkta kodexempel och länkar till officiell dokumentation för att underlätta för Node.js-utvecklare att komma igång med denna avancerade funktion. Det är viktigt att noggrant studera dokumentationen och experimentera med de olika metoderna för att fullt ut förstå och utnyttja potentialen i Function Calling med @google/generative-ai-SDK:n.