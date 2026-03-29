-- =============================================
-- TABELA DE HISTÓRICO DE EMAILS — OrçaMóvel PRO
-- Executar manualmente no Supabase externo
-- =============================================

CREATE TABLE IF NOT EXISTS public.mia_email_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  to_email TEXT NOT NULL,
  cc_email TEXT,
  subject TEXT NOT NULL DEFAULT '',
  body_html TEXT,
  body_text TEXT,
  resend_id TEXT,
  status TEXT NOT NULL DEFAULT 'sent' CHECK (status IN ('pending','sent','failed')),
  sent_by UUID,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Índices
CREATE INDEX IF NOT EXISTS idx_mia_email_history_tenant ON public.mia_email_history(tenant_id);
CREATE INDEX IF NOT EXISTS idx_mia_email_history_created ON public.mia_email_history(tenant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_mia_email_history_status ON public.mia_email_history(tenant_id, status);

-- RLS
ALTER TABLE public.mia_email_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "mia_email_history_select" ON public.mia_email_history FOR SELECT TO authenticated
  USING (tenant_id IN (SELECT tenant_id FROM public.usuarios WHERE id = auth.uid()));
CREATE POLICY "mia_email_history_insert" ON public.mia_email_history FOR INSERT TO authenticated
  WITH CHECK (tenant_id IN (SELECT tenant_id FROM public.usuarios WHERE id = auth.uid()));

-- Grants
GRANT SELECT, INSERT ON public.mia_email_history TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.mia_email_history TO service_role;
