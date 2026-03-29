/**
 * CommercialDecisionEngine — Unified commercial intelligence core.
 *
 * Centralizes ALL commercial logic: pricing, discounts, scenarios,
 * lead analysis, strategy recommendations, and message context.
 *
 * Delegates to existing pure functions (financing.ts, leadTemperature.ts,
 * vendazapAnalysis.ts) instead of duplicating them.
 */

import { calculateSimulation, formatCurrency, type SimulationInput } from "@/lib/financing";
import { calcLeadTemperature, type LeadTemperature } from "@/lib/leadTemperature";
import { analyzeVendaZapMessage, detectDiscFromMessages, type DiscProfile, type VendaZapMessageLike } from "@/lib/vendazapAnalysis";
import { supabase } from "@/lib/supabaseClient";
import type {
  DealContext,
  DealAnalysis,
  DealScenario,
  PriceCalculation,
  DiscountDecision,
  MessageContext,
  StrategyRecommendation,
  SalesRules,
  FormaPagamento,
  TriggerContext,
  TriggerAction,
  TriggerActionType,
} from "./types";

// ==================== SALES RULES CACHE ====================

const rulesCache = new Map<string, { rules: SalesRules; ts: number }>();
const RULES_CACHE_TTL = 5 * 60 * 1000; // 5 min

async function fetchSalesRules(tenantId: string): Promise<SalesRules> {
  const cached = rulesCache.get(tenantId);
  if (cached && Date.now() - cached.ts < RULES_CACHE_TTL) return cached.rules;

  const { data } = await supabase
    .from("sales_rules" as any)
    .select("*")
    .eq("tenant_id", tenantId)
    .maybeSingle();

  const rules: SalesRules = data
    ? {
        tenant_id: tenantId,
        min_margin: Number((data as any).min_margin) || 0,
        max_discount: Number((data as any).max_discount) || 100,
        preferred_payment: (data as any).preferred_payment || "Boleto",
        max_parcelas: (data as any).max_parcelas || undefined,
        approval_required_above: (data as any).approval_required_above || undefined,
      }
    : {
        tenant_id: tenantId,
        min_margin: 0,
        max_discount: 100,
        preferred_payment: "Boleto",
      };

  rulesCache.set(tenantId, { rules, ts: Date.now() });
  return rules;
}

// ==================== PURE HELPERS ====================

function applyDiscounts(base: number, d1: number, d2: number, d3: number): number {
  return base * (1 - d1 / 100) * (1 - d2 / 100) * (1 - d3 / 100);
}

function totalDiscountPercent(base: number, discounted: number): number {
  return base > 0 ? ((base - discounted) / base) * 100 : 0;
}

function closingProbability(
  discountPct: number,
  hasFinancing: boolean,
  historicalRate: number,
  valorTotal: number,
  temperature?: LeadTemperature,
  discProfile?: DiscProfile,
): number {
  let base = historicalRate > 0 ? historicalRate : 35;

  // Discount impact
  if (discountPct > 20) base += 25;
  else if (discountPct > 10) base += 15;
  else if (discountPct > 5) base += 8;

  // Financing
  if (hasFinancing) base += 10;

  // High-value penalty
  if (valorTotal > 50000) base -= 5;
  if (valorTotal > 100000) base -= 8;

  // Temperature boost
  if (temperature === "quente") base += 12;
  else if (temperature === "morno") base += 3;
  else if (temperature === "frio") base -= 5;

  // DISC adjustments
  if (discProfile === "D") base += 5;   // decisive
  else if (discProfile === "I") base += 3; // enthusiastic
  else if (discProfile === "C") base -= 3; // analytical, slower

  return Math.min(Math.max(Math.round(base), 5), 98);
}

// ==================== ENGINE ====================

