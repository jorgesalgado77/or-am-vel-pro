/**
 * MIA Monitor Service — Proactive intelligence engine that periodically
 * analyzes business data to detect actionable opportunities.
 *
 * Monitors: stale leads, unanswered chats, pending simulations,
 * open proposals, and follow-up timing.
 *
 * Multi-tenant isolated via tenant_id.
 */

import { supabase } from "@/lib/supabaseClient";

// ── Types ───────────────────────────────────────────────────────

export interface MIAMonitorAlert {
  id: string;
  type: MIAMonitorAlertType;
  severity: "info" | "warning" | "critical";
  icon: string;
  title: string;
  detail: string;
  count: number;
  /** Suggested action the user can execute */
  suggestedAction?: MIAMonitorAction;
  /** Related entity IDs for context */
  relatedIds?: string[];
  timestamp: number;
}

export type MIAMonitorAlertType =
  | "stale_leads"
  | "unanswered_messages"
  | "pending_simulations"
  | "open_proposals"
  | "follow_up_due"
  | "high_value_inactive"
  | "closing_opportunity"
  | "team_bottleneck";

export interface MIAMonitorAction {
  type: "send_followup" | "navigate" | "send_whatsapp" | "schedule_task";
  label: string;
  target?: string;
  payload?: Record<string, unknown>;
  /** If true, requires user confirmation before execution */
  requiresConfirmation: boolean;
}

interface MonitorConfig {
  staleLeadThresholdHours: number;
  unansweredMessageThresholdHours: number;
  followUpIntervalHours: number;
  highValueThreshold: number;
}

const DEFAULT_CONFIG: MonitorConfig = {
  staleLeadThresholdHours: 48,
  unansweredMessageThresholdHours: 4,
  followUpIntervalHours: 24,
  highValueThreshold: 10000,
};

// ── Engine ──────────────────────────────────────────────────────

class MIAMonitorServiceClass {
  private lastRun: number = 0;
  private running = false;
  private cachedAlerts: MIAMonitorAlert[] = [];
  private config: MonitorConfig = DEFAULT_CONFIG;

  /** Run a full monitoring cycle */
  async runMonitorCycle(
    tenantId: string,
    userId: string,
    config?: Partial<MonitorConfig>
  ): Promise<MIAMonitorAlert[]> {
    if (this.running) return this.cachedAlerts;

    // Cooldown: don't run more than once every 2 minutes
    if (Date.now() - this.lastRun < 120_000) return this.cachedAlerts;

    this.running = true;
    this.config = { ...DEFAULT_CONFIG, ...config };

    try {
      const alerts: MIAMonitorAlert[] = [];

      const results = await Promise.allSettled([
        this.checkStaleLeads(tenantId),
        this.checkUnansweredMessages(tenantId),
        this.checkHighValueInactive(tenantId),
        this.checkFollowUpsDue(tenantId),
      ]);

      for (const result of results) {
        if (result.status === "fulfilled" && result.value) {
          alerts.push(...result.value);
        }
      }

      // Sort by severity (critical first) then count
      const severityOrder = { critical: 0, warning: 1, info: 2 };
      alerts.sort((a, b) => {
        const diff = severityOrder[a.severity] - severityOrder[b.severity];
        return diff !== 0 ? diff : b.count - a.count;
      });

      this.cachedAlerts = alerts;
      this.lastRun = Date.now();
      return alerts;
    } catch (err) {
      console.warn("[MIAMonitor] Cycle failed:", err);
      return this.cachedAlerts;
    } finally {
      this.running = false;
    }
  }

  /** Get cached alerts without triggering a new cycle */
  getCachedAlerts(): MIAMonitorAlert[] {
    return this.cachedAlerts;
  }

  // ── Checkers ─────────────────────────────────────────────────

  private async checkStaleLeads(tenantId: string): Promise<MIAMonitorAlert[]> {
    const cutoff = new Date(Date.now() - this.config.staleLeadThresholdHours * 3600_000).toISOString();

    const { data, count } = await supabase
      .from("clients" as ReturnType<typeof supabase.from>)
      .select("id, nome, telefone1, updated_at", { count: "exact" })
      .eq("tenant_id", tenantId)
      .in("status", ["novo", "em_negociacao", "em_atendimento", "proposta_enviada"])
      .lt("updated_at", cutoff)
      .order("updated_at", { ascending: true })
      .limit(10) as { data: Array<{ id: string; nome: string; telefone1: string; updated_at: string }> | null; count: number | null };

    if (!count || count === 0) return [];

    const topLeads = (data || []).slice(0, 3).map((l) => l.nome).join(", ");

    return [{
      id: `stale_leads_${Date.now()}`,
      type: "stale_leads",
      severity: count > 5 ? "critical" : "warning",
      icon: "🚨",
      title: `${count} lead(s) sem movimentação`,
      detail: `Leads parados há mais de ${this.config.staleLeadThresholdHours}h: ${topLeads}${count > 3 ? ` e mais ${count - 3}` : ""}`,
      count,
      relatedIds: (data || []).map((l) => l.id),
      suggestedAction: {
        type: "navigate",
        label: "Ver leads parados",
        target: "clients",
        requiresConfirmation: false,
      },
      timestamp: Date.now(),
    }];
  }

