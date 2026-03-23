import { useEffect, useState, memo } from "react";
import { Box, Loader2 } from "lucide-react";
import { frameObjectForThumbnail, loadModelForPreview } from "./modelPreviewUtils";

interface ProjectThumbnailProps {
  fileUrl: string;
}

export const ProjectThumbnail = memo(function ProjectThumbnail({ fileUrl }: ProjectThumbnailProps) {
  const [thumbSrc, setThumbSrc] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    let renderer: any = null;
    let environment: any = null;
    let pmremGenerator: any = null;

    (async () => {
      try {
        setLoading(true);
        setThumbSrc(null);

        const THREE = await import("three");
        const { RoomEnvironment } = await import("three/examples/jsm/environments/RoomEnvironment.js");

        const width = 320;
        const height = 200;

        renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
        renderer.setSize(width, height);
        renderer.setPixelRatio(1);
        renderer.setClearColor(0xf1f5f9);
        renderer.toneMapping = THREE.NoToneMapping;
        renderer.outputColorSpace = THREE.SRGBColorSpace;
        pmremGenerator = new THREE.PMREMGenerator(renderer);
        environment = pmremGenerator.fromScene(new RoomEnvironment(), 0.04);

        const scene = new THREE.Scene();
        scene.environment = environment.texture;
        const camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 500);
        camera.position.set(6, 5, 6);

        scene.add(new THREE.AmbientLight(0xffffff, 1.1));
        const keyLight = new THREE.DirectionalLight(0xffffff, 1.2);
        keyLight.position.set(10, 14, 8);
        scene.add(keyLight);
        const fillLight = new THREE.DirectionalLight(0xffffff, 0.6);
        fillLight.position.set(-8, 10, -6);
        scene.add(fillLight);
        scene.add(new THREE.HemisphereLight(0xffffff, 0x94a3b8, 0.55));

        const loadedObject = await loadModelForPreview(THREE, fileUrl);

        if (cancelled) {
          renderer.dispose();
          environment?.dispose?.();
          pmremGenerator?.dispose?.();
          return;
        }

        scene.add(loadedObject);
        frameObjectForThumbnail(THREE, loadedObject, camera);

        renderer.render(scene, camera);
        const dataUrl = renderer.domElement.toDataURL("image/png");

        if (!cancelled) {
          setThumbSrc(dataUrl);
          setLoading(false);
        }

        renderer.dispose();
        environment?.dispose?.();
        pmremGenerator?.dispose?.();
      } catch (err) {
        console.error("Thumbnail generation failed:", err);
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
      renderer?.dispose?.();
      environment?.dispose?.();
      pmremGenerator?.dispose?.();
    };
  }, [fileUrl]);

  return (
    <div className="h-32 bg-muted rounded-lg flex items-center justify-center overflow-hidden">
      {loading ? (
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      ) : thumbSrc ? (
        <img src={thumbSrc} alt="Preview 3D" className="w-full h-full object-contain" />
      ) : (
        <Box className="h-10 w-10 text-muted-foreground" />
      )}
    </div>
  );
});
