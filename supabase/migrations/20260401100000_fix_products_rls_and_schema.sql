-- 1. Ensure products RLS allows SELECT for all authenticated users in the same tenant
DO $$
BEGIN
  -- Drop existing restrictive SELECT policies if any
  BEGIN
    EXECUTE 'DROP POLICY IF EXISTS "products_select" ON public.products';
  EXCEPTION WHEN undefined_table THEN NULL;
  END;
  BEGIN
    EXECUTE 'DROP POLICY IF EXISTS "Tenants can view own products" ON public.products';
  EXCEPTION WHEN undefined_table THEN NULL;
  END;
  BEGIN
    EXECUTE 'DROP POLICY IF EXISTS "Allow tenant users to select products" ON public.products';
  EXCEPTION WHEN undefined_table THEN NULL;
  END;
END $$;

-- Create a permissive SELECT policy for all authenticated tenant users
CREATE POLICY "tenant_users_select_products"
  ON public.products
  FOR SELECT
  TO authenticated
  USING (tenant_id = get_my_tenant_id_secure());

-- Same for product_images
DO $$
BEGIN
  BEGIN
    EXECUTE 'DROP POLICY IF EXISTS "product_images_select" ON public.product_images';
  EXCEPTION WHEN undefined_table THEN NULL;
  END;
  BEGIN
    EXECUTE 'DROP POLICY IF EXISTS "Tenants can view product images" ON public.product_images';
  EXCEPTION WHEN undefined_table THEN NULL;
  END;
  BEGIN
    EXECUTE 'DROP POLICY IF EXISTS "Allow tenant users to select product_images" ON public.product_images';
  EXCEPTION WHEN undefined_table THEN NULL;
  END;
END $$;

CREATE POLICY "tenant_users_select_product_images"
  ON public.product_images
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.products p
      WHERE p.id = product_images.product_id
        AND p.tenant_id = get_my_tenant_id_secure()
    )
  );

-- 2. Add video_url column to products (if not exists)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'products' AND column_name = 'video_url'
  ) THEN
    ALTER TABLE public.products ADD COLUMN video_url text DEFAULT '';
  END IF;
END $$;

-- 3. Add is_default column to product_images (if not exists)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'product_images' AND column_name = 'is_default'
  ) THEN
    ALTER TABLE public.product_images ADD COLUMN is_default boolean DEFAULT false;
  END IF;
END $$;
