-- ============================================================
-- HISTÓRICO DE MOVIMENTAÇÕES DO KANBAN
-- Execute este SQL no Supabase externo (SQL Editor)
-- ============================================================

CREATE TABLE IF NOT EXISTS public.client_movements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id text NOT NULL,
  client_id uuid NOT NULL,
  from_column text,
  to_column text NOT NULL,
  moved_by text,
  moved_at timestamptz DEFAULT now(),
  created_at timestamptz DEFAULT now()
);

ALTER TABLE public.client_movements ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Tenant isolation for client_movements"
  ON public.client_movements FOR ALL TO authenticated
  USING (tenant_id = (SELECT public.get_my_tenant_id()));

CREATE INDEX IF NOT EXISTS idx_client_movements_client
  ON public.client_movements (client_id, moved_at DESC);

CREATE INDEX IF NOT EXISTS idx_client_movements_tenant
  ON public.client_movements (tenant_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.client_movements TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.client_movements TO anon;
