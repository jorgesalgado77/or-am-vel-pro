/**
 * MIA Learning Engine — Continuous learning from real system interactions.
 *
 * Records events from all MIA interactions (conversations, actions, sales),
 * analyzes patterns per tenant/user, and generates actionable insights.
 *
 * Data flows:
 *   MIAOrchestrator → registerEvent() → mia_learning_events
 *   analyzePatterns() → aggregates from mia_learning_events
 *   getInsights() → human-readable recommendations
 *
 * RULES:
 * - Always isolated by tenant_id + user_id
 * - Never blocks UI (fire-and-forget writes)
 * - Uses in-memory cache for reads
 * - No `any` types
 */

import { supabase } from "@/lib/supabaseClient";

// ── Types ───────────────────────────────────────────────────────

export type MIALearningEventType =
  | "conversation"
  | "action_execution"
  | "sale_result"
  | "user_feedback"
  | "strategy_applied"
  | "followup_result";

export type MIALearningScore = -1 | 0 | 1;

export interface MIALearningEvent {
  tenant_id: string;
  user_id: string;
  event_type: MIALearningEventType;
  context: Record<string, unknown>;
  action_taken: string;
  result: string;
  score: MIALearningScore;
}

export interface MIAPatternInsight {
  type: string;
  description: string;
  confidence: number;
  sample_size: number;
  data: Record<string, unknown>;
}

// ── Constants ───────────────────────────────────────────────────

const TABLE = "mia_learning_events";
const MAX_EVENTS_PER_QUERY = 500;
const INSIGHTS_CACHE_TTL = 10 * 60 * 1000; // 10 min

// ── Helpers ─────────────────────────────────────────────────────

function learningTable() {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (supabase as any).from(TABLE);
}

// ── Cache ───────────────────────────────────────────────────────

interface CachedInsights {
  data: MIAPatternInsight[];
  timestamp: number;
}

// ── Engine ──────────────────────────────────────────────────────

class MIALearningEngine {
  private tableAvailable: boolean | null = null;
  private insightsCache = new Map<string, CachedInsights>();

  private async checkTable(): Promise<boolean> {
    if (this.tableAvailable !== null) return this.tableAvailable;
    try {
      const { error } = await learningTable().select("id").limit(1);
      this.tableAvailable = !error;
      if (error) {
        console.warn("[MIALearning] Table not available:", error.message);
      }
    } catch {
      this.tableAvailable = false;
    }
    return this.tableAvailable;
  }

  // ── Public API ────────────────────────────────────────────────

  /**
   * Register a learning event. Fire-and-forget.
   */
  async registerEvent(event: MIALearningEvent): Promise<boolean> {
    if (!event.tenant_id || !event.user_id) {
      console.error("[MIALearning] tenant_id and user_id required");
      return false;
    }
    if (!(await this.checkTable())) return false;

    try {
      const { error } = await learningTable().insert({
        tenant_id: event.tenant_id,
        user_id: event.user_id,
        event_type: event.event_type,
        context: event.context,
        action_taken: event.action_taken,
        result: event.result,
        score: event.score,
      });

      if (error) {
        console.warn("[MIALearning] Insert error:", error.message);
        return false;
      }

      // Invalidate cache for this tenant+user
      this.invalidateCache(event.tenant_id, event.user_id);
      return true;
    } catch (e) {
      console.warn("[MIALearning] Insert exception:", e);
      return false;
    }
  }

  /**
   * Register event without blocking — fire and forget.
   */
  registerEventAsync(event: MIALearningEvent): void {
    void this.registerEvent(event);
  }

  /**
   * Analyze patterns for a tenant. Returns aggregated data.
   */
  async analyzePatterns(
    tenantId: string,
    userId?: string,
    days = 90
  ): Promise<{
    total_events: number;
    by_type: Record<string, { count: number; avg_score: number }>;
    by_action: Record<string, { count: number; avg_score: number; success_rate: number }>;
    top_strategies: Array<{ action: string; success_rate: number; count: number }>;
  }> {
    if (!(await this.checkTable())) {
      return { total_events: 0, by_type: {}, by_action: {}, top_strategies: [] };
    }

    const events = await this.fetchEvents(tenantId, userId, days);

    // Group by event_type
    const byType: Record<string, { count: number; totalScore: number }> = {};
    for (const e of events) {
      if (!byType[e.event_type]) byType[e.event_type] = { count: 0, totalScore: 0 };
      byType[e.event_type].count++;
      byType[e.event_type].totalScore += e.score;
    }

    // Group by action_taken
    const byAction: Record<string, { count: number; totalScore: number; successes: number }> = {};
    for (const e of events) {
      const key = e.action_taken || "unknown";
      if (!byAction[key]) byAction[key] = { count: 0, totalScore: 0, successes: 0 };
      byAction[key].count++;
      byAction[key].totalScore += e.score;
      if (e.score > 0) byAction[key].successes++;
    }

    // Format results
    const byTypeFormatted: Record<string, { count: number; avg_score: number }> = {};
    for (const [k, v] of Object.entries(byType)) {
      byTypeFormatted[k] = { count: v.count, avg_score: v.count > 0 ? v.totalScore / v.count : 0 };
    }

    const byActionFormatted: Record<string, { count: number; avg_score: number; success_rate: number }> = {};
    for (const [k, v] of Object.entries(byAction)) {
      byActionFormatted[k] = {
        count: v.count,
        avg_score: v.count > 0 ? v.totalScore / v.count : 0,
        success_rate: v.count > 0 ? v.successes / v.count : 0,
      };
    }

    // Top strategies (actions with best success rates, min 3 samples)
    const topStrategies = Object.entries(byAction)
      .filter(([, v]) => v.count >= 3)
      .map(([action, v]) => ({
        action,
        success_rate: v.count > 0 ? v.successes / v.count : 0,
        count: v.count,
      }))
      .sort((a, b) => b.success_rate - a.success_rate)
      .slice(0, 10);

    return {
      total_events: events.length,
      by_type: byTypeFormatted,
      by_action: byActionFormatted,
      top_strategies: topStrategies,
    };
  }

