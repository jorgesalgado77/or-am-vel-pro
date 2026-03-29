/**
 * CommercialDirectorEngine — IA Diretora Comercial
 *
 * Orchestrates high-level commercial strategy:
 * - Business analysis (pipeline, conversion, goals)
 * - Revenue forecasting with risk assessment
 * - Team management (vendor performance, alerts)
 * - Strategy definition based on real data
 * - Integration with LearningEngine + OptimizationEngine
 *
 * Multi-tenant isolated. Does NOT duplicate CDE logic.
 */

import { supabase } from "@/lib/supabaseClient";
import { getLearningEngine } from "@/services/ai/LearningEngine";
import { getOptimizationEngine } from "@/services/ai/OptimizationEngine";

// ==================== TYPES ====================

export interface BusinessAnalysis {
  pipeline: {
    total_leads: number;
    in_negotiation: number;
    proposals_sent: number;
    hot_leads: number;
    stalled_leads: number;
    pipeline_value: number;
  };
  conversion: {
    rate: number;
    trend: "up" | "down" | "stable";
    avg_close_days: number;
  };
  goals: {
    meta_loja: number;
    revenue_atual: number;
    pct_atingido: number;
    gap: number;
    days_remaining: number;
  };
  team_size: number;
  alerts: DirectorAlert[];
}

export interface RevenueForecast {
  month: string;
  pipeline_value: number;
  pipeline_count: number;
  conversion_rate: number;
  previsao_otimista: number;
  previsao_realista: number;
  previsao_pessimista: number;
  meta_loja: number;
  risco: "baixo" | "medio" | "alto" | "critico";
  confianca: number;
  insights: string[];
}

export interface VendorAnalysis {
  user_id: string;
  user_name: string;
  deals_closed: number;
  revenue: number;
  leads_count: number;
  conversion_rate: number;
  avg_close_days: number;
  stalled_count: number;
  status: "excellent" | "good" | "attention" | "critical";
  recommendations: string[];
}

export interface DirectorAlert {
  type: "revenue_risk" | "vendor_critical" | "hot_lead_idle" | "goal_risk" | "opportunity";
  severity: "low" | "medium" | "high" | "critical";
  title: string;
  message: string;
  action?: string;
  metadata?: Record<string, unknown>;
}

export interface StrategyDefinition {
  approach: "conservative" | "balanced" | "aggressive";
  focus_areas: string[];
  discount_guidance: { min: number; max: number; sweet_spot: number };
  priority_actions: string[];
  reasoning: string;
}

// ==================== ENGINE ====================

export class CommercialDirectorEngine {
  private tenantId: string;

  constructor(tenantId: string) {
    this.tenantId = tenantId;
  }

