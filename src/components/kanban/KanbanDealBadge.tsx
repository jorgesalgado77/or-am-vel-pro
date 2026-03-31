/**
 * KanbanDealBadge — Lightweight CDE insight badge for Kanban cards.
 * Shows urgency, closing probability and a tooltip with the suggested action.
 */
import { useState, useEffect, memo } from "react";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Brain } from "lucide-react";
import { getCommercialEngine } from "@/services/commercial";
import type { DealContext } from "@/services/commercial/types";

interface Props {
  clientId: string;
  clientName: string;
  clientStatus: string;
  tenantId: string;
  daysInactive: number;
  hasSimulation: boolean;
  valorOrcamento?: number;
  temperature?: string;
}

const URGENCY_BADGE = {
  immediate: { label: "🔥", cls: "border-red-400 bg-red-50 text-red-700 dark:bg-red-950/30 dark:text-red-400 dark:border-red-700" },
  today: { label: "⚡", cls: "border-amber-400 bg-amber-50 text-amber-700 dark:bg-amber-950/30 dark:text-amber-400 dark:border-amber-700" },
  this_week: { label: "📅", cls: "border-blue-400 bg-blue-50 text-blue-700 dark:bg-blue-950/30 dark:text-blue-400 dark:border-blue-700" },
  low: { label: "🕐", cls: "border-muted-foreground/30 text-muted-foreground" },
};

export const KanbanDealBadge = memo(function KanbanDealBadge({
  clientId,
  clientName,
  clientStatus,
  tenantId,
  daysInactive,
  hasSimulation,
  valorOrcamento,
  temperature,
}: Props) {
  const [result, setResult] = useState<{
    probability: number;
    urgency: "immediate" | "today" | "this_week" | "low";
    action: string;
  } | null>(null);

  useEffect(() => {
    // Skip for closed/lost clients or those without simulation value
    if (["fechado", "perdido", "finalizado"].includes(clientStatus)) return;
    if (!valorOrcamento || valorOrcamento <= 0) return;

    let cancelled = false;
    const engine = getCommercialEngine();

    const ctx: DealContext = {
      tenant_id: tenantId,
      customer: {
        id: clientId,
        name: clientName,
        status: clientStatus,
        temperature: temperature as DealContext["customer"]["temperature"],
        days_inactive: daysInactive,
        has_simulation: hasSimulation,
      },
      pricing: { total_price: valorOrcamento },
      payment: {
        forma_pagamento: "Boleto",
        parcelas: 1,
        valor_entrada: 0,
        plus_percentual: 0,
      },
      discounts: { desconto1: 0, desconto2: 0, desconto3: 0 },
    };

    engine.decideClientAction(ctx).then((decision) => {
      if (!cancelled) {
        setResult({
          probability: decision.analysis.closing_probability,
          urgency: decision.urgency,
          action: decision.suggestedAction,
        });
      }
    }).catch(() => {});

    return () => { cancelled = true; };
  }, [clientId, clientStatus, tenantId, daysInactive, hasSimulation, valorOrcamento, temperature, clientName]);

  if (!result) return null;

  const urg = URGENCY_BADGE[result.urgency];

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span className="inline-flex">
          <Badge variant="outline" className={`text-[9px] h-4 px-1 font-medium gap-0.5 cursor-help ${urg.cls}`}>
            <Brain className="h-2.5 w-2.5" />
            {urg.label} {result.probability}%
          </Badge>
        </span>
      </TooltipTrigger>
      <TooltipContent side="top" className="max-w-[240px] text-xs leading-relaxed">
        <p className="font-semibold mb-0.5">🧠 IA Comercial — {result.probability}% fechamento</p>
        <p className="text-muted-foreground">{result.action}</p>
      </TooltipContent>
    </Tooltip>
  );
});
