-- =====================================================
-- SQL para execução no Supabase SQL Editor
-- 1) Corrigir login_diagnostics
-- 2) RPCs de gestão de usuários por loja (Admin Master)
-- =====================================================

-- ===== 1. login_diagnostics: adicionar coluna codigo_loja =====
ALTER TABLE public.login_diagnostics
  ADD COLUMN IF NOT EXISTS codigo_loja text;

CREATE OR REPLACE FUNCTION public.log_login_diagnostic(
  p_email text DEFAULT NULL,
  p_codigo_loja text DEFAULT NULL,
  p_tenant_id uuid DEFAULT NULL,
  p_usuario_id uuid DEFAULT NULL,
  p_cargo_nome text DEFAULT NULL,
  p_auth_user_id uuid DEFAULT NULL,
  p_resultado text DEFAULT 'falha_desconhecida',
  p_detalhes jsonb DEFAULT '{}'
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.login_diagnostics (
    email, codigo_loja, tenant_id, usuario_id,
    cargo_nome, auth_user_id, resultado, detalhes
  ) VALUES (
    p_email, p_codigo_loja, p_tenant_id, p_usuario_id,
    p_cargo_nome, p_auth_user_id, p_resultado, p_detalhes
  );
END;
$$;

-- ===== 2. RPCs Admin Store Users =====
CREATE OR REPLACE FUNCTION public.admin_list_store_users(p_tenant_id uuid)
RETURNS TABLE(
  id uuid, nome_completo text, email text, telefone text,
  cargo_id uuid, cargo_nome text, ativo boolean,
  tipo_regime text, salario_fixo numeric, comissao_percentual numeric,
  apelido text, foto_url text
)
LANGUAGE sql SECURITY DEFINER SET search_path = public
AS $$
  SELECT u.id, u.nome_completo, u.email, u.telefone, u.cargo_id,
         c.nome, COALESCE(u.ativo, true), u.tipo_regime,
         COALESCE(u.salario_fixo, 0), COALESCE(u.comissao_percentual, 0),
         u.apelido, u.foto_url
  FROM public.usuarios u
  LEFT JOIN public.cargos c ON c.id = u.cargo_id
  WHERE u.tenant_id = p_tenant_id
    AND EXISTS (SELECT 1 FROM public.admin_master am WHERE lower(am.email) = lower(COALESCE(auth.jwt() ->> 'email', '')))
  ORDER BY COALESCE(u.ativo, true) DESC, u.nome_completo;
$$;

CREATE OR REPLACE FUNCTION public.admin_list_store_cargos(p_tenant_id uuid)
RETURNS TABLE(id uuid, nome text)
LANGUAGE sql SECURITY DEFINER SET search_path = public
AS $$
  SELECT c.id, c.nome FROM public.cargos c
  WHERE c.tenant_id = p_tenant_id
    AND EXISTS (SELECT 1 FROM public.admin_master am WHERE lower(am.email) = lower(COALESCE(auth.jwt() ->> 'email', '')))
  ORDER BY c.nome;
$$;

CREATE OR REPLACE FUNCTION public.admin_upsert_store_user(
  p_tenant_id uuid, p_user_id uuid DEFAULT NULL, p_nome_completo text DEFAULT '',
  p_email text DEFAULT NULL, p_telefone text DEFAULT NULL, p_cargo_id uuid DEFAULT NULL,
  p_tipo_regime text DEFAULT NULL, p_salario_fixo numeric DEFAULT 0,
  p_comissao_percentual numeric DEFAULT 0, p_ativo boolean DEFAULT true
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_id uuid; v_hashed text;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.admin_master am WHERE lower(am.email) = lower(COALESCE(auth.jwt() ->> 'email', ''))) THEN
    RAISE EXCEPTION 'Acesso negado';
  END IF;
  IF p_user_id IS NOT NULL THEN
    UPDATE public.usuarios SET nome_completo=p_nome_completo, email=p_email, telefone=p_telefone,
      cargo_id=p_cargo_id, tipo_regime=p_tipo_regime, salario_fixo=p_salario_fixo,
      comissao_percentual=p_comissao_percentual, ativo=p_ativo
    WHERE id=p_user_id AND tenant_id=p_tenant_id;
    v_id := p_user_id;
  ELSE
    SELECT public.hash_password('123456') INTO v_hashed;
    INSERT INTO public.usuarios (tenant_id, nome_completo, email, telefone, cargo_id, tipo_regime,
      salario_fixo, comissao_percentual, ativo, senha, primeiro_login)
    VALUES (p_tenant_id, p_nome_completo, p_email, p_telefone, p_cargo_id, p_tipo_regime,
      p_salario_fixo, p_comissao_percentual, p_ativo, v_hashed, true)
    RETURNING id INTO v_id;
  END IF;
  RETURN v_id;
END; $$;

CREATE OR REPLACE FUNCTION public.admin_delete_store_user(p_user_id uuid, p_tenant_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.admin_master am WHERE lower(am.email) = lower(COALESCE(auth.jwt() ->> 'email', ''))) THEN
    RAISE EXCEPTION 'Acesso negado';
  END IF;
  DELETE FROM public.usuarios WHERE id=p_user_id AND tenant_id=p_tenant_id;
END; $$;

CREATE OR REPLACE FUNCTION public.admin_reset_store_user_password(p_user_id uuid, p_new_password text DEFAULT '123456')
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_hashed text;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.admin_master am WHERE lower(am.email) = lower(COALESCE(auth.jwt() ->> 'email', ''))) THEN
    RAISE EXCEPTION 'Acesso negado';
  END IF;
  SELECT public.hash_password(p_new_password) INTO v_hashed;
  UPDATE public.usuarios SET senha=v_hashed, primeiro_login=true WHERE id=p_user_id;
  BEGIN PERFORM public.admin_update_user_password(p_user_id, p_new_password); EXCEPTION WHEN OTHERS THEN NULL; END;
END; $$;

CREATE OR REPLACE FUNCTION public.admin_toggle_store_user(p_user_id uuid, p_ativo boolean)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.admin_master am WHERE lower(am.email) = lower(COALESCE(auth.jwt() ->> 'email', ''))) THEN
    RAISE EXCEPTION 'Acesso negado';
  END IF;
  UPDATE public.usuarios SET ativo=p_ativo WHERE id=p_user_id;
END; $$;