  private async checkUnansweredMessages(tenantId: string): Promise<MIAMonitorAlert[]> {
    const cutoff = new Date(Date.now() - this.config.unansweredMessageThresholdHours * 3600_000).toISOString();

    const { count } = await supabase
      .from("tracking_messages" as ReturnType<typeof supabase.from>)
      .select("id", { count: "exact", head: true })
      .eq("tenant_id", tenantId)
      .eq("remetente_tipo", "cliente")
      .eq("lida", false)
      .lt("created_at", cutoff) as { count: number | null };

    if (!count || count === 0) return [];

    return [{
      id: `unanswered_${Date.now()}`,
      type: "unanswered_messages",
      severity: count > 10 ? "critical" : "warning",
      icon: "💬",
      title: `${count} mensagem(ns) sem resposta`,
      detail: `Mensagens de clientes aguardando resposta há mais de ${this.config.unansweredMessageThresholdHours}h`,
      count,
      suggestedAction: {
        type: "navigate",
        label: "Abrir Chat de Vendas",
        target: "vendazap-chat",
        requiresConfirmation: false,
      },
      timestamp: Date.now(),
    }];
  }

  private async checkHighValueInactive(tenantId: string): Promise<MIAMonitorAlert[]> {
    const cutoff = new Date(Date.now() - 72 * 3600_000).toISOString(); // 3 days

    const { data, count } = await supabase
      .from("client_tracking" as ReturnType<typeof supabase.from>)
      .select("id, nome_cliente, valor_contrato, updated_at", { count: "exact" })
      .eq("tenant_id", tenantId)
      .in("status", ["em_negociacao"])
      .gte("valor_contrato", this.config.highValueThreshold)
      .lt("updated_at", cutoff)
      .order("valor_contrato", { ascending: false })
      .limit(5) as { data: Array<{ id: string; nome_cliente: string; valor_contrato: number; updated_at: string }> | null; count: number | null };

    if (!count || count === 0) return [];

    const topClients = (data || []).slice(0, 3).map((c) => `${c.nome_cliente} (R$ ${(c.valor_contrato / 1000).toFixed(0)}k)`).join(", ");

    return [{
      id: `high_value_${Date.now()}`,
      type: "high_value_inactive",
      severity: "critical",
      icon: "💎",
      title: `${count} negociação(ões) de alto valor parada(s)`,
      detail: `Oportunidades acima de R$ ${(this.config.highValueThreshold / 1000).toFixed(0)}k sem atividade: ${topClients}`,
      count,
      relatedIds: (data || []).map((c) => c.id),
      suggestedAction: {
        type: "send_followup",
        label: "Enviar follow-up urgente",
        target: "vendazap-chat",
        requiresConfirmation: true,
      },
      timestamp: Date.now(),
    }];
  }

  private async checkFollowUpsDue(tenantId: string): Promise<MIAMonitorAlert[]> {
    const followUpCutoff = new Date(Date.now() - this.config.followUpIntervalHours * 3600_000).toISOString();

    // Find conversations where last loja message is older than follow-up interval
    // and there's been a client message since
    const { data } = await supabase
      .from("tracking_messages" as ReturnType<typeof supabase.from>)
      .select("tracking_id, remetente_tipo, created_at")
      .eq("tenant_id", tenantId)
      .gte("created_at", new Date(Date.now() - 7 * 86400_000).toISOString())
      .order("created_at", { ascending: false })
      .limit(500) as { data: Array<{ tracking_id: string; remetente_tipo: string; created_at: string }> | null };

    if (!data || data.length === 0) return [];

    // Group by tracking_id, find ones where last message is from client and old
    const trackingGroups = new Map<string, { lastLoja: string | null; lastCliente: string | null }>();
    for (const msg of data) {
      const existing = trackingGroups.get(msg.tracking_id) || { lastLoja: null, lastCliente: null };
      if (msg.remetente_tipo === "loja" && !existing.lastLoja) existing.lastLoja = msg.created_at;
      if (msg.remetente_tipo === "cliente" && !existing.lastCliente) existing.lastCliente = msg.created_at;
      trackingGroups.set(msg.tracking_id, existing);
    }

    let followUpCount = 0;
    for (const [, group] of trackingGroups) {
      if (group.lastCliente && (!group.lastLoja || group.lastCliente > group.lastLoja)) {
        if (new Date(group.lastCliente).getTime() < new Date(followUpCutoff).getTime()) {
          followUpCount++;
        }
      }
    }

    if (followUpCount === 0) return [];

    return [{
      id: `followup_${Date.now()}`,
      type: "follow_up_due",
      severity: "warning",
      icon: "⏰",
      title: `${followUpCount} follow-up(s) pendente(s)`,
      detail: `Conversas aguardando resposta da loja há mais de ${this.config.followUpIntervalHours}h`,
      count: followUpCount,
      suggestedAction: {
        type: "navigate",
        label: "Ir para Chat de Vendas",
        target: "vendazap-chat",
        requiresConfirmation: false,
      },
      timestamp: Date.now(),
    }];
  }
}

// Singleton
let instance: MIAMonitorServiceClass | null = null;

export function getMIAMonitorService(): MIAMonitorServiceClass {
  if (!instance) {
    instance = new MIAMonitorServiceClass();
  }
  return instance;
}

export { MIAMonitorServiceClass as MIAMonitorService };
