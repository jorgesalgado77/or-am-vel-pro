-- ================================================
-- FASE 1B: Supabase Auth Integration + RLS
-- ================================================

-- 1. Security definer function to get tenant_id from auth user
CREATE OR REPLACE FUNCTION public.get_user_tenant_id(p_auth_user_id uuid)
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT tenant_id FROM public.usuarios WHERE auth_user_id = p_auth_user_id LIMIT 1;
$$;

-- 2. Trigger: auto-create usuario entry when auth.users signs up
CREATE OR REPLACE FUNCTION public.handle_new_auth_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tenant_id uuid;
  v_nome text;
  v_cargo_id uuid;
BEGIN
  v_tenant_id := (NEW.raw_user_meta_data ->> 'tenant_id')::uuid;
  v_nome := COALESCE(NEW.raw_user_meta_data ->> 'nome_completo', split_part(NEW.email, '@', 1));
  v_cargo_id := (NEW.raw_user_meta_data ->> 'cargo_id')::uuid;

  IF v_tenant_id IS NOT NULL THEN
    INSERT INTO public.usuarios (
      auth_user_id, email, nome_completo, apelido, tenant_id, cargo_id, ativo, primeiro_login
    ) VALUES (
      NEW.id, NEW.email, v_nome,
      COALESCE(NEW.raw_user_meta_data ->> 'apelido', 'Admin'),
      v_tenant_id, v_cargo_id, true, false
    )
    ON CONFLICT DO NOTHING;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_auth_user();

-- 3. Replace permissive RLS policies with tenant-isolated ones

-- CLIENTS
DROP POLICY IF EXISTS "Allow all operations on clients" ON public.clients;
CREATE POLICY "tenant_isolation_clients" ON public.clients FOR ALL TO authenticated
  USING (tenant_id = public.get_user_tenant_id(auth.uid()))
  WITH CHECK (tenant_id = public.get_user_tenant_id(auth.uid()));
CREATE POLICY "anon_read_clients" ON public.clients FOR SELECT TO anon USING (true);

-- SIMULATIONS
DROP POLICY IF EXISTS "Allow all operations on simulations" ON public.simulations;
CREATE POLICY "tenant_isolation_simulations" ON public.simulations FOR ALL TO authenticated
  USING (tenant_id = public.get_user_tenant_id(auth.uid()))
  WITH CHECK (tenant_id = public.get_user_tenant_id(auth.uid()));

-- USUARIOS
DROP POLICY IF EXISTS "Allow all on usuarios" ON public.usuarios;
CREATE POLICY "tenant_isolation_usuarios" ON public.usuarios FOR ALL TO authenticated
  USING (tenant_id = public.get_user_tenant_id(auth.uid()))
  WITH CHECK (tenant_id = public.get_user_tenant_id(auth.uid()));
CREATE POLICY "anon_read_usuarios" ON public.usuarios FOR SELECT TO anon USING (true);
CREATE POLICY "anon_insert_usuarios" ON public.usuarios FOR INSERT TO anon WITH CHECK (true);

-- CARGOS
DROP POLICY IF EXISTS "Allow all on cargos" ON public.cargos;
CREATE POLICY "tenant_isolation_cargos" ON public.cargos FOR ALL TO authenticated
  USING (tenant_id = public.get_user_tenant_id(auth.uid()))
  WITH CHECK (tenant_id = public.get_user_tenant_id(auth.uid()));
CREATE POLICY "anon_read_cargos" ON public.cargos FOR SELECT TO anon USING (true);
CREATE POLICY "anon_insert_cargos" ON public.cargos FOR INSERT TO anon WITH CHECK (true);

-- COMPANY_SETTINGS
DROP POLICY IF EXISTS "Allow all on company_settings" ON public.company_settings;
CREATE POLICY "tenant_isolation_company_settings" ON public.company_settings FOR ALL TO authenticated
  USING (tenant_id = public.get_user_tenant_id(auth.uid()))
  WITH CHECK (tenant_id = public.get_user_tenant_id(auth.uid()));
CREATE POLICY "anon_read_company_settings" ON public.company_settings FOR SELECT TO anon USING (true);
CREATE POLICY "anon_insert_company_settings" ON public.company_settings FOR INSERT TO anon WITH CHECK (true);

-- TENANTS
DROP POLICY IF EXISTS "Allow all on tenants" ON public.tenants;
CREATE POLICY "tenant_isolation_tenants" ON public.tenants FOR ALL TO authenticated
  USING (id = public.get_user_tenant_id(auth.uid()))
  WITH CHECK (id = public.get_user_tenant_id(auth.uid()));
