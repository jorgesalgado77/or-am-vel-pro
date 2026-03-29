/**
 * OptimizationEngine — Uses learned patterns to optimize commercial decisions.
 *
 * Queries LearningEngine data and adjusts CDE recommendations
 * based on historical success rates per tenant/vendor.
 * Implements the feedback loop: Decision → Result → Learning → Better Decision.
 */

import { getLearningEngine, type LearningEngine } from "./LearningEngine";
import type {
  StrategyType,
  OptimizationResult,
  DiscountSweetSpot,
} from "./types";
import type { DealContext } from "@/services/commercial/types";
import type { LeadTemperature } from "@/lib/leadTemperature";

// ==================== ENGINE ====================

export class OptimizationEngine {
  private tenantId: string;
  private learning: LearningEngine;

  constructor(tenantId: string) {
    this.tenantId = tenantId;
    this.learning = getLearningEngine(tenantId);
  }

  /**
   * Main optimization entry point.
   * Analyzes context + historical patterns to recommend the best strategy.
   */
  async optimizeDecision(ctx: DealContext): Promise<OptimizationResult> {
    const temperature = ctx.customer.temperature || "morno";
    const discProfile = ctx.customer.disc_profile || null;
    const userId = ctx.user_id || null;

    // Fetch all relevant patterns in parallel
    const [
      tempStrategy,
      discStrategy,
      vendorPerf,
      allPatterns,
    ] = await Promise.all([
      this.learning.getBestStrategyForTemperature(temperature),
      discProfile ? this.learning.getBestStrategyForDisc(discProfile) : Promise.resolve(null),
      userId ? this.learning.getVendorPerformance(userId) : Promise.resolve(null),
      this.learning.analyzePatterns(),
    ]);

    // Strategy selection with priority:
    // 1. DISC-specific (most personalized)
    // 2. Temperature-specific
    // 3. Vendor's best
    // 4. Global best
    let recommendedStrategy: StrategyType = "consultiva";
    let confidence = 30;
    let reasoning = "";
    let basedOnSamples = 0;

    if (discStrategy && discProfile) {
      recommendedStrategy = discStrategy;
      confidence = 75;
      reasoning = `Estratégia "${discStrategy}" tem melhor taxa de conversão para perfil DISC "${discProfile}".`;
      basedOnSamples = allPatterns.strategies.find((s) => s.strategy === discStrategy)?.total_events || 0;
    } else if (tempStrategy) {
      recommendedStrategy = tempStrategy;
      confidence = 65;
      reasoning = `Estratégia "${tempStrategy}" tem melhor performance para leads ${temperature}.`;
      basedOnSamples = allPatterns.strategies.find((s) => s.strategy === tempStrategy)?.total_events || 0;
    } else if (vendorPerf?.best_strategy) {
      recommendedStrategy = vendorPerf.best_strategy;
      confidence = 55;
      reasoning = `Baseado no histórico do vendedor (${vendorPerf.won_deals} vendas fechadas).`;
      basedOnSamples = vendorPerf.total_deals;
    } else if (allPatterns.strategies.length > 0) {
      const best = allPatterns.strategies[0];
      recommendedStrategy = best.strategy;
      confidence = 45;
      reasoning = `Estratégia global com melhor conversão (${(best.conversion_rate * 100).toFixed(1)}%).`;
      basedOnSamples = best.total_events;
    } else {
      reasoning = "Sem dados históricos suficientes. Usando estratégia padrão consultiva.";
    }

    // Discount optimization
    const discountRange = this.optimizeDiscount(ctx, allPatterns.discountSpot);

    // Timing recommendation
    const timing = this.recommendTiming(ctx, temperature as LeadTemperature);

    // Closing probability boost estimation
    const boost = this.estimateBoost(confidence, allPatterns.strategies, recommendedStrategy);

    // Vendor-specific adjustments
    if (vendorPerf && vendorPerf.conversion_rate > 0) {
      const vendorBonus = vendorPerf.conversion_rate > 0.5
        ? ` Vendedor com alta conversão (${(vendorPerf.conversion_rate * 100).toFixed(0)}%).`
        : ` Vendedor com conversão de ${(vendorPerf.conversion_rate * 100).toFixed(0)}% — considere coaching.`;
      reasoning += vendorBonus;
    }

    return {
      recommended_strategy: recommendedStrategy,
      strategy_confidence: Math.round(confidence),
      recommended_discount_range: discountRange,
      recommended_timing: timing,
      closing_probability_boost: boost,
      reasoning,
      based_on_samples: basedOnSamples,
    };
  }

  /**
   * Quick check: should we avoid a strategy based on poor historical performance?
   */
  async shouldAvoidStrategy(strategy: StrategyType): Promise<boolean> {
    const conversion = await this.learning.getStrategyConversion(strategy);
    if (!conversion || conversion.total_events < 5) return false;
    // Avoid if conversion < 5% with decent sample
    return conversion.conversion_rate < 0.05 && conversion.total_events >= 10;
  }

  // ==================== PRIVATE ====================

  private optimizeDiscount(ctx: DealContext, sweetSpot: DiscountSweetSpot): DiscountSweetSpot {
    if (sweetSpot.sample_size < 3) {
      // Not enough data, use rule-of-thumb
      return {
        min_effective: 3,
        max_effective: 15,
        optimal: 8,
        sample_size: 0,
      };
    }

    // Adjust based on temperature
    const temp = ctx.customer.temperature;
    if (temp === "quente") {
      // Hot leads close with less discount
      return {
        ...sweetSpot,
        optimal: Math.max(0, sweetSpot.optimal - 3),
        max_effective: Math.max(sweetSpot.min_effective, sweetSpot.max_effective - 3),
      };
    } else if (temp === "frio") {
      // Cold leads need more incentive
      return {
        ...sweetSpot,
        optimal: sweetSpot.optimal + 2,
        max_effective: sweetSpot.max_effective + 3,
      };
    }

    return sweetSpot;
  }

  private recommendTiming(_ctx: DealContext, temperature: LeadTemperature): string {
    switch (temperature) {
      case "quente":
        return "Responder imediatamente. Lead quente — cada hora reduz chance de fechamento.";
      case "morno":
        return "Contato em até 4 horas. Manter engajamento sem pressão excessiva.";
      case "frio":
        return "Agendar reativação para horário comercial (9-11h ou 14-16h). Evitar fins de semana.";
      default:
        return "Contato em até 24 horas durante horário comercial.";
    }
  }

  private estimateBoost(
    confidence: number,
    strategies: Array<{ strategy: StrategyType; conversion_rate: number }>,
    recommended: StrategyType,
  ): number {
    const recommendedData = strategies.find((s) => s.strategy === recommended);
    if (!recommendedData) return 0;

    // Average conversion across all strategies
    const avgConversion = strategies.length > 0
      ? strategies.reduce((sum, s) => sum + s.conversion_rate, 0) / strategies.length
      : 0;

    // Boost = how much better than average the recommended strategy is
    const boost = recommendedData.conversion_rate - avgConversion;
    const scaledBoost = Math.round(boost * 100 * (confidence / 100));

    return Math.max(0, Math.min(25, scaledBoost));
  }
}

// ==================== FACTORY ====================

const optimizerCache = new Map<string, OptimizationEngine>();

export function getOptimizationEngine(tenantId: string): OptimizationEngine {
  let engine = optimizerCache.get(tenantId);
  if (!engine) {
    engine = new OptimizationEngine(tenantId);
    optimizerCache.set(tenantId, engine);
  }
  return engine;
}