export class CommercialDecisionEngine {
  // ─── analyzeDeal ───────────────────────────────────────────
  async analyzeDeal(ctx: DealContext): Promise<DealAnalysis> {
    const rules = await fetchSalesRules(ctx.tenant_id);

    // Temperature
    const temperature = ctx.customer.temperature || calcLeadTemperature({
      status: ctx.customer.status,
      diasSemResposta: ctx.customer.days_inactive,
      temSimulacao: ctx.customer.has_simulation,
    });

    // DISC from history
    const discProfile = ctx.customer.disc_profile ||
      (ctx.negotiation_history
        ? detectDiscFromMessages(ctx.negotiation_history as VendaZapMessageLike[]).profile
        : "");

    // Calculate current discount %
    const valorBase = ctx.pricing.total_price * (1 + (ctx.pricing.commission_indicator || 0) / 100);
    const valorDesc = applyDiscounts(valorBase, ctx.discounts.desconto1, ctx.discounts.desconto2, ctx.discounts.desconto3);
    const discPct = totalDiscountPercent(valorBase, valorDesc);

    const hasFinancing = ["Boleto", "Credito", "Credito / Boleto"].includes(ctx.payment.forma_pagamento);
    const prob = closingProbability(discPct, hasFinancing, 0, valorDesc, temperature, discProfile || undefined);

    const insights: string[] = [];

    // Risk assessment
    let riskLevel: "low" | "medium" | "high" = "low";
    if (ctx.customer.days_inactive > 7) {
      riskLevel = "high";
      insights.push(`Lead parado há ${ctx.customer.days_inactive} dias — risco de perda.`);
    } else if (ctx.customer.days_inactive > 3) {
      riskLevel = "medium";
      insights.push(`${ctx.customer.days_inactive} dias sem contato — acompanhe.`);
    }

    // Margin alert
    let marginAlert: string | undefined;
    const estimatedMargin = 100 - discPct + ctx.payment.plus_percentual;
    if (rules.min_margin > 0 && estimatedMargin < rules.min_margin) {
      marginAlert = `Margem de ${estimatedMargin.toFixed(1)}% abaixo do mínimo (${rules.min_margin}%).`;
      insights.push(marginAlert);
      riskLevel = "high";
    }

    // Discount rules
    if (rules.max_discount > 0 && discPct > rules.max_discount) {
      insights.push(`Desconto de ${discPct.toFixed(1)}% excede o limite de ${rules.max_discount}%.`);
    }

    // Temperature insights
    if (temperature === "quente") {
      insights.push("Lead quente — priorize o fechamento rápido.");
    } else if (temperature === "frio") {
      insights.push("Lead frio — considere reativação ou descarte.");
    }

    // Recommended aggressiveness
    let aggressiveness: "conservadora" | "comercial" | "agressiva" = "comercial";
    if (temperature === "quente" && ctx.customer.days_inactive <= 2) aggressiveness = "conservadora";
    if (temperature === "frio" || ctx.customer.days_inactive > 7) aggressiveness = "agressiva";

    return {
      closing_probability: prob,
      risk_level: riskLevel,
      recommended_aggressiveness: aggressiveness,
      insights,
      margin_alert: marginAlert,
    };
  }

