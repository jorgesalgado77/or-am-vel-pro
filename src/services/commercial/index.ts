/**
 * Commercial Module — Unified commercial decision engine
 */

export { CommercialDecisionEngine, getCommercialEngine, formatCurrency } from "./CommercialDecisionEngine";
export { ClientContextBuilder, getContextBuilder } from "./ClientContextBuilder";
export type { BuildContextOptions } from "./ClientContextBuilder";
export type {
  DealContext,
  DealAnalysis,
  DealScenario,
  PriceCalculation,
  DiscountDecision,
  MessageContext,
  StrategyRecommendation,
  SalesRules,
} from "./types";
