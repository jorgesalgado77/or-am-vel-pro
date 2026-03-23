import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/lib/supabaseClient";
import { toast } from "sonner";

export interface ImportedProject {
  id: string;
  tenant_id: string;
  name: string;
  file_url: string;
  thumbnail_url?: string;
  created_at: string;
}

export interface ProjectObject {
  id: string;
  project_id: string;
  name: string;
  type: "module" | "accessory" | "undefined";
  position: any;
  metadata: any;
  cost?: number;
}

export interface ModuleLibraryItem {
  id: string;
  tenant_id: string;
  name: string;
  type: string;
  cost: number;
  materials: string;
  created_at: string;
}

export function useSmartImport3D(tenantId: string | null) {
  const [projects, setProjects] = useState<ImportedProject[]>([]);
  const [selectedProject, setSelectedProject] = useState<ImportedProject | null>(null);
  const [projectObjects, setProjectObjects] = useState<ProjectObject[]>([]);
  const [library, setLibrary] = useState<ModuleLibraryItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [addonActive, setAddonActive] = useState(false);
  const [checkingAccess, setCheckingAccess] = useState(true);

  // Check addon access
  const checkAccess = useCallback(async () => {
    if (!tenantId) { setCheckingAccess(false); return; }
    setCheckingAccess(true);

    // Check recursos_vip or company_addons
    const { data: tenant } = await supabase
      .from("tenants")
      .select("recursos_vip")
      .eq("id", tenantId)
      .single();

    const vip = (tenant as any)?.recursos_vip;
    if (vip?.smart_import_3d) {
      setAddonActive(true);
      setCheckingAccess(false);
      return;
    }

    // Check company_addons table
    const { data: companyAddon } = await supabase
      .from("company_addons" as any)
      .select("status")
      .eq("company_id", tenantId)
      .eq("status", "active")
      .limit(1);

    const addons = companyAddon as any[];
    setAddonActive(addons && addons.length > 0);
    setCheckingAccess(false);
  }, [tenantId]);

  useEffect(() => { checkAccess(); }, [checkAccess]);

  // Load projects
  const loadProjects = useCallback(async () => {
    if (!tenantId || !addonActive) return;
    setLoading(true);
    const { data } = await supabase
      .from("imported_projects" as any)
      .select("*")
      .eq("company_id", tenantId)
      .order("created_at", { ascending: false });
    setProjects((data as any[]) || []);
    setLoading(false);
  }, [tenantId, addonActive]);

  useEffect(() => { loadProjects(); }, [loadProjects]);

  // Load project objects
  const loadProjectObjects = useCallback(async (projectId: string) => {
    const { data } = await supabase
      .from("project_objects" as any)
      .select("*")
      .eq("project_id", projectId);
    setProjectObjects((data as any[]) || []);
  }, []);

  // Load module library
  const loadLibrary = useCallback(async () => {
    if (!tenantId) return;
    const { data } = await supabase
      .from("module_library" as any)
      .select("*")
      .eq("company_id", tenantId)
      .order("name");
    setLibrary((data as any[]) || []);
  }, [tenantId]);

  useEffect(() => { if (addonActive) loadLibrary(); }, [loadLibrary, addonActive]);

  // Upload GLB file
  const uploadProject = async (file: File, projectName: string): Promise<ImportedProject | null> => {
    if (!tenantId) return null;

    const filePath = `${tenantId}/3d-projects/${Date.now()}-${file.name}`;
    const { error: uploadError } = await supabase.storage
      .from("smart-import-3d")
      .upload(filePath, file, { contentType: "model/gltf-binary" });

    if (uploadError) {
      toast.error("Erro ao enviar arquivo 3D");
      console.error(uploadError);
      return null;
    }

    const { data: urlData } = supabase.storage
      .from("smart-import-3d")
      .getPublicUrl(filePath);

    const { data, error } = await supabase
      .from("imported_projects" as any)
      .insert({
        company_id: tenantId,
        name: projectName,
        file_url: urlData.publicUrl,
      })
      .select()
      .single();

    if (error) {
      toast.error("Erro ao salvar projeto");
      return null;
    }

    toast.success("Projeto 3D importado com sucesso!");
    loadProjects();
    return data as any;
  };

  // Save object classification
  const classifyObject = async (objectId: string, type: "module" | "accessory" | "undefined", cost?: number) => {
    const { error } = await supabase
      .from("project_objects" as any)
      .update({ type, cost: cost || null })
      .eq("id", objectId);

    if (error) {
      toast.error("Erro ao classificar objeto");
      return false;
    }
    // Refresh
    if (selectedProject) loadProjectObjects(selectedProject.id);
    return true;
  };

  // Add to module library
  const addToLibrary = async (item: Omit<ModuleLibraryItem, "id" | "tenant_id" | "created_at">) => {
    if (!tenantId) return null;
    const { data, error } = await supabase
      .from("module_library" as any)
      .insert({ ...item, company_id: tenantId })
      .select()
      .single();

    if (error) {
      toast.error("Erro ao adicionar à biblioteca");
      return null;
    }
    toast.success("Módulo adicionado à biblioteca!");
    loadLibrary();
    return data;
  };

  // Update library item
  const updateLibraryItem = async (id: string, updates: Partial<ModuleLibraryItem>) => {
    const { error } = await supabase
      .from("module_library" as any)
      .update(updates)
      .eq("id", id);

    if (error) {
      toast.error("Erro ao atualizar módulo");
      return false;
    }
    loadLibrary();
    return true;
  };

  // Delete library item
  const deleteLibraryItem = async (id: string) => {
    const { error } = await supabase
      .from("module_library" as any)
      .delete()
      .eq("id", id);

    if (error) {
      toast.error("Erro ao remover módulo");
      return false;
    }
    loadLibrary();
    return true;
  };

  // Delete project
  const deleteProject = async (id: string) => {
    const { error } = await supabase
      .from("imported_projects" as any)
      .delete()
      .eq("id", id);

    if (error) {
      toast.error("Erro ao remover projeto");
      return false;
    }
    toast.success("Projeto removido!");
    loadProjects();
    return true;
  };

  // Generate budget from objects
  const generateBudget = () => {
    const modules = projectObjects.filter(o => o.type === "module");
    const accessories = projectObjects.filter(o => o.type === "accessory");

    const modulesTotal = modules.reduce((sum, m) => sum + (m.cost || 0), 0);
    const accessoriesTotal = accessories.reduce((sum, a) => sum + (a.cost || 0), 0);

    return {
      modules,
      accessories,
      modulesTotal,
      accessoriesTotal,
      total: modulesTotal + accessoriesTotal,
      itemCount: modules.length + accessories.length,
    };
  };

  return {
    projects, selectedProject, setSelectedProject, projectObjects,
    library, loading, addonActive, checkingAccess,
    uploadProject, loadProjectObjects, classifyObject,
    addToLibrary, updateLibraryItem, deleteLibraryItem,
    deleteProject, generateBudget, loadProjects, loadLibrary,
    refresh: () => { loadProjects(); loadLibrary(); },
  };
}
