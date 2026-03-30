-- ============================================================
-- CORREÇÃO DE RLS PARA clients E client_tracking
-- Execute no SQL Editor do Supabase.
--
-- Problema: policies antigas usam WHERE usuarios.id = auth.uid(),
-- que falha para usuários cujo 'id' na tabela usuarios difere do
-- auth.uid() (o campo correto é auth_user_id).
--
-- Correção: função SECURITY DEFINER que resolve tenant_id via
-- auth_user_id OU id, garantindo acesso para todos os cargos
-- do mesmo tenant (incluindo técnico, liberador, conferente).
-- ============================================================

-- 1) Função segura para resolver tenant_id do usuário logado
--    Suporta: auth_user_id = auth.uid() OU id = auth.uid() (legado)
CREATE OR REPLACE FUNCTION public.get_my_tenant_id_secure()
RETURNS text
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT u.tenant_id::text
  FROM public.usuarios u
  WHERE u.auth_user_id = auth.uid()
     OR u.id = auth.uid()
  ORDER BY CASE WHEN u.auth_user_id = auth.uid() THEN 0 ELSE 1 END
  LIMIT 1
$$;

-- ============================================================
-- CLIENTS
-- ============================================================

-- Remover policies antigas (ajuste os nomes conforme pg_policies)
DROP POLICY IF EXISTS "Tenant isolation" ON public.clients;
DROP POLICY IF EXISTS "Tenant isolation for clients" ON public.clients;
DROP POLICY IF EXISTS "clients_tenant_select" ON public.clients;
DROP POLICY IF EXISTS "clients_tenant_insert" ON public.clients;
DROP POLICY IF EXISTS "clients_tenant_update" ON public.clients;
DROP POLICY IF EXISTS "clients_tenant_delete" ON public.clients;
DROP POLICY IF EXISTS "clients_select" ON public.clients;
DROP POLICY IF EXISTS "clients_insert" ON public.clients;
DROP POLICY IF EXISTS "clients_update" ON public.clients;
DROP POLICY IF EXISTS "clients_delete" ON public.clients;

-- Novas policies usando a função segura
CREATE POLICY "clients_select_secure" ON public.clients
  FOR SELECT TO authenticated
  USING (tenant_id::text = public.get_my_tenant_id_secure());

CREATE POLICY "clients_insert_secure" ON public.clients
  FOR INSERT TO authenticated
  WITH CHECK (tenant_id::text = public.get_my_tenant_id_secure());

CREATE POLICY "clients_update_secure" ON public.clients
  FOR UPDATE TO authenticated
  USING (tenant_id::text = public.get_my_tenant_id_secure());

CREATE POLICY "clients_delete_secure" ON public.clients
  FOR DELETE TO authenticated
  USING (tenant_id::text = public.get_my_tenant_id_secure());

-- ============================================================
-- CLIENT_TRACKING
-- ============================================================

-- Remover policies antigas
DROP POLICY IF EXISTS "Tenant isolation" ON public.client_tracking;
DROP POLICY IF EXISTS "Tenant isolation for client_tracking" ON public.client_tracking;
DROP POLICY IF EXISTS "client_tracking_tenant_select" ON public.client_tracking;
DROP POLICY IF EXISTS "client_tracking_tenant_insert" ON public.client_tracking;
DROP POLICY IF EXISTS "client_tracking_tenant_update" ON public.client_tracking;
DROP POLICY IF EXISTS "client_tracking_select" ON public.client_tracking;
DROP POLICY IF EXISTS "client_tracking_insert" ON public.client_tracking;
DROP POLICY IF EXISTS "client_tracking_update" ON public.client_tracking;

-- Novas policies
CREATE POLICY "client_tracking_select_secure" ON public.client_tracking
  FOR SELECT TO authenticated
  USING (tenant_id::text = public.get_my_tenant_id_secure());

CREATE POLICY "client_tracking_insert_secure" ON public.client_tracking
  FOR INSERT TO authenticated
  WITH CHECK (tenant_id::text = public.get_my_tenant_id_secure());

CREATE POLICY "client_tracking_update_secure" ON public.client_tracking
  FOR UPDATE TO authenticated
  USING (tenant_id::text = public.get_my_tenant_id_secure());

-- Grants
GRANT SELECT, INSERT, UPDATE, DELETE ON public.clients TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.client_tracking TO authenticated;
