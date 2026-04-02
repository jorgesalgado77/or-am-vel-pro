/**
 * MIA Memory Engine — Structured memory per tenant + user
 * Uses IndexedDB for persistence, with in-memory fallback.
 */

import type { MIAContextType, MIAMemoryEntry } from "./types";

const DB_NAME = "mia_memory";
const DB_VERSION = 1;
const STORE_NAME = "entries";
const MAX_ENTRIES_PER_CONTEXT = 100;
const MEMORY_TTL = 7 * 24 * 60 * 60 * 1000; // 7 days

class MIAMemoryEngine {
  private cache = new Map<string, MIAMemoryEntry[]>();
  private db: IDBDatabase | null = null;
  private dbReady: Promise<void>;

  constructor() {
    this.dbReady = this.initDB();
  }

  private async initDB(): Promise<void> {
    if (typeof indexedDB === "undefined") return;
    return new Promise((resolve) => {
      try {
        const request = indexedDB.open(DB_NAME, DB_VERSION);
        request.onupgradeneeded = () => {
          const db = request.result;
          if (!db.objectStoreNames.contains(STORE_NAME)) {
            const store = db.createObjectStore(STORE_NAME, { keyPath: "id", autoIncrement: true });
            store.createIndex("tenant_user_context", ["tenantId", "userId", "context"]);
            store.createIndex("timestamp", "timestamp");
          }
        };
        request.onsuccess = () => {
          this.db = request.result;
          resolve();
        };
        request.onerror = () => {
          console.warn("[MIAMemory] IndexedDB unavailable, using in-memory only");
          resolve();
        };
      } catch {
        resolve();
      }
    });
  }

  private cacheKey(tenantId: string, userId: string, context: MIAContextType): string {
    return `${tenantId}:${userId}:${context}`;
  }

  /** Store a memory entry */
  async remember(
    tenantId: string,
    userId: string,
    context: MIAContextType,
    key: string,
    value: unknown
  ): Promise<void> {
    const entry: MIAMemoryEntry = {
      tenantId,
      userId,
      context,
      key,
      value,
      timestamp: Date.now(),
    };

    // In-memory cache
    const ck = this.cacheKey(tenantId, userId, context);
    const existing = this.cache.get(ck) || [];
    // Replace if same key exists
    const idx = existing.findIndex((e) => e.key === key);
    if (idx >= 0) {
      existing[idx] = entry;
    } else {
      existing.push(entry);
      // Trim oldest
      if (existing.length > MAX_ENTRIES_PER_CONTEXT) {
        existing.shift();
      }
    }
    this.cache.set(ck, existing);

    // Persist to IndexedDB
    await this.dbReady;
    if (this.db) {
      try {
        const tx = this.db.transaction(STORE_NAME, "readwrite");
        tx.objectStore(STORE_NAME).add(entry);
      } catch (e) {
        console.warn("[MIAMemory] Persist error:", e);
      }
    }
  }

  /** Recall memories for a specific context */
  async recall(
    tenantId: string,
    userId: string,
    context: MIAContextType
  ): Promise<MIAMemoryEntry[]> {
    const ck = this.cacheKey(tenantId, userId, context);
    const cached = this.cache.get(ck);
    if (cached && cached.length > 0) {
      return cached.filter((e) => Date.now() - e.timestamp < MEMORY_TTL);
    }

    // Try IndexedDB
    await this.dbReady;
    if (!this.db) return [];

    return new Promise((resolve) => {
      try {
        const tx = this.db!.transaction(STORE_NAME, "readonly");
        const index = tx.objectStore(STORE_NAME).index("tenant_user_context");
        const request = index.getAll([tenantId, userId, context]);
        request.onsuccess = () => {
          const results = (request.result || []).filter(
            (e: MIAMemoryEntry) => Date.now() - e.timestamp < MEMORY_TTL
          );
          this.cache.set(ck, results);
          resolve(results);
        };
        request.onerror = () => resolve([]);
      } catch {
        resolve([]);
      }
    });
  }

  /** Build a context string from memories for prompt injection */
  async buildContextString(
    tenantId: string,
    userId: string,
    context: MIAContextType
  ): Promise<string> {
    const memories = await this.recall(tenantId, userId, context);
    if (memories.length === 0) return "";

    const parts = ["\n=== MEMÓRIA MIA (contexto persistente) ==="];
    for (const m of memories.slice(-20)) {
      const val = typeof m.value === "string" ? m.value : JSON.stringify(m.value);
      parts.push(`• ${m.key}: ${val}`);
    }
    return parts.join("\n");
  }

  /** Clear all memories for a tenant+user */
  async forget(tenantId: string, userId: string): Promise<void> {
    // Clear cache
    for (const key of this.cache.keys()) {
      if (key.startsWith(`${tenantId}:${userId}:`)) {
        this.cache.delete(key);
      }
    }

    // Clear IndexedDB
    await this.dbReady;
    if (!this.db) return;

    // We'd need a cursor-based delete; for simplicity, clear matching entries
    try {
      const tx = this.db.transaction(STORE_NAME, "readwrite");
      const store = tx.objectStore(STORE_NAME);
      const request = store.openCursor();
      request.onsuccess = () => {
        const cursor = request.result;
        if (cursor) {
          const entry = cursor.value as MIAMemoryEntry;
          if (entry.tenantId === tenantId && entry.userId === userId) {
            cursor.delete();
          }
          cursor.continue();
        }
      };
    } catch (e) {
      console.warn("[MIAMemory] Clear error:", e);
    }
  }
}

// Singleton
let instance: MIAMemoryEngine | null = null;

export function getMIAMemoryEngine(): MIAMemoryEngine {
  if (!instance) {
    instance = new MIAMemoryEngine();
  }
  return instance;
}

export { MIAMemoryEngine };
