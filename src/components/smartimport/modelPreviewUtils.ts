import { getCachedMaterial, clearMaterialCache } from "@/lib/textureCache";

const PREVIEW_FALLBACK_COLOR = 0x94a3b8;

interface DxfEntity {
  type: string;
  color: number;
  vertices: Array<{ x: number; y: number; z: number }>;
  isClosed?: boolean;
}

const ACI_COLORS: Record<number, number> = {
  0: 0x64748b, 1: 0xff0000, 2: 0xffff00, 3: 0x00ff00, 4: 0x00ffff,
  5: 0x0000ff, 6: 0xff00ff, 7: 0xb0bec5, 8: 0x808080, 9: 0xc0c0c0,
  10: 0xff0000, 11: 0xff7f7f, 12: 0xcc0000, 14: 0x990000,
  20: 0xff3f00, 30: 0xff7f00, 40: 0xffbf00, 50: 0xffff00,
  60: 0xbfff00, 70: 0x7fff00, 80: 0x3fff00, 90: 0x00ff00,
  100: 0x00ff3f, 110: 0x00ff7f, 120: 0x00ffbf, 130: 0x00ffff,
  140: 0x00bfff, 150: 0x007fff, 160: 0x003fff, 170: 0x0000ff,
  180: 0x3f00ff, 190: 0x7f00ff, 200: 0xbf00ff, 210: 0xff00ff,
  220: 0xff00bf, 230: 0xff007f, 240: 0xff003f,
  250: 0x333333, 251: 0x505050, 252: 0x696969,
  253: 0x808080, 254: 0xbebebe, 255: 0xffffff,
};

const TEXTURE_KEYS = [
  "map", "alphaMap", "aoMap", "bumpMap", "displacementMap",
  "emissiveMap", "lightMap", "metalnessMap", "normalMap",
  "roughnessMap", "specularMap",
];

// ── Utilities ───────────────────────────────────────────────

export function getFileExtension(url: string): string {
  try {
    const path = new URL(url).pathname;
    return path.split(".").pop()?.toLowerCase() || "";
  } catch {
    return url.split(".").pop()?.toLowerCase() || "";
  }
}

function aciToHex(colorIndex: number): number {
  if (ACI_COLORS[colorIndex] !== undefined) return ACI_COLORS[colorIndex];
  return PREVIEW_FALLBACK_COLOR;
}

/**
 * Ensure texture color spaces are correct without replacing the material itself.
 */
function fixTextureColorSpaces(THREE: any, material: any) {
  if (!material) return;
  if (Array.isArray(material)) {
    material.forEach((m: any) => fixTextureColorSpaces(THREE, m));
    return;
  }
  for (const key of TEXTURE_KEYS) {
    const texture = material[key];
    if (!texture) continue;
    if ((key === "map" || key === "emissiveMap") && "colorSpace" in texture) {
      texture.colorSpace = THREE.SRGBColorSpace;
    }
    texture.needsUpdate = true;
  }
  material.side = THREE.DoubleSide;
  material.needsUpdate = true;
}

/**
 * Check if a material has meaningful color (not default white/black).
 * If not, apply a neutral material so objects aren't invisible.
 */
function ensureMaterialVisibility(THREE: any, material: any): any {
  if (!material) return null;
  if (Array.isArray(material)) {
    return material.map((m: any) => ensureMaterialVisibility(THREE, m));
  }
  if (material.map) return material;

  const color = material.color;
  if (color && color.r === 1 && color.g === 1 && color.b === 1) {
    const hasVisualData = material.map || material.normalMap || material.bumpMap ||
      material.metalnessMap || material.roughnessMap || material.emissiveMap;
    if (!hasVisualData && material.type !== "MeshPhysicalMaterial") {
      material.color = new THREE.Color(0xd4d4d8);
      material.metalness = material.metalness ?? 0.05;
      material.roughness = material.roughness ?? 0.65;
      material.needsUpdate = true;
    }
  }
  return material;
}

/**
 * CRITICAL: Preserve original materials from the file.
 * Only apply minimal fixes (double-side, texture color space, compute normals).
 * Now also applies material caching to deduplicate identical materials.
 */