  /**
   * Full business analysis — pipeline, conversion, goals, alerts
   */
  async analyzeBusiness(): Promise<BusinessAnalysis> {
    const [clients, contracts, goals, usuarios] = await Promise.all([
      this.fetchClients(),
      this.fetchContracts(),
      this.fetchGoals(),
      this.fetchUsuarios(),
    ]);

    const contractClientIds = new Set(contracts.map(c => c.client_id));
    const threeDaysAgo = new Date();
    threeDaysAgo.setDate(threeDaysAgo.getDate() - 3);

    const openClients = clients.filter(c => !contractClientIds.has(c.id) && c.status !== "perdido" && c.status !== "fechado");
    const inNegotiation = openClients.filter(c => c.status === "em_negociacao");
    const proposalsSent = openClients.filter(c => c.status === "proposta_enviada");
    const hotLeads = openClients.filter(c =>
      ["em_negociacao", "proposta_enviada"].includes(c.status) &&
      new Date(c.updated_at || c.created_at) >= threeDaysAgo
    );
    const stalledLeads = openClients.filter(c =>
      new Date(c.updated_at || c.created_at) < threeDaysAgo
    );

    // Pipeline value from tracking
    const { data: trackings } = await supabase
      .from("client_tracking" as any)
      .select("client_id, valor_contrato")
      .eq("tenant_id", this.tenantId);

    const trackingMap = new Map((trackings || []).map((t: any) => [t.client_id, Number(t.valor_contrato) || 0]));
    const pipelineValue = openClients.reduce((sum, c) => sum + (trackingMap.get(c.id) || 0), 0);

    // Revenue from contracts
    const revenue = await this.calculateRevenue(contracts);

    // Goals
    const currentMonth = this.getCurrentMonth();
    const metaLoja = goals.find((g: any) => g.goal_type === "meta_loja" && g.month === currentMonth);
    const metaValue = metaLoja?.target_value || 0;
    const now = new Date();
    const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
    const daysRemaining = Math.max(0, daysInMonth - now.getDate());

    // Conversion
    const allCount = openClients.length + contractClientIds.size;
    const convRate = allCount > 0 ? (contractClientIds.size / allCount) * 100 : 0;

    // Avg close days
    let totalDays = 0, countDays = 0;
    for (const contract of contracts) {
      const client = clients.find(c => c.id === contract.client_id);
      if (client) {
        const days = Math.max(0, Math.floor((new Date(contract.created_at).getTime() - new Date(client.created_at).getTime()) / 86400000));
        totalDays += days;
        countDays++;
      }
    }

    // Alerts
    const alerts: DirectorAlert[] = [];

    if (stalledLeads.length > 5) {
      alerts.push({
        type: "hot_lead_idle",
        severity: "high",
        title: "Leads parados em excesso",
        message: `${stalledLeads.length} leads sem atividade há +3 dias. Pipeline estagnado.`,
        action: "Cobrar vendedores e redistribuir leads",
      });
    }

    const pctAtingido = metaValue > 0 ? (revenue / metaValue) * 100 : 0;
    if (daysRemaining <= 10 && pctAtingido < 60 && metaValue > 0) {
      alerts.push({
        type: "goal_risk",
        severity: "critical",
        title: "Meta em risco crítico",
        message: `Apenas ${pctAtingido.toFixed(0)}% da meta atingida com ${daysRemaining} dias restantes.`,
        action: "Ativar modo agressivo de vendas",
      });
    }

    if (convRate < 10 && allCount > 10) {
      alerts.push({
        type: "revenue_risk",
        severity: "high",
        title: "Conversão muito baixa",
        message: `Taxa de conversão em ${convRate.toFixed(1)}%. Investigar abordagem de vendas.`,
      });
    }

    if (hotLeads.length >= 3) {
      alerts.push({
        type: "opportunity",
        severity: "medium",
        title: "Oportunidades quentes",
        message: `${hotLeads.length} leads quentes em negociação ativa. Priorizar fechamento.`,
        action: "Focar equipe nos leads quentes",
      });
    }

    return {
      pipeline: {
        total_leads: openClients.length,
        in_negotiation: inNegotiation.length,
        proposals_sent: proposalsSent.length,
        hot_leads: hotLeads.length,
        stalled_leads: stalledLeads.length,
        pipeline_value: pipelineValue,
      },
      conversion: {
        rate: Math.round(convRate * 10) / 10,
        trend: convRate >= 20 ? "up" : convRate >= 10 ? "stable" : "down",
        avg_close_days: countDays > 0 ? Math.round(totalDays / countDays) : 0,
      },
      goals: {
        meta_loja: metaValue,
        revenue_atual: revenue,
        pct_atingido: Math.round(pctAtingido * 10) / 10,
        gap: Math.max(0, metaValue - revenue),
        days_remaining: daysRemaining,
      },
      team_size: usuarios.length,
      alerts,
    };
  }

  /**
   * Revenue forecasting with confidence intervals
   */
  async forecastRevenue(): Promise<RevenueForecast> {
    const analysis = await this.analyzeBusiness();
    const learning = getLearningEngine(this.tenantId);
    const patterns = await learning.analyzePatterns();

    const { pipeline, conversion, goals } = analysis;

    // Base forecast from pipeline * conversion rate
    const baseConversion = conversion.rate / 100;
    const adjustedConversion = patterns.discountSpot
      ? Math.min(baseConversion * 1.1, 0.5) // slight boost if sweet spot is known
      : baseConversion;

    const previsaoRealista = goals.revenue_atual + (pipeline.pipeline_value * adjustedConversion);
    const previsaoOtimista = goals.revenue_atual + (pipeline.pipeline_value * Math.min(adjustedConversion * 1.4, 0.6));
    const previsaoPessimista = goals.revenue_atual + (pipeline.pipeline_value * adjustedConversion * 0.6);

    // Risk
    const pctExpected = goals.meta_loja > 0 ? (previsaoRealista / goals.meta_loja) * 100 : 100;
    let risco: RevenueForecast["risco"] = "baixo";
    if (pctExpected < 50) risco = "critico";
    else if (pctExpected < 70) risco = "alto";
    else if (pctExpected < 90) risco = "medio";

    // Confidence based on data volume
    const dataPoints = pipeline.total_leads + (patterns.strategies?.length || 0) * 5;
    const confianca = Math.min(95, Math.max(20, 30 + dataPoints * 2));

    const insights: string[] = [];
    if (risco === "critico") {
      insights.push(`⚠️ Previsão realista de ${this.fmt(previsaoRealista)} está muito abaixo da meta de ${this.fmt(goals.meta_loja)}`);
      insights.push("Ação urgente: aumentar volume de atendimentos e reduzir ciclo de venda");
    }
    if (pipeline.stalled_leads > pipeline.hot_leads) {
      insights.push(`${pipeline.stalled_leads} leads parados vs ${pipeline.hot_leads} quentes — pipeline congestionado`);
    }
    if (patterns.discountSpot) {
      insights.push(`Sweet-spot de desconto: ${patterns.discountSpot.optimal}% (máx efetivo: ${patterns.discountSpot.max_effective}%)`);
    }
    if (goals.days_remaining <= 7 && goals.pct_atingido < 80) {
      insights.push(`Apenas ${goals.days_remaining} dias restantes com ${goals.pct_atingido}% da meta. Modo urgência!`);
    }

    const forecast: RevenueForecast = {
      month: this.getCurrentMonth(),
      pipeline_value: pipeline.pipeline_value,
      pipeline_count: pipeline.total_leads,
      conversion_rate: conversion.rate,
      previsao_otimista: Math.round(previsaoOtimista),
      previsao_realista: Math.round(previsaoRealista),
      previsao_pessimista: Math.round(previsaoPessimista),
      meta_loja: goals.meta_loja,
      risco,
      confianca: Math.round(confianca),
      insights,
    };

    // Persist forecast
    this.persistForecast(forecast).catch(console.error);

    return forecast;
  }

