/**
 * AI Learning & Optimization — Shared types
 */

// ==================== LEARNING EVENT ====================

export type LearningEventType =
  | "message_sent"
  | "proposal_sent"
  | "discount_applied"
  | "deal_closed"
  | "deal_lost"
  | "trigger_fired"
  | "dealroom_opened"
  | "followup_sent"
  | "reactivation_sent";

export type StrategyType =
  | "urgencia"
  | "valor"
  | "prova_social"
  | "escassez"
  | "reciprocidade"
  | "autoridade"
  | "empatia"
  | "desconto"
  | "parcelamento"
  | "dealroom"
  | "reativacao"
  | "consultiva"
  | "outro";

export type ClientResponse = "positivo" | "negativo" | "neutro" | "sem_resposta";
export type DealResult = "ganho" | "perdido" | "abandonado";

export interface LearningEvent {
  tenant_id: string;
  user_id?: string | null;
  client_id?: string | null;
  tracking_id?: string | null;
  event_type: LearningEventType;
  strategy_used?: StrategyType | null;
  message_content?: string | null;
  price_offered?: number | null;
  cost?: number | null;
  discount_percentage?: number | null;
  response_time_seconds?: number | null;
  client_response?: ClientResponse | null;
  deal_result?: DealResult | null;
  disc_profile?: string | null;
  lead_temperature?: string | null;
  closing_probability?: number | null;
  metadata?: Record<string, unknown>;
}

// ==================== PATTERN TYPES ====================

export type PatternType =
  | "strategy_conversion"
  | "discount_sweet_spot"
  | "best_timing"
  | "vendor_performance"
  | "temperature_conversion"
  | "disc_strategy";

export interface LearnedPattern {
  tenant_id: string;
  user_id?: string | null;
  pattern_type: PatternType;
  pattern_key: string;
  pattern_data: Record<string, unknown>;
  sample_size: number;
  confidence: number;
}

// ==================== ANALYSIS RESULTS ====================

export interface StrategyConversion {
  strategy: StrategyType;
  total_events: number;
  positive_responses: number;
  deals_won: number;
  conversion_rate: number;
  avg_discount: number;
  avg_response_time: number;
}

export interface VendorPerformance {
  user_id: string;
  total_deals: number;
  won_deals: number;
  conversion_rate: number;
  avg_ticket: number;
  avg_discount: number;
  avg_close_time_days: number;
  best_strategy: StrategyType | null;
  top_disc_profile: string | null;
}

export interface DiscountSweetSpot {
  min_effective: number;
  max_effective: number;
  optimal: number;
  sample_size: number;
}

export interface OptimizationResult {
  recommended_strategy: StrategyType;
  strategy_confidence: number;
  recommended_discount_range: DiscountSweetSpot;
  recommended_timing: string;
  closing_probability_boost: number;
  reasoning: string;
  based_on_samples: number;
}
