/**
 * Gerador de Cotas/Dimensões 3D — OrçaMóvel Pro
 * Annotations built in WORLD SPACE (module centered at X=0, base at Y=floorOffset, back at Z=0).
 * Each dimension category uses a distinct color and offset layer to prevent overlap.
 */

const LINE_COLOR = 0x0066cc;
const TICK_SIZE = 0.05;

type ColorPreset = "blue" | "green" | "orange" | "red" | "purple";

const TAG_COLORS: Record<ColorPreset, { bg: string; border: string; text: string }> = {
  blue:   { bg: "#1e40afee", border: "#60a5fa", text: "#ffffff" },
  green:  { bg: "#166534ee", border: "#4ade80", text: "#ffffff" },
  orange: { bg: "#9a3412ee", border: "#fb923c", text: "#ffffff" },
  red:    { bg: "#991b1bee", border: "#f87171", text: "#ffffff" },
  purple: { bg: "#6b21a8ee", border: "#c084fc", text: "#ffffff" },
};

/** Color legend data exported for UI */
export const COTA_LEGEND: { color: ColorPreset; label: string; hex: string }[] = [
  { color: "blue",   label: "Dimensões externas (L×A×P)", hex: "#3b82f6" },
  { color: "green",  label: "Vãos internos livres", hex: "#22c55e" },
  { color: "purple", label: "Espessura / Total", hex: "#a855f7" },
  { color: "orange", label: "Rodapé / Folga parede", hex: "#f97316" },
  { color: "red",    label: "Piso / Distância módulos", hex: "#ef4444" },
];

function createTextSprite(
  THREE: typeof import("three"),
  text: string,
  position: InstanceType<typeof THREE.Vector3>,
  scale = 0.3,
  color: ColorPreset = "blue"
): InstanceType<typeof THREE.Sprite> {
  const canvas = document.createElement("canvas");
  canvas.width = 512;
  canvas.height = 128;
  const ctx = canvas.getContext("2d")!;
  const c = TAG_COLORS[color];

  // Rounded rect background
  const r = 20;
  ctx.beginPath();
  ctx.moveTo(r, 0);
  ctx.lineTo(512 - r, 0);
  ctx.quadraticCurveTo(512, 0, 512, r);
  ctx.lineTo(512, 128 - r);
  ctx.quadraticCurveTo(512, 128, 512 - r, 128);
  ctx.lineTo(r, 128);
  ctx.quadraticCurveTo(0, 128, 0, 128 - r);
  ctx.lineTo(0, r);
  ctx.quadraticCurveTo(0, 0, r, 0);
  ctx.closePath();
  ctx.fillStyle = c.bg;
  ctx.fill();
  ctx.strokeStyle = c.border;
  ctx.lineWidth = 5;
  ctx.stroke();

  // Text with shadow for readability
  ctx.shadowColor = "rgba(0,0,0,0.4)";
  ctx.shadowBlur = 4;
  ctx.fillStyle = c.text;
  ctx.font = "bold 54px Arial";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(text, 256, 64);

  const texture = new THREE.CanvasTexture(canvas);
  texture.needsUpdate = true;
  const mat = new THREE.SpriteMaterial({
    map: texture,
    depthTest: false,
    transparent: true,
    sizeAttenuation: true,
  });
  const sprite = new THREE.Sprite(mat);
  sprite.position.copy(position);
  sprite.scale.set(scale * 4, scale, 1);
  sprite.renderOrder = 999;
  return sprite;
}

