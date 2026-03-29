/**
 * Commercial Module — Unified commercial decision engine
 */

export { CommercialDecisionEngine, getCommercialEngine, formatCurrency } from "./CommercialDecisionEngine";
export { ClientContextBuilder, getContextBuilder } from "./ClientContextBuilder";
export { ClientBehaviorEngine, getBehaviorEngine } from "./ClientBehaviorEngine";
export type { BuildContextOptions } from "./ClientContextBuilder";
export type { BehaviorContext, SimulatedPersona, EngagementScore, ResistanceAnalysis, BehaviorPrediction } from "./ClientBehaviorEngine";
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
