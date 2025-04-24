**Utvecklingsdokument: Backend - Implementation av Realtids Ingrediensanalys med Google Live API**

**1. Mål:**

Att implementera backend-logiken för realtidsanalys av ingredienser. Backend ska agera som en proxy och hantera WebSocket-kommunikation mellan React Native-frontend och Google Gemini Live API. Målet är att ersätta den nuvarande video-upload-analysflödet med en strömmande realtidslösning.

**2. Kärnteknologi:**

*   **Node.js / Express:** Befintlig backend-stack på Fly.io.
*   **WebSockets:** Använda ett bibliotek (t.ex. `ws`) för att hantera dubbelriktad kommunikation med både frontend och Google Live API.
*   **Google Gemini Live API (Preview):**
    *   **Modell:** `gemini-2.0-flash-live-01` (eller motsvarande).
    *   **Kommunikation:** WebSockets.
    *   **Input:** Strömmande video-bildrutor (mottagna från frontend som base64 JPEG, skickas vidare i API:ets förväntade format).
    *   **Output:** Konfigurerad för **TEXT**-output (`response_modalities: ["TEXT"]`).
    *   **Autentisering:** API-nyckel (hanteras via miljövariabler).

**3. Arkitekturöversikt:**

1.  Backend tar emot en WebSocket-anslutning från Frontend.
2.  Vid anslutning (eller första bildruta) etablerar Backend en WebSocket-anslutning till Google Live API för den sessionen.
3.  Backend tar emot base64-kodade JPEG-bildrutor från Frontend via WebSocket.
4.  Backend formaterar om och strömmar bildrutorna till Google Live API via dess WebSocket.
5.  Backend tar emot strömmande TEXT-svar från Google Live API.
6.  Backend bearbetar svaren (extraherar ingredienser, bedömer veganstatus m.m., integrerar med befintliga tjänster som `veganValidator`).
7.  Backend formaterar resultaten till JSON och skickar dem tillbaka till Frontend via *dess* WebSocket.
8.  Backend hanterar livscykeln för båda anslutningarna (stänger Google-anslutning när frontend kopplar ner).

**4. Implementationsteg (Node.js/Express):**

*   **[ ] WebSocket Server Setup (`src/server.ts`):**
    *   Installera och integrera ett WebSocket-bibliotek (t.ex. `ws`).
    *   Skapa en WebSocket-server och koppla den till den befintliga Node.js `http`-servern.
    *   Implementera grundläggande connection-hantering:
        *   `on('connection', (ws) => { ... })`: Hantera nya klientanslutningar.
        *   `on('message', (message) => { ... })`: Hantera inkommande bildrutedata.
        *   `on('close', () => { ... })`: Hantera när klienten kopplar ner.
        *   `on('error', (error) => { ... })`: Hantera fel.
        *   Associera varje frontend-`ws`-anslutning med dess motsvarande Google Live API-session/anslutning.
*   **[ ] Live API Service (Ny fil, t.ex. `src/services/liveAnalysisService.ts`):**
    *   Skapa en klass eller funktioner för att hantera interaktionen med Google Live API.
    *   **Metod för att starta session:**
        *   Tar emot nödvändig info (t.ex. frontend WebSocket-referens, ev. userId).
        *   Använder `geminiService.ts` (eller direkt `@google/generative-ai` om SDK:n stödjer Live API via WebSockets, annars råa WebSockets) för att etablera WebSocket-anslutning till Google.
        *   Referera till `Get_started_LiveAPI.py` för protokoll och datastruktur för anslutning och konfiguration (`response_modalities: ["TEXT"]`).
        *   Hantera autentisering (API-nyckel från `process.env`).
        *   Spara referens till Google WebSocket-anslutningen.
        *   Implementera lyssnare för `message`, `close`, `error` på Google WebSocket.
    *   **Metod för att hantera bildruta:**
        *   Tar emot en base64 JPEG-sträng från frontend.
        *   Formaterar datan enligt Live API:s krav (se Python-exempel: `{ "mime_type": "image/jpeg", "data": "..." }`).
        *   Skickar den formaterade datan till Google WebSocket.
    *   **Logik för att hantera svar från Google:**
        *   Parsar TEXT-svaren (förväntas vara JSON eller strukturerad text).
        *   Extraherar relevant information (ingredienser, status, konfidens).
    *   **Metod för att stänga session:**
        *   Stänger WebSocket-anslutningen till Google Live API.
