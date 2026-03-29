/**
 * CommercialDecisionEngine — Shared types & interfaces
 * Single source of truth for commercial decision context.
 */

import type { FormaPagamento, SimulationInput, SimulationResult, BoletoRateData, CreditRateData } from "@/lib/financing";
import type { LeadTemperature } from "@/lib/leadTemperature";
import type { DiscProfile } from "@/lib/vendazapAnalysis";

// ==================== DEAL CONTEXT ====================

export interface DealContext {
  tenant_id: string;
  user_id?: string;

  // Customer
  customer: {
    id: string;
    name: string;
    status: string;
    temperature?: LeadTemperature;
    disc_profile?: DiscProfile;
    days_inactive: number;
    has_simulation: boolean;
    phone?: string | null;
  };

  // Pricing
  pricing: {
    total_price: number;            // valor de tela
    total_cost?: number;            // custo (se disponível)
    commission_indicator?: number;  // % comissão indicador
  };

  // Payment & Financing
  payment: {
    forma_pagamento: FormaPagamento;
    parcelas: number;
    valor_entrada: number;
    plus_percentual: number;
    carencia_dias?: 30 | 60 | 90;
    credit_rates?: Record<number, number>;
    credit_rates_full?: Record<number, CreditRateData>;
    boleto_rates?: Record<number, number>;
    boleto_rates_full?: Record<number, BoletoRateData>;
  };

  // Discounts
  discounts: {
    desconto1: number;
    desconto2: number;
    desconto3: number;
    available_options?: {
      desconto1: number[];
      desconto2: number[];
      desconto3: number[];
      plus: number[];
    };
  };

  // Products (optional)
  products?: Array<{
    id: string;
    name: string;
    quantity: number;
    unit_price: number;
    cost_price?: number;
  }>;

  // Negotiation history (optional)
  negotiation_history?: Array<{
    mensagem: string;
    remetente_tipo: string;
    created_at?: string;
  }>;
}

// ==================== SALES RULES ====================

export interface SalesRules {
  tenant_id: string;
  min_margin: number;         // % margem mínima
  max_discount: number;       // % desconto máximo permitido
  preferred_payment: string;  // forma de pagamento preferida
  max_parcelas?: number;
  approval_required_above?: number; // valor acima do qual precisa aprovação do gerente
}

// ==================== ENGINE OUTPUTS ====================

export interface DealAnalysis {
  closing_probability: number;  // 0-100
  risk_level: "low" | "medium" | "high";
  recommended_aggressiveness: "conservadora" | "comercial" | "agressiva";
  insights: string[];
  margin_alert?: string;
}

export interface DealScenario {
  type: "conservadora" | "comercial" | "agressiva";
  label: string;
  desconto1: number;
  desconto2: number;
  desconto3: number;
  plus_percentual: number;
  forma_pagamento: FormaPagamento;
  parcelas: number;
  valor_entrada: number;
  simulation: SimulationResult;
  margin_estimated: number;
  closing_probability: number;
  description: string;
  margin_ok: boolean;          // respeita margem mínima?
  discount_ok: boolean;        // respeita limite de desconto?
}

export interface PriceCalculation {
  simulation: SimulationResult;
  valor_a_vista: number;
  margin_estimated: number;
  total_discount_percent: number;
  rules_violation?: string;
}

export interface DiscountDecision {
  recommended_d1: number;
  recommended_d2: number;
  recommended_d3: number;
  recommended_plus: number;
  reasoning: string;
  respects_rules: boolean;
}

export interface MessageContext {
  tipo_copy: string;
  tom: string;
  disc_profile?: DiscProfile;
  last_client_message?: string;
  deal_room_link?: string;
  valor_orcamento?: number;
}

export interface StrategyRecommendation {
  action: string;
  priority: "low" | "medium" | "high";
  reasoning: string;
  suggested_discount?: DiscountDecision;
  suggested_scenario?: "conservadora" | "comercial" | "agressiva";
}

// ==================== TRIGGER TYPES ====================

export type TriggerType = "no_response" | "expiring_budget" | "viewed_no_reply";

export interface TriggerContext {
  trigger_id: string;
  trigger_type: TriggerType;
  tenant_id: string;
  client_id: string;
  client_name: string;
  client_status: string;
  days_inactive: number;
  has_simulation: boolean;
  valor_orcamento: number;
  generated_message: string;
}

export type TriggerActionType =
  | "send_message"
  | "send_with_discount"
  | "suggest_dealroom"
  | "schedule_followup"
  | "wait"
  | "escalate";

export interface TriggerAction {
  action: TriggerActionType;
  message: string;
  urgency: "immediate" | "today" | "this_week" | "low";
  reasoning: string;
  discount?: DiscountDecision;
  closing_probability: number;
}

export type { FormaPagamento, SimulationInput, SimulationResult, LeadTemperature, DiscProfile };
