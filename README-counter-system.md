# Nytt Counter System i KoaLens

Detta dokument beskriver det nya systemet för att hantera räknare (counters) i KoaLens-projektet, som ersätter det tidigare problemfyllda analys-räknarsystemet.

## Översikt

Systemet bygger på en ny datamodell som möjliggör:
- Spårning av flera olika typer av räknare per användare
- Flexibla återställningsfrekvenser (daglig, veckovis, månatlig, aldrig)
- Robusta stored procedures som hanterar all logik
- Bättre säkerhet genom RLS-policies

## Implementationsdelar

Koden består av följande delar:

### 1. Databasdesign (Supabase)
- Ny `user_counters` tabell istället för `user_analytics`/`user_usage`
- Stored procedures för att hantera räknarna
- RLS-policies för säker åtkomst

### 2. Backend-implementation
- `counterService.ts` - gränssnitt mot Supabase
- `counterRoutes.ts` - API-endpoints
- integration i server.ts

### 3. Frontend-implementation (skapas senare)
- `useCounter` hook för att hantera räknare

## Installations- och migrationssteg

### Steg 1: Implementera databasen
1. Kör SQL-skriptet `src/data/counter-system.sql` i Supabase SQL Editor
2. Kör `SELECT setup_standard_counters();` för att skapa räknare för befintliga användare

### Steg 2: Implementera backend-API
1. Kopiera de nya filerna till din backend-kod:
   - `src/services/counterService.ts`
   - `src/routes/counterRoutes.ts`
   - `src/routes/index.ts`
2. Uppdatera `server.ts` för att använda de nya routes

### Steg 3: Testa och verifiera
1. Testa API:et med följande endpoints:
   - `GET /api/counters/:userId/:counterName` - Hämta räknarinformation
   - `POST /api/counters/:userId/:counterName/increment` - Öka räknaren
   - `GET /api/counters/:userId/:counterName/limit` - Kontrollera gränsen

2. Kontrollera att livedata finns i Supabase

### Steg 4: Implementera frontend-hook
1. Skapa `useCounter` hook som ersätter `useAnalytics`/`useUsageLimit`
2. Uppdatera alla komponenter som använder de gamla hooksen

## API Dokumentation

### GET /api/counters/:userId/:counterName
Hämtar information om en specifik räknare för en användare.

**Svar:**
```json
{
  "counter_id": "uuid",
  "user_id": "uuid",
  "counter_name": "analysis_count",
  "value": 3,
  "limit": 5,
  "remaining": 2,
  "is_limited": true,
  "has_reached_limit": false,
  "reset_frequency": "monthly",
  "last_reset": "2023-11-01T00:00:00Z",
  "next_reset": "2023-12-01T00:00:00Z"
}
```

### POST /api/counters/:userId/:counterName/increment
Ökar en räknares värde.

**Request Body:**
```json
{
  "increment": 1
}
```

**Svar:** Samma som GET-anropet ovan, men med uppdaterade värden.

### GET /api/counters/:userId/:counterName/limit
Kontrollerar om en användare har nått gränsen för en räknare.

**Svar:**
```json
{
  "hasReachedLimit": false,
  "value": 3,
  "limit": 5,
  "remaining": 2
}
```

## Felsökning

Om du stöter på problem:

1. Kontrollera Supabase-loggar för fel i stored procedures
2. Verifiera att alla tabeller och RLS-policies har skapats korrekt
3. Testa API-endpoints direkt med curl eller Postman
4. Se till att användare har rätt behörigheter

## Avveckling av gammalt system

Efter att det nya systemet är implementerat och verifierat:

1. Behåll båda systemen under en övergångsperiod
2. När du är säker på att allt fungerar, kör SQL för att ta bort gamla tabeller:
   ```sql
   DROP TABLE IF EXISTS public.user_usage;
   DROP TABLE IF EXISTS public.user_analytics;
   ```

3. Ta bort gamla funktioner från backend