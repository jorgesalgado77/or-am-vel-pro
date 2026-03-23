import { Suspense, useRef, useState } from "react";
import { Canvas } from "@react-three/fiber";
import { OrbitControls, useGLTF, Environment, Grid, Html } from "@react-three/drei";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Maximize2, Minimize2, RotateCcw, ZoomIn, ZoomOut } from "lucide-react";

interface GLBViewerProps {
  fileUrl: string;
  onObjectSelect?: (name: string, metadata: any) => void;
}

function Model({ url, onObjectSelect }: { url: string; onObjectSelect?: (name: string, metadata: any) => void }) {
  const { scene } = useGLTF(url);
  const [hoveredMesh, setHoveredMesh] = useState<string | null>(null);

  return (
    <primitive
      object={scene}
      onPointerOver={(e: any) => {
        e.stopPropagation();
        const name = e.object?.name || "Objeto";
        setHoveredMesh(name);
        document.body.style.cursor = "pointer";
      }}
      onPointerOut={() => {
        setHoveredMesh(null);
        document.body.style.cursor = "default";
      }}
      onClick={(e: any) => {
        e.stopPropagation();
        const obj = e.object;
        if (onObjectSelect && obj) {
          onObjectSelect(obj.name || "Objeto sem nome", {
            type: obj.type,
            geometry: obj.geometry ? {
              vertices: obj.geometry.attributes?.position?.count || 0,
            } : null,
            material: obj.material ? {
              name: obj.material.name,
              color: obj.material.color?.getHexString?.() || null,
            } : null,
            position: obj.position ? {
              x: Math.round(obj.position.x * 100) / 100,
              y: Math.round(obj.position.y * 100) / 100,
              z: Math.round(obj.position.z * 100) / 100,
            } : null,
            scale: obj.scale ? {
              x: Math.round(obj.scale.x * 100) / 100,
              y: Math.round(obj.scale.y * 100) / 100,
              z: Math.round(obj.scale.z * 100) / 100,
            } : null,
          });
        }
      }}
    />
  );
}

function LoadingFallback() {
  return (
    <Html center>
      <div className="flex flex-col items-center gap-2">
        <div className="h-8 w-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
        <p className="text-sm text-muted-foreground">Carregando modelo 3D...</p>
      </div>
    </Html>
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
          {/* Controls overlay */}
          <div className="absolute top-3 right-3 z-10 flex gap-1.5">
            <Badge variant="secondary" className="text-[10px] bg-background/80 backdrop-blur">
              Clique em um objeto para selecionar
            </Badge>
            <Button variant="secondary" size="icon" className="h-8 w-8 bg-background/80 backdrop-blur"
              onClick={toggleFullscreen}>
              {isFullscreen ? <Minimize2 className="h-3.5 w-3.5" /> : <Maximize2 className="h-3.5 w-3.5" />}
            </Button>
          </div>

          <Canvas
            camera={{ position: [5, 5, 5], fov: 50 }}
            style={{ background: "hsl(var(--muted))" }}
          >
            <ambientLight intensity={0.6} />
            <directionalLight position={[10, 10, 5]} intensity={1} castShadow />
            <pointLight position={[-10, -10, -5]} intensity={0.3} />

            <Suspense fallback={<LoadingFallback />}>
              <Model url={fileUrl} onObjectSelect={onObjectSelect} />
              <Environment preset="apartment" />
            </Suspense>

            <Grid
              args={[20, 20]}
              cellSize={0.5}
              cellThickness={0.5}
              cellColor="#6b7280"
              sectionSize={2}
              sectionThickness={1}
              sectionColor="#374151"
              fadeDistance={25}
              infiniteGrid
            />

            <OrbitControls
              makeDefault
              enableDamping
              dampingFactor={0.1}
              minDistance={1}
              maxDistance={50}
            />
          </Canvas>
        </div>
      </CardContent>
    </Card>
  );
}
