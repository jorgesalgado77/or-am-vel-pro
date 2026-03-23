import { useRef, useState, useEffect, useCallback } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Maximize2, Minimize2, FileBox, Loader2, Pause, Play, RotateCcw } from "lucide-react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { loadModelForPreview } from "./modelPreviewUtils";

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

const BACKGROUND_PRESETS: Record<BackgroundPreset, { background: number; ground: number; showGrid: boolean }> = {
  dark: { background: 0x1e293b, ground: 0x111827, showGrid: true },
  light: { background: 0xf8fafc, ground: 0xe2e8f0, showGrid: true },
  studio: { background: 0x202938, ground: 0x334155, showGrid: true },
  clean: { background: 0xffffff, ground: 0xffffff, showGrid: false },
};

const LIGHTING_PRESETS: Record<LightingPreset, { ambient: number; key: number; fill: number; rim: number; hemi: number }> = {
  balanced: { ambient: 0.8, key: 1, fill: 0.6, rim: 0.3, hemi: 0.4 },
  soft: { ambient: 1.05, key: 0.85, fill: 0.75, rim: 0.18, hemi: 0.55 },
  contrast: { ambient: 0.55, key: 1.3, fill: 0.38, rim: 0.55, hemi: 0.28 },
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

// AutoCAD Color Index (ACI) - faithful color mapping
const ACI_COLORS: Record<number, number> = {
  0: 0x000000, 1: 0xFF0000, 2: 0xFFFF00, 3: 0x00FF00, 4: 0x00FFFF,
  5: 0x0000FF, 6: 0xFF00FF, 7: 0xBBBBBB, 8: 0x808080, 9: 0xC0C0C0,
  10: 0xFF0000, 11: 0xFF7F7F, 12: 0xCC0000, 14: 0x990000,
  20: 0xFF3F00, 30: 0xFF7F00, 40: 0xFFBF00, 50: 0xFFFF00,
  60: 0xBFFF00, 70: 0x7FFF00, 80: 0x3FFF00, 90: 0x00FF00,
  100: 0x00FF3F, 110: 0x00FF7F, 120: 0x00FFBF, 130: 0x00FFFF,
  140: 0x00BFFF, 150: 0x007FFF, 160: 0x003FFF, 170: 0x0000FF,
  180: 0x3F00FF, 190: 0x7F00FF, 200: 0xBF00FF, 210: 0xFF00FF,
  220: 0xFF00BF, 230: 0xFF007F, 240: 0xFF003F,
  250: 0x333333, 251: 0x505050, 252: 0x696969,
  253: 0x808080, 254: 0xBEBEBE, 255: 0xFFFFFF,
};

function aciToHex(colorIndex: number): number {
  // Color 7 = default in DXF → use neutral silver/gray (visible on dark bg)
  if (colorIndex === 7) return 0xB0BEC5;
  if (colorIndex === 0) return 0x90A4AE;
  if (ACI_COLORS[colorIndex] !== undefined) return ACI_COLORS[colorIndex];
  // Closest mapped color
  const keys = Object.keys(ACI_COLORS).map(Number).sort((a, b) => a - b);
  for (let k = 0; k < keys.length - 1; k++) {
    if (colorIndex >= keys[k] && colorIndex <= keys[k + 1]) return ACI_COLORS[keys[k]];
  }
  return 0xB0BEC5;
}

interface DxfEntity {
  type: string;
  color: number;
  vertices: Array<{ x: number; y: number; z: number }>;
  isClosed?: boolean;
}

/** Enhanced DXF parser: extracts multiple entity types with colors */
function parseDxfEntities(dxfText: string): DxfEntity[] {
  const lines = dxfText.split(/\r?\n/).map(l => l.trim());
  const entities: DxfEntity[] = [];
  let i = 0;
  let inEntities = false;

  // Find ENTITIES section
  while (i < lines.length) {
    if (lines[i] === "ENTITIES") { inEntities = true; i++; break; }
    i++;
  }
  if (!inEntities) return entities;

  let currentEntity: DxfEntity | null = null;
  let currentCode = -1;

  while (i < lines.length - 1) {
    if (lines[i] === "ENDSEC") break;

    const code = parseInt(lines[i]);
    const value = lines[i + 1];

    if (isNaN(code) || value === undefined) { i++; continue; }

    // Entity start
    if (code === 0) {
      if (currentEntity && currentEntity.vertices.length > 0) {
        entities.push(currentEntity);
      }
      const entityType = value.toUpperCase();
      if (["LINE", "POLYLINE", "LWPOLYLINE", "3DFACE", "SOLID", "CIRCLE", "ARC", "POINT", "SPLINE", "INSERT", "VERTEX"].includes(entityType)) {
        currentEntity = { type: entityType, color: 7, vertices: [], isClosed: false };
      } else if (entityType === "VERTEX" && currentEntity?.type === "POLYLINE") {
        // Vertices belong to the current polyline, don't create new entity
        i += 2; continue;
      } else if (entityType === "SEQEND" && currentEntity) {
        entities.push(currentEntity);
        currentEntity = null;
        i += 2; continue;
      } else {
        currentEntity = null;
      }
      i += 2; continue;
    }

    if (!currentEntity) { i += 2; continue; }

    // Color
    if (code === 62) {
      currentEntity.color = parseInt(value) || 7;
    }
    // Closed flag for LWPOLYLINE
    if (code === 70 && (currentEntity.type === "LWPOLYLINE" || currentEntity.type === "POLYLINE")) {
      currentEntity.isClosed = (parseInt(value) & 1) === 1;
    }

    // Vertex coordinates
    if (code === 10) {
      const x = parseFloat(value);
      // Look ahead for Y and Z
      let y = 0, z = 0;
      let j = i + 2;
      if (j < lines.length - 1 && parseInt(lines[j]) === 20) { y = parseFloat(lines[j + 1]); j += 2; }
      if (j < lines.length - 1 && parseInt(lines[j]) === 30) { z = parseFloat(lines[j + 1]); }
      currentEntity.vertices.push({ x, y, z });
    }
    if (code === 11) {
      const x = parseFloat(value);
      let y = 0, z = 0;
      let j = i + 2;
      if (j < lines.length - 1 && parseInt(lines[j]) === 21) { y = parseFloat(lines[j + 1]); j += 2; }
      if (j < lines.length - 1 && parseInt(lines[j]) === 31) { z = parseFloat(lines[j + 1]); }
      currentEntity.vertices.push({ x, y, z });
    }
    if (code === 12) {
      const x = parseFloat(value);
      let y = 0, z = 0;
      let j = i + 2;
      if (j < lines.length - 1 && parseInt(lines[j]) === 22) { y = parseFloat(lines[j + 1]); j += 2; }
      if (j < lines.length - 1 && parseInt(lines[j]) === 32) { z = parseFloat(lines[j + 1]); }
      currentEntity.vertices.push({ x, y, z });
    }
    if (code === 13) {
      const x = parseFloat(value);
      let y = 0, z = 0;
      let j = i + 2;
      if (j < lines.length - 1 && parseInt(lines[j]) === 23) { y = parseFloat(lines[j + 1]); j += 2; }
      if (j < lines.length - 1 && parseInt(lines[j]) === 33) { z = parseFloat(lines[j + 1]); }
      currentEntity.vertices.push({ x, y, z });
    }

    i += 2;
  }

  // Push last entity
  if (currentEntity && currentEntity.vertices.length > 0) {
    entities.push(currentEntity);
  }

  return entities;
}

// Distinct material palette for individual DXF pieces
const PIECE_PALETTE = [
  0x5C6BC0, 0x26A69A, 0xEF5350, 0xAB47BC, 0x42A5F5,
  0x66BB6A, 0xFFA726, 0x8D6E63, 0xEC407A, 0x78909C,
  0x7E57C2, 0x29B6F6, 0xD4E157, 0x26C6DA, 0xFF7043,
];

function buildDxfScene(THREE: any, entities: DxfEntity[]): any {
  const group = new THREE.Group();
  group.name = "DXF_Root";

  let pieceIdx = 0;
  const toV3 = (p: { x: number; y: number; z: number }) =>
    new THREE.Vector3(p.x, p.z || 0, -(p.y || 0));

  for (const entity of entities) {
    const entityColor = entity.color !== 7 && entity.color !== 0
      ? aciToHex(entity.color)
      : PIECE_PALETTE[pieceIdx % PIECE_PALETTE.length];
    pieceIdx++;

    switch (entity.type) {
      case "3DFACE":
      case "SOLID": {
        if (entity.vertices.length >= 3) {
          const verts = entity.vertices.map(toV3);
          const positions: number[] = [];
          positions.push(verts[0].x, verts[0].y, verts[0].z, verts[1].x, verts[1].y, verts[1].z, verts[2].x, verts[2].y, verts[2].z);
          if (verts.length >= 4) {
            positions.push(verts[0].x, verts[0].y, verts[0].z, verts[2].x, verts[2].y, verts[2].z, verts[3].x, verts[3].y, verts[3].z);
          }
          const geo = new THREE.BufferGeometry();
          geo.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
          geo.computeVertexNormals();
          const mat = new THREE.MeshStandardMaterial({
            color: entityColor, side: THREE.DoubleSide, metalness: 0.15, roughness: 0.6,
          });
          const mesh = new THREE.Mesh(geo, mat);
          mesh.name = `${entity.type}_${pieceIdx}`;
          group.add(mesh);
        }
        break;
      }
      case "LINE": {
        if (entity.vertices.length >= 2) {
          const geo = new THREE.BufferGeometry().setFromPoints([
            toV3(entity.vertices[0]), toV3(entity.vertices[1]),
          ]);
          const mat = new THREE.LineBasicMaterial({ color: entityColor });
          const line = new THREE.Line(geo, mat);
          line.name = `Line_${pieceIdx}`;
          group.add(line);
        }
        break;
      }
      case "LWPOLYLINE":
      case "POLYLINE": {
        if (entity.vertices.length >= 2) {
          const subGroup = new THREE.Group();
          subGroup.name = `${entity.type}_${pieceIdx}`;

          // Filled face if closed
          if (entity.isClosed && entity.vertices.length >= 3) {
            const verts = entity.vertices.map(toV3);
            const positions: number[] = [];
            for (let t = 1; t < verts.length - 1; t++) {
              positions.push(verts[0].x, verts[0].y, verts[0].z);
              positions.push(verts[t].x, verts[t].y, verts[t].z);
              positions.push(verts[t + 1].x, verts[t + 1].y, verts[t + 1].z);
            }
            const geo = new THREE.BufferGeometry();
            geo.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
            geo.computeVertexNormals();
            const mat = new THREE.MeshStandardMaterial({
              color: entityColor, side: THREE.DoubleSide, metalness: 0.15, roughness: 0.6,
              transparent: true, opacity: 0.85,
            });
            const mesh = new THREE.Mesh(geo, mat);
            mesh.name = `${entity.type}_Face_${pieceIdx}`;
            subGroup.add(mesh);
          }

          // Outline lines
          const linePoints = entity.vertices.map(toV3);
          if (entity.isClosed) linePoints.push(toV3(entity.vertices[0]));
          const geo = new THREE.BufferGeometry().setFromPoints(linePoints);
          const mat = new THREE.LineBasicMaterial({ color: entityColor });
          const line = new THREE.Line(geo, mat);
          line.name = `${entity.type}_Edge_${pieceIdx}`;
          subGroup.add(line);

          group.add(subGroup);
        }
        break;
      }
      case "CIRCLE": {
        if (entity.vertices.length >= 1) {
          const c = toV3(entity.vertices[0]);
          const r = (entity as any).radius || 0.5;
          const pts: any[] = [];
          const segs = 32;
          for (let s = 0; s <= segs; s++) {
            const a = (s / segs) * Math.PI * 2;
            pts.push(new THREE.Vector3(c.x + Math.cos(a) * r, c.y, c.z + Math.sin(a) * r));
          }
          const geo = new THREE.BufferGeometry().setFromPoints(pts);
          const mat = new THREE.LineBasicMaterial({ color: entityColor });
          const line = new THREE.Line(geo, mat);
          line.name = `Circle_${pieceIdx}`;
          group.add(line);
        }
        break;
      }
      default: {
        if (entity.vertices.length >= 2) {
          const pts = entity.vertices.map(toV3);
          const geo = new THREE.BufferGeometry().setFromPoints(pts);
          const mat = new THREE.LineBasicMaterial({ color: entityColor });
          const line = new THREE.Line(geo, mat);
          line.name = `Entity_${pieceIdx}`;
          group.add(line);
        }
        break;
      }
    }
  }

  if (group.children.length === 0) {
    const geo = new THREE.BoxGeometry(2, 2, 0.1);
    const mat = new THREE.MeshStandardMaterial({ color: 0x4499bb, wireframe: true });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.name = "DXF_Placeholder";
    group.add(mesh);
  }

  return group;
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

function WebGLViewer({ fileUrl, onObjectSelect, controlsRef, backgroundPreset, lightingPreset }: GLBViewerProps & { controlsRef?: React.MutableRefObject<any>; backgroundPreset: BackgroundPreset; lightingPreset: LightingPreset }) {
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [progress, setProgress] = useState(0);
  const [progressLabel, setProgressLabel] = useState("Inicializando...");
  const [selectedPiece, setSelectedPiece] = useState<SelectedPieceInfo | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const cameraInitial = useRef<{ pos: any; target: any } | null>(null);
  const threeRef = useRef<any>(null);
  const onObjectSelectRef = useRef(onObjectSelect);

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
        setProgress(10);
        setProgressLabel("Carregando motor 3D...");
        const THREE = await import("three");
        const { OrbitControls } = await import("three/examples/jsm/controls/OrbitControls.js");

        if (!mounted || !canvasRef.current) return;

        setProgress(25);
        setProgressLabel("Configurando cena...");

        const container = canvasRef.current.parentElement!;
        const width = container.clientWidth;
        const height = container.clientHeight;

        renderer = new THREE.WebGLRenderer({
          canvas: canvasRef.current,
          antialias: true,
          alpha: true,
          powerPreference: "high-performance",
        });
        canvasElement = canvasRef.current;
        renderer.setSize(width, height);
        renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
        renderer.toneMapping = THREE.NoToneMapping;
        renderer.outputColorSpace = THREE.SRGBColorSpace;

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

        cameraInitial.current = {
          pos: camera.position.clone(),
          target: controls.target.clone(),
        };

        if (controlsRef) {
          controlsRef.current = { controls, camera, initialPos: camera.position.clone(), initialTarget: controls.target.clone() };
        }

        const ambient = new THREE.AmbientLight(0xffffff, 0.8);
        scene.add(ambient);
        const dir1 = new THREE.DirectionalLight(0xffffff, 1.0);
        dir1.position.set(10, 15, 5);
        scene.add(dir1);
        const dir2 = new THREE.DirectionalLight(0xffffff, 0.6);
        dir2.position.set(-8, 10, -8);
        scene.add(dir2);
        const dir3 = new THREE.DirectionalLight(0xffffff, 0.3);
        dir3.position.set(0, -5, 10);
        scene.add(dir3);
        const hemi = new THREE.HemisphereLight(0xffffff, 0x444444, 0.4);
        scene.add(hemi);
        applyLightingPreset({ ambient, dir1, dir2, dir3, hemi }, lightingPreset);

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
        setProgressLabel("Carregando arquivo...");

        const onProgress = (event: any) => {
          if (event.lengthComputable) {
            const pct = 40 + (event.loaded / event.total) * 40;
            if (mounted) setProgress(Math.min(pct, 80));
          }
        };

        setProgressLabel("Processando modelo...");
        const loadedObject = await loadModelForPreview(THREE, fileUrl, onProgress);

        if (!mounted) return;

        setProgress(85);
        setProgressLabel("Finalizando...");

        scene.add(loadedObject);

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
            return;
          }

          selectedObj = hit;
          const origMat = hit.userData?.originalMaterial || hit.material;

          if (hit.isMesh && origMat?.clone) {
            const hl = origMat.clone();
            if (hl.color) hl.color = origMat.color.clone().lerp(new THREE.Color(0xffffff), 0.12);
            if ("emissive" in hl) { hl.emissive = new THREE.Color(0x38bdf8); hl.emissiveIntensity = 0.18; }
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

        const animate = () => {
          if (!mounted) return;
          animationFrameId = requestAnimationFrame(animate);
          controls.update();
          renderer.render(scene, camera);
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
      controls?.dispose?.();
      renderer?.dispose?.();
      threeRef.current = null;
    };
  }, [fileUrl]);

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
  }, [backgroundPreset, lightingPreset]);

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

          {/* Dimensions */}
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

          {/* Material & Finish */}
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
            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="secondary" size="icon" className="h-8 w-8 bg-background/80 backdrop-blur"
                  onClick={toggleAutoRotate}>
                  {isAutoRotating ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}
                </Button>
              </TooltipTrigger>
              <TooltipContent side="bottom">
                <p>{isAutoRotating ? "Pausar rotação" : "Retomar rotação"}</p>
              </TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="secondary" size="icon" className="h-8 w-8 bg-background/80 backdrop-blur"
                  onClick={resetCamera}>
                  <RotateCcw className="h-3.5 w-3.5" />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="bottom">
                <p>Resetar câmera</p>
              </TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="secondary" size="icon" className="h-8 w-8 bg-background/80 backdrop-blur"
                  onClick={toggleFullscreen}>
                  {isFullscreen ? <Minimize2 className="h-3.5 w-3.5" /> : <Maximize2 className="h-3.5 w-3.5" />}
                </Button>
              </TooltipTrigger>
              <TooltipContent side="bottom">
                <p>{isFullscreen ? "Sair da tela cheia" : "Tela cheia"}</p>
              </TooltipContent>
            </Tooltip>
          </div>
          <WebGLViewer
            fileUrl={fileUrl}
            onObjectSelect={onObjectSelect}
            controlsRef={controlsRef}
            backgroundPreset={backgroundPreset}
            lightingPreset={lightingPreset}
          />
        </div>
      </CardContent>
    </Card>
  );
}
