import { useState, useEffect, useMemo } from "react";
import { Badge } from "@/components/ui/badge";
import { TrendingUp, AlertTriangle, Zap, Target } from "lucide-react";
import { getCommercialEngine } from "@/services/commercial";
import type { DealContext, DealAnalysis } from "@/services/commercial/types";
import type { ChatConversation } from "./types";

interface Props {
  conversation: ChatConversation;
  tenantId: string | null;
  messageCount: number; // triggers re-analysis when new messages arrive
}

const RISK_CONFIG = {
  low: { label: "Baixo", color: "bg-green-100 text-green-800 border-green-200" },
  medium: { label: "Médio", color: "bg-yellow-100 text-yellow-800 border-yellow-200" },
  high: { label: "Alto", color: "bg-red-100 text-red-800 border-red-200" },
};

const AGGRESSIVENESS_CONFIG = {
  conservadora: { label: "Conservadora", icon: Target },
  comercial: { label: "Comercial", icon: TrendingUp },
  agressiva: { label: "Agressiva", icon: Zap },
};

export function ChatDealInsights({ conversation, tenantId, messageCount }: Props) {
  const [analysis, setAnalysis] = useState<DealAnalysis | null>(null);

  const ctx = useMemo((): DealContext | null => {
    if (!tenantId) return null;
    const conv = conversation as any;

    const daysInactive = conv.updated_at
      ? Math.floor((Date.now() - new Date(conv.updated_at).getTime()) / 86400000)
      : 0;

    return {
      tenant_id: tenantId,
      customer: {
        id: conv.id || "",
        name: conv.nome_cliente || "",
        status: conv.status || "novo",
        temperature: conv.lead_temperature || undefined,
        days_inactive: daysInactive,
        has_simulation: !!conv.valor_orcamento,
      },
      pricing: {
        total_price: Number(conv.valor_orcamento) || 0,
      },
      payment: {
        forma_pagamento: "Boleto",
        parcelas: 1,
        valor_entrada: 0,
        plus_percentual: 0,
      },
      discounts: {
        desconto1: 0,
        desconto2: 0,
        desconto3: 0,
      },
    };
  }, [conversation, tenantId]);

  useEffect(() => {
    if (!ctx || ctx.pricing.total_price === 0) { setAnalysis(null); return; }
    const engine = getCommercialEngine();
    engine.analyzeDeal(ctx).then(setAnalysis).catch(() => setAnalysis(null));
  }, [ctx, messageCount]);

  if (!analysis) return null;

  const risk = RISK_CONFIG[analysis.risk_level];
  const aggr = AGGRESSIVENESS_CONFIG[analysis.recommended_aggressiveness];
  const AggrIcon = aggr.icon;

  return (
    <div className="mx-3 mb-1 px-3 py-2 rounded-lg border border-border bg-muted/30 animate-in fade-in duration-300">
      <div className="flex items-center gap-2 flex-wrap">
        <div className="flex items-center gap-1.5">
          <TrendingUp className="h-3.5 w-3.5 text-primary" />
          <span className="text-xs font-semibold text-foreground">
            {analysis.closing_probability}% fechamento
          </span>
        </div>

        <Badge variant="outline" className={`text-[10px] px-1.5 py-0 ${risk.color}`}>
          Risco {risk.label}
        </Badge>

        <Badge variant="outline" className="text-[10px] px-1.5 py-0 gap-1">
          <AggrIcon className="h-3 w-3" />
          {aggr.label}
        </Badge>

        {analysis.margin_alert && (
          <Badge variant="destructive" className="text-[10px] px-1.5 py-0 gap-1">
            <AlertTriangle className="h-3 w-3" />
            Margem
          </Badge>
        )}
      </div>

      {analysis.insights.length > 0 && (
        <p className="text-[10px] text-muted-foreground mt-1 line-clamp-2">
          {analysis.insights[0]}
        </p>
      )}
    </div>
  );
}
