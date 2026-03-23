import { useEffect, useRef, useState, memo } from "react";
import { Box, Loader2 } from "lucide-react";

interface ProjectThumbnailProps {
  fileUrl: string;
}

function getFileExtension(url: string): string {
  try {
    const path = new URL(url).pathname;
    return path.split(".").pop()?.toLowerCase() || "";
  } catch {
    return url.split(".").pop()?.toLowerCase() || "";
  }
}

export const ProjectThumbnail = memo(function ProjectThumbnail({ fileUrl }: ProjectThumbnailProps) {
  const [thumbSrc, setThumbSrc] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const attempted = useRef(false);

  useEffect(() => {
    if (attempted.current) return;
    attempted.current = true;

    let cancelled = false;

    (async () => {
      try {
        const THREE = await import("three");

        const width = 320;
        const height = 200;

        const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
        renderer.setSize(width, height);
        renderer.setPixelRatio(1);
        renderer.setClearColor(0xf1f5f9);
        renderer.outputColorSpace = THREE.SRGBColorSpace;

        const scene = new THREE.Scene();
        const camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 500);
        camera.position.set(6, 5, 6);
        camera.lookAt(0, 0, 0);

        // Lights
        scene.add(new THREE.AmbientLight(0xffffff, 0.8));
        const dir = new THREE.DirectionalLight(0xffffff, 1.0);
        dir.position.set(8, 12, 6);
        scene.add(dir);
        scene.add(new THREE.HemisphereLight(0xffffff, 0x444444, 0.4));

        const ext = getFileExtension(fileUrl);
        let loadedObject: any = null;

        if (ext === "glb" || ext === "gltf") {
          const { GLTFLoader } = await import("three/examples/jsm/loaders/GLTFLoader.js");
          const gltf = await new Promise<any>((resolve, reject) =>
            new GLTFLoader().load(fileUrl, resolve, undefined, reject)
          );
          loadedObject = gltf.scene;
        } else if (ext === "obj") {
          const { OBJLoader } = await import("three/examples/jsm/loaders/OBJLoader.js");
          loadedObject = await new Promise<any>((resolve, reject) =>
            new OBJLoader().load(fileUrl, resolve, undefined, reject)
          );
        } else if (ext === "stl") {
          const { STLLoader } = await import("three/examples/jsm/loaders/STLLoader.js");
          const geo = await new Promise<any>((resolve, reject) =>
            new STLLoader().load(fileUrl, resolve, undefined, reject)
          );
          loadedObject = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color: 0xaabbcc, metalness: 0.3, roughness: 0.5 }));
        } else if (ext === "fbx") {
          const { FBXLoader } = await import("three/examples/jsm/loaders/FBXLoader.js");
          loadedObject = await new Promise<any>((resolve, reject) =>
            new FBXLoader().load(fileUrl, resolve, undefined, reject)
          );
        } else if (ext === "dxf") {
          const resp = await fetch(fileUrl);
          const text = await resp.text();
          // Simple line extraction for thumbnail
          const group = new THREE.Group();
          const lines = text.split(/\r?\n/).map(l => l.trim());
          let i = 0, inEntities = false;
          const pts: THREE.Vector3[] = [];
          while (i < lines.length) {
            if (lines[i] === "ENTITIES") { inEntities = true; i++; continue; }
            if (lines[i] === "ENDSEC" && inEntities) break;
            if (!inEntities) { i++; continue; }
            const code = parseInt(lines[i]);
            if (code === 10 && lines[i + 1]) {
              const x = parseFloat(lines[i + 1]);
              let y = 0, z = 0;
              if (parseInt(lines[i + 2]) === 20) y = parseFloat(lines[i + 3]);
              if (parseInt(lines[i + 4]) === 30) z = parseFloat(lines[i + 5]);
              pts.push(new THREE.Vector3(x, z, -y));
            }
            i++;
          }
          if (pts.length >= 2) {
            const geo = new THREE.BufferGeometry().setFromPoints(pts);
            const mat = new THREE.LineBasicMaterial({ color: 0x4FC3F7 });
            group.add(new THREE.LineSegments(geo, mat));
          }
          loadedObject = group;
        }

        if (cancelled) { renderer.dispose(); return; }

        if (!loadedObject) {
          // Fallback cube
          loadedObject = new THREE.Mesh(
            new THREE.BoxGeometry(2, 2, 2),
            new THREE.MeshStandardMaterial({ color: 0x90A4AE, wireframe: true })
          );
        }

        scene.add(loadedObject);

        // Auto-center and scale
        const box = new THREE.Box3().setFromObject(loadedObject);
        const center = box.getCenter(new THREE.Vector3());
        const size = box.getSize(new THREE.Vector3());
        const maxDim = Math.max(size.x, size.y, size.z);
        if (maxDim > 0) {
          const scale = 4 / maxDim;
          loadedObject.scale.setScalar(scale);
          loadedObject.position.sub(center.multiplyScalar(scale));
        }

        // Render and capture
        renderer.render(scene, camera);
        const dataUrl = renderer.domElement.toDataURL("image/png");

        if (!cancelled) {
          setThumbSrc(dataUrl);
          setLoading(false);
        }

        renderer.dispose();
      } catch (err) {
        console.error("Thumbnail generation failed:", err);
        if (!cancelled) setLoading(false);
      }
    })();

    return () => { cancelled = true; };
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
