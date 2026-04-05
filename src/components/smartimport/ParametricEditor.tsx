import { useState, useRef, useEffect, useCallback, useMemo } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { ParametricBOMPanel } from "./parametric/ParametricBOMPanel";
import { ParametricSidePanel } from "./parametric/ParametricSidePanel";
import { ParametricPreview3D } from "./parametric/ParametricPreview3D";
import {
  PanelLeftClose, PanelLeft, FolderOpen, Save,
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
import { useModuleDrag } from "@/hooks/useModuleDrag";
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

  // ── Drag modules in 3D (via hook) ──
  const { handleCanvasPointerDown, handleCanvasPointerMove, handleCanvasPointerUp } = useModuleDrag({
    module,
    duplicates,
    wall,
    moduleOffsetX,
    moduleOffsetY,
    lockPosition,
    groupSelect,
    collisionEnabled,
    computedFloorOffset,
    selectedModuleId,
    threeRef,
    updatePersisted,
  });

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
        <ParametricSidePanel
          module={module}
          setModule={setModule}
          spans={spans}
          bom={bom}
          wall={wall}
          setWall={setWall}
          furnitureColors={furnitureColors}
          setFurnitureColor={setFurnitureColor}
          textureSlots={textureSlots}
          handleTextureUpload={handleTextureUpload}
          removeTexture={removeTexture}
          duplicates={duplicates}
          duplicateModule={duplicateModule}
          removeDuplicate={removeDuplicate}
          updatePersisted={updatePersisted}
          floorHeightInferior={floorHeightInferior}
          floorHeightSuperior={floorHeightSuperior}
          floorColor={floorColor}
          moduleOffsetX={moduleOffsetX}
          moduleOffsetY={moduleOffsetY}
          computedFloorOffset={computedFloorOffset}
          savedModules={savedModules}
          loadModuleFromLibrary={loadModuleFromLibrary}
          flatCategories={flatCategories}
          materiais={materiais}
          onSave={handleSave}
          onReset={handleReset}
          onSaveLibrary={() => {
            setSaveLibName(module.name);
            setShowSaveLibrary(true);
          }}
          onExportPdf={() => generateBomPdf(module, bom)}
          saveLibName={saveLibName}
          setSaveLibName={setSaveLibName}
        />
      )}

      {/* ── Área de Preview 3D + BOM ── */}
      <div className="flex-1 flex flex-col gap-3 min-w-0">
        <ParametricPreview3D
          module={module}
          wall={wall}
          duplicates={duplicates}
          showCotas={showCotas}
          openDoors={openDoors}
          openDrawers={openDrawers}
          lockPosition={lockPosition}
          groupSelect={groupSelect}
          collisionEnabled={collisionEnabled}
          selectedModuleId={selectedModuleId}
          computedFloorOffset={computedFloorOffset}
          canvasRef={canvasRef}
          threeRef={threeRef}
          cameraAnimRef={cameraAnimRef}
          updatePersisted={updatePersisted}
          deleteSelectedModule={deleteSelectedModule}
          onPointerDown={handleCanvasPointerDown}
          onPointerMove={handleCanvasPointerMove}
          onPointerUp={handleCanvasPointerUp}
        />

        <ParametricBOMPanel bom={bom} />
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
