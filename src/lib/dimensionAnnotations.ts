/**
 * Gerador de Cotas/Dimensões 3D — OrçaMóvel Pro
 * Adiciona linhas de cota com valores ao visualizador 3D.
 */

const LABEL_COLOR = 0x333333;
const LINE_COLOR = 0x0066cc;
const TICK_SIZE = 0.03; // in scene units

function createTextSprite(
  THREE: typeof import("three"),
  text: string,
  position: InstanceType<typeof THREE.Vector3>,
  scale = 0.15
): InstanceType<typeof THREE.Sprite> {
  const canvas = document.createElement("canvas");
  canvas.width = 256;
  canvas.height = 64;
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, 256, 64);
  ctx.strokeStyle = "#0066cc";
  ctx.lineWidth = 2;
  ctx.strokeRect(2, 2, 252, 60);
  ctx.fillStyle = "#333333";
  ctx.font = "bold 28px Arial";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(text, 128, 32);

  const texture = new THREE.CanvasTexture(canvas);
  texture.needsUpdate = true;
  const mat = new THREE.SpriteMaterial({ map: texture, depthTest: false });
  const sprite = new THREE.Sprite(mat);
  sprite.position.copy(position);
  sprite.scale.set(scale * 4, scale, 1);
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
  group.add(new THREE.Line(geo, lineMat));

  // Extension lines (from point to offset)
  const ext1 = new THREE.BufferGeometry().setFromPoints([
    start.clone().add(offsetDir.clone().multiplyScalar(offsetDist * 0.3)),
    s.clone().add(offsetDir.clone().multiplyScalar(0.02))
  ]);
  group.add(new THREE.Line(ext1, lineMat));

  const ext2 = new THREE.BufferGeometry().setFromPoints([
    end.clone().add(offsetDir.clone().multiplyScalar(offsetDist * 0.3)),
    e.clone().add(offsetDir.clone().multiplyScalar(0.02))
  ]);
  group.add(new THREE.Line(ext2, lineMat));

  // Tick marks at ends
  const tickDir = new THREE.Vector3().crossVectors(
    e.clone().sub(s).normalize(),
    offsetDir
  ).normalize().multiplyScalar(TICK_SIZE);

  const tick1 = new THREE.BufferGeometry().setFromPoints([
    s.clone().add(tickDir), s.clone().sub(tickDir)
  ]);
  group.add(new THREE.Line(tick1, lineMat));

  const tick2 = new THREE.BufferGeometry().setFromPoints([
    e.clone().add(tickDir), e.clone().sub(tickDir)
  ]);
  group.add(new THREE.Line(tick2, lineMat));

  // Label sprite at midpoint
  const mid = s.clone().add(e).multiplyScalar(0.5).add(offsetDir.clone().multiplyScalar(0.04));
  const sprite = createTextSprite(THREE, label, mid, 0.08);
  group.add(sprite);

  return group;
}

export interface DimensionOptions {
  wall?: { width: number; height: number };
  floorOffset?: number;
  duplicates?: Array<{ positionX: number; module: { width: number } }>;
}

