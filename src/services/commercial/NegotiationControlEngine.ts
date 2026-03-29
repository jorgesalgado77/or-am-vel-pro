/**
 * NegotiationControlEngine — Motor Central de Controle de Negociação
 *
 * Orquestra a negociação ponta a ponta integrando:
 * - CommercialDecisionEngine (análise de deal, cenários, desconto)
 * - NegotiationArbitrageEngine (brinde vs desconto, GAP)
 * - ClientBehaviorEngine (previsão de comportamento, engajamento)
 * - LearningEngine (padrões aprendidos)
 *
 * Controla estratégia, timing, preço, mensagem e detecta fechamento.
 * Suporta modos: automático, assistido, manual.
 *
 * Multi-tenant isolado. Sem any. Feedback loop integrado.
 */

import { supabase } from "@/lib/supabaseClient";
import { getCommercialEngine } from "./CommercialDecisionEngine";
import { getArbitrageEngine, type ArbitrageResult } from "./NegotiationArbitrageEngine";
import { getBehaviorEngine, type BehaviorPrediction, type EngagementScore, type ResistanceAnalysis } from "./ClientBehaviorEngine";
import { getOptimizationEngine } from "@/services/ai/OptimizationEngine";
import type { DealContext, DealAnalysis, DiscountDecision, MessageContext, StrategyRecommendation } from "./types";
import type { OptimizationResult } from "@/services/ai/types";

// ==================== TYPES ====================

export type NegotiationMode = "automatico" | "assistido" | "manual";

export type NegotiationStrategy =
  | "urgencia"
  | "valor"
  | "prova_social"
  | "negociacao"
  | "escassez"
  | "reciprocidade"
  | "consultiva"
  | "fechamento";

export type TimingDecision = "responder_agora" | "esperar" | "followup_agendado" | "escalar";

export type ClosingSignal =
  | "pergunta_prazo"
  | "pergunta_pagamento"
  | "aceite_verbal"
  | "urgencia_cliente"
  | "comparacao_positiva"
  | "pedido_proposta_formal"
  | "nenhum";

export interface NegotiationContext {
  tenant_id: string;
  user_id?: string;
  client_id: string;
  client_name: string;
  client_status: string;
  days_inactive: number;
  has_simulation: boolean;
  valor_orcamento: number;
  custo_total?: number;
  valor_concorrente?: number;
  temperatura?: string;
  perfil_disc?: string;
  modo: NegotiationMode;
  mensagens: Array<{ mensagem: string; remetente_tipo: string; created_at?: string }>;
  estagio_venda: string;
  phone?: string;
}

export interface NegotiationDecision {
  // Strategy
  strategy: NegotiationStrategy;
  strategy_confidence: number;
  strategy_reasoning: string;

  // Timing
  timing: TimingDecision;
  timing_reasoning: string;
  wait_minutes?: number;

  // Pricing
  pricing: PricingDecision;

  // Message
  suggested_message: string;
  message_tone: string;
  message_type: string;

  // Closing detection
  closing_signals: ClosingSignal[];
  is_closing_opportunity: boolean;
  closing_action?: string;

  // Behavior prediction
  predicted_move: BehaviorPrediction;
  engagement: EngagementScore;
  resistance: ResistanceAnalysis;

  // Meta
  mode: NegotiationMode;
  requires_approval: boolean;
  deal_analysis: DealAnalysis;
  arbitrage?: ArbitrageResult;
  optimization?: OptimizationResult;
}

export interface PricingDecision {
  desconto_recomendado: number;
  valor_final: number;
  margem_estimada: number;
  usar_brinde: boolean;
  brinde_sugerido?: string;
  forma_pagamento: string;
  parcelas: number;
  discount_detail: DiscountDecision;
}

export interface NegotiationFeedback {
  tenant_id: string;
  user_id?: string;
  client_id: string;
  decision_strategy: NegotiationStrategy;
  decision_timing: TimingDecision;
  desconto_aplicado: number;
  brinde_oferecido: boolean;
  resultado: "positivo" | "negativo" | "neutro" | "sem_resposta";
  deal_result?: "ganho" | "perdido" | "abandonado";
  tempo_resposta_segundos?: number;
  closing_signal_detected: boolean;
}