*   **[ ] Analys & Formatering (i `liveAnalysisService.ts` eller anropande `veganValidator.ts`):**
    *   Använd `veganValidator.ts` för att validera extraherade ingredienser.
    *   Ackumulera resultat för sessionen (lista över ingredienser, övergripande status).
    *   Formatera den ackumulerade/uppdaterade informationen till ett standardiserat JSON-objekt att skicka till frontend (definiera detta format).
*   **[ ] WebSocket Kommunikationslogik (Koppling mellan `server.ts` och `liveAnalysisService.ts`):**
    *   I `server.ts` `on('message')`-hanteraren: Anropa `liveAnalysisService` för att skicka bildrutan till Google.
    *   I `liveAnalysisService`: När ett bearbetat svar från Google är klart, använd frontend `ws`-referensen för att skicka JSON-uppdateringen tillbaka (`ws.send(JSON.stringify(update))`).
    *   I `server.ts` `on('close')`-hanteraren: Anropa `liveAnalysisService` för att stänga Google API-sessionen.
*   **[ ] Integration med Användningsgränser (`supabaseService.ts`):**
    *   **Beslut krävs:** Hur ska analysräkningen hanteras för strömmande sessioner?
        *   Alternativ 1: Räkna 1 analys per startad session.
        *   Alternativ 2: Räkna per tidsenhet (t.ex. per 10 sekunder).
        *   Alternativ 3: Endast för premium / annan modell.
    *   Implementera den valda logiken genom att anropa `checkUserLimit` (vid sessionsstart) och `incrementAnalysisCount` (baserat på valt beslut) från `liveAnalysisService`. Kommunicera tydligt tillbaka till frontend om gränsen nås.
*   **[ ] Felhantering:**
    *   Implementera robust felhantering för båda WebSocket-anslutningarna.
    *   Hantera fel från Live API (anslutningsfel, analysfel).
    *   Skicka lämpliga felmeddelanden till frontend via WebSocket.

**5. Dataflöde:**

*   **Frontend -> Backend:** WebSocket: Base64 JPEG-strängar, Stopp-signal.
*   **Backend -> Frontend:** WebSocket: JSON-objekt (t.ex. `{ status: 'UPDATING', ingredients: [...], overallVeganStatus: 'VEGAN_SO_FAR' }` eller `{ status: 'ERROR', message: '...' }`).
*   **Backend -> Google Live API:** WebSocket: Konfiguration + Strömmande bilddata (JSON-struktur enligt API-spec).
*   **Google Live API -> Backend:** WebSocket: Strömmande TEXT-svar (JSON eller strukturerad text).

**6. Viktiga Noteringar & Utmaningar:**

*   **Live API PREVIEW:** API:et kan ändras. Var beredd på anpassningar. Node.js SDK kanske inte har fullt stöd för Live API via WebSockets än – råa WebSockets kan behövas initialt.
*   **Prestanda/Skalbarhet:** Hantering av många samtidiga WebSocket-anslutningar på backend (Fly.io instansstorlek).
*   **Kostnad:** Realtidsströmning kan vara dyrare. Prissättning oklar.
*   **Användningsgränser:** Definiera hur dessa ska fungera för strömning.
*   **Nätverksstabilitet:** Implementera viss logik för att hantera tillfälliga avbrott (om möjligt/rimligt).

**7. Referenser:**

*   `Docs/Live_API/Get_started_LiveAPI.py` (Protokollexempel)
*   `Docs/Live_API/Get_started_LiveAPI_tools.ipynb`
*   `Docs/Live_API/live-api-markdown.md`