  // ─── generateScenarios ────────────────────────────────────
  async generateScenarios(ctx: DealContext, availableParcelas: number[] = [1]): Promise<DealScenario[]> {
    const rules = await fetchSalesRules(ctx.tenant_id);
    const opts = ctx.discounts.available_options;
    if (!opts) return [];

    const d1 = opts.desconto1;
    const d2 = opts.desconto2;
    const d3 = opts.desconto3;
    const plus = opts.plus;

    const temperature = ctx.customer.temperature || calcLeadTemperature({
      status: ctx.customer.status,
      diasSemResposta: ctx.customer.days_inactive,
      temSimulacao: ctx.customer.has_simulation,
    });

    // Conservadora
    const conservD1 = d1.length > 0 ? Math.min(...d1.filter(v => v > 0)) || 0 : 0;
    const conservPlus = plus.length > 0 ? Math.max(...plus) : 0;
    const conservSim = this._simulate(ctx, conservD1, 0, 0, conservPlus, "A vista", 1, 0);

    // Comercial
    const comD1 = d1.length > 1 ? d1[Math.floor(d1.length / 2)] : (d1[0] || 0);
    const comD2 = d2.length > 1 ? d2[Math.floor(d2.length / 2)] : (d2[0] || 0);
    const midIdx = Math.floor(availableParcelas.length / 2);
    const comParcelas = availableParcelas[midIdx] || 1;
    const comSim = this._simulate(ctx, comD1, comD2, 0, 0, "Boleto", comParcelas, 0);

    // Agressiva
    const agrD1 = d1.length > 0 ? Math.max(...d1) : 0;
    const agrD2 = d2.length > 0 ? Math.max(...d2) : 0;
    const agrD3 = d3.length > 0 ? Math.max(...d3) : 0;
    const agrParcelas = availableParcelas[availableParcelas.length - 1] || comParcelas;
    const agrSim = this._simulate(ctx, agrD1, agrD2, agrD3, 0, "Boleto", agrParcelas, 0);

    const valorBase = ctx.pricing.total_price * (1 + (ctx.pricing.commission_indicator || 0) / 100);

    const buildScenario = (
      type: DealScenario["type"],
      label: string,
      desc: string,
      dd1: number, dd2: number, dd3: number, pp: number,
      fp: FormaPagamento, parc: number, ent: number,
      sim: ReturnType<typeof calculateSimulation>,
    ): DealScenario => {
      const discPct = totalDiscountPercent(valorBase, sim.valorComDesconto);
      const margin = 100 - discPct + pp;
      const prob = closingProbability(discPct, fp !== "A vista" && fp !== "Pix", 0, sim.valorFinal, temperature);

      return {
        type, label, description: desc,
        desconto1: dd1, desconto2: dd2, desconto3: dd3, plus_percentual: pp,
        forma_pagamento: fp, parcelas: parc, valor_entrada: ent,
        simulation: sim,
        margin_estimated: Math.round(margin * 10) / 10,
        closing_probability: prob,
        margin_ok: rules.min_margin <= 0 || margin >= rules.min_margin,
        discount_ok: rules.max_discount >= 100 || discPct <= rules.max_discount,
      };
    };

    return [
      buildScenario("conservadora", "Conservadora", "Menor desconto, máxima margem. Ideal para clientes já decididos.",
        conservD1, 0, 0, conservPlus, "A vista", 1, 0, conservSim),
      buildScenario("comercial", "Comercial", "Equilíbrio entre desconto e lucro. Bom para negociações em andamento.",
        comD1, comD2, 0, 0, "Boleto", comParcelas, 0, comSim),
      buildScenario("agressiva", "Agressiva", "Máximo desconto + parcelamento. Para fechar negócios difíceis.",
        agrD1, agrD2, agrD3, 0, "Boleto", agrParcelas, 0, agrSim),
    ];
  }

  // ─── calculatePrice ───────────────────────────────────────
  async calculatePrice(ctx: DealContext): Promise<PriceCalculation> {
    const rules = await fetchSalesRules(ctx.tenant_id);
    const sim = this._simulate(
      ctx,
      ctx.discounts.desconto1,
      ctx.discounts.desconto2,
      ctx.discounts.desconto3,
      ctx.payment.plus_percentual,
      ctx.payment.forma_pagamento,
      ctx.payment.parcelas,
      ctx.payment.valor_entrada,
    );

    const valorBase = ctx.pricing.total_price * (1 + (ctx.pricing.commission_indicator || 0) / 100);
    const valorAVista = applyDiscounts(valorBase, ctx.discounts.desconto1, ctx.discounts.desconto2, ctx.discounts.desconto3);
    const discPct = totalDiscountPercent(valorBase, valorAVista);
    const margin = 100 - discPct + ctx.payment.plus_percentual;

    let violation: string | undefined;
    if (rules.min_margin > 0 && margin < rules.min_margin) {
      violation = `Margem ${margin.toFixed(1)}% abaixo do mínimo ${rules.min_margin}%`;
    }
    if (rules.max_discount > 0 && rules.max_discount < 100 && discPct > rules.max_discount) {
      violation = (violation ? violation + ". " : "") + `Desconto ${discPct.toFixed(1)}% excede ${rules.max_discount}%`;
    }

    return {
      simulation: sim,
      valor_a_vista: valorAVista,
      margin_estimated: Math.round(margin * 10) / 10,
      total_discount_percent: Math.round(discPct * 10) / 10,
      rules_violation: violation,
    };
  }

