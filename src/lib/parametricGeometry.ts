/**
 * Gerador de Geometria Paramétrica — OrçaMóvel Pro
 * Gera um THREE.Group a partir de um ParametricModule para preview 3D em tempo real.
 */

import type { ParametricModule, InternalComponent } from "@/types/parametricModule";
import { calculateInternalSpans } from "./spanEngine";

// Cores padrão (HSL → hex)
const BODY_COLOR = 0xd4a574; // madeira clara
const DOOR_COLOR = 0xfafafa; // branco
const SHELF_COLOR = 0xd4a574;
const DRAWER_COLOR = 0xfafafa;
const DIVIDER_COLOR = 0xd4a574;
const EDGE_COLOR = 0x222222;

/**
 * Gera um THREE.Group representando o módulo paramétrico completo.
 * Todas as medidas convertidas de mm → unidades 3D (1 unidade = 100mm).
 */
export function generateParametricGeometry(
  THREE: typeof import("three"),
  module: ParametricModule
): InstanceType<typeof THREE.Group> {
  const group = new THREE.Group();
  group.name = `parametric_${module.name}`;

  const s = 0.01; // mm → unidades 3D (1 unit = 100mm)
  const { width: W, height: H, depth: D, thickness: T, backThickness: BT } = module;

  const bodyMat = new THREE.MeshStandardMaterial({
    color: BODY_COLOR,
    roughness: 0.6,
    metalness: 0.05,
  });
  const doorMat = new THREE.MeshStandardMaterial({
    color: DOOR_COLOR,
    roughness: 0.3,
    metalness: 0.02,
  });
  const edgeMat = new THREE.LineBasicMaterial({ color: EDGE_COLOR, linewidth: 1 });

  // Helper: cria box mesh com edges
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

    // Wireframe edges for visibility
    const edges = new THREE.EdgesGeometry(geo);
    const line = new THREE.LineSegments(edges, edgeMat);
    line.position.copy(mesh.position);
    line.name = `${name}_edge`;

    group.add(mesh);
    group.add(line);
    return mesh;
  }

  // ── Lateral Esquerda ──
  createPanel("Lateral Esquerda", T, H, D, T / 2, H / 2, D / 2, bodyMat);

  // ── Lateral Direita ──
  createPanel("Lateral Direita", T, H, D, W - T / 2, H / 2, D / 2, bodyMat);

  // ── Topo ──
  const iw = W - T * 2; // largura interna
  createPanel("Topo", iw, T, D, W / 2, H - T / 2, D / 2, bodyMat);

  // ── Base ──
  createPanel("Base", iw, T, D, W / 2, T / 2, D / 2, bodyMat);

  // ── Fundo ──
  createPanel("Fundo", W - 4, H - 4, BT, W / 2, H / 2, BT / 2, bodyMat);

  // ── Divisórias verticais ──
  const dividers = module.components.filter((c) => c.type === "divisoria");
  const ih = H - T * 2; // altura interna

  dividers.forEach((div, i) => {
    const posX = div.positionY; // positionY is repurposed as positionX for dividers
    createPanel(
      `Divisória ${i + 1}`,
      T, ih, D - 20,
      posX, H / 2, (D - 20) / 2 + 10,
      bodyMat
    );
  });

  // ── Prateleiras ──
  const spans = calculateInternalSpans(module);
  const shelves = module.components.filter((c) => c.type === "prateleira");

  shelves.forEach((shelf, i) => {
    const posY = spans.shelfPositions[i] ?? shelf.positionY;
    createPanel(
      `Prateleira ${i + 1}`,
      iw, shelf.thickness, D - 20,
      W / 2, posY + shelf.thickness / 2, (D - 20) / 2 + 10,
      bodyMat
    );
  });

  // ── Portas ──
  const doors = module.components.filter((c) => c.type === "porta");
  if (doors.length > 0) {
    const doorWidth = (W - 3) / doors.length;
    doors.forEach((door, i) => {
      createPanel(
        `Porta ${i + 1}`,
        doorWidth - 2, H - 3, T,
        doorWidth / 2 + i * doorWidth + 1.5, H / 2, D + T / 2 + 2,
        doorMat
      );
    });
  }

  // ── Gavetas ──
  const drawers = module.components.filter((c) => c.type === "gaveta");
  drawers.forEach((drawer, i) => {
    const fh = drawer.frontHeight || 180;
    const posY = drawer.positionY;
    createPanel(
      `Gaveta ${i + 1}`,
      iw - 4, fh, T,
      W / 2, posY + fh / 2, D + T / 2 + 2,
      doorMat
    );
  });

  // Center the group
  const box = new THREE.Box3().setFromObject(group);
  const center = box.getCenter(new THREE.Vector3());
  group.position.sub(center);

  return group;
}