  /**
   * Generate human-readable insights for a tenant+user.
   */
  async getInsights(tenantId: string, userId?: string): Promise<MIAPatternInsight[]> {
    const cacheKey = `${tenantId}:${userId || "all"}`;
    const cached = this.insightsCache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < INSIGHTS_CACHE_TTL) {
      return cached.data;
    }

    const patterns = await this.analyzePatterns(tenantId, userId);
    const insights: MIAPatternInsight[] = [];

    if (patterns.total_events < 5) {
      insights.push({
        type: "insufficient_data",
        description: "Dados insuficientes para gerar insights. Continue usando o sistema para acumular aprendizado.",
        confidence: 0,
        sample_size: patterns.total_events,
        data: {},
      });
      this.insightsCache.set(cacheKey, { data: insights, timestamp: Date.now() });
      return insights;
    }

    // Best performing strategies
    for (const strategy of patterns.top_strategies.slice(0, 3)) {
      if (strategy.success_rate >= 0.5) {
        insights.push({
          type: "top_strategy",
          description: `A ação "${strategy.action}" tem taxa de sucesso de ${(strategy.success_rate * 100).toFixed(0)}% (${strategy.count} amostras).`,
          confidence: Math.min(95, 40 + strategy.count * 3),
          sample_size: strategy.count,
          data: { action: strategy.action, success_rate: strategy.success_rate },
        });
      }
    }

    // Worst performing strategies (to avoid)
    const worstStrategies = Object.entries(patterns.by_action)
      .filter(([, v]) => v.count >= 5 && v.success_rate < 0.2)
      .sort((a, b) => a[1].success_rate - b[1].success_rate)
      .slice(0, 2);

    for (const [action, data] of worstStrategies) {
      insights.push({
        type: "avoid_strategy",
        description: `A ação "${action}" tem taxa de sucesso baixa (${(data.success_rate * 100).toFixed(0)}%). Considere abordagens alternativas.`,
        confidence: Math.min(90, 30 + data.count * 2),
        sample_size: data.count,
        data: { action, success_rate: data.success_rate },
      });
    }

    // Conversation vs action performance
    const convData = patterns.by_type["conversation"];
    const actionData = patterns.by_type["action_execution"];
    if (convData && actionData) {
      if (convData.avg_score > actionData.avg_score) {
        insights.push({
          type: "interaction_preference",
          description: "Interações conversacionais geram melhores resultados que ações automatizadas neste contexto.",
          confidence: 60,
          sample_size: convData.count + actionData.count,
          data: { conversation_score: convData.avg_score, action_score: actionData.avg_score },
        });
      }
    }

    // Sale result insights
    const saleData = patterns.by_type["sale_result"];
    if (saleData && saleData.count >= 5) {
      const saleRate = saleData.avg_score > 0 ? "positiva" : saleData.avg_score < 0 ? "negativa" : "neutra";
      insights.push({
        type: "sale_trend",
        description: `Tendência de vendas ${saleRate} (score médio: ${saleData.avg_score.toFixed(2)}) com ${saleData.count} registros.`,
        confidence: Math.min(85, 35 + saleData.count * 2),
        sample_size: saleData.count,
        data: { avg_score: saleData.avg_score },
      });
    }

    this.insightsCache.set(cacheKey, { data: insights, timestamp: Date.now() });
    return insights;
  }

  /**
   * Build a context string from insights for prompt injection.
   */
  async buildInsightsContext(tenantId: string, userId: string): Promise<string> {
    const insights = await this.getInsights(tenantId, userId);
    if (insights.length === 0 || (insights.length === 1 && insights[0].type === "insufficient_data")) {
      return "";
    }

    const lines = ["\n=== INSIGHTS DE APRENDIZADO ==="];
    for (const insight of insights) {
      if (insight.confidence >= 40) {
        lines.push(`• ${insight.description} (confiança: ${insight.confidence}%)`);
      }
    }
    return lines.join("\n");
  }

  // ── Private ───────────────────────────────────────────────────

  private async fetchEvents(
    tenantId: string,
    userId?: string,
    days = 90
  ): Promise<Array<{ event_type: string; action_taken: string; result: string; score: number }>> {
    const since = new Date();
    since.setDate(since.getDate() - days);

    let query = learningTable()
      .select("event_type, action_taken, result, score")
      .eq("tenant_id", tenantId)
      .gte("created_at", since.toISOString())
      .order("created_at", { ascending: false })
      .limit(MAX_EVENTS_PER_QUERY);

    if (userId) {
      query = query.eq("user_id", userId);
    }

    const { data, error } = await query;
    if (error) {
      console.warn("[MIALearning] Fetch error:", error.message);
      return [];
    }
    return (data || []) as Array<{ event_type: string; action_taken: string; result: string; score: number }>;
  }

  private invalidateCache(tenantId: string, userId: string): void {
    for (const key of this.insightsCache.keys()) {
      if (key.startsWith(`${tenantId}:`)) {
        this.insightsCache.delete(key);
      }
    }
    // Also invalidate the "all" key
    this.insightsCache.delete(`${tenantId}:all`);
  }
}

// ── Singleton ───────────────────────────────────────────────────

let instance: MIALearningEngine | null = null;

export function getMIALearningEngine(): MIALearningEngine {
  if (!instance) {
    instance = new MIALearningEngine();
  }
  return instance;
}

export { MIALearningEngine };
