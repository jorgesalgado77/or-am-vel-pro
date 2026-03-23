import { useRef, useState, useEffect, useCallback } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Maximize2, Minimize2, FileBox, Loader2, Pause, Play, RotateCcw } from "lucide-react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { loadModelForPreview, disposeSceneGraph } from "./modelPreviewUtils";

interface GLBViewerProps {
  fileUrl: string;
  onObjectSelect?: (name: string, metadata: any) => void;
}

interface SelectedPieceInfo {
  name: string;
  width: number;
  height: number;
  depth: number;
  materialName: string;
  materialColor: string | null;
  materialType: string;
  vertexCount: number;
}

type BackgroundPreset = "dark" | "light" | "studio" | "clean";
type LightingPreset = "balanced" | "soft" | "contrast";
type QualityPreset = "low" | "balanced" | "high";

const BACKGROUND_PRESETS: Record<BackgroundPreset, { background: number; ground: number; showGrid: boolean }> = {
  dark: { background: 0x1e293b, ground: 0x111827, showGrid: true },
  light: { background: 0xf8fafc, ground: 0xe2e8f0, showGrid: true },
  studio: { background: 0x202938, ground: 0x334155, showGrid: true },
  clean: { background: 0xffffff, ground: 0xffffff, showGrid: false },
};

const LIGHTING_PRESETS: Record<LightingPreset, { ambient: number; key: number; fill: number; rim: number; hemi: number }> = {
  balanced: { ambient: 0.6, key: 1.2, fill: 0.5, rim: 0.3, hemi: 0.5 },
  soft: { ambient: 0.9, key: 0.8, fill: 0.7, rim: 0.15, hemi: 0.6 },
  contrast: { ambient: 0.35, key: 1.6, fill: 0.3, rim: 0.6, hemi: 0.25 },
};

const QUALITY_PRESETS: Record<QualityPreset, { pixelRatio: number; antialias: boolean; shadows: boolean; label: string }> = {
  low: { pixelRatio: 0.8, antialias: false, shadows: false, label: "Leve" },
  balanced: { pixelRatio: Math.min(window.devicePixelRatio, 1.2), antialias: true, shadows: false, label: "Equilibrado" },
  high: { pixelRatio: Math.min(window.devicePixelRatio, 1.5), antialias: true, shadows: true, label: "Alta fidelidade" },
};

const FORMAT_LOADING_MESSAGES: Record<string, string[]> = {
  glb: ["Decodificando modelo GLB...", "Carregando geometrias e texturas...", "Montando cena GLTF..."],
  gltf: ["Decodificando modelo GLTF...", "Carregando geometrias e texturas...", "Montando cena GLTF..."],
  obj: ["Lendo geometria OBJ...", "Processando vértices e faces...", "Aplicando materiais OBJ..."],
  fbx: ["Decodificando arquivo FBX...", "Processando animações e geometrias...", "Convertendo materiais FBX..."],
  stl: ["Lendo malha STL...", "Calculando normais de superfície...", "Preparando visualização STL..."],
  dxf: ["Analisando entidades DXF...", "Convertendo coordenadas CAD...", "Montando geometria vetorial DXF..."],
};

function applyBackgroundPreset(THREE: any, scene: any, preset: BackgroundPreset) {
  const palette = BACKGROUND_PRESETS[preset];
  scene.background = new THREE.Color(palette.background);
  scene.fog = new THREE.Fog(palette.background, 40, 100);
}

function applyLightingPreset(lights: any, preset: LightingPreset) {
  const config = LIGHTING_PRESETS[preset];
  lights.ambient.intensity = config.ambient;
  lights.dir1.intensity = config.key;
  lights.dir2.intensity = config.fill;
  lights.dir3.intensity = config.rim;
  lights.hemi.intensity = config.hemi;
}

function getFileExtension(url: string): string {
  try {
    const path = new URL(url).pathname;
    return path.split(".").pop()?.toLowerCase() || "";
  } catch {
    return url.split(".").pop()?.toLowerCase() || "";
  }
}

function LoadingOverlay({ progress, label }: { progress: number; label: string }) {
  return (
    <div className="absolute inset-0 z-20 flex flex-col items-center justify-center bg-background/80 backdrop-blur-sm gap-4">
      <Loader2 className="h-8 w-8 animate-spin text-primary" />
      <div className="w-48 space-y-2">
        <Progress value={progress} className="h-2" />
        <p className="text-xs text-center text-muted-foreground">{label}</p>
      </div>
    </div>
  );
}

