-- Fix för analysräknaren i Supabase
-- Körs som en migration i Supabase SQL Editor

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
  -- Använd UPDATE med RETURNING för att få tillbaka den uppdaterade raden
  UPDATE public.user_analytics
  SET 
    analyses_used = analyses_used + 1,
    last_updated = current_time,
    updated_at = current_time
  WHERE user_id = user_id_param
  RETURNING * INTO result;

  -- Om ingen rad uppdaterades (användaren finns inte), infoga en ny rad
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