export function generateDimensionAnnotations(
  THREE: typeof import("three"),
  module: import("@/types/parametricModule").ParametricModule,
  options?: DimensionOptions
): InstanceType<typeof THREE.Group> {
  const group = new THREE.Group();
  group.name = "dimension_annotations";

  const s = 0.01; // mm to scene units
  const { width: W, height: H, depth: D, thickness: T, baseboardHeight: BH = 0 } = module;
  const fo = (options?.floorOffset ?? 0) * s;

  const right = new THREE.Vector3(1, 0, 0);
  const up = new THREE.Vector3(0, 1, 0);
  const forward = new THREE.Vector3(0, 0, 1);

  // Width dimension (bottom, front)
  group.add(createDimensionLine(
    THREE,
    new THREE.Vector3(0, fo, D * s + 0.05),
    new THREE.Vector3(W * s, fo, D * s + 0.05),
    `${W}mm`,
    forward, 0.12
  ));

  // Height dimension (left side)
  group.add(createDimensionLine(
    THREE,
    new THREE.Vector3(-0.05, fo, D * s * 0.5),
    new THREE.Vector3(-0.05, H * s + fo, D * s * 0.5),
    `${H}mm`,
    new THREE.Vector3(-1, 0, 0), 0.12
  ));

  // Depth dimension (bottom, right side)
  group.add(createDimensionLine(
    THREE,
    new THREE.Vector3(W * s + 0.05, fo, 0),
    new THREE.Vector3(W * s + 0.05, fo, D * s),
    `${D}mm`,
    right, 0.12
  ));

  // Internal height (vão interno)
  const ih = H - T * 2 - BH;
  if (ih > 0 && ih !== H) {
    group.add(createDimensionLine(
      THREE,
      new THREE.Vector3(-0.05, (BH + T) * s + fo, D * s * 0.3),
      new THREE.Vector3(-0.05, (H - T) * s + fo, D * s * 0.3),
      `VI:${ih}mm`,
      new THREE.Vector3(-1, 0, 0), 0.25
    ));
  }

  // Internal width
  const iw = W - T * 2;
  if (iw > 0 && iw !== W) {
    group.add(createDimensionLine(
      THREE,
      new THREE.Vector3(T * s, fo - 0.02, D * s + 0.05),
      new THREE.Vector3((W - T) * s, fo - 0.02, D * s + 0.05),
      `LI:${iw}mm`,
      forward, 0.25
    ));
  }

  // Thickness annotation
  group.add(createDimensionLine(
    THREE,
    new THREE.Vector3(0, fo, D * s + 0.05),
    new THREE.Vector3(T * s, fo, D * s + 0.05),
    `${T}mm`,
    forward, 0.35
  ));

  // Baseboard height
  if (BH > 0) {
    group.add(createDimensionLine(
      THREE,
      new THREE.Vector3(-0.05, fo, D * s * 0.7),
      new THREE.Vector3(-0.05, BH * s + fo, D * s * 0.7),
      `R:${BH}mm`,
      new THREE.Vector3(-1, 0, 0), 0.35
    ));
  }

  // Floor offset
  if (options?.floorOffset && options.floorOffset > 0) {
    group.add(createDimensionLine(
      THREE,
      new THREE.Vector3(-0.05, 0, D * s * 0.9),
      new THREE.Vector3(-0.05, fo, D * s * 0.9),
      `Piso:${options.floorOffset}mm`,
      new THREE.Vector3(-1, 0, 0), 0.4
    ));
  }

  // Wall clearance (if wall present)
  if (options?.wall) {
    const wallW = options.wall.width * s;
    const clearanceRight = options.wall.width - W;
    if (clearanceRight > 0) {
      group.add(createDimensionLine(
        THREE,
        new THREE.Vector3(W * s, fo + H * s + 0.05, 0),
        new THREE.Vector3(wallW, fo + H * s + 0.05, 0),
        `${clearanceRight}mm`,
        up, 0.1
      ));
    }
  }

  // Duplicate distances
  if (options?.duplicates && options.duplicates.length > 0) {
    let lastEndX = W;
    options.duplicates.forEach((dup, i) => {
      const gap = dup.positionX - lastEndX;
      if (gap > 0) {
        group.add(createDimensionLine(
          THREE,
          new THREE.Vector3(lastEndX * s, fo + H * s + 0.05, D * s * 0.5),
          new THREE.Vector3(dup.positionX * s, fo + H * s + 0.05, D * s * 0.5),
          `${gap}mm`,
          up, 0.1
        ));
      }
      lastEndX = dup.positionX + dup.module.width;
    });
  }

  // Center the annotations similarly to the module
  const box = new THREE.Box3().setFromObject(group);
  if (!box.isEmpty()) {
    const center = box.getCenter(new THREE.Vector3());
    // Don't recenter - keep aligned with the module positioning
  }

  return group;
}