  /**
   * Team management — analyze each vendor's performance
   */
  async manageTeam(): Promise<VendorAnalysis[]> {
    const [clients, contracts, usuarios] = await Promise.all([
      this.fetchClients(),
      this.fetchContracts(),
      this.fetchUsuarios(),
    ]);

    const contractClientIds = new Set(contracts.map(c => c.client_id));
    const threeDaysAgo = new Date();
    threeDaysAgo.setDate(threeDaysAgo.getDate() - 3);

    const results: VendorAnalysis[] = [];

    for (const user of usuarios) {
      const userClients = clients.filter(c => c.vendedor === user.nome_completo || c.responsavel_id === user.id);
      const closed = userClients.filter(c => contractClientIds.has(c.id));
      const open = userClients.filter(c => !contractClientIds.has(c.id) && c.status !== "perdido");
      const stalled = open.filter(c => new Date(c.updated_at || c.created_at) < threeDaysAgo);

      const totalAttempted = open.length + closed.length;
      const convRate = totalAttempted > 0 ? (closed.length / totalAttempted) * 100 : 0;

      // Revenue
      let revenue = 0;
      for (const c of closed) {
        const contract = contracts.find(ct => ct.client_id === c.id);
        if (contract?.valor_contrato) revenue += Number(contract.valor_contrato);
      }

      // Avg days
      let totalDays = 0, daysCount = 0;
      for (const c of closed) {
        const contract = contracts.find(ct => ct.client_id === c.id);
        if (contract) {
          const days = Math.floor((new Date(contract.created_at).getTime() - new Date(c.created_at).getTime()) / 86400000);
          totalDays += Math.max(0, days);
          daysCount++;
        }
      }

      let status: VendorAnalysis["status"] = "good";
      const recommendations: string[] = [];

      if (convRate >= 25) {
        status = "excellent";
        recommendations.push("Manter ritmo e compartilhar boas práticas com a equipe");
      } else if (convRate >= 15) {
        status = "good";
        recommendations.push("Bom desempenho. Focar nos leads quentes para aumentar conversão");
      } else if (convRate >= 5 || stalled.length > 3) {
        status = "attention";
        recommendations.push(`${stalled.length} leads parados — cobrar retorno imediato`);
        if (convRate < 10) recommendations.push("Taxa de conversão baixa — revisar abordagem de vendas");
      } else {
        status = "critical";
        recommendations.push("Performance crítica — necessário acompanhamento direto do gestor");
        recommendations.push("Avaliar necessidade de treinamento ou redistribuição de leads");
      }

      results.push({
        user_id: user.id,
        user_name: user.nome_completo,
        deals_closed: closed.length,
        revenue,
        leads_count: open.length,
        conversion_rate: Math.round(convRate * 10) / 10,
        avg_close_days: daysCount > 0 ? Math.round(totalDays / daysCount) : 0,
        stalled_count: stalled.length,
        status,
        recommendations,
      });
    }

    return results.sort((a, b) => b.revenue - a.revenue);
  }

