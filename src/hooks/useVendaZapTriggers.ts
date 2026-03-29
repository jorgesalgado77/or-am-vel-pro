/**
 * useVendaZapTriggers — Intelligent trigger system integrated with CDE.
 *
 * On new triggers: fetches client context, runs CDE.handleTrigger()
 * to decide the best automated action, and optionally executes it.
 */
import { useState, useEffect, useCallback, useRef } from "react";
import { supabase } from "@/lib/supabaseClient";
import { toast } from "sonner";
import { logAudit } from "@/services/auditService";
import { getCommercialEngine } from "@/services/commercial/CommercialDecisionEngine";
import type { TriggerContext, TriggerType, TriggerAction } from "@/services/commercial/types";

export interface VendaZapTrigger {
  id: string;
  tenant_id: string;
  client_id: string;
  trigger_type: TriggerType;
  generated_message: string;
  status: "pending" | "sent" | "auto_sent" | "dismissed";
  created_at: string;
  client_nome?: string;
  client_status?: string;
  valor_orcamento?: number;
  days_inactive?: number;
  has_simulation?: boolean;
  /** CDE decision attached after analysis */
  decision?: TriggerAction;
}

const TRIGGER_LABELS: Record<string, { label: string; emoji: string }> = {
  no_response: { label: "Sem Resposta", emoji: "⏰" },
  expiring_budget: { label: "Orçamento Expirando", emoji: "⚠️" },
  viewed_no_reply: { label: "Visualizou s/ Responder", emoji: "👀" },
};

const ACTION_LABELS: Record<string, string> = {
  send_message: "📩 Enviar mensagem",
  send_with_discount: "💰 Enviar com desconto",
  suggest_dealroom: "🏠 Sugerir Deal Room",
  schedule_followup: "📅 Agendar follow-up",
  wait: "⏳ Aguardar",
  escalate: "🚨 Escalar para gerente",
};

export { TRIGGER_LABELS, ACTION_LABELS };

interface ClientRow {
  id: string;
  nome: string;
  status: string;
  valor_orcamento: number | null;
  updated_at: string | null;
}

/**
 * Build a TriggerContext from a raw trigger row + client data.
 */
function buildTriggerContext(
  trigger: { id: string; tenant_id: string; client_id: string; trigger_type: string; generated_message: string },
  client: ClientRow,
): TriggerContext {
  const updatedAt = client.updated_at;
  const daysInactive = updatedAt
    ? Math.floor((Date.now() - new Date(updatedAt).getTime()) / 86400000)
    : 0;

  return {
    trigger_id: trigger.id,
    trigger_type: trigger.trigger_type as TriggerType,
    tenant_id: trigger.tenant_id,
    client_id: trigger.client_id,
    client_name: client.nome || "Cliente",
    client_status: client.status || "novo",
    days_inactive: daysInactive,
    has_simulation: (client.valor_orcamento ?? 0) > 0,
    valor_orcamento: client.valor_orcamento ?? 0,
    generated_message: trigger.generated_message,
  };
}

