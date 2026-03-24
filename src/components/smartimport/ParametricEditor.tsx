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
  Upload, ImageIcon, FolderOpen, GripVertical, BookOpen, FileDown, Eye, EyeOff,
  Camera, Lock, Unlock, Trash2, MousePointer, Group, Shield, ShieldOff,
} from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { toast } from "sonner";
import type {
  ParametricModule, InternalComponent, ComponentType, ModuleBOM, ModuleType,
} from "@/types/parametricModule";
import { MODULE_PRESETS, SHEET_THICKNESSES, BACK_THICKNESSES } from "@/types/parametricModule";
import { calculateInternalSpans, generateBOM, redistributeShelves, snapToGrid } from "@/lib/spanEngine";
import { generateParametricGeometry, generateWallGeometry, generateFloorGeometry, type GeometryOptions, type MaterialOverrides, type WallOverrides, type FloorOverrides } from "@/lib/parametricGeometry";
import { generateDimensionAnnotations, COTA_LEGEND } from "@/lib/dimensionAnnotations";
import { generateBomPdf } from "@/lib/generateBomPdf";
import type { CatalogItem } from "@/hooks/useModuleCatalog";
import { useModuleCategories, type CategoryTreeNode } from "@/hooks/useModuleCategories";
import { usePersistedFormState } from "@/hooks/usePersistedFormState";
import { supabase } from "@/lib/supabaseClient";

const SHELF_THICKNESSES = [15, 18, 25, 36] as const;
const DOOR_THICKNESSES = [15, 18] as const;

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
  floor?: string;
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

// Pre-loaded texture library
const TEXTURE_LIBRARY = [
  { category: "Madeiras", items: [
    { label: "Carvalho Natural", color: "#c4a060", accent: "#a8854a" },
    { label: "Nogueira", color: "#5c3a1e", accent: "#7a5230" },
    { label: "Freijó", color: "#b08850", accent: "#9a7540" },
    { label: "Cedro Rosa", color: "#b07060", accent: "#985848" },
    { label: "Imbuia", color: "#6b4226", accent: "#553418" },
    { label: "Itaúba", color: "#8b6914", accent: "#705510" },
    { label: "Wengue", color: "#3c2415", accent: "#2a1a0f" },
    { label: "Teca", color: "#c8a45a", accent: "#b0903e" },
  ]},
  { category: "Mármores", items: [
    { label: "Branco Carrara", color: "#f0ece8", accent: "#d8d4d0" },
    { label: "Cinza Pulpis", color: "#6b6560", accent: "#585250" },
    { label: "Nero Marquina", color: "#2a2825", accent: "#3c3a38" },
    { label: "Travertino", color: "#ddd0b8", accent: "#c8bca5" },
    { label: "Crema Marfil", color: "#e8dcc8", accent: "#d4c8b0" },
  ]},
  { category: "Cores Sólidas", items: [
    { label: "Branco Neve", color: "#ffffff", accent: "#f0f0f0" },
    { label: "Off-White", color: "#f5f0e8", accent: "#e8e0d5" },
    { label: "Grafite", color: "#404040", accent: "#555555" },
    { label: "Azul Petróleo", color: "#1a4a5a", accent: "#285868" },
    { label: "Verde Musgo", color: "#3a5a3a", accent: "#4a6a4a" },
    { label: "Terracota", color: "#c45a3a", accent: "#b04828" },
    { label: "Areia", color: "#d4c4a8", accent: "#c0b090" },
  ]},
];

const MAX_DRAWERS = 4;

interface SavedPalette {
  id: string;
  name: string;
  colors: FurnitureColors;
}

interface PersistedBuilderState {
  module: ParametricModule;
  corCaixa: string;
  corPorta: string;
  wall: WallConfig;
  duplicates: DuplicatedModule[];
  furnitureColors: FurnitureColors;
  textureSlots: TextureSlots;
  savedPalettes: SavedPalette[];
  showCotas: boolean;
  floorHeightInferior: number;
  floorHeightSuperior: number;
  floorColor: string;
  openDoors: boolean;
  openDrawers: boolean;
  moduleOffsetX: number;
  moduleOffsetY: number;
  lockPosition: boolean;
  selectedModuleId: string | null;
  groupSelect: boolean;
  collisionEnabled: boolean;
}

const INITIAL_PERSISTED: PersistedBuilderState = {
  module: createDefaultModule(),
  corCaixa: "",
  corPorta: "",
  wall: { enabled: false, width: 3000, height: 2700, depth: 100, color: "#e8e0d8" },
  duplicates: [],
  furnitureColors: { body: "#d4a574", door: "#fafafa", shelf: "#d4a574", back: "#d4a574", drawer: "#c4a060" },
  textureSlots: {},
  savedPalettes: [],
  showCotas: false,
  floorHeightInferior: 200,
  floorHeightSuperior: 1500,
  floorColor: "#d6d3cd",
  openDoors: false,
  openDrawers: false,
  moduleOffsetX: 0,
  moduleOffsetY: 0,
  lockPosition: false,
  selectedModuleId: null,
  groupSelect: false,
  collisionEnabled: true,
};

