
**Dokumentation: Integrera Live API Backend i `KoaLens-Backend`**

**Mål:** Lägga till WebSocket-baserad realtidsanalys via Google Gemini Live API.

**Förutsättningar:**

*   Du är i rotkatalogen för projektet `C:\Projects\koalens-backend`.
*   Du använder Git och har skapat (eller skapar nu) en ny feature-branch för detta arbete, t.ex. `feature/live-api`.
    ```bash
    # Om du inte redan gjort det:
    git checkout main # Eller din huvudbranch
    git pull # Säkerställ att du har senaste koden
    git checkout -b feature/live-api
    ```
*   Nödvändiga miljövariabler (särskilt `GEMINI_API_KEY`) är konfigurerade för projektet.

**Steg:**

1.  **Installera Beroenden:**
    *   Installera WebSocket-biblioteket (`ws`):
        ```bash
        npm install ws
        ```
    *   Installera TypeScript-typerna för `ws` som ett utvecklingsberoende:
        ```bash
        npm install --save-dev @types/ws
        ```

2.  **Skapa/Ersätt `LiveAnalysisService`:**
    *   **Kopiera** filen `liveAnalysisService.ts` från testprojektet: `C:\Projects\Backend-LiveAPI-Test\src\services\liveAnalysisService.ts`
    *   **Klistra in/ersätt** den i huvudprojektets service-mapp: `C:\Projects\koalens-backend\src\services\liveAnalysisService.ts`
    *   *Innehållet i denna fil är resultatet av alla våra iterationer i testprojektet och innehåller logiken för att ansluta till Google, hantera initiering från klient, skicka bilddata (med rätt JSON-struktur), och hantera streamade JSON-svar.*

3.  **Modifiera Serverstartfilen (`src/server.ts`):**
    *   Öppna filen `C:\Projects\koalens-backend\src\server.ts`.
    *   **Lägg till Importer:** Högst upp i filen, lägg till följande importer:
        ```typescript
        import { WebSocketServer } from 'ws';
        import { LiveAnalysisService } from './services/liveAnalysisService'; // Verifiera sökväg
        import http from 'http'; // Säkerställ att denna finns
        ```
    *   **Hitta HTTP-server-skapandet:** Leta reda på raden där `http.createServer` anropas (nära slutet av filen i din nuvarande kod):
        ```typescript
        const server = http.createServer(app);
        ```
    *   **Lägg till WebSocket Server Setup:** Direkt *efter* raden ovan, lägg till följande block för att initiera och hantera WebSocket-servern:
        ```typescript
        // +++ NY WEBSOCKET-SERVER SETUP +++
        // Skapa WebSocketServer och koppla den till HTTP-servern
        const wss = new WebSocketServer({ server }); // Koppla till din HTTP server

        logger.info('WebSocket server initialized and attached to HTTP server.');

        wss.on('connection', (ws) => {
            logger.info('WebSocket client connected');
            // Skapa en ny instans av din LiveAnalysisService för varje anslutning
            try {
              new LiveAnalysisService(ws); // LiveAnalysisService hanterar resten
            } catch (serviceError) {
                logger.error('Error creating LiveAnalysisService instance:', serviceError);
                // Stäng anslutningen om servicen inte kunde skapas
                ws.close(1011, 'Internal server error initializing analysis session.');
            }

            // Grundläggande fel/stängningshantering här är ok, men LiveAnalysisService hanterar det mesta internt
            ws.on('error', (error) => {
                logger.error('Direct WebSocket connection error:', error);
            });

             ws.on('close', (code, reason) => {
                 logger.info(`Direct WebSocket connection closed by client. Code: ${code}, Reason: ${reason.toString()}`);
             });
        });
        // +++ SLUT NY WEBSOCKET-SERVER SETUP +++
        ```
    *   **Verifiera HTTP-import:** Säkerställ att du inte har både `import http from 'http';` *och* `const http = require('http');`. Använd endast `import`-varianten högst upp.

4.  **Verifiera och Committa:**
    *   Starta om backend-servern från din `feature/live-api`-branch (`npm run dev` eller motsvarande). Kontrollera att den startar utan fel och att du ser loggmeddelandet `WebSocket server initialized and attached to HTTP server.`.
    *   Använd testskriptet `send_test_image.js` (du kan kopiera det från testprojektet till roten av `koalens-backend` tillsammans med `image.b64`) för att testa backend-delen:
        ```bash
        node send_test_image.js
        ```
        Verifiera att du får ett `analysisUpdate`-meddelande i skriptets output och att backend-loggarna visar att JSON-svaret från Google parsades korrekt.
    *   När allt fungerar, committa ändringarna till din `feature/live-api`-branch:
        ```bash
        git add .
        git commit -m "feat: Add backend support for Live API via WebSockets"
        # Eventuellt: git push -u origin feature/live-api
        ```

5.  **Nästa Steg (Frontend):**
    *   När backend är på plats i `feature/live-api`-branchen kan frontend-arbetet påbörjas (antingen i samma branch om du har ett monorepo, eller i en motsvarande branch i frontend-repot `C:\Projects\KoaLens`). Frontend behöver ansluta till `ws://localhost:8080` (eller din serveradress), skicka init och Base64-ramar, samt hantera `analysisUpdate`.