CREATE POLICY "anon_read_tenants" ON public.tenants FOR SELECT TO anon USING (true);
CREATE POLICY "anon_insert_tenants" ON public.tenants FOR INSERT TO anon WITH CHECK (true);
CREATE POLICY "anon_update_tenants" ON public.tenants FOR UPDATE TO anon USING (true) WITH CHECK (true);

-- FINANCING_RATES
DROP POLICY IF EXISTS "Allow all on financing_rates" ON public.financing_rates;
CREATE POLICY "tenant_isolation_financing_rates" ON public.financing_rates FOR ALL TO authenticated
  USING (tenant_id = public.get_user_tenant_id(auth.uid()))
  WITH CHECK (tenant_id = public.get_user_tenant_id(auth.uid()));

-- DISCOUNT_OPTIONS
DROP POLICY IF EXISTS "Allow all on discount_options" ON public.discount_options;
CREATE POLICY "tenant_isolation_discount_options" ON public.discount_options FOR ALL TO authenticated
  USING (tenant_id = public.get_user_tenant_id(auth.uid()))
  WITH CHECK (tenant_id = public.get_user_tenant_id(auth.uid()));

-- INDICADORES
DROP POLICY IF EXISTS "Allow all on indicadores" ON public.indicadores;
CREATE POLICY "tenant_isolation_indicadores" ON public.indicadores FOR ALL TO authenticated
  USING (tenant_id = public.get_user_tenant_id(auth.uid()))
  WITH CHECK (tenant_id = public.get_user_tenant_id(auth.uid()));

-- CONTRACT_TEMPLATES
DROP POLICY IF EXISTS "Allow all on contract_templates" ON public.contract_templates;
CREATE POLICY "tenant_isolation_contract_templates" ON public.contract_templates FOR ALL TO authenticated
  USING (tenant_id = public.get_user_tenant_id(auth.uid()))
  WITH CHECK (tenant_id = public.get_user_tenant_id(auth.uid()));

-- CLIENT_CONTRACTS
DROP POLICY IF EXISTS "Allow all on client_contracts" ON public.client_contracts;
CREATE POLICY "tenant_isolation_client_contracts" ON public.client_contracts FOR ALL TO authenticated
  USING (tenant_id = public.get_user_tenant_id(auth.uid()))
  WITH CHECK (tenant_id = public.get_user_tenant_id(auth.uid()));

-- CLIENT_TRACKING
DROP POLICY IF EXISTS "Allow all on client_tracking" ON public.client_tracking;
CREATE POLICY "tenant_isolation_client_tracking" ON public.client_tracking FOR ALL TO authenticated
  USING (tenant_id = public.get_user_tenant_id(auth.uid()))
  WITH CHECK (tenant_id = public.get_user_tenant_id(auth.uid()));
CREATE POLICY "anon_read_client_tracking" ON public.client_tracking FOR SELECT TO anon USING (true);

-- TRACKING_MESSAGES
DROP POLICY IF EXISTS "Allow all on tracking_messages" ON public.tracking_messages;
CREATE POLICY "tenant_isolation_tracking_messages" ON public.tracking_messages FOR ALL TO authenticated
  USING (tenant_id = public.get_user_tenant_id(auth.uid()))
  WITH CHECK (tenant_id = public.get_user_tenant_id(auth.uid()));
CREATE POLICY "anon_read_tracking_messages" ON public.tracking_messages FOR SELECT TO anon USING (true);
CREATE POLICY "anon_insert_tracking_messages" ON public.tracking_messages FOR INSERT TO anon WITH CHECK (true);

-- WHATSAPP_SETTINGS
DROP POLICY IF EXISTS "Allow all on whatsapp_settings" ON public.whatsapp_settings;
CREATE POLICY "tenant_isolation_whatsapp_settings" ON public.whatsapp_settings FOR ALL TO authenticated
  USING (tenant_id = public.get_user_tenant_id(auth.uid()))
  WITH CHECK (tenant_id = public.get_user_tenant_id(auth.uid()));

-- SUPPORT_TICKETS
DROP POLICY IF EXISTS "Allow all on support_tickets" ON public.support_tickets;
CREATE POLICY "tenant_isolation_support_tickets" ON public.support_tickets FOR ALL TO authenticated
  USING (tenant_id = public.get_user_tenant_id(auth.uid()))
  WITH CHECK (tenant_id = public.get_user_tenant_id(auth.uid()));

