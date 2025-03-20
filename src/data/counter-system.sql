-- Skapa en ny tabell för att hantera räknare
CREATE TABLE IF NOT EXISTS public.user_counters (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  counter_name TEXT NOT NULL,
  counter_value INTEGER NOT NULL DEFAULT 0,
  counter_limit INTEGER NOT NULL DEFAULT 5,
  is_limited BOOLEAN NOT NULL DEFAULT TRUE,
  reset_frequency TEXT NOT NULL DEFAULT 'monthly', -- daily, weekly, monthly, never
  last_reset TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  next_reset TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, counter_name)
);

-- Skapa index för att göra sökningar snabbare
CREATE INDEX IF NOT EXISTS user_counters_user_id_idx ON public.user_counters (user_id);
CREATE INDEX IF NOT EXISTS user_counters_counter_name_idx ON public.user_counters (counter_name);

-- Lägg till automatic updates för uppdateringstidsstämpel
DROP TRIGGER IF EXISTS set_user_counters_updated_at ON public.user_counters;
CREATE TRIGGER set_user_counters_updated_at
BEFORE UPDATE ON public.user_counters
FOR EACH ROW
EXECUTE PROCEDURE public.moddatetime_update_timestamp();

-- Skapa RLS-policy för att begränsa åtkomst
ALTER TABLE public.user_counters ENABLE ROW LEVEL SECURITY;

-- Användare kan bara se sina egna räknare
CREATE POLICY "Användare kan läsa egna räknare" 
ON public.user_counters 
FOR SELECT 
USING (auth.uid() = user_id);

-- VIKTIGT: Ta bort direkt skrivåtkomst - all uppdatering sker via stored procedures
CREATE POLICY "Användare kan inte ändra räknare direkt"
ON public.user_counters
FOR UPDATE
USING (false);

CREATE POLICY "Användare kan inte ta bort räknare"
ON public.user_counters
FOR DELETE
USING (false);

CREATE POLICY "Användare kan inte skapa räknare direkt"
ON public.user_counters
FOR INSERT
USING (false);

-- Funktion för att beräkna nästa återställningstidpunkt
CREATE OR REPLACE FUNCTION calculate_next_reset(
  p_reset_frequency TEXT,
  p_reference_date TIMESTAMP WITH TIME ZONE DEFAULT NULL
)
RETURNS TIMESTAMP WITH TIME ZONE
LANGUAGE plpgsql
AS $$
DECLARE
  v_reference_date TIMESTAMP WITH TIME ZONE;
  v_next_reset TIMESTAMP WITH TIME ZONE;
BEGIN
  -- Använd angiven datum eller aktuell tidsstämpel
  v_reference_date := COALESCE(p_reference_date, NOW());
  
  -- Beräkna nästa återställningstidpunkt baserat på frekvens
  CASE 
    WHEN p_reset_frequency = 'daily' THEN
      v_next_reset := (DATE_TRUNC('day', v_reference_date) + INTERVAL '1 day')::TIMESTAMP WITH TIME ZONE;
      
    WHEN p_reset_frequency = 'weekly' THEN
      v_next_reset := (DATE_TRUNC('week', v_reference_date) + INTERVAL '1 week')::TIMESTAMP WITH TIME ZONE;
      
    WHEN p_reset_frequency = 'monthly' THEN
      v_next_reset := (DATE_TRUNC('month', v_reference_date) + INTERVAL '1 month')::TIMESTAMP WITH TIME ZONE;
      
    WHEN p_reset_frequency = 'never' THEN
      v_next_reset := NULL;
      
    ELSE
      -- Default till månatligt om ogiltigt värde anges
      v_next_reset := (DATE_TRUNC('month', v_reference_date) + INTERVAL '1 month')::TIMESTAMP WITH TIME ZONE;
  END CASE;
  
  RETURN v_next_reset;
END;
$$;

