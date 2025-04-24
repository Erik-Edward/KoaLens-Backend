# Teknisk Dokumentation och Exempel för Google Gemini Live API:s Råa WebSocket-Protokoll för Real-tids Ingrediensanalys

## 1. Introduktion

Google Gemini Live API representerar en avancerad lösning för att etablera tvåvägsinteraktioner med låg latens gentemot Googles Gemini-modeller. Detta API möjliggör realtidskommunikation genom att stödja en mångfald av inmatningsmodaliteter, inklusive text, ljud och video, samtidigt som det erbjuder både text och ljud som utdataalternativ. Dess design är i grunden inriktad på applikationer som kräver omedelbar respons och naturliga samtalsflöden, vilket efterliknar mänsklig interaktion.

En central styrka hos API:et är dess förmåga att möjliggöra realtidsliknande, mänskliga samtal, komplett med den avgörande funktionen att tillåta användare att avbryta modellens svar. Denna möjlighet till avbrott är vital för att skapa genuint interaktiva upplevelser.

API:ets arkitektur bygger på WebSockets, vilket tillhandahåller en tillståndskänslig, full-duplex kommunikationskanal som säkerställer den låga latens som är nödvändig för realtidsapplikationer. Denna persistenta anslutning möjliggör kontinuerligt datautbyte mellan klienten och servern.

Att Google Gemini Live API är konstruerat med fokus på "tvåvägskommunikation med låg latens" indikerar starkt att det är specifikt utformat för realtidsanvändningsfall. Denna arkitektoniska inriktning antyder att det underliggande WebSocket-protokollet sannolikt är optimerat för snabb dataöverföring och minimal overhead, vilket är en kritisk faktor för användarens applikation för ingrediensanalys. Termen "Live API" i sig antyder ett fokus på interaktion i realtid. Det uttryckliga omnämnandet av "tvåvägs"-kapacitet signalerar förmågan att skicka data (videobilder) och ta emot svar (analys) samtidigt. Låg latens är av yttersta vikt för en sömlös användarupplevelse i ett scenario med live-videoanalys. Detta pekar på en design som prioriterar hastighet och effektivitet i datautbytet över WebSocket-protokollet.

API:ets breda stöd för olika modaliteter (text, ljud, video) understryker dess mångsidighet. För användarens specifika krav att endast ta emot textsvar för ingrediensanalys kommer det dock att vara avgörande att noggrant konfigurera sessionen för att säkerställa att modellen endast matar ut önskad modalitet och eventuellt filtrera bort oönskade ljudsvar. Även om Gemini Live API är utformat för att hantera flera in- och utdatatypes, kräver användarens behov av endast textsvar för analys en exakt konfiguration. API:et tillåter en sådan detaljerad kontroll över utdataformatet. Denna konfiguration kommer att vara en nyckelaspekt i implementeringen av backend-proxyn.

För utvecklare som siktar på att bygga anpassade backend-implementeringar, särskilt i miljöer som Node.js och med specifika WebSocket-bibliotek som ws, är en djup förståelse för det råa WebSocket-protokollet inte bara fördelaktigt utan ofta nödvändigt. Denna direkta interaktion kringgår de abstraktioner som erbjuds av högre nivå-SDK:er och ger större kontroll över kommunikationsprocessen. Även om Google tillhandahåller SDK:er för interaktion med Gemini API, kan direkt manipulation av WebSocket-protokollet vara att föredra eller till och med nödvändigt för specifika arkitektoniska överväganden, prestandaoptimeringar eller integration med befintliga system som redan använder råa WebSockets.

Användarens primära mål är tydligt: att utveckla en Node.js backend-proxy, med hjälp av ws-biblioteket, för att fungera som mellanhand mellan en React Native-frontend och Google Gemini Live API. Kärnfunktionaliteten hos denna proxy kommer att vara att möjliggöra realtidsanalys av ingredienser från en live-videoström som fångas av mobilapplikationen. Dataflödet är följande: React Native-klienten kommer att överföra en kontinuerlig ström av base64-kodade JPEG-bildrutor till backend via en WebSocket-anslutning. Node.js-backend, som fungerar som proxy, kommer sedan att vidarebefordra dessa bildrutor till Google Gemini Live API via en *rå* WebSocket-anslutning. Slutligen måste backend kunna ta emot **TEXT**-baserade svar från Gemini Live API över samma råa WebSocket-anslutning och vidarebefordra dessa insikter tillbaka till React Native-klienten.

