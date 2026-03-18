
ALTER TABLE public.company_settings
ADD COLUMN IF NOT EXISTS cnpj_loja text,
ADD COLUMN IF NOT EXISTS endereco_loja text,
ADD COLUMN IF NOT EXISTS bairro_loja text,
ADD COLUMN IF NOT EXISTS cidade_loja text,
ADD COLUMN IF NOT EXISTS uf_loja text,
ADD COLUMN IF NOT EXISTS cep_loja text;
