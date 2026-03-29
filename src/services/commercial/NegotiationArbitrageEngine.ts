/**
 * NegotiationArbitrageEngine — Motor de Arbitragem de Negociação
 *
 * Gera cenários inteligentes comparando brinde estratégico vs desconto direto,
 * com proteção de margem, aprendizado contínuo e integração com VendaZap.
 *
 * Integra-se ao CommercialDecisionEngine e LearningEngine existentes.
 */

import { supabase } from "@/lib/supabaseClient";
import { getCommercialEngine, formatCurrency } from "./CommercialDecisionEngine";
import { getLearningEngine } from "@/services/ai/LearningEngine";
import type { DealContext, SalesRules } from "./types";
import type { LearningEvent } from "@/services/ai/types";

// ==================== TYPES ====================

export type ArbitrageScenarioType = "valor_maximo" | "equilibrado" | "agressivo";

export interface GiftSuggestion {
  product_id: string;
  name: string;
  cost_price: number;
  sale_price: number;
  perceived_value: number;
  category: string;
  image_url?: string;
  in_stock: boolean;
}

export interface ArbitrageScenario {
  id: string;
  type: ArbitrageScenarioType;
  label: string;
  description: string;

  // Pricing
  valor_proposta: number;
  desconto_percentual: number;
  valor_final: number;
  margem_estimada: number;

  // Gift
  gifts: GiftSuggestion[];
  gift_total_cost: number;
  gift_perceived_value: number;

  // Payment
  forma_pagamento: string;
  parcelas: number;

  // Metrics
  closing_probability: number;
  margin_ok: boolean;
  discount_ok: boolean;
  requires_approval: boolean;

  // Human override
  approved_by?: string;
  is_edited: boolean;
}

export interface ArbitrageContext {
  tenant_id: string;
  user_id?: string;
  client_id: string;
  client_name: string;
  valor_proposta: number;
  valor_concorrente?: number;
  custo_total?: number;
  estagio_venda: string;
  perfil_disc?: string;
  temperatura?: string;
  days_inactive: number;
  has_simulation: boolean;
  margem_minima?: number;
  desconto_maximo?: number;
}

export interface ArbitrageResult {
  scenarios: ArbitrageScenario[];
  gap_analysis: GapAnalysis;
  recommendation: string;
  best_scenario: ArbitrageScenarioType;
}

export interface GapAnalysis {
  has_competitor: boolean;
  gap_absoluto: number;
  gap_percentual: number;
  impacto_margem: number;
  estrategia_sugerida: string;
}

export interface ArbitrageOutcome {
  tenant_id: string;
  user_id?: string;
  client_id: string;
  scenario_type: ArbitrageScenarioType;
  scenario_id: string;
  result: "ganho" | "perdido" | "abandonado";
  valor_final: number;
  gift_included: boolean;
  gift_ids: string[];
  competitor_price?: number;
  tempo_fechamento_dias?: number;
}

// ==================== SALES RULES CACHE ====================

interface SalesRulesRow {
  min_margin?: number | null;
  max_discount?: number | null;
  preferred_payment?: string | null;
  max_parcelas?: number | null;
  approval_required_above?: number | null;
}

const rulesCache = new Map<string, { rules: SalesRules; ts: number }>();
const RULES_TTL = 5 * 60 * 1000;

async function fetchRules(tenantId: string): Promise<SalesRules> {
  const cached = rulesCache.get(tenantId);
  if (cached && Date.now() - cached.ts < RULES_TTL) return cached.rules;

  const { data } = await supabase
    .from("sales_rules" as unknown as "clients")
    .select("*")
    .eq("tenant_id", tenantId)
    .maybeSingle();

  const row = data as unknown as SalesRulesRow | null;
  const rules: SalesRules = row
    ? {
        tenant_id: tenantId,
        min_margin: Number(row.min_margin) || 0,
        max_discount: Number(row.max_discount) || 100,
        preferred_payment: row.preferred_payment || "Boleto",
        max_parcelas: row.max_parcelas || undefined,
        approval_required_above: row.approval_required_above || undefined,
      }
    : { tenant_id: tenantId, min_margin: 0, max_discount: 100, preferred_payment: "Boleto" };

  rulesCache.set(tenantId, { rules, ts: Date.now() });
  return rules;
}

// ==================== PRODUCT CATALOG CACHE ====================

interface CatalogProduct {
  id: string;
  name: string;
  cost_price: number;
  sale_price: number;
  category: string;
  stock_quantity: number;
  image_url?: string;
}

