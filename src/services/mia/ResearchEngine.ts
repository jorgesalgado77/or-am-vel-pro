/**
 * MIA Research Engine — Controlled external search via Perplexity.
 *
 * Provides structured web search with:
 * - Rate limiting per tenant/user
 * - In-memory result caching
 * - Query validation (blocks internal/irrelevant queries)
 * - Audit logging to mia_research_logs
 * - Fallback on failure (never breaks the flow)
 *
 * Uses the existing `perplexity-search` edge function.
 * Multi-tenant isolated. No direct internet access.
 */

import { supabase } from "@/lib/supabaseClient";
import { getMIALearningEngine } from "./MIALearningEngine";

// ── Types ───────────────────────────────────────────────────────

export interface ResearchSource {
  title: string;
  url: string;
  description?: string;
}

export interface ResearchResult {
  summary: string;
  sources: ResearchSource[];
  cached: boolean;
  query: string;
}

interface RateLimitEntry {
  count: number;
  resetAt: number;
}

interface CacheEntry {
  result: ResearchResult;
  timestamp: number;
}

// ── Constants ───────────────────────────────────────────────────

const LOG_TABLE = "mia_research_logs";
const CACHE_TTL = 15 * 60 * 1000; // 15 min
const RATE_LIMIT_WINDOW = 60 * 60 * 1000; // 1 hour
const MAX_REQUESTS_PER_USER_HOUR = 20;
const MAX_REQUESTS_PER_TENANT_HOUR = 100;
const MAX_QUERY_LENGTH = 300;
const MIN_QUERY_LENGTH = 3;

/** Keywords that indicate an internal question (no external search needed) */
const INTERNAL_KEYWORDS = [
  "meu cadastro", "minha conta", "meu perfil", "minha senha",
  "configuração do sistema", "como usar o sistema", "tutorial",
  "bug no sistema", "erro no sistema", "meu orçamento",
  "meus clientes", "minha equipe", "minhas tarefas",
];

/** Topics that should never be searched externally */
const BLOCKED_TOPICS = [
  "dados pessoais", "cpf", "rg", "senha", "password",
  "cartão de crédito", "número do cartão",
];

// ── Helpers ─────────────────────────────────────────────────────

function logTable() {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (supabase as any).from(LOG_TABLE);
}

// ── Engine ──────────────────────────────────────────────────────

class ResearchEngine {
  private cache = new Map<string, CacheEntry>();
  private userRateLimits = new Map<string, RateLimitEntry>();
  private tenantRateLimits = new Map<string, RateLimitEntry>();
  private logTableAvailable: boolean | null = null;

  // ── Public API ────────────────────────────────────────────────

  /**
   * Search the web via Perplexity with full validation, rate limiting, and caching.
   */
  async search(params: {
    query: string;
    tenantId: string;
    userId: string;
    context?: string;
  }): Promise<ResearchResult> {
    const { query, tenantId, userId, context } = params;

    // 1. Validate query
    const validation = this.validateQuery(query);
    if (!validation.valid) {
      return {
        summary: validation.reason || "Consulta inválida.",
        sources: [],
        cached: false,
        query,
      };
    }

    // 2. Check rate limits
    const rateLimitCheck = this.checkRateLimit(tenantId, userId);
    if (!rateLimitCheck.allowed) {
      return {
        summary: rateLimitCheck.reason || "Limite de pesquisas atingido. Tente novamente mais tarde.",
        sources: [],
        cached: false,
        query,
      };
    }

    // 3. Check cache
    const cacheKey = this.buildCacheKey(tenantId, query);
    const cached = this.getFromCache(cacheKey);
    if (cached) {
      return { ...cached, cached: true };
    }

    // 4. Execute search
    try {
      const result = await this.executeSearch(query, tenantId, context);

      // 5. Cache result
      this.setCache(cacheKey, result);

      // 6. Increment rate limit counters
      this.incrementRateLimit(tenantId, userId);

      // 7. Log search (non-blocking)
      void this.logSearch(tenantId, userId, query, result.summary);

      // 8. Register learning event (non-blocking)
      const learning = getMIALearningEngine();
      learning.registerEventAsync({
        tenant_id: tenantId,
        user_id: userId,
        event_type: "conversation",
        context: { type: "research", query, sourcesCount: result.sources.length },
        action_taken: "web_search",
        result: result.sources.length > 0 ? "success" : "no_results",
        score: result.sources.length > 0 ? 1 : 0,
      });

      return result;
    } catch (error) {
      console.warn("[ResearchEngine] Search failed:", error);
      return {
        summary: "Não foi possível realizar a pesquisa no momento. Tente novamente mais tarde.",
        sources: [],
        cached: false,
        query,
      };
    }
  }

