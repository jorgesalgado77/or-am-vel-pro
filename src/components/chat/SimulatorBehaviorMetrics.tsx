/**
 * SimulatorBehaviorMetrics — Real-time behavior engine metrics during simulation.
 * Shows engagementScore, resistanceLevel, and predictedNextMove.
 */
import { useMemo } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Brain, TrendingUp, Shield, Navigation } from "lucide-react";
import { getBehaviorEngine } from "@/services/commercial/ClientBehaviorEngine";
import type { BehaviorContext, SimulatedPersona } from "@/services/commercial/ClientBehaviorEngine";

interface Props {
  persona: SimulatedPersona;
  conversationHistory: Array<{ mensagem: string; remetente_tipo: string }>;
  clientName: string;
  lastStoreMessage?: string;
}

const MOVE_LABELS: Record<string, { label: string; emoji: string; color: string }> = {
  vai_fechar: { label: "Vai fechar", emoji: "🎯", color: "text-green-600 dark:text-green-400" },
  vai_pedir_desconto: { label: "Pedir desconto", emoji: "💰", color: "text-amber-600 dark:text-amber-400" },
  vai_consultar_decisor: { label: "Consultar decisor", emoji: "👥", color: "text-blue-600 dark:text-blue-400" },
  vai_pedir_prazo: { label: "Pedir prazo", emoji: "⏳", color: "text-purple-600 dark:text-purple-400" },
  vai_comparar_concorrente: { label: "Comparar concorrente", emoji: "⚔️", color: "text-orange-600 dark:text-orange-400" },
  vai_desistir: { label: "Vai desistir", emoji: "🚪", color: "text-red-600 dark:text-red-400" },
  vai_perguntar_detalhes: { label: "Perguntar detalhes", emoji: "🔍", color: "text-cyan-600 dark:text-cyan-400" },
  vai_reagendar: { label: "Reagendar", emoji: "📅", color: "text-indigo-600 dark:text-indigo-400" },
  neutro: { label: "Neutro", emoji: "😐", color: "text-muted-foreground" },
};

const ENGAGEMENT_COLORS: Record<string, string> = {
  alto: "bg-green-500",
  medio: "bg-amber-500",
  baixo: "bg-orange-500",
  perdido: "bg-red-500",
};

const RESISTANCE_COLOR = (level: number) =>
  level >= 60 ? "bg-red-500" : level >= 30 ? "bg-amber-500" : "bg-green-500";

export function SimulatorBehaviorMetrics({ persona, conversationHistory, clientName, lastStoreMessage }: Props) {
  const metrics = useMemo(() => {
    const engine = getBehaviorEngine();
    const ctx: BehaviorContext = {
      clientName,
      status: "em_negociacao",
      daysInactive: 0,
      hasSimulation: false,
      lastStoreMessage,
      conversationHistory,
      persona,
    };

    return {
      engagement: engine.calculateEngagementScore(ctx),
      resistance: engine.detectResistanceLevel(ctx),
      prediction: engine.predictNextMove(ctx),
    };
  }, [persona, conversationHistory, clientName, lastStoreMessage]);

  const move = MOVE_LABELS[metrics.prediction.nextMove] || MOVE_LABELS.neutro;

  return (
    <Card className="border-purple-200 dark:border-purple-800 bg-purple-50/30 dark:bg-purple-950/10">
      <CardContent className="p-3 space-y-3">
        <div className="flex items-center gap-1.5">
          <Brain className="h-3.5 w-3.5 text-purple-600 dark:text-purple-400" />
          <span className="text-[11px] font-semibold text-purple-700 dark:text-purple-300">
            Behavior Engine — Tempo Real
          </span>
        </div>

        {/* Engagement Score */}
        <div className="space-y-1">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-medium text-foreground flex items-center gap-1">
              <TrendingUp className="h-3 w-3" /> Engajamento
            </span>
            <Tooltip>
              <TooltipTrigger asChild>
                <Badge variant="outline" className="text-[9px] h-4 cursor-help">
                  {metrics.engagement.score}/100 — {metrics.engagement.level}
                </Badge>
              </TooltipTrigger>
              <TooltipContent side="left" className="max-w-[200px] text-[10px]">
                {metrics.engagement.signals.length > 0
                  ? metrics.engagement.signals.join(" • ")
                  : "Sem sinais detectados"}
              </TooltipContent>
            </Tooltip>
          </div>
          <div className="h-1.5 w-full rounded-full bg-secondary overflow-hidden">
            <div
              className={`h-full rounded-full transition-all ${ENGAGEMENT_COLORS[metrics.engagement.level]}`}
              style={{ width: `${metrics.engagement.score}%` }}
            />
          </div>
        </div>

        {/* Resistance Level */}
        <div className="space-y-1">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-medium text-foreground flex items-center gap-1">
              <Shield className="h-3 w-3" /> Resistência
            </span>
            <Tooltip>
              <TooltipTrigger asChild>
                <Badge variant="outline" className="text-[9px] h-4 cursor-help">
                  {metrics.resistance.level}/100 — {metrics.resistance.category}
                </Badge>
              </TooltipTrigger>
              <TooltipContent side="left" className="max-w-[200px] text-[10px]">
                {metrics.resistance.objections.length > 0
                  ? metrics.resistance.objections.join(" • ")
                  : "Nenhuma objeção detectada"}
              </TooltipContent>
            </Tooltip>
          </div>
          <div className="h-1.5 w-full rounded-full bg-secondary overflow-hidden">
            <div
              className={`h-full rounded-full transition-all ${RESISTANCE_COLOR(metrics.resistance.level)}`}
              style={{ width: `${metrics.resistance.level}%` }}
            />
          </div>
        </div>

        {/* Predicted Next Move */}
        <div className="flex items-center justify-between p-2 rounded-lg bg-background/60 border border-border">
          <span className="text-[10px] font-medium text-foreground flex items-center gap-1">
            <Navigation className="h-3 w-3" /> Próximo Movimento
          </span>
          <Tooltip>
            <TooltipTrigger asChild>
              <Badge variant="secondary" className={`text-[9px] h-5 gap-0.5 cursor-help ${move.color}`}>
                {move.emoji} {move.label}
                <span className="text-muted-foreground ml-0.5">({metrics.prediction.confidence}%)</span>
              </Badge>
            </TooltipTrigger>
            <TooltipContent side="left" className="max-w-[220px] text-[10px]">
              {metrics.prediction.reasoning}
            </TooltipContent>
          </Tooltip>
        </div>
      </CardContent>
    </Card>
  );
}