const catalogCache = new Map<string, { items: CatalogProduct[]; ts: number }>();
const CATALOG_TTL = 3 * 60 * 1000;

async function fetchCatalog(tenantId: string): Promise<CatalogProduct[]> {
  const cached = catalogCache.get(tenantId);
  if (cached && Date.now() - cached.ts < CATALOG_TTL) return cached.items;

  const { data } = await supabase
    .from("products_catalog" as unknown as "clients")
    .select("id, name, cost_price, sale_price, category, stock_quantity, image_url")
    .eq("tenant_id", tenantId)
    .gt("stock_quantity", 0)
    .order("cost_price", { ascending: false });

  const items = ((data as unknown as CatalogProduct[]) || []).filter(
    (p) => p.cost_price > 0 && p.sale_price > 0
  );

  catalogCache.set(tenantId, { items, ts: Date.now() });
  return items;
}

// ==================== ENGINE ====================

export class NegotiationArbitrageEngine {
  // ─── Generate Arbitrage Scenarios ──────────────────────────
  async generateArbitrageScenarios(ctx: ArbitrageContext): Promise<ArbitrageResult> {
    const rules = await fetchRules(ctx.tenant_id);
    const minMargin = ctx.margem_minima ?? rules.min_margin;
    const maxDiscount = ctx.desconto_maximo ?? rules.max_discount;

    const gap = this.calculateGap(ctx.valor_proposta, ctx.valor_concorrente);

    // Calculate margin budget for gifts
    const custoBase = ctx.custo_total ?? ctx.valor_proposta * 0.6; // fallback 60% cost
    const margemBruta = ctx.valor_proposta - custoBase;
    const margemMinReais = custoBase * (minMargin / 100);
    const budgetBrinde = Math.max(0, margemBruta - margemMinReais) * 0.3; // 30% of excess margin

    const gifts = await this.findStrategicGifts(ctx.tenant_id, budgetBrinde, ctx.estagio_venda);

    const scenarios: ArbitrageScenario[] = [];

    // ── CENÁRIO 1: Valor Máximo (brinde, sem desconto) ──
    const giftTotalCost = gifts.slice(0, 2).reduce((sum, g) => sum + g.cost_price, 0);
    const giftPerceivedValue = gifts.slice(0, 2).reduce((sum, g) => sum + g.perceived_value, 0);
    const margemVM = ((ctx.valor_proposta - custoBase - giftTotalCost) / ctx.valor_proposta) * 100;

    scenarios.push({
      id: `arb-vm-${Date.now()}`,
      type: "valor_maximo",
      label: "Valor Máximo",
      description: "Preço cheio + brinde estratégico. Preserva margem e agrega valor percebido.",
      valor_proposta: ctx.valor_proposta,
      desconto_percentual: 0,
      valor_final: ctx.valor_proposta,
      margem_estimada: Math.round(margemVM * 10) / 10,
      gifts: gifts.slice(0, 2),
      gift_total_cost: giftTotalCost,
      gift_perceived_value: giftPerceivedValue,
      forma_pagamento: "A vista",
      parcelas: 1,
      closing_probability: this._calcProbability(0, ctx, "valor_maximo", giftPerceivedValue),
      margin_ok: margemVM >= minMargin,
      discount_ok: true,
      requires_approval: false,
      is_edited: false,
    });

    // ── CENÁRIO 2: Equilibrado (desconto moderado + parcelamento) ──
    const descontoEq = Math.min(maxDiscount * 0.5, 12);
    const valorEq = ctx.valor_proposta * (1 - descontoEq / 100);
    const margemEq = ((valorEq - custoBase) / ctx.valor_proposta) * 100;
    const parcelasEq = Math.min(rules.max_parcelas ?? 12, 6);

    scenarios.push({
      id: `arb-eq-${Date.now()}`,
      type: "equilibrado",
      label: "Equilibrado",
      description: "Desconto controlado + parcelamento. Equilíbrio entre atratividade e margem.",
      valor_proposta: ctx.valor_proposta,
      desconto_percentual: Math.round(descontoEq * 10) / 10,
      valor_final: Math.round(valorEq * 100) / 100,
      margem_estimada: Math.round(margemEq * 10) / 10,
      gifts: gifts.length > 2 ? [gifts[2]] : [],
      gift_total_cost: gifts.length > 2 ? gifts[2].cost_price : 0,
      gift_perceived_value: gifts.length > 2 ? gifts[2].perceived_value : 0,
      forma_pagamento: "Boleto",
      parcelas: parcelasEq,
      closing_probability: this._calcProbability(descontoEq, ctx, "equilibrado", 0),
      margin_ok: margemEq >= minMargin,
      discount_ok: descontoEq <= maxDiscount,
      requires_approval: !!(rules.approval_required_above && valorEq >= rules.approval_required_above),
      is_edited: false,
    });

    // ── CENÁRIO 3: Agressivo (máximo desconto, escassez) ──
    const descontoAg = Math.min(maxDiscount, 25);
    const valorAg = ctx.valor_proposta * (1 - descontoAg / 100);
    const margemAg = ((valorAg - custoBase) / ctx.valor_proposta) * 100;
    const parcelasAg = rules.max_parcelas ?? 12;

    scenarios.push({
      id: `arb-ag-${Date.now()}`,
      type: "agressivo",
      label: "Agressivo",
      description: "Desconto máximo permitido + máx. parcelas. Use escassez e urgência.",
      valor_proposta: ctx.valor_proposta,
      desconto_percentual: Math.round(descontoAg * 10) / 10,
      valor_final: Math.round(valorAg * 100) / 100,
      margem_estimada: Math.round(margemAg * 10) / 10,
      gifts: [],
      gift_total_cost: 0,
      gift_perceived_value: 0,
      forma_pagamento: "Boleto",
      parcelas: parcelasAg,
      closing_probability: this._calcProbability(descontoAg, ctx, "agressivo", 0),
      margin_ok: margemAg >= minMargin,
      discount_ok: descontoAg <= maxDiscount,
      requires_approval: !!(rules.approval_required_above && valorAg >= rules.approval_required_above),
      is_edited: false,
    });

    // Determine best scenario
    const validScenarios = scenarios.filter((s) => s.margin_ok && s.discount_ok);
    const best = validScenarios.length > 0
      ? validScenarios.sort((a, b) => b.closing_probability - a.closing_probability)[0].type
      : "equilibrado";

    const recommendation = this._buildRecommendation(ctx, gap, best, gifts.length > 0);

    return { scenarios, gap_analysis: gap, recommendation, best_scenario: best };
  }