  // ─── decideDiscount ───────────────────────────────────────
  async decideDiscount(ctx: DealContext): Promise<DiscountDecision> {
    const rules = await fetchSalesRules(ctx.tenant_id);
    const opts = ctx.discounts.available_options;
    if (!opts) {
      return { recommended_d1: 0, recommended_d2: 0, recommended_d3: 0, recommended_plus: 0, reasoning: "Sem opções de desconto disponíveis.", respects_rules: true };
    }

    const temperature = ctx.customer.temperature || calcLeadTemperature({
      status: ctx.customer.status,
      diasSemResposta: ctx.customer.days_inactive,
      temSimulacao: ctx.customer.has_simulation,
    });

    let d1 = 0, d2 = 0, d3 = 0, plus = 0;
    let reasoning = "";

    if (temperature === "quente") {
      // Hot lead: minimal discount
      d1 = opts.desconto1.length > 0 ? Math.min(...opts.desconto1.filter(v => v > 0)) || 0 : 0;
      plus = opts.plus.length > 0 ? Math.max(...opts.plus) : 0;
      reasoning = "Lead quente — mínimo desconto, máximo plus. Cliente já demonstrou alta intenção.";
    } else if (temperature === "morno") {
      // Warm: moderate
      d1 = opts.desconto1.length > 1 ? opts.desconto1[Math.floor(opts.desconto1.length / 2)] : (opts.desconto1[0] || 0);
      d2 = opts.desconto2.length > 1 ? opts.desconto2[Math.floor(opts.desconto2.length / 2)] : 0;
      reasoning = "Lead morno — desconto moderado para incentivar decisão.";
    } else {
      // Cold: aggressive
      d1 = opts.desconto1.length > 0 ? Math.max(...opts.desconto1) : 0;
      d2 = opts.desconto2.length > 0 ? Math.max(...opts.desconto2) : 0;
      d3 = opts.desconto3.length > 0 ? opts.desconto3[Math.floor(opts.desconto3.length / 2)] : 0;
      reasoning = "Lead frio — desconto mais agressivo para reativar interesse.";
    }

    // DISC adjustments
    if (ctx.customer.disc_profile === "D") {
      reasoning += " Perfil Dominante: reduza rodeios, apresente o preço direto.";
    } else if (ctx.customer.disc_profile === "C") {
      reasoning += " Perfil Conforme: detalhe os cálculos e mostre a composição.";
    }

    // Check rules
    const valorBase = ctx.pricing.total_price * (1 + (ctx.pricing.commission_indicator || 0) / 100);
    const discounted = applyDiscounts(valorBase, d1, d2, d3);
    const discPct = totalDiscountPercent(valorBase, discounted);
    let respects = true;

    if (rules.max_discount > 0 && rules.max_discount < 100 && discPct > rules.max_discount) {
      // Reduce to fit within limit
      d3 = 0;
      const disc2 = applyDiscounts(valorBase, d1, d2, 0);
      const disc2Pct = totalDiscountPercent(valorBase, disc2);
      if (disc2Pct > rules.max_discount) {
        d2 = 0;
      }
      reasoning += ` Ajustado para respeitar o limite de desconto de ${rules.max_discount}%.`;
    }

    const finalDisc = applyDiscounts(valorBase, d1, d2, d3);
    const finalMargin = 100 - totalDiscountPercent(valorBase, finalDisc) + plus;
    if (rules.min_margin > 0 && finalMargin < rules.min_margin) {
      respects = false;
      reasoning += ` ⚠️ Margem de ${finalMargin.toFixed(1)}% abaixo do mínimo ${rules.min_margin}%.`;
    }

    return { recommended_d1: d1, recommended_d2: d2, recommended_d3: d3, recommended_plus: plus, reasoning, respects_rules: respects };
  }

