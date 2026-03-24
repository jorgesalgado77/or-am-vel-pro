/**
 * Gerador de Cotas/Dimensões 3D — OrçaMóvel Pro
 * Annotations built in WORLD SPACE (module centered at X=0, base at Y=floorOffset, back at Z=0).
 */

const LINE_COLOR = 0x0066cc;
const TICK_SIZE = 0.04;

type ColorPreset = "blue" | "green" | "orange" | "red" | "purple";

const TAG_COLORS: Record<ColorPreset, { bg: string; border: string; text: string }> = {
  blue:   { bg: "#1e40afee", border: "#3b82f6", text: "#ffffff" },
  green:  { bg: "#166534ee", border: "#22c55e", text: "#ffffff" },
  orange: { bg: "#9a3412ee", border: "#f97316", text: "#ffffff" },
  red:    { bg: "#991b1bee", border: "#ef4444", text: "#ffffff" },
  purple: { bg: "#6b21a8ee", border: "#a855f7", text: "#ffffff" },
};

function createTextSprite(
  THREE: typeof import("three"),
  text: string,
  position: InstanceType<typeof THREE.Vector3>,
  scale = 0.25,
  color: ColorPreset = "blue"
): InstanceType<typeof THREE.Sprite> {
  const canvas = document.createElement("canvas");
  canvas.width = 512;
  canvas.height = 128;
  const ctx = canvas.getContext("2d")!;
  const c = TAG_COLORS[color];

  // Rounded rect background
  const r = 16;
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
  ctx.lineWidth = 4;
  ctx.stroke();

  // Text
  ctx.fillStyle = c.text;
  ctx.font = "bold 52px Arial";
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
  tagScale: number = 0.25
): InstanceType<typeof THREE.Group> {
  const group = new THREE.Group();
  group.name = `cota_${label}`;

  const lineMat = new THREE.LineBasicMaterial({ color: LINE_COLOR, linewidth: 2, depthTest: false });

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

  // Label sprite at midpoint
  const mid = s.clone().add(e).multiplyScalar(0.5).add(offsetDir.clone().multiplyScalar(0.06));
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
 * Do NOT apply additional position offsets after calling this.
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

  // Module world-space bounds
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

  // Scale tag size proportional to module — bigger for better visibility
  const baseTag = Math.max(0.3, Math.min(0.55, (W * sc) * 0.55));

  // Spacing multiplier to keep cotas well separated
  const sp = Math.max(0.15, front * 0.25);

  // ── Width (bottom, far front — row 1) ──
  group.add(createDimensionLine(
    THREE,
    new THREE.Vector3(left, bottom, front + sp),
    new THREE.Vector3(right, bottom, front + sp),
    `${W}mm`, forwardDir, 0.15, "blue", baseTag
  ));

  // ── Internal width (bottom, farther front — row 2) ──
  const iw = W - T * 2;
  if (iw > 0 && iw !== W) {
    group.add(createDimensionLine(
      THREE,
      new THREE.Vector3(left + T * sc, bottom, front + sp),
      new THREE.Vector3(right - T * sc, bottom, front + sp),
      `LI:${iw}mm`, forwardDir, 0.35, "green", baseTag * 0.9
    ));
  }

  // ── Thickness (bottom, farthest front — row 3) ──
  group.add(createDimensionLine(
    THREE,
    new THREE.Vector3(left, bottom, front + sp),
    new THREE.Vector3(left + T * sc, bottom, front + sp),
    `${T}mm`, forwardDir, 0.55, "purple", baseTag * 0.75
  ));

  // ── Height (left side, at front Z) ──
  group.add(createDimensionLine(
    THREE,
    new THREE.Vector3(left, bottom, front + sp * 0.5),
    new THREE.Vector3(left, top, front + sp * 0.5),
    `${H}mm`, leftDir, 0.15, "blue", baseTag
  ));

  // ── Depth (right side, bottom) ──
  group.add(createDimensionLine(
    THREE,
    new THREE.Vector3(right, bottom, 0),
    new THREE.Vector3(right, bottom, front),
    `${D}mm`, rightDir, 0.15, "blue", baseTag
  ));

  // ── Internal height (vão interno — farther left to avoid overlap with height) ──
  const ih = H - T * 2 - BH;
  if (ih > 0 && ih !== H) {
    group.add(createDimensionLine(
      THREE,
      new THREE.Vector3(left, fo + (BH + T) * sc, front + sp * 0.5),
      new THREE.Vector3(left, fo + (H - T) * sc, front + sp * 0.5),
      `VI:${ih}mm`, leftDir, 0.35, "green", baseTag * 0.9
    ));
  }

  // ── Baseboard height (far left — row 3) ──
  if (BH > 0) {
    group.add(createDimensionLine(
      THREE,
      new THREE.Vector3(left, fo, front + sp * 0.5),
      new THREE.Vector3(left, fo + BH * sc, front + sp * 0.5),
      `R:${BH}mm`, leftDir, 0.55, "orange", baseTag * 0.8
    ));
  }

  // ── Floor offset (farthest left — row 4) ──
  if (options?.floorOffset && options.floorOffset > 0) {
    group.add(createDimensionLine(
      THREE,
      new THREE.Vector3(left, 0, front + sp * 0.5),
      new THREE.Vector3(left, fo, front + sp * 0.5),
      `Piso:${options.floorOffset}mm`, leftDir, 0.75, "red", baseTag * 0.8
    ));
  }

  // ── Wall clearance ──
  if (options?.wall) {
    const wallHalfW = (options.wall.width * sc) / 2;
    const clearanceRight = Math.round(options.wall.width / 2 - W / 2);

    // Right side clearance (from last module or main module to wall edge)
    let lastRightEdge = right;
    // If duplicates exist, find the rightmost edge
    if (options?.duplicates && options.duplicates.length > 0) {
      options.duplicates.forEach((dup) => {
        const dupRight = (dup.positionX + dup.module.width / 2 - W / 2) * sc;
        if (dupRight > lastRightEdge) lastRightEdge = dupRight;
      });
    }

    const rightClearanceMm = Math.round((wallHalfW - lastRightEdge) / sc);
    if (rightClearanceMm > 0) {
      group.add(createDimensionLine(
        THREE,
        new THREE.Vector3(lastRightEdge, top + 0.05, 0),
        new THREE.Vector3(wallHalfW, top + 0.05, 0),
        `${rightClearanceMm}mm`, upDir, 0.1, "orange", baseTag * 0.8
      ));
    }

    // Left side clearance
    let firstLeftEdge = left;
    if (options?.duplicates && options.duplicates.length > 0) {
      options.duplicates.forEach((dup) => {
        const dupLeft = (dup.positionX - W / 2) * sc;
        if (dupLeft < firstLeftEdge) firstLeftEdge = dupLeft;
      });
    }

    const leftClearanceMm = Math.round((firstLeftEdge + wallHalfW) / sc);
    if (leftClearanceMm > 0) {
      group.add(createDimensionLine(
        THREE,
        new THREE.Vector3(-wallHalfW, top + 0.05, 0),
        new THREE.Vector3(firstLeftEdge, top + 0.05, 0),
        `${leftClearanceMm}mm`, upDir, 0.18, "orange", baseTag * 0.8
      ));
    }
  }

  // ── Duplicate distances (automatic distance between each module) ──
  if (options?.duplicates && options.duplicates.length > 0) {
    // Build list of all modules with their world-space X bounds
    interface ModuleBounds { leftX: number; rightX: number; label: string }
    const allModules: ModuleBounds[] = [
      { leftX: left, rightX: right, label: "Principal" }
    ];

    options.duplicates.forEach((dup, i) => {
      const dupCenterX = (dup.positionX + dup.module.width / 2 - W / 2) * sc;
      const dupHalfW = (dup.module.width * sc) / 2;
      allModules.push({
        leftX: dupCenterX - dupHalfW,
        rightX: dupCenterX + dupHalfW,
        label: `Dup${i + 1}`
      });
    });

    // Sort by leftX
    allModules.sort((a, b) => a.leftX - b.leftX);

    // Draw distance between consecutive modules
    for (let i = 0; i < allModules.length - 1; i++) {
      const gapStart = allModules[i].rightX;
      const gapEnd = allModules[i + 1].leftX;
      const gapMm = Math.round((gapEnd - gapStart) / sc);
      if (gapMm > 0) {
        group.add(createDimensionLine(
          THREE,
          new THREE.Vector3(gapStart, top + 0.08, front * 0.5),
          new THREE.Vector3(gapEnd, top + 0.08, front * 0.5),
          `${gapMm}mm`, upDir, 0.12, "red", baseTag * 0.85
        ));
      }
    }

    // Total span of all modules
    const totalLeft = allModules[0].leftX;
    const totalRight = allModules[allModules.length - 1].rightX;
    const totalMm = Math.round((totalRight - totalLeft) / sc);
    group.add(createDimensionLine(
      THREE,
      new THREE.Vector3(totalLeft, top + 0.15, front * 0.3),
      new THREE.Vector3(totalRight, top + 0.15, front * 0.3),
      `Total:${totalMm}mm`, upDir, 0.2, "purple", baseTag * 0.9
    ));
  }

  return group;
}
