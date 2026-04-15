/**
 * useMIAProactiveAlerts — Cargo-aware proactive alerts for MIA chat.
 * Now filters alerts based on cargo MIA permissions (mia_* flags).
 */
import { useCallback, useRef } from "react";
import { supabase } from "@/lib/supabaseClient";
import type { CargoPermissoes } from "@/hooks/useCargos";

export interface ProactiveAlertAction {
  type: "send_followup" | "navigate" | "send_whatsapp" | "schedule_task";
  label: string;
  target?: string;
  payload?: Record<string, unknown>;
  requiresConfirmation: boolean;
}

export interface ProactiveAlert {
  type: string;
  icon: string;
  title: string;
  detail: string;
  count: number;
  action?: { label: string; target: string };
  executableAction?: ProactiveAlertAction;
}

const COOLDOWN_KEY = "mia_proactive_last_check";
const COOLDOWN_MS = 5 * 60 * 1000;

type CargoCategory = "gerente" | "vendedor" | "projetista" | "admin" | "outro";

function classifyCargo(cargoNome: string | null): CargoCategory {
  if (!cargoNome) return "outro";
  const c = cargoNome.toLowerCase().trim();
  if (c.includes("gerente")) return "gerente";
  if (c.includes("administrador") || c.includes("admin")) return "admin";
  if (c.includes("vendedor") || c.includes("consultor") || c.includes("comercial")) return "vendedor";
  if (c.includes("projetista") || c.includes("designer") || c.includes("projeto")) return "projetista";
  return "outro";
}

/** Check if a MIA permission is enabled (defaults to true if not set) */
function hasMiaPerm(perms: CargoPermissoes | null | undefined, key: keyof CargoPermissoes): boolean {
  if (!perms) return true; // admin / no perms = full access
  return perms[key] !== false;
}

