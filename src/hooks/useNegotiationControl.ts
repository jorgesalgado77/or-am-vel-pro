/**
 * useNegotiationControl — Hook para o Motor Central de Controle de Negociação
 *
 * Expõe orquestração completa: estratégia, timing, preço, mensagem,
 * detecção de fechamento e feedback loop.
 */

import { useState, useCallback } from "react";
import {
  getControlEngine,
  type NegotiationContext,
  type NegotiationDecision,
  type NegotiationMode,
} from "@/services/commercial/NegotiationControlEngine";
import { toast } from "sonner";

interface UseNegotiationControlReturn {
  decision: NegotiationDecision | null;
  loading: boolean;
  mode: NegotiationMode;
  setMode: (mode: NegotiationMode) => void;
  controlNegotiation: (ctx: NegotiationContext) => Promise<NegotiationDecision | null>;
  adaptToResponse: (newMessage: string, ctx: NegotiationContext) => Promise<NegotiationDecision | null>;
  recordFeedback: (
    ctx: NegotiationContext,
    resultado: "positivo" | "negativo" | "neutro" | "sem_resposta",
    dealResult?: "ganho" | "perdido" | "abandonado"
  ) => Promise<void>;
  reset: () => void;
}

export function useNegotiationControl(): UseNegotiationControlReturn {
  const [decision, setDecision] = useState<NegotiationDecision | null>(null);
  const [loading, setLoading] = useState(false);
  const [mode, setMode] = useState<NegotiationMode>("assistido");

  const controlNegotiation = useCallback(async (ctx: NegotiationContext): Promise<NegotiationDecision | null> => {
    setLoading(true);
    try {
      const engine = getControlEngine();
      const result = await engine.controlNegotiation({ ...ctx, modo: mode });
      setDecision(result);
      return result;
    } catch (err) {
      toast.error("Erro ao processar negociação");
      console.error("[NegotiationControl]", err);
      return null;
    } finally {
      setLoading(false);
    }
  }, [mode]);

  const adaptToResponse = useCallback(async (
    newMessage: string,
    ctx: NegotiationContext
  ): Promise<NegotiationDecision | null> => {
    if (!decision) return null;
    setLoading(true);
    try {
      const engine = getControlEngine();
      const updated = await engine.adaptToResponse(decision, newMessage, { ...ctx, modo: mode });
      setDecision(updated);
      return updated;
    } catch (err) {
      toast.error("Erro ao adaptar estratégia");
      console.error("[NegotiationControl:adapt]", err);
      return null;
    } finally {
      setLoading(false);
    }
  }, [decision, mode]);

  const recordFeedback = useCallback(async (
    ctx: NegotiationContext,
    resultado: "positivo" | "negativo" | "neutro" | "sem_resposta",
    dealResult?: "ganho" | "perdido" | "abandonado"
  ) => {
    if (!decision) return;
    try {
      const engine = getControlEngine();
      await engine.recordFeedback({
        tenant_id: ctx.tenant_id,
        user_id: ctx.user_id,
        client_id: ctx.client_id,
        decision_strategy: decision.strategy,
        decision_timing: decision.timing,
        desconto_aplicado: decision.pricing.desconto_recomendado,
        brinde_oferecido: decision.pricing.usar_brinde,
        resultado,
        deal_result: dealResult,
        closing_signal_detected: decision.is_closing_opportunity,
      });
      toast.success("Feedback registrado para aprendizado da IA");
    } catch (err) {
      toast.error("Erro ao registrar feedback");
      console.error("[NegotiationControl:feedback]", err);
    }
  }, [decision]);

  const reset = useCallback(() => {
    setDecision(null);
  }, []);

  return {
    decision,
    loading,
    mode,
    setMode,
    controlNegotiation,
    adaptToResponse,
    recordFeedback,
    reset,
  };
}