function prepareObjectForPreview(THREE: any, root: any) {
  let meshIndex = 0;

  root.traverse((child: any) => {
    child.frustumCulled = true;

    if (child.isMesh) {
      if (!child.name) child.name = `Peça_${meshIndex + 1}`;

      if (!child.geometry?.attributes?.normal) {
        child.geometry?.computeVertexNormals?.();
      }

      fixTextureColorSpaces(THREE, child.material);
      child.material = ensureMaterialVisibility(THREE, child.material);

      // Deduplicate materials via global cache
      child.material = getCachedMaterial(child.material);

      // Store reference for selection highlight/restore
      child.userData.originalMaterial = child.material;
      child.castShadow = false;
      child.receiveShadow = false;
      meshIndex += 1;
      return;
    }

    if ((child.isLine || child.isLineSegments) && child.material) {
      child.userData.originalMaterial = child.material;
    }
  });

  // ── Geometry Instancing: merge duplicate geometries ──
  applyGeometryInstancing(THREE, root);

  // ── LOD for heavy meshes ──
  applyLODToRoot(THREE, root);

  return root;
}

/**
 * Apply LOD to meshes with >50k vertices.
 */
function applyLODToRoot(THREE: any, root: any) {
  const HIGH_POLY_THRESHOLD = 50000;
  const heavyMeshes: any[] = [];

  root.traverse((child: any) => {
    if (!child.isMesh || !child.geometry?.attributes?.position) return;
    if (child.geometry.attributes.position.count > HIGH_POLY_THRESHOLD) {
      heavyMeshes.push(child);
    }
  });

  if (heavyMeshes.length === 0) return;

  for (const mesh of heavyMeshes) {
    const parent = mesh.parent;
    if (!parent) continue;

    const lod = new THREE.LOD();
    lod.name = mesh.name;
    lod.position.copy(mesh.position);
    lod.rotation.copy(mesh.rotation);
    lod.scale.copy(mesh.scale);
    lod.userData = { ...mesh.userData };

    // Level 0: Original
    const highDetail = mesh.clone();
    highDetail.position.set(0, 0, 0);
    highDetail.rotation.set(0, 0, 0);
    highDetail.scale.set(1, 1, 1);
    lod.addLevel(highDetail, 0);

    // Level 1: Simplified via decimation
    try {
      const midGeo = mesh.geometry.clone();
      // Reduce index count by skipping triangles
      if (midGeo.index) {
        const indices = Array.from(midGeo.index.array);
        const reduced: number[] = [];
        for (let i = 0; i < indices.length; i += 6) {
          // Keep every other triangle
          if (i + 2 < indices.length) {
            reduced.push(indices[i], indices[i + 1], indices[i + 2]);
          }
        }
        midGeo.setIndex(reduced);
      }
      midGeo.computeVertexNormals();
      const midMesh = new THREE.Mesh(midGeo, mesh.material);
      midMesh.name = `${mesh.name}_mid`;
      midMesh.userData = { ...mesh.userData };
      lod.addLevel(midMesh, 15);
    } catch {
      lod.addLevel(highDetail.clone(), 15);
    }

    parent.add(lod);
    parent.remove(mesh);
  }
}

/**
 * Detect meshes sharing identical geometry (by vertex count + bounding box)
 * and replace them with InstancedMesh for better GPU performance.
 */
