
ALTER TABLE public.usuarios ADD COLUMN IF NOT EXISTS senha text DEFAULT null;
ALTER TABLE public.usuarios ADD COLUMN IF NOT EXISTS primeiro_login boolean NOT NULL DEFAULT true;
ALTER TABLE public.company_settings ADD COLUMN IF NOT EXISTS codigo_loja text DEFAULT null;
