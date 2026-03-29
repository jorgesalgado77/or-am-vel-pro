CREATE TABLE IF NOT EXISTS public.vendazap_copys (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  tipo text NOT NULL DEFAULT 'ia_gerada',
  label text NOT NULL DEFAULT 'Copy IA',
  mensagem text NOT NULL,
  is_ai boolean DEFAULT true,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_vendazap_copys_tenant ON public.vendazap_copys(tenant_id);

ALTER TABLE public.vendazap_copys ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tenant_read_copys" ON public.vendazap_copys
  FOR SELECT TO authenticated
  USING (tenant_id = (SELECT u.tenant_id FROM public.usuarios u WHERE u.id = auth.uid()));

CREATE POLICY "tenant_insert_copys" ON public.vendazap_copys
  FOR INSERT TO authenticated
  WITH CHECK (tenant_id = (SELECT u.tenant_id FROM public.usuarios u WHERE u.id = auth.uid()));

CREATE POLICY "tenant_delete_copys" ON public.vendazap_copys
  FOR DELETE TO authenticated
  USING (tenant_id = (SELECT u.tenant_id FROM public.usuarios u WHERE u.id = auth.uid()));

CREATE POLICY "service_role_all_copys" ON public.vendazap_copys
  FOR ALL TO service_role
  USING (true) WITH CHECK (true);
