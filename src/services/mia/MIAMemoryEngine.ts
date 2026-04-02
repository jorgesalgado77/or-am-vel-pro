/**
 * MIA Memory Engine — Structured memory per tenant + user
 * 
 * Phase 3: Supabase-backed persistence with in-memory cache.
 * Requires table `mia_memory` in external Supabase.
 * 
 * RULES:
 * - tenant_id + user_id isolation ALWAYS enforced
 * - Limited payload (max 20 entries per context query)
 * - Relevance-ordered retrieval
 * - Graceful fallback if table doesn't exist yet
 */

import { supabase } from "@/lib/supabaseClient";
import type { MIAContextType } from "./types";

// ── Types ───────────────────────────────────────────────────────

export type MIAMemoryType =
  | "user_preference"
  | "conversation_context"
  | "business_context"
  | "system_learning";

export interface MIAMemoryEntry {
  id?: string;
  tenant_id: string;
  user_id: string;
  memory_type: MIAMemoryType;
  key: string;
  value: Record<string, unknown>;
  relevance_score: number;
  created_at?: string;
  updated_at?: string;
}

// ── Constants ───────────────────────────────────────────────────

const TABLE = "mia_memory";
const MAX_ENTRIES_PER_QUERY = 20;
const CACHE_TTL = 5 * 60 * 1000; // 5 min cache

// ── Cache ───────────────────────────────────────────────────────

interface CacheEntry {
  data: MIAMemoryEntry[];
  timestamp: number;
}

class MIAMemoryEngine {
  private cache = new Map<string, CacheEntry>();
  private tableAvailable: boolean | null = null;

  // ── Cache helpers ─────────────────────────────────────────────

  private cacheKey(tenantId: string, userId: string, memoryType?: MIAMemoryType): string {
    return `${tenantId}:${userId}:${memoryType || "all"}`;
  }

  private getCached(key: string): MIAMemoryEntry[] | null {
    const entry = this.cache.get(key);
    if (entry && Date.now() - entry.timestamp < CACHE_TTL) {
      return entry.data;
    }
    this.cache.delete(key);
    return null;
  }

  private setCache(key: string, data: MIAMemoryEntry[]): void {
    this.cache.set(key, { data, timestamp: Date.now() });
  }

  private invalidateCache(tenantId: string, userId: string): void {
    for (const key of this.cache.keys()) {
      if (key.startsWith(`${tenantId}:${userId}:`)) {
        this.cache.delete(key);
      }
    }
  }

  // ── Table check ───────────────────────────────────────────────

  private async checkTable(): Promise<boolean> {
    if (this.tableAvailable !== null) return this.tableAvailable;
    try {
      const { error } = await supabase
        .from(TABLE)
        .select("id")
        .limit(1);
      this.tableAvailable = !error;
      if (error) {
        console.warn("[MIAMemory] Table not available yet:", error.message);
      }
    } catch {
      this.tableAvailable = false;
    }
    return this.tableAvailable;
  }

  // ── Public API ────────────────────────────────────────────────

  /**
   * Save or update a memory entry (upsert on tenant+user+key).
   */
  async saveMemory(entry: Omit<MIAMemoryEntry, "id" | "created_at" | "updated_at">): Promise<boolean> {
    if (!entry.tenant_id || !entry.user_id) {
      console.error("[MIAMemory] tenant_id and user_id are required");
      return false;
    }

    if (!(await this.checkTable())) return false;

    try {
      const { error } = await supabase
        .from(TABLE)
        .upsert(
          {
            tenant_id: entry.tenant_id,
            user_id: entry.user_id,
            memory_type: entry.memory_type,
            key: entry.key,
            value: entry.value,
            relevance_score: entry.relevance_score,
          },
          { onConflict: "tenant_id,user_id,key" }
        );

      if (error) {
        console.warn("[MIAMemory] Save error:", error.message);
        return false;
      }

      this.invalidateCache(entry.tenant_id, entry.user_id);
      return true;
    } catch (e) {
      console.warn("[MIAMemory] Save exception:", e);
      return false;
    }
  }