Syftet med denna rapport är att förse användaren med den exakta tekniska dokumentationen, de specifika detaljerna och de relevanta exemplen som krävs för att framgångsrikt implementera sin Node.js backend-proxy för realtids ingrediensanalys med hjälp av Google Gemini Live API:s råa WebSocket-protokoll. Rapporten kommer att besvara följande prioriterade frågor från användaren i detalj:

1. **Exakt WebSocket URL:** Identifiera den exakta wss://...-URL:en för att ansluta direkt till gemini-2.0-flash-live-001 (eller en lämplig live-/strömningsmodell) via råa WebSockets, och om URL:en inkluderar modellnamnet eller andra parametrar.

2. **Autentiseringsmetod (Rå WebSocket):** Beskriv metoden för att skicka API-nyckeln vid upprättande av en anslutning via råa WebSockets, med särskilt fokus på användningen av HTTP-headers (t.ex. x-goog-api-key: YOUR_API_KEY) och bekräfta att frågeparametern ?key= inte är lämplig för WebSocket-anslutningar.

3. **Initialt Konfigurationsmeddelande (JSON-struktur):** Ange det exakta JSON-objekt som måste skickas omedelbart efter att WebSocket-anslutningen till Google har öppnats för att konfigurera sessionen för att endast ta emot **TEXT**-svar, med hänvisning till strukturen för BidiGenerateContentSetup och inkludera ett komplett JSON-exempel.

4. **Bildformat vid Skickning (JSON-struktur):** Bekräfta den exakta JSON-strukturen för att skicka varje bildruta, och specifikt verifiera om formatet { "mime_type": "image/jpeg", "data": "BASE64_ENCODED_STRING" } är korrekt för Google Gemini Live API.

5. **Svarsformat från Google (JSON-struktur):** Ge ett eller flera illustrativa exempel på de JSON-svar som strömmas tillbaka från Google Live API när response_modalities är inställt på TEXT, beskriv hur den returnerade texten är strukturerad och om svaren inkluderar fält för konfidens, fel, status eller specifikt identifierade entiteter (som ingredienser), med hänvisning till strukturen för BidiGenerateContentServerContent om möjligt.

## 2. Upprättande av WebSocket-Anslutningen

### 2.1 WebSocket URL

En noggrann analys visar att WebSocket-URL:en för Google Gemini Live API, specifikt för v1beta-versionen av API:et, är:

```
wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContent
```

Denna URL fungerar som den primära slutpunkten för att initiera en WebSocket-anslutning till Gemini Live API.

Det är viktigt att notera att denna URL uttryckligen riktar sig till API-versionen v1beta och tjänsten BidiGenerateContent, vilket är den avsedda slutpunkten för dubbelriktade strömningsinteraktioner med Gemini-modellerna.

Avsaknaden av modellnamnet (gemini-2.0-flash-live-001) i den grundläggande WebSocket-URL:en antyder starkt att den specifika modellen som ska användas för sessionen inte definieras som en del av själva anslutningsslutpunkten. Istället specificeras modellidentifieraren troligen som en parameter i det initiala konfigurationsmeddelandet (BidiGenerateContentSetup) som överförs omedelbart efter att WebSocket-anslutningen har upprättats. Denna frikoppling av bas-URL:en från den specifika modellen möjliggör större flexibilitet i att använda olika modeller via samma kärnslutpunkt.

**Slutsats för 2.1:** Därför är den specifika WebSocket-URL som Node.js-backend bör använda för att initiera en rå WebSocket-anslutning till Google Gemini Live API definitivt:

```
wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContent
```

Målmodellen, gemini-2.0-flash-live-001, kommer att specificeras i det efterföljande konfigurationsmeddelandet för sessionen.

### 2.2 Autentiseringsmetod (Rå WebSocket)