// ==================== CLOSING SIGNAL PATTERNS ====================

const CLOSING_PATTERNS: Array<{ signal: ClosingSignal; patterns: RegExp[] }> = [
  {
    signal: "pergunta_prazo",
    patterns: [
      /quanto tempo|prazo de entrega|quando fica pronto|em quantos dias|prazo/i,
    ],
  },
  {
    signal: "pergunta_pagamento",
    patterns: [
      /como pag|forma de pagamento|parc|boleto|cart[ãa]o|pix|entrada|financ/i,
    ],
  },
  {
    signal: "aceite_verbal",
    patterns: [
      /vamos fechar|pode fazer|quero|fechado|pode mandar|manda o contrato|vou pegar|vou levar/i,
    ],
  },
  {
    signal: "urgencia_cliente",
    patterns: [
      /preciso urgente|preciso r[áa]pido|pra ontem|logo|o mais r[áa]pido|esta semana/i,
    ],
  },
  {
    signal: "comparacao_positiva",
    patterns: [
      /melhor que|mais bonito|gostei mais|prefer|vocês são melhores/i,
    ],
  },
  {
    signal: "pedido_proposta_formal",
    patterns: [
      /manda a proposta|envia o or[çc]amento|proposta formal|contrato|documenta/i,
    ],
  },
];

// ==================== ENGINE ====================

export class NegotiationControlEngine {
  // ─── Main Orchestration ────────────────────────────────────
  async controlNegotiation(ctx: NegotiationContext): Promise<NegotiationDecision> {
    const cde = getCommercialEngine();
    const behavior = getBehaviorEngine();

    // Build DealContext for CDE
    const dealCtx = this._buildDealContext(ctx);

    // Run all analyses in parallel
    const [analysis, discount, messageContext, strategyRec, behaviorData, arbitrage, optimization] =
      await Promise.all([
        cde.analyzeDeal(dealCtx),
        cde.decideDiscount(dealCtx),
        Promise.resolve(cde.generateMessageContext(dealCtx)),
        cde.suggestStrategy(dealCtx),
        Promise.resolve(this._analyzeBehavior(ctx, behavior)),
        this._getArbitrage(ctx),
        this._getOptimization(ctx),
      ]);

    // 1. Define Strategy
    const strategy = this._selectStrategy(ctx, analysis, behaviorData, optimization);

    // 2. Detect Closing Signals
    const closingSignals = this._detectClosingSignals(ctx.mensagens);
    const isClosing = closingSignals.length > 0 && closingSignals[0] !== "nenhum";

    // Override strategy if closing detected
    const finalStrategy = isClosing ? "fechamento" as NegotiationStrategy : strategy.strategy;

    // 3. Timing Decision
    const timing = this._decideTiming(ctx, analysis, behaviorData, isClosing);

    // 4. Pricing Decision
    const pricing = this._decidePricing(ctx, discount, arbitrage, analysis);

    // 5. Message Generation
    const message = this._generateMessage(ctx, finalStrategy, messageContext, pricing, closingSignals);

    // 6. Closing Action
    const closingAction = isClosing
      ? this._buildClosingAction(closingSignals, ctx, pricing)
      : undefined;

    // 7. Approval requirement — use sales_rules max_discount
    const salesRules = await this._fetchSalesRules(ctx.tenant_id);
    const salesRulesMaxDiscount = salesRules?.max_discount ?? 100;
    const discountLimitForApproval = salesRulesMaxDiscount < 100 ? salesRulesMaxDiscount : 15;
    const requiresApproval = ctx.modo === "assistido" ||
      (pricing.desconto_recomendado > discountLimitForApproval) ||
      (pricing.margem_estimada < (salesRules?.min_margin ?? 10));

    // 8. Warning if no discount policy configured
    const warnings: string[] = [];
    if (salesRulesMaxDiscount >= 100 && (!dealCtx.discounts.available_options)) {
      warnings.push("⚠️ Nenhuma política de desconto cadastrada. Configure em Configurações > Regras Comerciais.");
    }

    return {
      strategy: finalStrategy,
      strategy_confidence: strategy.confidence,
      strategy_reasoning: strategy.reasoning,
      timing: timing.decision,
      timing_reasoning: timing.reasoning,
      wait_minutes: timing.wait_minutes,
      pricing,
      suggested_message: message.text,
      message_tone: message.tone,
      message_type: message.type,
      closing_signals: closingSignals,
      is_closing_opportunity: isClosing,
      closing_action: closingAction,
      predicted_move: behaviorData.prediction,
      engagement: behaviorData.engagement,
      resistance: behaviorData.resistance,
      mode: ctx.modo,
      requires_approval: requiresApproval,
      deal_analysis: analysis,
      arbitrage: arbitrage ?? undefined,
      optimization: optimization ?? undefined,
    };
  }

