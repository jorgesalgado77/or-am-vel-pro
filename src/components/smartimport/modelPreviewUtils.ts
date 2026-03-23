const PREVIEW_FALLBACK_COLOR = 0x94a3b8;

interface DxfEntity {
  type: string;
  color: number;
  vertices: Array<{ x: number; y: number; z: number }>;
  isClosed?: boolean;
}

const ACI_COLORS: Record<number, number> = {
  0: 0x64748b,
  1: 0xff0000,
  2: 0xffff00,
  3: 0x00ff00,
  4: 0x00ffff,
  5: 0x0000ff,
  6: 0xff00ff,
  7: 0xb0bec5,
  8: 0x808080,
  9: 0xc0c0c0,
  10: 0xff0000,
  11: 0xff7f7f,
  12: 0xcc0000,
  14: 0x990000,
  20: 0xff3f00,
  30: 0xff7f00,
  40: 0xffbf00,
  50: 0xffff00,
  60: 0xbfff00,
  70: 0x7fff00,
  80: 0x3fff00,
  90: 0x00ff00,
  100: 0x00ff3f,
  110: 0x00ff7f,
  120: 0x00ffbf,
  130: 0x00ffff,
  140: 0x00bfff,
  150: 0x007fff,
  160: 0x003fff,
  170: 0x0000ff,
  180: 0x3f00ff,
  190: 0x7f00ff,
  200: 0xbf00ff,
  210: 0xff00ff,
  220: 0xff00bf,
  230: 0xff007f,
  240: 0xff003f,
  250: 0x333333,
  251: 0x505050,
  252: 0x696969,
  253: 0x808080,
  254: 0xbebebe,
  255: 0xffffff,
};

const TEXTURE_KEYS = [
  "map",
  "alphaMap",
  "aoMap",
  "bumpMap",
  "displacementMap",
  "emissiveMap",
  "lightMap",
  "metalnessMap",
  "normalMap",
  "roughnessMap",
  "specularMap",
];

const previewModelCache = new Map<string, any>();

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

function setTextureColorSpace(THREE: any, material: any) {
  for (const key of TEXTURE_KEYS) {
    const texture = material?.[key];
    if (!texture) continue;
    if ((key === "map" || key === "emissiveMap") && "colorSpace" in texture) {
      texture.colorSpace = THREE.SRGBColorSpace;
    }
    texture.needsUpdate = true;
  }
  material.needsUpdate = true;
}

function createPreviewMaterial(THREE: any, material: any, geometryHasColors: boolean) {
  if (!material) {
    return new THREE.MeshStandardMaterial({
      color: PREVIEW_FALLBACK_COLOR,
      vertexColors: geometryHasColors,
      metalness: 0.08,
      roughness: 0.72,
      side: THREE.DoubleSide,
    });
  }

  if (Array.isArray(material)) {
    return material.map((entry) => createPreviewMaterial(THREE, entry, geometryHasColors));
  }

  if (material.isMeshStandardMaterial || material.isMeshPhysicalMaterial) {
    const clone = material.clone();
    clone.side = THREE.DoubleSide;
    if (geometryHasColors) clone.vertexColors = true;
    if (!clone.map && !geometryHasColors && clone.color?.getHex?.() === 0xffffff) {
      clone.color.setHex(PREVIEW_FALLBACK_COLOR);
    }
    setTextureColorSpace(THREE, clone);
    return clone;
  }

  const nextMaterial = new THREE.MeshStandardMaterial({
    color: material.color?.clone?.() || new THREE.Color(PREVIEW_FALLBACK_COLOR),
    map: material.map || null,
    alphaMap: material.alphaMap || null,
    aoMap: material.aoMap || null,
    bumpMap: material.bumpMap || null,
    displacementMap: material.displacementMap || null,
    emissive: material.emissive?.clone?.() || new THREE.Color(0x000000),
    emissiveMap: material.emissiveMap || null,
    lightMap: material.lightMap || null,
    metalnessMap: material.metalnessMap || null,
    normalMap: material.normalMap || null,
    roughnessMap: material.roughnessMap || null,
    transparent: material.transparent ?? false,
    opacity: material.opacity ?? 1,
    wireframe: material.wireframe ?? false,
    vertexColors: geometryHasColors || material.vertexColors === true,
    metalness: 0.08,
    roughness: typeof material.shininess === "number"
      ? Math.max(0.2, 1 - Math.min(material.shininess / 100, 0.85))
      : 0.72,
    side: THREE.DoubleSide,
  });

  if (!nextMaterial.map && !geometryHasColors && nextMaterial.color.getHex() === 0xffffff) {
    nextMaterial.color.setHex(PREVIEW_FALLBACK_COLOR);
  }

  setTextureColorSpace(THREE, nextMaterial);
  return nextMaterial;
}

