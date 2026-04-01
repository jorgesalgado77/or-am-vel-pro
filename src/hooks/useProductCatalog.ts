/**
 * Hook for Product Catalog CRUD, search, pagination, import
 */
import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/lib/supabaseClient";
import { getTenantId } from "@/lib/tenantState";
import { getResolvedTenantId } from "@/contexts/TenantContext";
import { toast } from "sonner";

export interface Supplier {
  id: string;
  tenant_id: string;
  name: string;
  razao_social: string;
  cnpj: string;
  contact_name: string;
  contact_phone: string;
  contact_email: string;
  whatsapp: string;
  endereco: string;
  bairro: string;
  cidade: string;
  uf: string;
  cep: string;
  observacoes: string;
  ativo: boolean;
  created_at: string;
}

export interface Product {
  id: string;
  tenant_id: string;
  internal_code: string;
  name: string;
  description: string;
  category: string;
  width: number;
  height: number;
  depth: number;
  cost_price: number;
  markup_percentage: number;
  sale_price: number;
  min_sale_price: number;
  manufacturer_code: string;
  environment: string;
  environment_custom: string;
  supplier_id: string | null;
  stock_quantity: number;
  stock_status: "em_estoque" | "sob_encomenda" | "indisponivel";
  video_url: string;
  created_at: string;
  supplier?: Supplier;
}

export interface ProductImage {
  id: string;
  product_id: string;
  image_url: string;
  is_default: boolean;
}

export function calculateSalePrice(cost: number, markup: number): number {
  return cost + (cost * markup / 100);
}

const PAGE_SIZE = 20;