  // ─── Record Feedback ──────────────────────────────────────
  async recordFeedback(feedback: NegotiationFeedback): Promise<void> {
    const payload = {
      tenant_id: feedback.tenant_id,
      user_id: feedback.user_id || null,
      client_id: feedback.client_id,
      event_type: "negotiation_control",
      strategy_used: feedback.decision_strategy,
      discount_percentage: feedback.desconto_aplicado,
      client_response: feedback.resultado,
      deal_result: feedback.deal_result || null,
      response_time_seconds: feedback.tempo_resposta_segundos || null,
      metadata: {
        timing_decision: feedback.decision_timing,
        brinde_oferecido: feedback.brinde_oferecido,
        closing_signal_detected: feedback.closing_signal_detected,
      },
    };

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (supabase as any)
      .from("ai_learning_events")
      .insert(payload);
  }

  // ─── Realtime Adaptation ───────────────────────────────────
  async adaptToResponse(
    previousDecision: NegotiationDecision,
    newMessage: string,
    ctx: NegotiationContext
  ): Promise<NegotiationDecision> {
    // Add new message to context
    const updatedCtx: NegotiationContext = {
      ...ctx,
      mensagens: [
        ...ctx.mensagens,
        { mensagem: newMessage, remetente_tipo: "cliente", created_at: new Date().toISOString() },
      ],
    };

    // Re-run full analysis with updated context
    return this.controlNegotiation(updatedCtx);
  }

  // ═══════════════════════════════════════════════════════════
  // PRIVATE METHODS
  // ═══════════════════════════════════════════════════════════

  private _buildDealContext(ctx: NegotiationContext): DealContext {
    return {
      tenant_id: ctx.tenant_id,
      user_id: ctx.user_id,
      customer: {
        id: ctx.client_id,
        name: ctx.client_name,
        status: ctx.client_status,
        temperature: ctx.temperatura as DealContext["customer"]["temperature"],
        disc_profile: ctx.perfil_disc as DealContext["customer"]["disc_profile"],
        days_inactive: ctx.days_inactive,
        has_simulation: ctx.has_simulation,
        phone: ctx.phone,
      },
      pricing: { total_price: ctx.valor_orcamento },
      payment: {
        forma_pagamento: "Boleto",
        parcelas: 1,
        valor_entrada: 0,
        plus_percentual: 0,
      },
      discounts: { desconto1: 0, desconto2: 0, desconto3: 0 },
      negotiation_history: ctx.mensagens.map((m) => ({
        mensagem: m.mensagem,
        remetente_tipo: m.remetente_tipo,
        created_at: m.created_at,
      })),
    };
  }

  private _analyzeBehavior(
    ctx: NegotiationContext,
    engine: ReturnType<typeof getBehaviorEngine>
  ): { prediction: BehaviorPrediction; engagement: EngagementScore; resistance: ResistanceAnalysis } {
    const behaviorCtx = {
      clientName: ctx.client_name,
      status: ctx.client_status,
      daysInactive: ctx.days_inactive,
      hasSimulation: ctx.has_simulation,
      valorOrcamento: ctx.valor_orcamento,
      conversationHistory: ctx.mensagens,
    };

    return {
      prediction: engine.predictNextMove(behaviorCtx),
      engagement: engine.calculateEngagementScore(behaviorCtx),
      resistance: engine.detectResistanceLevel(behaviorCtx),
    };
  }