För vanliga REST API-anrop till Gemini API kan API-nyckeln inkluderas antingen som en frågeparameter i URL:en eller, säkrare och mer allmänt rekommenderat, via HTTP-headern x-goog-api-key.

Det finns olika autentiseringsmekanismer beroende på vilken plattform användaren interagerar med:
- För Google AI for Developers Gemini API används enkel API-nyckelautentisering och direkta WebSocket-anslutningar
- För Vertex AI API förlitar man sig på tjänstekontoautentisering och potentiellt en proxybaserad arkitektur

Bevisen tyder på att autentisering för den råa WebSocket-anslutningen till Google Gemini Live API sannolikt innebär antingen att API-nyckeln tillhandahålls som en x-goog-api-key HTTP-header under den initiala WebSocket-handskakningen eller, om användaren verkar inom Google Cloud/Vertex AI-miljön, att en Authorization: Bearer \<token\>-header används med en lämplig OAuth 2.0-token.

Med tanke på att användaren uttryckligen nämner att ha tillgång till API-nyckeln via miljövariabler, är det mer sannolikt att de använder Google AI for Developers (Gemini API) snarare än Vertex AI. Detta gör användningen av HTTP-headern x-goog-api-key under WebSocket-handskakningen till den mer troliga autentiseringsmetoden.

**Slutsats för 2.2:** Baserat på tillgänglig information och användarens kontext är den mest sannolika metoden för att autentisera en rå WebSocket-anslutning till Google Gemini Live API att inkludera API-nyckeln som värdet på HTTP-headern x-goog-api-key under den initiala WebSocket-handskakningen. Även om frågeparametern ?key= används för att autentisera REST-anrop, är det inte den standardmässiga eller rekommenderade metoden för WebSocket-anslutningar. Användaren bör konfigurera sin ws-klient i Node.js för att inkludera headern x-goog-api-key med sin API-nyckel vid upprättandet av WebSocket-anslutningen.

## 3. Sessionkonfiguration

### 3.1 Initialt Konfigurationsmeddelande (BidiGenerateContentSetup)

Det allra första meddelandet som överförs efter att en WebSocket-anslutning har upprättats måste innehålla sessionens konfiguration. Denna konfiguration dikterar parametrarna för hela sessionen, inklusive den specifika modell som ska användas, olika genereringsparametrar som påverkar modellens utdata, eventuella systeminstruktioner för att styra modellens beteende och definitionen av eventuella verktyg som modellen kan använda.

Medan de flesta konfigurationsparametrar kan justeras under en aktiv session, kan själva modellen inte ändras när sessionen väl har initierats.

Den initiala kommunikationen från klienten till Gemini Live API över den råa WebSocket-anslutningen måste vara ett JSON-objekt med exakt ett fält: "setup". Värdet på detta "setup"-fält kommer att vara ett annat JSON-objekt som följer schemat för BidiGenerateContentSetup och som innehåller alla nödvändiga parametrar för att konfigurera sessionen enligt användarens krav.

### 3.2 JSON Konfigurationsexempel för TEXT Svar

För att specifikt konfigurera Gemini Live API-sessionen att endast tillhandahålla svar i textformat behöver "responseModalities" inom objektet "generationConfig" i meddelandet BidiGenerateContentSetup ställas in på en JSON-array som innehåller den enda strängen "TEXT".

**JSON Exempel:** Genom att kombinera kravet på kuvertet setup och konfigurationen för textsvar, skulle det initiala JSON-meddelandet som ska skickas över WebSocket-anslutningen se ut så här:

```json
{
  "setup": {
    "model": "models/gemini-2.0-flash-live-001",
    "generationConfig": {
      "responseModalities": ["TEXT"]
    }
  }
}
```

Inom detta initiala konfigurationsmeddelande är fältet "model", som finns direkt under objektet "setup", avgörande för att specificera vilken Gemini-modell som ska användas för sessionen. Baserat på användarens krav bör detta fält ställas in på resursnamnet för målmodellen, vilket är "models/gemini-2.0-flash-live-001". Prefixet "models/" överensstämmer med det format som krävs, vilket indikerar att modellen refereras med sin resursväg inom API:et.

