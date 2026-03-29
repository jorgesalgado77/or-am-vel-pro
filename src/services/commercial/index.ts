/**
 * Commercial Module — Unified commercial decision engine
 */

export { CommercialDecisionEngine, getCommercialEngine, formatCurrency } from "./CommercialDecisionEngine";
export type { GenerateMessageParams } from "@/hooks/useVendaZap";
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
  TriggerContext,
  TriggerAction,
  TriggerActionType,
  TriggerType,
} from "./types";

// AI Learning & Optimization
export { LearningEngine, getLearningEngine } from "@/services/ai/LearningEngine";
export { OptimizationEngine, getOptimizationEngine } from "@/services/ai/OptimizationEngine";
export type { LearningEvent, StrategyType, OptimizationResult } from "@/services/ai/types";