function prepareObjectForPreview(THREE: any, root: any) {
  let meshIndex = 0;

  root.traverse((child: any) => {
    if (child.isMesh) {
      if (!child.name) child.name = `Peça_${meshIndex + 1}`;
      if (!child.geometry?.attributes?.normal) {
        child.geometry?.computeVertexNormals?.();
      }

      const geometryHasColors = Boolean(child.geometry?.getAttribute?.("color"));
      child.material = createPreviewMaterial(THREE, child.material, geometryHasColors);
      child.userData.originalMaterial = child.material;
      child.castShadow = false;
      child.receiveShadow = false;
      meshIndex += 1;
      return;
    }

    if ((child.isLine || child.isLineSegments) && child.material?.clone) {
      child.material = child.material.clone();
      if (child.material.color?.getHex?.() === 0x0000ff) {
        child.material.color.setHex(PREVIEW_FALLBACK_COLOR);
      }
      child.userData.originalMaterial = child.material;
      child.material.transparent = false;
      child.material.needsUpdate = true;
    }
  });

  return root;
}

function parseDxfEntities(dxfText: string): DxfEntity[] {
  const lines = dxfText.split(/\r?\n/).map((line) => line.trim());
  const entities: DxfEntity[] = [];
  let i = 0;
  let inEntities = false;

  while (i < lines.length) {
    if (lines[i] === "ENTITIES") {
      inEntities = true;
      i += 1;
      break;
    }
    i += 1;
  }

  if (!inEntities) return entities;

  let currentEntity: DxfEntity | null = null;

  while (i < lines.length - 1) {
    if (lines[i] === "ENDSEC") break;

    const code = Number.parseInt(lines[i], 10);
    const value = lines[i + 1];

    if (Number.isNaN(code) || value === undefined) {
      i += 1;
      continue;
    }

    if (code === 0) {
      if (currentEntity && currentEntity.vertices.length > 0) {
        entities.push(currentEntity);
      }

      const entityType = value.toUpperCase();
      if (["LINE", "POLYLINE", "LWPOLYLINE", "3DFACE", "SOLID", "CIRCLE", "ARC"].includes(entityType)) {
        currentEntity = { type: entityType, color: 7, vertices: [], isClosed: false };
      } else if (entityType === "SEQEND") {
        currentEntity = null;
      } else {
        currentEntity = null;
      }

      i += 2;
      continue;
    }

    if (!currentEntity) {
      i += 2;
      continue;
    }

    if (code === 62) {
      currentEntity.color = Number.parseInt(value, 10) || 7;
    }

    if (code === 70 && (currentEntity.type === "LWPOLYLINE" || currentEntity.type === "POLYLINE")) {
      currentEntity.isClosed = (Number.parseInt(value, 10) & 1) === 1;
    }

    if ([10, 11, 12, 13].includes(code)) {
      const x = Number.parseFloat(value);
      const yCode = code + 10;
      const zCode = code + 20;
      let y = 0;
      let z = 0;
      let j = i + 2;

      if (j < lines.length - 1 && Number.parseInt(lines[j], 10) === yCode) {
        y = Number.parseFloat(lines[j + 1]);
        j += 2;
      }

      if (j < lines.length - 1 && Number.parseInt(lines[j], 10) === zCode) {
        z = Number.parseFloat(lines[j + 1]);
      }

      currentEntity.vertices.push({ x, y, z });
    }

    i += 2;
  }

  if (currentEntity && currentEntity.vertices.length > 0) {
    entities.push(currentEntity);
  }

  return entities;
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

      const mesh = new THREE.Mesh(
        geometry,
        new THREE.MeshStandardMaterial({
          color,
          side: THREE.DoubleSide,
          metalness: 0.05,
          roughness: 0.78,
        }),
      );
      mesh.name = `${entity.type}_${index + 1}`;
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

      const mesh = new THREE.Mesh(
        geometry,
        new THREE.MeshStandardMaterial({
          color,
          side: THREE.DoubleSide,
          metalness: 0.05,
          roughness: 0.8,
        }),
      );
      mesh.name = `${entity.type}_${index + 1}`;
      group.add(mesh);
      return;
    }

    if (entity.vertices.length >= 2) {
      const points = entity.vertices.map(toVector3);
      if (entity.isClosed) points.push(toVector3(entity.vertices[0]));
      const geometry = new THREE.BufferGeometry().setFromPoints(points);
      const line = new THREE.Line(
        geometry,
        new THREE.LineBasicMaterial({ color }),
      );
      line.name = `${entity.type}_${index + 1}`;
      group.add(line);
    }
  });

  if (group.children.length === 0) {
    group.add(
      new THREE.Mesh(
        new THREE.BoxGeometry(2, 2, 2),
        new THREE.MeshStandardMaterial({
          color: PREVIEW_FALLBACK_COLOR,
          wireframe: true,
          side: THREE.DoubleSide,
        }),
      ),
    );
  }

  return group;
}