Även om användarens omedelbara angelägenhet är att ta emot textsvar, är det viktigt att notera att objektet generationConfig, liksom toppnivåobjektet setup, kan innehålla andra valfria parametrar. Dessa parametrar, såsom "temperature", "maxOutputTokens" och andra inom generationConfig, samt fält som "systemInstruction" och "tools" på setup-nivå, kan användas för att ytterligare finjustera modellens beteende och kapacitet enligt de specifika behoven hos applikationen för ingrediensanalys.

## 4. Dataöverföring

### 4.1 Bildformat vid Skickning

BidiGenerateContentRealtimeInput är mekanismen för att skicka realtidsljud eller videoinmatning till API:et. Detta antyder att de strömmande videobildrutorna från användarens applikation sannolikt kommer att kapslas in i meddelanden av denna typ.

Gemini API kan acceptera bildinmatning i base64-kodat format. Det är högst sannolikt att varje videobildruta kommer att skickas som ett separat meddelande över WebSocket-anslutningen med hjälp av typen BidiGenerateContentRealtimeInput. Själva bilddatan, base64-kodad som en sträng, kommer att behöva inkluderas i detta meddelande i ett strukturerat format som API:et känner igen som videoinnehåll.

Med tanke på att base64-kodning används för bilder och med hänvisning till vanliga API-designmönster för överföring av binärdata som JSON, är användarens föreslagna struktur { "mime_type": "image/jpeg", "data": "BASE64_ENCODED_STRING" } ett mycket troligt format för att representera bilddatan. Denna struktur kapslar snyggt in både datatypen (mime_type) och själva datan (i fältet "data" som en base64-kodad sträng). Det är sannolikt att detta JSON-objekt kommer att vara inbäddat i en större JSON-struktur som identifierar det som videoinmatning inom meddelandet BidiGenerateContentRealtimeInput.

**Slutsats för 4.1:** Även om den exakta JSON-strukturen för att skicka en base64-kodad JPEG-bildruta via rå WebSocket inte är explicit bekräftad, är användarens föreslagna format { "mime_type": "image/jpeg", "data": "BASE64_ENCODED_STRING" } en stark kandidat. Denna struktur, sannolikt inbäddad i ett BidiGenerateContentRealtimeInput-meddelande som specificerar videoläget, överensstämmer med API:ets förmåga att bearbeta base64-bilder och vanlig praxis för dataöverföring. För att få absolut säkerhet bör användaren konsultera den officiella Google Gemini Live API-referensdokumentationen.

## 5. Hantering av Svar

### 5.1 Svarsformat från Google (BidiGenerateContentServerContent)

Gemini Live API-servern kommunicerar med klienten genom att skicka meddelanden som WebSocket-"message"-händelser. Dessa server-skickade meddelanden kan innehålla olika typer av information, och en av de viktigaste typerna är serverContent, som specifikt är av typen BidiGenerateContentServerContent.

Meddelandetypen BidiGenerateContentServerContent används för att förmedla det innehåll som genereras av Gemini-modellen som ett direkt svar på de meddelanden som tas emot från klienten. Detta är den primära mekanismen för modellen att tillhandahålla sina analysresultat eller samtalsvändningar.

Servermeddelanden som tas emot över WebSocket kan valfritt inkludera ett fält usageMetadata, som kan tillhandahålla information om tokenförbrukning eller annan användningsrelaterad data. Huvudinnehållet i modellens svar kommer dock att finnas i fältet serverContent.

När Gemini Live API-sessionen är konfigurerad för att returnera textsvar, kommer dessa svar att kapslas in i WebSocket-meddelanden där fältet serverContent innehåller ett objekt av typen BidiGenerateContentServerContent. Detta objekt kommer att vara behållaren för den faktiska text som genereras av modellen.

### 5.2 JSON Exempel på Svar (TEXT Utdata)

Det faktiska textsvaret från Gemini-modellen kommer att finnas inbäddat i JSON-svarsstrukturen enligt följande: serverContent -> modelTurn -> parts. Arrayen parts kommer att innehålla ett eller flera objekt, och inom dessa objekt kommer den genererade texten att finnas i fältet med namnet "text".

