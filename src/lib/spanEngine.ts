/**
 * Motor de Vãos Internos — OrçaMóvel Pro
 * Calcula distribuição automática de prateleiras e vãos dentro de um módulo paramétrico.
 */

import type {
  ParametricModule,
  InternalComponent,
  SpanResult,
  PartListItem,
  HardwareItem,
  ModuleBOM,
  SNAP_GRID_MM,
} from "@/types/parametricModule";

/**
 * Snap a value to the nearest grid increment (10mm default)
 */
export function snapToGrid(value: number, grid: number = 10): number {
  return Math.round(value / grid) * grid;
}

/**
 * Calcula os vãos internos de um módulo baseado nas prateleiras.
 */
export function calculateInternalSpans(module: ParametricModule): SpanResult {
  const { height, thickness } = module;

  // Altura interna = altura total - topo - base
  const vaoInterno = height - thickness * 2;

  // Filtra apenas prateleiras
  const shelves = module.components.filter((c) => c.type === "prateleira");
  const qtdPrateleiras = shelves.length;

  if (qtdPrateleiras === 0) {
    return {
      vaoInterno,
      vaoLivre: vaoInterno,
      vaoUnitario: vaoInterno,
      quantidadeVaos: 1,
      shelfPositions: [],
    };
  }

  // Espessura total ocupada por prateleiras
  const espessuraTotal = shelves.reduce((sum, s) => sum + s.thickness, 0);

  // Vão livre = vão interno - espaço das prateleiras
  const vaoLivre = vaoInterno - espessuraTotal;

  // Vão unitário = espaço livre dividido pelo número de espaços (prateleiras + 1)
  const quantidadeVaos = qtdPrateleiras + 1;
  const vaoUnitario = vaoLivre / quantidadeVaos;

  // Calcula posições Y automáticas (distribuição uniforme)
  const shelfPositions: number[] = [];
  let currentY = thickness; // começa após a base

  for (let i = 0; i < qtdPrateleiras; i++) {
    currentY += vaoUnitario;
    shelfPositions.push(snapToGrid(currentY));
    currentY += shelves[i].thickness;
  }

  return {
    vaoInterno,
    vaoLivre,
    vaoUnitario: snapToGrid(vaoUnitario),
    quantidadeVaos,
    shelfPositions,
  };
}

/**
 * Redistribui prateleiras uniformemente dentro do módulo.
 */
export function redistributeShelves(module: ParametricModule): InternalComponent[] {
  const spans = calculateInternalSpans(module);

  const shelves = module.components.filter((c) => c.type === "prateleira");
  const others = module.components.filter((c) => c.type !== "prateleira");

  const updatedShelves = shelves.map((shelf, i) => ({
    ...shelf,
    positionY: spans.shelfPositions[i] ?? shelf.positionY,
  }));

  return [...others, ...updatedShelves];
}

/**
 * Gera a lista de peças (BOM) de um módulo paramétrico.
 */
export function generateBOM(module: ParametricModule): ModuleBOM {
  const { width, height, depth, thickness, backThickness } = module;
  const parts: PartListItem[] = [];
  const hardware: HardwareItem[] = [];

  // Dimensões internas
  const internalWidth = width - thickness * 2;
  const internalHeight = height - thickness * 2;

  // ── Corpo (caixa) ──

  // Laterais (2x)
  parts.push({
    name: "Lateral",
    quantity: 2,
    width: depth,
    height: height,
    thickness,
    area: (depth * height * 2) / 1_000_000,
    edgeBanding: ((height + depth) * 2 * 2) / 1000,
    material: "MDF",
  });

  // Topo e Base (2x)
  parts.push({
    name: "Topo/Base",
    quantity: 2,
    width: internalWidth,
    height: depth,
    thickness,
    area: (internalWidth * depth * 2) / 1_000_000,
    edgeBanding: ((internalWidth + depth) * 2 * 2) / 1000,
    material: "MDF",
  });

  // Fundo
  parts.push({
    name: "Fundo",
    quantity: 1,
    width: width - 4,
    height: height - 4,
    thickness: backThickness,
    area: ((width - 4) * (height - 4)) / 1_000_000,
    edgeBanding: 0,
    material: "HDF",
  });

  // ── Divisórias verticais ──
  const divs = module.components.filter((c) => c.type === "divisoria");
  if (divs.length > 0) {
    parts.push({
      name: "Divisória Vertical",
      quantity: divs.length,
      width: depth - 20,
      height: internalHeight,
      thickness,
      area: ((depth - 20) * internalHeight * divs.length) / 1_000_000,
      edgeBanding: (((depth - 20 + internalHeight) * 2) * divs.length) / 1000,
      material: "MDF",
    });
  }

  // ── Prateleiras ──
  const shelves = module.components.filter((c) => c.type === "prateleira");
  if (shelves.length > 0) {
    const shelfWidth = divs.length > 0
      ? (internalWidth - divs.length * thickness) / (divs.length + 1)
      : internalWidth;

    parts.push({
      name: "Prateleira",
      quantity: shelves.length * (divs.length + 1),
      width: shelfWidth,
      height: depth - 20,
      thickness,
      area: (shelfWidth * (depth - 20) * shelves.length * (divs.length + 1)) / 1_000_000,
      edgeBanding: (shelfWidth * shelves.length * (divs.length + 1)) / 1000,
      material: "MDF",
    });
  }

  // ── Portas ──
  const doors = module.components.filter((c) => c.type === "porta");
  if (doors.length > 0) {
    parts.push({
      name: "Porta",
      quantity: doors.length,
      width: width / doors.length - 3,
      height: height - 3,
      thickness,
      area: ((width / doors.length - 3) * (height - 3) * doors.length) / 1_000_000,
      edgeBanding: (((width / doors.length - 3) + (height - 3)) * 2 * doors.length) / 1000,
      material: "MDF",
    });

    // Ferragens de porta
    hardware.push({ name: "Dobradiça 35mm", quantity: doors.length * 3, unit: "pç" });
    hardware.push({ name: "Puxador", quantity: doors.length, unit: "pç" });
  }

  // ── Gavetas ──
  const drawers = module.components.filter((c) => c.type === "gaveta");
  if (drawers.length > 0) {
    const drawerWidth = internalWidth - 26;
    drawers.forEach((d) => {
      const fh = d.frontHeight || 180;
      parts.push({
        name: "Frente de Gaveta",
        quantity: 1,
        width: drawerWidth + 26,
        height: fh,
        thickness,
        area: ((drawerWidth + 26) * fh) / 1_000_000,
        edgeBanding: (((drawerWidth + 26) + fh) * 2) / 1000,
        material: "MDF",
      });
    });

    hardware.push({ name: "Corrediça telescópica", quantity: drawers.length, unit: "par" });
    hardware.push({ name: "Puxador gaveta", quantity: drawers.length, unit: "pç" });
  }

  // ── Parafusos e cavilhas ──
  hardware.push({ name: "Parafuso confirmação 7×50mm", quantity: 16 + divs.length * 8, unit: "pç" });
  hardware.push({ name: "Cavilha 8×30mm", quantity: 8 + shelves.length * 4, unit: "pç" });
  hardware.push({ name: "Suporte prateleira", quantity: shelves.length * 4, unit: "pç" });

  const totalArea = parts.reduce((s, p) => s + p.area, 0);
  const totalEdgeBanding = parts.reduce((s, p) => s + p.edgeBanding, 0);

  return { parts, hardware, totalArea, totalEdgeBanding };
}