  // ─── Find Strategic Gifts ──────────────────────────────────
  async findStrategicGifts(
    tenantId: string,
    budget: number,
    _context: string
  ): Promise<GiftSuggestion[]> {
    if (budget <= 0) return [];

    const catalog = await fetchCatalog(tenantId);
    const eligible = catalog
      .filter((p) => p.cost_price <= budget && p.stock_quantity > 0)
      .map((p) => ({
        product_id: p.id,
        name: p.name,
        cost_price: p.cost_price,
        sale_price: p.sale_price,
        perceived_value: p.sale_price, // perceived = sale price
        category: p.category,
        image_url: p.image_url,
        in_stock: p.stock_quantity > 0,
      }))
      .sort((a, b) => {
        // Sort by perceived-to-cost ratio (best bang for buck)
        const ratioA = a.perceived_value / a.cost_price;
        const ratioB = b.perceived_value / b.cost_price;
        return ratioB - ratioA;
      });

    return eligible.slice(0, 5);
  }

  // ─── Calculate Gap ─────────────────────────────────────────
  calculateGap(proposta: number, concorrente?: number): GapAnalysis {
    if (!concorrente || concorrente <= 0) {
      return {
        has_competitor: false,
        gap_absoluto: 0,
        gap_percentual: 0,
        impacto_margem: 0,
        estrategia_sugerida: "Sem referência de concorrente. Foque em valor percebido e diferenciação.",
      };
    }

    const gap = proposta - concorrente;
    const gapPct = (gap / proposta) * 100;

    let estrategia: string;
    if (gapPct <= 5) {
      estrategia = "GAP pequeno (<5%). Brinde estratégico pode eliminar a diferença sem desconto.";
    } else if (gapPct <= 15) {
      estrategia = "GAP moderado (5-15%). Combine brinde + desconto leve para competir.";
    } else {
      estrategia = "GAP alto (>15%). Desconto agressivo + diferenciação de produto necessários.";
    }

    return {
      has_competitor: true,
      gap_absoluto: Math.round(gap * 100) / 100,
      gap_percentual: Math.round(gapPct * 10) / 10,
      impacto_margem: Math.round(gapPct * 10) / 10,
      estrategia_sugerida: estrategia,
    };
  }

