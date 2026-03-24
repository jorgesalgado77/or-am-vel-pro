/**
 * Gerador de Geometria Paramétrica — OrçaMóvel Pro
 * Gera um THREE.Group a partir de um ParametricModule para preview 3D em tempo real.
 */

import type { ParametricModule } from "@/types/parametricModule";
import { calculateInternalSpans } from "./spanEngine";

// Cores padrão
const BODY_COLOR = 0xd4a574;
const DOOR_COLOR = 0xfafafa;
const DRAWER_BODY_COLOR = 0xc4a060;
const BASEBOARD_COLOR = 0x8b7355;
const WALL_COLOR = 0xe8e0d8;
const EDGE_COLOR = 0x222222;

export interface MaterialOverrides {
  bodyColor?: number;
  doorColor?: number;
  shelfColor?: number;
  backColor?: number;
  drawerColor?: number;
  bodyTexture?: any; // THREE.Texture
  doorTexture?: any;
  shelfTexture?: any;
  backTexture?: any;
  drawerTexture?: any;
}

export interface WallOverrides {
  color?: number;
  texture?: any; // THREE.Texture
}

export interface FloorOverrides {
  color?: number;
  texture?: any; // THREE.Texture
}

export interface GeometryOptions {
  wall?: { width: number; height: number; depth: number };
  wallOverrides?: WallOverrides;
  materialOverrides?: MaterialOverrides;
  floorOffset?: number;
  openDoors?: boolean;
  openDrawers?: boolean;
}

function applyTextureToMat(
  mat: any,
  texture: any | undefined
) {
  if (texture) {
    mat.map = texture;
    mat.needsUpdate = true;
  }
}

/**
 * Gera a parede como grupo independente.
 * A face frontal fica em Z=0, parede se estende para Z negativo.
 * Base no Y=0 (piso).
 */
export function generateWallGeometry(
  THREE: typeof import("three"),
  wallConfig: { width: number; height: number; depth: number },
  overrides?: WallOverrides
): InstanceType<typeof THREE.Group> {
  const group = new THREE.Group();
  group.name = "wall_group";
  const s = 0.01;
  const { width: ww, height: wh, depth: wd } = wallConfig;

  const wallMat = new THREE.MeshStandardMaterial({
    color: overrides?.color ?? 0xe8e0d8,
    roughness: 0.9,
    metalness: 0.0,
    transparent: !overrides?.texture,
    opacity: overrides?.texture ? 1.0 : 0.6,
  });
  if (overrides?.texture) applyTextureToMat(wallMat, overrides.texture);

  const wallEdgeMat = new THREE.LineBasicMaterial({ color: 0xbbbbbb, linewidth: 1 });
  const wallGeo = new THREE.BoxGeometry(ww * s, wh * s, wd * s);
  const wallMesh = new THREE.Mesh(wallGeo, wallMat);
  // Wall centered on X, bottom at Y=0, front face at Z=0 (extends to -Z)
  wallMesh.position.set(0, (wh / 2) * s, -(wd / 2) * s);
  wallMesh.name = "Parede";
  const wallEdges = new THREE.EdgesGeometry(wallGeo);
  const wallLine = new THREE.LineSegments(wallEdges, wallEdgeMat);
  wallLine.position.copy(wallMesh.position);
  group.add(wallMesh);
  group.add(wallLine);

  return group;
}

/**
 * Gera um THREE.Group representando o módulo paramétrico completo.
 */