  private _selectStrategy(
    ctx: NegotiationContext,
    analysis: DealAnalysis,
    behavior: { prediction: BehaviorPrediction; engagement: EngagementScore; resistance: ResistanceAnalysis },
    optimization: OptimizationResult | null
  ): { strategy: NegotiationStrategy; confidence: number; reasoning: string } {
    // AI optimization override if confident
    if (optimization && optimization.strategy_confidence > 70) {
      const mapped = this._mapOptimizationStrategy(optimization.recommended_strategy);
      if (mapped) {
        return {
          strategy: mapped,
          confidence: optimization.strategy_confidence,
          reasoning: `IA aprendeu: "${optimization.recommended_strategy}" converte ${optimization.closing_probability_boost}% melhor. ${optimization.reasoning}`,
        };
      }
    }

    // Behavior-driven strategy
    const { prediction, resistance, engagement } = behavior;

    if (prediction.nextMove === "vai_fechar") {
      return { strategy: "fechamento", confidence: prediction.confidence, reasoning: "Cliente com sinais de fechamento. Conduza para proposta final." };
    }

    if (resistance.level > 70) {
      return { strategy: "valor", confidence: 75, reasoning: `Alta resistência (${resistance.category}). Foque em valor e diferenciação.` };
    }

    if (prediction.nextMove === "vai_pedir_desconto") {
      return { strategy: "negociacao", confidence: prediction.confidence, reasoning: "Cliente provavelmente vai pedir desconto. Prepare argumentação de valor antes." };
    }

    if (prediction.nextMove === "vai_comparar_concorrente" && ctx.valor_concorrente) {
      return { strategy: "prova_social", confidence: 65, reasoning: "Concorrência ativa. Use provas sociais e depoimentos." };
    }

    if (engagement.level === "baixo" || engagement.level === "perdido") {
      return { strategy: "urgencia", confidence: 60, reasoning: `Engajamento ${engagement.level}. Crie urgência para reativar.` };
    }

    if (analysis.closing_probability > 60) {
      return { strategy: "fechamento", confidence: analysis.closing_probability, reasoning: `Probabilidade de ${analysis.closing_probability}%. Conduza para o fechamento.` };
    }

    return { strategy: "consultiva", confidence: 50, reasoning: "Situação neutra. Abordagem consultiva para entender necessidades." };
  }

  private _mapOptimizationStrategy(s: string): NegotiationStrategy | null {
    const map: Record<string, NegotiationStrategy> = {
      urgencia: "urgencia",
      valor: "valor",
      prova_social: "prova_social",
      escassez: "escassez",
      reciprocidade: "reciprocidade",
      consultiva: "consultiva",
      desconto: "negociacao",
      parcelamento: "negociacao",
    };
    return map[s] || null;
  }

  private _decideTiming(
    ctx: NegotiationContext,
    analysis: DealAnalysis,
    behavior: { engagement: EngagementScore; prediction: BehaviorPrediction },
    isClosing: boolean
  ): { decision: TimingDecision; reasoning: string; wait_minutes?: number } {
    // Always respond immediately to closing signals
    if (isClosing) {
      return { decision: "responder_agora", reasoning: "Sinais de fechamento detectados — responda imediatamente." };
    }

    // Hot leads — respond fast
    if (ctx.temperatura === "quente" || analysis.closing_probability > 70) {
      return { decision: "responder_agora", reasoning: "Lead quente / alta probabilidade. Resposta imediata." };
    }

    // Low engagement — scheduled follow-up
    if (behavior.engagement.level === "perdido") {
      return {
        decision: "followup_agendado",
        reasoning: "Engajamento perdido. Agende follow-up em 24h.",
        wait_minutes: 1440,
      };
    }

    // Recent rapid exchange — wait briefly to avoid flooding
    const recentMessages = ctx.mensagens
      .filter((m) => m.remetente_tipo === "loja" && m.created_at)
      .filter((m) => {
        const diff = Date.now() - new Date(m.created_at!).getTime();
        return diff < 10 * 60 * 1000; // last 10 min
      });

    if (recentMessages.length >= 3) {
      return {
        decision: "esperar",
        reasoning: "Muitas mensagens recentes. Aguarde resposta do cliente.",
        wait_minutes: 15,
      };
    }

    // High resistance — give breathing room
    if (behavior.prediction.nextMove === "vai_consultar_decisor") {
      return {
        decision: "esperar",
        reasoning: "Cliente vai consultar outro decisor. Dê tempo e retorne em 2h.",
        wait_minutes: 120,
      };
    }

    // Default
    return { decision: "responder_agora", reasoning: "Tempo ideal para resposta." };
  }

