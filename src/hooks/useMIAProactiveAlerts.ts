/**
 * useMIAProactiveAlerts — Checks for stagnant leads, overdue tasks,
 * unanswered messages and injects proactive alerts into MIA chat.
 * Runs once when the MIA chat opens (debounced per session).
 */
import { useCallback, useRef } from "react";
import { supabase } from "@/lib/supabaseClient";

export interface ProactiveAlert {
  type: "leads_parados" | "tarefas_atrasadas" | "mensagens_pendentes";
  icon: string;
  title: string;
  detail: string;
  count: number;
}

const COOLDOWN_KEY = "mia_proactive_last_check";
const COOLDOWN_MS = 5 * 60 * 1000; // 5 min between checks

export function useMIAProactiveAlerts(tenantId: string | null, userId: string | null) {
  const runningRef = useRef(false);

  const checkAlerts = useCallback(async (): Promise<ProactiveAlert[]> => {
    if (!tenantId || !userId || runningRef.current) return [];

    // Cooldown: don't spam DB
    const lastCheck = sessionStorage.getItem(COOLDOWN_KEY);
    if (lastCheck && Date.now() - Number(lastCheck) < COOLDOWN_MS) return [];

    runningRef.current = true;
    const alerts: ProactiveAlert[] = [];
    const today = new Date().toISOString().slice(0, 10);
    const twoDaysAgo = new Date(Date.now() - 2 * 86400000).toISOString();

    try {
      // 1. Leads parados (clients without activity for 2+ days)
      const { data: stagnantLeads, count: leadsCount } = await supabase
        .from("clients" as any)
        .select("id", { count: "exact", head: true })
        .eq("tenant_id", tenantId)
        .in("status", ["novo", "em_atendimento"])
        .lt("updated_at", twoDaysAgo);

      if ((leadsCount || 0) > 0) {
        alerts.push({
          type: "leads_parados",
          icon: "🚨",
          title: "Leads parados",
          detail: `Você tem **${leadsCount}** lead(s) sem movimentação há mais de 2 dias. Recomendo fazer follow-up para não perder a venda!`,
          count: leadsCount || 0,
        });
      }

      // 2. Tarefas atrasadas
      const { count: overdueCount } = await supabase
        .from("tasks" as any)
        .select("id", { count: "exact", head: true })
        .eq("tenant_id", tenantId)
        .eq("assigned_to", userId)
        .in("status", ["nova", "pendente", "em_execucao"])
        .lte("data_tarefa", today);

      if ((overdueCount || 0) > 0) {
        alerts.push({
          type: "tarefas_atrasadas",
          icon: "⏰",
          title: "Tarefas atrasadas",
          detail: `Existem **${overdueCount}** tarefa(s) vencida(s) ou para hoje. Priorize-as para manter a produtividade!`,
          count: overdueCount || 0,
        });
      }

      // 3. Mensagens não respondidas (chat messages where last is from client)
      const { data: unreadChats, count: unreadCount } = await supabase
        .from("chat_messages" as any)
        .select("id", { count: "exact", head: true })
        .eq("tenant_id", tenantId)
        .eq("is_from_client", true)
        .eq("read", false);

      if ((unreadCount || 0) > 0) {
        alerts.push({
          type: "mensagens_pendentes",
          icon: "💬",
          title: "Mensagens não respondidas",
          detail: `Há **${unreadCount}** mensagem(ns) de clientes aguardando resposta. Responda rápido para aumentar a conversão!`,
          count: unreadCount || 0,
        });
      }

      sessionStorage.setItem(COOLDOWN_KEY, String(Date.now()));
    } catch (err) {
      console.warn("MIA proactive alerts check failed:", err);
    } finally {
      runningRef.current = false;
    }

    return alerts;
  }, [tenantId, userId]);

  return { checkAlerts };
}
