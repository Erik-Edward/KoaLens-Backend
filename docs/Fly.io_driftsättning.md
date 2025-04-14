
# Dokumentation: Felsökning och Lösning av Driftsättningsproblem på Fly.io

## Problemöversikt
Koalens-backend (Node.js/TypeScript-applikation) kraschade vid start på Fly.io med `MODULE_NOT_FOUND`-fel. Applikationen kunde inte hitta modulen `../config/ai-config` när den importerades från `dist/services/geminiService.js`.

## Grundorsak
1. Konfigurationsfilen var `src/config/ai-config.js` (JavaScript-fil), inte TypeScript-fil
2. `tsconfig.json` saknade inställningen `allowJs: true`
3. TypeScript-kompilatorn (`tsc`) kopierade därför inte `ai-config.js` till `dist/`-mappen under byggprocessen

## Steg-för-steg lösningsprocess

### 1. Analys av problemet
Vi bekräftade att felet uppstod när applikationen försökte importera `ai-config`-modulen:
```
Error: Cannot find module '../config/ai-config'
Require stack:
- /app/dist/services/geminiService.js
- /app/dist/services/videoAnalysisService.js
- /app/dist/routes/videoAnalysis.js
- /app/dist/routes/index.js
- /app/dist/server.js
```

### 2. Tidigare försök
Tidigare försök hade gjorts med `copyfiles` i `package.json`, men dessa misslyckades:
```json
"build": "tsc && npx copyfiles -u 1 src/config/ai-config.js src/config/ai-config.d.ts dist/config"
```
och
```json
"build": "tsc && npx copyfiles src/config/* dist/config"
```

### 3. Vår lösningsansats

#### Steg 1: Undersökning av importstrukturen
Vi undersökte `src/services/geminiService.ts` och såg att den importerade modulen så här:
```typescript
import config from '../config/ai-config';
```

Denna import omvandlades i den kompilerade JavaScript-filen till:
```javascript
const ai_config_1 = __importDefault(require("../config/ai-config"));
```

#### Steg 2: Modifiering av Dockerfile
Vi lade till explicita kommandon i Dockerfile för att kopiera konfigurationsfilerna efter byggprocessen:

```dockerfile
# Explicitly copy config files after build
RUN mkdir -p /app/dist/config
# Copy ai-config.js to both the original name and without extension to match imports
RUN cp src/config/ai-config.js /app/dist/config/ai-config
RUN cp src/config/ai-config.js /app/dist/config/ai-config.js
RUN cp src/config/ai-config.d.ts /app/dist/config/ai-config.d.ts
```

Genom att kopiera filen både med och utan `.js`-filändelse säkerställde vi att Node.js kunde hitta filen oavsett hur den importerades.

#### Steg 3: Åtgärdande av sekundärt problem (ffmpeg)
Efter att ha löst det primära problemet stötte vi på ett sekundärt fel relaterat till att ffmpeg saknades i containern. Detta åtgärdades genom att lägga till installation av ffmpeg i Dockerfile:

```dockerfile
# Install ffmpeg
RUN apt-get update && apt-get install -y ffmpeg && apt-get clean
```

### 4. Verifiering av lösningen
Efter driftsättning med `fly deploy` kontrollerade vi att applikationen startade korrekt:

1. Verifierade att applikationen var i "started"-tillstånd med `fly status`
2. Testade att API:et svarade genom att göra en HTTP-förfrågan:
   ```
   Invoke-WebRequest -Uri https://koalens-backend.fly.dev/ -Method Get
   ```

3. Bekräftade en lyckad respons:
   ```json
   {
     "status": "ok", 
     "message": "KoaLens API is running", 
     "environment": "production", 
     "timestamp": "2025-04-06T10:18:59.107Z"
   }
   ```

## Tekniska detaljer och lärdomar

### Importlösning i Node.js
Node.js söker efter moduler på flera sätt:
1. Exakt filsökväg (med filändelse)
2. Utan filändelse, där Node.js provar olika filändelser (.js, .json, etc.)
3. Som en katalog med en index.js-fil

Vår lösning säkerställde att modulen fanns tillgänglig både med och utan filändelse.

### Docker multi-stage bygg
Vi använde Docker multi-stage bygg för att hålla slutbilden slimmad:
1. **Builder-steget**: Kompilerade TypeScript till JavaScript och kopierade konfigurationsfiler
2. **Final-steget**: Innehöll endast nödvändiga körtidsfiler och installerade ffmpeg

### Slutgiltig Dockerfile
```dockerfile
# Use an official Node.js runtime as a parent image
# Builder stage
FROM node:20-slim AS builder

# Set the working directory in the container
WORKDIR /app

# Copy package.json and package-lock.json (or yarn.lock) files
COPY package*.json ./

# Install dependencies using npm ci for reproducible builds
RUN npm ci

# Copy the rest of the application code
COPY . .

# Build the TypeScript project
RUN npm run build

# Explicitly copy config files after build
RUN mkdir -p /app/dist/config
# Copy ai-config.js to both the original name and without extension to match imports
RUN cp src/config/ai-config.js /app/dist/config/ai-config
RUN cp src/config/ai-config.js /app/dist/config/ai-config.js
RUN cp src/config/ai-config.d.ts /app/dist/config/ai-config.d.ts

# Remove development dependencies
RUN npm prune --omit=dev

# Final stage
FROM node:20-slim

# Install ffmpeg
RUN apt-get update && apt-get install -y ffmpeg && apt-get clean

# Set the working directory in the container
WORKDIR /app

# Copy built artifacts and necessary files from the builder stage
COPY --from=builder /app/package*.json ./
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist
COPY src/data/*.csv ./dist/data/

# Expose the port the app runs on
EXPOSE 8080

# Define the command to run the application
ENTRYPOINT ["node"]
CMD ["dist/server.js"]
```

## Alternativa lösningar som övervägdes

1. **Ändra i tsconfig.json**: Lägga till `allowJs: true` skulle lösa problemet permanent, men vi valde att inte ändra i TypeScript-konfigurationen för att minimera ändringarna.

2. **Ändra importstrukturen**: Ändra import-satsen till att inkludera filändelsen, men detta skulle kräva kodändringar i flera filer.

3. **Använda `copyfiles` i package.json**: Tidigare försök visade att detta inte fungerade tillförlitligt i Fly.io-miljön.

## Rekommendationer för framtiden

1. **Lägg till `allowJs: true` i tsconfig.json** för att tillåta JavaScript-filer i TypeScript-projektet och undvika liknande problem i framtiden.

2. **Använd .ts-filer genomgående** för att undvika blandning av .js och .ts-filer i projektet.

3. **Lägg till hälsokontroller** i fly.toml för att snabbare upptäcka problem med applikationen.

4. **Implementera en CI/CD-pipeline** med tester som simulerar driftsättningsmiljön för att fånga dessa problem tidigare.

Denna dokumentation kan tjäna som referens för framtida felsökningar och driftsättningar av liknande projekt på Fly.io.
