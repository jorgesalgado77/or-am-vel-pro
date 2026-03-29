import { useState, useEffect, useMemo, useRef } from "react";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import {
  TrendingUp, AlertTriangle, Zap, Target, Brain,
  ChevronDown, ChevronUp, Lightbulb, Clock, Flame,
} from "lucide-react";
import { getCommercialEngine, formatCurrency } from "@/services/commercial";
import type { DealContext, DealAnalysis, DealScenario, StrategyRecommendation, MessageContext } from "@/services/commercial/types";
import type { ChatConversation } from "./types";

interface Props {
  conversation: ChatConversation;
  tenantId: string | null;
  messageCount: number;
}

const RISK_CONFIG = {
  low: { label: "Baixo", color: "border-green-300 bg-green-50 text-green-800 dark:bg-green-950/30 dark:text-green-400 dark:border-green-700" },
  medium: { label: "Médio", color: "border-yellow-300 bg-yellow-50 text-yellow-800 dark:bg-yellow-950/30 dark:text-yellow-400 dark:border-yellow-700" },
  high: { label: "Alto", color: "border-red-300 bg-red-50 text-red-800 dark:bg-red-950/30 dark:text-red-400 dark:border-red-700" },
};

const AGGRESSIVENESS_CONFIG = {
  conservadora: { label: "Conservadora", icon: Target, color: "text-green-600 dark:text-green-400" },
  comercial: { label: "Comercial", icon: TrendingUp, color: "text-blue-600 dark:text-blue-400" },
  agressiva: { label: "Agressiva", icon: Zap, color: "text-amber-600 dark:text-amber-400" },
};

const URGENCY_CONFIG = {
  immediate: { label: "Agora", emoji: "🔥", color: "bg-red-100 text-red-800 border-red-300 dark:bg-red-950/40 dark:text-red-400 dark:border-red-700" },
  today: { label: "Hoje", emoji: "⚡", color: "bg-amber-100 text-amber-800 border-amber-300 dark:bg-amber-950/40 dark:text-amber-400 dark:border-amber-700" },
  this_week: { label: "Esta Semana", emoji: "📅", color: "bg-blue-100 text-blue-800 border-blue-300 dark:bg-blue-950/40 dark:text-blue-400 dark:border-blue-700" },
  low: { label: "Sem Pressa", emoji: "🕐", color: "bg-muted text-muted-foreground border-border" },
};

// ==================== SPARKLINE ====================

const PROB_HISTORY_KEY = "deal-prob-history";
const MAX_HISTORY = 20;

interface ProbPoint { ts: number; prob: number }

function loadProbHistory(conversationId: string): ProbPoint[] {
  try {
    const all = JSON.parse(localStorage.getItem(PROB_HISTORY_KEY) || "{}");
    return (all[conversationId] || []) as ProbPoint[];
  } catch { return []; }
}

function saveProbHistory(conversationId: string, points: ProbPoint[]) {
  try {
    const all = JSON.parse(localStorage.getItem(PROB_HISTORY_KEY) || "{}");
    all[conversationId] = points.slice(-MAX_HISTORY);
    localStorage.setItem(PROB_HISTORY_KEY, JSON.stringify(all));
  } catch {}
}

function ProbabilitySparkline({ points }: { points: ProbPoint[] }) {
  if (points.length < 2) return null;

  const w = 80, h = 20, pad = 1;
  const values = points.map(p => p.prob);
  const min = Math.max(0, Math.min(...values) - 5);
  const max = Math.min(100, Math.max(...values) + 5);
  const range = max - min || 1;

  const coords = values.map((v, i) => ({
    x: pad + (i / (values.length - 1)) * (w - pad * 2),
    y: pad + (1 - (v - min) / range) * (h - pad * 2),
  }));

  const pathD = coords.map((c, i) => `${i === 0 ? "M" : "L"} ${c.x.toFixed(1)} ${c.y.toFixed(1)}`).join(" ");
  const last = values[values.length - 1];
  const prev = values[values.length - 2];
  const trend = last >= prev ? "hsl(var(--chart-2))" : "hsl(var(--destructive))";

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} className="cursor-help shrink-0">
          <path d={pathD} fill="none" stroke={trend} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          <circle cx={coords[coords.length - 1].x} cy={coords[coords.length - 1].y} r="2" fill={trend} />
        </svg>
      </TooltipTrigger>
      <TooltipContent side="top" className="text-[10px]">
        <p>Evolução: {values[0]}% → {last}%</p>
        <p className="text-muted-foreground">{points.length} análises registradas</p>
      </TooltipContent>
    </Tooltip>
  );
}