function createDimensionLine(
  THREE: typeof import("three"),
  start: InstanceType<typeof THREE.Vector3>,
  end: InstanceType<typeof THREE.Vector3>,
  label: string,
  offsetDir: InstanceType<typeof THREE.Vector3>,
  offsetDist: number = 0.08,
  tagColor: ColorPreset = "blue",
  tagScale: number = 0.35
): InstanceType<typeof THREE.Group> {
  const group = new THREE.Group();
  group.name = `cota_${label}`;

  const lineColor = parseInt(TAG_COLORS[tagColor].border.replace("#", ""), 16);
  const lineMat = new THREE.LineBasicMaterial({ color: lineColor, linewidth: 2, depthTest: false });

  const s = start.clone().add(offsetDir.clone().multiplyScalar(offsetDist));
  const e = end.clone().add(offsetDir.clone().multiplyScalar(offsetDist));

  // Main dimension line
  const geo = new THREE.BufferGeometry().setFromPoints([s, e]);
  const line = new THREE.Line(geo, lineMat);
  line.renderOrder = 998;
  group.add(line);

  // Extension lines
  const ext1Geo = new THREE.BufferGeometry().setFromPoints([
    start.clone().add(offsetDir.clone().multiplyScalar(offsetDist * 0.3)),
    s.clone().add(offsetDir.clone().multiplyScalar(0.02))
  ]);
  const ext1 = new THREE.Line(ext1Geo, lineMat);
  ext1.renderOrder = 998;
  group.add(ext1);

  const ext2Geo = new THREE.BufferGeometry().setFromPoints([
    end.clone().add(offsetDir.clone().multiplyScalar(offsetDist * 0.3)),
    e.clone().add(offsetDir.clone().multiplyScalar(0.02))
  ]);
  const ext2 = new THREE.Line(ext2Geo, lineMat);
  ext2.renderOrder = 998;
  group.add(ext2);

  // Tick marks
  const dir = e.clone().sub(s);
  if (dir.length() > 0.001) {
    const tickDir = new THREE.Vector3().crossVectors(
      dir.normalize(), offsetDir
    ).normalize().multiplyScalar(TICK_SIZE);

    const tick1Geo = new THREE.BufferGeometry().setFromPoints([
      s.clone().add(tickDir), s.clone().sub(tickDir)
    ]);
    const t1 = new THREE.Line(tick1Geo, lineMat);
    t1.renderOrder = 998;
    group.add(t1);

    const tick2Geo = new THREE.BufferGeometry().setFromPoints([
      e.clone().add(tickDir), e.clone().sub(tickDir)
    ]);
    const t2 = new THREE.Line(tick2Geo, lineMat);
    t2.renderOrder = 998;
    group.add(t2);
  }

  // Label sprite at midpoint — offset further from the line
  const mid = s.clone().add(e).multiplyScalar(0.5).add(offsetDir.clone().multiplyScalar(0.08));
  const sprite = createTextSprite(THREE, label, mid, tagScale, tagColor);
  group.add(sprite);

  return group;
}

export interface DimensionOptions {
  wall?: { width: number; height: number };
  floorOffset?: number;
  duplicates?: Array<{ positionX: number; positionZ?: number; module: { width: number; depth: number } }>;
}

/**
 * Generates dimension annotations in WORLD SPACE.
 * Each category placed on a distinct offset layer to prevent overlap.
 */
