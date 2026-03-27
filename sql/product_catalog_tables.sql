-- =============================================
-- CATÁLOGO DE PRODUTOS — OrçaMóvel PRO
-- Executar manualmente no Supabase externo
-- =============================================

-- 1. Tabela de fornecedores dedicada (substituirá o JSON em tenant_settings)
CREATE TABLE IF NOT EXISTS public.suppliers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  razao_social TEXT DEFAULT '',
  cnpj TEXT DEFAULT '',
  contact_name TEXT DEFAULT '',
  contact_phone TEXT DEFAULT '',
  contact_email TEXT DEFAULT '',
  whatsapp TEXT DEFAULT '',
  endereco TEXT DEFAULT '',
  bairro TEXT DEFAULT '',
  cidade TEXT DEFAULT '',
  uf TEXT DEFAULT '',
  cep TEXT DEFAULT '',
  observacoes TEXT DEFAULT '',
  ativo BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- 2. Tabela de produtos
CREATE TABLE IF NOT EXISTS public.products (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  internal_code TEXT NOT NULL,
  name TEXT NOT NULL,
  description TEXT DEFAULT '',
  category TEXT DEFAULT 'geral',
  width NUMERIC DEFAULT 0,
  height NUMERIC DEFAULT 0,
  depth NUMERIC DEFAULT 0,
  cost_price NUMERIC NOT NULL DEFAULT 0,
  markup_percentage NUMERIC NOT NULL DEFAULT 0,
  sale_price NUMERIC NOT NULL DEFAULT 0,
  supplier_id UUID REFERENCES public.suppliers(id) ON DELETE SET NULL,
  stock_quantity INTEGER DEFAULT 0,
  stock_status TEXT DEFAULT 'em_estoque' CHECK (stock_status IN ('em_estoque','sob_encomenda','indisponivel')),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE (tenant_id, internal_code)
);

-- 3. Tabela de imagens de produtos
CREATE TABLE IF NOT EXISTS public.product_images (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  image_url TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 4. Índices de performance
CREATE INDEX IF NOT EXISTS idx_suppliers_tenant ON public.suppliers(tenant_id);
CREATE INDEX IF NOT EXISTS idx_products_tenant ON public.products(tenant_id);
CREATE INDEX IF NOT EXISTS idx_products_supplier ON public.products(supplier_id);
CREATE INDEX IF NOT EXISTS idx_products_category ON public.products(tenant_id, category);
CREATE INDEX IF NOT EXISTS idx_product_images_product ON public.product_images(product_id);

-- 5. Triggers updated_at
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_suppliers_updated ON public.suppliers;
CREATE TRIGGER trg_suppliers_updated BEFORE UPDATE ON public.suppliers
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS trg_products_updated ON public.products;
CREATE TRIGGER trg_products_updated BEFORE UPDATE ON public.products
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 6. RLS
ALTER TABLE public.suppliers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.product_images ENABLE ROW LEVEL SECURITY;

-- Suppliers RLS
CREATE POLICY "suppliers_tenant_select" ON public.suppliers FOR SELECT TO authenticated
  USING (tenant_id IN (SELECT tenant_id FROM public.usuarios WHERE id = auth.uid()));
CREATE POLICY "suppliers_tenant_insert" ON public.suppliers FOR INSERT TO authenticated
  WITH CHECK (tenant_id IN (SELECT tenant_id FROM public.usuarios WHERE id = auth.uid()));
CREATE POLICY "suppliers_tenant_update" ON public.suppliers FOR UPDATE TO authenticated
  USING (tenant_id IN (SELECT tenant_id FROM public.usuarios WHERE id = auth.uid()));
CREATE POLICY "suppliers_tenant_delete" ON public.suppliers FOR DELETE TO authenticated
  USING (tenant_id IN (SELECT tenant_id FROM public.usuarios WHERE id = auth.uid()));

-- Products RLS
CREATE POLICY "products_tenant_select" ON public.products FOR SELECT TO authenticated
  USING (tenant_id IN (SELECT tenant_id FROM public.usuarios WHERE id = auth.uid()));
CREATE POLICY "products_tenant_insert" ON public.products FOR INSERT TO authenticated
  WITH CHECK (tenant_id IN (SELECT tenant_id FROM public.usuarios WHERE id = auth.uid()));
CREATE POLICY "products_tenant_update" ON public.products FOR UPDATE TO authenticated
  USING (tenant_id IN (SELECT tenant_id FROM public.usuarios WHERE id = auth.uid()));
CREATE POLICY "products_tenant_delete" ON public.products FOR DELETE TO authenticated
  USING (tenant_id IN (SELECT tenant_id FROM public.usuarios WHERE id = auth.uid()));

-- Product Images RLS (via product tenant)
CREATE POLICY "product_images_select" ON public.product_images FOR SELECT TO authenticated
  USING (product_id IN (SELECT id FROM public.products WHERE tenant_id IN (SELECT tenant_id FROM public.usuarios WHERE id = auth.uid())));
CREATE POLICY "product_images_insert" ON public.product_images FOR INSERT TO authenticated
  WITH CHECK (product_id IN (SELECT id FROM public.products WHERE tenant_id IN (SELECT tenant_id FROM public.usuarios WHERE id = auth.uid())));
CREATE POLICY "product_images_delete" ON public.product_images FOR DELETE TO authenticated
  USING (product_id IN (SELECT id FROM public.products WHERE tenant_id IN (SELECT tenant_id FROM public.usuarios WHERE id = auth.uid())));

-- 7. Grants
GRANT SELECT, INSERT, UPDATE, DELETE ON public.suppliers TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.products TO authenticated;
GRANT SELECT, INSERT, DELETE ON public.product_images TO authenticated;

-- 8. Storage bucket para imagens de produtos
INSERT INTO storage.buckets (id, name, public) VALUES ('product-images', 'product-images', true)
ON CONFLICT (id) DO NOTHING;

-- Storage RLS
CREATE POLICY "product_images_storage_select" ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'product-images');
CREATE POLICY "product_images_storage_insert" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'product-images');
CREATE POLICY "product_images_storage_delete" ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'product-images');
