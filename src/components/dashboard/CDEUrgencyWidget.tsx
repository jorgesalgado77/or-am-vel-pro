/**
 * CDEUrgencyWidget — Shows CDE decision summary by urgency level.
 * Counts leads in each urgency bucket (immediate, today, this_week, low) with suggested actions.
 */
import { useState, useEffect, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Zap, Clock, CalendarDays, TrendingDown, Target, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/lib/supabaseClient";
import { getResolvedTenantId } from "@/contexts/TenantContext";
import { getCommercialEngine } from "@/services/commercial/CommercialDecisionEngine";
import type { TriggerAction, TriggerContext } from "@/services/commercial/types";

interface UrgencyBucket {
  urgency: TriggerAction["urgency"];
  label: string;
  icon: React.ReactNode;
  color: string;
  leads: Array<{
    clientName: string;
    action: string;
    probability: number;
    reasoning: string;
  }>;
}

const URGENCY_CONFIG: Record<TriggerAction["urgency"], { label: string; icon: React.ReactNode; color: string }> = {
  immediate: { label: "Imediato", icon: <Zap className="h-4 w-4" />, color: "text-red-500" },
  today: { label: "Hoje", icon: <Clock className="h-4 w-4" />, color: "text-amber-500" },
  this_week: { label: "Esta Semana", icon: <CalendarDays className="h-4 w-4" />, color: "text-blue-500" },
  low: { label: "Baixa", icon: <TrendingDown className="h-4 w-4" />, color: "text-muted-foreground" },
};

const ACTION_LABELS: Record<string, string> = {
  send_message: "Enviar mensagem",
  send_with_discount: "Enviar c/ desconto",
  suggest_dealroom: "Sugerir Deal Room",
  schedule_followup: "Agendar follow-up",
  wait: "Aguardar",
  escalate: "Escalar p/ gerente",
};

export function CDEUrgencyWidget() {
  const [buckets, setBuckets] = useState<UrgencyBucket[]>([]);
  const [loading, setLoading] = useState(true);
  const [total, setTotal] = useState(0);

  const analyze = useCallback(async () => {
    setLoading(true);
    const tenantId = await getResolvedTenantId();
    if (!tenantId) { setLoading(false); return; }

    const { data: triggers } = await supabase
      .from("vendazap_triggers" as unknown as "clients")
      .select("id, trigger_type, client_id, client_nome, generated_message, created_at, status")
      .eq("tenant_id", tenantId)
      .eq("status", "pending")
      .order("created_at", { ascending: false })
      .limit(30);

    if (!triggers || triggers.length === 0) {
      setBuckets([]);
      setTotal(0);
      setLoading(false);
      return;
    }

    const engine = getCommercialEngine();
    const results = new Map<TriggerAction["urgency"], UrgencyBucket["leads"]>();
    for (const u of ["immediate", "today", "this_week", "low"] as const) {
      results.set(u, []);
    }

    const typedTriggers = triggers as unknown as Array<{
      id: string;
      trigger_type: "no_response" | "expiring_budget" | "viewed_no_reply";
      client_id: string;
      client_nome: string;
      generated_message: string;
      created_at: string;
      status: string;
    }>;

    await Promise.all(
      typedTriggers.map(async (t) => {
        try {
          const daysInactive = Math.floor(
            (Date.now() - new Date(t.created_at).getTime()) / 86400000
          );

          const triggerCtx: TriggerContext = {
            trigger_id: t.id,
            trigger_type: t.trigger_type,
            tenant_id: tenantId,
            client_id: t.client_id,
            client_name: t.client_nome,
            client_status: "Em Negociação",
            days_inactive: daysInactive,
            has_simulation: true,
            valor_orcamento: 0,
            generated_message: t.generated_message,
          };

          const action = await engine.decideTriggerAction(triggerCtx);
          results.get(action.urgency)?.push({
            clientName: t.client_nome,
            action: ACTION_LABELS[action.action] || action.action,
            probability: action.closing_probability,
            reasoning: action.reasoning,
          });
        } catch {
          // skip individual failures
        }
      })
    );

    const finalBuckets: UrgencyBucket[] = (
      ["immediate", "today", "this_week", "low"] as const
    ).map((u) => ({
      urgency: u,
      ...URGENCY_CONFIG[u],
      leads: results.get(u) || [],
    }));

    setBuckets(finalBuckets);
    setTotal(typedTriggers.length);
    setLoading(false);
  }, []);

  useEffect(() => { analyze(); }, [analyze]);

  if (loading) {
    return (
      <Card>
        <CardContent className="py-6 flex items-center justify-center gap-2 text-sm text-muted-foreground">
          <RefreshCw className="h-4 w-4 animate-spin" /> Analisando decisões comerciais...
        </CardContent>
      </Card>
    );
  }

  if (total === 0) return null;

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm flex items-center gap-2">
            <Target className="h-4 w-4 text-primary" />
            Decisões CDE — {total} leads analisados
          </CardTitle>
          <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={analyze}>
            <RefreshCw className="h-3 w-3 mr-1" /> Atualizar
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
          {buckets.map((b) => (
            <div key={b.urgency} className="rounded-lg border border-border p-3 text-center">
              <div className={`flex items-center justify-center gap-1.5 mb-1 ${b.color}`}>
                {b.icon}
                <span className="text-xs font-medium">{b.label}</span>
              </div>
              <p className="text-2xl font-bold text-foreground">{b.leads.length}</p>
            </div>
          ))}
        </div>

        {buckets.some((b) => b.leads.length > 0) && (
          <ScrollArea className="h-[200px]">
            <div className="space-y-2">
              {buckets
                .filter((b) => b.leads.length > 0)
                .flatMap((b) =>
                  b.leads.map((lead, i) => (
                    <div
                      key={`${b.urgency}-${i}`}
                      className="flex items-center justify-between gap-2 text-xs border rounded-md px-3 py-2"
                    >
                      <div className="min-w-0 flex-1">
                        <span className="font-medium text-foreground truncate block">{lead.clientName}</span>
                        <span className="text-muted-foreground">{lead.reasoning}</span>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <Badge variant="outline" className="text-[10px]">{lead.action}</Badge>
                        <span className={`text-[10px] font-mono ${lead.probability > 60 ? "text-emerald-500" : lead.probability > 30 ? "text-amber-500" : "text-red-500"}`}>
                          {lead.probability}%
                        </span>
                      </div>
                    </div>
                  ))
                )}
            </div>
          </ScrollArea>
        )}
      </CardContent>
    </Card>
  );
}