  private _decidePricing(
    ctx: NegotiationContext,
    discount: DiscountDecision,
    arbitrage: ArbitrageResult | null,
    analysis: DealAnalysis
  ): PricingDecision {
    const totalDisc = discount.recommended_d1 + discount.recommended_d2 * 0.5 + discount.recommended_d3 * 0.3;
    const valorFinal = ctx.valor_orcamento * (1 - totalDisc / 100);
    const custoEst = ctx.custo_total ?? ctx.valor_orcamento * 0.6;
    const margem = ((valorFinal - custoEst) / ctx.valor_orcamento) * 100;

    // Check if arbitrage suggests gift instead
    let usarBrinde = false;
    let brindeSugerido: string | undefined;

    if (arbitrage) {
      const valorMaximo = arbitrage.scenarios.find((s) => s.type === "valor_maximo");
      if (
        valorMaximo &&
        valorMaximo.margin_ok &&
        valorMaximo.gifts.length > 0 &&
        valorMaximo.closing_probability >= analysis.closing_probability - 5
      ) {
        usarBrinde = true;
        brindeSugerido = valorMaximo.gifts[0].name;
      }
    }

    return {
      desconto_recomendado: Math.round(totalDisc * 10) / 10,
      valor_final: Math.round(valorFinal * 100) / 100,
      margem_estimada: Math.round(margem * 10) / 10,
      usar_brinde: usarBrinde,
      brinde_sugerido: brindeSugerido,
      forma_pagamento: "Boleto",
      parcelas: 1,
      discount_detail: discount,
    };
  }

  private _detectClosingSignals(
    mensagens: NegotiationContext["mensagens"]
  ): ClosingSignal[] {
    const clientMessages = mensagens
      .filter((m) => m.remetente_tipo === "cliente")
      .slice(-5);

    if (clientMessages.length === 0) return ["nenhum"];

    const signals: ClosingSignal[] = [];

    for (const msg of clientMessages) {
      for (const { signal, patterns } of CLOSING_PATTERNS) {
        if (patterns.some((p) => p.test(msg.mensagem))) {
          if (!signals.includes(signal)) signals.push(signal);
        }
      }
    }

    return signals.length > 0 ? signals : ["nenhum"];
  }

  private _generateMessage(
    ctx: NegotiationContext,
    strategy: NegotiationStrategy,
    messageCtx: MessageContext,
    pricing: PricingDecision,
    closingSignals: ClosingSignal[]
  ): { text: string; tone: string; type: string } {
    const name = ctx.client_name.split(" ")[0];

    const strategyMessages: Record<NegotiationStrategy, () => string> = {
      urgencia: () =>
        `${name}, essa condição especial é por tempo limitado! ${pricing.desconto_recomendado > 0 ? `Com ${pricing.desconto_recomendado}% de desconto, o valor fica ${this._formatCurrency(pricing.valor_final)}.` : ""} Posso reservar pra você?`,

      valor: () =>
        `${name}, nosso diferencial vai além do preço. Qualidade, prazo e acabamento fazem toda a diferença no resultado final. ${pricing.usar_brinde ? `E como bônus, incluímos ${pricing.brinde_sugerido} no seu projeto!` : ""} Quer saber mais?`,

      prova_social: () =>
        `${name}, diversos clientes na sua região escolheram nossa solução e ficaram muito satisfeitos! Posso te mostrar alguns projetos semelhantes ao seu?`,

      negociacao: () =>
        `${name}, preparei uma condição especial: ${this._formatCurrency(pricing.valor_final)}${pricing.parcelas > 1 ? ` em até ${pricing.parcelas}x` : " à vista"}. ${pricing.usar_brinde ? `Inclui brinde: ${pricing.brinde_sugerido}!` : ""} O que acha?`,

      escassez: () =>
        `${name}, temos disponibilidade limitada para este mês! Se fecharmos agora, garanto o prazo e as condições. Vamos agendar?`,

      reciprocidade: () =>
        `${name}, preparei algo especial pra você! ${pricing.usar_brinde ? `Além do projeto, incluo ${pricing.brinde_sugerido} como presente.` : `Uma condição exclusiva de ${this._formatCurrency(pricing.valor_final)}.`} É minha forma de agradecer seu interesse!`,

      consultiva: () =>
        `${name}, gostaria de entender melhor suas necessidades. Quais são os pontos mais importantes pra você nesse projeto? Assim posso preparar a melhor proposta.`,

      fechamento: () => {
        if (closingSignals.includes("aceite_verbal")) {
          return `Ótimo, ${name}! Vou preparar tudo pra você. O valor final fica ${this._formatCurrency(pricing.valor_final)}. Posso enviar o contrato agora?`;
        }
        if (closingSignals.includes("pergunta_pagamento")) {
          return `${name}, temos condições flexíveis! ${this._formatCurrency(pricing.valor_final)}${pricing.parcelas > 1 ? ` em até ${pricing.parcelas}x no boleto` : " à vista com desconto especial"}. Quer que eu formalize?`;
        }
        return `${name}, com base em tudo que conversamos, posso fechar nas condições de ${this._formatCurrency(pricing.valor_final)}. Vamos formalizar?`;
      },
    };

    const text = strategyMessages[strategy]();

    // Determine tone from DISC
    let tone = messageCtx.tom || "amigavel";
    if (ctx.perfil_disc === "D") tone = "direto";
    else if (ctx.perfil_disc === "I") tone = "entusiasmado";
    else if (ctx.perfil_disc === "S") tone = "acolhedor";
    else if (ctx.perfil_disc === "C") tone = "tecnico";

    return { text, tone, type: strategy };
  }

