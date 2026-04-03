/**
 * MIAWeeklyInsights — Collapsible weekly insights panel in MIA chat.
 * Queries last 7 days of data and generates trend analysis.
 * Cargo-aware: different metrics per role.
 */
import { useEffect, useState, memo, useCallback } from "react";
import { supabase } from "@/lib/supabaseClient";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  TrendingUp, TrendingDown, Minus, ChevronDown, ChevronUp,
  BarChart3, RefreshCw, Sparkles,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface WeeklyData {
  contractsThisWeek: number;
  contractsLastWeek: number;
  newLeadsThisWeek: number;
  newLeadsLastWeek: number;
  tasksCompletedThisWeek: number;
  tasksCompletedLastWeek: number;
  overdueTasksNow: number;
  staleLeadsNow: number;
  unreadMessagesNow: number;
  simulationsThisWeek: number;
  measurementsPendingNow?: number;
}

interface InsightItem {
  icon: React.ReactNode;
  text: string;
  type: "positive" | "negative" | "neutral";
}

interface Props {
  tenantId: string;
  userId: string;
  cargoNome: string | null;
}

const CACHE_KEY = "mia_weekly_insights_cache";
const CACHE_TTL = 15 * 60 * 1000; // 15 min

function getTrendIcon(current: number, previous: number) {
  if (current > previous) return <TrendingUp className="h-3 w-3 text-emerald-500" />;
  if (current < previous) return <TrendingDown className="h-3 w-3 text-destructive" />;
  return <Minus className="h-3 w-3 text-muted-foreground" />;
}

function pctChange(current: number, previous: number): string {
  if (previous === 0) return current > 0 ? "+100%" : "0%";
  const change = Math.round(((current - previous) / previous) * 100);
  return change > 0 ? `+${change}%` : `${change}%`;
}

function generateInsights(data: WeeklyData, cargoNome: string | null): InsightItem[] {
  const insights: InsightItem[] = [];
  const cargo = (cargoNome || "").toLowerCase();
  const isManager = cargo.includes("gerente") || cargo.includes("administrador") || cargo.includes("admin");
  const isProjetista = cargo.includes("projetista") || cargo.includes("designer");

  // Contracts trend
  if (data.contractsThisWeek > data.contractsLastWeek) {
    insights.push({
      icon: <TrendingUp className="h-3.5 w-3.5" />,
      text: `📈 Vendas em alta! ${data.contractsThisWeek} contrato(s) esta semana vs ${data.contractsLastWeek} na anterior (${pctChange(data.contractsThisWeek, data.contractsLastWeek)}).`,
      type: "positive",
    });
  } else if (data.contractsThisWeek < data.contractsLastWeek) {
    insights.push({
      icon: <TrendingDown className="h-3.5 w-3.5" />,
      text: `📉 Vendas caíram: ${data.contractsThisWeek} contrato(s) esta semana vs ${data.contractsLastWeek} na anterior. Hora de intensificar o follow-up!`,
      type: "negative",
    });
  } else if (data.contractsThisWeek > 0) {
    insights.push({
      icon: <Minus className="h-3.5 w-3.5" />,
      text: `📊 Vendas estáveis: ${data.contractsThisWeek} contrato(s) esta semana, igual à anterior.`,
      type: "neutral",
    });
  }

  // Leads trend
  if (data.newLeadsThisWeek > data.newLeadsLastWeek) {
    insights.push({
      icon: <TrendingUp className="h-3.5 w-3.5" />,
      text: `🔥 ${data.newLeadsThisWeek} novos leads esta semana (${pctChange(data.newLeadsThisWeek, data.newLeadsLastWeek)}). Aproveite o momento!`,
      type: "positive",
    });
  } else if (data.newLeadsThisWeek < data.newLeadsLastWeek && data.newLeadsLastWeek > 0) {
    insights.push({
      icon: <TrendingDown className="h-3.5 w-3.5" />,
      text: `⚠️ Captação de leads caiu: ${data.newLeadsThisWeek} novos vs ${data.newLeadsLastWeek} na semana anterior. Revise as campanhas!`,
      type: "negative",
    });
  }

  // Productivity
  if (data.tasksCompletedThisWeek > data.tasksCompletedLastWeek) {
    insights.push({
      icon: <TrendingUp className="h-3.5 w-3.5" />,
      text: `✅ Produtividade cresceu: ${data.tasksCompletedThisWeek} tarefas concluídas (${pctChange(data.tasksCompletedThisWeek, data.tasksCompletedLastWeek)}).`,
      type: "positive",
    });
  } else if (data.tasksCompletedThisWeek < data.tasksCompletedLastWeek && data.tasksCompletedLastWeek > 0) {
    insights.push({
      icon: <TrendingDown className="h-3.5 w-3.5" />,
      text: `🐢 Produtividade caiu: ${data.tasksCompletedThisWeek} tarefas concluídas vs ${data.tasksCompletedLastWeek} na semana anterior.`,
      type: "negative",
    });
  }

  // Bottlenecks
  if (data.overdueTasksNow > 3) {
    insights.push({
      icon: <TrendingDown className="h-3.5 w-3.5" />,
      text: `🚧 Gargalo detectado: ${data.overdueTasksNow} tarefas atrasadas acumuladas. Priorize ou delegue!`,
      type: "negative",
    });
  }

  if (data.staleLeadsNow > 5) {
    insights.push({
      icon: <TrendingDown className="h-3.5 w-3.5" />,
      text: `🚨 ${data.staleLeadsNow} leads parados há 2+ dias. Risco de perder vendas!`,
      type: "negative",
    });
  }

  if (data.unreadMessagesNow > 10) {
    insights.push({
      icon: <TrendingDown className="h-3.5 w-3.5" />,
      text: `💬 ${data.unreadMessagesNow} mensagens sem resposta. Clientes aguardando!`,
      type: "negative",
    });
  }

  // Projetista specific
  if (isProjetista && data.measurementsPendingNow && data.measurementsPendingNow > 0) {
    insights.push({
      icon: <Minus className="h-3.5 w-3.5" />,
      text: `📐 ${data.measurementsPendingNow} medição(ões) pendente(s). Organize sua agenda!`,
      type: "neutral",
    });
  }

  // Simulations insight
  if (data.simulationsThisWeek > 0) {
    const conversionRate = data.contractsThisWeek > 0 && data.simulationsThisWeek > 0
      ? Math.round((data.contractsThisWeek / data.simulationsThisWeek) * 100)
      : 0;
    if (conversionRate > 0) {
      insights.push({
        icon: conversionRate >= 30 ? <TrendingUp className="h-3.5 w-3.5" /> : <TrendingDown className="h-3.5 w-3.5" />,
        text: `🎯 Taxa de conversão: ${conversionRate}% (${data.contractsThisWeek} contratos de ${data.simulationsThisWeek} simulações).`,
        type: conversionRate >= 30 ? "positive" : "negative",
      });
    }
  }

  // Manager summary
  if (isManager && insights.length === 0) {
    insights.push({
      icon: <Minus className="h-3.5 w-3.5" />,
      text: "📊 Sem dados suficientes esta semana para gerar tendências. Continue registrando atividades!",
      type: "neutral",
    });
  }

  return insights;
}

