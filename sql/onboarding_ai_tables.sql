-- ======================================================
-- TABELAS PARA IA DE ONBOARDING — OrçaMóvel PRO
-- Execute no Supabase SQL Editor
-- ======================================================

-- 1. Tabela de contexto/preferências do onboarding
CREATE TABLE IF NOT EXISTS public.onboarding_ai_context (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  store_type text,
  average_ticket text,
  region text,
  target_audience text,
  business_strategy jsonb DEFAULT '{}',
  onboarding_completed boolean DEFAULT false,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(tenant_id)
);

-- 2. Tabela de conversas da IA
CREATE TABLE IF NOT EXISTS public.onboarding_ai_conversations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  user_message text,
  ai_response text,
  created_at timestamptz DEFAULT now()
);

-- 3. Índices
CREATE INDEX IF NOT EXISTS idx_onboarding_ai_context_tenant ON public.onboarding_ai_context(tenant_id);
CREATE INDEX IF NOT EXISTS idx_onboarding_ai_conv_tenant ON public.onboarding_ai_conversations(tenant_id);
CREATE INDEX IF NOT EXISTS idx_onboarding_ai_conv_created ON public.onboarding_ai_conversations(created_at);

-- 4. RLS
ALTER TABLE public.onboarding_ai_context ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.onboarding_ai_conversations ENABLE ROW LEVEL SECURITY;

-- Policies para onboarding_ai_context
CREATE POLICY "tenant_read_own_context" ON public.onboarding_ai_context
  FOR SELECT TO authenticated
  USING (tenant_id = (
    SELECT u.tenant_id FROM public.usuarios u WHERE u.id = auth.uid()
  ));

CREATE POLICY "tenant_insert_own_context" ON public.onboarding_ai_context
  FOR INSERT TO authenticated
  WITH CHECK (tenant_id = (
    SELECT u.tenant_id FROM public.usuarios u WHERE u.id = auth.uid()
  ));

CREATE POLICY "tenant_update_own_context" ON public.onboarding_ai_context
  FOR UPDATE TO authenticated
  USING (tenant_id = (
    SELECT u.tenant_id FROM public.usuarios u WHERE u.id = auth.uid()
  ));

-- Policies para onboarding_ai_conversations
CREATE POLICY "tenant_read_own_conversations" ON public.onboarding_ai_conversations
  FOR SELECT TO authenticated
  USING (tenant_id = (
    SELECT u.tenant_id FROM public.usuarios u WHERE u.id = auth.uid()
  ));

CREATE POLICY "tenant_insert_own_conversations" ON public.onboarding_ai_conversations
  FOR INSERT TO authenticated
  WITH CHECK (tenant_id = (
    SELECT u.tenant_id FROM public.usuarios u WHERE u.id = auth.uid()
  ));

-- Service role full access (for edge functions)
CREATE POLICY "service_role_context" ON public.onboarding_ai_context
  FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY "service_role_conversations" ON public.onboarding_ai_conversations
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- 5. Grants
GRANT SELECT, INSERT, UPDATE ON public.onboarding_ai_context TO authenticated;
GRANT SELECT, INSERT ON public.onboarding_ai_conversations TO authenticated;
GRANT ALL ON public.onboarding_ai_context TO service_role;
GRANT ALL ON public.onboarding_ai_conversations TO service_role;

-- 6. Trigger para updated_at
CREATE OR REPLACE FUNCTION public.update_onboarding_ai_context_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_onboarding_ai_context_updated_at ON public.onboarding_ai_context;
CREATE TRIGGER trigger_onboarding_ai_context_updated_at
  BEFORE UPDATE ON public.onboarding_ai_context
  FOR EACH ROW EXECUTE FUNCTION public.update_onboarding_ai_context_updated_at();