function applyGeometryInstancing(THREE: any, root: any) {
  const meshes: any[] = [];
  root.traverse((child: any) => {
    if (child.isMesh && child.geometry) meshes.push(child);
  });

  // Group by geometry signature (vertex count + bbox dimensions)
  const groups = new Map<string, any[]>();
  for (const mesh of meshes) {
    const geo = mesh.geometry;
    const posAttr = geo.attributes?.position;
    if (!posAttr) continue;
    const box = new THREE.Box3().setFromBufferAttribute(posAttr);
    const size = box.getSize(new THREE.Vector3());
    const key = `${posAttr.count}_${size.x.toFixed(3)}_${size.y.toFixed(3)}_${size.z.toFixed(3)}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(mesh);
  }

  // Only instance groups with 3+ identical meshes (worth the overhead)
  for (const [, group] of groups) {
    if (group.length < 3) continue;
    const template = group[0];
    const instancedMesh = new THREE.InstancedMesh(
      template.geometry,
      template.material,
      group.length
    );
    instancedMesh.name = `Instanced_${template.name}`;
    instancedMesh.userData.originalMaterial = template.material;
    instancedMesh.frustumCulled = true;

    const matrix = new THREE.Matrix4();
    for (let i = 0; i < group.length; i++) {
      group[i].updateWorldMatrix(true, false);
      matrix.copy(group[i].matrixWorld);
      instancedMesh.setMatrixAt(i, matrix);
      group[i].parent?.remove(group[i]);
    }
    instancedMesh.instanceMatrix.needsUpdate = true;
    root.add(instancedMesh);
  }
}

/**
 * Dispose all geometries, materials and textures in a scene graph.
 * Also clears the material cache.
 */
export function disposeSceneGraph(object: any) {
  if (!object) return;
  object.traverse?.((child: any) => {
    if (child.geometry) {
      child.geometry.dispose();
    }
    const materials = Array.isArray(child.material) ? child.material : child.material ? [child.material] : [];
    for (const mat of materials) {
      for (const key of TEXTURE_KEYS) {
        const tex = mat[key];
        if (tex) tex.dispose?.();
      }
      mat.dispose?.();
    }
  });
  clearMaterialCache();
}

// ── DXF Parser (inline fallback when Worker unavailable) ──

function parseDxfEntitiesInline(dxfText: string): DxfEntity[] {
  const lines = dxfText.split(/\r?\n/).map((line) => line.trim());
  const entities: DxfEntity[] = [];
  let i = 0;
  let inEntities = false;

  while (i < lines.length) {
    if (lines[i] === "ENTITIES") { inEntities = true; i += 1; break; }
    i += 1;
  }
  if (!inEntities) return entities;

  let currentEntity: DxfEntity | null = null;

  while (i < lines.length - 1) {
    if (lines[i] === "ENDSEC") break;

    const code = Number.parseInt(lines[i], 10);
    const value = lines[i + 1];

    if (Number.isNaN(code) || value === undefined) { i += 1; continue; }

    if (code === 0) {
      if (currentEntity && currentEntity.vertices.length > 0) entities.push(currentEntity);

      const entityType = value.toUpperCase();
      if (["LINE", "POLYLINE", "LWPOLYLINE", "3DFACE", "SOLID", "CIRCLE", "ARC"].includes(entityType)) {
        currentEntity = { type: entityType, color: 7, vertices: [], isClosed: false };
      } else if (entityType === "SEQEND") {
        currentEntity = null;
      } else {
        currentEntity = null;
      }
      i += 2; continue;
    }

    if (!currentEntity) { i += 2; continue; }

    if (code === 62) currentEntity.color = Number.parseInt(value, 10) || 7;

    if (code === 70 && (currentEntity.type === "LWPOLYLINE" || currentEntity.type === "POLYLINE")) {
      currentEntity.isClosed = (Number.parseInt(value, 10) & 1) === 1;
    }

    if ([10, 11, 12, 13].includes(code)) {
      const x = Number.parseFloat(value);
      const yCode = code + 10;
      const zCode = code + 20;
      let y = 0, z = 0;
      let j = i + 2;
      if (j < lines.length - 1 && Number.parseInt(lines[j], 10) === yCode) { y = Number.parseFloat(lines[j + 1]); j += 2; }
      if (j < lines.length - 1 && Number.parseInt(lines[j], 10) === zCode) { z = Number.parseFloat(lines[j + 1]); }
      currentEntity.vertices.push({ x, y, z });
    }

    i += 2;
  }

  if (currentEntity && currentEntity.vertices.length > 0) entities.push(currentEntity);
  return entities;
}

/**
 * Parse DXF using Web Worker (with inline fallback).
 */
async function parseDxfWithWorker(dxfText: string): Promise<DxfEntity[]> {
  try {
    const workerUrl = new URL("../workers/dxfParserWorker.ts", import.meta.url);
    const worker = new Worker(workerUrl, { type: "module" });

    return new Promise<DxfEntity[]>((resolve) => {
      const timeout = setTimeout(() => {
        worker.terminate();
        resolve(parseDxfEntitiesInline(dxfText));
      }, 10000);

      worker.onmessage = (event) => {
        clearTimeout(timeout);
        worker.terminate();
        if (event.data.success) {
          resolve(event.data.entities);
        } else {
          resolve(parseDxfEntitiesInline(dxfText));
        }
      };

      worker.onerror = () => {
        clearTimeout(timeout);
        worker.terminate();
        resolve(parseDxfEntitiesInline(dxfText));
      };

      worker.postMessage({ dxfText });
    });
  } catch {
    // Worker not supported — fallback to inline
    return parseDxfEntitiesInline(dxfText);
  }
}

function buildDxfScene(THREE: any, entities: DxfEntity[]) {
  const group = new THREE.Group();
  group.name = "DXF_Root";

  const toVector3 = (point: { x: number; y: number; z: number }) =>
    new THREE.Vector3(point.x, point.z || 0, -(point.y || 0));

  entities.forEach((entity, index) => {
    const color = aciToHex(entity.color);

    if ((entity.type === "3DFACE" || entity.type === "SOLID") && entity.vertices.length >= 3) {
      const vertices = entity.vertices.map(toVector3);
      const positions: number[] = [];
      positions.push(vertices[0].x, vertices[0].y, vertices[0].z, vertices[1].x, vertices[1].y, vertices[1].z, vertices[2].x, vertices[2].y, vertices[2].z);
      if (vertices.length >= 4) {
        positions.push(vertices[0].x, vertices[0].y, vertices[0].z, vertices[2].x, vertices[2].y, vertices[2].z, vertices[3].x, vertices[3].y, vertices[3].z);
      }
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
      geometry.computeVertexNormals();
      const mesh = new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({ color, side: THREE.DoubleSide, metalness: 0.05, roughness: 0.78 }));
      mesh.name = `${entity.type}_${index + 1}`;
      mesh.userData.originalMaterial = mesh.material;
      group.add(mesh);
      return;
    }

    if ((entity.type === "LWPOLYLINE" || entity.type === "POLYLINE") && entity.vertices.length >= 3 && entity.isClosed) {
      const vertices = entity.vertices.map(toVector3);
      const positions: number[] = [];
      for (let current = 1; current < vertices.length - 1; current += 1) {
        positions.push(vertices[0].x, vertices[0].y, vertices[0].z);
        positions.push(vertices[current].x, vertices[current].y, vertices[current].z);
        positions.push(vertices[current + 1].x, vertices[current + 1].y, vertices[current + 1].z);
      }
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
      geometry.computeVertexNormals();
      const mesh = new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({ color, side: THREE.DoubleSide, metalness: 0.05, roughness: 0.8 }));
      mesh.name = `${entity.type}_${index + 1}`;
      mesh.userData.originalMaterial = mesh.material;
      group.add(mesh);
      return;
    }

    if (entity.vertices.length >= 2) {
      const points = entity.vertices.map(toVector3);
      if (entity.isClosed) points.push(toVector3(entity.vertices[0]));
      const geometry = new THREE.BufferGeometry().setFromPoints(points);
      const mat = new THREE.LineBasicMaterial({ color });
      const line = new THREE.Line(geometry, mat);
      line.name = `${entity.type}_${index + 1}`;
      line.userData.originalMaterial = mat;
      group.add(line);
    }
  });

  if (group.children.length === 0) {
    group.add(new THREE.Mesh(
      new THREE.BoxGeometry(2, 2, 2),
      new THREE.MeshStandardMaterial({ color: PREVIEW_FALLBACK_COLOR, wireframe: true, side: THREE.DoubleSide }),
    ));
  }

  return group;
}

// ── Model Loader (no cache — avoids clone/material corruption) ──

export async function loadModelForPreview(THREE: any, fileUrl: string, onProgress?: (event: ProgressEvent<EventTarget>) => void) {
  const ext = getFileExtension(fileUrl);
  let loadedObject: any = null;

  if (ext === "glb" || ext === "gltf") {
    const { GLTFLoader } = await import("three/examples/jsm/loaders/GLTFLoader.js");
    const { DRACOLoader } = await import("three/examples/jsm/loaders/DRACOLoader.js");

    const dracoLoader = new DRACOLoader();
    dracoLoader.setDecoderPath("https://www.gstatic.com/draco/versioned/decoders/1.5.7/");
    dracoLoader.setDecoderConfig({ type: "js" });

    const loader = new GLTFLoader();
    loader.setDRACOLoader(dracoLoader);
    loader.setCrossOrigin("anonymous");

    const gltf = await new Promise<any>((resolve, reject) => loader.load(fileUrl, resolve, onProgress, reject));
    loadedObject = prepareObjectForPreview(THREE, gltf.scene);

    dracoLoader.dispose();
  } else if (ext === "obj") {
    const { OBJLoader } = await import("three/examples/jsm/loaders/OBJLoader.js");
    const loader = new OBJLoader();
    const obj = await new Promise<any>((resolve, reject) => loader.load(fileUrl, resolve, onProgress, reject));
    loadedObject = prepareObjectForPreview(THREE, obj);
  } else if (ext === "stl") {
    const { STLLoader } = await import("three/examples/jsm/loaders/STLLoader.js");
    const loader = new STLLoader();
    const geometry = await new Promise<any>((resolve, reject) => loader.load(fileUrl, resolve, onProgress, reject));
    if (!geometry.attributes?.normal) geometry.computeVertexNormals?.();

    const mat = new THREE.MeshStandardMaterial({
      color: 0xd4d4d8,
      vertexColors: Boolean(geometry.getAttribute?.("color")),
      metalness: 0.15,
      roughness: 0.6,
      side: THREE.DoubleSide,
    });
    loadedObject = new THREE.Mesh(geometry, mat);
    loadedObject.name = "Peça_STL";
    loadedObject.userData.originalMaterial = mat;
  } else if (ext === "fbx") {
    const { FBXLoader } = await import("three/examples/jsm/loaders/FBXLoader.js");
    const loader = new FBXLoader();
    const fbx = await new Promise<any>((resolve, reject) => loader.load(fileUrl, resolve, onProgress, reject));
    loadedObject = prepareObjectForPreview(THREE, fbx);
  } else if (ext === "dxf") {
    const response = await fetch(fileUrl);
    const text = await response.text();
    // Use Web Worker for parsing (with inline fallback)
    const entities = await parseDxfWithWorker(text);
    loadedObject = buildDxfScene(THREE, entities);
  }

  if (!loadedObject) {
    loadedObject = new THREE.Mesh(
      new THREE.BoxGeometry(2, 2, 2),
      new THREE.MeshStandardMaterial({ color: PREVIEW_FALLBACK_COLOR, wireframe: true, side: THREE.DoubleSide }),
    );
  }

  return loadedObject;
}

export function frameObjectForThumbnail(THREE: any, object: any, camera: any) {
  const initialBox = new THREE.Box3().setFromObject(object);
  if (initialBox.isEmpty()) {
    camera.position.set(6, 5, 6);
    camera.lookAt(0, 0, 0);
    return;
  }

  const center = initialBox.getCenter(new THREE.Vector3());
  object.position.sub(center);

  const box = new THREE.Box3().setFromObject(object);
  const size = box.getSize(new THREE.Vector3());
  const maxDim = Math.max(size.x, size.y, size.z) || 1;
  const fitHeightDistance = maxDim / (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov * 0.5)));
  const fitWidthDistance = fitHeightDistance / camera.aspect;
  const distance = Math.max(fitHeightDistance, fitWidthDistance) * 1.45;

  camera.position.set(distance * 0.92, distance * 0.68, distance * 0.92);
  camera.near = Math.max(distance / 100, 0.1);
  camera.far = Math.max(distance * 25, 100);
  camera.lookAt(0, maxDim * 0.04, 0);
  camera.updateProjectionMatrix();
}