  private _buildClosingAction(
    signals: ClosingSignal[],
    ctx: NegotiationContext,
    pricing: PricingDecision
  ): string {
    if (signals.includes("aceite_verbal")) {
      return `Enviar contrato para ${ctx.client_name} — ${this._formatCurrency(pricing.valor_final)}`;
    }
    if (signals.includes("pedido_proposta_formal")) {
      return `Gerar proposta formal para ${ctx.client_name}`;
    }
    if (signals.includes("pergunta_pagamento")) {
      return `Enviar opções de pagamento para ${ctx.client_name}`;
    }
    if (signals.includes("urgencia_cliente")) {
      return `Priorizar atendimento — cliente com urgência`;
    }
    return `Oportunidade de fechamento detectada — conduzir ${ctx.client_name} para proposta`;
  }

  private async _getArbitrage(ctx: NegotiationContext): Promise<ArbitrageResult | null> {
    try {
      const engine = getArbitrageEngine();
      return await engine.generateArbitrageScenarios({
        tenant_id: ctx.tenant_id,
        user_id: ctx.user_id,
        client_id: ctx.client_id,
        client_name: ctx.client_name,
        valor_proposta: ctx.valor_orcamento,
        valor_concorrente: ctx.valor_concorrente,
        custo_total: ctx.custo_total,
        estagio_venda: ctx.estagio_venda,
        perfil_disc: ctx.perfil_disc,
        temperatura: ctx.temperatura,
        days_inactive: ctx.days_inactive,
        has_simulation: ctx.has_simulation,
      });
    } catch {
      return null;
    }
  }

  private async _getOptimization(ctx: NegotiationContext): Promise<OptimizationResult | null> {
    try {
      const optimizer = getOptimizationEngine(ctx.tenant_id);
      const dealCtx = this._buildDealContext(ctx);
      return await optimizer.optimizeDecision(dealCtx);
    } catch {
      return null;
    }
  }

  private _formatCurrency(val: number): string {
    return val.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
  }

  private async _fetchSalesRules(tenantId: string): Promise<{ min_margin: number; max_discount: number } | null> {
    try {
      const { data } = await supabase
        .from("sales_rules" as any)
        .select("min_margin, max_discount")
        .eq("tenant_id", tenantId)
        .maybeSingle();
      if (!data) return null;
      return { min_margin: Number((data as any).min_margin) || 0, max_discount: Number((data as any).max_discount) || 100 };
    } catch {
      return null;
    }
  }
}

// ==================== SINGLETON ====================

let _instance: NegotiationControlEngine | null = null;

export function getControlEngine(): NegotiationControlEngine {
  if (!_instance) _instance = new NegotiationControlEngine();
  return _instance;
}
