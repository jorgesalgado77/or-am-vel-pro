/**
 * MIAFinancialAlerts — Shows overdue and upcoming financial accounts in MIA chat.
 */
import { useEffect, useState, memo, useCallback } from "react";
import { supabase } from "@/lib/supabaseClient";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatCurrency } from "@/lib/financing";
import { format } from "date-fns";
import {
  AlertTriangle, Clock, ChevronDown, ChevronUp, DollarSign, RefreshCw, CheckCircle2, Loader2,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

interface FinancialAlert {
  id: string;
  name: string;
  amount: number;
  due_date: string;
  status: string;
  type: "vencida" | "a_vencer";
}

interface Props {
  tenantId: string;
}

const CACHE_KEY = "mia_financial_alerts_cache";
const CACHE_TTL = 5 * 60 * 1000; // 5 min

export const MIAFinancialAlerts = memo(function MIAFinancialAlerts({ tenantId }: Props) {
  const [alerts, setAlerts] = useState<FinancialAlert[]>([]);
  const [expanded, setExpanded] = useState(false);
  const [loading, setLoading] = useState(false);
  const [loaded, setLoaded] = useState(false);

  const fetchAlerts = useCallback(async (skipCache = false) => {
    if (!skipCache) {
      try {
        const cached = sessionStorage.getItem(CACHE_KEY);
        if (cached) {
          const { alerts: cachedAlerts, timestamp } = JSON.parse(cached);
          if (Date.now() - timestamp < CACHE_TTL) {
            setAlerts(cachedAlerts);
            setLoaded(true);
            return;
          }
        }
      } catch { /* ignore */ }
    }

    setLoading(true);
    try {
      const today = new Date().toISOString().slice(0, 10);
      const in7days = new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10);

      const [overdueRes, upcomingRes] = await Promise.all([
        supabase
          .from("financial_accounts" as any)
          .select("id, name, amount, due_date, status")
          .eq("tenant_id", tenantId)
          .eq("status", "pendente")
          .lt("due_date", today)
          .order("due_date", { ascending: true })
          .limit(10),
        supabase
          .from("financial_accounts" as any)
          .select("id, name, amount, due_date, status")
          .eq("tenant_id", tenantId)
          .eq("status", "pendente")
          .gte("due_date", today)
          .lte("due_date", in7days)
          .order("due_date", { ascending: true })
          .limit(10),
      ]);

      const result: FinancialAlert[] = [
        ...((overdueRes.data as any[]) || []).map((a: any) => ({ ...a, type: "vencida" as const })),
        ...((upcomingRes.data as any[]) || []).map((a: any) => ({ ...a, type: "a_vencer" as const })),
      ];

      setAlerts(result);
      setLoaded(true);

      try {
        sessionStorage.setItem(CACHE_KEY, JSON.stringify({ alerts: result, timestamp: Date.now() }));
      } catch { /* ignore */ }
    } catch (err) {
      console.warn("[MIA Financial Alerts] Error:", err);
    } finally {
      setLoading(false);
    }
  }, [tenantId]);

  useEffect(() => {
    fetchAlerts();
  }, [fetchAlerts]);

  if (!loaded || alerts.length === 0) return null;

  const overdueCount = alerts.filter(a => a.type === "vencida").length;
  const upcomingCount = alerts.filter(a => a.type === "a_vencer").length;
  const totalOverdue = alerts.filter(a => a.type === "vencida").reduce((s, a) => s + a.amount, 0);

  return (
    <div className="border-b border-border shrink-0 animate-fade-in">
      <button
        onClick={() => setExpanded(v => !v)}
        className="w-full px-3 py-2 flex items-center gap-2 hover:bg-muted/30 transition-colors"
      >
        <DollarSign className={cn(
          "h-3.5 w-3.5 shrink-0",
          overdueCount > 0 ? "text-destructive" : "text-amber-500"
        )} />
        <span className="text-[11px] font-semibold text-foreground flex-1 text-left">
          Alertas Financeiros
        </span>
        <div className="flex items-center gap-1">
          {overdueCount > 0 && (
            <Badge variant="outline" className="text-[9px] py-0 px-1 border-destructive/30 text-destructive">
              {overdueCount} vencida{overdueCount > 1 ? "s" : ""}
            </Badge>
          )}
          {upcomingCount > 0 && (
            <Badge variant="outline" className="text-[9px] py-0 px-1 border-amber-500/30 text-amber-600">
              {upcomingCount} a vencer
            </Badge>
          )}
          <Button
            variant="ghost"
            size="icon"
            className="h-5 w-5"
            onClick={(e) => { e.stopPropagation(); fetchAlerts(true); }}
            disabled={loading}
          >
            <RefreshCw className={cn("h-3 w-3 text-muted-foreground", loading && "animate-spin")} />
          </Button>
          {expanded ? <ChevronUp className="h-3 w-3 text-muted-foreground" /> : <ChevronDown className="h-3 w-3 text-muted-foreground" />}
        </div>
      </button>

      {expanded && (
        <div className="px-3 pb-2.5 space-y-1.5 animate-fade-in">
          {/* Overdue summary */}
          {overdueCount > 0 && (
            <div className="flex items-center gap-1.5 px-2 py-1 rounded-md bg-destructive/5 text-[10px] text-destructive font-medium">
              <AlertTriangle className="h-3 w-3 shrink-0" />
              🚨 Total vencido: {formatCurrency(totalOverdue)}
            </div>
          )}

          {alerts.map((alert) => (
            <div
              key={alert.id}
              className={cn(
                "flex items-start gap-2 rounded-md px-2 py-1.5 text-[11px] leading-relaxed",
                alert.type === "vencida" && "bg-destructive/5 text-destructive",
                alert.type === "a_vencer" && "bg-amber-500/5 text-amber-700 dark:text-amber-400",
              )}
            >
              <span className="shrink-0 mt-0.5">
                {alert.type === "vencida"
                  ? <AlertTriangle className="h-3.5 w-3.5" />
                  : <Clock className="h-3.5 w-3.5" />
                }
              </span>
              <span className="flex-1 min-w-0">
                <span className="font-medium">{alert.name}</span>
                {" · "}
                {formatCurrency(alert.amount)}
                {" · "}
                {format(new Date(alert.due_date + "T12:00:00"), "dd/MM")}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
});
