ALTER TABLE public.company_settings ADD COLUMN IF NOT EXISTS telefone_loja text DEFAULT NULL;
ALTER TABLE public.company_settings ADD COLUMN IF NOT EXISTS email_loja text DEFAULT NULL;