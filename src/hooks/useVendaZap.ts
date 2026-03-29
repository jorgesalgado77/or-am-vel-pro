import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabaseClient";
import { toast } from "sonner";
import { getCommercialEngine } from "@/services/commercial/CommercialDecisionEngine";
import type { DealContext, MessageContext } from "@/services/commercial/types";
import { calcLeadTemperature } from "@/lib/leadTemperature";
import type { StrategyType } from "@/services/ai/types";

/** Fire-and-forget learning event registration */
function recordLearningEvent(
  tenantId: string,
  params: GenerateMessageParams,
  cdeContext: Partial<MessageContext>,
) {
  const strategyMap: Record<string, StrategyType> = {
    urgencia: "urgencia",
    fechamento: "valor",
    reativacao: "reativacao",
    objecao: "empatia",
    reuniao: "consultiva",
    geral: "outro",
  };

  const row = {
    tenant_id: tenantId,
    user_id: params.usuario_id || null,
    client_id: params.client_id || null,
    event_type: "message_sent",
    strategy_used: strategyMap[cdeContext.tipo_copy || "geral"] || "outro",
    discount_percentage: 0,
    disc_profile: cdeContext.disc_profile || params.disc_profile || null,
    lead_temperature: params.status_negociacao || null,
    price_offered: params.valor_orcamento || null,
  };

  const table = supabase.from("ai_learning_events" as unknown as "clients");
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  void (table as unknown as { insert: (rows: unknown[]) => { then: (cb: (r: { error: { message: string } | null }) => void) => void } })
    .insert([row])
    .then(({ error }) => {
      if (error) console.warn("[VendaZap] learning event error:", error.message);
    });
}

export interface VendaZapAddon {
  id: string;
  tenant_id: string;
  ativo: boolean;
  max_mensagens_dia: number;
  max_tokens_mensagem: number;
  prompt_sistema: string;
  tom_padrao: string;
  api_provider: string;
  openai_model: string;
}

export interface VendaZapMessage {
  id: string;
  tenant_id: string;
  usuario_id: string | null;
  client_id: string | null;
  tipo_copy: string;
  tom: string;
  contexto: Record<string, unknown>;
  mensagem_cliente: string | null;
  mensagem_gerada: string;
  tokens_usados: number;
  created_at: string;
}

interface QualityMeta {
  passed: boolean;
  reason: string;
  attempts: number;
  decisionMaker: string | null;
  discProfile: string | null;
  intent: string | null;
}

/** Parameters accepted by generateMessage */
export interface GenerateMessageParams {
  nome_cliente?: string;
  valor_orcamento?: number;
  status_negociacao?: string;
  dias_sem_resposta?: number;
  mensagem_cliente?: string;
  tipo_copy?: string;
  tom?: string;
  deal_room_link?: string;
  client_id?: string;
  usuario_id?: string;
  disc_profile?: string;
  historico?: Array<{ remetente_tipo: string; mensagem: string }>;
  learning_context?: string;
  custom_arguments?: string;
}