  /**
   * Define strategy based on current data + learned patterns
   */
  async defineStrategy(): Promise<StrategyDefinition> {
    const [analysis, forecast] = await Promise.all([
      this.analyzeBusiness(),
      this.forecastRevenue(),
    ]);

    const learning = getLearningEngine(this.tenantId);
    const patterns = await learning.analyzePatterns();

    // Determine approach based on risk
    let approach: StrategyDefinition["approach"] = "balanced";
    if (forecast.risco === "critico" || forecast.risco === "alto") {
      approach = "aggressive";
    } else if (forecast.risco === "baixo" && analysis.goals.pct_atingido > 80) {
      approach = "conservative";
    }

    // Discount guidance from learned patterns
    const sweetSpot = patterns.discountSpot;
    const discountGuidance = sweetSpot
      ? { min: sweetSpot.min_effective, max: sweetSpot.max_effective, sweet_spot: sweetSpot.optimal }
      : { min: 3, max: 12, sweet_spot: 8 };

    const focusAreas: string[] = [];
    const priorityActions: string[] = [];

    if (analysis.pipeline.stalled_leads > 3) {
      focusAreas.push("Reativação de leads parados");
      priorityActions.push(`Reativar ${analysis.pipeline.stalled_leads} leads inativos com mensagens personalizadas`);
    }
    if (analysis.pipeline.hot_leads > 0) {
      focusAreas.push("Fechamento de leads quentes");
      priorityActions.push(`Priorizar ${analysis.pipeline.hot_leads} leads quentes para fechamento imediato`);
    }
    if (analysis.conversion.rate < 15) {
      focusAreas.push("Melhoria da taxa de conversão");
      priorityActions.push("Revisar script de vendas e abordagem inicial");
    }
    if (analysis.goals.days_remaining <= 10) {
      focusAreas.push("Sprint final do mês");
      priorityActions.push("Intensificar follow-ups e oferecer condições especiais");
    }

    // Best strategy from learning
    const bestStrategy = patterns.strategies?.[0];
    if (bestStrategy) {
      priorityActions.push(`Priorizar estratégia "${bestStrategy.strategy}" (${(bestStrategy.conversion_rate * 100).toFixed(0)}% conversão histórica)`);
    }

    const reasoning = approach === "aggressive"
      ? `Meta em risco (${forecast.risco}). Previsão realista de ${this.fmt(forecast.previsao_realista)} vs meta de ${this.fmt(forecast.meta_loja)}. Necessário intensificar vendas.`
      : approach === "conservative"
        ? `Meta confortável (${analysis.goals.pct_atingido}% atingido). Manter ritmo e proteger margem.`
        : `Situação equilibrada. Focar em conversão e follow-ups para garantir a meta.`;

    return { approach, focus_areas: focusAreas, discount_guidance: discountGuidance, priority_actions: priorityActions, reasoning };
  }

  /**
   * Build director context string for Edge Function system prompt injection
   */
  async buildDirectorContext(): Promise<string> {
    try {
      const [analysis, forecast, team] = await Promise.all([
        this.analyzeBusiness(),
        this.forecastRevenue(),
        this.manageTeam(),
      ]);

      const parts: string[] = ["\n\n=== ANÁLISE DA DIRETORA COMERCIAL (dados em tempo real) ==="];

      // Pipeline
      parts.push(`\n📊 Pipeline: ${analysis.pipeline.total_leads} leads (${analysis.pipeline.hot_leads} quentes, ${analysis.pipeline.stalled_leads} parados)`);
      parts.push(`   Valor pipeline: ${this.fmt(analysis.pipeline.pipeline_value)}`);

      // Goals
      parts.push(`\n🎯 Meta: ${this.fmt(analysis.goals.meta_loja)} | Atual: ${this.fmt(analysis.goals.revenue_atual)} (${analysis.goals.pct_atingido}%)`);
      parts.push(`   Gap: ${this.fmt(analysis.goals.gap)} | ${analysis.goals.days_remaining} dias restantes`);

      // Forecast
      parts.push(`\n📈 Previsão: Otimista ${this.fmt(forecast.previsao_otimista)} | Realista ${this.fmt(forecast.previsao_realista)} | Pessimista ${this.fmt(forecast.previsao_pessimista)}`);
      parts.push(`   Risco: ${forecast.risco.toUpperCase()} | Confiança: ${forecast.confianca}%`);

      // Team
      if (team.length > 0) {
        parts.push("\n👥 Equipe:");
        for (const v of team.slice(0, 8)) {
          const emoji = v.status === "excellent" ? "🏆" : v.status === "good" ? "✅" : v.status === "attention" ? "⚠️" : "🔴";
          parts.push(`   ${emoji} ${v.user_name}: ${v.deals_closed} vendas, ${this.fmt(v.revenue)}, ${v.conversion_rate}% conv, ${v.stalled_count} parados`);
        }
      }

      // Alerts
      if (analysis.alerts.length > 0) {
        parts.push("\n🚨 Alertas:");
        for (const a of analysis.alerts) {
          parts.push(`   [${a.severity.toUpperCase()}] ${a.title}: ${a.message}`);
        }
      }

      // Forecast insights
      if (forecast.insights.length > 0) {
        parts.push("\n💡 Insights da previsão:");
        for (const i of forecast.insights) {
          parts.push(`   • ${i}`);
        }
      }

      parts.push("\n\nComo DIRETORA COMERCIAL, use estes dados para tomar decisões estratégicas, cobrar resultados e sugerir ações específicas por vendedor.");
      return parts.join("\n");
    } catch (e) {
      console.error("CommercialDirectorEngine.buildDirectorContext error:", e);
      return "";
    }
  }