export async function loadModelForPreview(THREE: any, fileUrl: string, onProgress?: (event: ProgressEvent<EventTarget>) => void) {
  const ext = getFileExtension(fileUrl);
  let loadedObject: any = null;

  if (ext === "glb" || ext === "gltf") {
    const { GLTFLoader } = await import("three/examples/jsm/loaders/GLTFLoader.js");
    const loader = new GLTFLoader();
    loader.setCrossOrigin("anonymous");
    const gltf = await new Promise<any>((resolve, reject) => loader.load(fileUrl, resolve, onProgress, reject));
    loadedObject = prepareObjectForPreview(THREE, gltf.scene);
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

    loadedObject = new THREE.Mesh(
      geometry,
      new THREE.MeshStandardMaterial({
        color: 0xffffff,
        vertexColors: Boolean(geometry.getAttribute?.("color")),
        metalness: 0.08,
        roughness: 0.72,
        side: THREE.DoubleSide,
      }),
    );
    loadedObject.name = "Peça_STL";
  } else if (ext === "fbx") {
    const { FBXLoader } = await import("three/examples/jsm/loaders/FBXLoader.js");
    const loader = new FBXLoader();
    const fbx = await new Promise<any>((resolve, reject) => loader.load(fileUrl, resolve, onProgress, reject));
    loadedObject = prepareObjectForPreview(THREE, fbx);
  } else if (ext === "dxf") {
    const response = await fetch(fileUrl);
    const text = await response.text();
    loadedObject = buildDxfScene(THREE, parseDxfEntities(text));
  }

  if (!loadedObject) {
    loadedObject = new THREE.Mesh(
      new THREE.BoxGeometry(2, 2, 2),
      new THREE.MeshStandardMaterial({
        color: PREVIEW_FALLBACK_COLOR,
        wireframe: true,
        side: THREE.DoubleSide,
      }),
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