  // ─── generateMessageContext ───────────────────────────────
  generateMessageContext(ctx: DealContext): MessageContext {
    const lastMsg = ctx.negotiation_history
      ?.filter(m => m.remetente_tipo === "cliente")
      ?.slice(-1)[0]?.mensagem || "";

    // Intent detection (reuses vendazapAnalysis)
    const analysis = lastMsg ? analyzeVendaZapMessage(lastMsg) : null;

    // DISC
    const disc = ctx.negotiation_history
      ? detectDiscFromMessages(ctx.negotiation_history as VendaZapMessageLike[])
      : null;

    // Auto copy type
    let tipoCopy = "geral";
    if (analysis) {
      const intentMap: Record<string, string> = {
        fechamento: "fechamento",
        orçamento: "reuniao",
        negociação: "reuniao",
        objeção: "objecao",
        resistência: "objecao",
        enviar_preco: "reuniao",
        canal_alternativo: "reuniao",
        desinteresse_explicit: "reativacao",
      };
      tipoCopy = intentMap[analysis.intent] || "geral";
    } else {
      if (ctx.customer.days_inactive > 7) tipoCopy = "reativacao";
      else if (ctx.customer.status === "proposta_enviada") tipoCopy = "fechamento";
      else if (ctx.customer.status === "em_negociacao") tipoCopy = "reuniao";
      else if (ctx.customer.days_inactive > 3) tipoCopy = "urgencia";
    }

    // Auto tone
    let tom = "amigavel";
    if (lastMsg) {
      const lower = lastMsg.toLowerCase();
      if (/urgente|rápido|preciso|logo|já|agora/i.test(lower)) tom = "urgente";
      else if (/obrigad|por favor|gentileza|gostaria/i.test(lower)) tom = "formal";
      else if (/kkk|haha|rsrs|😂|😄|💪|👍/i.test(lower)) tom = "descontraido";
      else if (/caro|absurdo|reclamar|insatisf/i.test(lower)) tom = "empatico";
    }

    // DISC tone override
    const discProfile = disc?.profile || ctx.customer.disc_profile;
    if (discProfile === "D" && tom === "amigavel") tom = "direto";
    else if (discProfile === "I" && tom === "amigavel") tom = "entusiasmado";
    else if (discProfile === "S" && tom === "amigavel") tom = "acolhedor";
    else if (discProfile === "C" && tom === "amigavel") tom = "tecnico";

    return {
      tipo_copy: tipoCopy,
      tom,
      disc_profile: discProfile || undefined,
      last_client_message: lastMsg || undefined,
      valor_orcamento: ctx.pricing.total_price,
    };
  }

  // ─── suggestStrategy ──────────────────────────────────────
  async suggestStrategy(ctx: DealContext): Promise<StrategyRecommendation> {
    const analysis = await this.analyzeDeal(ctx);
    const discount = await this.decideDiscount(ctx);

    let action = "";
    let priority: "low" | "medium" | "high" = "medium";

    if (analysis.risk_level === "high") {
      priority = "high";
      if (ctx.customer.days_inactive > 7) {
        action = `Reative ${ctx.customer.name} com urgência — ${ctx.customer.days_inactive} dias sem contato.`;
      } else {
        action = analysis.insights.join(" ");
      }
    } else if (analysis.closing_probability > 70) {
      priority = "high";
      action = `Feche com ${ctx.customer.name} agora! Probabilidade de ${analysis.closing_probability}%.`;
    } else if (analysis.closing_probability > 45) {
      action = `Continue negociando com ${ctx.customer.name}. Sugira condições ${analysis.recommended_aggressiveness}s.`;
    } else {
      priority = "low";
      action = `Reavalie a abordagem com ${ctx.customer.name}. Conversão de ${analysis.closing_probability}% está baixa.`;
    }

    return {
      action,
      priority,
      reasoning: discount.reasoning,
      suggested_discount: discount,
      suggested_scenario: analysis.recommended_aggressiveness,
    };
  }

