import { useState, useRef, useEffect, useCallback, useMemo } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Slider } from "@/components/ui/slider";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Plus, Minus, Layers, Box, RulerIcon, Wrench, Save, RotateCcw,
  PanelLeftClose, PanelLeft, Package, Palette, LayoutTemplate, Copy, Square,
  Upload, ImageIcon,
} from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import type {
  ParametricModule, InternalComponent, ComponentType, ModuleBOM, ModuleType,
} from "@/types/parametricModule";
import { MODULE_PRESETS, SHEET_THICKNESSES, BACK_THICKNESSES } from "@/types/parametricModule";
import { calculateInternalSpans, generateBOM, redistributeShelves, snapToGrid } from "@/lib/spanEngine";
import { generateParametricGeometry, type GeometryOptions, type MaterialOverrides, type WallOverrides } from "@/lib/parametricGeometry";
import type { CatalogItem } from "@/hooks/useModuleCatalog";
import { usePersistedFormState } from "@/hooks/usePersistedFormState";

interface ParametricEditorProps {
  onSave?: (module: ParametricModule) => void;
  initialModule?: ParametricModule | null;
  tenantId?: string | null;
  catalogItems?: CatalogItem[];
}

function createDefaultModule(): ParametricModule {
  return {
    id: crypto.randomUUID(),
    name: "Novo Módulo",
    moduleType: "custom",
    width: 600,
    height: 720,
    depth: 500,
    thickness: 18,
    backThickness: 6,
    baseboardHeight: 0,
    verticalDivisions: 0,
    components: [],
    slots: [],
  };
}

interface WallConfig {
  enabled: boolean;
  width: number;
  height: number;
  depth: number;
  color: string; // hex string
}

interface DuplicatedModule {
  id: string;
  module: ParametricModule;
  positionX: number;
  positionZ: number;
}

interface TextureSlots {
  body?: string; // data URL
  door?: string;
  shelf?: string;
  back?: string;
  drawer?: string;
  wall?: string;
}

interface FurnitureColors {
  body: string;
  door: string;
  shelf: string;
  back: string;
  drawer: string;
}

const WALL_COLOR_OPTIONS = [
  { label: "Padrão", value: "#e8e0d8" },
  { label: "Preta", value: "#1a1a1a" },
  { label: "Cinza Claro", value: "#d4d4d4" },
  { label: "Cinza Escuro", value: "#525252" },
];

const FURNITURE_COLOR_OPTIONS = [
  { label: "Madeira Clara", value: "#d4a574" },
  { label: "Madeira Escura", value: "#8b6914" },
  { label: "Branco", value: "#fafafa" },
  { label: "Preto", value: "#1a1a1a" },
  { label: "Cinza", value: "#9ca3af" },
  { label: "Carvalho", value: "#c4a060" },
  { label: "Tabaco", value: "#6b4226" },
  { label: "Wengue", value: "#3c2415" },
];

interface PersistedBuilderState {
  module: ParametricModule;
  corCaixa: string;
  corPorta: string;
  wall: WallConfig;
  duplicates: DuplicatedModule[];
  furnitureColors: FurnitureColors;
  textureSlots: TextureSlots;
}

const INITIAL_PERSISTED: PersistedBuilderState = {
  module: createDefaultModule(),
  corCaixa: "",
  corPorta: "",
  wall: { enabled: false, width: 3000, height: 2700, depth: 100, color: "#e8e0d8" },
  duplicates: [],
  furnitureColors: { body: "#d4a574", door: "#fafafa", shelf: "#d4a574", back: "#d4a574", drawer: "#c4a060" },
  textureSlots: {},
};

