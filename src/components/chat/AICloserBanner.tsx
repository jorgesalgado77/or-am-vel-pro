/**
 * AICloserBanner — Detects purchase intent and suggests closing actions.
 * Shows inline in the chat when the AI detects the client is ready to buy.
 */

import { memo, useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import {
  Target, FileSignature, CreditCard, X,
  TrendingUp, Sparkles, Send, ChevronDown, ChevronUp,
} from "lucide-react";
import { supabase } from "@/lib/supabaseClient";
import { toast } from "sonner";
import { getCommercialEngine, formatCurrency } from "@/services/commercial";
import { getContextBuilder } from "@/services/commercial/ClientContextBuilder";
import type { DealAnalysis, DealScenario, StrategyRecommendation } from "@/services/commercial/types";
import type { ChatConversation } from "./types";

export interface CloseSaleData {
  valorFinal: number;
  valorEntrada: number;
  parcelas: number;
  valorParcela: number;
  formaPagamento: string;
  vendedor?: string;
  numeroOrcamento?: string;
}

interface Props {
  conversation: ChatConversation;
  tenantId: string | null;
  lastClientMessage?: string;
  onSendProposal?: (text: string) => void;
  onCloseSale?: (data: CloseSaleData) => void;
}

interface CloserState {
  visible: boolean;
  intent: "purchase" | "pricing" | "payment" | "contract" | null;
  probability: number;
  analysis: DealAnalysis | null;
  bestScenario: DealScenario | null;
  strategy: StrategyRecommendation | null;
  proposalText: string;
}

const INTENT_PATTERNS: Array<{ pattern: RegExp; intent: CloserState["intent"] }> = [
  { pattern: /fecha|fechar|assinar|contrato|aceito|vamos|deal|negócio/i, intent: "purchase" },
  { pattern: /pre[çc]o|valor|quanto|or[çc]amento|custa|investimento/i, intent: "pricing" },
  { pattern: /parcela|pagamento|pix|cart[ãa]o|boleto|financ/i, intent: "payment" },
  { pattern: /contrato|proposta|documento|assinar|termos/i, intent: "contract" },
];

const INTENT_CONFIG: Record<string, { label: string; emoji: string; action: string }> = {
  purchase: { label: "Intenção de Compra", emoji: "🎯", action: "Gerar proposta de fechamento" },
  pricing: { label: "Pergunta sobre Preço", emoji: "💰", action: "Enviar condições comerciais" },
  payment: { label: "Interesse em Pagamento", emoji: "💳", action: "Apresentar formas de pagamento" },
  contract: { label: "Pediu Contrato", emoji: "📝", action: "Enviar contrato/proposta" },
};

function detectPurchaseIntent(message: string): CloserState["intent"] {
  if (!message) return null;
  for (const { pattern, intent } of INTENT_PATTERNS) {
    if (pattern.test(message)) return intent;
  }
  return null;
}

export const AICloserBanner = memo(function AICloserBanner({
  conversation, tenantId, lastClientMessage, onSendProposal, onCloseSale,
}: Props) {
  const [state, setState] = useState<CloserState>({
    visible: false,
    intent: null,
    probability: 0,
    analysis: null,
    bestScenario: null,
    strategy: null,
    proposalText: "",
  });
  const [expanded, setExpanded] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  // Analyze intent when last client message changes
  useEffect(() => {
    if (!lastClientMessage || !tenantId || !conversation.client_id || dismissed) {
      setState(prev => ({ ...prev, visible: false }));
      return;
    }

    const intent = detectPurchaseIntent(lastClientMessage);
    if (!intent) {
      setState(prev => ({ ...prev, visible: false }));
      return;
    }

    let cancelled = false;

    const analyze = async () => {
      try {
        const builder = getContextBuilder(tenantId);
        const ctx = await builder.build(conversation.client_id!, {
          trackingId: conversation.id,
          trackingIds: conversation.relatedTrackingIds,
        });

        const engine = getCommercialEngine();
        const decision = await engine.decideNextAction(ctx);

        if (cancelled) return;

        // Only show if probability > 40% or explicit purchase intent
        const shouldShow = decision.analysis.closing_probability > 40 || intent === "purchase" || intent === "contract";
        if (!shouldShow) {
          setState(prev => ({ ...prev, visible: false }));
          return;
        }

        const best = decision.scenarios.find(s => s.type === decision.analysis.recommended_aggressiveness) || decision.scenarios[0];

        // Build proposal text
        let proposal = "";
        if (best) {
          proposal = `Olá ${conversation.nome_cliente}! Preparei uma condição especial para você:\n\n`;
          proposal += `💰 Valor: ${formatCurrency(best.simulation.valorFinal)}\n`;
          if (best.parcelas > 1) {
            proposal += `📋 ${best.parcelas}x de ${formatCurrency(best.simulation.valorParcela)}\n`;
          }
          if (best.desconto1 > 0) {
            proposal += `✨ Desconto: ${best.desconto1}%`;
            if (best.desconto2 > 0) proposal += ` + ${best.desconto2}%`;
            proposal += `\n`;
          }
          proposal += `\nEssa condição é válida para fechamento esta semana! Posso gerar o contrato?`;
        }

        setState({
          visible: true,
          intent,
          probability: decision.analysis.closing_probability,
          analysis: decision.analysis,
          bestScenario: best || null,
          strategy: decision.strategy,
          proposalText: proposal,
        });
      } catch (err) {
        console.error("[AICloser] Analysis error:", err);
      }
    };

    analyze();
    return () => { cancelled = true; };
  }, [lastClientMessage, tenantId, conversation, dismissed]);

  // Reset dismissed when conversation changes
  useEffect(() => {
    setDismissed(false);
    setExpanded(false);
  }, [conversation.id]);

  const handleSendProposal = useCallback(async () => {
    if (!state.proposalText || !onSendProposal) return;
    setGenerating(true);

    try {
      onSendProposal(state.proposalText);
      toast.success("🎯 Proposta enviada automaticamente!");
      setDismissed(true);
    } catch {
      toast.error("Erro ao enviar proposta");
    } finally {
      setGenerating(false);
    }
  }, [state.proposalText, onSendProposal]);

  if (!state.visible || dismissed) return null;

  const intentInfo = state.intent ? INTENT_CONFIG[state.intent] : null;

  return (
    <div className="mx-3 mb-2 rounded-lg border border-amber-500/30 bg-amber-500/5 overflow-hidden animate-in fade-in slide-in-from-bottom-2 duration-300">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2">
        <div className="flex items-center gap-2 flex-wrap">
          <Target className="h-4 w-4 text-amber-600 dark:text-amber-400" />
          <span className="text-xs font-bold text-amber-700 dark:text-amber-300">
            IA Fechadora
          </span>
          {intentInfo && (
            <Badge variant="outline" className="text-[9px] px-1.5 py-0 h-4 border-amber-500/30 text-amber-700 dark:text-amber-400">
              {intentInfo.emoji} {intentInfo.label}
            </Badge>
          )}
          <Badge variant="outline" className="text-[9px] px-1.5 py-0 h-4 border-primary/30 text-primary">
            {state.probability}% prob.
          </Badge>
        </div>

        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon"
            className="h-5 w-5"
            onClick={() => setExpanded(!expanded)}
          >
            {expanded ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-5 w-5 text-muted-foreground hover:text-foreground"
            onClick={() => setDismissed(true)}
          >
            <X className="h-3 w-3" />
          </Button>
        </div>
      </div>

      {/* Quick Action */}
      <div className="px-3 pb-2 flex items-center gap-2 flex-wrap">
        <Button
          size="sm"
          className="h-7 text-xs gap-1.5 bg-amber-600 hover:bg-amber-700 text-white"
          onClick={handleSendProposal}
          disabled={generating || !state.proposalText}
        >
          <Send className="h-3 w-3" />
          Enviar Proposta
        </Button>

        {onCloseSale && state.bestScenario && (
          <Button
            variant="outline"
            size="sm"
            className="h-7 text-xs gap-1.5 border-amber-500/30 text-amber-700 dark:text-amber-400"
            onClick={() => {
              const scenario = state.bestScenario!;
              onCloseSale({
                valorFinal: scenario.simulation.valorFinal,
                valorEntrada: scenario.valor_entrada,
                parcelas: scenario.parcelas,
                valorParcela: scenario.simulation.valorParcela,
                formaPagamento: scenario.forma_pagamento,
                vendedor: conversation.vendedor_nome || undefined,
                numeroOrcamento: conversation.numero_contrato || undefined,
              });
            }}
          >
            <FileSignature className="h-3 w-3" />
            Fechar Venda
          </Button>
        )}

        {state.strategy && (
          <Tooltip>
            <TooltipTrigger asChild>
              <span className="text-[10px] text-muted-foreground cursor-help flex items-center gap-1">
                <Sparkles className="h-3 w-3 text-amber-500" />
                {state.strategy.action.substring(0, 60)}...
              </span>
            </TooltipTrigger>
            <TooltipContent className="text-xs max-w-[250px]">
              <p className="font-semibold">Estratégia IA</p>
              <p className="text-muted-foreground">{state.strategy.reasoning}</p>
            </TooltipContent>
          </Tooltip>
        )}
      </div>

      {/* Expanded: Proposal preview + scenario */}
      {expanded && (
        <div className="border-t border-amber-500/20 px-3 py-2 space-y-2 animate-in fade-in duration-200">
          {state.proposalText && (
            <div className="rounded-md bg-card border border-border p-2">
              <p className="text-[10px] font-semibold text-muted-foreground mb-1">Preview da Proposta:</p>
              <p className="text-xs text-foreground whitespace-pre-wrap leading-relaxed">
                {state.proposalText}
              </p>
            </div>
          )}

          {state.bestScenario && (
            <div className="flex items-center gap-3 text-[10px] text-muted-foreground">
              <span className="flex items-center gap-1">
                <TrendingUp className="h-3 w-3 text-primary" />
                Cenário: {state.bestScenario.label}
              </span>
              <span>Margem: {state.bestScenario.margin_estimated}%</span>
              {state.bestScenario.margin_ok ? (
                <Badge variant="outline" className="text-[8px] h-3.5 bg-green-500/10 text-green-700 border-green-500/30">
                  ✓ Margem OK
                </Badge>
              ) : (
                <Badge variant="outline" className="text-[8px] h-3.5 bg-destructive/10 text-destructive border-destructive/30">
                  ⚠ Margem
                </Badge>
              )}
            </div>
          )}

          {state.analysis?.insights && state.analysis.insights.length > 0 && (
            <div className="space-y-0.5">
              {state.analysis.insights.slice(0, 3).map((insight, i) => (
                <p key={i} className="text-[10px] text-muted-foreground flex items-start gap-1">
                  <span className="text-amber-500 shrink-0">•</span>
                  {insight}
                </p>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
});