  // ─── decideClientAction (ORCHESTRATION) ────────────────────
  /**
   * Central orchestration method. Combines all CDE capabilities into a
   * single decision object for a given client context.
   * Use ClientContextBuilder to construct the DealContext before calling.
   */
  async decideClientAction(ctx: DealContext, availableParcelas: number[] = [1, 6, 12, 18, 24]): Promise<{
    analysis: DealAnalysis;
    scenarios: DealScenario[];
    discount: DiscountDecision;
    messageContext: MessageContext;
    strategy: StrategyRecommendation;
    suggestedAction: string;
    urgency: "immediate" | "today" | "this_week" | "low";
  }> {
    // Run analysis and discount in parallel
    const [analysis, scenarios, discount] = await Promise.all([
      this.analyzeDeal(ctx),
      this.generateScenarios(ctx, availableParcelas),
      this.decideDiscount(ctx),
    ]);

    const messageContext = this.generateMessageContext(ctx);
    const strategy = await this.suggestStrategy(ctx);

    // Determine urgency
    let urgency: "immediate" | "today" | "this_week" | "low" = "this_week";
    if (analysis.risk_level === "high" && analysis.closing_probability > 50) {
      urgency = "immediate";
    } else if (analysis.risk_level === "high") {
      urgency = "today";
    } else if (analysis.closing_probability > 70) {
      urgency = "immediate";
    } else if (analysis.closing_probability < 25) {
      urgency = "low";
    }

    // Build a human-readable suggested action
    let suggestedAction = strategy.action;
    if (urgency === "immediate" && ctx.customer.days_inactive <= 1) {
      suggestedAction = `🔥 Feche agora com ${ctx.customer.name}! Prob. ${analysis.closing_probability}%.`;
    } else if (ctx.customer.days_inactive > 7) {
      suggestedAction = `⚠️ Reative ${ctx.customer.name} urgente — ${ctx.customer.days_inactive}d sem contato.`;
    }

    return {
      analysis,
      scenarios,
      discount,
      messageContext,
      strategy,
      suggestedAction,
      urgency,
    };
  }

