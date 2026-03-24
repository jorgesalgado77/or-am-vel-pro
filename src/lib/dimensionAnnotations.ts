/**
 * Gerador de Cotas/Dimensões 3D — OrçaMóvel Pro
 * Adiciona linhas de cota com valores ao visualizador 3D.
 * Annotations are built in WORLD SPACE (module centered at X=0, base at Y=floorOffset, back at Z=0).
 */

const LINE_COLOR = 0x0066cc;
const TICK_SIZE = 0.03;

function createTextSprite(
  THREE: typeof import("three"),
  text: string,
  position: InstanceType<typeof THREE.Vector3>,
  scale = 0.18
): InstanceType<typeof THREE.Sprite> {
  const canvas = document.createElement("canvas");
  canvas.width = 512;
  canvas.height = 128;
  const ctx = canvas.getContext("2d")!;

  // Background
  ctx.fillStyle = "#ffffffee";
  ctx.fillRect(0, 0, 512, 128);
  ctx.strokeStyle = "#0066cc";
  ctx.lineWidth = 3;
  ctx.strokeRect(2, 2, 508, 124);

  // Text
  ctx.fillStyle = "#222222";
  ctx.font = "bold 48px Arial";
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
  offsetDist: number = 0.08
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
  const tickDir = new THREE.Vector3().crossVectors(
    e.clone().sub(s).normalize(),
    offsetDir
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

  // Label sprite at midpoint
  const mid = s.clone().add(e).multiplyScalar(0.5).add(offsetDir.clone().multiplyScalar(0.04));
  const sprite = createTextSprite(THREE, label, mid, 0.12);
  group.add(sprite);

  return group;
}

export interface DimensionOptions {
  wall?: { width: number; height: number };
  floorOffset?: number;
  duplicates?: Array<{ positionX: number; module: { width: number } }>;
}

/**
 * Generates dimension annotations in WORLD SPACE.
 * Module is centered at X=0, base at Y=floorOffset, back at Z=0.
 * Do NOT apply additional position offsets after calling this.
 */
export function generateDimensionAnnotations(
  THREE: typeof import("three"),
  module: import("@/types/parametricModule").ParametricModule,
  options?: DimensionOptions
): InstanceType<typeof THREE.Group> {
  const group = new THREE.Group();
  group.name = "dimension_annotations";

  const sc = 0.01; // mm to scene units
  const { width: W, height: H, depth: D, thickness: T, baseboardHeight: BH = 0 } = module;
  const fo = (options?.floorOffset ?? 0) * sc;

  // Module world-space bounds (centered at X=0, base at Y=fo, back at Z=0)
  const halfW = (W * sc) / 2;
  const left = -halfW;
  const right = halfW;
  const top = fo + H * sc;
  const bottom = fo;
  const front = D * sc; // module extends in +Z from Z=0
  const back = 0;

  const upDir = new THREE.Vector3(0, 1, 0);
  const forwardDir = new THREE.Vector3(0, 0, 1);
  const leftDir = new THREE.Vector3(-1, 0, 0);
  const rightDir = new THREE.Vector3(1, 0, 0);

  // ── Width (bottom, front) ──
  group.add(createDimensionLine(
    THREE,
    new THREE.Vector3(left, bottom, front + 0.05),
    new THREE.Vector3(right, bottom, front + 0.05),
    `${W}mm`,
    forwardDir, 0.12
  ));

  // ── Height (left side) ──
  group.add(createDimensionLine(
    THREE,
    new THREE.Vector3(left - 0.05, bottom, front * 0.5),
    new THREE.Vector3(left - 0.05, top, front * 0.5),
    `${H}mm`,
    leftDir, 0.12
  ));

  // ── Depth (right side, bottom) ──
  group.add(createDimensionLine(
    THREE,
    new THREE.Vector3(right + 0.05, bottom, back),
    new THREE.Vector3(right + 0.05, bottom, front),
    `${D}mm`,
    rightDir, 0.12
  ));

  // ── Internal height (vão interno) ──
  const ih = H - T * 2 - BH;
  if (ih > 0 && ih !== H) {
    group.add(createDimensionLine(
      THREE,
      new THREE.Vector3(left - 0.05, fo + (BH + T) * sc, front * 0.3),
      new THREE.Vector3(left - 0.05, fo + (H - T) * sc, front * 0.3),
      `VI:${ih}mm`,
      leftDir, 0.25
    ));
  }

  // ── Internal width ──
  const iw = W - T * 2;
  if (iw > 0 && iw !== W) {
    group.add(createDimensionLine(
      THREE,
      new THREE.Vector3(left + T * sc, bottom - 0.02, front + 0.05),
      new THREE.Vector3(right - T * sc, bottom - 0.02, front + 0.05),
      `LI:${iw}mm`,
      forwardDir, 0.25
    ));
  }

  // ── Thickness ──
  group.add(createDimensionLine(
    THREE,
    new THREE.Vector3(left, bottom, front + 0.05),
    new THREE.Vector3(left + T * sc, bottom, front + 0.05),
    `${T}mm`,
    forwardDir, 0.35
  ));

  // ── Baseboard height ──
  if (BH > 0) {
    group.add(createDimensionLine(
      THREE,
      new THREE.Vector3(left - 0.05, fo, front * 0.7),
      new THREE.Vector3(left - 0.05, fo + BH * sc, front * 0.7),
      `R:${BH}mm`,
      leftDir, 0.35
    ));
  }

  // ── Floor offset (distance from grid/floor to module base) ──
  if (options?.floorOffset && options.floorOffset > 0) {
    group.add(createDimensionLine(
      THREE,
      new THREE.Vector3(left - 0.05, 0, front * 0.9),
      new THREE.Vector3(left - 0.05, fo, front * 0.9),
      `Piso:${options.floorOffset}mm`,
      leftDir, 0.4
    ));
  }

  // ── Wall clearance (clamped to wall dimensions) ──
  if (options?.wall) {
    const wallHalfW = (options.wall.width * sc) / 2;
    // Clearance on the right side of the module to the wall edge
    const clearanceRight = options.wall.width / 2 - W / 2;
    if (clearanceRight > 0) {
      group.add(createDimensionLine(
        THREE,
        new THREE.Vector3(right, top + 0.05, 0),
        new THREE.Vector3(wallHalfW, top + 0.05, 0),
        `${Math.round(clearanceRight)}mm`,
        upDir, 0.1
      ));
    }
    // Clearance on the left side
    const clearanceLeft = options.wall.width / 2 - W / 2;
    if (clearanceLeft > 0) {
      group.add(createDimensionLine(
        THREE,
        new THREE.Vector3(-wallHalfW, top + 0.05, 0),
        new THREE.Vector3(left, top + 0.05, 0),
        `${Math.round(clearanceLeft)}mm`,
        upDir, 0.18
      ));
    }
  }

  // ── Duplicate distances ──
  if (options?.duplicates && options.duplicates.length > 0) {
    let lastEndX = W;
    options.duplicates.forEach((dup) => {
      const gap = dup.positionX - lastEndX;
      if (gap > 0) {
        // Convert to world space (centered)
        const gapStartWorld = (lastEndX - W / 2) * sc;
        const gapEndWorld = (dup.positionX - W / 2) * sc;
        group.add(createDimensionLine(
          THREE,
          new THREE.Vector3(gapStartWorld, top + 0.05, front * 0.5),
          new THREE.Vector3(gapEndWorld, top + 0.05, front * 0.5),
          `${Math.round(gap)}mm`,
          upDir, 0.1
        ));
      }
      lastEndX = dup.positionX + dup.module.width;
    });
  }

  return group;
}
