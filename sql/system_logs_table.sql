-- system_logs table for centralized diagnostics
-- Run this on your external Supabase project

CREATE TABLE IF NOT EXISTS public.system_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid REFERENCES public.tenants(id) ON DELETE CASCADE,
  user_id uuid,
  event_type text NOT NULL CHECK (event_type IN ('login', 'error', 'ai_interaction', 'performance', 'security', 'integration')),
  source text NOT NULL DEFAULT '',
  message text NOT NULL DEFAULT '',
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Index for fast tenant + time queries
CREATE INDEX IF NOT EXISTS idx_system_logs_tenant_created
  ON public.system_logs (tenant_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_system_logs_event_type
  ON public.system_logs (event_type);

-- RLS
ALTER TABLE public.system_logs ENABLE ROW LEVEL SECURITY;

-- Tenant isolation: users can only see their own tenant's logs
CREATE POLICY "Tenant isolation for system_logs"
  ON public.system_logs
  FOR SELECT
  TO authenticated
  USING (tenant_id = public.get_my_tenant_id());

-- Insert: authenticated users can insert logs for their tenant
CREATE POLICY "Insert own tenant system_logs"
  ON public.system_logs
  FOR INSERT
  TO authenticated
  WITH CHECK (tenant_id = public.get_my_tenant_id() OR tenant_id IS NULL);

-- Anon insert for pre-auth events (login diagnostics)
CREATE POLICY "Anon insert system_logs"
  ON public.system_logs
  FOR INSERT
  TO anon
  WITH CHECK (true);

-- Auto-cleanup: keep only last 90 days (run as cron or manual)
-- DELETE FROM public.system_logs WHERE created_at < now() - interval '90 days';
