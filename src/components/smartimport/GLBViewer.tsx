import { Suspense, useRef, useState, useEffect, useMemo } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Maximize2, Minimize2, Box, AlertTriangle, FileBox } from "lucide-react";

interface GLBViewerProps {
  fileUrl: string;
  onObjectSelect?: (name: string, metadata: any) => void;
}

function getFileExtension(url: string): string {
  try {
    const path = new URL(url).pathname;
    const ext = path.split(".").pop()?.toLowerCase() || "";
    return ext;
  } catch {
    return url.split(".").pop()?.toLowerCase() || "";
  }
}

function WebGLViewer({ fileUrl, onObjectSelect }: GLBViewerProps) {
  const [error, setError] = useState<string | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    // Test WebGL support before trying to render
    const testCanvas = document.createElement("canvas");
    const gl = testCanvas.getContext("webgl2") || testCanvas.getContext("webgl");
    if (!gl) {
      setError("WebGL não é suportado neste navegador. Use Chrome, Firefox ou Edge para visualizar modelos 3D.");
      return;
    }

    // Dynamically import Three.js to avoid crashes
    let mounted = true;
    (async () => {
      try {
        const THREE = await import("three");
        const { OrbitControls } = await import("three/examples/jsm/controls/OrbitControls.js");

        if (!mounted || !canvasRef.current) return;

        const container = canvasRef.current.parentElement!;
        const width = container.clientWidth;
        const height = container.clientHeight;

        const renderer = new THREE.WebGLRenderer({
          canvas: canvasRef.current,
          antialias: true,
          alpha: true,
        });
        renderer.setSize(width, height);
        renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
        renderer.setClearColor(0xf1f5f9);

        const scene = new THREE.Scene();
        const camera = new THREE.PerspectiveCamera(50, width / height, 0.1, 1000);
        camera.position.set(5, 5, 5);

        const controls = new OrbitControls(camera, renderer.domElement);
        controls.enableDamping = true;
        controls.dampingFactor = 0.1;

        // Lights
        const ambient = new THREE.AmbientLight(0xffffff, 0.6);
        scene.add(ambient);
        const directional = new THREE.DirectionalLight(0xffffff, 1);
        directional.position.set(10, 10, 5);
        scene.add(directional);

        // Grid
        const grid = new THREE.GridHelper(20, 20, 0x374151, 0x6b7280);
        scene.add(grid);

        // Load model based on extension
        const ext = getFileExtension(fileUrl);
        try {
          let loadedObject: any = null;

          if (ext === "glb" || ext === "gltf") {
            const { GLTFLoader } = await import("three/examples/jsm/loaders/GLTFLoader.js");
            const loader = new GLTFLoader();
            const gltf = await new Promise<any>((resolve, reject) =>
              loader.load(fileUrl, resolve, undefined, reject)
            );
            loadedObject = gltf.scene;
          } else if (ext === "obj") {
            const { OBJLoader } = await import("three/examples/jsm/loaders/OBJLoader.js");
            const loader = new OBJLoader();
            const obj = await new Promise<any>((resolve, reject) =>
              loader.load(fileUrl, resolve, undefined, reject)
            );
            loadedObject = obj;
          } else if (ext === "stl") {
            const { STLLoader } = await import("three/examples/jsm/loaders/STLLoader.js");
            const loader = new STLLoader();
            const geometry = await new Promise<THREE.BufferGeometry>((resolve, reject) =>
              loader.load(fileUrl, resolve, undefined, reject)
            );
            const material = new THREE.MeshStandardMaterial({ color: 0x8899aa, metalness: 0.3, roughness: 0.6 });
            const mesh = new THREE.Mesh(geometry, material);
            loadedObject = mesh;
          } else if (ext === "fbx") {
            const { FBXLoader } = await import("three/examples/jsm/loaders/FBXLoader.js");
            const loader = new FBXLoader();
            const fbx = await new Promise<THREE.Object3D>((resolve, reject) =>
              loader.load(fileUrl, resolve, undefined, reject)
            );
            loadedObject = fbx;
          } else if (ext === "dxf") {
            // DXF doesn't have a standard Three.js loader — show info
            setError(`Arquivo .DXF importado com sucesso. A visualização 3D de DXF requer conversão para GLB/OBJ. Use o arquivo para geração de orçamento.`);
            renderer.dispose();
            return;
          } else {
            setError(`Formato .${ext.toUpperCase()} não tem visualizador 3D disponível. O arquivo foi importado para geração de orçamento.`);
            renderer.dispose();
            return;
          }

          if (loadedObject) {
            scene.add(loadedObject);

            // Auto-center and scale
            const box = new THREE.Box3().setFromObject(loadedObject);
            const center = box.getCenter(new THREE.Vector3());
            const size = box.getSize(new THREE.Vector3());
            const maxDim = Math.max(size.x, size.y, size.z);
            const scale = 5 / maxDim;
            loadedObject.scale.setScalar(scale);
            loadedObject.position.sub(center.multiplyScalar(scale));

            // Click handler
            const raycaster = new THREE.Raycaster();
            const mouse = new THREE.Vector2();

            renderer.domElement.addEventListener("click", (event) => {
              const rect = renderer.domElement.getBoundingClientRect();
              mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
              mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
              raycaster.setFromCamera(mouse, camera);
              const intersects = raycaster.intersectObjects(scene.children, true);
              if (intersects.length > 0 && onObjectSelect) {
                const obj = intersects[0].object;
                onObjectSelect(obj.name || "Objeto sem nome", {
                  type: obj.type,
                  geometry: (obj as any).geometry ? {
                    vertices: (obj as any).geometry.attributes?.position?.count || 0,
                  } : null,
                  material: (obj as any).material ? {
                    name: (obj as any).material.name,
                    color: (obj as any).material.color?.getHexString?.() || null,
                  } : null,
                  position: {
                    x: Math.round(obj.position.x * 100) / 100,
                    y: Math.round(obj.position.y * 100) / 100,
                    z: Math.round(obj.position.z * 100) / 100,
                  },
                });
              }
            });
          }
        } catch (loadErr: any) {
          console.error("Model load error:", loadErr);
          if (mounted) setError(`Erro ao carregar o modelo: ${loadErr.message || "formato inválido"}`);
          renderer.dispose();
          return;
        }

        // Animation loop
        const animate = () => {
          if (!mounted) return;
          requestAnimationFrame(animate);
          controls.update();
          renderer.render(scene, camera);
        };
        animate();

        // Resize
        const onResize = () => {
          if (!canvasRef.current) return;
          const c = canvasRef.current.parentElement!;
          const w = c.clientWidth;
          const h = c.clientHeight;
          camera.aspect = w / h;
          camera.updateProjectionMatrix();
          renderer.setSize(w, h);
        };
        window.addEventListener("resize", onResize);

        return () => {
          mounted = false;
          window.removeEventListener("resize", onResize);
          renderer.dispose();
          controls.dispose();
        };
      } catch (err: any) {
        console.error("WebGL init error:", err);
        if (mounted) setError("Erro ao inicializar o visualizador 3D. Verifique se seu navegador suporta WebGL.");
      }
    })();

    return () => { mounted = false; };
  }, [fileUrl, onObjectSelect]);

  if (error) {
    return <FallbackView message={error} fileUrl={fileUrl} />;
  }

  return (
    <div className="relative w-full h-full">
      <canvas ref={canvasRef} className="w-full h-full" />
      <div className="absolute bottom-3 left-3 z-10">
        <Badge variant="secondary" className="text-[10px] bg-background/80 backdrop-blur">
          Clique em um objeto para selecionar
        </Badge>
      </div>
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
  const containerRef = useRef<HTMLDivElement>(null);

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

  return (
    <Card className="overflow-hidden">
      <CardContent className="p-0">
        <div ref={containerRef} className={`relative ${isFullscreen ? "h-screen" : "h-[500px]"}`}>
          <div className="absolute top-3 right-3 z-10 flex gap-1.5">
            <Button variant="secondary" size="icon" className="h-8 w-8 bg-background/80 backdrop-blur"
              onClick={toggleFullscreen}>
              {isFullscreen ? <Minimize2 className="h-3.5 w-3.5" /> : <Maximize2 className="h-3.5 w-3.5" />}
            </Button>
          </div>

          <WebGLViewer fileUrl={fileUrl} onObjectSelect={onObjectSelect} />
        </div>
      </CardContent>
    </Card>
  );
}
