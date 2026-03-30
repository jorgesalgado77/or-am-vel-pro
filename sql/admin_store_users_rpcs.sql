-- =====================================================
-- RPCs para gestão de usuários por loja (Admin Master)
-- Executar manualmente no Supabase SQL Editor
-- =====================================================

-- 1. Listar usuários de uma loja (bypass RLS)
CREATE OR REPLACE FUNCTION public.admin_list_store_users(p_tenant_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  result jsonb;
BEGIN
  -- Verificar se chamador é admin master
  IF NOT EXISTS (
    SELECT 1 FROM admin_master WHERE user_id = auth.uid()
  ) THEN
    RAISE EXCEPTION 'Acesso negado: não é admin master';
  END IF;

  SELECT coalesce(jsonb_agg(row_to_json(r)), '[]'::jsonb)
  INTO result
  FROM (
    SELECT u.id, u.nome_completo, u.email, u.telefone, u.cargo_id,
           u.ativo, u.tipo_regime, u.salario_fixo, u.comissao_percentual,
           u.apelido, u.foto_url,
           c.nome AS cargo_nome
    FROM usuarios u
    LEFT JOIN cargos c ON u.cargo_id = c.id
    WHERE u.tenant_id = p_tenant_id
    ORDER BY u.ativo DESC, u.nome_completo
  ) r;

  RETURN result;
END;
$$;

-- 2. Criar/Atualizar usuário em uma loja (bypass RLS)
CREATE OR REPLACE FUNCTION public.admin_upsert_store_user(
  p_tenant_id uuid,
  p_user_id uuid DEFAULT NULL,
  p_nome_completo text DEFAULT '',
  p_email text DEFAULT NULL,
  p_telefone text DEFAULT NULL,
  p_cargo_id uuid DEFAULT NULL,
  p_tipo_regime text DEFAULT NULL,
  p_salario_fixo numeric DEFAULT 0,
  p_comissao_percentual numeric DEFAULT 0,
  p_ativo boolean DEFAULT true
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id uuid;
  v_hashed text;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM admin_master WHERE user_id = auth.uid()
  ) THEN
    RAISE EXCEPTION 'Acesso negado: não é admin master';
  END IF;

  IF p_user_id IS NOT NULL THEN
    -- Update
    UPDATE usuarios SET
      nome_completo = p_nome_completo,
      email = p_email,
      telefone = p_telefone,
      cargo_id = p_cargo_id,
      tipo_regime = p_tipo_regime,
      salario_fixo = p_salario_fixo,
      comissao_percentual = p_comissao_percentual,
      ativo = p_ativo
    WHERE id = p_user_id AND tenant_id = p_tenant_id;
    v_id := p_user_id;
  ELSE
    -- Insert with default password '123456'
    SELECT hash_password('123456') INTO v_hashed;
    INSERT INTO usuarios (tenant_id, nome_completo, email, telefone, cargo_id, tipo_regime, salario_fixo, comissao_percentual, ativo, senha, primeiro_login)
    VALUES (p_tenant_id, p_nome_completo, p_email, p_telefone, p_cargo_id, p_tipo_regime, p_salario_fixo, p_comissao_percentual, p_ativo, v_hashed, true)
    RETURNING id INTO v_id;
  END IF;

  RETURN v_id;
END;
$$;

-- 3. Excluir usuário (bypass RLS)
CREATE OR REPLACE FUNCTION public.admin_delete_store_user(p_user_id uuid, p_tenant_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM admin_master WHERE user_id = auth.uid()
  ) THEN
    RAISE EXCEPTION 'Acesso negado: não é admin master';
  END IF;

  DELETE FROM usuarios WHERE id = p_user_id AND tenant_id = p_tenant_id;
END;
$$;

-- 4. Resetar senha do usuário (bypass RLS)
CREATE OR REPLACE FUNCTION public.admin_reset_store_user_password(p_user_id uuid, p_new_password text DEFAULT '123456')
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_hashed text;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM admin_master WHERE user_id = auth.uid()
  ) THEN
    RAISE EXCEPTION 'Acesso negado: não é admin master';
  END IF;

  SELECT hash_password(p_new_password) INTO v_hashed;

  UPDATE usuarios SET senha = v_hashed, primeiro_login = true WHERE id = p_user_id;

  -- Sync with Supabase Auth if RPC exists
  BEGIN
    PERFORM admin_update_user_password(p_user_id, p_new_password);
  EXCEPTION WHEN OTHERS THEN
    NULL; -- RPC may not exist
  END;
END;
$$;

-- 5. Alternar ativo/inativo (bypass RLS)
CREATE OR REPLACE FUNCTION public.admin_toggle_store_user(p_user_id uuid, p_ativo boolean)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM admin_master WHERE user_id = auth.uid()
  ) THEN
    RAISE EXCEPTION 'Acesso negado: não é admin master';
  END IF;

  UPDATE usuarios SET ativo = p_ativo WHERE id = p_user_id;
END;
$$;

-- 6. Listar cargos de um tenant (bypass RLS)
CREATE OR REPLACE FUNCTION public.admin_list_store_cargos(p_tenant_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  result jsonb;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM admin_master WHERE user_id = auth.uid()
  ) THEN
    RAISE EXCEPTION 'Acesso negado: não é admin master';
  END IF;

  SELECT coalesce(jsonb_agg(row_to_json(r)), '[]'::jsonb)
  INTO result
  FROM (
    SELECT id, nome FROM cargos WHERE tenant_id = p_tenant_id ORDER BY nome
  ) r;

  RETURN result;
END;
$$;
