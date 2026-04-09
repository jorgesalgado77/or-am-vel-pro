-- =============================================
-- Tabela de Promoções de Produtos
-- Executar manualmente no SQL Editor do banco
-- =============================================

CREATE TABLE IF NOT EXISTS public.product_promotions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  product_id UUID NOT NULL,
  desconto_percentual NUMERIC(5,2) NOT NULL DEFAULT 0,
  valor_original NUMERIC(12,2) NOT NULL,
  valor_promocional NUMERIC(12,2) NOT NULL,
  validade TIMESTAMPTZ NOT NULL,
  condicoes_pagamento TEXT[] NOT NULL DEFAULT '{}',
  -- JSON with selected providers/installments for credit and boleto
  credito_config JSONB DEFAULT '[]',
  boleto_config JSONB DEFAULT '[]',
  ativo BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.product_promotions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Tenant isolation for product_promotions"
  ON public.product_promotions
  FOR ALL
  TO authenticated
  USING (tenant_id IN (SELECT id FROM public.tenants))
  WITH CHECK (tenant_id IN (SELECT id FROM public.tenants));

-- Auto-deactivate expired promotions (can be called by cron or on-read)
CREATE OR REPLACE FUNCTION public.deactivate_expired_promotions()
RETURNS void
LANGUAGE sql
AS $$
  UPDATE public.product_promotions
  SET ativo = false
  WHERE validade < now() AND ativo = true;
$$;
