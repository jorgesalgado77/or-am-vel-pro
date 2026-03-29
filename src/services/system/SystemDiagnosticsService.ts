/**
 * SystemDiagnosticsService — Centralized diagnostics & monitoring.
 *
 * Consolidates login diagnostics, error logging, event tracking,
 * and AI interaction logging into a single typed service.
 *
 * Fire-and-forget with retry + fallback. Never blocks UI.
 */
import { supabase } from "@/lib/supabaseClient";
import { getTenantId, getUserId } from "@/lib/tenantState";

// ==================== TYPES ====================

export type DiagnosticResult =
  | "sucesso"
  | "falha_credencial"
  | "falha_tenant"
  | "falha_vinculo"
  | "falha_plano"
  | "falha_inativo"
  | "falha_email_nao_confirmado"
  | "falha_desconhecida";

export type SystemEventType =
  | "login"
  | "error"
  | "ai_interaction"
  | "performance"
  | "security"
  | "integration";

export interface LoginDiagnosticInput {
  email?: string;
  codigo_loja?: string;
  tenant_id?: string | null;
  usuario_id?: string | null;
  cargo_nome?: string | null;
  auth_user_id?: string | null;
  resultado: DiagnosticResult;
  detalhes?: Record<string, unknown>;
}

export interface ErrorLogInput {
  source: string;
  message: string;
  stack?: string;
  context?: Record<string, unknown>;
}

export interface EventLogInput {
  event_type: SystemEventType;
  source: string;
  message: string;
  metadata?: Record<string, unknown>;
}

export interface AIInteractionInput {
  model: string;
  action: string;
  tokens_used?: number;
  latency_ms?: number;
  success: boolean;
  error_message?: string;
  metadata?: Record<string, unknown>;
}

// ==================== RETRY HELPER ====================

const MAX_RETRIES = 2;
const RETRY_DELAY_MS = 1500;

async function withRetry<T>(
  fn: () => Promise<T>,
  retries = MAX_RETRIES,
): Promise<T | null> {
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      if (attempt === retries) {
        console.warn("[SystemDiagnostics] All retries exhausted:", err instanceof Error ? err.message : err);
        return null;
      }
      await new Promise(r => setTimeout(r, RETRY_DELAY_MS * (attempt + 1)));
    }
  }
  return null;
}

// ==================== RPC + FALLBACK INSERT ====================

interface RpcResult {
  error: { code?: string; message?: string } | null;
}

async function rpcWithFallback(
  rpcName: string,
  rpcPayload: Record<string, unknown>,
  tableName: string,
  insertPayload: Record<string, unknown>,
): Promise<void> {
  const { error } = (await (supabase as unknown as { rpc: (name: string, payload: Record<string, unknown>) => Promise<RpcResult> })
    .rpc(rpcName, rpcPayload)) as RpcResult;

  if (!error) return;

  const msg = String(error.message ?? "");
  const isMissingRpc =
    error.code === "PGRST202" ||
    msg.includes("schema cache") ||
    msg.includes("Could not find the function");

  if (isMissingRpc) {
    console.warn(`[SystemDiagnostics] RPC ${rpcName} not found; trying direct insert.`);
  }

  const { error: insertErr } = await (supabase as unknown as {
    from: (t: string) => { insert: (p: Record<string, unknown>) => Promise<{ error: { message: string } | null }> };
  })
    .from(tableName)
    .insert(insertPayload);

  if (insertErr) {
    console.warn(`[SystemDiagnostics] Fallback insert to ${tableName} failed:`, insertErr.message);
  }
}

// ==================== PUBLIC API ====================

/**
 * Log a login attempt (success or failure).
 * Drop-in replacement for the old `logLoginDiagnostic`.
 */
export function logLogin(input: LoginDiagnosticInput): void {
  void withRetry(() =>
    rpcWithFallback(
      "log_login_diagnostic",
      {
        p_email: input.email ?? null,
        p_codigo_loja: input.codigo_loja ?? null,
        p_tenant_id: input.tenant_id ?? null,
        p_usuario_id: input.usuario_id ?? null,
        p_cargo_nome: input.cargo_nome ?? null,
        p_auth_user_id: input.auth_user_id ?? null,
        p_resultado: input.resultado,
        p_detalhes: input.detalhes ?? {},
      },
      "login_diagnostics",
      {
        email: input.email,
        codigo_loja: input.codigo_loja,
        tenant_id: input.tenant_id,
        usuario_id: input.usuario_id,
        cargo_nome: input.cargo_nome,
        auth_user_id: input.auth_user_id,
        resultado: input.resultado,
        detalhes: input.detalhes ?? {},
      },
    ),
  );
}