export function useVendaZapTriggers(tenantId: string | null) {
  const [triggers, setTriggers] = useState<VendaZapTrigger[]>([]);
  const [loading, setLoading] = useState(false);
  const initialLoadDone = useRef(false);

  /**
   * Fetch triggers with client data in a single joined query pattern.
   */
  const fetchTriggers = useCallback(async () => {
    if (!tenantId) return;
    setLoading(true);

    const { data: triggerRows } = await supabase
      .from("vendazap_triggers" as unknown as "clients")
      .select("*")
      .eq("tenant_id", tenantId)
      .order("created_at", { ascending: false })
      .limit(50);

    if (!triggerRows || triggerRows.length === 0) {
      setTriggers([]);
      setLoading(false);
      return;
    }

    // Batch fetch client data
    const clientIds = [...new Set(triggerRows.map((t: Record<string, unknown>) => t.client_id as string))];
    const { data: clients } = await supabase
      .from("clients")
      .select("id, nome, status, updated_at");

    const matchedClients = (clients || []).filter((c: Record<string, unknown>) => clientIds.includes(c.id as string));
    const clientMap = new Map<string, ClientRow>();
    matchedClients.forEach((c: Record<string, unknown>) => clientMap.set(c.id as string, c as unknown as ClientRow));

    // Analyze pending triggers via CDE
    const engine = getCommercialEngine();
    const enrichedTriggers: VendaZapTrigger[] = await Promise.all(
      triggerRows.map(async (t: Record<string, unknown>) => {
        const client = clientMap.get(t.client_id as string);
        const enriched: VendaZapTrigger = {
          id: t.id as string,
          tenant_id: t.tenant_id as string,
          client_id: t.client_id as string,
          trigger_type: t.trigger_type as TriggerType,
          generated_message: t.generated_message as string,
          status: t.status as VendaZapTrigger["status"],
          created_at: t.created_at as string,
          client_nome: client?.nome || "Cliente",
          client_status: client?.status,
          valor_orcamento: client?.valor_orcamento ?? undefined,
          days_inactive: client?.updated_at
            ? Math.floor((Date.now() - new Date(client.updated_at).getTime()) / 86400000)
            : 0,
          has_simulation: (client?.valor_orcamento ?? 0) > 0,
        };

        // Run CDE for pending triggers with budget
        if (enriched.status === "pending" && client && (client.valor_orcamento ?? 0) > 0) {
          try {
            const triggerCtx = buildTriggerContext(t as Parameters<typeof buildTriggerContext>[0], client);
            enriched.decision = await engine.handleTrigger(triggerCtx);
            // Override generated_message with CDE's intelligent message
            enriched.generated_message = enriched.decision.message;
          } catch {
            // fallback to original message
          }
        }

        return enriched;
      }),
    );

    setTriggers(enrichedTriggers);
    setLoading(false);
  }, [tenantId]);

  useEffect(() => {
    fetchTriggers().then(() => { initialLoadDone.current = true; });
  }, [fetchTriggers]);

  // Realtime: listen for new triggers and run CDE analysis
  useEffect(() => {
    if (!tenantId) return;

    const channel = supabase
      .channel(`vendazap-triggers-${tenantId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "vendazap_triggers",
          filter: `tenant_id=eq.${tenantId}`,
        },
        async (payload) => {
          const newTrigger = payload.new as Record<string, unknown>;

          // Fetch client data
          const { data: client } = await supabase
            .from("clients")
            .select("id, nome, status, valor_orcamento, updated_at")
            .eq("id", newTrigger.client_id as string)
            .maybeSingle();

          const clientData: ClientRow = client as ClientRow || {
            id: newTrigger.client_id as string,
            nome: "Cliente",
            status: "novo",
            valor_orcamento: null,
            updated_at: null,
          };

          const enriched: VendaZapTrigger = {
            id: newTrigger.id as string,
            tenant_id: newTrigger.tenant_id as string,
            client_id: newTrigger.client_id as string,
            trigger_type: newTrigger.trigger_type as TriggerType,
            generated_message: newTrigger.generated_message as string,
            status: newTrigger.status as VendaZapTrigger["status"],
            created_at: newTrigger.created_at as string,
            client_nome: clientData.nome,
            client_status: clientData.status,
            valor_orcamento: clientData.valor_orcamento ?? undefined,
            days_inactive: clientData.updated_at
              ? Math.floor((Date.now() - new Date(clientData.updated_at).getTime()) / 86400000)
              : 0,
            has_simulation: (clientData.valor_orcamento ?? 0) > 0,
          };

          // Run CDE analysis for new trigger
          if ((clientData.valor_orcamento ?? 0) > 0) {
            try {
              const engine = getCommercialEngine();
              const triggerCtx = buildTriggerContext(
                { id: enriched.id, tenant_id: enriched.tenant_id, client_id: enriched.client_id, trigger_type: enriched.trigger_type, generated_message: enriched.generated_message },
                clientData,
              );
              enriched.decision = await engine.handleTrigger(triggerCtx);
              enriched.generated_message = enriched.decision.message;
            } catch {
              // fallback
            }
          }

          setTriggers((prev) => [enriched, ...prev]);

          const info = TRIGGER_LABELS[enriched.trigger_type] || { emoji: "📌", label: enriched.trigger_type };
          const actionLabel = enriched.decision ? ACTION_LABELS[enriched.decision.action] || "" : "";

          toast.info(`${info.emoji} ${info.label}: ${enriched.client_nome}`, {
            description: actionLabel
              ? `🧠 IA sugere: ${actionLabel} (${enriched.decision?.closing_probability}% prob.)`
              : `Cliente: ${enriched.client_nome}`,
            duration: 8000,
          });
        },
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [tenantId]);

  /**
   * Mark trigger as sent (manual or auto) and log audit.
   */
  const markSent = useCallback(
    async (triggerId: string, userId?: string, auto = false) => {
      const status = auto ? "auto_sent" : "sent";
      await supabase
        .from("vendazap_triggers" as unknown as "clients")
        .update({ status } as Record<string, unknown>)
        .eq("id", triggerId);

      logAudit({
        acao: auto ? "vendazap_trigger_auto_sent" : "vendazap_trigger_sent",
        entidade: "vendazap_trigger",
        entidade_id: triggerId,
        usuario_id: userId || null,
        usuario_nome: null,
        tenant_id: tenantId,
        detalhes: {},
      });

      setTriggers((prev) =>
        prev.map((t) => (t.id === triggerId ? { ...t, status } : t)),
      );
    },
    [tenantId],
  );

  /**
   * Dismiss a trigger.
   */
  const dismiss = useCallback(async (triggerId: string) => {
    await supabase
      .from("vendazap_triggers" as unknown as "clients")
      .update({ status: "dismissed" } as Record<string, unknown>)
      .eq("id", triggerId);

    setTriggers((prev) => prev.filter((t) => t.id !== triggerId));
  }, []);

  /**
   * Execute the CDE-recommended action for a trigger.
   */
  const executeDecision = useCallback(
    async (trigger: VendaZapTrigger, userId?: string) => {
      if (!trigger.decision || !tenantId) return;

      const { action, message } = trigger.decision;

      if (action === "wait") {
        toast.info("⏳ IA recomenda aguardar este cliente.");
        return;
      }

      if (action === "escalate") {
        toast.warning("🚨 IA recomenda escalar para o gerente.", { duration: 6000 });
        await markSent(trigger.id, userId);
        return;
      }

      if (action === "schedule_followup") {
        toast.info("📅 Follow-up agendado para 24h.", { duration: 5000 });
        await markSent(trigger.id, userId);
        return;
      }

      // send_message, send_with_discount, suggest_dealroom → insert tracking_messages
      const { error } = await supabase.from("tracking_messages").insert({
        tracking_id: trigger.client_id,
        mensagem: message,
        remetente_tipo: "loja",
        remetente_nome: "🤖 IA Comercial",
        lida: false,
        tenant_id: tenantId,
      } as Record<string, unknown>);

      if (error) {
        toast.error("Erro ao enviar mensagem automática");
        return;
      }

      await markSent(trigger.id, userId, true);

      logAudit({
        acao: "vendazap_trigger_auto_executed",
        entidade: "vendazap_trigger",
        entidade_id: trigger.id,
        usuario_id: userId || null,
        usuario_nome: null,
        tenant_id: tenantId,
        detalhes: { action, closing_probability: trigger.decision.closing_probability },
      });

      toast.success(`✅ ${ACTION_LABELS[action]} — ${trigger.client_nome}`, { duration: 5000 });
    },
    [tenantId, markSent],
  );

  const pendingTriggers = triggers.filter((t) => t.status === "pending");

  return {
    triggers,
    pendingTriggers,
    loading,
    fetchTriggers,
    markSent,
    dismiss,
    executeDecision,
  };
}