-- Funktion för att få räknarinformation
CREATE OR REPLACE FUNCTION get_counter(
  p_user_id UUID,
  p_counter_name TEXT
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_counter RECORD;
  v_now TIMESTAMP WITH TIME ZONE := NOW();
  v_should_reset BOOLEAN := FALSE;
BEGIN
  -- Försök hämta räknaren
  SELECT * 
  INTO v_counter
  FROM public.user_counters
  WHERE user_id = p_user_id AND counter_name = p_counter_name;
  
  -- Om räknaren inte finns, skapa den med standardvärden
  IF v_counter IS NULL THEN
    INSERT INTO public.user_counters (
      user_id, 
      counter_name, 
      counter_value,
      counter_limit,
      is_limited,
      reset_frequency,
      last_reset,
      next_reset
    ) VALUES (
      p_user_id,
      p_counter_name,
      0, -- Startvärde
      5, -- Standardgräns
      TRUE, -- Begränsad som standard
      'monthly', -- Standardfrekvens
      v_now,
      calculate_next_reset('monthly', v_now)
    )
    RETURNING * INTO v_counter;
  ELSE
    -- Kontrollera om räknaren behöver återställas
    IF v_counter.next_reset IS NOT NULL AND v_counter.next_reset <= v_now THEN
      v_should_reset := TRUE;
      
      UPDATE public.user_counters
      SET counter_value = 0,
          last_reset = v_now,
          next_reset = calculate_next_reset(reset_frequency, v_now)
      WHERE id = v_counter.id
      RETURNING * INTO v_counter;
    END IF;
  END IF;
  
  -- Returnera information om räknaren
  RETURN json_build_object(
    'counter_id', v_counter.id,
    'user_id', v_counter.user_id,
    'counter_name', v_counter.counter_name,
    'value', v_counter.counter_value,
    'limit', v_counter.counter_limit,
    'remaining', CASE 
                  WHEN v_counter.is_limited = TRUE THEN
                    GREATEST(0, v_counter.counter_limit - v_counter.counter_value)
                  ELSE
                    999999 -- Stort värde för "obegränsat"
                 END,
    'is_limited', v_counter.is_limited,
    'has_reached_limit', CASE 
                          WHEN v_counter.is_limited = TRUE THEN
                            v_counter.counter_value >= v_counter.counter_limit
                          ELSE
                            FALSE
                         END,
    'reset_frequency', v_counter.reset_frequency,
    'last_reset', v_counter.last_reset,
    'next_reset', v_counter.next_reset
  );
END;
$$;

-- Funktion för att öka räknare
CREATE OR REPLACE FUNCTION increment_counter(
  p_user_id UUID,
  p_counter_name TEXT,
  p_increment INTEGER DEFAULT 1
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_counter RECORD;
  v_now TIMESTAMP WITH TIME ZONE := NOW();
  v_current_value INTEGER;
BEGIN
  -- Först, hämta räknaren (och skapa den om den inte finns) med get_counter
  PERFORM get_counter(p_user_id, p_counter_name);
  
  -- Uppdatera counter_value
  UPDATE public.user_counters
  SET counter_value = counter_value + p_increment
  WHERE user_id = p_user_id AND counter_name = p_counter_name
  RETURNING * INTO v_counter;
  
  -- Returnera uppdaterad information
  RETURN json_build_object(
    'counter_id', v_counter.id,
    'user_id', v_counter.user_id,
    'counter_name', v_counter.counter_name,
    'value', v_counter.counter_value,
    'limit', v_counter.counter_limit,
    'remaining', CASE 
                  WHEN v_counter.is_limited = TRUE THEN
                    GREATEST(0, v_counter.counter_limit - v_counter.counter_value)
                  ELSE
                    999999 -- Stort värde för "obegränsat"
                 END,
    'is_limited', v_counter.is_limited,
    'has_reached_limit', CASE 
                          WHEN v_counter.is_limited = TRUE THEN
                            v_counter.counter_value >= v_counter.counter_limit
                          ELSE
                            FALSE
                         END,
    'reset_frequency', v_counter.reset_frequency,
    'last_reset', v_counter.last_reset,
    'next_reset', v_counter.next_reset
  );
END;
$$;

-- Skapa användardefinerade typer och standard räknare från en migrationsfunktion
CREATE OR REPLACE FUNCTION setup_standard_counters()
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_user RECORD;
BEGIN
  -- Skapa standardräknare för alla existerande användare
  FOR v_user IN SELECT id FROM auth.users
  LOOP
    -- Försök att migrera data från gammalt system om det finns
    BEGIN
      INSERT INTO public.user_counters (
        user_id,
        counter_name,
        counter_value,
        counter_limit,
        is_limited,
        reset_frequency,
        last_reset,
        next_reset
      )
      SELECT 
        v_user.id,
        'analysis_count',
        COALESCE((SELECT analyses_used FROM public.user_usage WHERE user_id = v_user.id), 0),
        COALESCE((SELECT analyses_limit FROM public.user_usage WHERE user_id = v_user.id), 5),
        TRUE,
        'monthly',
        COALESCE((SELECT last_reset FROM public.user_usage WHERE user_id = v_user.id), NOW()),
        calculate_next_reset('monthly', NOW())
      WHERE NOT EXISTS (
        SELECT 1 FROM public.user_counters 
        WHERE user_id = v_user.id AND counter_name = 'analysis_count'
      );
    EXCEPTION WHEN OTHERS THEN
      -- Om något går fel, skapa en ny standardräknare ändå
      IF NOT EXISTS (
        SELECT 1 FROM public.user_counters 
        WHERE user_id = v_user.id AND counter_name = 'analysis_count'
      ) THEN
        INSERT INTO public.user_counters (
          user_id,
          counter_name,
          counter_value,
          counter_limit,
          is_limited,
          reset_frequency,
          last_reset,
          next_reset
        ) VALUES (
          v_user.id,
          'analysis_count',
          0,
          5,
          TRUE,
          'monthly',
          NOW(),
          calculate_next_reset('monthly', NOW())
        );
      END IF;
    END;
  END LOOP;
END;
$$;

-- Anrop för att skapa standardräknare för alla användare
-- VIKTIGT: Detta anrop ska göras manuellt i SQL Editor efter att ha granskat skriptet
-- SELECT setup_standard_counters();

-- Kommentera bort följande om du vill ta bort den gamla tabellen efter migration
-- DROP TABLE IF EXISTS public.user_usage;