export function useProductCatalog() {
  const [products, setProducts] = useState<Product[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("");
  const [page, setPage] = useState(0);
  const [totalCount, setTotalCount] = useState(0);
  const [resolvedTenantId, setResolvedTenantId] = useState<string | null>(getTenantId());

  // Resolve tenant ID asynchronously if not available in memory
  useEffect(() => {
    if (!resolvedTenantId) {
      getResolvedTenantId().then(id => {
        if (id) setResolvedTenantId(id);
      });
    }
  }, [resolvedTenantId]);

  const tenantId = resolvedTenantId;

  // --- SUPPLIERS ---
  const loadSuppliers = useCallback(async () => {
    if (!tenantId) return;
    const { data } = await supabase
      .from("suppliers" as any)
      .select("*")
      .eq("tenant_id", tenantId)
      .eq("ativo", true)
      .order("name");
    if (data) setSuppliers(data as any);
  }, [tenantId]);

  const saveSupplier = async (supplier: Partial<Supplier> & { name: string }) => {
    if (!tenantId) return null;
    setSaving(true);
    const payload = { ...supplier, tenant_id: tenantId };
    let result;
    if (supplier.id) {
      const { data, error } = await supabase.from("suppliers" as any).update(payload as any).eq("id", supplier.id).select().single();
      if (error) { toast.error("Erro ao salvar fornecedor"); setSaving(false); return null; }
      result = data;
    } else {
      const { data, error } = await supabase.from("suppliers" as any).insert(payload as any).select().single();
      if (error) { toast.error("Erro ao cadastrar fornecedor"); setSaving(false); return null; }
      result = data;
    }
    toast.success("Fornecedor salvo!");
    await loadSuppliers();
    setSaving(false);
    return result;
  };

  const deleteSupplier = async (id: string) => {
    await supabase.from("suppliers" as any).update({ ativo: false } as any).eq("id", id);
    toast.success("Fornecedor removido");
    loadSuppliers();
  };

  // --- PRODUCTS ---
  const loadProducts = useCallback(async () => {
    if (!tenantId) return;
    setLoading(true);
    let query = supabase
      .from("products" as any)
      .select("*, suppliers!products_supplier_id_fkey(id, name)", { count: "exact" })
      .eq("tenant_id", tenantId)
      .order("name")
      .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1);

    if (search) {
      query = query.or(`name.ilike.%${search}%,internal_code.ilike.%${search}%`);
    }
    if (categoryFilter) {
      query = query.eq("category", categoryFilter);
    }

    const { data, count, error } = await query;
    if (!error && data) {
      setProducts((data as any[]).map(p => ({
        ...p,
        supplier: p.suppliers || undefined,
      })));
      setTotalCount(count || 0);
    }
    setLoading(false);
  }, [tenantId, page, search, categoryFilter]);

  const saveProduct = async (product: Partial<Product> & { name: string; internal_code: string; cost_price: number; markup_percentage: number }) => {
    if (!tenantId) return null;
    setSaving(true);
    const sale_price = calculateSalePrice(product.cost_price, product.markup_percentage);
    const payload = { ...product, tenant_id: tenantId, sale_price };
    delete (payload as any).supplier;

    let result;
    if (product.id) {
      const { data, error } = await supabase.from("products" as any).update(payload as any).eq("id", product.id).select().single();
      if (error) {
        toast.error(error.message?.includes("unique") ? "Código interno já existe" : "Erro ao salvar produto");
        setSaving(false); return null;
      }
      result = data;
    } else {
      const { data, error } = await supabase.from("products" as any).insert(payload as any).select().single();
      if (error) {
        toast.error(error.message?.includes("unique") ? "Código interno já existe nesta loja" : "Erro ao cadastrar produto");
        setSaving(false); return null;
      }
      result = data;
    }
    toast.success("Produto salvo!");
    await loadProducts();
    setSaving(false);
    return result;
  };

  const deleteProduct = async (id: string) => {
    const { error } = await supabase.from("products" as any).delete().eq("id", id);
    if (error) { toast.error("Erro ao remover produto"); return; }
    toast.success("Produto removido");
    loadProducts();
  };

  // --- IMAGES ---
  const uploadProductImage = async (productId: string, file: File) => {
    if (!tenantId) return null;
    const ext = file.name.split(".").pop();
    const path = `${tenantId}/${productId}/${crypto.randomUUID()}.${ext}`;
    const { error: upErr } = await supabase.storage.from("product-images").upload(path, file);
    if (upErr) { toast.error("Erro no upload da imagem"); return null; }
    const { data: urlData } = supabase.storage.from("product-images").getPublicUrl(path);
    const imageUrl = urlData.publicUrl;
    const { data } = await supabase.from("product_images" as any).insert({ product_id: productId, image_url: imageUrl } as any).select().single();
    return data;
  };

  const loadProductImages = async (productId: string): Promise<ProductImage[]> => {
    const { data } = await supabase.from("product_images" as any).select("*").eq("product_id", productId);
    return (data || []) as any;
  };

  const deleteProductImage = async (imageId: string) => {
    await supabase.from("product_images" as any).delete().eq("id", imageId);
  };

  // --- IMPORT CSV/JSON ---
  const importProducts = async (items: Array<{ name: string; internal_code: string; cost_price: number; markup_percentage: number; category?: string; supplier_name?: string; description?: string; width?: number; height?: number; depth?: number; stock_quantity?: number }>) => {
    if (!tenantId || items.length === 0) return;
    setSaving(true);

    // Map supplier names to IDs
    const supplierMap = new Map(suppliers.map(s => [s.name.toLowerCase(), s.id]));

    const rows = items.map(item => ({
      tenant_id: tenantId,
      name: item.name,
      internal_code: item.internal_code,
      cost_price: item.cost_price,
      markup_percentage: item.markup_percentage || 0,
      sale_price: calculateSalePrice(item.cost_price, item.markup_percentage || 0),
      category: item.category || "geral",
      description: item.description || "",
      width: item.width || 0,
      height: item.height || 0,
      depth: item.depth || 0,
      stock_quantity: item.stock_quantity || 0,
      stock_status: "em_estoque",
      supplier_id: item.supplier_name ? supplierMap.get(item.supplier_name.toLowerCase()) || null : null,
    }));

    const { error } = await supabase.from("products" as any).upsert(rows as any, { onConflict: "tenant_id,internal_code" });
    if (error) {
      toast.error("Erro na importação: " + error.message);
    } else {
      toast.success(`${rows.length} produtos importados!`);
      loadProducts();
    }
    setSaving(false);
  };

  // --- CATEGORIES ---
  const [categories, setCategories] = useState<string[]>([]);
  const loadCategories = useCallback(async () => {
    if (!tenantId) return;
    const { data } = await supabase.from("products" as any).select("category").eq("tenant_id", tenantId);
    if (data) {
      const unique = [...new Set((data as any[]).map(d => d.category).filter(Boolean))];
      setCategories(unique.sort());
    }
  }, [tenantId]);

  useEffect(() => {
    loadSuppliers();
    loadProducts();
    loadCategories();
  }, [loadSuppliers, loadProducts, loadCategories]);

  const totalPages = Math.ceil(totalCount / PAGE_SIZE);

  return {
    products, suppliers, loading, saving, search, setSearch,
    categoryFilter, setCategoryFilter, categories,
    page, setPage, totalPages, totalCount,
    saveProduct, deleteProduct,
    saveSupplier, deleteSupplier,
    uploadProductImage, loadProductImages, deleteProductImage,
    importProducts, loadProducts, loadSuppliers,
  };
}
