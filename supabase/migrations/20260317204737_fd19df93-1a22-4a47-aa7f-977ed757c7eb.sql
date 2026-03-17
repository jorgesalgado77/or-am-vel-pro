
-- Add orçamento number to clients
ALTER TABLE public.clients ADD COLUMN numero_orcamento text DEFAULT NULL;
ALTER TABLE public.clients ADD COLUMN numero_orcamento_seq bigint DEFAULT NULL;

-- Add sequence start setting to company_settings
ALTER TABLE public.company_settings ADD COLUMN orcamento_numero_inicial bigint NOT NULL DEFAULT 1;

-- Function to get next orçamento number
CREATE OR REPLACE FUNCTION public.get_next_orcamento_number()
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  next_seq bigint;
  inicio bigint;
  formatted text;
BEGIN
  -- Get the max sequence used
  SELECT COALESCE(MAX(numero_orcamento_seq), 0) INTO next_seq FROM public.clients;
  
  -- If no records yet, use the configured start number
  IF next_seq = 0 THEN
    SELECT COALESCE(orcamento_numero_inicial, 1) INTO inicio 
    FROM public.company_settings LIMIT 1;
    next_seq := inicio;
  ELSE
    next_seq := next_seq + 1;
  END IF;
  
  -- Format as 999.999.999
  formatted := LPAD(next_seq::text, 9, '0');
  formatted := SUBSTR(formatted, 1, 3) || '.' || SUBSTR(formatted, 4, 3) || '.' || SUBSTR(formatted, 7, 3);
  
  RETURN formatted;
END;
$$;
