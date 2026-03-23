import { useState, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  ArrowLeft, Upload, Box, BookOpen, FileText, Trash2, Eye,
  RefreshCw, Sparkles, Lock, CreditCard, Video,
} from "lucide-react";
import { toast } from "sonner";
import { AddonPurchaseCard } from "@/components/AddonPurchaseCard";
import { useSmartImport3D } from "@/hooks/useSmartImport3D";
import { useModuleCatalog } from "@/hooks/useModuleCatalog";
import { ProjectThumbnail } from "./ProjectThumbnail";
import { useCompanySettings } from "@/hooks/useCompanySettings";
import { GLBViewer } from "./GLBViewer";
import { ModuleLibraryPanel } from "./ModuleLibraryPanel";
import { BudgetGenerator } from "./BudgetGenerator";
import { SmartBudgetPanel } from "./SmartBudgetPanel";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

interface SmartImport3DViewProps {
  tenantId: string | null;
  onBack: () => void;
}

export function SmartImport3DView({ tenantId, onBack }: SmartImport3DViewProps) {
  const {
    projects, selectedProject, setSelectedProject, projectObjects,
    library, loading, addonActive, checkingAccess,
    uploadProject, loadProjectObjects, classifyObject,
    addToLibrary, updateLibraryItem, deleteLibraryItem,
    deleteProject, generateBudget, refresh,
  } = useSmartImport3D(tenantId);
  const { settings } = useCompanySettings();
  const { catalogItems, addItem: addCatalogItem, updateItem: updateCatalogItem, deleteItem: deleteCatalogItem } = useModuleCatalog(tenantId);

  const [uploading, setUploading] = useState(false);
  const [projectName, setProjectName] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [selectedObjects, setSelectedObjects] = useState<any[]>([]);

  if (checkingAccess) {
    return (
      <div className="flex items-center justify-center py-20 text-muted-foreground">
        <RefreshCw className="h-5 w-5 animate-spin mr-2" /> Verificando acesso...
      </div>
    );
  }

  if (!addonActive) {
    return (
      <AddonPurchaseCard
        addonName="3D Smart Import"
        addonSlug="smart_import_3d"
        price="R$ 197"
        priceExtra="/mês"
        description="Importe projetos 3D (.GLB, .DXF, .OBJ, .FBX, .STL), visualize ambientes em 3D interativo, selecione módulos, crie biblioteca inteligente e gere orçamentos automáticos."
        features={[
          { label: "Visualização 3D", icon: <Box className="h-5 w-5" /> },
          { label: "Biblioteca Inteligente", icon: <BookOpen className="h-5 w-5" /> },
          { label: "Orçamento Automático", icon: <FileText className="h-5 w-5" /> },
        ]}
        icon={<Box className="h-8 w-8 text-primary" />}
        onBack={onBack}
      />
    );
  }

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const ext = file.name.toLowerCase();
    const validExts = [".glb", ".dxf", ".obj", ".fbx", ".stl"];
    if (!validExts.some(v => ext.endsWith(v))) {
      toast.error("Formatos aceitos: .GLB, .DXF, .OBJ, .FBX, .STL");
      return;
    }

    if (!projectName.trim()) {
      toast.error("Informe o nome do projeto");
      return;
    }

    setUploading(true);
    await uploadProject(file, projectName.trim());
    setUploading(false);
    setProjectName("");
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const handleObjectSelect = (name: string, metadata: any) => {
    setSelectedObjects(prev => {
      const exists = prev.find(o => o.name === name);
      if (exists) return prev;
      return [...prev, { name, metadata, id: crypto.randomUUID() }];
    });
    toast.info(`Objeto selecionado: ${name}`);
  };

  const openProject = (project: any) => {
    setSelectedProject(project);
    loadProjectObjects(project.id);
    setSelectedObjects([]);
  };

  // If viewing a project
  if (selectedProject) {
    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="sm" onClick={() => setSelectedProject(null)} className="gap-1">
              <ArrowLeft className="h-4 w-4" /> Voltar
            </Button>
            <h3 className="font-semibold text-foreground flex items-center gap-2">
              <Box className="h-5 w-5 text-primary" /> {selectedProject.name}
            </h3>
          </div>
        </div>

        {/* 3D Viewer */}
        <GLBViewer fileUrl={selectedProject.file_url} onObjectSelect={handleObjectSelect} />

        {/* Selected objects and budget */}
        <div className="space-y-4">
          {/* Object selection panel */}
          <Card>
            <CardContent className="p-4 space-y-3">
              <h4 className="text-sm font-semibold text-foreground">
                Objetos Selecionados ({selectedObjects.length})
              </h4>
              {selectedObjects.length === 0 ? (
                <p className="text-xs text-muted-foreground">
                  Clique nos objetos do modelo 3D para selecioná-los
                </p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Nome</TableHead>
                      <TableHead>Info</TableHead>
                      <TableHead className="w-10"></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {selectedObjects.map(obj => (
                      <TableRow key={obj.id}>
                        <TableCell className="text-sm">{obj.name}</TableCell>
                        <TableCell className="text-xs text-muted-foreground">
                          {obj.metadata?.geometry?.vertices ? `${obj.metadata.geometry.vertices} vértices` : "—"}
                        </TableCell>
                        <TableCell>
                          <Button variant="ghost" size="icon" className="h-6 w-6 text-destructive"
                            onClick={() => setSelectedObjects(prev => prev.filter(o => o.id !== obj.id))}>
                            <Trash2 className="h-3 w-3" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>

          {/* Smart Budget Engine */}
          <SmartBudgetPanel
            projectName={selectedProject.name}
            objects={projectObjects}
            library={library}
            tenantId={tenantId}
            storeName={settings.company_name}
          />
        </div>
      </div>
    );
  }

  // Main view - projects list
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="sm" onClick={onBack} className="gap-1">
            <ArrowLeft className="h-4 w-4" /> Voltar
          </Button>
          <h2 className="text-xl font-bold text-foreground flex items-center gap-2">
            <Box className="h-6 w-6 text-primary" /> 3D Smart Import
          </h2>
          <Badge variant="secondary" className="text-xs">ADD-ON</Badge>
        </div>
        <Button variant="outline" size="sm" onClick={refresh} className="gap-1.5">
          <RefreshCw className="h-3.5 w-3.5" /> Atualizar
        </Button>
      </div>

      <Tabs defaultValue="projetos" className="space-y-4">
        <TabsList>
          <TabsTrigger value="projetos" className="gap-1.5">
            <Box className="h-4 w-4" /> Projetos 3D
          </TabsTrigger>
          <TabsTrigger value="biblioteca" className="gap-1.5">
            <BookOpen className="h-4 w-4" /> Biblioteca
          </TabsTrigger>
        </TabsList>

        <TabsContent value="projetos" className="space-y-4">
          {/* Upload area */}
          <Card>
            <CardContent className="p-4 space-y-3">
              <h4 className="text-sm font-semibold text-foreground flex items-center gap-2">
                <Upload className="h-4 w-4 text-primary" /> Importar Projeto 3D
              </h4>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <div className="md:col-span-1">
                  <Label className="text-xs">Nome do Projeto</Label>
                  <Input className="h-9 mt-1" placeholder="Ex: Cozinha Planejada"
                    value={projectName} onChange={e => setProjectName(e.target.value)} />
                </div>
                <div className="md:col-span-1">
                  <Label className="text-xs">Arquivo 3D</Label>
                  <input ref={fileInputRef} type="file" accept=".glb,.dxf,.obj,.fbx,.stl"
                    onChange={handleUpload} className="hidden" />
                  <Button variant="outline" className="w-full h-9 mt-1 gap-1.5 text-xs"
                    onClick={() => {
                      if (!projectName.trim()) {
                        toast.error("Informe o nome do projeto antes de selecionar o arquivo");
                        return;
                      }
                      fileInputRef.current?.click();
                    }} disabled={uploading}>
                    <Upload className="h-3.5 w-3.5" /> {uploading ? "Enviando..." : "Selecionar Arquivo 3D"}
                  </Button>
                </div>
                <div className="flex items-end">
                  <p className="text-[10px] text-muted-foreground leading-relaxed">
                    Formatos suportados: .GLB, .DXF, .OBJ, .FBX, .STL — Exporte do Promob, SketchUp, 3ds Max, AutoCAD, Blender, etc.
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Projects list */}
          {loading ? (
            <div className="flex items-center justify-center py-10">
              <RefreshCw className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : projects.length === 0 ? (
            <Card>
              <CardContent className="p-12 text-center space-y-3">
                <Box className="h-14 w-14 text-muted-foreground mx-auto" />
                <h4 className="text-lg font-semibold text-foreground">Nenhum projeto importado</h4>
                <p className="text-sm text-muted-foreground max-w-md mx-auto">
                  Importe seu primeiro arquivo 3D (.GLB, .DXF, .OBJ, .FBX, .STL) para visualizar, selecionar módulos e gerar orçamentos automaticamente.
                </p>
              </CardContent>
            </Card>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {projects.map(project => (
                <Card key={project.id} className="hover:border-primary/50 transition-colors cursor-pointer"
                  onClick={() => openProject(project)}>
                  <CardContent className="p-4 space-y-2">
                    <div className="flex items-center justify-between">
                      <h5 className="font-semibold text-sm text-foreground truncate">{project.name}</h5>
                      <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive shrink-0"
                        onClick={e => { e.stopPropagation(); deleteProject(project.id); }}>
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                    <ProjectThumbnail
                      projectId={project.id}
                      fileUrl={project.file_url}
                      thumbnailUrl={project.thumbnail_url}
                      name={project.name}
                    />
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] text-muted-foreground">
                        {format(new Date(project.created_at), "dd/MM/yy HH:mm", { locale: ptBR })}
                      </span>
                      <Button variant="outline" size="sm" className="h-7 text-xs gap-1">
                        <Eye className="h-3 w-3" /> Abrir
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="biblioteca">
          <ModuleLibraryPanel
            library={library}
            catalogItems={catalogItems}
            onAdd={addToLibrary}
            onUpdate={updateLibraryItem}
            onDelete={deleteLibraryItem}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}
