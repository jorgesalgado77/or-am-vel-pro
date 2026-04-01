-- ============================================================
-- CORREÇÃO DE VISIBILIDADE DO CATÁLOGO DE PRODUTOS
-- Execute manualmente no SQL Editor do banco externo.
-- ============================================================

-- 1) Função segura para resolver tenant_id
CREATE OR REPLACE FUNCTION public.get_my_tenant_id_secure()
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $func$
  SELECT u.tenant_id::text
  FROM public.usuarios u
  WHERE u.auth_user_id = auth.uid()
     OR u.id = auth.uid()
  ORDER BY CASE WHEN u.auth_user_id = auth.uid() THEN 0 ELSE 1 END
  LIMIT 1
$func$;

-- 2) Função para validar acesso ao catálogo
CREATE OR REPLACE FUNCTION public.can_access_catalog_secure()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $func$
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
$func$;

-- 3) Habilitar RLS
ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.product_images ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.suppliers ENABLE ROW LEVEL SECURITY;

-- 4) Remover policies antigas
DROP POLICY IF EXISTS "products_tenant_select" ON public.products;
DROP POLICY IF EXISTS "products_select" ON public.products;
DROP POLICY IF EXISTS "tenant_users_select_products" ON public.products;
DROP POLICY IF EXISTS "Allow tenant users to select products" ON public.products;
DROP POLICY IF EXISTS "Tenants can view own products" ON public.products;
DROP POLICY IF EXISTS "products_select_catalog_secure" ON public.products;

DROP POLICY IF EXISTS "suppliers_tenant_select" ON public.suppliers;
DROP POLICY IF EXISTS "suppliers_select" ON public.suppliers;
DROP POLICY IF EXISTS "Allow tenant users to select suppliers" ON public.suppliers;
DROP POLICY IF EXISTS "Tenants can view own suppliers" ON public.suppliers;
DROP POLICY IF EXISTS "suppliers_select_catalog_secure" ON public.suppliers;

DROP POLICY IF EXISTS "product_images_select" ON public.product_images;
DROP POLICY IF EXISTS "tenant_users_select_product_images" ON public.product_images;
DROP POLICY IF EXISTS "Allow tenant users to select product_images" ON public.product_images;
DROP POLICY IF EXISTS "Tenants can view product images" ON public.product_images;
DROP POLICY IF EXISTS "product_images_select_catalog_secure" ON public.product_images;

-- 5) Novas policies seguras
CREATE POLICY "products_select_catalog_secure"
ON public.products FOR SELECT TO authenticated
USING (
  tenant_id::text = public.get_my_tenant_id_secure()
  AND public.can_access_catalog_secure()
);

CREATE POLICY "suppliers_select_catalog_secure"
ON public.suppliers FOR SELECT TO authenticated
USING (
  tenant_id::text = public.get_my_tenant_id_secure()
  AND public.can_access_catalog_secure()
);

CREATE POLICY "product_images_select_catalog_secure"
ON public.product_images FOR SELECT TO authenticated
USING (
  public.can_access_catalog_secure()
  AND EXISTS (
    SELECT 1 FROM public.products p
    WHERE p.id = product_images.product_id
      AND p.tenant_id::text = public.get_my_tenant_id_secure()
  )
);

-- 6) Grants
GRANT SELECT ON public.products TO authenticated;
GRANT SELECT ON public.suppliers TO authenticated;
GRANT SELECT ON public.product_images TO authenticated;
