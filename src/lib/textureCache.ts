/**
 * Global texture & material cache to prevent duplication across 3D scenes.
 * Uses a simple hash-based Map for in-memory dedup.
 */

const materialCache = new Map<string, any>();

/**
 * Generate a lightweight signature for a material based on its visual properties.
 */
function getMaterialSignature(material: any): string {
  if (!material) return "";
  const parts: string[] = [material.type || "unknown"];

  if (material.color) parts.push(`c:${material.color.getHexString()}`);
  if (material.metalness != null) parts.push(`m:${material.metalness.toFixed(2)}`);
  if (material.roughness != null) parts.push(`r:${material.roughness.toFixed(2)}`);
  if (material.map?.uuid) parts.push(`t:${material.map.uuid}`);
  if (material.normalMap?.uuid) parts.push(`n:${material.normalMap.uuid}`);
  if (material.opacity != null && material.opacity < 1) parts.push(`o:${material.opacity.toFixed(2)}`);

  return parts.join("|");
}

/**
 * Return a cached material if an identical one exists, otherwise cache and return the original.
 */
export function getCachedMaterial(material: any): any {
  if (!material) return material;
  if (Array.isArray(material)) return material.map(getCachedMaterial);

  const sig = getMaterialSignature(material);
  if (!sig) return material;

  const cached = materialCache.get(sig);
  if (cached) {
    // Dispose the duplicate
    material.dispose?.();
    return cached;
  }

  materialCache.set(sig, material);
  return material;
}

/**
 * Clear the cache (call on scene teardown to free memory).
 */
export function clearMaterialCache() {
  materialCache.clear();
}

/**
 * Get cache stats for debugging.
 */
export function getMaterialCacheStats() {
  return { size: materialCache.size };
}
