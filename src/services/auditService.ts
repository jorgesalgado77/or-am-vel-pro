/**
 * Audit Log Service
 * 
 * Centralized logging for critical business actions.
 * Logs are stored in the audit_logs table for traceability.
 */

import { supabase } from "@/lib/supabaseClient";

export type AuditAction =
  | "cliente_criado"
  | "cliente_atualizado"
  | "cliente_excluido"
  | "simulacao_salva"
  | "venda_fechada"
  | "contrato_gerado"
  | "comissoes_geradas"
  | "desconto_desbloqueado"
  | "plus_desbloqueado"
  | "status_tracking_alterado"
  | "comissao_status_alterado"
  | "usuario_login"
  | "senha_alterada";

export type AuditEntity =
  | "client"
  | "simulation"
  | "contract"
  | "commission"
  | "tracking"
  | "user"
  | "security";

interface AuditLogInput {
  acao: AuditAction;
  entidade: AuditEntity;
  entidade_id?: string;
  usuario_id?: string;
  usuario_nome?: string;
  tenant_id?: string | null;
  detalhes?: Record<string, unknown>;
}

/**
 * Logs an audit event. Fire-and-forget — never blocks the UI.
 * tenant_id should be passed explicitly from context rather than read from localStorage.
 */
export function logAudit(input: AuditLogInput): void {
  const { acao, entidade, entidade_id, usuario_id, usuario_nome, tenant_id, detalhes } = input;

  // Fallback: only use localStorage if tenant_id wasn't provided explicitly
  const resolvedTenantId = tenant_id ?? localStorage.getItem("current_tenant_id") ?? null;

  supabase
    .from("audit_logs")
    .insert({
      acao,
      entidade,
      entidade_id: entidade_id || null,
      usuario_id: usuario_id || null,
      usuario_nome: usuario_nome || null,
      detalhes: detalhes || {},
      tenant_id: resolvedTenantId,
    } as any)
    .then(({ error }) => {
      if (error) {
        console.warn("[Audit] Failed to log:", acao, error.message);
      }
    });
}

/**
 * Helper to get current user info for audit logs.
 * Uses localStorage as fallback for non-React contexts.
 */
export function getAuditUserInfo(): { usuario_id?: string; usuario_nome?: string } {
  try {
    const userId = localStorage.getItem("current_user_id");
    return { usuario_id: userId || undefined };
  } catch {
    return {};
  }
}