  /**
   * Check if a query should trigger external research.
   */
  shouldSearch(message: string): boolean {
    if (!message || message.length < MIN_QUERY_LENGTH) return false;

    // Check for explicit research triggers
    const triggers = [
      "pesquise", "pesquisar", "busque", "buscar",
      "procure", "procurar", "o que é", "como funciona",
      "tendências", "tendência", "mercado", "dados de mercado",
      "estatísticas", "preço médio", "preço de mercado",
      "notícias", "novidades", "atualizado",
      "segundo a internet", "na internet", "pesquisa de mercado",
      "benchmark", "concorrência", "concorrentes",
    ];

    const lower = message.toLowerCase();

    // Block internal questions
    if (INTERNAL_KEYWORDS.some((kw) => lower.includes(kw))) return false;

    // Block sensitive topics
    if (BLOCKED_TOPICS.some((kw) => lower.includes(kw))) return false;

    return triggers.some((t) => lower.includes(t));
  }

  /**
   * Get remaining quota for a user.
   */
  getRemainingQuota(tenantId: string, userId: string): { user: number; tenant: number } {
    const userKey = `user:${tenantId}:${userId}`;
    const tenantKey = `tenant:${tenantId}`;
    const now = Date.now();

    const userEntry = this.userRateLimits.get(userKey);
    const tenantEntry = this.tenantRateLimits.get(tenantKey);

    const userRemaining = userEntry && now < userEntry.resetAt
      ? Math.max(0, MAX_REQUESTS_PER_USER_HOUR - userEntry.count)
      : MAX_REQUESTS_PER_USER_HOUR;

    const tenantRemaining = tenantEntry && now < tenantEntry.resetAt
      ? Math.max(0, MAX_REQUESTS_PER_TENANT_HOUR - tenantEntry.count)
      : MAX_REQUESTS_PER_TENANT_HOUR;

    return { user: userRemaining, tenant: tenantRemaining };
  }

  // ── Private ───────────────────────────────────────────────────

  private validateQuery(query: string): { valid: boolean; reason?: string } {
    if (!query || query.trim().length < MIN_QUERY_LENGTH) {
      return { valid: false, reason: "Consulta muito curta para pesquisa externa." };
    }
    if (query.length > MAX_QUERY_LENGTH) {
      return { valid: false, reason: "Consulta muito longa. Simplifique sua pergunta." };
    }

    const lower = query.toLowerCase();

    // Block sensitive topics
    if (BLOCKED_TOPICS.some((kw) => lower.includes(kw))) {
      return { valid: false, reason: "Esta consulta contém termos sensíveis e não pode ser pesquisada externamente." };
    }

    return { valid: true };
  }

  private checkRateLimit(tenantId: string, userId: string): { allowed: boolean; reason?: string } {
    const now = Date.now();
    const userKey = `user:${tenantId}:${userId}`;
    const tenantKey = `tenant:${tenantId}`;

    // User limit
    const userEntry = this.userRateLimits.get(userKey);
    if (userEntry) {
      if (now >= userEntry.resetAt) {
        this.userRateLimits.delete(userKey);
      } else if (userEntry.count >= MAX_REQUESTS_PER_USER_HOUR) {
        return { allowed: false, reason: `Limite de ${MAX_REQUESTS_PER_USER_HOUR} pesquisas por hora atingido.` };
      }
    }

    // Tenant limit
    const tenantEntry = this.tenantRateLimits.get(tenantKey);
    if (tenantEntry) {
      if (now >= tenantEntry.resetAt) {
        this.tenantRateLimits.delete(tenantKey);
      } else if (tenantEntry.count >= MAX_REQUESTS_PER_TENANT_HOUR) {
        return { allowed: false, reason: "Limite de pesquisas da sua empresa atingido. Tente mais tarde." };
      }
    }

    return { allowed: true };
  }