export function ParametricEditor({ onSave, initialModule, tenantId, catalogItems = [] }: ParametricEditorProps) {
  // Camera animation state
  const cameraAnimRef = useRef<{
    startPos: [number, number, number];
    endPos: [number, number, number];
    startTarget: [number, number, number];
    endTarget: [number, number, number];
    progress: number;
    active: boolean;
  }>({ startPos: [0, 0, 0], endPos: [0, 0, 0], startTarget: [0, 0, 0], endTarget: [0, 0, 0], progress: 0, active: false });

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
  const showCotas = persisted.showCotas ?? false;
  const floorHeightInferior = persisted.floorHeightInferior ?? 200;
  const floorHeightSuperior = persisted.floorHeightSuperior ?? 1500;
  const floorColor = persisted.floorColor ?? "#d6d3cd";
  const openDoors = persisted.openDoors ?? false;
  const openDrawers = persisted.openDrawers ?? false;
  const moduleOffsetX = persisted.moduleOffsetX ?? 0;
  const moduleOffsetY = persisted.moduleOffsetY ?? 0;
  const lockPosition = persisted.lockPosition ?? false;
  const selectedModuleId = persisted.selectedModuleId ?? null;
  const groupSelect = persisted.groupSelect ?? false;
  const collisionEnabled = persisted.collisionEnabled ?? true;

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

  const savedPalettes = persisted.savedPalettes ?? [];

  const savePalette = useCallback((name: string) => {
    const palette: SavedPalette = { id: crypto.randomUUID(), name, colors: { ...furnitureColors } };
    updatePersisted({ savedPalettes: [...savedPalettes, palette] });
    toast.success(`Paleta "${name}" salva!`);
  }, [furnitureColors, savedPalettes, updatePersisted]);

  const loadPalette = useCallback((palette: SavedPalette) => {
    updatePersisted({ furnitureColors: { ...palette.colors } });
    toast.success(`Paleta "${palette.name}" aplicada!`);
  }, [updatePersisted]);

  const removePalette = useCallback((id: string) => {
    updatePersisted({ savedPalettes: savedPalettes.filter((p) => p.id !== id) });
  }, [savedPalettes, updatePersisted]);

  const [showPanel, setShowPanel] = useState(true);
  const [showSaveLibrary, setShowSaveLibrary] = useState(false);
  const [saveLibName, setSaveLibName] = useState("");
  const [saveLibCategory, setSaveLibCategory] = useState("");
  const [saveLibSubcategory, setSaveLibSubcategory] = useState("");
  const [savedModules, setSavedModules] = useState<any[]>([]);
  const [showTextureLib, setShowTextureLib] = useState(false);
  const [textureLibTarget, setTextureLibTarget] = useState<keyof FurnitureColors>("body");
  const [paletteName, setPaletteName] = useState("");

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const threeRef = useRef<any>(null);
  const needsRenderRef = useRef(true);
  const animFrameRef = useRef(0);
  const dragRef = useRef<{ id: string; startX: number; startY: number; mouseX: number; mouseY: number; isMain?: boolean } | null>(null);
  const isDraggingRef = useRef(false);

  const { tree: categoryTree, categories, addCategory, loadCategories } = useModuleCategories(tenantId ?? null);

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
    updatePersisted({ moduleOffsetX: 0, moduleOffsetY: 0 });
    toast.success(`Preset "${preset.label}" aplicado!`);
  }, [setModule, updatePersisted]);

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
    let resizeHandler: (() => void) | null = null;

    (async () => {
      const THREE = await import("three");
      const { OrbitControls } = await import("three/examples/jsm/controls/OrbitControls.js");

      if (!mounted || !canvasRef.current) return;

      const container = canvasRef.current.parentElement!;
      const w = container.clientWidth;
      const h = container.clientHeight;

      // Recover from previous context loss
      const gl = canvasRef.current.getContext("webgl2") || canvasRef.current.getContext("webgl");
      if (gl && gl.isContextLost()) {
        // Force a new canvas element to recover
        const newCanvas = document.createElement("canvas");
        newCanvas.className = canvasRef.current.className;
        newCanvas.style.cssText = canvasRef.current.style.cssText;
        canvasRef.current.parentElement?.replaceChild(newCanvas, canvasRef.current);
        (canvasRef as any).current = newCanvas;
      }

      try {
        renderer = new THREE.WebGLRenderer({ canvas: canvasRef.current, antialias: true, alpha: false, powerPreference: "default" });
      } catch (e) {
        console.warn("WebGL init failed, retrying with low-power settings...", e);
        try {
          renderer = new THREE.WebGLRenderer({ canvas: canvasRef.current, antialias: false, alpha: false, powerPreference: "low-power" });
        } catch (e2) {
          console.error("WebGL context could not be created:", e2);
          return;
        }
      }
      renderer.setSize(w, h);
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
      renderer.outputColorSpace = THREE.SRGBColorSpace;
      renderer.toneMapping = THREE.ACESFilmicToneMapping;
      renderer.toneMappingExposure = 1.4;

      // Handle context loss/restore
      const handleContextLost = (event: Event) => {
        event.preventDefault();
        console.warn("WebGL context lost, will restore...");
        cancelAnimationFrame(animFrameRef.current);
      };
      const handleContextRestored = () => {
        console.info("WebGL context restored");
        needsRenderRef.current = true;
        animate();
      };
      canvasRef.current.addEventListener("webglcontextlost", handleContextLost);
      canvasRef.current.addEventListener("webglcontextrestored", handleContextRestored);

      const scene = new THREE.Scene();
      scene.background = new THREE.Color(0xf0f0f0);

      const camera = new THREE.PerspectiveCamera(50, w / h, 0.01, 200);
      camera.position.set(4, 3, 5);

      const controls = new OrbitControls(camera, renderer.domElement);
      controls.enableDamping = true;
      controls.dampingFactor = 0.08;
      controls.minDistance = 0.3;
      controls.maxDistance = 80;
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
      grid.name = "floor_grid";
      scene.add(grid);

      threeRef.current = { THREE, scene, renderer, camera, controls, moduleGroups: [] as any[] };
      needsRenderRef.current = true;

      renderer.domElement.style.touchAction = "none";

      const animate = () => {
        if (!mounted) return;
        animFrameRef.current = requestAnimationFrame(animate);
        // Smooth camera animation
        const anim = cameraAnimRef.current;
        if (anim.active) {
          anim.progress = Math.min(anim.progress + 0.04, 1);
          const t = 1 - Math.pow(1 - anim.progress, 3); // ease-out cubic
          camera.position.set(
            anim.startPos[0] + (anim.endPos[0] - anim.startPos[0]) * t,
            anim.startPos[1] + (anim.endPos[1] - anim.startPos[1]) * t,
            anim.startPos[2] + (anim.endPos[2] - anim.startPos[2]) * t
          );
          controls.target.set(
            anim.startTarget[0] + (anim.endTarget[0] - anim.startTarget[0]) * t,
            anim.startTarget[1] + (anim.endTarget[1] - anim.startTarget[1]) * t,
            anim.startTarget[2] + (anim.endTarget[2] - anim.startTarget[2]) * t
          );
          controls.update();
          needsRenderRef.current = true;
          if (anim.progress >= 1) anim.active = false;
        }
        // Pulsating outline animation for selected module
        const moduleGroups = threeRef.current?.moduleGroups || [];
        let hasPulse = false;
        const pulseIntensity = 0.5 + 0.5 * Math.sin(Date.now() * 0.005);
        moduleGroups.forEach((grp: any) => {
          if (!grp.userData?.moduleId) return;
          grp.traverse((child: any) => {
            if (child.userData?.__selectionOutline && child.material) {
              child.material.opacity = 0.4 + 0.6 * pulseIntensity;
              child.material.transparent = true;
              child.material.needsUpdate = true;
              hasPulse = true;
            }
          });
        });
        if (hasPulse) needsRenderRef.current = true;

        controls.update();
        if (needsRenderRef.current) {
          renderer.render(scene, camera);
          needsRenderRef.current = false;
        }
      };
      animate();

      resizeHandler = () => {
        if (!canvasRef.current) return;
        const c = canvasRef.current.parentElement!;
        camera.aspect = c.clientWidth / c.clientHeight;
        camera.updateProjectionMatrix();
        renderer.setSize(c.clientWidth, c.clientHeight);
        needsRenderRef.current = true;
      };
      window.addEventListener("resize", resizeHandler);
    })();

    return () => {
      mounted = false;
      cancelAnimationFrame(animFrameRef.current);
      if (resizeHandler) window.removeEventListener("resize", resizeHandler);
      if (renderer) {
        renderer.forceContextLoss();
        renderer.dispose();
      }
      threeRef.current = null;
    };
  }, []);

  // ── Load textures from data URLs ──
  const loadTexturesForSlots = useCallback(async (THREE: any): Promise<{ matOverrides: MaterialOverrides; wallOv: WallOverrides; floorOv: FloorOverrides }> => {
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
      ["back", "back"], ["drawer", "drawer"], ["wall", "wall"], ["floor", "floor"],
    ];

    const floorOv: FloorOverrides = {
      color: parseInt(floorColor.replace("#", ""), 16),
    };

    await Promise.all(slots.map(async ([slot, key]) => {
      const dataUrl = textureSlots[slot];
      if (!dataUrl) return;
      const tex = await loadTex(dataUrl, key);
      if (!tex) return;
      if (slot === "wall") wallOv.texture = tex;
      else if (slot === "floor") floorOv.texture = tex;
      else (matOverrides as any)[`${key}Texture`] = tex;
    }));

    return { matOverrides, wallOv, floorOv };
  }, [furnitureColors, textureSlots, wall.color, floorColor]);

  // Compute floor offset based on module type
  const computedFloorOffset = useMemo(() => {
    const mt = module.moduleType;
    if (mt === "caixa_inferior") return floorHeightInferior;
    if (mt === "caixa_superior") return floorHeightSuperior;
    // dormitorio, painel, regua, custom = 0
    return 0;
  }, [module.moduleType, floorHeightInferior, floorHeightSuperior]);

  // ── Apply selection highlight (emissive glow + white outline) to selected module ──
  const applySelectionHighlight = useCallback(() => {
    if (!threeRef.current) return;
    const { moduleGroups, THREE } = threeRef.current;
    const HIGHLIGHT_COLOR = new THREE.Color(0x00aaff);
    const OUTLINE_MAT = new THREE.LineBasicMaterial({ color: 0xffffff, linewidth: 2 });

    moduleGroups.forEach((grp: any) => {
      if (!grp.userData?.moduleId) return;
      const isSelected = grp.userData.moduleId === selectedModuleId;

      // Remove previous outline lines
      const toRemove: any[] = [];
      grp.traverse((child: any) => {
        if (child.userData?.__selectionOutline) toRemove.push(child);
      });
      toRemove.forEach((c) => { c.parent?.remove(c); c.geometry?.dispose(); });

      grp.traverse((child: any) => {
        if (child.isMesh && child.material) {
          const mat = child.material;
          if (isSelected) {
            mat.emissive = HIGHLIGHT_COLOR;
            mat.emissiveIntensity = 0.25;

            // Add white outline
            const edges = new THREE.EdgesGeometry(child.geometry);
            const outline = new THREE.LineSegments(edges, OUTLINE_MAT);
            outline.position.copy(child.position);
            outline.rotation.copy(child.rotation);
            outline.scale.copy(child.scale);
            outline.userData = { __selectionOutline: true };
            outline.renderOrder = 999;
            grp.add(outline);
          } else {
            mat.emissive = new THREE.Color(0x000000);
            mat.emissiveIntensity = 0;
          }
          mat.needsUpdate = true;
        }
      });
    });
    needsRenderRef.current = true;
  }, [selectedModuleId]);

  // ── Rebuild geometry when module/wall/duplicates/colors/textures change ──
  useEffect(() => {
    if (!threeRef.current) return;
    const { THREE, scene, moduleGroups } = threeRef.current;

    (async () => {
      // Remove old groups
      moduleGroups.forEach((g: any) => scene.remove(g));
      threeRef.current.moduleGroups = [];

      // Update grid to match wall size
      const oldGrid = scene.getObjectByName("floor_grid");
      if (oldGrid) scene.remove(oldGrid);
      const gridSize = wall.enabled ? Math.max(wall.width, wall.depth + 1000) * 0.01 : 20;
      const gridDivisions = wall.enabled ? Math.round(gridSize / 0.5) : 20;
      const THREE = threeRef.current.THREE;
      const newGrid = new THREE.GridHelper(gridSize, gridDivisions, 0xcccccc, 0xcccccc);
      (newGrid.material as any).opacity = 0.3;
      (newGrid.material as any).transparent = true;
      newGrid.name = "floor_grid";
      scene.add(newGrid);

      const { matOverrides, wallOv, floorOv } = await loadTexturesForSlots(THREE);

      const opts: GeometryOptions = { floorOffset: computedFloorOffset, openDoors, openDrawers };
      opts.materialOverrides = matOverrides;

      // Wall rendered separately — stays at ground level (Y=0), behind modules
      if (wall.enabled) {
        const wallGrp = generateWallGeometry(THREE, { width: wall.width, height: wall.height, depth: wall.depth }, wallOv);
        scene.add(wallGrp);
        threeRef.current.moduleGroups.push(wallGrp);

        // Floor layer on top of grid
        const floorGrp = generateFloorGeometry(THREE, wall.width, floorOv);
        scene.add(floorGrp);
        threeRef.current.moduleGroups.push(floorGrp);
      }

      const mainGrp = generateParametricGeometry(THREE, module, opts);
      mainGrp.position.x += moduleOffsetX * 0.01;
      mainGrp.position.y += moduleOffsetY * 0.01;
      mainGrp.userData = { moduleId: "__main__" };
      scene.add(mainGrp);
      threeRef.current.moduleGroups.push(mainGrp);

      duplicates.forEach((dup) => {
        const dupGrp = generateParametricGeometry(THREE, dup.module, { materialOverrides: matOverrides, floorOffset: computedFloorOffset, openDoors, openDrawers });
        dupGrp.position.x += (dup.positionX + moduleOffsetX) * 0.01;
        dupGrp.position.y += moduleOffsetY * 0.01;
        dupGrp.position.z += dup.positionZ * 0.01;
        dupGrp.userData = { moduleId: dup.id };
        scene.add(dupGrp);
        threeRef.current.moduleGroups.push(dupGrp);
      });

      // Dimension annotations — offset to match module position
      if (showCotas) {
        const dimGroup = generateDimensionAnnotations(THREE, module, {
          wall: wall.enabled ? { width: wall.width, height: wall.height } : undefined,
          floorOffset: computedFloorOffset,
          moduleOffset: { x: moduleOffsetX, y: moduleOffsetY },
          duplicates: duplicates.map((d) => ({ positionX: d.positionX + moduleOffsetX, positionZ: d.positionZ, module: { width: d.module.width, depth: d.module.depth } })),
          moduleData: module,
        });
        scene.add(dimGroup);
        threeRef.current.moduleGroups.push(dimGroup);
      }

      // Apply selection highlight
      applySelectionHighlight();

      needsRenderRef.current = true;
    })();
  }, [module, wall, duplicates, furnitureColors, textureSlots, loadTexturesForSlots, showCotas, computedFloorOffset, openDoors, openDrawers, floorColor, moduleOffsetX, moduleOffsetY, selectedModuleId]);

  // ── Update highlight when selection changes (without full rebuild) ──
  useEffect(() => {
    applySelectionHighlight();
  }, [selectedModuleId, applySelectionHighlight]);

  // ── Module update helpers ──
  const updateDimension = useCallback((key: "width" | "height" | "depth", value: number) => {
    const clamped = Math.max(60, Math.min(2700, value));
    setModule((prev) => {
      const updated = { ...prev, [key]: clamped, moduleType: "custom" as ModuleType };
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
        thickness: type === "gaveta" ? 18 : prev.thickness,
        frontHeight: type === "gaveta" ? 180 : undefined,
        bottomThickness: type === "gaveta" ? 3 : undefined,
      };
      const updated = { ...prev, components: [...prev.components, comp] };
      if (type === "prateleira" || type === "divisoria" || type === "gaveta") {
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

  // ── Delete selected module ──
  const deleteSelectedModule = useCallback(() => {
    if (!selectedModuleId) return;
    if (selectedModuleId === "__main__") {
      // Reset main module to default
      setModule(createDefaultModule());
      updatePersisted({ moduleOffsetX: 0, moduleOffsetY: 0, selectedModuleId: null });
      toast.success("Módulo principal removido!");
    } else {
      updatePersisted({
        duplicates: duplicates.filter((d) => d.id !== selectedModuleId),
        selectedModuleId: null,
      });
      toast.success("Módulo duplicado removido!");
    }
  }, [selectedModuleId, duplicates, setModule, updatePersisted]);

  // ── Drag modules in 3D (main + duplicates) ──
  const handleCanvasPointerDown = useCallback((e: React.PointerEvent) => {
    if (!threeRef.current) return;
    const { THREE, camera, renderer, moduleGroups } = threeRef.current;
    const rect = renderer.domElement.getBoundingClientRect();
    const mouse = new THREE.Vector2(
      ((e.clientX - rect.left) / rect.width) * 2 - 1,
      -((e.clientY - rect.top) / rect.height) * 2 + 1
    );
    const raycaster = new THREE.Raycaster();
    raycaster.setFromCamera(mouse, camera);

    // Helper to find which module was clicked using userData tags
    const findHitModule = (): string | null => {
      // Collect all module groups (those with moduleId in userData)
      const taggedGroups = moduleGroups.filter((g: any) => g.userData?.moduleId);
      // Sort: duplicates first so they get priority on overlap
      const sorted = taggedGroups.sort((a: any, b: any) => {
        if (a.userData.moduleId === "__main__") return 1;
        if (b.userData.moduleId === "__main__") return -1;
        return 0;
      });
      for (const grp of sorted) {
        const intersects = raycaster.intersectObjects(grp.children, true);
        if (intersects.length > 0) return grp.userData.moduleId;
      }
      return null;
    };

    const hitId = findHitModule();

    if (hitId) {
      // Select the module
      updatePersisted({ selectedModuleId: hitId });

      // Only start drag if position is NOT locked
      if (!lockPosition) {
        if (hitId === "__main__") {
          if (groupSelect) {
            // Group drag: store all starting positions
            dragRef.current = { id: "__group__", startX: moduleOffsetX, startY: moduleOffsetY, mouseX: e.clientX, mouseY: e.clientY, isMain: true };
          } else {
            dragRef.current = { id: "__main__", startX: moduleOffsetX, startY: moduleOffsetY, mouseX: e.clientX, mouseY: e.clientY, isMain: true };
          }
        } else {
          const dup = duplicates.find((d) => d.id === hitId);
          if (dup) {
            if (groupSelect) {
              dragRef.current = { id: "__group__", startX: moduleOffsetX, startY: moduleOffsetY, mouseX: e.clientX, mouseY: e.clientY, isMain: true };
            } else {
              dragRef.current = { id: dup.id, startX: dup.positionX, startY: dup.positionZ, mouseX: e.clientX, mouseY: e.clientY };
            }
          }
        }
        isDraggingRef.current = false;
        threeRef.current.controls.enabled = false;
        (e.target as HTMLElement).setPointerCapture(e.pointerId);
      }
    } else {
      // Clicked empty space — deselect
      updatePersisted({ selectedModuleId: null });
    }
  }, [duplicates, wall.enabled, moduleOffsetX, moduleOffsetY, lockPosition, groupSelect, updatePersisted]);

  const handleCanvasPointerMove = useCallback((e: React.PointerEvent) => {
    if (!dragRef.current || !threeRef.current) return;
    const dx = e.clientX - dragRef.current.mouseX;
    const dy = e.clientY - dragRef.current.mouseY;
    const threshold = 8;
    if (!isDraggingRef.current && Math.abs(dx) < threshold && Math.abs(dy) < threshold) return;
    isDraggingRef.current = true;
    const scale = 5;
    const SNAP_THRESHOLD = 30;

    const magneticSnap = (val: number, targets: number[]): number => {
      for (const t of targets) {
        if (Math.abs(val - t) <= SNAP_THRESHOLD) return t;
      }
      return val;
    };

    if (dragRef.current.id === "__group__") {
      // Move all modules together
      const deltaX = snapToGrid(dx * scale);
      const deltaY = snapToGrid(-dy * scale);
      let newMainX = dragRef.current.startX + deltaX;
      let newMainY = dragRef.current.startY + deltaY;

      if (wall.enabled) {
        const halfWall = wall.width / 2;
        const halfMod = module.width / 2;
        const minX = -halfWall + halfMod;
        const maxX = halfWall - halfMod;
        newMainX = Math.max(minX, Math.min(maxX, newMainX));
        newMainY = Math.max(0, Math.min(wall.height - module.height - computedFloorOffset, newMainY));
      }

      const actualDeltaX = newMainX - persisted.moduleOffsetX;
      const newDups = duplicates.map((d) => ({
        ...d,
        positionX: d.positionX + actualDeltaX,
      }));
      updatePersisted({ moduleOffsetX: newMainX, moduleOffsetY: newMainY, duplicates: newDups });
    } else if (dragRef.current.isMain) {
      let newX = snapToGrid(dragRef.current.startX + dx * scale);
      let newY = snapToGrid(dragRef.current.startY - dy * scale);

      if (wall.enabled) {
        const halfWall = wall.width / 2;
        const halfMod = module.width / 2;
        const minX = -halfWall + halfMod;
        const maxX = halfWall - halfMod;
        const snapTargetsX = [minX, 0, maxX];
        const snapTargetsY = [0, wall.height - module.height - computedFloorOffset];
        newX = magneticSnap(newX, snapTargetsX);
        newY = magneticSnap(newY, snapTargetsY);
        newX = Math.max(minX, Math.min(maxX, newX));
        newY = Math.max(0, Math.min(wall.height - module.height - computedFloorOffset, newY));
      }

      // Collision detection with duplicates
      if (collisionEnabled && wall.enabled) {
        const mainHalfW = module.width / 2;
        const mainHalfH = module.height / 2;
        const mainCenterY = newY + computedFloorOffset + module.height / 2;

        for (const d of duplicates) {
          // Duplicates are relative to moduleOffsetX, but after this update moduleOffsetX = newX
          // So duplicate absolute pos = d.positionX + newX
          const dupAbsX = d.positionX + newX;
          const dupHalfW = d.module.width / 2;
          const dupHalfH = d.module.height / 2;
          const dupFloor = d.module.preset === "caixa_superior" ? 1500 : 200;
          const dupCenterY = (d.positionZ || 0) + dupFloor + d.module.height / 2;

          const overlapX = (newX + mainHalfW > dupAbsX - dupHalfW) && (newX - mainHalfW < dupAbsX + dupHalfW);
          const overlapY = (mainCenterY + mainHalfH > dupCenterY - dupHalfH) && (mainCenterY - mainHalfH < dupCenterY + dupHalfH);

          if (overlapX && overlapY) {
            // Push horizontally to nearest non-overlapping side
            const pushLeft = dupAbsX - dupHalfW - mainHalfW;
            const pushRight = dupAbsX + dupHalfW + mainHalfW;
            // But since dupAbsX depends on newX (dupAbsX = d.positionX + newX), solve:
            // pushLeft: newX = (d.positionX + newX) - dupHalfW - mainHalfW → won't work directly
            // Absolute duplicate position when main is at candidate X: d.positionX + candidateX
            // We need: candidateX + mainHalfW <= d.positionX + candidateX - dupHalfW → impossible (mainHalfW <= -dupHalfW)
            // Duplicates move with main! So we can't separate them by moving main alone.
            // Instead, use the CURRENT absolute positions of duplicates (before main moves)
            const dupAbsCurrent = d.positionX + moduleOffsetX;
            const pushL = dupAbsCurrent - dupHalfW - mainHalfW;
            const pushR = dupAbsCurrent + dupHalfW + mainHalfW;
            newX = Math.abs(newX - pushL) < Math.abs(newX - pushR) ? pushL : pushR;
          }
        }
        // Re-clamp after collision
        const halfWall = wall.width / 2;
        const halfMod = module.width / 2;
        newX = Math.max(-halfWall + halfMod, Math.min(halfWall - halfMod, newX));
      }

      updatePersisted({ moduleOffsetX: newX, moduleOffsetY: newY });
    } else {
      let newX = snapToGrid(dragRef.current.startX + dx * scale);
      const newZ = snapToGrid(dragRef.current.startY + dy * scale);
      const dragDup = duplicates.find((d) => d.id === dragRef.current!.id);
      const dragW = dragDup?.module.width || module.width;

      if (wall.enabled) {
        const mainRight = moduleOffsetX + module.width / 2;
        const mainLeft = moduleOffsetX - module.width / 2;
        const snapTargetsX: number[] = [];
        duplicates.forEach((d) => {
          if (d.id !== dragRef.current!.id) {
            snapTargetsX.push(d.positionX + d.module.width + 3);
            snapTargetsX.push(d.positionX - dragW - 3);
          }
        });
        snapTargetsX.push(mainRight + 3, mainLeft - dragW - 3);
        newX = magneticSnap(newX, snapTargetsX);

        // Collision with wall limits for duplicates
        if (collisionEnabled) {
          const halfWall = wall.width / 2;
          const absX = newX + moduleOffsetX;
          const dupHalf = dragW / 2;
          const clampedAbs = Math.max(-halfWall + dupHalf, Math.min(halfWall - dupHalf, absX));
          newX = clampedAbs - moduleOffsetX;
        }
      }

      // Collision with main module and other duplicates
      if (collisionEnabled) {
        const absX = newX + moduleOffsetX;
        const dragLeft = absX - dragW / 2;
        const dragRight = absX + dragW / 2;

        // Check against main module
        const mainLeft = moduleOffsetX - module.width / 2;
        const mainRight = moduleOffsetX + module.width / 2;
        let adjustedAbsX = absX;
        if (dragRight > mainLeft && dragLeft < mainRight) {
          const pushLeft = mainLeft - dragW / 2;
          const pushRight = mainRight + dragW / 2;
          adjustedAbsX = Math.abs(absX - pushLeft) < Math.abs(absX - pushRight) ? pushLeft : pushRight;
        }

        // Check against other duplicates
        for (const d of duplicates) {
          if (d.id === dragRef.current!.id) continue;
          const dAbsX = d.positionX + moduleOffsetX;
          const dLeft = dAbsX - d.module.width / 2;
          const dRight = dAbsX + d.module.width / 2;
          const myLeft = adjustedAbsX - dragW / 2;
          const myRight = adjustedAbsX + dragW / 2;
          if (myRight > dLeft && myLeft < dRight) {
            const pushLeft = dLeft - dragW / 2;
            const pushRight = dRight + dragW / 2;
            adjustedAbsX = Math.abs(adjustedAbsX - pushLeft) < Math.abs(adjustedAbsX - pushRight) ? pushLeft : pushRight;
          }
        }

        newX = adjustedAbsX - moduleOffsetX;

        // Re-clamp to wall after collision
        if (wall.enabled) {
          const halfWall = wall.width / 2;
          const finalAbs = newX + moduleOffsetX;
          const dupHalf = dragW / 2;
          const clampedAbs = Math.max(-halfWall + dupHalf, Math.min(halfWall - dupHalf, finalAbs));
          newX = clampedAbs - moduleOffsetX;
        }
      }

      const newDups = duplicates.map((d) =>
        d.id === dragRef.current!.id ? { ...d, positionX: newX, positionZ: newZ } : d
      );
      updatePersisted({ duplicates: newDups });
    }
  }, [duplicates, updatePersisted, wall, module.width, module.height, computedFloorOffset, moduleOffsetX, persisted.moduleOffsetX, collisionEnabled]);

  const handleCanvasPointerUp = useCallback(() => {
    if (dragRef.current && threeRef.current) {
      threeRef.current.controls.enabled = true;
    }
    dragRef.current = null;
    isDraggingRef.current = false;
  }, []);

  // ── Save to Library ──
  const handleSaveToLibrary = useCallback(async () => {
    if (!tenantId || !saveLibName.trim()) {
      toast.error("Informe um nome para o módulo");
      return;
    }
    const parametricData = {
      ...module,
      furnitureColors: persisted.furnitureColors,
    };
    const { error } = await supabase.from("module_library" as any).insert({
      tenant_id: tenantId,
      name: saveLibName.trim(),
      category_id: saveLibSubcategory || saveLibCategory || null,
      parametric_data: parametricData,
    });
    if (error) {
      toast.error("Erro ao salvar na biblioteca");
      console.error(error);
    } else {
      toast.success(`Módulo "${saveLibName}" salvo na biblioteca!`);
      setShowSaveLibrary(false);
      setSaveLibName("");
      loadSavedModules();
    }
  }, [tenantId, saveLibName, saveLibCategory, saveLibSubcategory, module, persisted.furnitureColors]);

  // ── Load saved modules ──
  const loadSavedModules = useCallback(async () => {
    if (!tenantId) return;
    const { data } = await supabase
      .from("module_library" as any)
      .select("id, name, category_id, parametric_data")
      .eq("tenant_id", tenantId)
      .not("parametric_data", "is", null)
      .order("name");
    setSavedModules((data as any[]) || []);
  }, [tenantId]);

  useEffect(() => { loadSavedModules(); }, [loadSavedModules]);

  const loadModuleFromLibrary = useCallback((saved: any) => {
    if (!saved.parametric_data) return;
    const pd = saved.parametric_data;
    setModule({
      ...pd,
      id: crypto.randomUUID(),
    });
    if (pd.furnitureColors) {
      updatePersisted({ furnitureColors: pd.furnitureColors });
    }
    toast.success(`Módulo "${saved.name}" carregado!`);
  }, [setModule, updatePersisted]);

  // Flatten categories for select
  const flatCategories = useMemo(() => {
    const result: { id: string; name: string; depth: number; parentId: string | null }[] = [];
    const walk = (nodes: CategoryTreeNode[], depth: number) => {
      nodes.forEach((n) => {
        result.push({ id: n.id, name: n.name, depth, parentId: n.parent_id });
        walk(n.children, depth + 1);
      });
    };
    walk(categoryTree, 0);
    return result;
  }, [categoryTree]);

  const shelfCount = module.components.filter((c) => c.type === "prateleira").length;
  const doorCount = module.components.filter((c) => c.type === "porta").length;
  const drawerCount = module.components.filter((c) => c.type === "gaveta").length;
  const dividerCount = module.components.filter((c) => c.type === "divisoria").length;

  return (
    <>
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
                { label: "Largura (L)", key: "width" as const, min: 60, max: 2700 },
                { label: "Altura (A)", key: "height" as const, min: 60, max: 2700 },
                { label: "Profundidade (P)", key: "depth" as const, min: 60, max: 2700 },
              ].map(({ label, key, min, max }) => (
                <div key={key} className="space-y-1">
                  <div className="flex items-center justify-between gap-2">
                    <Label className="text-[11px] whitespace-nowrap">{label}</Label>
                    <Input
                      type="number"
                      defaultValue={module[key]}
                      key={`${key}-${module.id}-${module.moduleType}`}
                      onBlur={(e) => {
                        const v = Number(e.target.value);
                        if (!isNaN(v) && v >= min && v <= max) {
                          updateDimension(key, v);
                        } else {
                          e.target.value = String(module[key]);
                        }
                      }}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          (e.target as HTMLInputElement).blur();
                        }
                      }}
                      className="h-6 w-20 text-[11px] text-right font-mono"
                      min={min}
                      max={max}
                    />
                  </div>
                  <Slider
                    value={[module[key]]}
                    min={min}
                    max={max}
                    step={1}
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
                  {/* Floor Height Offsets */}
                  <div className="space-y-2 pt-2 border-t border-border">
                    <Label className="text-[10px] font-semibold text-muted-foreground">Altura do Piso (mm)</Label>
                    <div className="grid grid-cols-2 gap-2">
                      <div className="space-y-1">
                        <Label className="text-[9px]">Inferior Cozinha</Label>
                        <Input
                          type="number"
                          value={floorHeightInferior}
                          onChange={(e) => updatePersisted({ floorHeightInferior: Math.max(0, Number(e.target.value)) })}
                          className="h-6 text-[10px] font-mono"
                        />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-[9px]">Superior Cozinha</Label>
                        <Input
                          type="number"
                          value={floorHeightSuperior}
                          onChange={(e) => updatePersisted({ floorHeightSuperior: Math.max(0, Number(e.target.value)) })}
                          className="h-6 text-[10px] font-mono"
                        />
                      </div>
                    </div>
                    <p className="text-[9px] text-muted-foreground">
                      Dormitório, bancadas e outros: 0mm do piso
                    </p>
                  </div>

                  {/* ── Cotas de Posicionamento (bidirectional) ── */}
                  {wall.enabled && (
                    <div className="space-y-2 pt-2 border-t border-border">
                      <Label className="text-[10px] font-semibold text-muted-foreground flex items-center gap-1">
                        <RulerIcon className="h-3 w-3" /> Cotas de Posicionamento (mm)
                      </Label>
                      {(() => {
                        const halfWall = wall.width / 2;
                        const halfMod = module.width / 2;
                        const cotaEsquerda = Math.round(halfWall + moduleOffsetX - halfMod);
                        const cotaDireita = Math.round(halfWall - moduleOffsetX - halfMod);
                        const cotaPiso = Math.round(computedFloorOffset + moduleOffsetY);
                        const cotaSuperior = Math.round(wall.height - module.height - computedFloorOffset - moduleOffsetY);

                        const handleCotaEsquerda = (val: number) => {
                          const newX = val - halfWall + halfMod;
                          const maxX = halfWall - halfMod;
                          const clampedX = Math.max(-maxX, Math.min(maxX, newX));
                          updatePersisted({ moduleOffsetX: clampedX });
                        };
                        const handleCotaDireita = (val: number) => {
                          const newX = halfWall - halfMod - val;
                          const maxX = halfWall - halfMod;
                          const clampedX = Math.max(-maxX, Math.min(maxX, newX));
                          updatePersisted({ moduleOffsetX: clampedX });
                        };
                        const handleCotaSuperior = (val: number) => {
                          const newY = wall.height - module.height - computedFloorOffset - val;
                          const maxY = wall.height - module.height - computedFloorOffset;
                          const clampedY = Math.max(0, Math.min(maxY, newY));
                          updatePersisted({ moduleOffsetY: clampedY });
                        };
                        const handleCotaPiso = (val: number) => {
                          const newY = val - computedFloorOffset;
                          const maxY = wall.height - module.height - computedFloorOffset;
                          const clampedY = Math.max(0, Math.min(maxY, newY));
                          updatePersisted({ moduleOffsetY: clampedY });
                        };

                        return (
                          <div className="grid grid-cols-2 gap-2">
                            <div className="space-y-0.5">
                              <Label className="text-[9px]">← Esquerda</Label>
                              <Input
                                type="number"
                                key={`ce-${cotaEsquerda}`}
                                defaultValue={Math.max(0, cotaEsquerda)}
                                onBlur={(e) => handleCotaEsquerda(Math.max(0, Number(e.target.value)))}
                                onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
                                className="h-6 text-[10px] font-mono bg-orange-50 dark:bg-orange-950/30 border-orange-300 dark:border-orange-700"
                              />
                            </div>
                            <div className="space-y-0.5">
                              <Label className="text-[9px]">Direita →</Label>
                              <Input
                                type="number"
                                key={`cd-${cotaDireita}`}
                                defaultValue={Math.max(0, cotaDireita)}
                                onBlur={(e) => handleCotaDireita(Math.max(0, Number(e.target.value)))}
                                onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
                                className="h-6 text-[10px] font-mono bg-orange-50 dark:bg-orange-950/30 border-orange-300 dark:border-orange-700"
                              />
                            </div>
                            <div className="space-y-0.5">
                              <Label className="text-[9px]">↓ Piso (total)</Label>
                              <Input
                                type="number"
                                key={`cp-${cotaPiso}`}
                                defaultValue={Math.max(0, cotaPiso)}
                                onBlur={(e) => handleCotaPiso(Math.max(0, Number(e.target.value)))}
                                onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
                                className="h-6 text-[10px] font-mono bg-red-50 dark:bg-red-950/30 border-red-300 dark:border-red-700"
                              />
                            </div>
                            <div className="space-y-0.5">
                              <Label className="text-[9px]">↑ Superior</Label>
                              <Input
                                type="number"
                                key={`cs-${cotaSuperior}`}
                                defaultValue={Math.max(0, cotaSuperior)}
                                onBlur={(e) => handleCotaSuperior(Math.max(0, Number(e.target.value)))}
                                onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
                                className="h-6 text-[10px] font-mono bg-orange-50 dark:bg-orange-950/30 border-orange-300 dark:border-orange-700"
                              />
                            </div>
                          </div>
                        );
                      })()}
                      <p className="text-[8px] text-muted-foreground italic">
                        Valores sincronizam com arraste 3D e cotas visuais
                      </p>
                    </div>
                  )}

                  {/* Floor (Piso) color & texture */}
                  <div className="space-y-2 pt-2 border-t border-border">
                    <Label className="text-[10px] font-semibold text-muted-foreground flex items-center gap-1">
                      <Square className="h-3 w-3" /> Piso
                    </Label>
                    <div className="flex gap-1 flex-wrap">
                      {[
                        { label: "Cinza Claro", value: "#d6d3cd" },
                        { label: "Branco", value: "#f0ede8" },
                        { label: "Madeira", value: "#c4a060" },
                        { label: "Escuro", value: "#555555" },
                      ].map((opt) => (
                        <button
                          key={opt.value}
                          className={`w-7 h-7 rounded border-2 transition-all ${floorColor === opt.value ? "border-primary scale-110" : "border-border"}`}
                          style={{ backgroundColor: opt.value }}
                          onClick={() => updatePersisted({ floorColor: opt.value })}
                          title={opt.label}
                        />
                      ))}
                    </div>
                    <div className="flex items-center gap-2">
                      <label className="flex items-center gap-1 px-2 py-1 rounded-md bg-muted/50 border border-border cursor-pointer text-[10px] hover:bg-muted transition-colors">
                        <Upload className="h-3 w-3" /> Textura Piso
                        <input type="file" accept="image/*" className="hidden"
                          onChange={(e) => {
                            const f = e.target.files?.[0];
                            if (f) handleTextureUpload("floor", f);
                            e.target.value = "";
                          }}
                        />
                      </label>
                      {textureSlots.floor && (
                        <div className="flex items-center gap-1">
                          <img src={textureSlots.floor} className="h-7 w-7 rounded border border-border object-cover" alt="floor texture" />
                          <Button variant="ghost" size="icon" className="h-5 w-5" onClick={() => removeTexture("floor")}>
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
                      <Button variant="ghost" size="icon" className="h-5 w-5"
                        onClick={() => addComponent(type)}
                        disabled={type === "gaveta" && count >= MAX_DRAWERS}
                      >
                        <Plus className="h-3 w-3" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
              {module.components.length > 0 && (
                <div className="space-y-1.5 pt-1 border-t border-border">
                  <Label className="text-[10px] text-muted-foreground">Espessura por componente</Label>
                  {module.components.map((comp, idx) => {
                    const isShelfOrDiv = comp.type === "prateleira" || comp.type === "divisoria";
                    const isDoorOrFront = comp.type === "porta" || comp.type === "gaveta";
                    const thicknessOptions = isShelfOrDiv ? SHELF_THICKNESSES : isDoorOrFront ? DOOR_THICKNESSES : SHELF_THICKNESSES;
                    const typeLabel = comp.type === "prateleira" ? "Prat." : comp.type === "porta" ? "Porta" : comp.type === "gaveta" ? "Gaveta" : comp.type === "divisoria" ? "Div." : comp.type;
                    return (
                      <div key={comp.id} className="space-y-1">
                        <div className="flex items-center justify-between gap-1">
                          <span className="text-[9px] text-foreground truncate w-16">{typeLabel} {idx + 1}</span>
                          <Select
                            value={String(comp.thickness)}
                            onValueChange={(v) => {
                              setModule((p) => {
                                const comps = p.components.map((c) =>
                                  c.id === comp.id ? { ...c, thickness: Number(v) } : c
                                );
                                const updated = { ...p, components: comps };
                                return comp.type === "prateleira" || comp.type === "divisoria" || comp.type === "gaveta"
                                  ? { ...updated, components: redistributeShelves(updated) }
                                  : updated;
                              });
                            }}
                          >
                            <SelectTrigger className="h-5 w-20 text-[9px]"><SelectValue /></SelectTrigger>
                            <SelectContent>
                              {thicknessOptions.map((t) => (
                                <SelectItem key={t} value={String(t)}>{t}mm</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                        {comp.type === "gaveta" && (
                          <>
                            <div className="flex items-center justify-between gap-1 pl-2">
                              <span className="text-[9px] text-muted-foreground truncate w-16">Frente Alt.</span>
                              <Input
                                type="number"
                                className="h-5 w-20 text-[9px] px-1"
                                value={comp.manualFrontHeight ?? comp.frontHeight ?? ""}
                                placeholder="Auto"
                                onChange={(e) => {
                                  const val = e.target.value ? Number(e.target.value) : undefined;
                                  setModule((p) => {
                                    const comps = p.components.map((c) =>
                                      c.id === comp.id ? { ...c, manualFrontHeight: val } : c
                                    );
                                    const updated = { ...p, components: comps };
                                    return { ...updated, components: redistributeShelves(updated) };
                                  });
                                }}
                              />
                            </div>
                            <div className="flex items-center justify-between gap-1 pl-2">
                              <span className="text-[9px] text-muted-foreground truncate w-16">Fundo</span>
                              <Select
                                value={String(comp.bottomThickness ?? 3)}
                                onValueChange={(v) => {
                                  setModule((p) => ({
                                    ...p,
                                    components: p.components.map((c) =>
                                      c.id === comp.id ? { ...c, bottomThickness: Number(v) } : c
                                    ),
                                  }));
                                }}
                              >
                                <SelectTrigger className="h-5 w-20 text-[9px]"><SelectValue /></SelectTrigger>
                                <SelectContent>
                                  {[3, 6, 15].map((t) => (
                                    <SelectItem key={t} value={String(t)}>{t}mm</SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            </div>
                          </>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
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
                <Palette className="h-3.5 w-3.5 text-primary" /> Cores e Texturas do Móvel
              </h4>
              <div className="space-y-2.5">
                {([
                  { key: "body" as const, label: "Caixa (corpo)" },
                  { key: "door" as const, label: "Portas / Frentes" },
                  { key: "shelf" as const, label: "Prateleiras" },
                  { key: "back" as const, label: "Fundo" },
                  { key: "drawer" as const, label: "Corpo Gavetas" },
                ]).map(({ key, label }) => (
                  <div key={key} className="space-y-1">
                    <Label className="text-[10px] font-medium">{label}</Label>
                    <div className="flex items-center gap-1.5 flex-wrap">
                      {FURNITURE_COLOR_OPTIONS.map((opt) => (
                        <button
                          key={opt.value}
                          onClick={() => setFurnitureColor(key, opt.value)}
                          className={`w-5 h-5 rounded border transition-all ${
                            furnitureColors[key] === opt.value ? "border-primary ring-1 ring-primary/30 scale-110" : "border-border"
                          }`}
                          style={{ backgroundColor: opt.value }}
                          title={opt.label}
                        />
                      ))}
                      <input
                        type="color"
                        value={furnitureColors[key]}
                        onChange={(e) => setFurnitureColor(key, e.target.value)}
                        className="w-5 h-5 rounded border border-border cursor-pointer"
                        title="Cor personalizada"
                      />
                      <label className="flex items-center gap-0.5 px-1.5 py-0.5 rounded bg-muted/50 border border-border cursor-pointer text-[9px] hover:bg-muted transition-colors">
                        <Upload className="h-2.5 w-2.5" /> Textura
                        <input type="file" accept="image/*" className="hidden"
                          onChange={(e) => {
                            const f = e.target.files?.[0];
                            if (f) handleTextureUpload(key, f);
                            e.target.value = "";
                          }}
                        />
                      </label>
                      {textureSlots[key] && (
                        <div className="flex items-center gap-0.5">
                          <img src={textureSlots[key]} className="h-5 w-5 rounded border border-border object-cover" alt={`${key} texture`} />
                          <Button variant="ghost" size="icon" className="h-4 w-4" onClick={() => removeTexture(key)}>
                            <Minus className="h-2.5 w-2.5" />
                          </Button>
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
              {/* Catalog materials (if available) */}
              {materiais.length > 0 && (
                <div className="space-y-1 pt-1 border-t border-border">
                  <Label className="text-[11px]">Material do Catálogo</Label>
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

          {/* Biblioteca Salva */}
          {savedModules.length > 0 && (
            <Card>
              <CardContent className="p-3 space-y-2">
                <h4 className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                  <BookOpen className="h-3.5 w-3.5 text-primary" /> Módulos da Biblioteca
                </h4>
                <div className="space-y-1 max-h-[100px] overflow-y-auto">
                  {savedModules.map((sm) => (
                    <button
                      key={sm.id}
                      onClick={() => loadModuleFromLibrary(sm)}
                      className="w-full flex items-center justify-between bg-muted/50 rounded px-2 py-1 hover:bg-muted transition-colors text-left"
                    >
                      <span className="text-[10px] font-medium text-foreground truncate">{sm.name}</span>
                      <FolderOpen className="h-3 w-3 text-muted-foreground shrink-0" />
                    </button>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Ações */}
          <div className="flex gap-2 flex-wrap">
            <Button size="sm" className="flex-1 gap-1.5" onClick={handleSave}>
              <Save className="h-3.5 w-3.5" /> Salvar
            </Button>
            <Button size="sm" variant="secondary" className="gap-1.5" onClick={() => {
              setSaveLibName(module.name);
              setShowSaveLibrary(true);
            }}>
              <FolderOpen className="h-3.5 w-3.5" /> Biblioteca
            </Button>
            <Button size="sm" variant="outline" className="gap-1.5" onClick={() => generateBomPdf(module, bom)}>
              <FileDown className="h-3.5 w-3.5" /> PDF
            </Button>
            <Button variant="outline" size="sm" onClick={handleReset} className="gap-1.5">
              <RotateCcw className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>
      )}

      {/* ── Área de Preview 3D + BOM ── */}
      <div className="flex-1 flex flex-col gap-3 min-w-0">
        <Card className="flex-1 relative overflow-hidden min-h-[350px]">
          <CardContent className="p-0 absolute inset-0">
            <canvas
              ref={canvasRef}
              className="w-full h-full block"
              style={{ minHeight: 350, cursor: lockPosition ? "default" : "grab" }}
              onPointerDown={handleCanvasPointerDown}
              onPointerMove={handleCanvasPointerMove}
              onPointerUp={handleCanvasPointerUp}
            />
            {/* Camera preset views */}
            <div className="absolute top-2 left-2 flex flex-col gap-1 z-10">
              {([
                { label: "Frontal", icon: "F", pos: [0, 0.5, 1], target: [0, 0.5, 0] },
                { label: "Traseira", icon: "T", pos: [0, 0.5, -1], target: [0, 0.5, 0] },
                { label: "Esquerda", icon: "E", pos: [-1, 0.5, 0], target: [0, 0.5, 0] },
                { label: "Direita", icon: "D", pos: [1, 0.5, 0], target: [0, 0.5, 0] },
                { label: "Planta", icon: "P", pos: [0, 1, 0.01], target: [0, 0, 0] },
                { label: "Perspectiva", icon: "3D", pos: [1, 0.7, 1], target: [0, 0.3, 0] },
              ] as { label: string; icon: string; pos: number[]; target: number[] }[]).map((view) => (
                <Button
                  key={view.label}
                  variant="outline"
                  size="sm"
                  className="h-6 text-[9px] px-1.5 gap-0.5 bg-background/80 backdrop-blur-sm w-[70px] justify-start"
                  title={view.label}
                  onClick={() => {
                    if (!threeRef.current) return;
                    const { camera, controls } = threeRef.current;
                    const maxDim = Math.max(module.width, module.height, module.depth) * 0.01;
                    const dist = Math.max(maxDim * 2.2, 4);
                    const centerY = (computedFloorOffset * 0.01) + (module.height * 0.01) / 2;
                    const endPos: [number, number, number] = [
                      view.pos[0] * dist,
                      view.pos[1] * dist + (view.label === "Planta" ? dist : 0),
                      view.pos[2] * dist,
                    ];
                    const endTarget: [number, number, number] = [
                      view.target[0],
                      view.label === "Planta" ? 0 : centerY,
                      view.target[2] * maxDim * 0.3,
                    ];
                    cameraAnimRef.current = {
                      startPos: [camera.position.x, camera.position.y, camera.position.z],
                      endPos,
                      startTarget: [controls.target.x, controls.target.y, controls.target.z],
                      endTarget,
                      progress: 0,
                      active: true,
                    };
                  }}
                >
                  <span className="font-bold text-[9px] w-4 text-center">{view.icon}</span>
                  <span className="truncate">{view.label}</span>
                </Button>
              ))}
            </div>
            {/* Module controls: lock, group, delete */}
            <div className="absolute bottom-2 right-2 flex gap-1 z-10">
              <Button
                variant={lockPosition ? "default" : "outline"}
                size="sm"
                className="h-7 text-[9px] px-2 gap-1 bg-background/80 backdrop-blur-sm"
                onClick={() => updatePersisted({ lockPosition: !lockPosition })}
                title={lockPosition ? "Desbloquear arraste" : "Travar posição"}
              >
                {lockPosition ? <Lock className="h-3 w-3" /> : <Unlock className="h-3 w-3" />}
                {lockPosition ? "Travado" : "Livre"}
              </Button>
              <Button
                variant={groupSelect ? "default" : "outline"}
                size="sm"
                className="h-7 text-[9px] px-2 gap-1 bg-background/80 backdrop-blur-sm"
                onClick={() => updatePersisted({ groupSelect: !groupSelect })}
                title={groupSelect ? "Mover individualmente" : "Mover todos juntos"}
                disabled={duplicates.length === 0}
              >
                <Group className="h-3 w-3" />
                {groupSelect ? "Grupo" : "Individual"}
              </Button>
              <Button
                variant={collisionEnabled ? "default" : "outline"}
                size="sm"
                className="h-7 text-[9px] px-2 gap-1 bg-background/80 backdrop-blur-sm"
                onClick={() => updatePersisted({ collisionEnabled: !collisionEnabled })}
                title={collisionEnabled ? "Desativar colisão" : "Ativar colisão"}
              >
                {collisionEnabled ? <Shield className="h-3 w-3" /> : <ShieldOff className="h-3 w-3" />}
                {collisionEnabled ? "Colisão" : "Livre"}
              </Button>
              {selectedModuleId && (
                <Button
                  variant="destructive"
                  size="sm"
                  className="h-7 text-[9px] px-2 gap-1"
                  onClick={deleteSelectedModule}
                  title="Excluir módulo selecionado"
                >
                  <Trash2 className="h-3 w-3" /> Excluir
                </Button>
              )}
              {selectedModuleId && (
                <Badge variant="secondary" className="text-[9px] h-7 flex items-center">
                  <MousePointer className="h-3 w-3 mr-1" />
                  {selectedModuleId === "__main__" ? module.name : duplicates.find((d) => d.id === selectedModuleId)?.module.name || ""}
                </Badge>
              )}
            </div>
            <div className="absolute top-2 right-2 flex gap-1.5 flex-wrap justify-end max-w-[65%]">
              <Button
                variant={showCotas ? "default" : "outline"}
                size="sm"
                className="h-6 text-[10px] px-2 gap-1"
                onClick={() => updatePersisted({ showCotas: !showCotas })}
              >
                {showCotas ? <EyeOff className="h-3 w-3" /> : <Eye className="h-3 w-3" />}
                Cotas
              </Button>
              {doorCount > 0 && (
                <Button
                  variant={openDoors ? "default" : "outline"}
                  size="sm"
                  className="h-6 text-[10px] px-2 gap-1"
                  onClick={() => updatePersisted({ openDoors: !openDoors })}
                >
                  {openDoors ? <EyeOff className="h-3 w-3" /> : <Eye className="h-3 w-3" />}
                  Portas
                </Button>
              )}
              {drawerCount > 0 && (
                <Button
                  variant={openDrawers ? "default" : "outline"}
                  size="sm"
                  className="h-6 text-[10px] px-2 gap-1"
                  onClick={() => updatePersisted({ openDrawers: !openDrawers })}
                >
                  {openDrawers ? <EyeOff className="h-3 w-3" /> : <Eye className="h-3 w-3" />}
                  Gavetas
                </Button>
              )}
              <Button
                variant="outline"
                size="sm"
                className="h-6 text-[10px] px-2 gap-1"
                onClick={() => {
                  if (!threeRef.current) return;
                  const { renderer, scene, camera } = threeRef.current;
                  // Render at 2x resolution
                  const origW = renderer.domElement.width;
                  const origH = renderer.domElement.height;
                  renderer.setSize(origW * 2, origH * 2);
                  renderer.render(scene, camera);
                  const dataUrl = renderer.domElement.toDataURL("image/png");
                  renderer.setSize(origW, origH);
                  renderer.render(scene, camera);
                  // Add watermark via canvas
                  const img = new Image();
                  img.onload = () => {
                    const canvas = document.createElement("canvas");
                    canvas.width = img.width;
                    canvas.height = img.height;
                    const ctx = canvas.getContext("2d")!;
                    ctx.drawImage(img, 0, 0);
                    // Watermark text
                    ctx.globalAlpha = 0.3;
                    ctx.fillStyle = "#333333";
                    ctx.font = `bold ${Math.max(16, canvas.height * 0.025)}px Arial`;
                    ctx.textAlign = "right";
                    ctx.fillText(`OrçaMóvel Pro • ${module.name}`, canvas.width - 20, canvas.height - 20);
                    ctx.fillText(
                      `${module.width}×${module.height}×${module.depth}mm`,
                      canvas.width - 20,
                      canvas.height - 45
                    );
                    ctx.globalAlpha = 1;
                    // Download
                    const link = document.createElement("a");
                    link.download = `Projeto_3D_${module.name.replace(/\s+/g, "_")}.png`;
                    link.href = canvas.toDataURL("image/png");
                    link.click();
                    toast.success("Imagem PNG exportada em alta resolução!");
                  };
                  img.src = dataUrl;
                }}
              >
                <Camera className="h-3 w-3" /> PNG
               </Button>
              <Button
                variant="outline"
                size="sm"
                className="h-6 text-[10px] px-2 gap-1"
                onClick={async () => {
                  if (!threeRef.current) return;
                  const { renderer, scene, camera, controls } = threeRef.current;
                  const maxDim = Math.max(module.width, module.height, module.depth) * 0.01;
                  const dist = Math.max(maxDim * 2.2, 4);
                  const centerY = (computedFloorOffset * 0.01) + (module.height * 0.01) / 2;
                  const views = [
                    { label: "Frontal", pos: [0, 0.5, 1], target: [0, 0.5, 0] },
                    { label: "Traseira", pos: [0, 0.5, -1], target: [0, 0.5, 0] },
                    { label: "Esquerda", pos: [-1, 0.5, 0], target: [0, 0.5, 0] },
                    { label: "Direita", pos: [1, 0.5, 0], target: [0, 0.5, 0] },
                    { label: "Planta", pos: [0, 1, 0.01], target: [0, 0, 0] },
                    { label: "Perspectiva", pos: [1, 0.7, 1], target: [0, 0.3, 0] },
                  ];
                  const origW = renderer.domElement.width;
                  const origH = renderer.domElement.height;
                  const snapW = 1200;
                  const snapH = 900;
                  const snapshots: { label: string; dataUrl: string }[] = [];
                  // Save original camera state
                  const origPos = camera.position.clone();
                  const origTarget = controls.target.clone();
                  camera.aspect = snapW / snapH;
                  camera.updateProjectionMatrix();
                  renderer.setSize(snapW, snapH);
                  for (const v of views) {
                    camera.position.set(
                      v.pos[0] * dist,
                      v.pos[1] * dist + (v.label === "Planta" ? dist : 0),
                      v.pos[2] * dist
                    );
                    controls.target.set(v.target[0], v.label === "Planta" ? 0 : centerY, v.target[2] * maxDim * 0.3);
                    controls.update();
                    renderer.render(scene, camera);
                    snapshots.push({ label: v.label, dataUrl: renderer.domElement.toDataURL("image/jpeg", 0.92) });
                  }
                  // Restore camera
                  camera.position.copy(origPos);
                  controls.target.copy(origTarget);
                  camera.aspect = origW / origH;
                  camera.updateProjectionMatrix();
                  renderer.setSize(origW, origH);
                  controls.update();
                  renderer.render(scene, camera);
                  // Build PDF with jsPDF
                  const { default: jsPDFLib } = await import("jspdf");
                  const pdf = new jsPDFLib({ orientation: "landscape", unit: "mm", format: "a4" });
                  const pw = pdf.internal.pageSize.getWidth();
                  const ph = pdf.internal.pageSize.getHeight();
                  // Title page
                  pdf.setFontSize(22);
                  pdf.setFont("helvetica", "bold");
                  pdf.text("PROPOSTA COMERCIAL — VISTAS 3D", pw / 2, 40, { align: "center" });
                  pdf.setFontSize(12);
                  pdf.setFont("helvetica", "normal");
                  pdf.text(`Projeto: ${module.name}`, pw / 2, 55, { align: "center" });
                  pdf.text(`Dimensões: ${module.width}×${module.height}×${module.depth}mm`, pw / 2, 63, { align: "center" });
                  pdf.text(new Date().toLocaleDateString("pt-BR"), pw / 2, 71, { align: "center" });
                  // One page per view
                  for (const snap of snapshots) {
                    pdf.addPage();
                    pdf.setFontSize(14);
                    pdf.setFont("helvetica", "bold");
                    pdf.text(`Vista: ${snap.label}`, 15, 15);
                    const imgW = pw - 30;
                    const imgH = imgW * (snapH / snapW);
                    const yOff = Math.max(20, (ph - imgH) / 2);
                    pdf.addImage(snap.dataUrl, "JPEG", 15, yOff, imgW, imgH);
                    // Footer
                    pdf.setFontSize(7);
                    pdf.setFont("helvetica", "normal");
                    pdf.setTextColor(150);
                    pdf.text("OrçaMóvel Pro — Proposta gerada automaticamente", pw / 2, ph - 8, { align: "center" });
                    pdf.setTextColor(0);
                  }
                  pdf.save(`Proposta_Vistas_${module.name.replace(/\s+/g, "_")}.pdf`);
                  toast.success("PDF multi-ângulo exportado com sucesso!");
                }}
              >
                <FileDown className="h-3 w-3" /> PDF Vistas
              </Button>
              <Badge variant="secondary" className="text-[10px]">
                {module.width}×{module.height}×{module.depth}mm
              </Badge>
              {computedFloorOffset > 0 && (
                <Badge variant="outline" className="text-[10px]">
                  Piso: {computedFloorOffset}mm
                </Badge>
              )}
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
            {/* Cota color legend */}
            {showCotas && (
              <div className="absolute bottom-2 left-2 bg-background/90 backdrop-blur-sm rounded-lg border border-border p-2 space-y-0.5 z-10">
                <p className="text-[9px] font-semibold text-foreground mb-1">Legenda das Cotas</p>
                {COTA_LEGEND.map((item) => (
                  <div key={item.color} className="flex items-center gap-1.5">
                    <span className="w-3 h-2 rounded-sm inline-block" style={{ backgroundColor: item.hex }} />
                    <span className="text-[8px] text-muted-foreground">{item.label}</span>
                  </div>
                ))}
              </div>
            )}
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

      {/* Save to Library Dialog */}
      <Dialog open={showSaveLibrary} onOpenChange={setShowSaveLibrary}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FolderOpen className="h-4 w-4 text-primary" /> Salvar na Biblioteca
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1">
              <Label className="text-xs">Nome do Módulo</Label>
              <Input
                value={saveLibName}
                onChange={(e) => setSaveLibName(e.target.value)}
                placeholder="Ex: Inferior 3 Gavetas"
                className="h-8 text-sm"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Categoria</Label>
              <Select value={saveLibCategory} onValueChange={(v) => { setSaveLibCategory(v); setSaveLibSubcategory(""); }}>
                <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Selecionar categoria..." /></SelectTrigger>
                <SelectContent>
                  {flatCategories.filter((c) => !c.parentId).map((c) => (
                    <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {saveLibCategory && flatCategories.filter((c) => c.parentId === saveLibCategory).length > 0 && (
              <div className="space-y-1">
                <Label className="text-xs">Subcategoria</Label>
                <Select value={saveLibSubcategory} onValueChange={setSaveLibSubcategory}>
                  <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Selecionar subcategoria..." /></SelectTrigger>
                  <SelectContent>
                    {flatCategories.filter((c) => c.parentId === saveLibCategory).map((c) => (
                      <SelectItem key={c.id} value={c.id}>{"  ".repeat(c.depth)}{c.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            <p className="text-[10px] text-muted-foreground">
              O módulo será salvo com todas as dimensões, componentes e cores atuais.
              Poderá ser reutilizado em novos projetos.
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setShowSaveLibrary(false)}>Cancelar</Button>
            <Button size="sm" onClick={handleSaveToLibrary} className="gap-1.5">
              <Save className="h-3.5 w-3.5" /> Salvar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