// ==================== TYPES ====================

interface FullDecision {
  analysis: DealAnalysis;
  scenarios: DealScenario[];
  strategy: StrategyRecommendation;
  messageContext: MessageContext;
  urgency: "immediate" | "today" | "this_week" | "low";
  suggestedAction: string;
}

export function ChatDealInsights({ conversation, tenantId, messageCount }: Props) {
  const [decision, setDecision] = useState<FullDecision | null>(null);
  const [expanded, setExpanded] = useState(false);
  const [probHistory, setProbHistory] = useState<ProbPoint[]>([]);
  const convId = (conversation as unknown as Record<string, unknown>).id as string || "";

  const ctx = useMemo((): DealContext | null => {
    if (!tenantId) return null;
    const conv = conversation as unknown as Record<string, unknown>;

    const updatedAt = conv.updated_at as string | undefined;
    const daysInactive = updatedAt
      ? Math.floor((Date.now() - new Date(updatedAt).getTime()) / 86400000)
      : 0;

    return {
      tenant_id: tenantId,
      customer: {
        id: (conv.id as string) || "",
        name: (conv.nome_cliente as string) || "",
        status: (conv.status as string) || "novo",
        temperature: (conv.lead_temperature as DealContext["customer"]["temperature"]) || undefined,
        days_inactive: daysInactive,
        has_simulation: !!(conv.valor_orcamento as number),
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

  // Load probability history on conversation change
  useEffect(() => {
    if (convId) setProbHistory(loadProbHistory(convId));
  }, [convId]);

  useEffect(() => {
    if (!ctx || ctx.pricing.total_price === 0) { setDecision(null); return; }

    let cancelled = false;
    const engine = getCommercialEngine();

    engine.decideClientAction(ctx).then((result) => {
      if (!cancelled) {
        setDecision(result);
        // Record probability point
        if (convId) {
          const history = loadProbHistory(convId);
          const lastProb = history[history.length - 1]?.prob;
          // Only add if probability changed or no history yet
          if (lastProb !== result.analysis.closing_probability || history.length === 0) {
            history.push({ ts: Date.now(), prob: result.analysis.closing_probability });
            saveProbHistory(convId, history);
            setProbHistory([...history].slice(-MAX_HISTORY));
          }
        }
      }
    }).catch(() => {
      if (!cancelled) setDecision(null);
    });

    return () => { cancelled = true; };
  }, [ctx, messageCount, convId]);

  if (!decision) return null;

  const { analysis, scenarios, strategy, messageContext, urgency, suggestedAction } = decision;
  const risk = RISK_CONFIG[analysis.risk_level];
  const aggr = AGGRESSIVENESS_CONFIG[analysis.recommended_aggressiveness];
  const AggrIcon = aggr.icon;
  const urg = URGENCY_CONFIG[urgency];

  return (
    <div className="rounded-lg border border-border bg-muted/20 animate-in fade-in duration-300 overflow-hidden">
      {/* Header — always visible */}
      <button
        type="button"
        className="w-full px-3 py-2 flex items-center justify-between hover:bg-muted/40 transition-colors"
        onClick={() => setExpanded(!expanded)}
      >
        <div className="flex items-center gap-2 flex-wrap min-w-0">
          <Brain className="h-3.5 w-3.5 text-primary shrink-0" />
          <span className="text-xs font-semibold text-foreground">
            {analysis.closing_probability}%
          </span>
          <ProbabilitySparkline points={probHistory} />

          <Badge variant="outline" className={`text-[10px] px-1.5 py-0 h-4 ${risk.color}`}>
            Risco {risk.label}
          </Badge>

          <Badge variant="outline" className={`text-[10px] px-1.5 py-0 h-4 ${urg.color}`}>
            {urg.emoji} {urg.label}
          </Badge>

          {analysis.margin_alert && (
            <AlertTriangle className="h-3 w-3 text-destructive shrink-0" />
          )}
        </div>

        <div className="flex items-center gap-1 shrink-0">
          <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-4 gap-0.5">
            <AggrIcon className={`h-3 w-3 ${aggr.color}`} />
            {aggr.label}
          </Badge>
          {expanded
            ? <ChevronUp className="h-3.5 w-3.5 text-muted-foreground" />
            : <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
          }
        </div>
      </button>

      {/* Suggested action — always visible */}
      {suggestedAction && (
        <div className="px-3 pb-2 flex items-start gap-1.5">
          <Lightbulb className="h-3 w-3 text-amber-500 shrink-0 mt-0.5" />
          <p className="text-[10px] text-muted-foreground leading-relaxed line-clamp-2">
            {suggestedAction}
          </p>
        </div>
      )}

      {/* Expanded details */}
      {expanded && (
        <div className="border-t border-border px-3 py-2 space-y-3 animate-in fade-in slide-in-from-top-1 duration-200">
          {/* Insights */}
          {analysis.insights.length > 0 && (
            <div className="space-y-1">
              <p className="text-[10px] font-semibold text-foreground">Insights</p>
              {analysis.insights.map((insight, i) => (
                <p key={i} className="text-[10px] text-muted-foreground flex items-start gap-1">
                  <span className="text-primary shrink-0">•</span>
                  {insight}
                </p>
              ))}
            </div>
          )}

          {/* Scenarios */}
          {scenarios.length > 0 && (
            <div className="space-y-1.5">
              <p className="text-[10px] font-semibold text-foreground">Cenários de Negociação</p>
              <div className="grid gap-1.5">
                {scenarios.map((sc) => {
                  const isRecommended = sc.type === analysis.recommended_aggressiveness;
                  return (
                    <div
                      key={sc.type}
                      className={`rounded-md p-2 border text-[10px] ${
                        isRecommended
                          ? "border-primary/40 bg-primary/5"
                          : "border-border bg-card"
                      }`}
                    >
                      <div className="flex items-center justify-between mb-0.5">
                        <div className="flex items-center gap-1.5">
                          <span className="font-semibold text-foreground">{sc.label}</span>
                          {isRecommended && (
                            <Badge className="text-[8px] h-3.5 px-1 bg-primary/20 text-primary border-primary/30" variant="outline">
                              Recomendado
                            </Badge>
                          )}
                        </div>
                        <span className="font-mono font-semibold text-foreground">
                          {formatCurrency(sc.simulation.valorFinal)}
                        </span>
                      </div>
                      <div className="flex items-center gap-2 text-muted-foreground">
                        <span>D1: {sc.desconto1}%</span>
                        {sc.desconto2 > 0 && <span>D2: {sc.desconto2}%</span>}
                        {sc.desconto3 > 0 && <span>D3: {sc.desconto3}%</span>}
                        <span className="ml-auto">{sc.closing_probability}% prob.</span>
                      </div>
                      {!sc.margin_ok && (
                        <p className="text-destructive mt-0.5 flex items-center gap-0.5">
                          <AlertTriangle className="h-2.5 w-2.5" /> Margem violada
                        </p>
                      )}
                      {!sc.discount_ok && (
                        <p className="text-destructive flex items-center gap-0.5">
                          <AlertTriangle className="h-2.5 w-2.5" /> Desconto excede limite
                        </p>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Strategy */}
          {strategy.reasoning && (
            <div className="space-y-1">
              <p className="text-[10px] font-semibold text-foreground flex items-center gap-1">
                <Flame className="h-3 w-3 text-amber-500" />
                Estratégia IA
              </p>
              <p className="text-[10px] text-muted-foreground leading-relaxed">
                {strategy.reasoning}
              </p>
              {strategy.suggested_discount && (
                <div className="text-[10px] text-muted-foreground flex items-center gap-2 mt-0.5">
                  <span>Desconto sugerido:</span>
                  <span className="font-mono font-medium text-foreground">
                    D1: {strategy.suggested_discount.recommended_d1}%
                    {strategy.suggested_discount.recommended_d2 > 0 && ` · D2: ${strategy.suggested_discount.recommended_d2}%`}
                    {strategy.suggested_discount.recommended_d3 > 0 && ` · D3: ${strategy.suggested_discount.recommended_d3}%`}
                  </span>
                </div>
              )}
            </div>
          )}

          {/* Message context */}
          <div className="flex items-center gap-2 flex-wrap">
            <Badge variant="secondary" className="text-[9px] h-4">
              Copy: {messageContext.tipo_copy}
            </Badge>
            <Badge variant="secondary" className="text-[9px] h-4">
              Tom: {messageContext.tom}
            </Badge>
            {messageContext.disc_profile && (
              <Badge variant="secondary" className="text-[9px] h-4">
                DISC: {messageContext.disc_profile}
              </Badge>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
