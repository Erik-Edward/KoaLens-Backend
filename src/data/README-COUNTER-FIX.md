# Felsökning och åtgärder för analysräknaren

Detta dokument innehåller instruktioner för hur du kan åtgärda problem med analysräknaren i KoaLens-appen.

## Problem och lösning

Vi har identifierat följande problem:

1. Kolumnnamn i databasen matchar inte exakt vad som används i koden, vilket kan orsaka att uppdateringar inte sparas korrekt.
2. Analysräknaren ökas inte korrekt i databasen, trots att backend-loggar visar att uppdateringen sker.
3. Frontend får inte korrekt räknarstatus efter analys.

## Steg för att åtgärda problemet

### 1. Uppdatera databasen med SQL-script

Öppna Supabase SQL Editor och kör följande SQL-script som finns i `src/data/fix-analysis-counter.sql`:

```sql
-- 1. Lägg till "last_updated" kolumn om den saknas
ALTER TABLE public.user_analytics 
ADD COLUMN IF NOT EXISTS last_updated TIMESTAMP WITH TIME ZONE;

-- 2. Uppdatera last_updated med updated_at-värdet där last_updated är NULL
UPDATE public.user_analytics 
SET last_updated = updated_at 
WHERE last_updated IS NULL;

-- 3. Skapa en stored procedure för att öka analysräknaren (används av backend)
CREATE OR REPLACE FUNCTION public.increment_analysis_counter(
  user_id_param UUID,
  current_time TIMESTAMP WITH TIME ZONE DEFAULT now()
) RETURNS public.user_analytics AS $$
DECLARE
  result public.user_analytics;
BEGIN
  UPDATE public.user_analytics
  SET 
    analyses_used = analyses_used + 1,
    last_updated = current_time,
    updated_at = current_time
  WHERE user_id = user_id_param
  RETURNING * INTO result;

  IF result IS NULL THEN
    INSERT INTO public.user_analytics(
      user_id, analyses_used, analyses_limit, is_premium, last_updated, updated_at
    )
    VALUES (
      user_id_param, 1, 2, false, current_time, current_time
    )
    RETURNING * INTO result;
  END IF;

  RETURN result;
END;
$$ LANGUAGE plpgsql;

-- 4. Utility-funktion för att kontrollera kolumner i en tabell
CREATE OR REPLACE FUNCTION public.get_table_columns(table_name text)
RETURNS TABLE (
  column_name text,
  data_type text,
  is_nullable boolean
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    c.column_name::text, 
    c.data_type::text, 
    (c.is_nullable = 'YES')::boolean
  FROM 
    information_schema.columns c
  WHERE 
    c.table_schema = 'public' 
    AND c.table_name = table_name
  ORDER BY 
    c.ordinal_position;
END;
$$ LANGUAGE plpgsql;
```

### 2. Uppdatera backend-koden med förbättrad felhantering

1. Kopiera den uppdaterade versionen av `src/services/supabaseService.ts` från detta repo
2. Deployera den uppdaterade versionen till Fly.io med kommandot:

```bash
fly deploy
```

### 3. Testa analysräknaren

Använd testendpoint för att verifiera att analysräknaren nu fungerar korrekt:

1. Öppna i en webbläsare: `https://koalens-backend.fly.dev/test-usage/[ANVÄNDAR-ID]`
2. Testa att öka räknaren direkt: `https://koalens-backend.fly.dev/increment-usage/[ANVÄNDAR-ID]`
3. Kontrollera användarens status igen: `https://koalens-backend.fly.dev/usage/[ANVÄNDAR-ID]`

Om allt fungerar korrekt bör du se att `analyses_used` ökar med 1 efter varje anrop till `increment-usage`.

### 4. Förklaring av ändringarna

1. Vi har lagt till stöd för både `last_updated` och `updated_at` kolumnerna i databasen.
2. Vi har infört en mer robust mekanism för att uppdatera analysräknaren, med flera fallbacks.
3. Vi har implementerat en stored procedure i databasen för mer tillförlitlig inkrementering.
4. Vi har lagt till bättre loggning för att underlätta felsökning.

## Vid fortsatta problem

Om du fortfarande upplever problem med analysräknaren, prova följande:

1. Kontrollera att RLS-policies är korrekt konfigurerade i Supabase
2. Verifiera att service_role används korrekt i backend-koden
3. Kontrollera loggarna i Fly.io för eventuella felmeddelanden
4. Försök återskapa analysräknartabellen från grunden med korrekt schema

För ytterligare hjälp, kontakta utvecklingsteamet.