export const MIAWeeklyInsights = memo(function MIAWeeklyInsights({ tenantId, userId, cargoNome }: Props) {
  const [insights, setInsights] = useState<InsightItem[]>([]);
  const [expanded, setExpanded] = useState(false);
  const [loading, setLoading] = useState(false);
  const [loaded, setLoaded] = useState(false);

  const cargo = (cargoNome || "").toLowerCase();
  const isManager = cargo.includes("gerente") || cargo.includes("administrador") || cargo.includes("admin");

  const fetchInsights = useCallback(async (skipCache = false) => {
    // Check cache
    if (!skipCache) {
      try {
        const cached = sessionStorage.getItem(CACHE_KEY);
        if (cached) {
          const { insights: cachedInsights, timestamp } = JSON.parse(cached);
          if (Date.now() - timestamp < CACHE_TTL) {
            setInsights(cachedInsights);
            setLoaded(true);
            return;
          }
        }
      } catch { /* ignore */ }
    }

    setLoading(true);
    const now = new Date();
    const weekStart = new Date(now);
    weekStart.setDate(now.getDate() - 7);
    const lastWeekStart = new Date(now);
    lastWeekStart.setDate(now.getDate() - 14);
    const twoDaysAgo = new Date(Date.now() - 2 * 86400000).toISOString();
    const today = now.toISOString().slice(0, 10);

    try {
      const [
        contractsThisWeekRes,
        contractsLastWeekRes,
        newLeadsThisWeekRes,
        newLeadsLastWeekRes,
        tasksCompThisWeekRes,
        tasksCompLastWeekRes,
        overdueRes,
        staleLeadsRes,
        unreadRes,
        simsRes,
        measureRes,
      ] = await Promise.all([
        supabase.from("client_contracts" as any).select("id", { count: "exact", head: true }).eq("tenant_id", tenantId).gte("created_at", weekStart.toISOString()),
        supabase.from("client_contracts" as any).select("id", { count: "exact", head: true }).eq("tenant_id", tenantId).gte("created_at", lastWeekStart.toISOString()).lt("created_at", weekStart.toISOString()),
        supabase.from("clients" as any).select("id", { count: "exact", head: true }).eq("tenant_id", tenantId).gte("created_at", weekStart.toISOString()),
        supabase.from("clients" as any).select("id", { count: "exact", head: true }).eq("tenant_id", tenantId).gte("created_at", lastWeekStart.toISOString()).lt("created_at", weekStart.toISOString()),
        supabase.from("tasks" as any).select("id", { count: "exact", head: true }).eq("tenant_id", tenantId).eq("status", "concluida").gte("updated_at", weekStart.toISOString()),
        supabase.from("tasks" as any).select("id", { count: "exact", head: true }).eq("tenant_id", tenantId).eq("status", "concluida").gte("updated_at", lastWeekStart.toISOString()).lt("updated_at", weekStart.toISOString()),
        supabase.from("tasks" as any).select("id", { count: "exact", head: true }).eq("tenant_id", tenantId).in("status", ["nova", "pendente", "em_execucao"]).lt("data_tarefa", today),
        supabase.from("clients" as any).select("id", { count: "exact", head: true }).eq("tenant_id", tenantId).in("status", ["novo", "em_atendimento"]).lt("updated_at", twoDaysAgo),
        supabase.from("tracking_messages" as any).select("id", { count: "exact", head: true }).eq("tenant_id", tenantId).eq("remetente_tipo", "cliente").eq("lida", false),
        supabase.from("simulations" as any).select("id", { count: "exact", head: true }).eq("tenant_id", tenantId).gte("created_at", weekStart.toISOString()),
        supabase.from("measurement_requests" as any).select("id", { count: "exact", head: true }).eq("tenant_id", tenantId).in("status", ["pendente", "agendada"]),
      ]);

      const data: WeeklyData = {
        contractsThisWeek: contractsThisWeekRes.count || 0,
        contractsLastWeek: contractsLastWeekRes.count || 0,
        newLeadsThisWeek: newLeadsThisWeekRes.count || 0,
        newLeadsLastWeek: newLeadsLastWeekRes.count || 0,
        tasksCompletedThisWeek: tasksCompThisWeekRes.count || 0,
        tasksCompletedLastWeek: tasksCompLastWeekRes.count || 0,
        overdueTasksNow: overdueRes.count || 0,
        staleLeadsNow: staleLeadsRes.count || 0,
        unreadMessagesNow: unreadRes.count || 0,
        simulationsThisWeek: simsRes.count || 0,
        measurementsPendingNow: measureRes.count || 0,
      };

      const generated = generateInsights(data, cargoNome);
      setInsights(generated);
      setLoaded(true);

      // Cache
      try {
        sessionStorage.setItem(CACHE_KEY, JSON.stringify({ insights: generated, timestamp: Date.now() }));
      } catch { /* ignore */ }
    } catch (err) {
      console.warn("[MIA Weekly Insights] Error:", err);
    } finally {
      setLoading(false);
    }
  }, [tenantId, userId, cargoNome]);

  useEffect(() => {
    fetchInsights();
  }, [fetchInsights]);

  if (!loaded || insights.length === 0) return null;

  const positiveCount = insights.filter(i => i.type === "positive").length;
  const negativeCount = insights.filter(i => i.type === "negative").length;
  const overallTrend = positiveCount > negativeCount ? "positive" : negativeCount > positiveCount ? "negative" : "neutral";

  return (
    <div className="border-b border-border shrink-0 animate-fade-in">
      <button
        onClick={() => setExpanded(v => !v)}
        className="w-full px-3 py-2 flex items-center gap-2 hover:bg-muted/30 transition-colors"
      >
        <Sparkles className={cn(
          "h-3.5 w-3.5 shrink-0",
          overallTrend === "positive" ? "text-emerald-500" : overallTrend === "negative" ? "text-destructive" : "text-muted-foreground"
        )} />
        <span className="text-[11px] font-semibold text-foreground flex-1 text-left">
          Insights da Semana
        </span>
        <div className="flex items-center gap-1">
          {positiveCount > 0 && (
            <Badge variant="outline" className="text-[9px] py-0 px-1 border-emerald-500/30 text-emerald-600">
              {positiveCount} ↑
            </Badge>
          )}
          {negativeCount > 0 && (
            <Badge variant="outline" className="text-[9px] py-0 px-1 border-destructive/30 text-destructive">
              {negativeCount} ↓
            </Badge>
          )}
          <Button
            variant="ghost"
            size="icon"
            className="h-5 w-5"
            onClick={(e) => { e.stopPropagation(); fetchInsights(true); }}
            disabled={loading}
          >
            <RefreshCw className={cn("h-3 w-3 text-muted-foreground", loading && "animate-spin")} />
          </Button>
          {expanded ? <ChevronUp className="h-3 w-3 text-muted-foreground" /> : <ChevronDown className="h-3 w-3 text-muted-foreground" />}
        </div>
      </button>

      {expanded && (
        <div className="px-3 pb-2.5 space-y-1.5 animate-fade-in">
          {insights.map((insight, i) => (
            <div
              key={i}
              className={cn(
                "flex items-start gap-2 rounded-md px-2 py-1.5 text-[11px] leading-relaxed",
                insight.type === "positive" && "bg-emerald-500/5 text-emerald-700 dark:text-emerald-400",
                insight.type === "negative" && "bg-destructive/5 text-destructive",
                insight.type === "neutral" && "bg-muted/40 text-muted-foreground"
              )}
            >
              <span className="shrink-0 mt-0.5">{insight.icon}</span>
              <span>{insight.text}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
});
