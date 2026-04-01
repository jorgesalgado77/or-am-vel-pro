-- ============================================================
-- POLICIES DE ESCRITA (INSERT, UPDATE, DELETE) PARA O CATÁLOGO
-- Usa permissão "cadastrar_produtos" do cargo (não "catalogo").
-- Execute manualmente no SQL Editor do banco externo.
-- ============================================================

-- Função segura para verificar permissão de cadastrar produtos
CREATE OR REPLACE FUNCTION public.can_manage_catalog_secure()
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $func$
  SELECT EXISTS (
    SELECT 1
    FROM public.usuarios u
    JOIN public.cargos c ON c.id = u.cargo_id
    WHERE u.auth_user_id = auth.uid()
      AND (c.permissoes->>'cadastrar_produtos')::boolean = true
  )
$func$;

-- ===================== PRODUCTS =====================
DROP POLICY IF EXISTS "products_insert" ON public.products;
DROP POLICY IF EXISTS "products_update" ON public.products;
DROP POLICY IF EXISTS "products_delete" ON public.products;
DROP POLICY IF EXISTS "products_insert_catalog_secure" ON public.products;
DROP POLICY IF EXISTS "products_update_catalog_secure" ON public.products;
DROP POLICY IF EXISTS "products_delete_catalog_secure" ON public.products;

CREATE POLICY "products_insert_catalog_secure"
ON public.products FOR INSERT TO authenticated
WITH CHECK (
  tenant_id::text = public.get_my_tenant_id_secure()
  AND public.can_manage_catalog_secure()
);

CREATE POLICY "products_update_catalog_secure"
ON public.products FOR UPDATE TO authenticated
USING (
  tenant_id::text = public.get_my_tenant_id_secure()
  AND public.can_manage_catalog_secure()
);

CREATE POLICY "products_delete_catalog_secure"
ON public.products FOR DELETE TO authenticated
USING (
  tenant_id::text = public.get_my_tenant_id_secure()
  AND public.can_manage_catalog_secure()
);

-- ===================== SUPPLIERS =====================
DROP POLICY IF EXISTS "suppliers_insert" ON public.suppliers;
DROP POLICY IF EXISTS "suppliers_update" ON public.suppliers;
DROP POLICY IF EXISTS "suppliers_delete" ON public.suppliers;
DROP POLICY IF EXISTS "suppliers_insert_catalog_secure" ON public.suppliers;
DROP POLICY IF EXISTS "suppliers_update_catalog_secure" ON public.suppliers;
DROP POLICY IF EXISTS "suppliers_delete_catalog_secure" ON public.suppliers;

CREATE POLICY "suppliers_insert_catalog_secure"
ON public.suppliers FOR INSERT TO authenticated
WITH CHECK (
  tenant_id::text = public.get_my_tenant_id_secure()
  AND public.can_manage_catalog_secure()
);

CREATE POLICY "suppliers_update_catalog_secure"
ON public.suppliers FOR UPDATE TO authenticated
USING (
  tenant_id::text = public.get_my_tenant_id_secure()
  AND public.can_manage_catalog_secure()
);

CREATE POLICY "suppliers_delete_catalog_secure"
ON public.suppliers FOR DELETE TO authenticated
USING (
  tenant_id::text = public.get_my_tenant_id_secure()
  AND public.can_manage_catalog_secure()
);

-- ===================== PRODUCT_IMAGES =====================
DROP POLICY IF EXISTS "product_images_insert" ON public.product_images;
DROP POLICY IF EXISTS "product_images_update" ON public.product_images;
DROP POLICY IF EXISTS "product_images_delete" ON public.product_images;
DROP POLICY IF EXISTS "product_images_insert_catalog_secure" ON public.product_images;
DROP POLICY IF EXISTS "product_images_update_catalog_secure" ON public.product_images;
DROP POLICY IF EXISTS "product_images_delete_catalog_secure" ON public.product_images;

CREATE POLICY "product_images_insert_catalog_secure"
ON public.product_images FOR INSERT TO authenticated
WITH CHECK (
  public.can_manage_catalog_secure()
  AND EXISTS (
    SELECT 1 FROM public.products p
    WHERE p.id = product_images.product_id
      AND p.tenant_id::text = public.get_my_tenant_id_secure()
  )
);

CREATE POLICY "product_images_update_catalog_secure"
ON public.product_images FOR UPDATE TO authenticated
USING (
  public.can_manage_catalog_secure()
  AND EXISTS (
    SELECT 1 FROM public.products p
    WHERE p.id = product_images.product_id
      AND p.tenant_id::text = public.get_my_tenant_id_secure()
  )
);

CREATE POLICY "product_images_delete_catalog_secure"
ON public.product_images FOR DELETE TO authenticated
USING (
  public.can_manage_catalog_secure()
  AND EXISTS (
    SELECT 1 FROM public.products p
    WHERE p.id = product_images.product_id
      AND p.tenant_id::text = public.get_my_tenant_id_secure()
  )
);

-- ===================== GRANTS =====================
GRANT SELECT, INSERT, UPDATE, DELETE ON public.products TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.suppliers TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.product_images TO authenticated;
