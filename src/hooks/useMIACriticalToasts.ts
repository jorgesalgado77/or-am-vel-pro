/**
 * useMIACriticalToasts — Shows toast notifications outside MIA chat
 * for critical situations: very overdue tasks (3+ days), missed goals.
 * Runs once on app load with a 30-minute cooldown.
 */
import { useEffect, useRef } from "react";
import { supabase } from "@/lib/supabaseClient";
import { toast } from "sonner";

const COOLDOWN_KEY = "mia_critical_toast_last";
const COOLDOWN_MS = 30 * 60 * 1000; // 30 min

export function useMIACriticalToasts(
  tenantId: string | null,
  userId: string | null,
  cargoNome: string | null
) {
  const ranRef = useRef(false);

  useEffect(() => {
    if (!tenantId || !userId || ranRef.current) return;

    const lastCheck = sessionStorage.getItem(COOLDOWN_KEY);
    if (lastCheck && Date.now() - Number(lastCheck) < COOLDOWN_MS) return;

    ranRef.current = true;

    const run = async () => {
      try {
        const threeDaysAgo = new Date(Date.now() - 3 * 86400000).toISOString().slice(0, 10);
        const cargo = (cargoNome || "").toLowerCase();
        const isManager = cargo.includes("gerente") || cargo.includes("administrador") || cargo.includes("admin");

        // Very overdue tasks (3+ days)
        const tasksQuery = supabase
          .from("tasks" as any)
          .select("id, titulo", { count: "exact" })
          .eq("tenant_id", tenantId)
          .in("status", ["nova", "pendente", "em_execucao"])
          .lte("data_tarefa", threeDaysAgo)
          .limit(3);

        if (!isManager) {
          tasksQuery.eq("assigned_to", userId);
        }

        const { data: overdueTasks, count: overdueCount } = await tasksQuery;

        if ((overdueCount || 0) > 0) {
          const tasks = (overdueTasks || []) as any[];
          const names = tasks.map((t: any) => t.titulo).slice(0, 2).join(", ");
          const extra = (overdueCount || 0) > 2 ? ` e mais ${(overdueCount || 0) - 2}` : "";

          toast.error(
            isManager
              ? `⚠️ ${overdueCount} tarefa(s) da equipe com 3+ dias de atraso`
              : `⚠️ ${overdueCount} tarefa(s) muito atrasada(s)`,
            {
              description: `${names}${extra}. Ação urgente necessária!`,
              duration: 8000,
              action: {
                label: "Ver Tarefas",
                onClick: () => window.dispatchEvent(new CustomEvent("navigate-to-tasks")),
              },
            }
          );
        }

        // Manager-only: Monthly goal check (contracts vs. a basic threshold)
        if (isManager) {
          const monthStart = new Date();
          monthStart.setDate(1);
          monthStart.setHours(0, 0, 0, 0);
          const dayOfMonth = new Date().getDate();

          const { count: contractsThisMonth } = await supabase
            .from("client_contracts" as any)
            .select("id", { count: "exact", head: true })
            .eq("tenant_id", tenantId)
            .gte("created_at", monthStart.toISOString());

          const contracts = contractsThisMonth || 0;
          // Alert if past day 15 and less than 3 contracts (simple heuristic)
          if (dayOfMonth >= 15 && contracts < 3) {
            toast.warning("📉 Meta do mês em risco", {
              description: `Apenas ${contracts} contrato(s) fechado(s) e já estamos no dia ${dayOfMonth}. Hora de acelerar!`,
              duration: 8000,
              action: {
                label: "Ver Dashboard",
                onClick: () => window.dispatchEvent(new CustomEvent("navigate-to-dashboard")),
              },
            });
          }
        }

        sessionStorage.setItem(COOLDOWN_KEY, String(Date.now()));
      } catch (err) {
        console.warn("[MIA Critical Toasts] Error:", err);
      }
    };

    // Delay 3s to not compete with initial load
    const timer = setTimeout(run, 3000);
    return () => clearTimeout(timer);
  }, [tenantId, userId, cargoNome]);
}
