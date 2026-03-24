import { useState, useEffect, useCallback, useMemo } from "react";
import { supabase } from "@/lib/supabaseClient";
import { toast } from "sonner";

export interface ModuleCategory {
  id: string;
  tenant_id: string;
  parent_id: string | null;
  name: string;
  icon: string | null;
  sort_order: number;
  created_at: string;
}

export interface CategoryTreeNode extends ModuleCategory {
  children: CategoryTreeNode[];
}

export function useModuleCategories(tenantId: string | null) {
  const [categories, setCategories] = useState<ModuleCategory[]>([]);
  const [loading, setLoading] = useState(false);

  const loadCategories = useCallback(async () => {
    if (!tenantId) return;
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("module_categories" as any)
        .select("*")
        .eq("tenant_id", tenantId)
        .order("sort_order")
        .order("name");

      if (error) {
        // Table may not exist yet — fail silently
        console.warn("module_categories not available:", error.message);
        setCategories([]);
      } else {
        setCategories((data as any[]) || []);
      }
    } catch {
      setCategories([]);
    }
    setLoading(false);
  }, [tenantId]);

  useEffect(() => { loadCategories(); }, [loadCategories]);

  // Build tree structure
  const tree = useMemo((): CategoryTreeNode[] => {
    const map = new Map<string, CategoryTreeNode>();
    const roots: CategoryTreeNode[] = [];

    // Initialize nodes
    categories.forEach((cat) => {
      map.set(cat.id, { ...cat, children: [] });
    });

    // Link children to parents
    categories.forEach((cat) => {
      const node = map.get(cat.id)!;
      if (cat.parent_id && map.has(cat.parent_id)) {
        map.get(cat.parent_id)!.children.push(node);
      } else {
        roots.push(node);
      }
    });

    return roots;
  }, [categories]);

  const addCategory = useCallback(async (
    name: string,
    parentId: string | null = null,
    icon: string | null = null
  ) => {
    if (!tenantId) return null;
    const { data, error } = await supabase
      .from("module_categories" as any)
      .insert({
        tenant_id: tenantId,
        parent_id: parentId,
        name,
        icon,
        sort_order: categories.length,
      })
      .select()
      .single();

    if (error) {
      toast.error("Erro ao criar categoria");
      return null;
    }
    toast.success(`Categoria "${name}" criada!`);
    loadCategories();
    return data;
  }, [tenantId, categories.length, loadCategories]);

  const updateCategory = useCallback(async (id: string, updates: Partial<ModuleCategory>) => {
    const { error } = await supabase
      .from("module_categories" as any)
      .update(updates)
      .eq("id", id);

    if (error) {
      toast.error("Erro ao atualizar categoria");
      return false;
    }
    loadCategories();
    return true;
  }, [loadCategories]);

  const deleteCategory = useCallback(async (id: string) => {
    const { error } = await supabase
      .from("module_categories" as any)
      .delete()
      .eq("id", id);

    if (error) {
      toast.error("Erro ao remover categoria");
      return false;
    }
    toast.success("Categoria removida!");
    loadCategories();
    return true;
  }, [loadCategories]);

  const reorder = useCallback(async (orderedIds: string[]) => {
    const updates = orderedIds.map((id, idx) =>
      supabase.from("module_categories" as any).update({ sort_order: idx }).eq("id", id)
    );
    await Promise.all(updates);
    loadCategories();
  }, [loadCategories]);

  return {
    categories,
    tree,
    loading,
    loadCategories,
    addCategory,
    updateCategory,
    deleteCategory,
    reorder,
  };
}
