-- ============================================================
-- CORREÇÃO DE RLS PARA measurement_requests
-- Execute este SQL no editor SQL do backend (Supabase).
--
-- A policy antiga "Tenant isolation" usa WHERE usuarios.id = auth.uid(),
-- que falha para usuários cujo campo 'id' difere do auth.uid() (o correto
-- é auth_user_id). Além disso, a policy ALL não diferencia admin de técnico,
-- impedindo técnicos/liberadores/conferentes de verem cards atribuídos.
--
-- Esta correção:
-- 1) Remove a policy antiga
-- 2) Cria função SECURITY DEFINER que resolve por auth_user_id + nome
-- 3) Admin/Gerente vê tudo do tenant
-- 4) Técnico/Liberador/Conferente vê apenas assigned_to ou created_by
-- ============================================================

-- 1) Remover policy antiga
DROP POLICY IF EXISTS "Tenant isolation" ON public.measurement_requests;

-- 2) Função de normalização
CREATE OR REPLACE FUNCTION public.normalize_identity_label(_value text)
RETURNS text
LANGUAGE sql IMMUTABLE AS $$
  SELECT lower(trim(translate(
    coalesce(_value, ''),
    'ÁÀÃÂÄáàãâäÉÈÊËéèêëÍÌÎÏíìîïÓÒÕÔÖóòõôöÚÙÛÜúùûüÇç',
    'AAAAAaaaaaEEEEeeeeIIIIiiiiOOOOOoooooUUUUuuuuCc'
  )))
$$;

-- 3) Função SECURITY DEFINER para resolver acesso
CREATE OR REPLACE FUNCTION public.can_access_measurement_request(
  _tenant_id text,
  _assigned_to text,
  _created_by text DEFAULT NULL
)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  WITH me AS (
    SELECT
      u.id::text AS uid,
      coalesce(u.auth_user_id::text, '') AS auth_uid,
      public.normalize_identity_label(u.nome_completo) AS nome,
      public.normalize_identity_label(u.apelido) AS apelido,
      public.normalize_identity_label(u.email) AS email,
      public.normalize_identity_label(c.nome) AS cargo,
      u.tenant_id::text AS tid
    FROM public.usuarios u
    LEFT JOIN public.cargos c ON c.id = u.cargo_id
    WHERE u.ativo = true
      AND (u.id = auth.uid() OR u.auth_user_id = auth.uid())
    ORDER BY CASE WHEN u.auth_user_id = auth.uid() THEN 0 ELSE 1 END
    LIMIT 1
  )
  SELECT EXISTS (
    SELECT 1 FROM me
    WHERE me.tid = _tenant_id
      AND (
        -- Admin/Gerente: acesso total ao tenant
        me.cargo LIKE '%administrador%'
        OR me.cargo LIKE '%gerente%'
        -- Técnico/Liberador/Conferente: acesso por atribuição
        OR public.normalize_identity_label(_assigned_to) IN (me.uid, me.auth_uid, me.nome, me.apelido, me.email)
        OR public.normalize_identity_label(_created_by) IN (me.uid, me.auth_uid, me.nome, me.apelido, me.email)
      )
  )
$$;

-- 4) Garantir RLS ativo
ALTER TABLE public.measurement_requests ENABLE ROW LEVEL SECURITY;

-- 5) Policies novas
CREATE POLICY "mr_select_secure" ON public.measurement_requests
  FOR SELECT TO authenticated
  USING (public.can_access_measurement_request(tenant_id::text, assigned_to, created_by));

CREATE POLICY "mr_insert_tenant" ON public.measurement_requests
  FOR INSERT TO authenticated
  WITH CHECK (tenant_id::text IN (
    SELECT u.tenant_id::text FROM public.usuarios u
    WHERE u.id = auth.uid() OR u.auth_user_id = auth.uid()
  ));

CREATE POLICY "mr_update_secure" ON public.measurement_requests
  FOR UPDATE TO authenticated
  USING (public.can_access_measurement_request(tenant_id::text, assigned_to, created_by))
  WITH CHECK (tenant_id::text IN (
    SELECT u.tenant_id::text FROM public.usuarios u
    WHERE u.id = auth.uid() OR u.auth_user_id = auth.uid()
  ));

-- 6) Grants
GRANT SELECT, INSERT, UPDATE ON public.measurement_requests TO authenticated;