**JSON Exempel på Svar:** Baserat på denna analys kan ett typiskt JSON-svar som innehåller ingrediensanalysen i textformat se ut så här:

```json
{
  "serverContent": {
    "modelTurn": {
      "parts": [
        {
          "text": "Den analyserade bilden innehåller troligen följande ingredienser:..."
        }
      ]
    }
  }
}
```

Servermeddelandet kan också innehålla ett fält usageMetadata, som kan ge viss övergripande statusinformation eller detaljer om de resurser som förbrukats under genereringsprocessen.

Nivån av detaljrikedom i textsvaret, inklusive om modellen tillhandahåller specifika konfidensnivåer för sin ingrediensidentifiering eller strukturerar utdata för att tydligt avgränsa de identifierade entiteterna, kommer sannolikt att bero på de inneboende kapaciteterna hos modellen gemini-2.0-flash-live-001 och potentiellt på eventuella specifika uppmaningar eller systeminstruktioner som kan konfigureras.

**Slutsats för 5.2:** När response_modalities är inställt på "TEXT" kommer svaren från Google Gemini Live API att vara strukturerade med den genererade texten i fältet "text", nästlad under "serverContent", sedan "modelTurn" och slutligen inom ett element i arrayen "parts". Förekomsten av specifika fält för konfidensnivåer, detaljerad felinformation inom själva textsvaret eller en strukturerad lista över identifierade entiteter bekräftas inte och kan bero på modellens specifika utdataformat och API:ets detaljerade design. Fältet usageMetadata kan innehålla allmän statusinformation om begärans bearbetning.

## 6. Viktiga Tabeller för Rapporten

### Tabell 1: WebSocket Meddelandestruktur

**Klientmeddelandetyp** | **Beskrivning** | **Relevanta Utdrag**
---------------------------|-----------------------------------|-------------------
BidiGenerateContentSetup | Det initiala meddelandet som skickas för att konfigurera sessionen, inklusive modell, genereringsparametrar, systeminstruktioner och verktyg. | 6
BidiGenerateContentClientContent | Inkrementella innehållsuppdateringar av det aktuella samtalet som levereras från klienten. | 6
BidiGenerateContentRealtimeInput | Realtidsljud-, video- eller textinmatning från klienten. | 6
BidiGenerateContentToolResponse | Klientens svar på ett ToolCallMessage som tas emot från servern, vilket tillhandahåller resultaten av funktionskörningar. | 6

**Servermeddelandetyp** | **Beskrivning** | **Relevanta Utdrag**
--------------------------|-----------------------------------|-------------------
BidiGenerateContentSetupComplete | Skickas av servern som svar på ett BidiGenerateContentSetup-meddelande från klienten, vilket indikerar att installationen är klar. | 6
BidiGenerateContentServerContent | Innehåll som genereras av modellen som svar på klientmeddelanden, inklusive text och ljud. | 6
BidiGenerateContentToolCall | En begäran från servern till klienten att köra funktionsanrop och returnera svaren med matchande ID:n. | 6
BidiGenerateContentToolCallCancellation | En notifikation från servern till klienten att ett tidigare utfärdat ToolCallMessage bör avbrytas. | 6
GoAway | Ett meddelande från servern som indikerar att anslutningen kommer att stängas snart. | 6
SessionResumptionUpdate | Tillhandahåller uppdateringar om sessionens återupptagningsstatus. | 6

### Tabell 2: BidiGenerateContentSetup Konfigurationsparametrar (Relevanta för Användaren)

**Parameter** | **Beskrivning** | **Krävs för Användarens Scenario** | **Relevanta Utdrag**
-------------|--------------------------|------------------------------|-------------------
"model" | Resursnamnet för den Gemini-modell som ska användas för sessionen (t.ex. "models/gemini-2.0-flash-live-001"). | Ja | 7
"generationConfig" | Ett objekt som innehåller olika genereringsparametrar. | Ja | 11
"generationConfig.responseModalities" | En array av strängar som specificerar önskade utdatamodaliteter (t.ex. ["TEXT"]). | Ja | 2
"systemInstruction" | Valfritt: Användardefinierade instruktioner för att styra modellens beteende. | Nej | 11
"tools" | Valfritt: En array som definierar externa funktioner som modellen kan använda. | Nej | 11

