-- =============================================
-- Adicionar novas colunas de prazo à tabela contract_types
-- Executar manualmente no SQL Editor do banco externo
-- =============================================

ALTER TABLE public.contract_types ADD COLUMN IF NOT EXISTS prazo_liberacao_tecnica text NOT NULL DEFAULT '';
ALTER TABLE public.contract_types ADD COLUMN IF NOT EXISTS prazo_inicio_montagem text NOT NULL DEFAULT '';
ALTER TABLE public.contract_types ADD COLUMN IF NOT EXISTS prazo_assistencia_tecnica text NOT NULL DEFAULT '';