  /**
   * Retrieve memories for a tenant+user, optionally filtered by type.
   * Returns up to MAX_ENTRIES_PER_QUERY, ordered by relevance.
   */
  async getMemory(params: {
    tenant_id: string;
    user_id: string;
    memory_type?: MIAMemoryType;
    limit?: number;
  }): Promise<MIAMemoryEntry[]> {
    if (!params.tenant_id || !params.user_id) return [];

    const ck = this.cacheKey(params.tenant_id, params.user_id, params.memory_type);
    const cached = this.getCached(ck);
    if (cached) return cached;

    if (!(await this.checkTable())) return [];

    try {
      let query = supabase
        .from(TABLE)
        .select("*")
        .eq("tenant_id", params.tenant_id)
        .eq("user_id", params.user_id)
        .order("relevance_score", { ascending: false })
        .limit(params.limit || MAX_ENTRIES_PER_QUERY);

      if (params.memory_type) {
        query = query.eq("memory_type", params.memory_type);
      }

      const { data, error } = await query;

      if (error) {
        console.warn("[MIAMemory] Get error:", error.message);
        return [];
      }

      const entries = (data || []) as MIAMemoryEntry[];
      this.setCache(ck, entries);
      return entries;
    } catch {
      return [];
    }
  }

  /**
   * Update relevance score or value of an existing memory.
   */
  async updateMemory(params: {
    tenant_id: string;
    user_id: string;
    key: string;
    value?: Record<string, unknown>;
    relevance_score?: number;
  }): Promise<boolean> {
    if (!params.tenant_id || !params.user_id || !params.key) return false;
    if (!(await this.checkTable())) return false;

    try {
      const updates: Record<string, unknown> = {};
      if (params.value !== undefined) updates.value = params.value;
      if (params.relevance_score !== undefined) updates.relevance_score = params.relevance_score;

      if (Object.keys(updates).length === 0) return false;

      const { error } = await supabase
        .from(TABLE)
        .update(updates)
        .eq("tenant_id", params.tenant_id)
        .eq("user_id", params.user_id)
        .eq("key", params.key);

      if (error) {
        console.warn("[MIAMemory] Update error:", error.message);
        return false;
      }

      this.invalidateCache(params.tenant_id, params.user_id);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Delete a specific memory entry.
   */
  async deleteMemory(params: {
    tenant_id: string;
    user_id: string;
    key: string;
  }): Promise<boolean> {
    if (!params.tenant_id || !params.user_id || !params.key) return false;
    if (!(await this.checkTable())) return false;

    try {
      const { error } = await supabase
        .from(TABLE)
        .delete()
        .eq("tenant_id", params.tenant_id)
        .eq("user_id", params.user_id)
        .eq("key", params.key);

      if (error) {
        console.warn("[MIAMemory] Delete error:", error.message);
        return false;
      }

      this.invalidateCache(params.tenant_id, params.user_id);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Clear all memories for a tenant+user.
   */
  async clearMemory(tenantId: string, userId: string): Promise<boolean> {
    if (!tenantId || !userId) return false;
    if (!(await this.checkTable())) return false;

    try {
      const { error } = await supabase
        .from(TABLE)
        .delete()
        .eq("tenant_id", tenantId)
        .eq("user_id", userId);

      if (error) {
        console.warn("[MIAMemory] Clear error:", error.message);
        return false;
      }

      this.invalidateCache(tenantId, userId);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Build a context string from memories for prompt injection.
   * Used by ContextBuilder and Orchestrator to enrich AI prompts.
   */
  async buildContextString(
    tenantId: string,
    userId: string,
    _context: MIAContextType
  ): Promise<string> {
    const memories = await this.getMemory({
      tenant_id: tenantId,
      user_id: userId,
      limit: 15,
    });

    if (memories.length === 0) return "";

    const sections: Record<string, string[]> = {};

    for (const m of memories) {
      const section = m.memory_type || "general";
      if (!sections[section]) sections[section] = [];
      const val = typeof m.value === "string" ? m.value : JSON.stringify(m.value);
      sections[section].push(`• ${m.key}: ${val}`);
    }

    const parts = ["\n=== MEMÓRIA MIA (contexto persistente) ==="];
    for (const [section, items] of Object.entries(sections)) {
      parts.push(`\n[${section}]`);
      parts.push(...items);
    }

    return parts.join("\n");
  }

  /**
   * Convenience: remember an interaction (auto-categorized).
   */
  async remember(
    tenantId: string,
    userId: string,
    _context: MIAContextType,
    key: string,
    value: Record<string, unknown>
  ): Promise<void> {
    await this.saveMemory({
      tenant_id: tenantId,
      user_id: userId,
      memory_type: "conversation_context",
      key,
      value,
      relevance_score: 0.5,
    });
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
