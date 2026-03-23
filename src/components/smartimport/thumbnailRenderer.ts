import { supabase } from "@/lib/supabaseClient";
import { frameObjectForThumbnail, loadModelForPreview } from "./modelPreviewUtils";

const THUMBNAIL_WIDTH = 320;
const THUMBNAIL_HEIGHT = 200;
const THUMBNAIL_BACKGROUND = 0xf1f5f9;
const THUMBNAIL_BUCKET = "smart-import-3d";

function disposeSceneResources(root: any) {
  root?.traverse?.((child: any) => {
    child.geometry?.dispose?.();

    const materials = Array.isArray(child.material) ? child.material : [child.material];
    materials.filter(Boolean).forEach((material) => {
      Object.values(material).forEach((value: any) => {
        if (value?.isTexture) value.dispose?.();
      });
      material.dispose?.();
    });
  });
}

function dataUrlToBlob(dataUrl: string) {
  const [meta, base64] = dataUrl.split(",");
  const mime = meta.match(/data:(.*?);base64/)?.[1] || "image/png";
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);

  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }

  return new Blob([bytes], { type: mime });
}

export function getSmartImportContentType(file: File) {
  const extension = file.name.split(".").pop()?.toLowerCase();
  const byExtension: Record<string, string> = {
    glb: "model/gltf-binary",
    gltf: "model/gltf+json",
    obj: "text/plain",
    fbx: "application/octet-stream",
    stl: "model/stl",
    dxf: "application/dxf",
  };

  return file.type || byExtension[extension || ""] || "application/octet-stream";
}

export async function renderThumbnailDataUrl(fileUrl: string) {
  const THREE = await import("three");
  const { RoomEnvironment } = await import("three/examples/jsm/environments/RoomEnvironment.js");

  let renderer: any;
  let environment: any;
  let pmremGenerator: any;
  let loadedObject: any;

  try {
    renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: true,
      preserveDrawingBuffer: true,
    });
    renderer.setSize(THUMBNAIL_WIDTH, THUMBNAIL_HEIGHT);
    renderer.setPixelRatio(1);
    renderer.setClearColor(THUMBNAIL_BACKGROUND);
    renderer.toneMapping = THREE.NoToneMapping;
    renderer.outputColorSpace = THREE.SRGBColorSpace;

    pmremGenerator = new THREE.PMREMGenerator(renderer);
    environment = pmremGenerator.fromScene(new RoomEnvironment(), 0.04);

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(THUMBNAIL_BACKGROUND);
    scene.environment = environment.texture;

    const camera = new THREE.PerspectiveCamera(45, THUMBNAIL_WIDTH / THUMBNAIL_HEIGHT, 0.1, 500);

    scene.add(new THREE.AmbientLight(0xffffff, 1.15));
    const keyLight = new THREE.DirectionalLight(0xffffff, 1.25);
    keyLight.position.set(10, 14, 8);
    scene.add(keyLight);
    const fillLight = new THREE.DirectionalLight(0xffffff, 0.65);
    fillLight.position.set(-8, 10, -6);
    scene.add(fillLight);
    scene.add(new THREE.HemisphereLight(0xffffff, 0x94a3b8, 0.55));

    loadedObject = await loadModelForPreview(THREE, fileUrl);
    scene.add(loadedObject);
    frameObjectForThumbnail(THREE, loadedObject, camera);

    renderer.render(scene, camera);
    return renderer.domElement.toDataURL("image/png");
  } finally {
    disposeSceneResources(loadedObject);
    renderer?.dispose?.();
    environment?.dispose?.();
    pmremGenerator?.dispose?.();
  }
}

export async function persistProjectThumbnail(projectId: string, fileUrl: string) {
  const dataUrl = await renderThumbnailDataUrl(fileUrl);
  const filePath = `thumbnails/${projectId}.png`;

  const { error: uploadError } = await supabase.storage
    .from(THUMBNAIL_BUCKET)
    .upload(filePath, dataUrlToBlob(dataUrl), {
      contentType: "image/png",
      upsert: true,
    });

  if (uploadError) {
    throw uploadError;
  }

  const { data } = supabase.storage.from(THUMBNAIL_BUCKET).getPublicUrl(filePath);
  const publicUrl = `${data.publicUrl}?t=${Date.now()}`;

  const { error: updateError } = await supabase
    .from("imported_projects" as any)
    .update({ thumbnail_url: publicUrl })
    .eq("id", projectId);

  if (updateError) {
    throw updateError;
  }

  return publicUrl;
}