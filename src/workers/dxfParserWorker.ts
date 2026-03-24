/**
 * Web Worker for DXF parsing — offloads heavy text parsing from main thread.
 * Posts back an array of DxfEntity objects.
 */

interface DxfEntity {
  type: string;
  color: number;
  vertices: Array<{ x: number; y: number; z: number }>;
  isClosed?: boolean;
}

function parseDxfEntities(dxfText: string): DxfEntity[] {
  const lines = dxfText.split(/\r?\n/).map((line) => line.trim());
  const entities: DxfEntity[] = [];
  let i = 0;
  let inEntities = false;

  while (i < lines.length) {
    if (lines[i] === "ENTITIES") { inEntities = true; i += 1; break; }
    i += 1;
  }
  if (!inEntities) return entities;

  let currentEntity: DxfEntity | null = null;

  while (i < lines.length - 1) {
    if (lines[i] === "ENDSEC") break;

    const code = Number.parseInt(lines[i], 10);
    const value = lines[i + 1];

    if (Number.isNaN(code) || value === undefined) { i += 1; continue; }

    if (code === 0) {
      if (currentEntity && currentEntity.vertices.length > 0) entities.push(currentEntity);

      const entityType = value.toUpperCase();
      if (["LINE", "POLYLINE", "LWPOLYLINE", "3DFACE", "SOLID", "CIRCLE", "ARC"].includes(entityType)) {
        currentEntity = { type: entityType, color: 7, vertices: [], isClosed: false };
      } else if (entityType === "SEQEND") {
        currentEntity = null;
      } else {
        currentEntity = null;
      }
      i += 2; continue;
    }

    if (!currentEntity) { i += 2; continue; }

    if (code === 62) currentEntity.color = Number.parseInt(value, 10) || 7;

    if (code === 70 && (currentEntity.type === "LWPOLYLINE" || currentEntity.type === "POLYLINE")) {
      currentEntity.isClosed = (Number.parseInt(value, 10) & 1) === 1;
    }

    if ([10, 11, 12, 13].includes(code)) {
      const x = Number.parseFloat(value);
      const yCode = code + 10;
      const zCode = code + 20;
      let y = 0, z = 0;
      let j = i + 2;
      if (j < lines.length - 1 && Number.parseInt(lines[j], 10) === yCode) { y = Number.parseFloat(lines[j + 1]); j += 2; }
      if (j < lines.length - 1 && Number.parseInt(lines[j], 10) === zCode) { z = Number.parseFloat(lines[j + 1]); }
      currentEntity.vertices.push({ x, y, z });
    }

    i += 2;
  }

  if (currentEntity && currentEntity.vertices.length > 0) entities.push(currentEntity);
  return entities;
}

// Worker message handler
self.onmessage = (event: MessageEvent<{ dxfText: string }>) => {
  try {
    const entities = parseDxfEntities(event.data.dxfText);
    self.postMessage({ success: true, entities });
  } catch (error: any) {
    self.postMessage({ success: false, error: error.message });
  }
};
