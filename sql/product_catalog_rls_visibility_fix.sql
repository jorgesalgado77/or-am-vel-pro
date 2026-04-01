-- ============================================================
-- CORREÇÃO DE VISIBILIDADE DO CATÁLOGO DE PRODUTOS
-- Execute manualmente no SQL Editor do banco externo.
--
-- Problema corrigido:
-- policies antigas do catálogo filtravam por usuarios.id = auth.uid(),
-- o que faz vendedor/projetista retornarem [] mesmo estando no tenant certo.
--
-- Esta correção:
-- 1) resolve o tenant com auth_user_id OU id legado
-- 2) libera SELECT para usuários autenticados do mesmo tenant
-- 3) respeita a permissão de cargo "catalogo" quando ela existir
-- ============================================================

-- 1) Garante a função segura para descobrir o tenant do usuário autenticado
--    Caso já exista no banco, este bloco não altera a assinatura.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname = 'get_my_tenant_id_secure'
  ) THEN
    EXECUTE $fn$
      CREATE FUNCTION public.get_my_tenant_id_secure()
      RETURNS text
      LANGUAGE sql
      STABLE
      SECURITY DEFINER
      SET search_path = public
      AS $$
        SELECT u.tenant_id::text
        FROM public.usuarios u
        WHERE u.auth_user_id = auth.uid()
           OR u.id = auth.uid()
        ORDER BY CASE WHEN u.auth_user_id = auth.uid() THEN 0 ELSE 1 END
        LIMIT 1
      $$
    $fn$;
  END IF;
END $$;

-- 2) Função para validar se o usuário autenticado tem acesso ao catálogo
--    Se o cargo/permissão ainda não estiver vinculado, mantemos fallback true
--    para não bloquear usuários legados já autorizados na interface.
CREATE OR REPLACE FUNCTION public.can_access_catalog_secure()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE((
    SELECT CASE
      WHEN u.cargo_id IS NULL THEN true
      WHEN c.id IS NULL THEN true
      ELSE COALESCE((c.permissoes ->> 'catalogo')::boolean, true)
    END
    FROM public.usuarios u
    LEFT JOIN public.cargos c ON c.id = u.cargo_id
    WHERE u.auth_user_id = auth.uid()
       OR u.id = auth.uid()
    ORDER BY CASE WHEN u.auth_user_id = auth.uid() THEN 0 ELSE 1 END
    LIMIT 1
  ), false)
$$;

ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.product_images ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.suppliers ENABLE ROW LEVEL SECURITY;

-- 3) Remover policies antigas/restritivas do catálogo
DROP POLICY IF EXISTS "products_tenant_select" ON public.products;
DROP POLICY IF EXISTS "products_select" ON public.products;
DROP POLICY IF EXISTS "tenant_users_select_products" ON public.products;
DROP POLICY IF EXISTS "Allow tenant users to select products" ON public.products;
DROP POLICY IF EXISTS "Tenants can view own products" ON public.products;

DROP POLICY IF EXISTS "suppliers_tenant_select" ON public.suppliers;
DROP POLICY IF EXISTS "suppliers_select" ON public.suppliers;
DROP POLICY IF EXISTS "Allow tenant users to select suppliers" ON public.suppliers;
DROP POLICY IF EXISTS "Tenants can view own suppliers" ON public.suppliers;

DROP POLICY IF EXISTS "product_images_select" ON public.product_images;
DROP POLICY IF EXISTS "tenant_users_select_product_images" ON public.product_images;
DROP POLICY IF EXISTS "Allow tenant users to select product_images" ON public.product_images;
DROP POLICY IF EXISTS "Tenants can view product images" ON public.product_images;

-- 4) Novas policies seguras de leitura do catálogo
CREATE POLICY "products_select_catalog_secure"
ON public.products
FOR SELECT
TO authenticated
USING (
  tenant_id::text = public.get_my_tenant_id_secure()
  AND public.can_access_catalog_secure()
);

CREATE POLICY "suppliers_select_catalog_secure"
ON public.suppliers
FOR SELECT
TO authenticated
USING (
  tenant_id::text = public.get_my_tenant_id_secure()
  AND public.can_access_catalog_secure()
);

CREATE POLICY "product_images_select_catalog_secure"
ON public.product_images
FOR SELECT
TO authenticated
USING (
  public.can_access_catalog_secure()
  AND EXISTS (
    SELECT 1
    FROM public.products p
    WHERE p.id = product_images.product_id
      AND p.tenant_id::text = public.get_my_tenant_id_secure()
  )
);

-- 5) Grants explícitos para evitar 403 silencioso no PostgREST
GRANT SELECT ON public.products TO authenticated;
GRANT SELECT ON public.suppliers TO authenticated;
GRANT SELECT ON public.product_images TO authenticated;