export function ParametricEditor({ onSave, initialModule, tenantId, catalogItems = [] }: ParametricEditorProps) {
  const [persisted, updatePersisted, clearPersisted] = usePersistedFormState<PersistedBuilderState>(
    "parametric-builder",
    initialModule ? { ...INITIAL_PERSISTED, module: initialModule } : INITIAL_PERSISTED
  );

  const module = persisted.module;
  const corCaixa = persisted.corCaixa;
  const corPorta = persisted.corPorta;
  const wall = persisted.wall;
  const duplicates = persisted.duplicates;
  const furnitureColors = persisted.furnitureColors ?? INITIAL_PERSISTED.furnitureColors;
  const textureSlots = persisted.textureSlots ?? {};

  // Loaded THREE.Texture cache (not persisted, rebuilt from dataURLs)
  const textureCache = useRef<Record<string, any>>({});

  const setModule = useCallback((updater: ParametricModule | ((prev: ParametricModule) => ParametricModule)) => {
    updatePersisted({ module: typeof updater === "function" ? updater(module) : updater });
  }, [module, updatePersisted]);

  const setCorCaixa = useCallback((v: string) => updatePersisted({ corCaixa: v }), [updatePersisted]);
  const setCorPorta = useCallback((v: string) => updatePersisted({ corPorta: v }), [updatePersisted]);
  const setWall = useCallback((w: Partial<WallConfig>) => updatePersisted({ wall: { ...wall, ...w } }), [wall, updatePersisted]);
  const setFurnitureColor = useCallback((key: keyof FurnitureColors, value: string) => {
    updatePersisted({ furnitureColors: { ...furnitureColors, [key]: value } });
  }, [furnitureColors, updatePersisted]);

  const handleTextureUpload = useCallback((slot: keyof TextureSlots, file: File) => {
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = reader.result as string;
      updatePersisted({ textureSlots: { ...textureSlots, [slot]: dataUrl } });
      // Invalidate cache so it reloads
      delete textureCache.current[slot];
      toast.success(`Textura "${slot}" aplicada!`);
    };
    reader.readAsDataURL(file);
  }, [textureSlots, updatePersisted]);

  const removeTexture = useCallback((slot: keyof TextureSlots) => {
    const updated = { ...textureSlots };
    delete updated[slot];
    updatePersisted({ textureSlots: updated });
    delete textureCache.current[slot];
  }, [textureSlots, updatePersisted]);

  const [showPanel, setShowPanel] = useState(true);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const threeRef = useRef<any>(null);
  const needsRenderRef = useRef(true);
  const animFrameRef = useRef(0);
  const dragRef = useRef<{ id: string; startX: number; startZ: number; mouseX: number; mouseY: number } | null>(null);

  // Computed values
  const spans = useMemo(() => calculateInternalSpans(module), [module]);
  const bom = useMemo(() => generateBOM(module), [module]);

  // Catalog items by category
  const cores = useMemo(() => catalogItems.filter((i) => i.category === "cor"), [catalogItems]);
  const materiais = useMemo(() => catalogItems.filter((i) => i.category === "material" || i.category === "acabamento"), [catalogItems]);

  // Apply Preset
  const applyPreset = useCallback((presetType: ModuleType) => {
    if (presetType === "custom") return;
    const preset = MODULE_PRESETS.find((p) => p.type === presetType);
    if (!preset) return;
    setModule((prev) => ({
      ...prev,
      name: preset.label,
      moduleType: preset.type,
      width: preset.width,
      height: preset.height,
      depth: preset.depth,
      thickness: preset.thickness,
      backThickness: preset.backThickness,
      baseboardHeight: preset.baseboardHeight,
      components: [],
      slots: [],
      verticalDivisions: 0,
    }));
    toast.success(`Preset "${preset.label}" aplicado!`);
  }, [setModule]);

  // Duplicate module
  const duplicateModule = useCallback(() => {
    const lastDup = duplicates.length > 0 ? duplicates[duplicates.length - 1] : null;
    const offsetX = lastDup ? lastDup.positionX + module.width + 50 : module.width + 50;
    const dup: DuplicatedModule = {
      id: crypto.randomUUID(),
      module: { ...module, id: crypto.randomUUID(), name: `${module.name} (cópia)` },
      positionX: offsetX,
      positionZ: 0,
    };
    updatePersisted({ duplicates: [...duplicates, dup] });
    toast.success("Módulo duplicado!");
  }, [module, duplicates, updatePersisted]);

  const removeDuplicate = useCallback((id: string) => {
    updatePersisted({ duplicates: duplicates.filter((d) => d.id !== id) });
  }, [duplicates, updatePersisted]);

  // ── 3D Preview ──
  useEffect(() => {
    let mounted = true;
    let renderer: any = null;

    (async () => {
      const THREE = await import("three");
      const { OrbitControls } = await import("three/examples/jsm/controls/OrbitControls.js");

      if (!mounted || !canvasRef.current) return;

      const container = canvasRef.current.parentElement!;
      const w = container.clientWidth;
      const h = container.clientHeight;

      renderer = new THREE.WebGLRenderer({ canvas: canvasRef.current, antialias: true, alpha: false });
      renderer.setSize(w, h);
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
      renderer.outputColorSpace = THREE.SRGBColorSpace;
      renderer.toneMapping = THREE.ACESFilmicToneMapping;
      renderer.toneMappingExposure = 1.4;

      const scene = new THREE.Scene();
      scene.background = new THREE.Color(0xf0f0f0);

      const camera = new THREE.PerspectiveCamera(50, w / h, 0.01, 100);
      camera.position.set(4, 3, 5);

      const controls = new OrbitControls(camera, renderer.domElement);
      controls.enableDamping = true;
      controls.dampingFactor = 0.08;
      controls.minDistance = 1;
      controls.maxDistance = 30;
      controls.addEventListener("change", () => { needsRenderRef.current = true; });

      scene.add(new THREE.AmbientLight(0xffffff, 1.2));
      const dl = new THREE.DirectionalLight(0xffffff, 1.8);
      dl.position.set(5, 10, 7);
      scene.add(dl);
      const dl2 = new THREE.DirectionalLight(0xffffff, 0.6);
      dl2.position.set(-4, 6, -3);
      scene.add(dl2);
      scene.add(new THREE.HemisphereLight(0xffffff, 0xe0e0e0, 0.8));

      const grid = new THREE.GridHelper(20, 20, 0xcccccc, 0xcccccc);
      (grid.material as any).opacity = 0.3;
      (grid.material as any).transparent = true;
      scene.add(grid);

      threeRef.current = { THREE, scene, renderer, camera, controls, moduleGroups: [] as any[] };
      needsRenderRef.current = true;

      renderer.domElement.style.touchAction = "none";

      const animate = () => {
        if (!mounted) return;
        animFrameRef.current = requestAnimationFrame(animate);
        controls.update();
        if (needsRenderRef.current) {
          renderer.render(scene, camera);
          needsRenderRef.current = false;
        }
      };
      animate();

      const onResize = () => {
        if (!canvasRef.current) return;
        const c = canvasRef.current.parentElement!;
        camera.aspect = c.clientWidth / c.clientHeight;
        camera.updateProjectionMatrix();
        renderer.setSize(c.clientWidth, c.clientHeight);
        needsRenderRef.current = true;
      };
      window.addEventListener("resize", onResize);

      return () => { window.removeEventListener("resize", onResize); };
    })();

    return () => {
      mounted = false;
      cancelAnimationFrame(animFrameRef.current);
      renderer?.dispose?.();
    };
  }, []);

  // ── Load textures from data URLs ──
  const loadTexturesForSlots = useCallback(async (THREE: any): Promise<{ matOverrides: MaterialOverrides; wallOv: WallOverrides }> => {
    const loader = new THREE.TextureLoader();
    const matOverrides: MaterialOverrides = {};
    const wallOv: WallOverrides = {};

    const hexToNum = (hex: string) => parseInt(hex.replace("#", ""), 16);

    // Furniture colors
    matOverrides.bodyColor = hexToNum(furnitureColors.body);
    matOverrides.doorColor = hexToNum(furnitureColors.door);
    matOverrides.shelfColor = hexToNum(furnitureColors.shelf);
    matOverrides.backColor = hexToNum(furnitureColors.back);
    matOverrides.drawerColor = hexToNum(furnitureColors.drawer);

    // Wall color
    wallOv.color = hexToNum(wall.color || "#e8e0d8");

    // Load textures from dataURLs
    const loadTex = (dataUrl: string, cacheKey: string): Promise<any> => {
      if (textureCache.current[cacheKey]) return Promise.resolve(textureCache.current[cacheKey]);
      return new Promise((resolve) => {
        loader.load(dataUrl, (tex: any) => {
          tex.colorSpace = THREE.SRGBColorSpace;
          tex.wrapS = THREE.RepeatWrapping;
          tex.wrapT = THREE.RepeatWrapping;
          textureCache.current[cacheKey] = tex;
          resolve(tex);
        }, undefined, () => resolve(null));
      });
    };

    const slots: [keyof TextureSlots, string][] = [
      ["body", "body"], ["door", "door"], ["shelf", "shelf"],
      ["back", "back"], ["drawer", "drawer"], ["wall", "wall"],
    ];

    await Promise.all(slots.map(async ([slot, key]) => {
      const dataUrl = textureSlots[slot];
      if (!dataUrl) return;
      const tex = await loadTex(dataUrl, key);
      if (!tex) return;
      if (slot === "wall") wallOv.texture = tex;
      else (matOverrides as any)[`${key}Texture`] = tex;
    }));

    return { matOverrides, wallOv };
  }, [furnitureColors, textureSlots, wall.color]);

  // ── Rebuild geometry when module/wall/duplicates/colors/textures change ──
  useEffect(() => {
    if (!threeRef.current) return;
    const { THREE, scene, moduleGroups } = threeRef.current;

    (async () => {
      // Remove old groups
      moduleGroups.forEach((g: any) => scene.remove(g));
      threeRef.current.moduleGroups = [];

      const { matOverrides, wallOv } = await loadTexturesForSlots(THREE);

      const opts: GeometryOptions = {};
      if (wall.enabled) {
        opts.wall = { width: wall.width, height: wall.height, depth: wall.depth };
        opts.wallOverrides = wallOv;
      }
      opts.materialOverrides = matOverrides;

      const mainGrp = generateParametricGeometry(THREE, module, opts);
      scene.add(mainGrp);
      threeRef.current.moduleGroups.push(mainGrp);

      duplicates.forEach((dup) => {
        const dupGrp = generateParametricGeometry(THREE, dup.module, { materialOverrides: matOverrides });
        dupGrp.position.x += dup.positionX * 0.01;
        dupGrp.position.z += dup.positionZ * 0.01;
        scene.add(dupGrp);
        threeRef.current.moduleGroups.push(dupGrp);
      });

      needsRenderRef.current = true;
    })();
  }, [module, wall, duplicates, furnitureColors, textureSlots, loadTexturesForSlots]);

  // ── Module update helpers ──
  const updateDimension = useCallback((key: "width" | "height" | "depth", value: number) => {
    setModule((prev) => {
      const updated = { ...prev, [key]: snapToGrid(value), moduleType: "custom" as ModuleType };
      return { ...updated, components: redistributeShelves(updated) };
    });
  }, [setModule]);

  const addComponent = useCallback((type: ComponentType) => {
    setModule((prev) => {
      const baseY = prev.thickness + (prev.baseboardHeight || 0);
      const ih = prev.height - prev.thickness * 2 - (prev.baseboardHeight || 0);
      const comp: InternalComponent = {
        id: crypto.randomUUID(),
        type,
        positionY: type === "divisoria" ? prev.width / 2 : baseY + ih / 2,
        thickness: prev.thickness,
        frontHeight: type === "gaveta" ? 180 : undefined,
      };
      const updated = { ...prev, components: [...prev.components, comp] };
      if (type === "prateleira") {
        return { ...updated, components: redistributeShelves(updated) };
      }
      return updated;
    });
  }, [setModule]);

  const removeComponent = useCallback((id: string) => {
    setModule((prev) => {
      const updated = { ...prev, components: prev.components.filter((c) => c.id !== id) };
      return { ...updated, components: redistributeShelves(updated) };
    });
  }, [setModule]);

  const handleSave = () => {
    onSave?.(module);
    clearPersisted();
    toast.success("Módulo salvo com sucesso!");
  };

  const handleReset = () => {
    clearPersisted();
    toast.info("Módulo resetado");
  };

  const shelfCount = module.components.filter((c) => c.type === "prateleira").length;
  const doorCount = module.components.filter((c) => c.type === "porta").length;
  const drawerCount = module.components.filter((c) => c.type === "gaveta").length;
  const dividerCount = module.components.filter((c) => c.type === "divisoria").length;

  return (
    <div className="flex gap-3 h-[650px]">
      <Button
        variant="ghost"
        size="icon"
        className="absolute top-2 left-2 z-30 md:hidden"
        onClick={() => setShowPanel(!showPanel)}
      >
        {showPanel ? <PanelLeftClose className="h-4 w-4" /> : <PanelLeft className="h-4 w-4" />}
      </Button>

      {/* ── Painel Lateral ── */}
      {showPanel && (
        <div className="w-full md:w-[360px] shrink-0 overflow-y-auto space-y-3 pr-1">
          {/* Preset Selector */}
          <Card>
            <CardContent className="p-3 space-y-2">
              <h4 className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                <LayoutTemplate className="h-3.5 w-3.5 text-primary" /> Tipo de Módulo
              </h4>
              <Select
                value={module.moduleType}
                onValueChange={(v) => applyPreset(v as ModuleType)}
              >
                <SelectTrigger className="h-8 text-xs">
                  <SelectValue placeholder="Selecionar módulo..." />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="custom">Personalizado</SelectItem>
                  {MODULE_PRESETS.map((p) => (
                    <SelectItem key={p.type} value={p.type}>
                      <div className="flex flex-col">
                        <span className="font-medium">{p.label}</span>
                        <span className="text-[10px] text-muted-foreground">{p.description} — {p.width}×{p.height}×{p.depth}mm</span>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {module.moduleType !== "custom" && (
                <Badge variant="outline" className="text-[10px]">
                  {MODULE_PRESETS.find((p) => p.type === module.moduleType)?.label}
                  {module.baseboardHeight > 0 && ` • Rodapé ${module.baseboardHeight}mm`}
                </Badge>
              )}
            </CardContent>
          </Card>

          {/* Nome */}
          <Card>
            <CardContent className="p-3 space-y-2">
              <Label className="text-xs font-medium">Nome do Módulo</Label>
              <Input
                value={module.name}
                onChange={(e) => setModule((p) => ({ ...p, name: e.target.value }))}
                className="h-8 text-sm"
              />
            </CardContent>
          </Card>

          {/* Dimensões */}
          <Card>
            <CardContent className="p-3 space-y-3">
              <h4 className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                <RulerIcon className="h-3.5 w-3.5 text-primary" /> Dimensões (mm)
              </h4>

              {[
                { label: "Largura (L)", key: "width" as const, min: 200, max: 2400 },
                { label: "Altura (A)", key: "height" as const, min: 200, max: 2700 },
                { label: "Profundidade (P)", key: "depth" as const, min: 200, max: 700 },
              ].map(({ label, key, min, max }) => (
                <div key={key} className="space-y-1">
                  <div className="flex items-center justify-between gap-2">
                    <Label className="text-[11px] whitespace-nowrap">{label}</Label>
                    <Input
                      type="number"
                      value={module[key]}
                      onChange={(e) => updateDimension(key, Number(e.target.value))}
                      className="h-6 w-20 text-[11px] text-right font-mono"
                      min={min}
                      max={max}
                    />
                  </div>
                  <Slider
                    value={[module[key]]}
                    min={min}
                    max={max}
                    step={10}
                    onValueChange={([v]) => updateDimension(key, v)}
                  />
                </div>
              ))}

              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1">
                  <Label className="text-[11px]">Espessura Chapa</Label>
                  <Select
                    value={String(module.thickness)}
                    onValueChange={(v) => {
                      const t = Number(v);
                      setModule((p) => {
                        const updated = { ...p, thickness: t, moduleType: "custom" as ModuleType };
                        updated.components = updated.components.map((c) =>
                          c.type === "prateleira" || c.type === "divisoria"
                            ? { ...c, thickness: t }
                            : c
                        );
                        return { ...updated, components: redistributeShelves(updated) };
                      });
                    }}
                  >
                    <SelectTrigger className="h-7 text-xs"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {SHEET_THICKNESSES.map((t) => (
                        <SelectItem key={t} value={String(t)}>{t}mm</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label className="text-[11px]">Espessura Fundo</Label>
                  <Select
                    value={String(module.backThickness)}
                    onValueChange={(v) => setModule((p) => ({ ...p, backThickness: Number(v) }))}
                  >
                    <SelectTrigger className="h-7 text-xs"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {BACK_THICKNESSES.map((t) => (
                        <SelectItem key={t} value={String(t)}>{t}mm</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {/* Rodapé */}
              <div className="space-y-1">
                <div className="flex items-center justify-between">
                  <Label className="text-[11px]">Rodapé (mm)</Label>
                  <Input
                    type="number"
                    value={module.baseboardHeight}
                    onChange={(e) => setModule((p) => {
                      const updated = { ...p, baseboardHeight: Math.max(0, Number(e.target.value)) };
                      return { ...updated, components: redistributeShelves(updated) };
                    })}
                    className="h-6 w-20 text-[11px] text-right font-mono"
                    min={0}
                    max={200}
                  />
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Parede */}
          <Card>
            <CardContent className="p-3 space-y-3">
              <div className="flex items-center justify-between">
                <h4 className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                  <Square className="h-3.5 w-3.5 text-primary" /> Parede
                </h4>
                <Button
                  variant={wall.enabled ? "default" : "outline"}
                  size="sm"
                  className="h-6 text-[10px] px-2"
                  onClick={() => setWall({ enabled: !wall.enabled })}
                >
                  {wall.enabled ? "Ativa" : "Inativa"}
                </Button>
              </div>
              {wall.enabled && (
                <div className="space-y-3">
                  <div className="grid grid-cols-3 gap-2">
                    {([
                      { label: "Largura", key: "width" as const },
                      { label: "Altura", key: "height" as const },
                      { label: "Profund.", key: "depth" as const },
                    ] as const).map(({ label, key }) => (
                      <div key={key} className="space-y-1">
                        <Label className="text-[10px]">{label} (mm)</Label>
                        <Input
                          type="number"
                          value={wall[key]}
                          onChange={(e) => setWall({ [key]: Number(e.target.value) })}
                          className="h-6 text-[10px] font-mono"
                        />
                      </div>
                    ))}
                  </div>
                  {/* Wall Color */}
                  <div className="space-y-1">
                    <Label className="text-[10px]">Cor da Parede</Label>
                    <div className="flex gap-1.5 flex-wrap">
                      {WALL_COLOR_OPTIONS.map((opt) => (
                        <button
                          key={opt.value}
                          onClick={() => setWall({ color: opt.value })}
                          className={`w-7 h-7 rounded-md border-2 transition-all ${
                            wall.color === opt.value ? "border-primary ring-2 ring-primary/30" : "border-border"
                          }`}
                          style={{ backgroundColor: opt.value }}
                          title={opt.label}
                        />
                      ))}
                      <input
                        type="color"
                        value={wall.color || "#e8e0d8"}
                        onChange={(e) => setWall({ color: e.target.value })}
                        className="w-7 h-7 rounded-md border border-border cursor-pointer"
                        title="Cor personalizada"
                      />
                    </div>
                  </div>
                  {/* Wall Texture */}
                  <div className="space-y-1">
                    <Label className="text-[10px] flex items-center gap-1">
                      <ImageIcon className="h-3 w-3" /> Textura da Parede
                    </Label>
                    <div className="flex items-center gap-2">
                      <label className="flex items-center gap-1 px-2 py-1 rounded-md bg-muted/50 border border-border cursor-pointer text-[10px] hover:bg-muted transition-colors">
                        <Upload className="h-3 w-3" /> Enviar
                        <input type="file" accept="image/*" className="hidden"
                          onChange={(e) => {
                            const f = e.target.files?.[0];
                            if (f) handleTextureUpload("wall", f);
                            e.target.value = "";
                          }}
                        />
                      </label>
                      {textureSlots.wall && (
                        <div className="flex items-center gap-1">
                          <img src={textureSlots.wall} className="h-7 w-7 rounded border border-border object-cover" alt="wall texture" />
                          <Button variant="ghost" size="icon" className="h-5 w-5" onClick={() => removeTexture("wall")}>
                            <Minus className="h-3 w-3" />
                          </Button>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Componentes Internos */}
          <Card>
            <CardContent className="p-3 space-y-3">
              <h4 className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                <Layers className="h-3.5 w-3.5 text-primary" /> Componentes Internos
              </h4>
              <div className="grid grid-cols-2 gap-2">
                {([
                  { type: "prateleira" as ComponentType, label: "Prateleira", count: shelfCount },
                  { type: "porta" as ComponentType, label: "Porta", count: doorCount },
                  { type: "gaveta" as ComponentType, label: "Gaveta", count: drawerCount },
                  { type: "divisoria" as ComponentType, label: "Divisória", count: dividerCount },
                ]).map(({ type, label, count }) => (
                  <div key={type} className="flex items-center justify-between bg-muted/50 rounded-md px-2 py-1.5">
                    <span className="text-[11px] font-medium text-foreground">{label}</span>
                    <div className="flex items-center gap-1">
                      <Button variant="ghost" size="icon" className="h-5 w-5"
                        onClick={() => {
                          const comps = module.components.filter((c) => c.type === type);
                          if (comps.length > 0) removeComponent(comps[comps.length - 1].id);
                        }}
                        disabled={count === 0}
                      >
                        <Minus className="h-3 w-3" />
                      </Button>
                      <Badge variant="secondary" className="text-[10px] min-w-[20px] text-center">{count}</Badge>
                      <Button variant="ghost" size="icon" className="h-5 w-5" onClick={() => addComponent(type)}>
                        <Plus className="h-3 w-3" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Vãos Calculados */}
          <Card>
            <CardContent className="p-3 space-y-2">
              <h4 className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                <RulerIcon className="h-3.5 w-3.5 text-primary" /> Vãos Internos
              </h4>
              <div className="grid grid-cols-2 gap-2 text-[11px]">
                <div className="bg-muted/50 rounded p-2">
                  <span className="text-muted-foreground">Vão Interno (A)</span>
                  <p className="font-mono font-semibold">{spans.vaoInterno}mm</p>
                </div>
                <div className="bg-muted/50 rounded p-2">
                  <span className="text-muted-foreground">Largura Interna</span>
                  <p className="font-mono font-semibold">{spans.larguraInterna}mm</p>
                </div>
                <div className="bg-muted/50 rounded p-2">
                  <span className="text-muted-foreground">Vão Livre</span>
                  <p className="font-mono font-semibold">{spans.vaoLivre.toFixed(0)}mm</p>
                </div>
                <div className="bg-muted/50 rounded p-2">
                  <span className="text-muted-foreground">Vão Unitário</span>
                  <p className="font-mono font-semibold">{spans.vaoUnitario}mm</p>
                </div>
                <div className="bg-muted/50 rounded p-2 col-span-2">
                  <span className="text-muted-foreground">Qtd. Vãos</span>
                  <p className="font-mono font-semibold">{spans.quantidadeVaos}</p>
                </div>
              </div>
              {module.baseboardHeight > 0 && (
                <p className="text-[10px] text-muted-foreground">
                  * Rodapé de {module.baseboardHeight}mm descontado do vão interno
                </p>
              )}
            </CardContent>
          </Card>

          {/* Cores e Materiais */}
          <Card>
            <CardContent className="p-3 space-y-3">
              <h4 className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                <Palette className="h-3.5 w-3.5 text-primary" /> Cores e Materiais
              </h4>
              <div className="space-y-2">
                <div className="space-y-1">
                  <Label className="text-[11px]">Cor da Caixa</Label>
                  {cores.length > 0 ? (
                    <Select value={corCaixa} onValueChange={setCorCaixa}>
                      <SelectTrigger className="h-7 text-xs"><SelectValue placeholder="Selecionar cor..." /></SelectTrigger>
                      <SelectContent>
                        {cores.map((c) => <SelectItem key={c.id} value={c.name}>{c.name}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  ) : (
                    <Input className="h-7 text-xs" placeholder="Ex: Branco TX" value={corCaixa} onChange={(e) => setCorCaixa(e.target.value)} />
                  )}
                </div>
                <div className="space-y-1">
                  <Label className="text-[11px]">Cor da Porta</Label>
                  {cores.length > 0 ? (
                    <Select value={corPorta} onValueChange={setCorPorta}>
                      <SelectTrigger className="h-7 text-xs"><SelectValue placeholder="Selecionar cor..." /></SelectTrigger>
                      <SelectContent>
                        {cores.map((c) => <SelectItem key={c.id} value={c.name}>{c.name}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  ) : (
                    <Input className="h-7 text-xs" placeholder="Ex: Cinza Sagrado" value={corPorta} onChange={(e) => setCorPorta(e.target.value)} />
                  )}
                </div>
                {materiais.length > 0 && (
                  <div className="space-y-1">
                    <Label className="text-[11px]">Material Principal</Label>
                    <Select
                      value={module.bodyMaterialId || ""}
                      onValueChange={(v) => setModule((p) => ({ ...p, bodyMaterialId: v || undefined }))}
                    >
                      <SelectTrigger className="h-7 text-xs"><SelectValue placeholder="Selecionar material..." /></SelectTrigger>
                      <SelectContent>
                        {materiais.map((m) => (
                          <SelectItem key={m.id} value={m.id}>
                            {m.name} {m.cost ? `(R$ ${m.cost.toFixed(2)})` : ""}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Duplicação */}
          <Card>
            <CardContent className="p-3 space-y-2">
              <div className="flex items-center justify-between">
                <h4 className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                  <Copy className="h-3.5 w-3.5 text-primary" /> Módulos Duplicados ({duplicates.length})
                </h4>
                <Button size="sm" variant="outline" className="h-6 text-[10px] gap-1 px-2" onClick={duplicateModule}>
                  <Plus className="h-3 w-3" /> Duplicar
                </Button>
              </div>
              {duplicates.length > 0 && (
                <div className="space-y-1.5 max-h-[120px] overflow-y-auto">
                  {duplicates.map((dup, i) => (
                    <div key={dup.id} className="flex items-center justify-between bg-muted/50 rounded px-2 py-1">
                      <span className="text-[10px] font-medium truncate">{dup.module.name}</span>
                      <div className="flex items-center gap-1">
                        <Input
                          type="number"
                          value={dup.positionX}
                          onChange={(e) => {
                            const newDups = duplicates.map((d) =>
                              d.id === dup.id ? { ...d, positionX: Number(e.target.value) } : d
                            );
                            updatePersisted({ duplicates: newDups });
                          }}
                          className="h-5 w-16 text-[9px] font-mono"
                          title="Posição X (mm)"
                        />
                        <Button variant="ghost" size="icon" className="h-5 w-5 text-destructive"
                          onClick={() => removeDuplicate(dup.id)}>
                          <Minus className="h-3 w-3" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Ações */}
          <div className="flex gap-2">
            <Button size="sm" className="flex-1 gap-1.5" onClick={handleSave}>
              <Save className="h-3.5 w-3.5" /> Salvar Módulo
            </Button>
            <Button variant="outline" size="sm" onClick={handleReset} className="gap-1.5">
              <RotateCcw className="h-3.5 w-3.5" /> Resetar
            </Button>
          </div>
        </div>
      )}

      {/* ── Área de Preview 3D + BOM ── */}
      <div className="flex-1 flex flex-col gap-3 min-w-0">
        <Card className="flex-1 relative overflow-hidden min-h-[350px]">
          <CardContent className="p-0 absolute inset-0">
            <canvas ref={canvasRef} className="w-full h-full block" style={{ minHeight: 350 }} />
            <div className="absolute top-2 right-2 flex gap-1.5 flex-wrap justify-end">
              <Badge variant="secondary" className="text-[10px]">
                {module.width}×{module.height}×{module.depth}mm
              </Badge>
              {module.moduleType !== "custom" && (
                <Badge className="text-[10px]">
                  {MODULE_PRESETS.find((p) => p.type === module.moduleType)?.label}
                </Badge>
              )}
              {wall.enabled && (
                <Badge variant="outline" className="text-[10px]">
                  Parede {wall.width}×{wall.height}mm
                </Badge>
              )}
              {duplicates.length > 0 && (
                <Badge variant="outline" className="text-[10px]">
                  +{duplicates.length} cópia{duplicates.length > 1 ? "s" : ""}
                </Badge>
              )}
            </div>
          </CardContent>
        </Card>

        {/* BOM Tabs */}
        <Card className="max-h-[200px] overflow-hidden">
          <Tabs defaultValue="pecas" className="h-full">
            <TabsList className="h-7 px-2">
              <TabsTrigger value="pecas" className="text-[10px] h-5 gap-1">
                <Package className="h-3 w-3" /> Peças ({bom.parts.length})
              </TabsTrigger>
              <TabsTrigger value="ferragens" className="text-[10px] h-5 gap-1">
                <Wrench className="h-3 w-3" /> Ferragens ({bom.hardware.length})
              </TabsTrigger>
            </TabsList>
            <TabsContent value="pecas" className="m-0 overflow-auto max-h-[150px]">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-[10px] h-6">Peça</TableHead>
                    <TableHead className="text-[10px] h-6 text-right">Qtd</TableHead>
                    <TableHead className="text-[10px] h-6 text-right">L×A (mm)</TableHead>
                    <TableHead className="text-[10px] h-6 text-right">Área m²</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {bom.parts.map((p, i) => (
                    <TableRow key={i}>
                      <TableCell className="text-[10px] py-1">{p.name}</TableCell>
                      <TableCell className="text-[10px] py-1 text-right">{p.quantity}</TableCell>
                      <TableCell className="text-[10px] py-1 text-right font-mono">{p.width.toFixed(0)}×{p.height.toFixed(0)}</TableCell>
                      <TableCell className="text-[10px] py-1 text-right font-mono">{p.area.toFixed(3)}</TableCell>
                    </TableRow>
                  ))}
                  <TableRow className="bg-muted/30">
                    <TableCell className="text-[10px] py-1 font-semibold">Total</TableCell>
                    <TableCell className="text-[10px] py-1" />
                    <TableCell className="text-[10px] py-1" />
                    <TableCell className="text-[10px] py-1 text-right font-mono font-semibold">{bom.totalArea.toFixed(3)} m²</TableCell>
                  </TableRow>
                </TableBody>
              </Table>
            </TabsContent>
            <TabsContent value="ferragens" className="m-0 overflow-auto max-h-[150px]">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-[10px] h-6">Item</TableHead>
                    <TableHead className="text-[10px] h-6 text-right">Qtd</TableHead>
                    <TableHead className="text-[10px] h-6 text-right">Un.</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {bom.hardware.map((h, i) => (
                    <TableRow key={i}>
                      <TableCell className="text-[10px] py-1">{h.name}</TableCell>
                      <TableCell className="text-[10px] py-1 text-right">{h.quantity}</TableCell>
                      <TableCell className="text-[10px] py-1 text-right">{h.unit}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TabsContent>
          </Tabs>
        </Card>
      </div>
    </div>
  );
}
