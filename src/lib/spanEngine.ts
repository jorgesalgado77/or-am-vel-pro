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
} from "@/types/parametricModule";

/**
 * Snap a value to the nearest grid increment (10mm default)
 */
export function snapToGrid(value: number, grid: number = 10): number {
  return Math.round(value / grid) * grid;
}

/**
 * Calcula os vãos internos de um módulo baseado nas prateleiras.
 * Considera rodapé (baseboardHeight) e espessura das chapas.
 */
export function calculateInternalSpans(module: ParametricModule): SpanResult {
  const { height, width, thickness, baseboardHeight = 0 } = module;

  // Altura interna = altura total - topo - base - rodapé
  const vaoInterno = height - thickness * 2 - baseboardHeight;

  // Largura interna = largura total - lateral esquerda - lateral direita
  const larguraInterna = width - thickness * 2;

  // Filtra apenas prateleiras
  const shelves = module.components.filter((c) => c.type === "prateleira");
  const qtdPrateleiras = shelves.length;

  if (qtdPrateleiras === 0) {
    return {
      vaoInterno,
      larguraInterna,
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
  let currentY = thickness + baseboardHeight; // começa após a base + rodapé

  for (let i = 0; i < qtdPrateleiras; i++) {
    currentY += vaoUnitario;
    shelfPositions.push(snapToGrid(currentY));
    currentY += shelves[i].thickness;
  }

  return {
    vaoInterno,
    larguraInterna,
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
  const { thickness, baseboardHeight = 0, width, height } = module;
  const internalWidth = width - thickness * 2;
  const internalHeight = height - thickness * 2 - baseboardHeight;

  const shelves = module.components.filter((c) => c.type === "prateleira");
  const dividers = module.components.filter((c) => c.type === "divisoria");
  const drawers = module.components.filter((c) => c.type === "gaveta");
  const others = module.components.filter((c) =>
    c.type !== "prateleira" && c.type !== "divisoria" && c.type !== "gaveta"
  );

  const updatedShelves = shelves.map((shelf, i) => ({
    ...shelf,
    positionY: spans.shelfPositions[i] ?? shelf.positionY,
  }));

  const totalDivThickness = dividers.reduce((sum, div) => sum + (div.thickness || thickness), 0);
  const dividerSpanCount = dividers.length + 1;
  const freeWidth = Math.max(0, internalWidth - totalDivThickness);
  const slotWidth = dividerSpanCount > 0 ? freeWidth / dividerSpanCount : freeWidth;
  let currentX = thickness;

  const updatedDividers = dividers.map((div) => {
    currentX += slotWidth;
    const divThickness = div.thickness || thickness;
    const centerX = currentX + divThickness / 2;
    currentX += divThickness;
    return { ...div, positionY: snapToGrid(centerX) };
  });

  // Redistribute drawers: N drawers have (N+1) gaps of 4mm
  // frontHeight = (moduleHeight - (N+1)*4) / N  (uses full module height for fronts)
  // Clamp: drawers must not exceed internal height
  const numDrawers = Math.min(drawers.length, 4);
  const totalGaps4mm = (numDrawers + 1) * 4;
  const moduleH = height;
  const autoFrontHeight = numDrawers > 0 ? Math.floor((moduleH - totalGaps4mm) / numDrawers) : 180;
  
  // Clamp auto front height to not exceed internal space
  const maxFrontHeight = internalHeight;
  const clampedAutoFH = Math.min(autoFrontHeight, maxFrontHeight);
  
  let currentDrawerY = baseboardHeight + thickness;
  const updatedDrawers = drawers.slice(0, 4).map((drawer, i) => {
    const fh = Math.min(drawer.manualFrontHeight ?? clampedAutoFH, maxFrontHeight);
    // Don't let drawer exceed the top of internal space
    const maxY = height - thickness; // top panel position
    const clampedY = Math.min(snapToGrid(currentDrawerY), maxY - fh);
    const updatedDrawer = {
      ...drawer,
      frontHeight: fh,
      bottomThickness: drawer.bottomThickness ?? 3,
      positionY: clampedY,
    };
    currentDrawerY = clampedY + fh + 4; // 4mm gap between fronts
    return updatedDrawer;
  });

  return [...others, ...updatedShelves, ...updatedDividers, ...updatedDrawers];
}

/**
 * Gera a lista de peças (BOM) de um módulo paramétrico.
 * Regras de marcenaria:
 * - Portas: altura = alturaTotal - 7mm, largura = (larguraTotal / qtdPortas) - 4mm por porta
 * - Prateleiras: profundidade = profundidadeTotal - 70mm
 * - Gavetas corpo: largura = larguraInterna - 35mm (para corrediças), profundidade = profundidadeTotal - 50mm
 * - Fundo: largura = larguraTotal, altura = alturaTotal (fixo por trás)
 */
export function generateBOM(module: ParametricModule): ModuleBOM {
  const { width, height, depth, thickness, backThickness, baseboardHeight = 0 } = module;
  const parts: PartListItem[] = [];
  const hardware: HardwareItem[] = [];

  // Dimensões internas
  const internalWidth = width - thickness * 2;
  const internalHeight = height - thickness * 2 - baseboardHeight;

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

  // Rodapé (se existir)
  if (baseboardHeight > 0) {
    parts.push({
      name: "Rodapé",
      quantity: 1,
      width: internalWidth,
      height: baseboardHeight,
      thickness,
      area: (internalWidth * baseboardHeight) / 1_000_000,
      edgeBanding: (internalWidth) / 1000,
      material: "MDF",
    });
  }

  // Fundo — largura total × altura total (fixo por trás)
  parts.push({
    name: "Fundo",
    quantity: 1,
    width: width,
    height: height,
    thickness: backThickness,
    area: (width * height) / 1_000_000,
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

  // ── Prateleiras (profundidade = total - 70mm) ──
  const shelves = module.components.filter((c) => c.type === "prateleira");
  if (shelves.length > 0) {
    const shelfDepth = depth - 70;
    const shelfWidth = divs.length > 0
      ? (internalWidth - divs.length * thickness) / (divs.length + 1)
      : internalWidth;

    parts.push({
      name: "Prateleira",
      quantity: shelves.length * (divs.length + 1),
      width: shelfWidth,
      height: shelfDepth,
      thickness,
      area: (shelfWidth * shelfDepth * shelves.length * (divs.length + 1)) / 1_000_000,
      edgeBanding: (shelfWidth * shelves.length * (divs.length + 1)) / 1000,
      material: "MDF",
    });
  }

  // ── Portas (altura = total - 7mm, largura = total/qtd - 4mm por porta) ──
  const doors = module.components.filter((c) => c.type === "porta");
  if (doors.length > 0) {
    const doorHeight = height - 7;
    const doorWidth = (width / doors.length) - 4;

    parts.push({
      name: "Porta",
      quantity: doors.length,
      width: doorWidth,
      height: doorHeight,
      thickness,
      area: (doorWidth * doorHeight * doors.length) / 1_000_000,
      edgeBanding: ((doorWidth + doorHeight) * 2 * doors.length) / 1000,
      material: "MDF",
    });

    // Ferragens de porta
    hardware.push({ name: "Dobradiça 35mm", quantity: doors.length * 3, unit: "pç" });
    hardware.push({ name: "Puxador", quantity: doors.length, unit: "pç" });
  }

  // ── Gavetas (frente + corpo) ──
  const drawers = module.components.filter((c) => c.type === "gaveta");
  if (drawers.length > 0) {
    // Corpo da gaveta: largura = interna - 35mm (corrediças telescópicas)
    // Profundidade do corpo = profundidade total - 50mm
    const drawerBodyWidth = internalWidth - 35;
    const drawerBodyDepth = depth - 50;

    drawers.forEach((d, i) => {
      const fh = d.frontHeight || 180;
      const bodyThickness = d.thickness || 18;
      const bottomThickness = d.bottomThickness || 3;

      const frontWidth = width - 4; // front = module width - 4mm

      parts.push({
        name: `Frente Gaveta ${i + 1}`,
        quantity: 1,
        width: frontWidth,
        height: fh,
        thickness,
        area: (frontWidth * fh) / 1_000_000,
        edgeBanding: ((frontWidth + fh) * 2) / 1000,
        material: "MDF",
      });

      const bodyHeight = fh - 30;
      parts.push({
        name: `Lateral Gaveta ${i + 1}`,
        quantity: 2,
        width: drawerBodyDepth,
        height: bodyHeight,
        thickness: bodyThickness,
        area: (drawerBodyDepth * bodyHeight * 2) / 1_000_000,
        edgeBanding: ((drawerBodyDepth + bodyHeight) * 2 * 2) / 1000,
        material: "MDF",
      });

      parts.push({
        name: `Frente/Tras Corpo Gaveta ${i + 1}`,
        quantity: 2,
        width: drawerBodyWidth - bodyThickness * 2,
        height: bodyHeight,
        thickness: bodyThickness,
        area: ((drawerBodyWidth - bodyThickness * 2) * bodyHeight * 2) / 1_000_000,
        edgeBanding: (((drawerBodyWidth - bodyThickness * 2) + bodyHeight) * 2 * 2) / 1000,
        material: "MDF",
      });

      parts.push({
        name: `Fundo Gaveta ${i + 1}`,
        quantity: 1,
        width: drawerBodyWidth - bodyThickness * 2,
        height: drawerBodyDepth - 2,
        thickness: bottomThickness,
        area: ((drawerBodyWidth - bodyThickness * 2) * (drawerBodyDepth - 2)) / 1_000_000,
        edgeBanding: 0,
        material: bottomThickness <= 6 ? "HDF" : "MDF",
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
