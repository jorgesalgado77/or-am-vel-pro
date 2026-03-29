-- =============================================
-- NOVAS COLUNAS — products table
-- Executar manualmente no Supabase externo
-- =============================================

ALTER TABLE public.products ADD COLUMN IF NOT EXISTS min_sale_price NUMERIC(12,2) DEFAULT 0;
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS manufacturer_code TEXT DEFAULT '';
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS environment TEXT DEFAULT '';
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS environment_custom TEXT DEFAULT '';

-- Adicionar campos extras na tabela suppliers (consolidação com fornecedor decorados)
ALTER TABLE public.suppliers ADD COLUMN IF NOT EXISTS razao_social TEXT DEFAULT '';
ALTER TABLE public.suppliers ADD COLUMN IF NOT EXISTS cnpj TEXT DEFAULT '';
ALTER TABLE public.suppliers ADD COLUMN IF NOT EXISTS endereco TEXT DEFAULT '';
ALTER TABLE public.suppliers ADD COLUMN IF NOT EXISTS bairro TEXT DEFAULT '';
ALTER TABLE public.suppliers ADD COLUMN IF NOT EXISTS cidade TEXT DEFAULT '';
ALTER TABLE public.suppliers ADD COLUMN IF NOT EXISTS uf TEXT DEFAULT '';
ALTER TABLE public.suppliers ADD COLUMN IF NOT EXISTS cep TEXT DEFAULT '';
ALTER TABLE public.suppliers ADD COLUMN IF NOT EXISTS observacoes TEXT DEFAULT '';
