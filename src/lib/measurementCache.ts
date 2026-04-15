/**
 * In-memory cache for measurement detail modal data.
 * Caches tenant usuarios/cargos (60s TTL) and PDF thumbnails (indefinite).
 */

interface CachedTenantData {
  users: any[];
  cargos: any[];
  timestamp: number;
  tenantId: string;
}

const TENANT_CACHE_TTL = 60_000; // 60s
let tenantCache: CachedTenantData | null = null;

export function getCachedTenantData(tenantId: string): { users: any[]; cargos: any[] } | null {
  if (!tenantCache) return null;
  if (tenantCache.tenantId !== tenantId) return null;
  if (Date.now() - tenantCache.timestamp > TENANT_CACHE_TTL) return null;
  return { users: tenantCache.users, cargos: tenantCache.cargos };
}

export function setCachedTenantData(tenantId: string, users: any[], cargos: any[]) {
  tenantCache = { users, cargos, timestamp: Date.now(), tenantId };
}

// PDF thumbnail cache: url -> dataURL
const pdfThumbnailCache = new Map<string, string>();

export function getCachedPdfThumbnail(url: string): string | null {
  return pdfThumbnailCache.get(url) ?? null;
}

export function setCachedPdfThumbnail(url: string, dataUrl: string) {
  pdfThumbnailCache.set(url, dataUrl);
  // Limit cache size
  if (pdfThumbnailCache.size > 200) {
    const firstKey = pdfThumbnailCache.keys().next().value;
    if (firstKey) pdfThumbnailCache.delete(firstKey);
  }
}

// Client record cache: clientId -> data (30s TTL)
const clientCache = new Map<string, { data: any; timestamp: number }>();
const CLIENT_CACHE_TTL = 30_000;

export function getCachedClient(clientId: string): any | null {
  const entry = clientCache.get(clientId);
  if (!entry) return null;
  if (Date.now() - entry.timestamp > CLIENT_CACHE_TTL) {
    clientCache.delete(clientId);
    return null;
  }
  return entry.data;
}

export function setCachedClient(clientId: string, data: any) {
  clientCache.set(clientId, { data, timestamp: Date.now() });
}
