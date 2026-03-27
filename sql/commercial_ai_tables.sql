-- =============================================
-- IA GERENTE COMERCIAL — OrçaMóvel PRO
-- Executar manualmente no Supabase externo
-- =============================================

-- 1. Métricas de vendas
CREATE TABLE IF NOT EXISTS public.sales_metrics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  leads_count INTEGER DEFAULT 0,
  proposals_sent INTEGER DEFAULT 0,
  deals_closed INTEGER DEFAULT 0,
  conversion_rate NUMERIC DEFAULT 0,
  revenue NUMERIC DEFAULT 0,
  average_ticket NUMERIC DEFAULT 0,
  avg_close_days NUMERIC DEFAULT 0,
  response_rate NUMERIC DEFAULT 0,
  period TEXT NOT NULL CHECK (period IN ('daily','weekly','monthly')),
  period_date DATE NOT NULL DEFAULT CURRENT_DATE,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 2. Insights da IA
CREATE TABLE IF NOT EXISTS public.ai_insights (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  type TEXT NOT NULL CHECK (type IN ('alert','suggestion','warning','praise')),
  message TEXT NOT NULL,
  priority TEXT NOT NULL CHECK (priority IN ('low','medium','high')),
  is_read BOOLEAN DEFAULT false,
  action_type TEXT, -- 'send_message', 'offer_discount', 'follow_up', 'change_approach'
  action_data JSONB,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 3. Ranking / Gamificação
CREATE TABLE IF NOT EXISTS public.sales_rankings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  period TEXT NOT NULL CHECK (period IN ('weekly','monthly')),
  period_date DATE NOT NULL DEFAULT CURRENT_DATE,
  score INTEGER DEFAULT 0,
  deals_closed INTEGER DEFAULT 0,
  revenue NUMERIC DEFAULT 0,
  badges JSONB DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE (tenant_id, user_id, period, period_date)
);

-- Índices
CREATE INDEX IF NOT EXISTS idx_sales_metrics_tenant ON public.sales_metrics(tenant_id);
CREATE INDEX IF NOT EXISTS idx_sales_metrics_user ON public.sales_metrics(tenant_id, user_id);
CREATE INDEX IF NOT EXISTS idx_sales_metrics_period ON public.sales_metrics(tenant_id, period, period_date);
CREATE INDEX IF NOT EXISTS idx_ai_insights_tenant ON public.ai_insights(tenant_id);
CREATE INDEX IF NOT EXISTS idx_ai_insights_user ON public.ai_insights(tenant_id, user_id);
CREATE INDEX IF NOT EXISTS idx_ai_insights_unread ON public.ai_insights(tenant_id, is_read);
CREATE INDEX IF NOT EXISTS idx_sales_rankings_tenant ON public.sales_rankings(tenant_id, period, period_date);

-- RLS
ALTER TABLE public.sales_metrics ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_insights ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sales_rankings ENABLE ROW LEVEL SECURITY;

-- sales_metrics RLS
CREATE POLICY "sales_metrics_select" ON public.sales_metrics FOR SELECT TO authenticated
  USING (tenant_id IN (SELECT tenant_id FROM public.usuarios WHERE id = auth.uid()));
CREATE POLICY "sales_metrics_insert" ON public.sales_metrics FOR INSERT TO authenticated
  WITH CHECK (tenant_id IN (SELECT tenant_id FROM public.usuarios WHERE id = auth.uid()));
CREATE POLICY "sales_metrics_update" ON public.sales_metrics FOR UPDATE TO authenticated
  USING (tenant_id IN (SELECT tenant_id FROM public.usuarios WHERE id = auth.uid()));

-- ai_insights RLS
CREATE POLICY "ai_insights_select" ON public.ai_insights FOR SELECT TO authenticated
  USING (tenant_id IN (SELECT tenant_id FROM public.usuarios WHERE id = auth.uid()));
CREATE POLICY "ai_insights_insert" ON public.ai_insights FOR INSERT TO authenticated
  WITH CHECK (tenant_id IN (SELECT tenant_id FROM public.usuarios WHERE id = auth.uid()));
CREATE POLICY "ai_insights_update" ON public.ai_insights FOR UPDATE TO authenticated
  USING (tenant_id IN (SELECT tenant_id FROM public.usuarios WHERE id = auth.uid()));

-- sales_rankings RLS
CREATE POLICY "sales_rankings_select" ON public.sales_rankings FOR SELECT TO authenticated
  USING (tenant_id IN (SELECT tenant_id FROM public.usuarios WHERE id = auth.uid()));
CREATE POLICY "sales_rankings_insert" ON public.sales_rankings FOR INSERT TO authenticated
  WITH CHECK (tenant_id IN (SELECT tenant_id FROM public.usuarios WHERE id = auth.uid()));
CREATE POLICY "sales_rankings_update" ON public.sales_rankings FOR UPDATE TO authenticated
  USING (tenant_id IN (SELECT tenant_id FROM public.usuarios WHERE id = auth.uid()));

-- Grants
GRANT SELECT, INSERT, UPDATE ON public.sales_metrics TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.ai_insights TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.sales_rankings TO authenticated;
