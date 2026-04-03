/**
 * MIAKpiSummary — Cargo-aware daily KPI strip at the top of MIA chat.
 * Vendedor: leads ativos, tarefas hoje, mensagens pendentes
 * Projetista: medições pendentes, projetos ativos, tarefas hoje
 * Gerente/Admin: contratos mês, leads total, equipe atrasada
 */
import { useEffect, useState, memo } from "react";
import { supabase } from "@/lib/supabaseClient";
import { Badge } from "@/components/ui/badge";
import {
  Users, ListTodo, MessageCircle, FileText, Ruler, BarChart3,
} from "lucide-react";

interface KpiItem {
  icon: React.ReactNode;
  label: string;
  value: number | string;
  color?: string;
}

interface Props {
  tenantId: string;
  userId: string;
  cargoNome: string | null;
}

export const MIAKpiSummary = memo(function MIAKpiSummary({ tenantId, userId, cargoNome }: Props) {
  const [kpis, setKpis] = useState<KpiItem[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    const cargo = (cargoNome || "").toLowerCase();
    const isManager = cargo.includes("gerente") || cargo.includes("administrador") || cargo.includes("admin");
    const isProjetista = cargo.includes("projetista") || cargo.includes("designer") || cargo.includes("projeto");
    const today = new Date().toISOString().slice(0, 10);

    const load = async () => {
      const items: KpiItem[] = [];

      try {
        if (isManager) {
          // Contracts this month
          const monthStart = new Date();
          monthStart.setDate(1);
          monthStart.setHours(0, 0, 0, 0);
          const [contractsRes, leadsRes, overdueRes] = await Promise.all([
            supabase.from("client_contracts" as any).select("id", { count: "exact", head: true }).eq("tenant_id", tenantId).gte("created_at", monthStart.toISOString()),
            supabase.from("clients" as any).select("id", { count: "exact", head: true }).eq("tenant_id", tenantId).in("status", ["novo", "em_atendimento"]),
            supabase.from("tasks" as any).select("id", { count: "exact", head: true }).eq("tenant_id", tenantId).in("status", ["nova", "pendente", "em_execucao"]).lt("data_tarefa", today),
          ]);

          items.push(
            { icon: <FileText className="h-3 w-3" />, label: "Contratos/mês", value: contractsRes.count || 0 },
            { icon: <Users className="h-3 w-3" />, label: "Leads ativos", value: leadsRes.count || 0 },
            { icon: <ListTodo className="h-3 w-3" />, label: "Atrasadas", value: overdueRes.count || 0, color: (overdueRes.count || 0) > 0 ? "text-destructive" : undefined },
          );
        } else if (isProjetista) {
          const [measureRes, tasksRes, leadsRes] = await Promise.all([
            supabase.from("measurement_requests" as any).select("id", { count: "exact", head: true }).eq("tenant_id", tenantId).in("status", ["pendente", "agendada"]),
            supabase.from("tasks" as any).select("id", { count: "exact", head: true }).eq("tenant_id", tenantId).eq("assigned_to", userId).in("status", ["nova", "pendente", "em_execucao"]).lte("data_tarefa", today),
            supabase.from("clients" as any).select("id", { count: "exact", head: true }).eq("tenant_id", tenantId).in("status", ["novo", "em_atendimento"]),
          ]);

          items.push(
            { icon: <Ruler className="h-3 w-3" />, label: "Medições", value: measureRes.count || 0 },
            { icon: <ListTodo className="h-3 w-3" />, label: "Tarefas hoje", value: tasksRes.count || 0 },
            { icon: <Users className="h-3 w-3" />, label: "Clientes", value: leadsRes.count || 0 },
          );
        } else {
          // Vendedor / default
          const [leadsRes, tasksRes, msgsRes] = await Promise.all([
            supabase.from("clients" as any).select("id", { count: "exact", head: true }).eq("tenant_id", tenantId).in("status", ["novo", "em_atendimento"]),
            supabase.from("tasks" as any).select("id", { count: "exact", head: true }).eq("tenant_id", tenantId).eq("assigned_to", userId).in("status", ["nova", "pendente", "em_execucao"]).lte("data_tarefa", today),
            supabase.from("tracking_messages" as any).select("id", { count: "exact", head: true }).eq("tenant_id", tenantId).eq("remetente_tipo", "cliente").eq("lida", false),
          ]);

          items.push(
            { icon: <Users className="h-3 w-3" />, label: "Leads", value: leadsRes.count || 0 },
            { icon: <ListTodo className="h-3 w-3" />, label: "Tarefas", value: tasksRes.count || 0 },
            { icon: <MessageCircle className="h-3 w-3" />, label: "Msgs", value: msgsRes.count || 0, color: (msgsRes.count || 0) > 0 ? "text-destructive" : undefined },
          );
        }
      } catch {
        // Non-critical
      }

      setKpis(items);
      setLoaded(true);
    };

    load();
  }, [tenantId, userId, cargoNome]);

  if (!loaded || kpis.length === 0) return null;

  return (
    <div className="px-3 py-1.5 border-b border-border bg-muted/20 shrink-0 flex items-center gap-1.5 overflow-x-auto animate-fade-in">
      <BarChart3 className="h-3 w-3 text-muted-foreground shrink-0" />
      <span className="text-[10px] text-muted-foreground font-medium shrink-0">Hoje:</span>
      {kpis.map((kpi, i) => (
        <Badge
          key={i}
          variant="outline"
          className={`text-[10px] gap-1 py-0 px-1.5 shrink-0 ${kpi.color || ""}`}
        >
          {kpi.icon}
          <span className="font-semibold">{kpi.value}</span>
          <span className="opacity-70">{kpi.label}</span>
        </Badge>
      ))}
    </div>
  );
});