  private incrementRateLimit(tenantId: string, userId: string): void {
    const now = Date.now();
    const resetAt = now + RATE_LIMIT_WINDOW;

    const userKey = `user:${tenantId}:${userId}`;
    const userEntry = this.userRateLimits.get(userKey);
    if (userEntry && now < userEntry.resetAt) {
      userEntry.count++;
    } else {
      this.userRateLimits.set(userKey, { count: 1, resetAt });
    }

    const tenantKey = `tenant:${tenantId}`;
    const tenantEntry = this.tenantRateLimits.get(tenantKey);
    if (tenantEntry && now < tenantEntry.resetAt) {
      tenantEntry.count++;
    } else {
      this.tenantRateLimits.set(tenantKey, { count: 1, resetAt });
    }
  }

  private async executeSearch(query: string, tenantId: string, context?: string): Promise<ResearchResult> {
    const searchContext = context
      ? `${context}. Responda com dados atualizados e fontes confiáveis.`
      : "Responda com dados atualizados e fontes confiáveis. Contexto: vendas de móveis planejados no Brasil.";

    const { data, error } = await supabase.functions.invoke("perplexity-search", {
      body: {
        query,
        context: searchContext,
        tenant_id: tenantId,
        search_recency_filter: "month",
      },
    });

    if (error) {
      throw new Error(`Perplexity search error: ${error.message}`);
    }

    if (!data?.content) {
      return { summary: "Nenhum resultado encontrado para esta pesquisa.", sources: [], cached: false, query };
    }

    // Parse citations into structured sources
    const sources: ResearchSource[] = [];
    if (Array.isArray(data.citations)) {
      for (const citation of data.citations.slice(0, 5)) {
        if (typeof citation === "string" && citation.startsWith("http")) {
          sources.push({
            title: this.extractDomain(citation),
            url: citation,
          });
        } else if (typeof citation === "object" && citation !== null) {
          const c = citation as Record<string, string>;
          sources.push({
            title: c.title || this.extractDomain(c.url || ""),
            url: c.url || "",
            description: c.snippet || undefined,
          });
        }
      }
    }

    return {
      summary: String(data.content).slice(0, 2000),
      sources,
      cached: false,
      query,
    };
  }

  private extractDomain(url: string): string {
    try {
      return new URL(url).hostname.replace("www.", "");
    } catch {
      return url.slice(0, 40);
    }
  }

  // ── Cache ─────────────────────────────────────────────────────

  private buildCacheKey(tenantId: string, query: string): string {
    return `${tenantId}:${query.toLowerCase().trim()}`;
  }

  private getFromCache(key: string): ResearchResult | null {
    const entry = this.cache.get(key);
    if (entry && Date.now() - entry.timestamp < CACHE_TTL) {
      return entry.result;
    }
    this.cache.delete(key);
    return null;
  }

  private setCache(key: string, result: ResearchResult): void {
    // Limit cache size
    if (this.cache.size > 200) {
      const oldest = this.cache.keys().next().value;
      if (oldest) this.cache.delete(oldest);
    }
    this.cache.set(key, { result, timestamp: Date.now() });
  }

  // ── Logging ───────────────────────────────────────────────────

  private async checkLogTable(): Promise<boolean> {
    if (this.logTableAvailable !== null) return this.logTableAvailable;
    try {
      const { error } = await logTable().select("id").limit(1);
      this.logTableAvailable = !error;
    } catch {
      this.logTableAvailable = false;
    }
    return this.logTableAvailable;
  }

  private async logSearch(tenantId: string, userId: string, query: string, resultSummary: string): Promise<void> {
    if (!(await this.checkLogTable())) return;
    try {
      await logTable().insert({
        tenant_id: tenantId,
        user_id: userId,
        query: query.slice(0, 300),
        result_summary: resultSummary.slice(0, 500),
      });
    } catch {
      // Logging failure is non-critical
    }
  }
}

// ── Singleton ───────────────────────────────────────────────────

let instance: ResearchEngine | null = null;

export function getResearchEngine(): ResearchEngine {
  if (!instance) {
    instance = new ResearchEngine();
  }
  return instance;
}

export { ResearchEngine };