  // ==================== PRIVATE HELPERS ====================

  private fmt(val: number): string {
    return val.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
  }

  private getCurrentMonth(): string {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  }

  private async fetchClients() {
    const { data } = await supabase
      .from("clients" as any)
      .select("id, nome, status, created_at, updated_at, vendedor, responsavel_id")
      .eq("tenant_id", this.tenantId);
    return (data || []) as any[];
  }

  private async fetchContracts() {
    const { data } = await supabase
      .from("client_contracts" as any)
      .select("id, client_id, simulation_id, created_at, valor_contrato, valor_com_desconto, vendedor_id")
      .eq("tenant_id", this.tenantId);
    return (data || []) as any[];
  }

  private async fetchGoals() {
    const { data } = await supabase
      .from("sales_goals" as any)
      .select("*")
      .eq("tenant_id", this.tenantId);
    return (data || []) as any[];
  }

  private async fetchUsuarios() {
    const { data } = await supabase
      .from("usuarios" as any)
      .select("id, nome_completo, cargo_id, cargos(nome)")
      .eq("tenant_id", this.tenantId)
      .eq("ativo", true);
    // Filter only vendedor projetista
    const all = (data || []) as any[];
    return all.filter((u: any) => {
      const cargoNome = (u.cargos?.nome || "").toLowerCase();
      return cargoNome.includes("vendedor") || cargoNome.includes("projetista");
    });
  }

  private async calculateRevenue(contracts: any[]): Promise<number> {
    if (contracts.length === 0) return 0;
    let total = 0;
    for (const contract of contracts) {
      // Prefer valor_com_desconto (valor à vista) as the standard metric
      if (contract.valor_com_desconto && Number(contract.valor_com_desconto) > 0) {
        total += Number(contract.valor_com_desconto);
      } else if (contract.valor_contrato) {
        total += Number(contract.valor_contrato) || 0;
      }
    }
    return total;
  }

  private async fetchSalesRules(): Promise<{ min_margin: number; max_discount: number } | null> {
    const { data } = await supabase
      .from("sales_rules" as any)
      .select("min_margin, max_discount")
      .eq("tenant_id", this.tenantId)
      .maybeSingle();
    return data ? { min_margin: Number((data as any).min_margin) || 0, max_discount: Number((data as any).max_discount) || 100 } : null;
  }

  private async fetchDiscountOptions(): Promise<any[]> {
    const { data } = await supabase
      .from("discount_options" as any)
      .select("*")
      .eq("tenant_id", this.tenantId);
    return (data || []) as any[];
  }

  private async persistForecast(forecast: RevenueForecast): Promise<void> {
    try {
      await supabase
        .from("revenue_forecast" as any)
        .upsert({
          tenant_id: this.tenantId,
          month: forecast.month,
          pipeline_value: forecast.pipeline_value,
          pipeline_count: forecast.pipeline_count,
          conversion_rate: forecast.conversion_rate,
          previsao_otimista: forecast.previsao_otimista,
          previsao_realista: forecast.previsao_realista,
          previsao_pessimista: forecast.previsao_pessimista,
          meta_loja: forecast.meta_loja,
          risco: forecast.risco,
          confianca: forecast.confianca,
          insights: forecast.insights,
        } as any, { onConflict: "tenant_id,month" });
    } catch { /* silent */ }
  }
}

// ==================== SINGLETON ====================

const directorCache = new Map<string, CommercialDirectorEngine>();

export function getDirectorEngine(tenantId: string): CommercialDirectorEngine {
  if (!directorCache.has(tenantId)) {
    directorCache.set(tenantId, new CommercialDirectorEngine(tenantId));
  }
  return directorCache.get(tenantId)!;
}