-- PAYROLL_COMMISSIONS
DROP POLICY IF EXISTS "Allow all on payroll_commissions" ON public.payroll_commissions;
CREATE POLICY "tenant_isolation_payroll_commissions" ON public.payroll_commissions FOR ALL TO authenticated
  USING (tenant_id = public.get_user_tenant_id(auth.uid()))
  WITH CHECK (tenant_id = public.get_user_tenant_id(auth.uid()));

-- AUDIT_LOGS
DROP POLICY IF EXISTS "Allow all on audit_logs" ON public.audit_logs;
CREATE POLICY "tenant_isolation_audit_logs" ON public.audit_logs FOR ALL TO authenticated
  USING (tenant_id = public.get_user_tenant_id(auth.uid()))
  WITH CHECK (tenant_id = public.get_user_tenant_id(auth.uid()));
CREATE POLICY "anon_insert_audit_logs" ON public.audit_logs FOR INSERT TO anon WITH CHECK (true);

-- VENDAZAP
DROP POLICY IF EXISTS "Allow all on vendazap_addon" ON public.vendazap_addon;
CREATE POLICY "tenant_isolation_vendazap_addon" ON public.vendazap_addon FOR ALL TO authenticated
  USING (tenant_id = public.get_user_tenant_id(auth.uid()))
  WITH CHECK (tenant_id = public.get_user_tenant_id(auth.uid()));

DROP POLICY IF EXISTS "Allow all on vendazap_messages" ON public.vendazap_messages;
CREATE POLICY "tenant_isolation_vendazap_messages" ON public.vendazap_messages FOR ALL TO authenticated
  USING (tenant_id = public.get_user_tenant_id(auth.uid()))
  WITH CHECK (tenant_id = public.get_user_tenant_id(auth.uid()));

DROP POLICY IF EXISTS "Allow all on vendazap_usage" ON public.vendazap_usage;
CREATE POLICY "tenant_isolation_vendazap_usage" ON public.vendazap_usage FOR ALL TO authenticated
  USING (tenant_id = public.get_user_tenant_id(auth.uid()))
  WITH CHECK (tenant_id = public.get_user_tenant_id(auth.uid()));

-- DEALROOM
DROP POLICY IF EXISTS "Allow all on dealroom_usage" ON public.dealroom_usage;
CREATE POLICY "tenant_isolation_dealroom_usage" ON public.dealroom_usage FOR ALL TO authenticated
  USING (tenant_id = public.get_user_tenant_id(auth.uid()))
  WITH CHECK (tenant_id = public.get_user_tenant_id(auth.uid()));

DROP POLICY IF EXISTS "Allow all on dealroom_transactions" ON public.dealroom_transactions;
CREATE POLICY "tenant_isolation_dealroom_transactions" ON public.dealroom_transactions FOR ALL TO authenticated
  USING (tenant_id = public.get_user_tenant_id(auth.uid()))
  WITH CHECK (tenant_id = public.get_user_tenant_id(auth.uid()));

-- ADMIN_MASTER
DROP POLICY IF EXISTS "Allow all on admin_master" ON public.admin_master;
CREATE POLICY "anon_read_admin_master" ON public.admin_master FOR SELECT TO anon USING (true);
CREATE POLICY "authenticated_read_admin_master" ON public.admin_master FOR SELECT TO authenticated USING (true);

-- PAYMENT_SETTINGS
DROP POLICY IF EXISTS "Allow all on payment_settings" ON public.payment_settings;
CREATE POLICY "public_read_payment_settings" ON public.payment_settings FOR SELECT USING (true);

-- SUBSCRIPTION_PLANS
DROP POLICY IF EXISTS "Allow all on subscription_plans" ON public.subscription_plans;
CREATE POLICY "public_read_subscription_plans" ON public.subscription_plans FOR SELECT USING (true);
CREATE POLICY "admin_all_subscription_plans" ON public.subscription_plans FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- LEADS
DROP POLICY IF EXISTS "Allow all on leads for admin" ON public.leads;
DROP POLICY IF EXISTS "Allow insert on leads" ON public.leads;
CREATE POLICY "public_insert_leads" ON public.leads FOR INSERT WITH CHECK (true);
CREATE POLICY "admin_read_leads" ON public.leads FOR SELECT USING (true);

-- LANDING_PAGE_CONFIG
DROP POLICY IF EXISTS "Allow all on landing_page_config for authenticated" ON public.landing_page_config;
DROP POLICY IF EXISTS "Allow public read on landing_page_config" ON public.landing_page_config;
CREATE POLICY "public_read_landing_page_config" ON public.landing_page_config FOR SELECT USING (true);
CREATE POLICY "admin_all_landing_page_config" ON public.landing_page_config FOR ALL TO authenticated USING (true) WITH CHECK (true);