function WebGLViewer({
  fileUrl,
  onObjectSelect,
  controlsRef,
  backgroundPreset,
  lightingPreset,
  qualityPreset,
}: GLBViewerProps & {
  controlsRef?: React.MutableRefObject<any>;
  backgroundPreset: BackgroundPreset;
  lightingPreset: LightingPreset;
  qualityPreset: QualityPreset;
}) {
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [progress, setProgress] = useState(0);
  const [progressLabel, setProgressLabel] = useState("Inicializando...");
  const [selectedPiece, setSelectedPiece] = useState<SelectedPieceInfo | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const threeRef = useRef<any>(null);
  const onObjectSelectRef = useRef(onObjectSelect);
  const needsRenderRef = useRef(true);

  useEffect(() => {
    onObjectSelectRef.current = onObjectSelect;
  }, [onObjectSelect]);

  useEffect(() => {
    const testCanvas = document.createElement("canvas");
    const gl = testCanvas.getContext("webgl2") || testCanvas.getContext("webgl");
    if (!gl) {
      setError("WebGL não é suportado neste navegador.");
      setLoading(false);
      return;
    }

    let mounted = true;
    let animationFrameId = 0;
    let renderer: any = null;
    let controls: any = null;
    let resizeHandler: (() => void) | null = null;
    let clickHandler: ((e: MouseEvent) => void) | null = null;
    let canvasElement: HTMLCanvasElement | null = null;

    (async () => {
      try {
        const ext = getFileExtension(fileUrl);
        const formatMsgs = FORMAT_LOADING_MESSAGES[ext] || ["Carregando arquivo 3D...", "Processando geometria...", "Preparando visualização..."];
        const quality = QUALITY_PRESETS[qualityPreset];

        setProgress(10);
        setProgressLabel(formatMsgs[0]);
        const THREE = await import("three");
        const { OrbitControls } = await import("three/examples/jsm/controls/OrbitControls.js");

        if (!mounted || !canvasRef.current) return;

        setProgress(20);
        setProgressLabel(formatMsgs[1]);

        const container = canvasRef.current.parentElement!;
        const width = container.clientWidth;
        const height = container.clientHeight;

        renderer = new THREE.WebGLRenderer({
          canvas: canvasRef.current,
          antialias: quality.antialias,
          alpha: true,
          powerPreference: qualityPreset === "low" ? "low-power" : "high-performance",
        });
        canvasElement = canvasRef.current;
        renderer.setSize(width, height);
        renderer.setPixelRatio(quality.pixelRatio);

        // ── CRITICAL: Correct color output ──
        renderer.outputColorSpace = THREE.SRGBColorSpace;
        renderer.toneMapping = THREE.ACESFilmicToneMapping;
        renderer.toneMappingExposure = 1.05;
        // Enable physically correct lighting (Three.js r155+)
        if ("useLegacyLights" in renderer) {
          renderer.useLegacyLights = false;
        }

        if (quality.shadows) {
          renderer.shadowMap.enabled = true;
          renderer.shadowMap.type = THREE.PCFSoftShadowMap;
        }

        const scene = new THREE.Scene();
        applyBackgroundPreset(THREE, scene, backgroundPreset);

        const camera = new THREE.PerspectiveCamera(50, width / height, 0.1, 1000);
        camera.position.set(8, 6, 8);

        controls = new OrbitControls(camera, renderer.domElement);
        controls.enableDamping = true;
        controls.dampingFactor = 0.08;
        controls.autoRotate = true;
        controls.autoRotateSpeed = 1.5;
        controls.minDistance = 2;
        controls.maxDistance = 50;
        controls.enablePan = true;
        controls.maxPolarAngle = Math.PI * 0.9;
        controls.minPolarAngle = Math.PI * 0.05;

        // Mark scene dirty when user interacts
        controls.addEventListener("change", () => { needsRenderRef.current = true; });

        if (controlsRef) {
          controlsRef.current = {
            controls,
            camera,
            initialPos: camera.position.clone(),
            initialTarget: controls.target.clone(),
          };
        }

        // ── Lighting ──
        const ambient = new THREE.AmbientLight(0xffffff, 0.6);
        scene.add(ambient);
        const dir1 = new THREE.DirectionalLight(0xffffff, 1.2);
        dir1.position.set(10, 15, 5);
        scene.add(dir1);
        const dir2 = new THREE.DirectionalLight(0xffffff, 0.5);
        dir2.position.set(-8, 10, -8);
        scene.add(dir2);
        const dir3 = new THREE.DirectionalLight(0xffffff, 0.3);
        dir3.position.set(0, -5, 10);
        scene.add(dir3);
        const hemi = new THREE.HemisphereLight(0xffffff, 0x444444, 0.5);
        scene.add(hemi);
        applyLightingPreset({ ambient, dir1, dir2, dir3, hemi }, lightingPreset);

        // ── Subtle Environment Map for metallic reflections ──
        const pmremGenerator = new THREE.PMREMGenerator(renderer);
        pmremGenerator.compileEquirectangularShader();
        const neutralEnvScene = new THREE.Scene();
        neutralEnvScene.background = new THREE.Color(0xcccccc);
        // Add gradient lights to create subtle reflections
        const envLight1 = new THREE.DirectionalLight(0xffffff, 0.8);
        envLight1.position.set(1, 1, 1);
        neutralEnvScene.add(envLight1);
        const envLight2 = new THREE.DirectionalLight(0x8899aa, 0.4);
        envLight2.position.set(-1, 0.5, -1);
        neutralEnvScene.add(envLight2);
        neutralEnvScene.add(new THREE.AmbientLight(0xdddddd, 0.6));
        const envMap = pmremGenerator.fromScene(neutralEnvScene, 0.04).texture;
        scene.environment = envMap;
        pmremGenerator.dispose();

        const gridPalette = BACKGROUND_PRESETS[backgroundPreset];
        const grid = new THREE.GridHelper(30, 30, gridPalette.ground, gridPalette.ground);
        (grid.material as any).opacity = 0.4;
        (grid.material as any).transparent = true;
        grid.visible = gridPalette.showGrid;
        scene.add(grid);

        threeRef.current = {
          THREE, scene, renderer, camera, controls,
          lights: { ambient, dir1, dir2, dir3, hemi },
          grid, loadedObject: null, selectedObject: null,
        };

        setProgress(40);
        setProgressLabel(formatMsgs[1]);

        const onLoadProgress = (event: any) => {
          if (event.lengthComputable) {
            const pct = 40 + (event.loaded / event.total) * 40;
            if (mounted) setProgress(Math.min(pct, 80));
          }
        };

        setProgressLabel(formatMsgs[2]);
        const loadedObject = await loadModelForPreview(THREE, fileUrl, onLoadProgress);

        if (!mounted) return;

        setProgress(85);
        setProgressLabel(`Finalizando (${ext.toUpperCase()})...`);

        scene.add(loadedObject);

        // Center and scale
        const box = new THREE.Box3().setFromObject(loadedObject);
        const center = box.getCenter(new THREE.Vector3());
        const size = box.getSize(new THREE.Vector3());
        const maxDim = Math.max(size.x, size.y, size.z);
        if (maxDim > 0) {
          const scale = 6 / maxDim;
          loadedObject.scale.setScalar(scale);
          loadedObject.position.sub(center.multiplyScalar(scale));
        }

        threeRef.current.loadedObject = loadedObject;

        // ── Click selection ──
        const raycaster = new THREE.Raycaster();
        raycaster.params.Line = { threshold: 0.25 };
        const mouse = new THREE.Vector2();
        let selectedObj: any = null;

        clickHandler = (event: MouseEvent) => {
          const rect = renderer.domElement.getBoundingClientRect();
          mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
          mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
          raycaster.setFromCamera(mouse, camera);

          // Restore previous selection
          if (selectedObj?.userData?.originalMaterial) {
            selectedObj.material = selectedObj.userData.originalMaterial;
            selectedObj = null;
          }

          const intersects = raycaster.intersectObjects([loadedObject], true);
          const hit = intersects.find((e: any) => e.object?.isMesh || e.object?.isLine || e.object?.isLineSegments)?.object as any;

          if (!hit) {
            if (mounted) setSelectedPiece(null);
            needsRenderRef.current = true;
            return;
          }

          selectedObj = hit;
          const origMat = hit.userData?.originalMaterial || hit.material;

          // Lightweight highlight: add emissive glow without replacing material properties
          if (hit.isMesh && origMat?.clone) {
            const hl = origMat.clone();
            if ("emissive" in hl) {
              hl.emissive = new THREE.Color(0x38bdf8);
              hl.emissiveIntensity = 0.2;
            }
            hl.needsUpdate = true;
            hit.material = hl;
          } else if (!hit.isMesh) {
            hit.material = new THREE.LineBasicMaterial({ color: 0x38bdf8 });
          }

          const pb = new THREE.Box3().setFromObject(hit);
          const ps = pb.getSize(new THREE.Vector3());
          const sf = loadedObject.scale.x || 1;

          if (mounted) {
            setSelectedPiece({
              name: hit.name || "Objeto sem nome",
              width: Math.round((ps.x / sf) * 100) / 100,
              height: Math.round((ps.y / sf) * 100) / 100,
              depth: Math.round((ps.z / sf) * 100) / 100,
              materialName: origMat?.name || "Padrão",
              materialColor: origMat?.color?.getHexString?.() || null,
              materialType: origMat?.type || "Unknown",
              vertexCount: hit.geometry?.attributes?.position?.count || 0,
            });
          }

          needsRenderRef.current = true;

          onObjectSelectRef.current?.(hit.name || "Objeto sem nome", {
            type: hit.type,
            dimensions: { width: ps.x / sf, height: ps.y / sf, depth: ps.z / sf },
            geometry: hit.geometry ? { vertices: hit.geometry.attributes?.position?.count || 0 } : null,
            material: { name: origMat?.name, color: origMat?.color?.getHexString?.(), finish: origMat?.type },
            position: { x: hit.position.x, y: hit.position.y, z: hit.position.z },
          });
        };

        renderer.domElement.addEventListener("click", clickHandler);

        setProgress(100);
        setProgressLabel("Concluído!");
        setTimeout(() => { if (mounted) setLoading(false); }, 200);

        // ── On-demand render loop with FPS monitoring ──
        let frameCount = 0;
        let lastFpsTime = performance.now();
        let currentPixelRatio = quality.pixelRatio;
        const MIN_PIXEL_RATIO = 0.8;

        const animate = () => {
          if (!mounted) return;
          animationFrameId = requestAnimationFrame(animate);

          const updated = controls.update();
          if (controls.autoRotate || needsRenderRef.current || updated) {
            renderer.render(scene, camera);
            needsRenderRef.current = false;
            frameCount++;
          }

          // FPS monitoring — auto-downgrade every 2 seconds
          const now = performance.now();
          if (now - lastFpsTime >= 2000) {
            const fps = (frameCount / ((now - lastFpsTime) / 1000));
            frameCount = 0;
            lastFpsTime = now;

            if (fps < 25 && currentPixelRatio > MIN_PIXEL_RATIO) {
              currentPixelRatio = Math.max(MIN_PIXEL_RATIO, currentPixelRatio - 0.15);
              renderer.setPixelRatio(currentPixelRatio);
              needsRenderRef.current = true;
            }
          }
        };
        animate();

        resizeHandler = () => {
          if (!canvasRef.current) return;
          const c = canvasRef.current.parentElement!;
          const w = c.clientWidth;
          const h = c.clientHeight;
          camera.aspect = w / h;
          camera.updateProjectionMatrix();
          renderer.setSize(w, h);
          needsRenderRef.current = true;
        };
        window.addEventListener("resize", resizeHandler);
      } catch (err: any) {
        console.error("WebGL init error:", err);
        if (mounted) {
          setError(`Erro ao carregar: ${err.message || "erro desconhecido"}`);
          setLoading(false);
        }
      }
    })();

    return () => {
      mounted = false;
      cancelAnimationFrame(animationFrameId);
      if (resizeHandler) window.removeEventListener("resize", resizeHandler);
      if (clickHandler && canvasElement) canvasElement.removeEventListener("click", clickHandler);
      // Dispose scene graph (geometries, materials, textures)
      if (threeRef.current?.loadedObject) {
        disposeSceneGraph(threeRef.current.loadedObject);
      }
      controls?.dispose?.();
      renderer?.dispose?.();
      threeRef.current = null;
    };
  }, [fileUrl]);

  // React to background/lighting preset changes without re-init
  useEffect(() => {
    if (!threeRef.current) return;
    const { THREE, scene, renderer, lights, grid } = threeRef.current;
    applyBackgroundPreset(THREE, scene, backgroundPreset);
    applyLightingPreset(lights, lightingPreset);
    const gridPalette = BACKGROUND_PRESETS[backgroundPreset];
    grid.visible = gridPalette.showGrid;
    grid.material.color?.setHex?.(gridPalette.ground);
    grid.material.needsUpdate = true;
    renderer.setClearColor(gridPalette.background);
    needsRenderRef.current = true;
  }, [backgroundPreset, lightingPreset]);

  // React to quality preset changes without full re-init
  useEffect(() => {
    if (!threeRef.current) return;
    const { renderer } = threeRef.current;
    const quality = QUALITY_PRESETS[qualityPreset];
    renderer.setPixelRatio(quality.pixelRatio);
    needsRenderRef.current = true;
  }, [qualityPreset]);

  if (error) return <FallbackView message={error} fileUrl={fileUrl} />;

  return (
    <div className="relative w-full h-full">
      <canvas ref={canvasRef} className="w-full h-full" />
      {loading && <LoadingOverlay progress={progress} label={progressLabel} />}
      {!loading && !selectedPiece && (
        <div className="absolute bottom-3 left-3 z-10">
          <Badge variant="secondary" className="text-[10px] bg-background/80 backdrop-blur">
            Clique em uma peça para selecionar
          </Badge>
        </div>
      )}
      {!loading && selectedPiece && (
        <div className="absolute bottom-3 left-3 z-10 bg-background/90 backdrop-blur rounded-lg border border-border p-3 shadow-lg w-[260px]">
          <p className="text-xs font-semibold text-foreground truncate mb-2">{selectedPiece.name}</p>
          <div className="grid grid-cols-3 gap-2 text-[10px] mb-2">
            <div className="text-center">
              <p className="text-muted-foreground">Largura</p>
              <p className="font-bold text-primary">{selectedPiece.width.toFixed(1)}</p>
            </div>
            <div className="text-center">
              <p className="text-muted-foreground">Altura</p>
              <p className="font-bold text-primary">{selectedPiece.height.toFixed(1)}</p>
            </div>
            <div className="text-center">
              <p className="text-muted-foreground">Prof.</p>
              <p className="font-bold text-primary">{selectedPiece.depth.toFixed(1)}</p>
            </div>
          </div>
          <div className="border-t border-border pt-2 space-y-1 text-[10px]">
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Material</span>
              <span className="font-medium text-foreground truncate max-w-[140px]">{selectedPiece.materialName}</span>
            </div>
            {selectedPiece.materialColor && (
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Cor</span>
                <div className="flex items-center gap-1.5">
                  <div className="h-3 w-3 rounded-full border border-border" style={{ backgroundColor: `#${selectedPiece.materialColor}` }} />
                  <span className="font-mono text-foreground">#{selectedPiece.materialColor}</span>
                </div>
              </div>
            )}
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Acabamento</span>
              <span className="font-medium text-foreground">
                {selectedPiece.materialType.replace("MeshStandard", "Standard").replace("MeshPhysical", "Físico").replace("MeshBasic", "Básico").replace("Material", "")}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Vértices</span>
              <span className="font-medium text-foreground">{selectedPiece.vertexCount.toLocaleString("pt-BR")}</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function FallbackView({ message, fileUrl }: { message: string; fileUrl: string }) {
  const ext = getFileExtension(fileUrl).toUpperCase() || "3D";
  return (
    <div className="flex flex-col items-center justify-center h-full gap-4 p-8 text-center">
      <div className="h-16 w-16 rounded-2xl bg-muted flex items-center justify-center">
        <FileBox className="h-8 w-8 text-muted-foreground" />
      </div>
      <div className="space-y-2 max-w-md">
        <Badge variant="outline" className="text-xs">.{ext}</Badge>
        <p className="text-sm text-muted-foreground">{message}</p>
      </div>
    </div>
  );
}

export function GLBViewer({ fileUrl, onObjectSelect }: GLBViewerProps) {
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isAutoRotating, setIsAutoRotating] = useState(true);
  const [backgroundPreset, setBackgroundPreset] = useState<BackgroundPreset>("dark");
  const [lightingPreset, setLightingPreset] = useState<LightingPreset>("balanced");
  const [qualityPreset, setQualityPreset] = useState<QualityPreset>("balanced");
  const containerRef = useRef<HTMLDivElement>(null);
  const controlsRef = useRef<any>(null);

  const toggleFullscreen = () => {
    if (!containerRef.current) return;
    if (!document.fullscreenElement) {
      containerRef.current.requestFullscreen();
      setIsFullscreen(true);
    } else {
      document.exitFullscreen();
      setIsFullscreen(false);
    }
  };

  const toggleAutoRotate = () => {
    if (controlsRef.current?.controls) {
      const next = !controlsRef.current.controls.autoRotate;
      controlsRef.current.controls.autoRotate = next;
      setIsAutoRotating(next);
    }
  };

  const resetCamera = () => {
    if (controlsRef.current) {
      const { controls, camera, initialPos, initialTarget } = controlsRef.current;
      camera.position.copy(initialPos);
      controls.target.copy(initialTarget);
      controls.update();
    }
  };

  return (
    <Card className="overflow-hidden">
      <CardContent className="p-0">
        <div ref={containerRef} className={`relative ${isFullscreen ? "h-screen" : "h-[500px]"}`}>
          <div className="absolute top-3 right-3 z-10 flex gap-1.5">
            <Select value={backgroundPreset} onValueChange={(value: BackgroundPreset) => setBackgroundPreset(value)}>
              <SelectTrigger className="h-8 w-[112px] bg-background/80 backdrop-blur text-xs">
                <SelectValue placeholder="Fundo" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="dark">Fundo escuro</SelectItem>
                <SelectItem value="light">Fundo claro</SelectItem>
                <SelectItem value="studio">Fundo studio</SelectItem>
                <SelectItem value="clean">Limpo (sem grade)</SelectItem>
              </SelectContent>
            </Select>
            <Select value={lightingPreset} onValueChange={(value: LightingPreset) => setLightingPreset(value)}>
              <SelectTrigger className="h-8 w-[128px] bg-background/80 backdrop-blur text-xs">
                <SelectValue placeholder="Iluminação" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="balanced">Luz balanceada</SelectItem>
                <SelectItem value="soft">Luz suave</SelectItem>
                <SelectItem value="contrast">Alto contraste</SelectItem>
              </SelectContent>
            </Select>
            <Select value={qualityPreset} onValueChange={(value: QualityPreset) => setQualityPreset(value)}>
              <SelectTrigger className="h-8 w-[120px] bg-background/80 backdrop-blur text-xs">
                <SelectValue placeholder="Qualidade" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="low">🟢 Leve</SelectItem>
                <SelectItem value="balanced">🟡 Equilibrado</SelectItem>
                <SelectItem value="high">🔴 Alta fidelidade</SelectItem>
              </SelectContent>
            </Select>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="secondary" size="icon" className="h-8 w-8 bg-background/80 backdrop-blur" onClick={toggleAutoRotate}>
                  {isAutoRotating ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}
                </Button>
              </TooltipTrigger>
              <TooltipContent side="bottom"><p>{isAutoRotating ? "Pausar rotação" : "Retomar rotação"}</p></TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="secondary" size="icon" className="h-8 w-8 bg-background/80 backdrop-blur" onClick={resetCamera}>
                  <RotateCcw className="h-3.5 w-3.5" />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="bottom"><p>Resetar câmera</p></TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="secondary" size="icon" className="h-8 w-8 bg-background/80 backdrop-blur" onClick={toggleFullscreen}>
                  {isFullscreen ? <Minimize2 className="h-3.5 w-3.5" /> : <Maximize2 className="h-3.5 w-3.5" />}
                </Button>
              </TooltipTrigger>
              <TooltipContent side="bottom"><p>{isFullscreen ? "Sair da tela cheia" : "Tela cheia"}</p></TooltipContent>
            </Tooltip>
          </div>
          <WebGLViewer
            fileUrl={fileUrl}
            onObjectSelect={onObjectSelect}
            controlsRef={controlsRef}
            backgroundPreset={backgroundPreset}
            lightingPreset={lightingPreset}
            qualityPreset={qualityPreset}
          />
        </div>
      </CardContent>
    </Card>
  );
}