export function generateDimensionAnnotations(
  THREE: typeof import("three"),
  module: import("@/types/parametricModule").ParametricModule,
  options?: DimensionOptions
): InstanceType<typeof THREE.Group> {
  const group = new THREE.Group();
  group.name = "dimension_annotations";

  const sc = 0.01;
  const { width: W, height: H, depth: D, thickness: T, baseboardHeight: BH = 0 } = module;
  const fo = (options?.floorOffset ?? 0) * sc;

  const halfW = (W * sc) / 2;
  const left = -halfW;
  const right = halfW;
  const top = fo + H * sc;
  const bottom = fo;
  const front = D * sc;

  const upDir = new THREE.Vector3(0, 1, 0);
  const forwardDir = new THREE.Vector3(0, 0, 1);
  const leftDir = new THREE.Vector3(-1, 0, 0);
  const rightDir = new THREE.Vector3(1, 0, 0);

  // Tag scale proportional to module
  const baseTag = Math.max(0.35, Math.min(0.6, (W * sc) * 0.6));

  // ═══ FRONT COTAS (Z axis) — each on a different Z layer ═══

  // Layer 1: Width (external) — closest to module
  const zLayer1 = front + 0.20;
  group.add(createDimensionLine(
    THREE,
    new THREE.Vector3(left, bottom, zLayer1),
    new THREE.Vector3(right, bottom, zLayer1),
    `${W}mm`, forwardDir, 0.10, "blue", baseTag
  ));

  // Layer 2: Internal width — farther out
  const iw = W - T * 2;
  const zLayer2 = front + 0.20;
  if (iw > 0 && iw !== W) {
    group.add(createDimensionLine(
      THREE,
      new THREE.Vector3(left + T * sc, bottom, zLayer2),
      new THREE.Vector3(right - T * sc, bottom, zLayer2),
      `LI:${iw}mm`, forwardDir, 0.40, "green", baseTag * 0.9
    ));
  }

  // Layer 3: Thickness — farthest out
  const zLayer3 = front + 0.20;
  group.add(createDimensionLine(
    THREE,
    new THREE.Vector3(left, bottom, zLayer3),
    new THREE.Vector3(left + T * sc, bottom, zLayer3),
    `${T}mm`, forwardDir, 0.70, "purple", baseTag * 0.75
  ));

  // ═══ LEFT SIDE COTAS (X axis) — each at a different X offset ═══

  // Layer 1: Height (external) — closest
  const xLayer1 = left - 0.15;
  group.add(createDimensionLine(
    THREE,
    new THREE.Vector3(xLayer1, bottom, front * 0.6),
    new THREE.Vector3(xLayer1, top, front * 0.6),
    `${H}mm`, leftDir, 0.10, "blue", baseTag
  ));

  // Layer 2: Internal height — farther
  const ih = H - T * 2 - BH;
  if (ih > 0 && ih !== H) {
    const xLayer2 = left - 0.15;
    group.add(createDimensionLine(
      THREE,
      new THREE.Vector3(xLayer2, fo + (BH + T) * sc, front * 0.6),
      new THREE.Vector3(xLayer2, fo + (H - T) * sc, front * 0.6),
      `VI:${ih}mm`, leftDir, 0.40, "green", baseTag * 0.9
    ));
  }

  // Layer 3: Baseboard
  if (BH > 0) {
    const xLayer3 = left - 0.15;
    group.add(createDimensionLine(
      THREE,
      new THREE.Vector3(xLayer3, fo, front * 0.6),
      new THREE.Vector3(xLayer3, fo + BH * sc, front * 0.6),
      `R:${BH}mm`, leftDir, 0.70, "orange", baseTag * 0.8
    ));
  }

  // Layer 4: Floor offset
  if (options?.floorOffset && options.floorOffset > 0) {
    const xLayer4 = left - 0.15;
    group.add(createDimensionLine(
      THREE,
      new THREE.Vector3(xLayer4, 0, front * 0.6),
      new THREE.Vector3(xLayer4, fo, front * 0.6),
      `Piso:${options.floorOffset}mm`, leftDir, 1.0, "red", baseTag * 0.8
    ));
  }

  // ═══ RIGHT SIDE: Depth ═══
  group.add(createDimensionLine(
    THREE,
    new THREE.Vector3(right + 0.15, bottom, 0),
    new THREE.Vector3(right + 0.15, bottom, front),
    `${D}mm`, rightDir, 0.10, "blue", baseTag
  ));

  // ═══ TOP: Wall clearance ═══
  if (options?.wall) {
    const wallHalfW = (options.wall.width * sc) / 2;

    let lastRightEdge = right;
    let firstLeftEdge = left;
    if (options?.duplicates && options.duplicates.length > 0) {
      options.duplicates.forEach((dup) => {
        const dupRight = (dup.positionX + dup.module.width / 2 - W / 2) * sc;
        const dupLeft = (dup.positionX - W / 2) * sc;
        if (dupRight > lastRightEdge) lastRightEdge = dupRight;
        if (dupLeft < firstLeftEdge) firstLeftEdge = dupLeft;
      });
    }

    const rightClearanceMm = Math.round((wallHalfW - lastRightEdge) / sc);
    if (rightClearanceMm > 0) {
      group.add(createDimensionLine(
        THREE,
        new THREE.Vector3(lastRightEdge, top + 0.10, 0),
        new THREE.Vector3(wallHalfW, top + 0.10, 0),
        `${rightClearanceMm}mm`, upDir, 0.10, "orange", baseTag * 0.8
      ));
    }

    const leftClearanceMm = Math.round((firstLeftEdge + wallHalfW) / sc);
    if (leftClearanceMm > 0) {
      group.add(createDimensionLine(
        THREE,
        new THREE.Vector3(-wallHalfW, top + 0.10, 0),
        new THREE.Vector3(firstLeftEdge, top + 0.10, 0),
        `${leftClearanceMm}mm`, upDir, 0.20, "orange", baseTag * 0.8
      ));
    }
  }

  // ═══ DUPLICATE distances ═══
  if (options?.duplicates && options.duplicates.length > 0) {
    interface ModuleBounds { leftX: number; rightX: number }
    const allModules: ModuleBounds[] = [{ leftX: left, rightX: right }];

    options.duplicates.forEach((dup) => {
      const dupCenterX = (dup.positionX + dup.module.width / 2 - W / 2) * sc;
      const dupHalfW = (dup.module.width * sc) / 2;
      allModules.push({ leftX: dupCenterX - dupHalfW, rightX: dupCenterX + dupHalfW });
    });

    allModules.sort((a, b) => a.leftX - b.leftX);

    for (let i = 0; i < allModules.length - 1; i++) {
      const gapStart = allModules[i].rightX;
      const gapEnd = allModules[i + 1].leftX;
      const gapMm = Math.round((gapEnd - gapStart) / sc);
      if (gapMm > 0) {
        group.add(createDimensionLine(
          THREE,
          new THREE.Vector3(gapStart, top + 0.15, front * 0.5),
          new THREE.Vector3(gapEnd, top + 0.15, front * 0.5),
          `${gapMm}mm`, upDir, 0.12, "red", baseTag * 0.85
        ));
      }
    }

    // Total span
    const totalLeft = allModules[0].leftX;
    const totalRight = allModules[allModules.length - 1].rightX;
    const totalMm = Math.round((totalRight - totalLeft) / sc);
    group.add(createDimensionLine(
      THREE,
      new THREE.Vector3(totalLeft, top + 0.25, front * 0.3),
      new THREE.Vector3(totalRight, top + 0.25, front * 0.3),
      `Total:${totalMm}mm`, upDir, 0.20, "purple", baseTag * 0.9
    ));
  }

  return group;
}