## 7. Slutsatser och Rekommendationer

Denna rapport har undersökt den tekniska dokumentationen och exemplen för Google Gemini Live API:s råa WebSocket-protokoll i syfte att tillhandahålla den information som krävs för att implementera en backend-proxy i Node.js för realtidsanalys av ingredienser från en videoström.

Baserat på analysen är den specifika WebSocket-URL:en för Gemini Live API:
```
wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContent
```

Modellnamnet gemini-2.0-flash-live-001 ingår inte i URL:en utan specificeras i det initiala konfigurationsmeddelandet.

Autentisering för rå WebSocket-anslutning sker sannolikt via HTTP-headern x-goog-api-key där API-nyckeln anges som värde. Användning av frågeparametern ?key= rekommenderas inte för WebSocket-anslutningar.

Det initiala konfigurationsmeddelandet som ska skickas direkt efter att WebSocket-anslutningen öppnats måste vara ett JSON-objekt med ett fält setup som innehåller ett BidiGenerateContentSetup-objekt. För att endast ta emot textsvar bör responseModalities i generationConfig sättas till ["TEXT"]. Ett exempel på detta meddelande är:

```json
{
  "setup": {
    "model": "models/gemini-2.0-flash-live-001",
    "generationConfig": {
      "responseModalities": ["TEXT"]
    }
  }
}
```

Formatet för att skicka varje bildruta som en base64-kodad JPEG är sannolikt ett JSON-objekt med strukturen:
```json
{ 
  "mime_type": "image/jpeg", 
  "data": "BASE64_ENCODED_STRING" 
}
```

Detta objekt kommer troligen att inkluderas i ett BidiGenerateContentRealtimeInput-meddelande som specificerar videoinmatning.

Svaren från Google Live API när response_modalities är inställt på TEXT kommer sannolikt att vara JSON-objekt där texten finns i fältet "text" under strukturen "serverContent", sedan "modelTurn" och slutligen inom en array "parts". Ett exempel på ett sådant svar är:

```json
{
  "serverContent": {
    "modelTurn": {
      "parts": [
        {
          "text": "Den analyserade bilden innehåller troligen följande ingredienser:..."
        }
      ]
    }
  }
}
```

Det är viktigt att notera att information om specifika fält för konfidens, fel, status eller detaljerad identifiering av entiteter inom textsvaret inte är tydligt framgår av den undersökta dokumentationen och kan bero på modellens specifika utdata.

### Rekommendationer:

1. Implementera WebSocket-anslutningen i Node.js med ws-biblioteket och använd URL:en:
   ```
   wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContent
   ```

2. Vid upprättande av anslutningen, inkludera API-nyckeln som en HTTP-header med namnet x-goog-api-key.

3. Skicka det initiala konfigurationsmeddelandet enligt JSON-exemplet ovan direkt efter att anslutningen har öppnats.

4. För varje bildruta från React Native-frontend, formatera datan som en base64-kodad sträng och inkludera den i ett JSON-objekt med formatet:
   ```json
   { 
     "mime_type": "image/jpeg", 
     "data": "BASE64_ENCODED_STRING" 
   }
   ```
   Detta objekt bör sedan skickas som en del av ett BidiGenerateContentRealtimeInput-meddelande.

5. I backend, hantera inkommande WebSocket-meddelanden från Google Live API och tolka JSON-svaren för att extrahera texten från fältet "text" som finns under "serverContent.modelTurn.parts".

6. För ytterligare detaljer och bekräftelse av format, konsultera den officiella Google Gemini Live API-dokumentationen, särskilt avsnitten som rör BidiGenerateContentSetup, BidiGenerateContentRealtimeInput och BidiGenerateContentServerContent.

7. Implementera felhantering för WebSocket-anslutningen och för bearbetningen av API-svar.

8. Överväg att implementera loggning för att underlätta felsökning under utvecklingsprocessen.
