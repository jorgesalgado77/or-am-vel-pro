/**
 * Gerador de Geometria Paramétrica — OrçaMóvel Pro
 * Gera um THREE.Group a partir de um ParametricModule para preview 3D em tempo real.
 */

import type { ParametricModule } from "@/types/parametricModule";
import { calculateInternalSpans } from "./spanEngine";

// Cores padrão
const BODY_COLOR = 0xd4a574; // madeira clara
const DOOR_COLOR = 0xfafafa; // branco
const DRAWER_BODY_COLOR = 0xc4a060; // madeira mais escura para corpo gaveta
const BASEBOARD_COLOR = 0x8b7355; // rodapé
const WALL_COLOR = 0xe8e0d8; // parede
const EDGE_COLOR = 0x222222;

/**
 * Gera um THREE.Group representando o módulo paramétrico completo.
 * Todas as medidas convertidas de mm → unidades 3D (1 unidade = 100mm).
 * O módulo é posicionado com a base no Y=0 (sobre o grid).
 */
export function generateParametricGeometry(
  THREE: typeof import("three"),
  module: ParametricModule,
  options?: { wall?: { width: number; height: number; depth: number } }
): InstanceType<typeof THREE.Group> {
  const group = new THREE.Group();
  group.name = `parametric_${module.name}`;

  const s = 0.01; // mm → unidades 3D
  const { width: W, height: H, depth: D, thickness: T, backThickness: BT, baseboardHeight: BH = 0 } = module;

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
  const drawerBodyMat = new THREE.MeshStandardMaterial({
    color: DRAWER_BODY_COLOR,
    roughness: 0.7,
    metalness: 0.03,
  });
  const baseboardMat = new THREE.MeshStandardMaterial({
    color: BASEBOARD_COLOR,
    roughness: 0.8,
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

    const edges = new THREE.EdgesGeometry(geo);
    const line = new THREE.LineSegments(edges, edgeMat);
    line.position.copy(mesh.position);
    line.name = `${name}_edge`;

    group.add(mesh);
    group.add(line);
    return mesh;
  }

  // ── Parede (se configurada) ──
  if (options?.wall) {
    const ww = options.wall.width;
    const wh = options.wall.height;
    const wd = options.wall.depth;
    const wallMat = new THREE.MeshStandardMaterial({
      color: WALL_COLOR,
      roughness: 0.9,
      metalness: 0.0,
      transparent: true,
      opacity: 0.6,
    });
    const wallEdgeMat = new THREE.LineBasicMaterial({ color: 0xbbbbbb, linewidth: 1 });
    const wallGeo = new THREE.BoxGeometry(ww * s, wh * s, wd * s);
    const wallMesh = new THREE.Mesh(wallGeo, wallMat);
    // Parede centralizada atrás do módulo
    wallMesh.position.set(
      (ww / 2) * s,
      (wh / 2) * s,
      -(wd / 2) * s
    );
    wallMesh.name = "Parede";
    const wallEdges = new THREE.EdgesGeometry(wallGeo);
    const wallLine = new THREE.LineSegments(wallEdges, wallEdgeMat);
    wallLine.position.copy(wallMesh.position);
    group.add(wallMesh);
    group.add(wallLine);
  }

  // ── Rodapé (se existir) ──
  if (BH > 0) {
    createPanel("Rodapé", W - T * 2, BH, T, W / 2, BH / 2, T / 2, baseboardMat);
  }

  // ── Lateral Esquerda ──
  createPanel("Lateral Esquerda", T, H, D, T / 2, H / 2, D / 2, bodyMat);

  // ── Lateral Direita ──
  createPanel("Lateral Direita", T, H, D, W - T / 2, H / 2, D / 2, bodyMat);

  // ── Topo ──
  const iw = W - T * 2;
  createPanel("Topo", iw, T, D, W / 2, H - T / 2, D / 2, bodyMat);

  // ── Base (acima do rodapé) ──
  createPanel("Base", iw, T, D, W / 2, BH + T / 2, D / 2, bodyMat);

  // ── Fundo (largura total × altura total, fixo por trás) ──
  createPanel("Fundo", W, H, BT, W / 2, H / 2, BT / 2, bodyMat);

  // ── Divisórias verticais ──
  const dividers = module.components.filter((c) => c.type === "divisoria");
  const ih = H - T * 2 - BH;

  dividers.forEach((div, i) => {
    const posX = div.positionY;
    createPanel(
      `Divisória ${i + 1}`,
      T, ih, D - 20,
      posX, BH + T + ih / 2, (D - 20) / 2 + 10,
      bodyMat
    );
  });

  // ── Prateleiras (profundidade = total - 70mm) ──
  const spans = calculateInternalSpans(module);
  const shelves = module.components.filter((c) => c.type === "prateleira");
  const shelfDepth = D - 70;

  shelves.forEach((shelf, i) => {
    const posY = spans.shelfPositions[i] ?? shelf.positionY;
    createPanel(
      `Prateleira ${i + 1}`,
      iw, shelf.thickness, shelfDepth,
      W / 2, posY + shelf.thickness / 2, shelfDepth / 2 + 10,
      bodyMat
    );
  });

  // ── Portas (altura = total - 7mm, largura = total/qtd - 4mm por porta) ──
  const doors = module.components.filter((c) => c.type === "porta");
  if (doors.length > 0) {
    const doorHeight = H - 7;
    const doorWidth = (W / doors.length) - 4;
    doors.forEach((door, i) => {
      const xPos = (doorWidth / 2) + 2 + i * (doorWidth + 4);
      createPanel(
        `Porta ${i + 1}`,
        doorWidth, doorHeight, T,
        xPos, H / 2 - 0.5, D + T / 2 + 2,
        doorMat
      );
    });
  }

  // ── Gavetas (frente + corpo completo) ──
  const drawers = module.components.filter((c) => c.type === "gaveta");
  const drawerBodyWidth = iw - 35;
  const drawerBodyDepth = D - 50;

  drawers.forEach((drawer, i) => {
    const fh = drawer.frontHeight || 180;
    const posY = drawer.positionY;
    const bodyHeight = fh - 30;

    // Frente da gaveta (visível, sobreposta)
    createPanel(
      `Frente Gaveta ${i + 1}`,
      iw + 2, fh, T,
      W / 2, posY + fh / 2, D + T / 2 + 2,
      doorMat
    );

    // Corpo da gaveta
    const bodyY = posY + bodyHeight / 2 + 5;
    const bodyZ = D / 2 + 5;

    createPanel(
      `Lateral Gaveta E ${i + 1}`,
      15, bodyHeight, drawerBodyDepth,
      T + 10, bodyY, bodyZ,
      drawerBodyMat
    );

    createPanel(
      `Lateral Gaveta D ${i + 1}`,
      15, bodyHeight, drawerBodyDepth,
      W - T - 10, bodyY, bodyZ,
      drawerBodyMat
    );

    createPanel(
      `Traseira Gaveta ${i + 1}`,
      drawerBodyWidth - 30, bodyHeight, 15,
      W / 2, bodyY, 25,
      drawerBodyMat
    );

    createPanel(
      `Fundo Gaveta ${i + 1}`,
      drawerBodyWidth - 30, 3, drawerBodyDepth - 2,
      W / 2, posY + 3, bodyZ,
      drawerBodyMat
    );
  });

  // ── Posicionar módulo com base no Y=0 (sobre o grid) ──
  // Centralizar apenas em X e Z, manter Y com base no chão
  const box = new THREE.Box3().setFromObject(group);
  const center = box.getCenter(new THREE.Vector3());
  // Offset: centralize X/Z mas coloque a base (minY) em Y=0
  group.position.set(-center.x, -box.min.y, -center.z);

  return group;
}
