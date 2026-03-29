-- =============================================
-- IA AUTO-APRENDIZADO — OrçaMóvel PRO
-- Executar manualmente no Supabase externo
-- =============================================

-- 1. Eventos de aprendizado
CREATE TABLE IF NOT EXISTS public.ai_learning_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  client_id UUID REFERENCES public.clients(id) ON DELETE SET NULL,
  tracking_id TEXT,
  event_type TEXT NOT NULL CHECK (event_type IN (
    'message_sent', 'proposal_sent', 'discount_applied',
    'deal_closed', 'deal_lost', 'trigger_fired',
    'dealroom_opened', 'followup_sent', 'reactivation_sent'
  )),
  strategy_used TEXT CHECK (strategy_used IN (
    'urgencia', 'valor', 'prova_social', 'escassez',
    'reciprocidade', 'autoridade', 'empatia', 'desconto',
    'parcelamento', 'dealroom', 'reativacao', 'consultiva', 'outro'
  )),
  message_content TEXT,
  price_offered NUMERIC,
  cost NUMERIC,
  discount_percentage NUMERIC DEFAULT 0,
  response_time_seconds INTEGER,
  client_response TEXT CHECK (client_response IN ('positivo', 'negativo', 'neutro', 'sem_resposta')),
  deal_result TEXT CHECK (deal_result IN ('ganho', 'perdido', 'abandonado')),
  disc_profile TEXT,
  lead_temperature TEXT,
  closing_probability INTEGER,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 2. Padrões aprendidos (cache de análises)
CREATE TABLE IF NOT EXISTS public.ai_learned_patterns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  pattern_type TEXT NOT NULL CHECK (pattern_type IN (
    'strategy_conversion', 'discount_sweet_spot', 'best_timing',
    'vendor_performance', 'temperature_conversion', 'disc_strategy'
  )),
  pattern_key TEXT NOT NULL,
  pattern_data JSONB NOT NULL DEFAULT '{}'::jsonb,
  sample_size INTEGER DEFAULT 0,
  confidence NUMERIC DEFAULT 0,
  period_start DATE,
  period_end DATE,
  updated_at TIMESTAMPTZ DEFAULT now(),
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE (tenant_id, user_id, pattern_type, pattern_key)
);

-- Índices
CREATE INDEX IF NOT EXISTS idx_learning_events_tenant ON public.ai_learning_events(tenant_id);
CREATE INDEX IF NOT EXISTS idx_learning_events_user ON public.ai_learning_events(tenant_id, user_id);
CREATE INDEX IF NOT EXISTS idx_learning_events_client ON public.ai_learning_events(tenant_id, client_id);
CREATE INDEX IF NOT EXISTS idx_learning_events_type ON public.ai_learning_events(tenant_id, event_type);
CREATE INDEX IF NOT EXISTS idx_learning_events_strategy ON public.ai_learning_events(tenant_id, strategy_used);
CREATE INDEX IF NOT EXISTS idx_learning_events_result ON public.ai_learning_events(tenant_id, deal_result);
CREATE INDEX IF NOT EXISTS idx_learning_events_created ON public.ai_learning_events(created_at);
CREATE INDEX IF NOT EXISTS idx_learned_patterns_tenant ON public.ai_learned_patterns(tenant_id);
CREATE INDEX IF NOT EXISTS idx_learned_patterns_type ON public.ai_learned_patterns(tenant_id, pattern_type);

-- RLS
ALTER TABLE public.ai_learning_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_learned_patterns ENABLE ROW LEVEL SECURITY;

-- ai_learning_events RLS
CREATE POLICY "learning_events_select" ON public.ai_learning_events FOR SELECT TO authenticated
  USING (tenant_id IN (SELECT tenant_id FROM public.usuarios WHERE id = auth.uid()));
CREATE POLICY "learning_events_insert" ON public.ai_learning_events FOR INSERT TO authenticated
  WITH CHECK (tenant_id IN (SELECT tenant_id FROM public.usuarios WHERE id = auth.uid()));

-- ai_learned_patterns RLS
CREATE POLICY "learned_patterns_select" ON public.ai_learned_patterns FOR SELECT TO authenticated
  USING (tenant_id IN (SELECT tenant_id FROM public.usuarios WHERE id = auth.uid()));
CREATE POLICY "learned_patterns_insert" ON public.ai_learned_patterns FOR INSERT TO authenticated
  WITH CHECK (tenant_id IN (SELECT tenant_id FROM public.usuarios WHERE id = auth.uid()));
CREATE POLICY "learned_patterns_update" ON public.ai_learned_patterns FOR UPDATE TO authenticated
  USING (tenant_id IN (SELECT tenant_id FROM public.usuarios WHERE id = auth.uid()));

-- Grants
GRANT SELECT, INSERT ON public.ai_learning_events TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.ai_learned_patterns TO authenticated;
