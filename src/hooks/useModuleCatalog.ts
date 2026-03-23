import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/lib/supabaseClient";
import { toast } from "sonner";

export interface CatalogItem {
  id: string;
  tenant_id: string;
  category: "ferragem" | "puxador" | "fundo" | "fita_borda" | "material" | "acabamento" | "cor" | "corredica" | "dobradica" | "porta_frente";
  name: string;
  description?: string;
  cost?: number;
  image_url?: string;
  created_at: string;
}

export function useModuleCatalog(tenantId: string | null) {
  const [catalogItems, setCatalogItems] = useState<CatalogItem[]>([]);
  const [loading, setLoading] = useState(false);

  const loadCatalog = useCallback(async () => {
    if (!tenantId) return;
    setLoading(true);
    const { data } = await supabase
      .from("module_catalog" as any)
      .select("*")
      .eq("tenant_id", tenantId)
      .order("category")
      .order("name");
    setCatalogItems((data as any[]) || []);
    setLoading(false);
  }, [tenantId]);

  useEffect(() => { loadCatalog(); }, [loadCatalog]);

  const addItem = useCallback(async (item: Omit<CatalogItem, "id" | "tenant_id" | "created_at">) => {
    if (!tenantId) return null;
    const { data, error } = await supabase
      .from("module_catalog" as any)
      .insert({ ...item, tenant_id: tenantId })
      .select()
      .single();
    if (error) { toast.error("Erro ao adicionar item ao catálogo"); return null; }
    toast.success("Item adicionado ao catálogo!");
    loadCatalog();
    return data;
  }, [tenantId, loadCatalog]);

  const updateItem = useCallback(async (id: string, updates: Partial<CatalogItem>) => {
    const { error } = await supabase
      .from("module_catalog" as any)
      .update(updates)
      .eq("id", id);
    if (error) { toast.error("Erro ao atualizar item"); return false; }
    loadCatalog();
    return true;
  }, [loadCatalog]);

  const deleteItem = useCallback(async (id: string) => {
    const { error } = await supabase
      .from("module_catalog" as any)
      .delete()
      .eq("id", id);
    if (error) { toast.error("Erro ao remover item"); return false; }
    toast.success("Item removido!");
    loadCatalog();
    return true;
  }, [loadCatalog]);

  const getByCategory = useCallback((category: CatalogItem["category"]) => {
    return catalogItems.filter(i => i.category === category);
  }, [catalogItems]);

  return { catalogItems, loading, loadCatalog, addItem, updateItem, deleteItem, getByCategory };
}
