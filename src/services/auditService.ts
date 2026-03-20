/**
 * Audit Log Service
 * 
 * Centralized logging for critical business actions.
 * Uses in-memory tenantState — never reads from localStorage.
 */

import { supabase } from "@/lib/supabaseClient";
import { getTenantId, getUserId } from "@/lib/tenantState";

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
  | "senha_alterada"
  | "vendazap_auto_suggestion"
  | "vendazap_suggestion_used"
  | "vendazap_trigger_sent"
  | "autopilot_ativado"
  | "autopilot_desativado"
  | "autopilot_resposta_enviada"
  | "followup_config_update"
  | "followup_paused"
  | "followup_resumed";

export type AuditEntity =
  | "client"
  | "simulation"
  | "contract"
  | "commission"
  | "tracking"
  | "user"
  | "security"
  | "vendazap_trigger"
  | "vendazap"
  | "tracking_messages"
  | "followup_config"
  | "followup_schedule";

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
 * tenant_id is resolved from in-memory state if not provided explicitly.
 */
export function logAudit(input: AuditLogInput): void {
  const { acao, entidade, entidade_id, usuario_id, usuario_nome, tenant_id, detalhes } = input;

  const resolvedTenantId = tenant_id ?? getTenantId();

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
 * Uses in-memory state from AuthContext.
 */
export function getAuditUserInfo(): { usuario_id?: string; usuario_nome?: string } {
  const userId = getUserId();
  return { usuario_id: userId || undefined };
}
