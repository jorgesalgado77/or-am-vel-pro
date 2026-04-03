-- Tech field templates: reusable presets for batch-filling environment technical data
-- Run this SQL in your Supabase SQL Editor to create the table

CREATE TABLE IF NOT EXISTS public.tech_field_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  name text NOT NULL,
  corpo text NOT NULL DEFAULT '',
  porta text NOT NULL DEFAULT '',
  puxador text NOT NULL DEFAULT '',
  complemento text NOT NULL DEFAULT '',
  modelo text NOT NULL DEFAULT '',
  fornecedor text NOT NULL DEFAULT '',
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_tech_field_templates_tenant ON public.tech_field_templates(tenant_id);

ALTER TABLE public.tech_field_templates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own tenant templates"
  ON public.tech_field_templates FOR SELECT TO authenticated
  USING (tenant_id = get_my_tenant_id_secure());

CREATE POLICY "Users can create templates"
  ON public.tech_field_templates FOR INSERT TO authenticated
  WITH CHECK (tenant_id = get_my_tenant_id_secure());

CREATE POLICY "Users can delete own tenant templates"
  ON public.tech_field_templates FOR DELETE TO authenticated
  USING (tenant_id = get_my_tenant_id_secure());

CREATE POLICY "Users can update own tenant templates"
  ON public.tech_field_templates FOR UPDATE TO authenticated
  USING (tenant_id = get_my_tenant_id_secure())
  WITH CHECK (tenant_id = get_my_tenant_id_secure());