/** Backward-compatible alias */
export const logLoginDiagnostic = logLogin;

/**
 * Log a runtime error with context.
 */
export function logError(input: ErrorLogInput): void {
  const tenantId = getTenantId();
  const userId = getUserId();

  void withRetry(async () => {
    const { error } = await (supabase as unknown as {
      from: (t: string) => { insert: (p: Record<string, unknown>) => Promise<{ error: { message: string } | null }> };
    })
      .from("system_logs")
      .insert({
        tenant_id: tenantId,
        user_id: userId,
        event_type: "error" as SystemEventType,
        source: input.source,
        message: input.message,
        metadata: {
          stack: input.stack,
          ...input.context,
        },
      });

    if (error) {
      // Table may not exist yet — silent fallback to console
      console.warn("[SystemDiagnostics] logError insert failed:", error.message);
    }
  });
}

/**
 * Log a generic system event (performance, security, integration, etc.).
 */
export function logEvent(input: EventLogInput): void {
  const tenantId = getTenantId();
  const userId = getUserId();

  void withRetry(async () => {
    const { error } = await (supabase as unknown as {
      from: (t: string) => { insert: (p: Record<string, unknown>) => Promise<{ error: { message: string } | null }> };
    })
      .from("system_logs")
      .insert({
        tenant_id: tenantId,
        user_id: userId,
        event_type: input.event_type,
        source: input.source,
        message: input.message,
        metadata: input.metadata ?? {},
      });

    if (error) {
      console.warn("[SystemDiagnostics] logEvent insert failed:", error.message);
    }
  });
}

/**
 * Log an AI interaction (OpenAI, Perplexity, etc.) for monitoring.
 */
export function logAIInteraction(input: AIInteractionInput): void {
  const tenantId = getTenantId();
  const userId = getUserId();

  void withRetry(async () => {
    const { error } = await (supabase as unknown as {
      from: (t: string) => { insert: (p: Record<string, unknown>) => Promise<{ error: { message: string } | null }> };
    })
      .from("system_logs")
      .insert({
        tenant_id: tenantId,
        user_id: userId,
        event_type: "ai_interaction" as SystemEventType,
        source: input.model,
        message: input.action,
        metadata: {
          tokens_used: input.tokens_used,
          latency_ms: input.latency_ms,
          success: input.success,
          error_message: input.error_message,
          ...input.metadata,
        },
      });

    if (error) {
      console.warn("[SystemDiagnostics] logAIInteraction insert failed:", error.message);
    }
  });
}

/**
 * Read recent diagnostics for AI analysis (admin-only usage).
 */
export async function getRecentDiagnostics(
  tenantId: string,
  limit = 50,
): Promise<Record<string, unknown>[]> {
  const { data } = await (supabase as unknown as {
    from: (t: string) => {
      select: (s: string) => {
        eq: (col: string, val: string) => {
          order: (col: string, opts: { ascending: boolean }) => {
            limit: (n: number) => Promise<{ data: Record<string, unknown>[] | null }>;
          };
        };
      };
    };
  })
    .from("login_diagnostics")
    .select("*")
    .eq("tenant_id", tenantId)
    .order("created_at", { ascending: false })
    .limit(limit);

  return data ?? [];
}

/**
 * Analyze diagnostics patterns for AI suggestions.
 */
export function analyzeDiagnosticPatterns(
  logs: Record<string, unknown>[],
): { failureRate: number; topIssues: string[]; suggestions: string[] } {
  if (logs.length === 0) {
    return { failureRate: 0, topIssues: [], suggestions: [] };
  }

  const failures = logs.filter(l => String(l.resultado ?? "").startsWith("falha"));
  const failureRate = Math.round((failures.length / logs.length) * 100);

  // Count failure types
  const counts = new Map<string, number>();
  for (const f of failures) {
    const res = String(f.resultado ?? "desconhecida");
    counts.set(res, (counts.get(res) ?? 0) + 1);
  }

  const topIssues = [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([type, count]) => `${type}: ${count}x`);

  const suggestions: string[] = [];
  if (counts.has("falha_credencial") && (counts.get("falha_credencial") ?? 0) > 3) {
    suggestions.push("Alto volume de senhas incorretas — considere redefinição em lote.");
  }
  if (counts.has("falha_tenant")) {
    suggestions.push("Falhas de tenant — verificar vínculos usuario ↔ loja.");
  }
  if (counts.has("falha_vinculo")) {
    suggestions.push("Perfis ausentes — verificar sincronização auth → usuarios.");
  }
  if (failureRate > 30) {
    suggestions.push("Taxa de falha acima de 30% — investigar causa raiz urgentemente.");
  }

  return { failureRate, topIssues, suggestions };
}
