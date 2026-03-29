/**
 * useCommercialDecision — Orchestration hook.
 *
 * Ties together: CDE (analysis, scenarios, discounts, message context),
 * ClientContextBuilder, and exposes a single `decideClientAction` call
 * that unifies all commercial intelligence for a given client.
 */

import { useState, useCallback } from "react";
import { getCommercialEngine } from "@/services/commercial/CommercialDecisionEngine";
import { getContextBuilder, type BuildContextOptions } from "@/services/commercial/ClientContextBuilder";
import type {
  DealContext,
  DealAnalysis,
  DealScenario,
  DiscountDecision,
  MessageContext,
  StrategyRecommendation,
} from "@/services/commercial/types";

// ==================== TYPES ====================

export interface ClientActionDecision {
  context: DealContext;
  analysis: DealAnalysis;
  scenarios: DealScenario[];
  discount: DiscountDecision;
  messageContext: MessageContext;
  strategy: StrategyRecommendation;
}

interface UseCommercialDecisionParams {
  tenantId: string | null;
}

// ==================== HOOK ====================

export function useCommercialDecision({ tenantId }: UseCommercialDecisionParams) {
  const [decision, setDecision] = useState<ClientActionDecision | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /**
   * Central decision method — builds context and runs full CDE analysis.
   */
  const decideClientAction = useCallback(async (
    clientId: string,
    opts?: BuildContextOptions & { availableParcelas?: number[] },
  ): Promise<ClientActionDecision | null> => {
    if (!tenantId) return null;

    setLoading(true);
    setError(null);

    try {
      const builder = getContextBuilder(tenantId);
      const engine = getCommercialEngine();

      // Build unified context from all data sources
      const context = await builder.build(clientId, opts);

      // Run all CDE analyses in parallel
      const [analysis, scenarios, discount] = await Promise.all([
        engine.analyzeDeal(context),
        engine.generateScenarios(context, opts?.availableParcelas || [1, 6, 12, 18, 24]),
        engine.decideDiscount(context),
      ]);

      // These are sync/fast — no need for Promise.all
      const messageContext = engine.generateMessageContext(context);
      const strategy = await engine.suggestStrategy(context);

      const result: ClientActionDecision = {
        context,
        analysis,
        scenarios,
        discount,
        messageContext,
        strategy,
      };

      setDecision(result);
      return result;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Erro ao analisar cliente";
      setError(msg);
      console.error("useCommercialDecision error:", err);
      return null;
    } finally {
      setLoading(false);
    }
  }, [tenantId]);

  const clear = useCallback(() => {
    setDecision(null);
    setError(null);
  }, []);

  return {
    decision,
    loading,
    error,
    decideClientAction,
    clear,
  };
}