  // ─── Validate Margin ──────────────────────────────────────
  validateMargin(scenario: ArbitrageScenario, rules: SalesRules): {
    valid: boolean;
    violations: string[];
  } {
    const violations: string[] = [];

    if (rules.min_margin > 0 && scenario.margem_estimada < rules.min_margin) {
      violations.push(
        `Margem ${scenario.margem_estimada.toFixed(1)}% abaixo do mínimo ${rules.min_margin}%`
      );
    }
    if (rules.max_discount > 0 && rules.max_discount < 100 && scenario.desconto_percentual > rules.max_discount) {
      violations.push(
        `Desconto ${scenario.desconto_percentual.toFixed(1)}% excede o limite de ${rules.max_discount}%`
      );
    }

    return { valid: violations.length === 0, violations };
  }

  // ─── Record Outcome (Feedback Loop) ────────────────────────
  async recordOutcome(outcome: ArbitrageOutcome): Promise<void> {
    const payload = {
      tenant_id: outcome.tenant_id,
      user_id: outcome.user_id || null,
      client_id: outcome.client_id,
      event_type: "arbitrage_scenario",
      strategy_used: outcome.gift_included ? "brinde" : "desconto",
      price_offered: outcome.valor_final,
      deal_result: outcome.result,
      metadata: {
        scenario_type: outcome.scenario_type,
        scenario_id: outcome.scenario_id,
        gift_included: outcome.gift_included,
        gift_ids: outcome.gift_ids,
        competitor_price: outcome.competitor_price,
        tempo_fechamento_dias: outcome.tempo_fechamento_dias,
      },
    };

    await supabase
      .from("ai_learning_events" as unknown as "clients")
      .insert(payload);
  }

  // ─── Private: Calculate Probability ────────────────────────
  private _calcProbability(
    discountPct: number,
    ctx: ArbitrageContext,
    type: ArbitrageScenarioType,
    giftPerceivedValue: number
  ): number {
    let base = 30;

    // Discount impact
    if (discountPct > 20) base += 25;
    else if (discountPct > 10) base += 15;
    else if (discountPct > 5) base += 8;

    // Gift impact (perceived value as % of proposal)
    if (giftPerceivedValue > 0) {
      const giftPct = (giftPerceivedValue / ctx.valor_proposta) * 100;
      base += Math.min(giftPct * 2, 20);
    }

    // Temperature
    if (ctx.temperatura === "quente") base += 12;
    else if (ctx.temperatura === "morno") base += 3;
    else if (ctx.temperatura === "frio") base -= 5;

    // DISC
    if (ctx.perfil_disc === "D") base += 5;
    else if (ctx.perfil_disc === "I") base += 3;
    else if (ctx.perfil_disc === "C") base -= 3;

    // Inactivity penalty
    if (ctx.days_inactive > 7) base -= 10;
    else if (ctx.days_inactive > 3) base -= 5;

    // Competitor pressure
    if (ctx.valor_concorrente && ctx.valor_concorrente > 0) {
      const gap = (ctx.valor_proposta - ctx.valor_concorrente) / ctx.valor_proposta;
      if (type === "agressivo" && gap > 0.1) base += 10;
      if (type === "valor_maximo" && gap > 0.15) base -= 10;
    }

    return Math.min(Math.max(Math.round(base), 5), 98);
  }

  // ─── Private: Build Recommendation ─────────────────────────
  private _buildRecommendation(
    ctx: ArbitrageContext,
    gap: GapAnalysis,
    bestType: ArbitrageScenarioType,
    hasGifts: boolean
  ): string {
    const parts: string[] = [];

    if (gap.has_competitor) {
      parts.push(`Concorrente ${formatCurrency(ctx.valor_concorrente!)}. GAP: ${gap.gap_percentual}%.`);
    }

    if (bestType === "valor_maximo" && hasGifts) {
      parts.push("Recomendação: ofereça brinde estratégico mantendo preço cheio.");
    } else if (bestType === "equilibrado") {
      parts.push("Recomendação: desconto moderado com parcelamento facilita decisão.");
    } else {
      parts.push("Recomendação: desconto agressivo necessário — use gatilho de escassez.");
    }

    if (ctx.temperatura === "quente") {
      parts.push("Lead quente — feche rápido, evite dar tempo ao concorrente.");
    } else if (ctx.temperatura === "frio") {
      parts.push("Lead frio — reativação necessária antes da negociação.");
    }

    return parts.join(" ");
  }
}

// ==================== SINGLETON ====================

let _instance: NegotiationArbitrageEngine | null = null;

export function getArbitrageEngine(): NegotiationArbitrageEngine {
  if (!_instance) _instance = new NegotiationArbitrageEngine();
  return _instance;
}
