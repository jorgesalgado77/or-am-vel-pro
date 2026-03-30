-- ============================================================
-- HISTÓRICO DE AGENDAMENTOS DE MEDIÇÃO
-- Execute este SQL no Supabase externo (SQL Editor)
-- ============================================================

CREATE TABLE IF NOT EXISTS public.measurement_schedule_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  client_id uuid NOT NULL,
  date text NOT NULL,         -- YYYY-MM-DD
  time text NOT NULL,         -- HH:mm
  observations text DEFAULT '',
  reason text,                -- motivo do reagendamento (null no primeiro agendamento)
  created_by text NOT NULL,
  created_at timestamptz DEFAULT now()
);

-- Índices
CREATE INDEX IF NOT EXISTS idx_msh_tenant_client
  ON public.measurement_schedule_history (tenant_id, client_id);

CREATE INDEX IF NOT EXISTS idx_msh_date
  ON public.measurement_schedule_history (date);

-- RLS
ALTER TABLE public.measurement_schedule_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Tenant isolation" ON public.measurement_schedule_history
  FOR ALL TO authenticated
  USING (tenant_id::text = ((current_setting('request.jwt.claims'::text, true))::json ->> 'tenant_id'))
  WITH CHECK (tenant_id::text = ((current_setting('request.jwt.claims'::text, true))::json ->> 'tenant_id'));

-- Grants
GRANT SELECT, INSERT, UPDATE, DELETE ON public.measurement_schedule_history TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.measurement_schedule_history TO anon;