export function useVendaZap(tenantId: string | null) {
  const [addon, setAddon] = useState<VendaZapAddon | null>(null);
  const [messages, setMessages] = useState<VendaZapMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [dailyUsage, setDailyUsage] = useState(0);
  const [lastQuality, setLastQuality] = useState<QualityMeta | null>(null);

  const createVipAddon = (tid: string): VendaZapAddon => ({
    id: `vip-${tid}`,
    tenant_id: tid,
    ativo: true,
    max_mensagens_dia: 0,
    max_tokens_mensagem: 2000,
    prompt_sistema: "Você é um assistente de vendas especializado em móveis planejados.",
    tom_padrao: "consultivo",
    api_provider: "openai",
    openai_model: "gpt-4o-mini",
  });

  const fetchAddon = async () => {
    if (!tenantId) {
      setLoading(false);
      return;
    }

    const { data, error } = await supabase
      .from("vendazap_addon")
      .select("*")
      .eq("tenant_id", tenantId)
      .maybeSingle();

    if (data && !error) {
      setAddon(data as unknown as VendaZapAddon);
      setLoading(false);
      return;
    }

    // Fallback: check recursos_vip on tenants table
    const { data: tenant } = await supabase
      .from("tenants")
      .select("recursos_vip")
      .eq("id", tenantId)
      .single();
    const vip = (tenant as unknown as { recursos_vip?: { vendazap?: boolean } })?.recursos_vip;
    if (vip?.vendazap) {
      const { data: created, error: upsertErr } = await supabase
        .from("vendazap_addon")
        .upsert([{
          tenant_id: tenantId,
          ativo: true,
          prompt_sistema: "Você é um assistente de vendas especializado em móveis planejados.",
          tom_padrao: "consultivo",
          max_mensagens_dia: 0,
          max_tokens_mensagem: 2000,
        }], { onConflict: "tenant_id" })
        .select()
        .single();
      if (created && !upsertErr) {
        setAddon(created as unknown as VendaZapAddon);
      } else {
        setAddon(createVipAddon(tenantId));
      }
    }
    setLoading(false);
  };

  const fetchMessages = async (clientId?: string) => {
    if (!tenantId) return;

    let query = supabase
      .from("vendazap_messages")
      .select("*")
      .eq("tenant_id", tenantId)
      .order("created_at", { ascending: false })
      .limit(50);

    if (clientId) query = query.eq("client_id", clientId);

    const { data } = await query;
    if (data) setMessages(data as unknown as VendaZapMessage[]);
  };

  const fetchDailyUsage = async () => {
    if (!tenantId) return;
    const today = new Date().toISOString().split("T")[0];
    const { data, error } = await supabase
      .from("vendazap_usage")
      .select("mensagens_geradas")
      .eq("tenant_id", tenantId)
      .eq("usage_date", today);

    if (error) {
      setDailyUsage(0);
      return;
    }
    const total = (data || []).reduce((sum, row) => sum + (Number((row as Record<string, unknown>).mensagens_geradas) || 0), 0);
    setDailyUsage(total);
  };

  useEffect(() => {
    fetchAddon();
    fetchDailyUsage();
  }, [tenantId]);

  /**
   * Build CDE MessageContext to enrich the AI call with commercial strategy.
   * Falls back gracefully if data is incomplete.
   */
  const buildCDEContext = (params: GenerateMessageParams): Partial<MessageContext> => {
    try {
      const engine = getCommercialEngine();
      const daysInactive = params.dias_sem_resposta || 0;
      const temperature = calcLeadTemperature({
        status: params.status_negociacao || "novo",
        diasSemResposta: daysInactive,
        temSimulacao: (params.valor_orcamento || 0) > 0,
      });

      const ctx: DealContext = {
        tenant_id: tenantId || "",
        customer: {
          id: params.client_id || "",
          name: params.nome_cliente || "Cliente",
          status: params.status_negociacao || "novo",
          temperature,
          disc_profile: params.disc_profile as DealContext["customer"]["disc_profile"],
          days_inactive: daysInactive,
          has_simulation: (params.valor_orcamento || 0) > 0,
        },
        pricing: { total_price: params.valor_orcamento || 0 },
        payment: { forma_pagamento: "Boleto", parcelas: 1, valor_entrada: 0, plus_percentual: 0 },
        discounts: { desconto1: 0, desconto2: 0, desconto3: 0 },
        negotiation_history: params.historico?.map(h => ({
          mensagem: h.mensagem,
          remetente_tipo: h.remetente_tipo,
        })),
      };

      return engine.generateMessageContext(ctx);
    } catch {
      return {};
    }
  };

  const generateMessage = async (params: GenerateMessageParams) => {
    if (!tenantId || !addon?.ativo) {
      toast.error("VendaZap AI não está ativo para esta loja");
      return null;
    }

    if (addon.max_mensagens_dia > 0 && dailyUsage >= addon.max_mensagens_dia) {
      toast.error(`Limite diário de ${addon.max_mensagens_dia} mensagens atingido`);
      return null;
    }

    setGenerating(true);

    try {
      // Build CDE context for strategy-driven AI generation
      const cdeContext = buildCDEContext(params);

      // Build learning context from OptimizationEngine (fire-and-forget if fails)
      let learningCtx = params.learning_context || "";
      if (!learningCtx && tenantId) {
        try {
          const { getOptimizationEngine } = await import("@/services/ai/OptimizationEngine");
          const optimizer = getOptimizationEngine(tenantId);
          const ctx: DealContext = {
            tenant_id: tenantId,
            customer: {
              id: params.client_id || "",
              name: params.nome_cliente || "Cliente",
              status: params.status_negociacao || "novo",
              temperature: calcLeadTemperature({
                status: params.status_negociacao || "novo",
                diasSemResposta: params.dias_sem_resposta || 0,
                temSimulacao: (params.valor_orcamento || 0) > 0,
              }),
              disc_profile: params.disc_profile as DealContext["customer"]["disc_profile"],
              days_inactive: params.dias_sem_resposta || 0,
              has_simulation: (params.valor_orcamento || 0) > 0,
            },
            pricing: { total_price: params.valor_orcamento || 0 },
            payment: { forma_pagamento: "Boleto", parcelas: 1, valor_entrada: 0, plus_percentual: 0 },
            discounts: { desconto1: 0, desconto2: 0, desconto3: 0 },
          };
          const opt = await optimizer.optimizeDecision(ctx);
          learningCtx = `\n=== OTIMIZAÇÃO IA (dados reais) ===\n🎯 Estratégia: "${opt.recommended_strategy}" (${opt.strategy_confidence}% confiança)\n💰 Desconto ideal: ${opt.recommended_discount_range.optimal}%\n⏰ ${opt.recommended_timing}\n📝 ${opt.reasoning}`;
        } catch { /* silent — learning context is optional */ }
      }

      const { data, error } = await supabase.functions.invoke("vendazap-ai", {
        body: {
          ...params,
          tenant_id: tenantId,
          prompt_sistema: addon.prompt_sistema,
          api_provider: addon.api_provider,
          openai_model: addon.openai_model,
          max_tokens: addon.max_tokens_mensagem,
          learning_context: learningCtx,
          // CDE enrichment — AI uses these for strategic messaging
          cde_tipo_copy: cdeContext.tipo_copy,
          cde_tom: cdeContext.tom,
          cde_disc_profile: cdeContext.disc_profile,
          cde_valor_orcamento: cdeContext.valor_orcamento,
        },
      });

      if (error) {
        const errorMessage = typeof error.message === "string" ? error.message : "Erro ao gerar mensagem.";
        throw new Error(errorMessage);
      }

      if (data?.error) {
        toast.error(data.error);
        setGenerating(false);
        return null;
      }

      const generatedMessage = data?.mensagem as string | undefined;
      if (!generatedMessage) {
        throw new Error("A IA não retornou nenhuma mensagem.");
      }

      // Store quality validation metadata
      setLastQuality({
        passed: data.quality_validated ?? true,
        reason: data.quality_reason ?? "ok",
        attempts: data.quality_validated === false ? 1 : 0,
        decisionMaker: data.decision_maker ?? null,
        discProfile: data.disc_profile ?? null,
        intent: data.intencao ?? null,
      });

      const today = new Date().toISOString().split("T")[0];

      const persistResults = await Promise.allSettled([
        supabase.from("vendazap_messages").insert([{
          tenant_id: tenantId,
          usuario_id: params.usuario_id || null,
          client_id: params.client_id || null,
          tipo_copy: params.tipo_copy || "geral",
          tom: params.tom || addon.tom_padrao || "persuasivo",
          contexto: {
            nome_cliente: params.nome_cliente,
            valor_orcamento: params.valor_orcamento,
            status_negociacao: params.status_negociacao,
            dias_sem_resposta: params.dias_sem_resposta,
            provider: addon.api_provider,
            model: addon.openai_model,
            cde_context: cdeContext,
          },
          mensagem_cliente: params.mensagem_cliente || null,
          mensagem_gerada: generatedMessage,
          tokens_usados: data.tokens_usados || 0,
        }]),
        (async () => {
          const { data: existingUsage } = await supabase
            .from("vendazap_usage")
            .select("*")
            .eq("tenant_id", tenantId)
            .eq("usuario_id", params.usuario_id || "")
            .eq("usage_date", today)
            .maybeSingle();

          if (existingUsage) {
            return supabase.from("vendazap_usage").update({
              mensagens_geradas: (existingUsage.mensagens_geradas || 0) + 1,
              tokens_consumidos: (existingUsage.tokens_consumidos || 0) + (data.tokens_usados || 0),
            }).eq("id", existingUsage.id);
          }

          return supabase.from("vendazap_usage").insert([{
            tenant_id: tenantId,
            usuario_id: params.usuario_id || null,
            usage_date: today,
            mensagens_geradas: 1,
            tokens_consumidos: data.tokens_usados || 0,
          }]);
        })(),
      ]);

      const persistError = persistResults.find(
        (result) => result.status === "rejected",
      );

      if (persistError) {
        console.error("VendaZap persistence error:", persistError);
      }

      // Register learning event (fire-and-forget)
      void recordLearningEvent(tenantId, params, cdeContext);

      setDailyUsage((prev) => prev + 1);
      void fetchMessages(params.client_id);
      setGenerating(false);
      return generatedMessage;
    } catch (err: unknown) {
      console.error("VendaZap error:", err);
      const message = err instanceof Error ? err.message : "Erro ao gerar mensagem. Tente novamente.";
      toast.error(message);
      setGenerating(false);
      return null;
    }
  };

  return {
    addon,
    messages,
    loading,
    generating,
    dailyUsage,
    lastQuality,
    generateMessage,
    fetchMessages,
    fetchDailyUsage,
    refetchAddon: fetchAddon,
  };
}