export function useMIAProactiveAlerts(
  tenantId: string | null,
  userId: string | null,
  cargoNome?: string | null,
  cargoPermissoes?: CargoPermissoes | null
) {
  const runningRef = useRef(false);
  const cargo = classifyCargo(cargoNome ?? null);

  const checkAlerts = useCallback(async (): Promise<ProactiveAlert[]> => {
    if (!tenantId || !userId || runningRef.current) return [];

    const lastCheck = sessionStorage.getItem(COOLDOWN_KEY);
    if (lastCheck && Date.now() - Number(lastCheck) < COOLDOWN_MS) return [];

    // Admin cargo always gets all alerts
    const isAdmin = cargo === "admin";
    const p = isAdmin ? null : cargoPermissoes;

    // If proactive alerts are globally disabled for this cargo, skip
    if (!isAdmin && !hasMiaPerm(p, "mia_alertas_proativos")) return [];

    runningRef.current = true;
    const alerts: ProactiveAlert[] = [];
    const today = new Date().toISOString().slice(0, 10);
    const twoDaysAgo = new Date(Date.now() - 2 * 86400000).toISOString();

    try {
      // === TAREFAS ===
      if (hasMiaPerm(p, "mia_tarefas")) {
        const tasksQuery = supabase
          .from("tasks" as any)
          .select("id", { count: "exact", head: true })
          .eq("tenant_id", tenantId)
          .in("status", ["nova", "pendente", "em_execucao"])
          .lte("data_tarefa", today);

        if (cargo !== "gerente" && cargo !== "admin") {
          tasksQuery.eq("assigned_to", userId);
        }

        const { count: overdueCount } = await tasksQuery;
        if ((overdueCount || 0) > 0) {
          const isTeam = cargo === "gerente" || cargo === "admin";
          alerts.push({
            type: "tarefas_atrasadas",
            icon: "⏰",
            title: isTeam ? "Tarefas da equipe atrasadas" : "Tarefas atrasadas",
            detail: isTeam
              ? `A equipe tem **${overdueCount}** tarefa(s) vencida(s). Acompanhe e redistribua!`
              : `Você tem **${overdueCount}** tarefa(s) vencida(s) ou para hoje. Priorize-as!`,
            count: overdueCount || 0,
            action: { label: "Ver Tarefas", target: "tasks" },
          });
        }
      }

      // === VENDEDOR / OUTRO / ADMIN: Leads & mensagens ===
      if (cargo === "vendedor" || cargo === "outro" || cargo === "admin") {
        if (hasMiaPerm(p, "mia_leads")) {
          const { count: leadsCount } = await supabase
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
              detail: `Você tem **${leadsCount}** lead(s) sem movimentação há mais de 2 dias. Faça follow-up!`,
              count: leadsCount || 0,
              action: { label: "Ver Leads", target: "clients" },
              executableAction: hasMiaPerm(p, "mia_followup_auto") ? {
                type: "send_followup",
                label: "Enviar follow-up automático",
                target: "vendazap-chat",
                requiresConfirmation: true,
              } : undefined,
            });
          }
        }

        if (hasMiaPerm(p, "mia_mensagens")) {
          const { count: unreadCount } = await supabase
            .from("tracking_messages" as any)
            .select("id", { count: "exact", head: true })
            .eq("tenant_id", tenantId)
            .eq("remetente_tipo", "cliente")
            .eq("lida", false);

          if ((unreadCount || 0) > 0) {
            alerts.push({
              type: "mensagens_pendentes",
              icon: "💬",
              title: "Mensagens não respondidas",
              detail: `Há **${unreadCount}** mensagem(ns) aguardando resposta. Responda rápido!`,
              count: unreadCount || 0,
              action: { label: "Ver Mensagens", target: "vendazap-chat" },
              executableAction: {
                type: "navigate",
                label: "Abrir Chat de Vendas",
                target: "vendazap-chat",
                requiresConfirmation: false,
              },
            });
          }
        }
      }

      // === GERENTE / ADMIN: KPIs, equipe, visão global ===
      if (cargo === "gerente" || cargo === "admin") {
        if (hasMiaPerm(p, "mia_leads")) {
          const { count: allStaleLeads } = await supabase
            .from("clients" as any)
            .select("id", { count: "exact", head: true })
            .eq("tenant_id", tenantId)
            .in("status", ["novo", "em_atendimento"])
            .lt("updated_at", twoDaysAgo);

          if ((allStaleLeads || 0) > 0) {
            alerts.push({
              type: "leads_equipe",
              icon: "📊",
              title: "Leads parados na loja",
              detail: `A loja tem **${allStaleLeads}** lead(s) estagnado(s). Cobre follow-up da equipe!`,
              count: allStaleLeads || 0,
              action: { label: "Ver Dashboard", target: "dashboard" },
            });
          }
        }

        if (hasMiaPerm(p, "mia_contratos")) {
          const monthStart = new Date();
          monthStart.setDate(1);
          monthStart.setHours(0, 0, 0, 0);
          const { count: contractsThisMonth } = await supabase
            .from("client_contracts" as any)
            .select("id", { count: "exact", head: true })
            .eq("tenant_id", tenantId)
            .gte("created_at", monthStart.toISOString());

          alerts.push({
            type: "kpi_contratos",
            icon: "📈",
            title: "KPI — Contratos do mês",
            detail: `**${contractsThisMonth || 0}** contrato(s) fechado(s) este mês. Acompanhe as metas!`,
            count: contractsThisMonth || 0,
            action: { label: "Ver KPIs", target: "dashboard" },
          });
        }

        if (hasMiaPerm(p, "mia_mensagens")) {
          const { count: teamUnread } = await supabase
            .from("tracking_messages" as any)
            .select("id", { count: "exact", head: true })
            .eq("tenant_id", tenantId)
            .eq("remetente_tipo", "cliente")
            .eq("lida", false);

          if ((teamUnread || 0) > 0) {
            alerts.push({
              type: "mensagens_equipe",
              icon: "💬",
              title: "Mensagens pendentes da equipe",
              detail: `Há **${teamUnread}** mensagem(ns) sem resposta na loja. Monitore!`,
              count: teamUnread || 0,
              action: { label: "Ver Chat", target: "vendazap-chat" },
            });
          }
        }
      }

      // === PROJETISTA: Medições & projetos ===
      if (cargo === "projetista") {
        if (hasMiaPerm(p, "mia_medicoes")) {
          const { count: pendingMeasurements } = await supabase
            .from("measurement_requests" as any)
            .select("id", { count: "exact", head: true })
            .eq("tenant_id", tenantId)
            .in("status", ["pendente", "agendada"]);

          if ((pendingMeasurements || 0) > 0) {
            alerts.push({
              type: "medicoes_pendentes",
              icon: "📐",
              title: "Medições pendentes",
              detail: `Há **${pendingMeasurements}** medição(ões) aguardando execução!`,
              count: pendingMeasurements || 0,
              action: { label: "Ver Medições", target: "medicao" },
            });
          }
        }

        if (hasMiaPerm(p, "mia_leads")) {
          const { count: leadsNoSim } = await supabase
            .from("clients" as any)
            .select("id", { count: "exact", head: true })
            .eq("tenant_id", tenantId)
            .in("status", ["novo", "em_atendimento"])
            .lt("updated_at", twoDaysAgo);

          if ((leadsNoSim || 0) > 0) {
            alerts.push({
              type: "leads_sem_projeto",
              icon: "🏗️",
              title: "Clientes aguardando projeto",
              detail: `**${leadsNoSim}** cliente(s) sem movimentação. Verifique briefings pendentes!`,
              count: leadsNoSim || 0,
              action: { label: "Ver Clientes", target: "clients" },
            });
          }
        }
      }

      // === Shared API expiration alerts (admin-only) ===
      if (cargo === "admin" || cargo === "gerente") {
        try {
          const { data: shares } = await (supabase as any)
            .from("dealroom_api_shares")
            .select("id, config_id, ends_at, is_active")
            .eq("tenant_id", tenantId);

          if (shares && shares.length > 0) {
            const configIds = [...new Set(shares.map((s: any) => s.config_id))];
            const { data: configs } = await (supabase as any)
              .from("dealroom_api_configs")
              .select("id, provider, nome")
              .in("id", configIds);
            const configMap = Object.fromEntries((configs || []).map((c: any) => [c.id, c]));
            const now = new Date();

            const expiredApis: string[] = [];
            const expiringSoonApis: string[] = [];

            for (const s of shares) {
              if (!s.is_active) continue;
              const config = configMap[s.config_id];
              if (!config) continue;
              const daysLeft = Math.ceil((new Date(s.ends_at).getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
              if (daysLeft < 0) expiredApis.push(config.nome);
              else if (daysLeft <= 7) expiringSoonApis.push(`${config.nome} (${daysLeft}d)`);
            }

            if (expiredApis.length > 0) {
              alerts.push({
                type: "shared_api_expired",
                icon: "🔴",
                title: "APIs compartilhadas expiradas",
                detail: `**${expiredApis.join(", ")}** expiraram. Configure suas próprias chaves em **Configurações > APIs**.`,
                count: expiredApis.length,
                action: { label: "Ir para APIs", target: "configuracoes" },
              });
            }

            if (expiringSoonApis.length > 0) {
              alerts.push({
                type: "shared_api_expiring",
                icon: "⚠️",
                title: "APIs compartilhadas prestes a vencer",
                detail: `**${expiringSoonApis.join(", ")}** — configure suas próprias chaves antes do vencimento.`,
                count: expiringSoonApis.length,
                action: { label: "Ir para APIs", target: "configuracoes" },
              });
            }
          }
        } catch {
          // Non-critical
        }
      }

      sessionStorage.setItem(COOLDOWN_KEY, String(Date.now()));
    } catch (err) {
      console.warn("MIA proactive alerts check failed:", err);
    } finally {
      runningRef.current = false;
    }

    return alerts;
  }, [tenantId, userId, cargo, cargoPermissoes]);

  return { checkAlerts };
}