export function generateParametricGeometry(
  THREE: typeof import("three"),
  module: ParametricModule,
  options?: GeometryOptions
): InstanceType<typeof THREE.Group> {
  const group = new THREE.Group();
  group.name = `parametric_${module.name}`;

  const s = 0.01;
  const { width: W, height: H, depth: D, thickness: T, backThickness: BT, baseboardHeight: BH = 0 } = module;
  const mo = options?.materialOverrides;

  const bodyMat = new THREE.MeshStandardMaterial({
    color: mo?.bodyColor ?? BODY_COLOR,
    roughness: 0.6,
    metalness: 0.05,
  });
  if (mo?.bodyTexture) applyTextureToMat(bodyMat, mo.bodyTexture);

  const doorMat = new THREE.MeshStandardMaterial({
    color: mo?.doorColor ?? DOOR_COLOR,
    roughness: 0.3,
    metalness: 0.02,
  });
  if (mo?.doorTexture) applyTextureToMat(doorMat, mo.doorTexture);

  const shelfMat = mo?.shelfColor || mo?.shelfTexture
    ? new THREE.MeshStandardMaterial({ color: mo?.shelfColor ?? BODY_COLOR, roughness: 0.6, metalness: 0.05 })
    : bodyMat;
  if (mo?.shelfTexture) applyTextureToMat(shelfMat, mo.shelfTexture);

  const backMat = mo?.backColor || mo?.backTexture
    ? new THREE.MeshStandardMaterial({ color: mo?.backColor ?? BODY_COLOR, roughness: 0.6, metalness: 0.05 })
    : bodyMat;
  if (mo?.backTexture) applyTextureToMat(backMat, mo.backTexture);

  const drawerBodyMat = new THREE.MeshStandardMaterial({
    color: mo?.drawerColor ?? DRAWER_BODY_COLOR,
    roughness: 0.7,
    metalness: 0.03,
  });
  if (mo?.drawerTexture) applyTextureToMat(drawerBodyMat, mo.drawerTexture);

  const baseboardMat = new THREE.MeshStandardMaterial({
    color: BASEBOARD_COLOR,
    roughness: 0.8,
    metalness: 0.02,
  });
  const edgeMat = new THREE.LineBasicMaterial({ color: EDGE_COLOR, linewidth: 1 });

  function createPanel(
    name: string,
    w: number, h: number, d: number,
    x: number, y: number, z: number,
    mat: InstanceType<typeof THREE.MeshStandardMaterial>
  ) {
    const geo = new THREE.BoxGeometry(w * s, h * s, d * s);
    const mesh = new THREE.Mesh(geo, mat.clone());
    mesh.position.set(x * s, y * s, z * s);
    mesh.name = name;
    mesh.userData = { partName: name, width: w, height: h, depth: d, type: "panel" };

    const edges = new THREE.EdgesGeometry(geo);
    const line = new THREE.LineSegments(edges, edgeMat);
    line.position.copy(mesh.position);
    line.name = `${name}_edge`;

    group.add(mesh);
    group.add(line);
    return mesh;
  }

  // ── Régua: apenas um painel plano ──
  if (module.moduleType === "regua") {
    createPanel("Painel Régua", W, H, D, W / 2, H / 2, D / 2, bodyMat);

    const box = new THREE.Box3().setFromObject(group);
    const center = box.getCenter(new THREE.Vector3());
    const floorOff = (options?.floorOffset ?? 0) * s;
    group.position.set(-center.x, -box.min.y + floorOff, -box.min.z);
    return group;
  }

  // ── Parede é renderizada separadamente no editor para não herdar floorOffset ──

  // ── Rodapé ──
  if (BH > 0) {
    createPanel("Rodapé", W - T * 2, BH, T, W / 2, BH / 2, T / 2, baseboardMat);
  }

  // ── Laterais ──
  createPanel("Lateral Esquerda", T, H, D, T / 2, H / 2, D / 2, bodyMat);
  createPanel("Lateral Direita", T, H, D, W - T / 2, H / 2, D / 2, bodyMat);

  // ── Topo ──
  const iw = W - T * 2;
  createPanel("Topo", iw, T, D, W / 2, H - T / 2, D / 2, bodyMat);

  // ── Base ──
  createPanel("Base", iw, T, D, W / 2, BH + T / 2, D / 2, bodyMat);

  // ── Fundo ──
  createPanel("Fundo", W, H, BT, W / 2, H / 2, BT / 2, backMat);

  // ── Divisórias ──
  const dividers = module.components.filter((c) => c.type === "divisoria");
  const ih = H - T * 2 - BH;
  dividers.forEach((div, i) => {
    createPanel(`Divisória ${i + 1}`, T, ih, D - 20, div.positionY, BH + T + ih / 2, (D - 20) / 2 + 10, bodyMat);
  });

  // ── Prateleiras ──
  const spans = calculateInternalSpans(module);
  const shelves = module.components.filter((c) => c.type === "prateleira");
  const shelfDepth = D - 70;
  shelves.forEach((shelf, i) => {
    const posY = spans.shelfPositions[i] ?? shelf.positionY;
    createPanel(`Prateleira ${i + 1}`, iw, shelf.thickness, shelfDepth, W / 2, posY + shelf.thickness / 2, shelfDepth / 2 + 10, shelfMat);
  });

  // ── Portas ──
  const doors = module.components.filter((c) => c.type === "porta");
  if (doors.length > 0) {
    const doorHeight = H - 7;
    const doorWidth = (W / doors.length) - 4;
    doors.forEach((_, i) => {
      const xPos = (doorWidth / 2) + 2 + i * (doorWidth + 4);
      createPanel(`Porta ${i + 1}`, doorWidth, doorHeight, T, xPos, H / 2 - 0.5, D + T / 2 + 2, doorMat);
    });
  }

  // ── Gavetas ──
  const drawers = module.components.filter((c) => c.type === "gaveta");
  const drawerBodyWidth = iw - 35;
  const drawerBodyDepth = D - 50;
  drawers.forEach((drawer, i) => {
    const fh = drawer.frontHeight || 180;
    const posY = drawer.positionY;
    const bodyHeight = fh - 30;
    createPanel(`Frente Gaveta ${i + 1}`, iw + 2, fh, T, W / 2, posY + fh / 2, D + T / 2 + 2, doorMat);
    const bodyY = posY + bodyHeight / 2 + 5;
    const bodyZ = D / 2 + 5;
    createPanel(`Lateral Gaveta E ${i + 1}`, 15, bodyHeight, drawerBodyDepth, T + 10, bodyY, bodyZ, drawerBodyMat);
    createPanel(`Lateral Gaveta D ${i + 1}`, 15, bodyHeight, drawerBodyDepth, W - T - 10, bodyY, bodyZ, drawerBodyMat);
    createPanel(`Traseira Gaveta ${i + 1}`, drawerBodyWidth - 30, bodyHeight, 15, W / 2, bodyY, 25, drawerBodyMat);
    createPanel(`Fundo Gaveta ${i + 1}`, drawerBodyWidth - 30, 3, drawerBodyDepth - 2, W / 2, posY + 3, bodyZ, drawerBodyMat);
  });

  // ── Posicionar: centro em X=0, base em Y=floorOffset, fundo em Z=0 (módulo avança em +Z) ──
  const box = new THREE.Box3().setFromObject(group);
  const center = box.getCenter(new THREE.Vector3());
  const floorOff = (options?.floorOffset ?? 0) * s;
  // centerX → center module horizontally
  // -box.min.y + floorOff → base of module at floor offset height
  // -box.min.z → back of module at Z=0 (so it sits in front of the wall)
  group.position.set(-center.x, -box.min.y + floorOff, -box.min.z);

  return group;
}
