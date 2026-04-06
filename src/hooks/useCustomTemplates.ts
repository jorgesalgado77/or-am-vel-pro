import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/lib/supabaseClient";
import { useTenant } from "@/contexts/TenantContext";
import { toast } from "sonner";

export interface CustomTemplate {
  id: string;
  tenant_id: string;
  name: string;
  description: string;
  icon: string;
  pages_data: any[];
  created_at: string;
  updated_at: string;
}

export function useCustomTemplates() {
  const { tenantId } = useTenant();
  const [templates, setTemplates] = useState<CustomTemplate[]>([]);
  const [loading, setLoading] = useState(false);

  const fetchTemplates = useCallback(async () => {
    if (!tenantId) return;
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("custom_contract_templates")
        .select("*")
        .eq("tenant_id", tenantId)
        .order("updated_at", { ascending: false });

      if (error) throw error;
      setTemplates((data as CustomTemplate[]) || []);
    } catch (err: any) {
      console.error("Erro ao carregar templates:", err);
    } finally {
      setLoading(false);
    }
  }, [tenantId]);

  useEffect(() => {
    fetchTemplates();
  }, [fetchTemplates]);

  const saveTemplate = useCallback(async (
    name: string,
    description: string,
    pagesData: any[],
    icon = "📝"
  ): Promise<boolean> => {
    if (!tenantId) {
      toast.error("Tenant não identificado");
      return false;
    }
    try {
      const { error } = await supabase
        .from("custom_contract_templates")
        .insert({
          tenant_id: tenantId,
          name,
          description,
          icon,
          pages_data: pagesData,
        });

      if (error) throw error;
      toast.success(`Template "${name}" salvo com sucesso!`);
      await fetchTemplates();
      return true;
    } catch (err: any) {
      console.error("Erro ao salvar template:", err);
      toast.error("Erro ao salvar template: " + (err.message || ""));
      return false;
    }
  }, [tenantId, fetchTemplates]);

  const updateTemplate = useCallback(async (
    id: string,
    updates: { name?: string; description?: string; icon?: string; pages_data?: any[] }
  ): Promise<boolean> => {
    try {
      const { error } = await supabase
        .from("custom_contract_templates")
        .update({ ...updates, updated_at: new Date().toISOString() })
        .eq("id", id);

      if (error) throw error;
      toast.success("Template atualizado!");
      await fetchTemplates();
      return true;
    } catch (err: any) {
      console.error("Erro ao atualizar template:", err);
      toast.error("Erro ao atualizar: " + (err.message || ""));
      return false;
    }
  }, [fetchTemplates]);

  const deleteTemplate = useCallback(async (id: string): Promise<boolean> => {
    try {
      const { error } = await supabase
        .from("custom_contract_templates")
        .delete()
        .eq("id", id);

      if (error) throw error;
      toast.success("Template excluído!");
      await fetchTemplates();
      return true;
    } catch (err: any) {
      console.error("Erro ao excluir template:", err);
      toast.error("Erro ao excluir: " + (err.message || ""));
      return false;
    }
  }, [fetchTemplates]);

  return {
    templates,
    loading,
    fetchTemplates,
    saveTemplate,
    updateTemplate,
    deleteTemplate,
  };
}
