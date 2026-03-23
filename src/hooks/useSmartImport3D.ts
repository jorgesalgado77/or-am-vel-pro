import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/lib/supabaseClient";
import { toast } from "sonner";
import { getSmartImportContentType, persistProjectThumbnail } from "@/components/smartimport/thumbnailRenderer";

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
  width?: number;
  height?: number;
  depth?: number;
  ferragem_id?: string;
  ferragem_name?: string;
  puxador_id?: string;
  puxador_name?: string;
  fundo_tipo_id?: string;
  fundo_tipo_name?: string;
  cor_caixa?: string;
  cor_porta?: string;
  cor_tamponamento?: string;
  cor_fita_borda?: string;
}

export interface UploadProgress {
  stage: "uploading" | "saving" | "thumbnail" | "done";
  percent: number;
  label: string;
}

export function useSmartImport3D(tenantId: string | null) {
  const [projects, setProjects] = useState<ImportedProject[]>([]);
  const [selectedProject, setSelectedProject] = useState<ImportedProject | null>(null);
  const [projectObjects, setProjectObjects] = useState<ProjectObject[]>([]);
  const [library, setLibrary] = useState<ModuleLibraryItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [addonActive, setAddonActive] = useState(false);
  const [checkingAccess, setCheckingAccess] = useState(true);
  const [uploadProgress, setUploadProgress] = useState<UploadProgress | null>(null);

  // Check addon access
  const checkAccess = useCallback(async () => {
    if (!tenantId) { setCheckingAccess(false); return; }
    setCheckingAccess(true);

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

  // Upload 3D file — non-blocking thumbnail generation
  const uploadProject = async (file: File, projectName: string): Promise<ImportedProject | null> => {
    if (!tenantId) return null;

    try {
      // Stage 1: Upload file
      setUploadProgress({ stage: "uploading", percent: 20, label: "Enviando arquivo 3D..." });

      const filePath = `${tenantId}/3d-projects/${Date.now()}-${file.name}`;
      const { error: uploadError } = await supabase.storage
        .from("smart-import-3d")
        .upload(filePath, file, { contentType: getSmartImportContentType(file) });

      if (uploadError) {
        toast.error("Erro ao enviar arquivo 3D");
        console.error(uploadError);
        setUploadProgress(null);
        return null;
      }

      setUploadProgress({ stage: "saving", percent: 60, label: "Salvando projeto..." });

      const { data: urlData } = supabase.storage
        .from("smart-import-3d")
        .getPublicUrl(filePath);

      // Stage 2: Save project record
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
        setUploadProgress(null);
        return null;
      }

      const project = data as any;

      // Stage 3: Add project to list immediately (no waiting for thumbnail)
      setProjects((prev) => [project, ...prev]);
      toast.success("Projeto 3D importado com sucesso!");

      setUploadProgress({ stage: "thumbnail", percent: 85, label: "Gerando miniatura..." });

      // Generate thumbnail in background — don't block
      persistProjectThumbnail(project.id, urlData.publicUrl)
        .then((thumbnailUrl) => {
          setProjects((prev) =>
            prev.map((p) => p.id === project.id ? { ...p, thumbnail_url: thumbnailUrl } : p)
          );
        })
        .catch((err) => {
          console.warn("Thumbnail generation failed:", err);
        })
        .finally(() => {
          setUploadProgress({ stage: "done", percent: 100, label: "Concluído!" });
          setTimeout(() => setUploadProgress(null), 1500);
        });

      return project as ImportedProject;
    } catch (err) {
      console.error("Upload error:", err);
      toast.error("Erro inesperado no upload");
      setUploadProgress(null);
      return null;
    }
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
    library, loading, addonActive, checkingAccess, uploadProgress,
    uploadProject, loadProjectObjects, classifyObject,
    addToLibrary, updateLibraryItem, deleteLibraryItem,
    deleteProject, generateBudget, loadProjects, loadLibrary,
    refresh: () => { loadProjects(); loadLibrary(); },
  };
}
