
CREATE TABLE public.audit_logs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  acao TEXT NOT NULL,
  entidade TEXT NOT NULL,
  entidade_id TEXT,
  usuario_id TEXT,
  usuario_nome TEXT,
  detalhes JSONB DEFAULT '{}'::jsonb,
  ip_address TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Index for fast querying by entity and date
CREATE INDEX idx_audit_logs_entidade ON public.audit_logs (entidade, created_at DESC);
CREATE INDEX idx_audit_logs_usuario ON public.audit_logs (usuario_id, created_at DESC);

-- RLS: allow all (matches existing pattern)
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all on audit_logs" ON public.audit_logs FOR ALL TO public USING (true) WITH CHECK (true);