  // ─── handleTrigger (INTELLIGENT TRIGGER DECISION) ──────────
  /**
   * Analyzes a trigger and decides the best automated action
   * using the full CDE analysis instead of just notifying.
   */
  async handleTrigger(trigger: TriggerContext): Promise<TriggerAction> {
    const ctx: DealContext = {
      tenant_id: trigger.tenant_id,
      customer: {
        id: trigger.client_id,
        name: trigger.client_name,
        status: trigger.client_status,
        days_inactive: trigger.days_inactive,
        has_simulation: trigger.has_simulation,
      },
      pricing: { total_price: trigger.valor_orcamento },
      payment: {
        forma_pagamento: "Boleto",
        parcelas: 1,
        valor_entrada: 0,
        plus_percentual: 0,
      },
      discounts: { desconto1: 0, desconto2: 0, desconto3: 0 },
    };

    const [analysis, discount] = await Promise.all([
      this.analyzeDeal(ctx),
      this.decideDiscount(ctx),
    ]);

    const messageCtx = this.generateMessageContext(ctx);
    let action: TriggerActionType = "send_message";
    let message = trigger.generated_message;
    let reasoning = "";

    // Decision logic per trigger type
    switch (trigger.trigger_type) {
      case "no_response": {
        if (trigger.days_inactive > 10 && analysis.closing_probability < 20) {
          action = "wait";
          reasoning = `Lead frio (${analysis.closing_probability}% prob.) com ${trigger.days_inactive}d inativo — aguardar ou escalar.`;
          if (analysis.risk_level === "high") action = "escalate";
        } else if (analysis.closing_probability > 60) {
          action = "suggest_dealroom";
          message = `Olá ${trigger.client_name}! Preparei uma sala exclusiva com seu projeto e condições especiais. Posso te enviar o link?`;
          reasoning = `Alta probabilidade (${analysis.closing_probability}%) — convide para Deal Room.`;
        } else if (trigger.days_inactive > 5) {
          action = "send_with_discount";
          reasoning = `${trigger.days_inactive}d sem resposta — oferecer desconto para reativar.`;
          message = `Olá ${trigger.client_name}! Tenho uma condição especial para você fechar esta semana. Posso te apresentar?`;
        } else {
          action = "send_message";
          reasoning = `Follow-up padrão — ${trigger.days_inactive}d sem resposta.`;
        }
        break;
      }

      case "expiring_budget": {
        if (analysis.closing_probability > 50) {
          action = "send_with_discount";
          reasoning = `Orçamento expirando + boa probabilidade (${analysis.closing_probability}%) — oferecer condição especial.`;
          message = `${trigger.client_name}, seu orçamento está expirando! Consigo manter as condições se fecharmos esta semana. Vamos conversar?`;
        } else {
          action = "send_message";
          reasoning = `Orçamento expirando — notificar e tentar reativar.`;
          message = `Olá ${trigger.client_name}! Seu orçamento está perto de expirar. Gostaria de revisar as condições antes?`;
        }
        break;
      }

      case "viewed_no_reply": {
        if (analysis.closing_probability > 70) {
          action = "suggest_dealroom";
          message = `Vi que você checou a proposta, ${trigger.client_name}! Que tal uma reunião rápida para tirar dúvidas? Posso abrir uma sala online agora!`;
          reasoning = `Visualizou + alta probabilidade — oportunidade de fechar.`;
        } else if (analysis.risk_level === "high") {
          action = "send_with_discount";
          reasoning = `Visualizou mas não respondeu + risco alto — oferecer incentivo.`;
          message = `${trigger.client_name}, percebi que viu a proposta! Tenho uma condição especial que pode te interessar. Posso te contar?`;
        } else {
          action = "schedule_followup";
          reasoning = `Visualizou sem responder — agendar follow-up em 24h.`;
        }
        break;
      }
    }

    // Determine urgency from analysis
    let urgency: TriggerAction["urgency"] = "this_week";
    if (analysis.risk_level === "high" && analysis.closing_probability > 50) urgency = "immediate";
    else if (analysis.risk_level === "high") urgency = "today";
    else if (analysis.closing_probability > 70) urgency = "immediate";
    else if (analysis.closing_probability < 25) urgency = "low";

    return {
      action,
      message,
      urgency,
      reasoning,
      discount: action === "send_with_discount" ? discount : undefined,
      closing_probability: analysis.closing_probability,
    };
  }

  // ─── getLeadTemperature (convenience) ─────────────────────
  getLeadTemperature(status: string, daysInactive: number, hasSimulation: boolean): LeadTemperature {
    return calcLeadTemperature({ status, diasSemResposta: daysInactive, temSimulacao: hasSimulation });
  }

  // ─── getDiscProfile (convenience) ─────────────────────────
  getDiscProfile(messages: VendaZapMessageLike[]) {
    return detectDiscFromMessages(messages);
  }

  // ─── PRIVATE: Build SimulationInput & run ─────────────────
  private _simulate(
    ctx: DealContext,
    d1: number, d2: number, d3: number, plus: number,
    fp: FormaPagamento, parcelas: number, entrada: number,
  ) {
    const input: SimulationInput = {
      valorTela: ctx.pricing.total_price * (1 + (ctx.pricing.commission_indicator || 0) / 100),
      desconto1: d1,
      desconto2: d2,
      desconto3: d3,
      formaPagamento: fp,
      parcelas,
      valorEntrada: entrada,
      plusPercentual: plus,
      creditRates: ctx.payment.credit_rates,
      creditRatesFull: ctx.payment.credit_rates_full,
      boletoRates: ctx.payment.boleto_rates,
      boletoRatesFull: ctx.payment.boleto_rates_full,
      carenciaDias: ctx.payment.carencia_dias,
    };
    return calculateSimulation(input);
  }
}

// ==================== SINGLETON ====================

let _engine: CommercialDecisionEngine | null = null;

export function getCommercialEngine(): CommercialDecisionEngine {
  if (!_engine) _engine = new CommercialDecisionEngine();
  return _engine;
}

// Re-export
export { formatCurrency };
