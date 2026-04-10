-- Contract Types table for admin-configured contract type options
CREATE TABLE IF NOT EXISTS public.contract_types (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  nome text NOT NULL,
  prazo_entrega text NOT NULL DEFAULT '',
  ativo boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.contract_types ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Tenant users can view contract_types"
  ON public.contract_types FOR SELECT
  TO authenticated
  USING (tenant_id IN (
    SELECT tp.tenant_id FROM public.tenant_profiles tp WHERE tp.id = auth.uid()
  ));

CREATE POLICY "Tenant users can insert contract_types"
  ON public.contract_types FOR INSERT
  TO authenticated
  WITH CHECK (tenant_id IN (
    SELECT tp.tenant_id FROM public.tenant_profiles tp WHERE tp.id = auth.uid()
  ));

CREATE POLICY "Tenant users can update contract_types"
  ON public.contract_types FOR UPDATE
  TO authenticated
  USING (tenant_id IN (
    SELECT tp.tenant_id FROM public.tenant_profiles tp WHERE tp.id = auth.uid()
  ));

CREATE POLICY "Tenant users can delete contract_types"
  ON public.contract_types FOR DELETE
  TO authenticated
  USING (tenant_id IN (
    SELECT tp.tenant_id FROM public.tenant_profiles tp WHERE tp.id = auth.uid()
  ));
