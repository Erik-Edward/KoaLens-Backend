-- Uppdatera standardgränsen för analyser från 5 till 15

-- 1. Uppdatera alla befintliga räknare med gränsen 5 till 15
UPDATE public.user_counters 
SET counter_limit = 15 
WHERE counter_name = 'analysis_count' AND counter_limit = 5;

-- 2. Uppdatera standardvärdet för räknare i get_counter funktionen
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
      15, -- Ändrat från 5 till 15
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

-- 3. Uppdatera standardvärdet i setup_standard_counters funktionen
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
        COALESCE((SELECT analyses_limit FROM public.user_usage WHERE user_id = v_user.id), 15), -- Ändrat från 5 till 15
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
          15, -- Ändrat från 5 till 15
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