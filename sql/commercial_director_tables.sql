-- =============================================
-- IA DIRETORA COMERCIAL — OrçaMóvel PRO
-- Executar manualmente no Supabase externo
-- =============================================

-- 1. Performance de vendas por vendedor
CREATE TABLE IF NOT EXISTS public.sales_performance (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  user_name TEXT,
  period TEXT NOT NULL CHECK (period IN ('daily','weekly','monthly')),
  period_date DATE NOT NULL DEFAULT CURRENT_DATE,
  total_vendas INTEGER DEFAULT 0,
  leads_atendidos INTEGER DEFAULT 0,
  propostas_enviadas INTEGER DEFAULT 0,
  taxa_conversao NUMERIC DEFAULT 0,
  ticket_medio NUMERIC DEFAULT 0,
  revenue NUMERIC DEFAULT 0,
  tempo_medio_resposta_min NUMERIC DEFAULT 0,
  leads_perdidos INTEGER DEFAULT 0,
  score INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE (tenant_id, user_id, period, period_date)
);

-- 2. Previsão de faturamento
CREATE TABLE IF NOT EXISTS public.revenue_forecast (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  month TEXT NOT NULL, -- 'YYYY-MM'
  pipeline_value NUMERIC DEFAULT 0,
  pipeline_count INTEGER DEFAULT 0,
  conversion_rate NUMERIC DEFAULT 0,
  previsao_otimista NUMERIC DEFAULT 0,
  previsao_realista NUMERIC DEFAULT 0,
  previsao_pessimista NUMERIC DEFAULT 0,
  meta_loja NUMERIC DEFAULT 0,
  risco TEXT CHECK (risco IN ('baixo','medio','alto','critico')),
  confianca NUMERIC DEFAULT 0, -- 0-100
  insights JSONB DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE (tenant_id, month)
);

-- Índices
CREATE INDEX IF NOT EXISTS idx_sales_performance_tenant ON public.sales_performance(tenant_id);
CREATE INDEX IF NOT EXISTS idx_sales_performance_user ON public.sales_performance(tenant_id, user_id);
CREATE INDEX IF NOT EXISTS idx_sales_performance_period ON public.sales_performance(tenant_id, period, period_date);
CREATE INDEX IF NOT EXISTS idx_revenue_forecast_tenant ON public.revenue_forecast(tenant_id);
CREATE INDEX IF NOT EXISTS idx_revenue_forecast_month ON public.revenue_forecast(tenant_id, month);

-- RLS
ALTER TABLE public.sales_performance ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.revenue_forecast ENABLE ROW LEVEL SECURITY;

-- sales_performance RLS
CREATE POLICY "sales_performance_select" ON public.sales_performance FOR SELECT TO authenticated
  USING (tenant_id IN (SELECT tenant_id FROM public.usuarios WHERE id = auth.uid()));
CREATE POLICY "sales_performance_insert" ON public.sales_performance FOR INSERT TO authenticated
  WITH CHECK (tenant_id IN (SELECT tenant_id FROM public.usuarios WHERE id = auth.uid()));
CREATE POLICY "sales_performance_update" ON public.sales_performance FOR UPDATE TO authenticated
  USING (tenant_id IN (SELECT tenant_id FROM public.usuarios WHERE id = auth.uid()));

-- revenue_forecast RLS
CREATE POLICY "revenue_forecast_select" ON public.revenue_forecast FOR SELECT TO authenticated
  USING (tenant_id IN (SELECT tenant_id FROM public.usuarios WHERE id = auth.uid()));
CREATE POLICY "revenue_forecast_insert" ON public.revenue_forecast FOR INSERT TO authenticated
  WITH CHECK (tenant_id IN (SELECT tenant_id FROM public.usuarios WHERE id = auth.uid()));
CREATE POLICY "revenue_forecast_update" ON public.revenue_forecast FOR UPDATE TO authenticated
  USING (tenant_id IN (SELECT tenant_id FROM public.usuarios WHERE id = auth.uid()));

-- Grants
GRANT SELECT, INSERT, UPDATE ON public.sales_performance TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.revenue_forecast TO authenticated;

-- Trigger updated_at
CREATE OR REPLACE FUNCTION public.set_updated_at() RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_sales_performance_updated ON public.sales_performance;
CREATE TRIGGER trg_sales_performance_updated BEFORE UPDATE ON public.sales_performance
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS trg_revenue_forecast_updated ON public.revenue_forecast;
CREATE TRIGGER trg_revenue_forecast_updated BEFORE UPDATE ON public.revenue_forecast
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
