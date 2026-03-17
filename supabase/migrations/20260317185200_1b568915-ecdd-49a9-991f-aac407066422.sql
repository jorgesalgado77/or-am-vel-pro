
-- Add new columns for boleto financing: taxa_fixa, coeficiente_60, coeficiente_90
-- The existing 'coefficient' column will serve as coeficiente_30 for boleto
ALTER TABLE public.financing_rates ADD COLUMN taxa_fixa numeric NOT NULL DEFAULT 0;
ALTER TABLE public.financing_rates ADD COLUMN coeficiente_60 numeric NOT NULL DEFAULT 0;
ALTER TABLE public.financing_rates ADD COLUMN coeficiente_90 numeric NOT NULL DEFAULT 0;
