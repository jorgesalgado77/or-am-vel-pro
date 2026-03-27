/**
 * Audit Log Service
 * 
 * Centralized logging for critical business actions.
 * Uses in-memory tenantState with async JWT fallback.
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
  | "followup_resumed"
  | "followup_weekly_report"
  | "addon_liberado"
  | "addon_revogado"
  | "senha_resetada"
  | "lead_atribuido"
  | "lead_enviado_responsavel"
  | "tenant_ativado"
  | "tenant_desativado"
  | "tenant_excluido"
  | "solicitacao_medida_criada"
  | "desconto_excedido_aprovacao"
  | "relatorio_semanal_comercial";

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
  | "followup_schedule"
  | "tenant"
  | "measurement_request";

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
 * Resolves tenant_id with JWT fallback when in-memory state is empty.
 */
async function resolveAuditTenantId(explicit?: string | null): Promise<string | null> {
  if (explicit) return explicit;
  const memoryTid = getTenantId();
  if (memoryTid) return memoryTid;

  try {
    const { data } = await supabase.auth.getSession();
    return (data?.session?.user?.user_metadata as any)?.tenant_id ?? null;
  } catch {
    return null;
  }
}

/**
 * Logs an audit event. Fire-and-forget — never blocks the UI.
 */
export function logAudit(input: AuditLogInput): void {
  const { acao, entidade, entidade_id, usuario_id, usuario_nome, detalhes, tenant_id } = input;

  const tenantId = tenant_id || getTenantId();

  const payload: Record<string, unknown> = {
    acao,
    entidade,
    entidade_id: entidade_id || null,
    usuario_id: usuario_id || null,
    usuario_nome: usuario_nome || null,
    detalhes: detalhes || {},
    ...(tenantId ? { tenant_id: tenantId } : {}),
  };

  supabase
    .from("audit_logs")
    .insert(payload as any)
    .then(({ error }) => {
      if (error) {
        console.warn("[Audit] Failed to log:", acao, error.message);
      }
    });
}

/**
 * Helper to get current user info for audit logs.
 */
export function getAuditUserInfo(): { usuario_id?: string; usuario_nome?: string } {
  const userId = getUserId();
  return { usuario_id: userId || undefined };
}
