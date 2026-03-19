
-- ===========================================================================
-- FASE 1A: Adicionar tenant_id às tabelas que faltam para isolamento total
-- ===========================================================================

-- 1. Adicionar tenant_id às tabelas que não têm
ALTER TABLE public.usuarios ADD COLUMN IF NOT EXISTS tenant_id uuid REFERENCES public.tenants(id);
ALTER TABLE public.cargos ADD COLUMN IF NOT EXISTS tenant_id uuid REFERENCES public.tenants(id);
ALTER TABLE public.clients ADD COLUMN IF NOT EXISTS tenant_id uuid REFERENCES public.tenants(id);
ALTER TABLE public.simulations ADD COLUMN IF NOT EXISTS tenant_id uuid REFERENCES public.tenants(id);
ALTER TABLE public.client_contracts ADD COLUMN IF NOT EXISTS tenant_id uuid REFERENCES public.tenants(id);
ALTER TABLE public.client_tracking ADD COLUMN IF NOT EXISTS tenant_id uuid REFERENCES public.tenants(id);
ALTER TABLE public.tracking_messages ADD COLUMN IF NOT EXISTS tenant_id uuid REFERENCES public.tenants(id);
ALTER TABLE public.contract_templates ADD COLUMN IF NOT EXISTS tenant_id uuid REFERENCES public.tenants(id);
ALTER TABLE public.financing_rates ADD COLUMN IF NOT EXISTS tenant_id uuid REFERENCES public.tenants(id);
ALTER TABLE public.discount_options ADD COLUMN IF NOT EXISTS tenant_id uuid REFERENCES public.tenants(id);
ALTER TABLE public.indicadores ADD COLUMN IF NOT EXISTS tenant_id uuid REFERENCES public.tenants(id);
ALTER TABLE public.payroll_commissions ADD COLUMN IF NOT EXISTS tenant_id uuid REFERENCES public.tenants(id);
ALTER TABLE public.audit_logs ADD COLUMN IF NOT EXISTS tenant_id uuid REFERENCES public.tenants(id);
ALTER TABLE public.whatsapp_settings ADD COLUMN IF NOT EXISTS tenant_id uuid REFERENCES public.tenants(id);
ALTER TABLE public.support_tickets ADD COLUMN IF NOT EXISTS tenant_id uuid REFERENCES public.tenants(id);

-- 2. Criar índices para performance nas consultas filtradas por tenant
CREATE INDEX IF NOT EXISTS idx_usuarios_tenant ON public.usuarios(tenant_id);
CREATE INDEX IF NOT EXISTS idx_clients_tenant ON public.clients(tenant_id);
CREATE INDEX IF NOT EXISTS idx_simulations_tenant ON public.simulations(tenant_id);
CREATE INDEX IF NOT EXISTS idx_cargos_tenant ON public.cargos(tenant_id);
CREATE INDEX IF NOT EXISTS idx_client_contracts_tenant ON public.client_contracts(tenant_id);
CREATE INDEX IF NOT EXISTS idx_client_tracking_tenant ON public.client_tracking(tenant_id);
CREATE INDEX IF NOT EXISTS idx_indicadores_tenant ON public.indicadores(tenant_id);
CREATE INDEX IF NOT EXISTS idx_payroll_commissions_tenant ON public.payroll_commissions(tenant_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_tenant ON public.audit_logs(tenant_id);

-- 3. Adicionar auth_user_id para futuro link com Supabase Auth
ALTER TABLE public.usuarios ADD COLUMN IF NOT EXISTS auth_user_id uuid;
CREATE UNIQUE INDEX IF NOT EXISTS idx_usuarios_auth_user ON public.usuarios(auth_user_id) WHERE auth_user_id IS NOT NULL;
