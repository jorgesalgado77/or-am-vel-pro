/**
 * useLearningContext — Builds a learning_context string from OptimizationEngine
 * for use in VendaZap AI and AutoSuggestion calls.
 *
 * Fetches learned patterns and formats them as a concise prompt injection
 * so the AI can make data-driven recommendations.
 */

import { useCallback, useRef } from "react";
import { getOptimizationEngine } from "@/services/ai/OptimizationEngine";
import { getLearningEngine } from "@/services/ai/LearningEngine";
import type { DealContext } from "@/services/commercial/types";

interface UseLearningContextParams {
  tenantId: string | null;
}

interface LearningContextResult {
  context: string;
  recommendedStrategy: string | null;
  discountRange: { min: number; max: number; optimal: number } | null;
  timingAdvice: string | null;
  confidence: number;
}

const CACHE_TTL = 5 * 60 * 1000; // 5 min

export function useLearningContext({ tenantId }: UseLearningContextParams) {
  const cacheRef = useRef<{ result: LearningContextResult; ts: number } | null>(null);

  /**
   * Build a learning context string for a specific deal context.
   * Returns optimization insights formatted for AI prompt injection.
   */
  const buildLearningContext = useCallback(
    async (ctx?: Partial<DealContext>): Promise<LearningContextResult> => {
      if (!tenantId) {
        return { context: "", recommendedStrategy: null, discountRange: null, timingAdvice: null, confidence: 0 };
      }

      // Check cache for general context (no specific deal)
      if (!ctx && cacheRef.current && Date.now() - cacheRef.current.ts < CACHE_TTL) {
        return cacheRef.current.result;
      }

      try {
        const optimizer = getOptimizationEngine(tenantId);
        const learning = getLearningEngine(tenantId);

        // Build full DealContext with defaults
        const fullCtx: DealContext = {
          tenant_id: tenantId,
          customer: {
            id: ctx?.customer?.id || "",
            name: ctx?.customer?.name || "Cliente",
            status: ctx?.customer?.status || "novo",
            temperature: ctx?.customer?.temperature || "morno",
            disc_profile: ctx?.customer?.disc_profile,
            days_inactive: ctx?.customer?.days_inactive || 0,
            has_simulation: ctx?.customer?.has_simulation || false,
          },
          pricing: ctx?.pricing || { total_price: 0 },
          payment: ctx?.payment || { forma_pagamento: "Boleto", parcelas: 1, valor_entrada: 0, plus_percentual: 0 },
          discounts: ctx?.discounts || { desconto1: 0, desconto2: 0, desconto3: 0 },
          negotiation_history: ctx?.negotiation_history,
        };

        const [optimization, patterns] = await Promise.all([
          optimizer.optimizeDecision(fullCtx),
          learning.analyzePatterns(),
        ]);

        const parts: string[] = [
          "\n=== INTELIGÊNCIA DE APRENDIZADO (dados reais) ===",
        ];

        // Strategy recommendation
        parts.push(`🎯 Estratégia recomendada: "${optimization.recommended_strategy}" (confiança: ${optimization.strategy_confidence}%)`);
        parts.push(`📝 ${optimization.reasoning}`);

        // Discount range
        const dr = optimization.recommended_discount_range;
        parts.push(`💰 Desconto ideal: ${dr.min_effective}%-${dr.max_effective}% (ótimo: ${dr.optimal}%)`);

        // Timing
        parts.push(`⏰ ${optimization.recommended_timing}`);

        // Top strategies from patterns
        if (patterns.strategies.length > 0) {
          parts.push("\n📊 Top estratégias por conversão:");
          for (const s of patterns.strategies.slice(0, 3)) {
            parts.push(`  • ${s.strategy}: ${(s.conversion_rate * 100).toFixed(1)}% (${s.total_events} eventos)`);
          }
        }

        // Boost info
        if (optimization.closing_probability_boost > 0) {
          parts.push(`\n🚀 Usar "${optimization.recommended_strategy}" pode aumentar a chance de fechamento em +${optimization.closing_probability_boost}%`);
        }

        const contextStr = parts.join("\n");

        const result: LearningContextResult = {
          context: contextStr,
          recommendedStrategy: optimization.recommended_strategy,
          discountRange: {
            min: dr.min_effective,
            max: dr.max_effective,
            optimal: dr.optimal,
          },
          timingAdvice: optimization.recommended_timing,
          confidence: optimization.strategy_confidence,
        };

        if (!ctx) {
          cacheRef.current = { result, ts: Date.now() };
        }

        return result;
      } catch (err) {
        console.error("[useLearningContext] error:", err);
        return { context: "", recommendedStrategy: null, discountRange: null, timingAdvice: null, confidence: 0 };
      }
    },
    [tenantId]
  );

  return { buildLearningContext };
}
