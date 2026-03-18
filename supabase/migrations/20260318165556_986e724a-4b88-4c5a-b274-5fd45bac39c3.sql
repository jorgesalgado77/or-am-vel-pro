
ALTER TABLE public.usuarios ADD COLUMN IF NOT EXISTS tipo_regime text DEFAULT NULL;
ALTER TABLE public.usuarios ADD COLUMN IF NOT EXISTS comissao_percentual numeric DEFAULT 0;
ALTER TABLE public.usuarios ADD COLUMN IF NOT EXISTS salario_fixo numeric DEFAULT 0;
