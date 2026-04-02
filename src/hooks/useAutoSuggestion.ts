/**
 * useAutoSuggestion — Auto-generates AI reply suggestions for the chat.
 *
 * Delegates intent/tone/DISC detection to the CommercialDecisionEngine
 * via generateMessageContext, eliminating duplicated pattern matching.
 */

import { useState, useRef, useCallback } from "react";
import { supabase } from "@/lib/supabaseClient";
import { miaInvoke } from "@/services/mia/MIAInvoke";
import { logAudit } from "@/services/auditService";
import { calcLeadTemperature } from "@/lib/leadTemperature";
import { getCommercialEngine } from "@/services/commercial/CommercialDecisionEngine";
import { getControlEngine, type NegotiationStrategy } from "@/services/commercial/NegotiationControlEngine";
import type { DealContext, FormaPagamento } from "@/services/commercial/types";

interface SuggestionCache {
  clientId: string;
  suggestion: string;
  tipoCopy: string;
  discProfile: string;
  timestamp: number;
  messageHash: string;
}

const CACHE_TTL_MS = 2 * 60 * 1000;
const TIMEOUT_MS = 15_000;

interface UseAutoSuggestionParams {
  tenantId: string | null;
  addon: { ativo: boolean; prompt_sistema: string; api_provider: string; openai_model: string; max_tokens_mensagem: number } | null;
  userId?: string;
}

function mapStrategyToCopyType(strategy: NegotiationStrategy): string {
  switch (strategy) {
    case "fechamento":
      return "fechamento";
    case "negociacao":
      return "objecao";
    case "prova_social":
    case "consultiva":
      return "reuniao";
    case "urgencia":
    case "escassez":
      return "urgencia";
    default:
      return "geral";
  }
}

export function useAutoSuggestion({ tenantId, addon, userId }: UseAutoSuggestionParams) {
  const [suggestion, setSuggestion] = useState("");
  const [loading, setLoading] = useState(false);
  const [tipoCopy, setTipoCopy] = useState("");
  const [discProfile, setDiscProfile] = useState("");
  const [suggestionId, setSuggestionId] = useState<string | null>(null);
  const cacheRef = useRef<SuggestionCache | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const generate = useCallback(async (
    client: { id: string; nome: string; status: string; updated_at: string; telefone1?: string | null },
    lastSim: { valor_final?: number; valor_tela?: number } | null,
    recentMessages?: Array<{ mensagem: string; remetente_tipo: string }>,
    options?: { dealRoomLink?: string; forceRefresh?: boolean },
  ) => {
    if (!tenantId || !addon?.ativo) return;

    const lastClientMsg = recentMessages?.filter((m) => m.remetente_tipo === "cliente").slice(-1)[0]?.mensagem || "";
    const messageHash = `${client.id}-${lastClientMsg.slice(0, 50)}`;
    const cached = cacheRef.current;

    if (!options?.forceRefresh && cached && cached.clientId === client.id && cached.messageHash === messageHash && Date.now() - cached.timestamp < CACHE_TTL_MS) {
      setSuggestion(cached.suggestion);
      setTipoCopy(cached.tipoCopy);
      setDiscProfile(cached.discProfile);
      return;
    }

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setLoading(true);
    setSuggestion("");
    setSuggestionId(null);

    const days = Math.floor((Date.now() - new Date(client.updated_at).getTime()) / 86400000);
    const engine = getCommercialEngine();
    const ctx: DealContext = {
      tenant_id: tenantId,
      customer: {
        id: client.id,
        name: client.nome,
        status: client.status || "novo",
        days_inactive: days,
        has_simulation: !!lastSim,
        phone: client.telefone1 || null,
      },
      pricing: { total_price: lastSim?.valor_final || lastSim?.valor_tela || 0 },
      payment: { forma_pagamento: "A vista" as FormaPagamento, parcelas: 1, valor_entrada: 0, plus_percentual: 0 },
      discounts: { desconto1: 0, desconto2: 0, desconto3: 0 },
      negotiation_history: recentMessages?.map((m) => ({ mensagem: m.mensagem, remetente_tipo: m.remetente_tipo })),
    };

    const messageContext = engine.generateMessageContext(ctx);
    const dealRoomLink = options?.dealRoomLink || `${window.location.origin}/app`;
    let autoCopyType = messageContext.tipo_copy;
    let tom = messageContext.tom;
    const detectedDisc = messageContext.disc_profile || "";
    setDiscProfile(detectedDisc);

    let controlFallbackMessage = "";
    let learningContextStr = "";

    try {
      const controlDecision = await getControlEngine().controlNegotiation({
        tenant_id: tenantId,
        user_id: userId,
        client_id: client.id,
        client_name: client.nome,
        client_status: client.status || "em_negociacao",
        days_inactive: days,
        has_simulation: !!lastSim,
        valor_orcamento: lastSim?.valor_final || lastSim?.valor_tela || 0,
        temperatura: calcLeadTemperature({ status: client.status || "novo", diasSemResposta: days, temSimulacao: !!lastSim }),
        perfil_disc: detectedDisc || undefined,
        modo: "assistido",
        mensagens: (recentMessages || []).slice(-20),
        estagio_venda: client.status || "em_negociacao",
        phone: client.telefone1 || undefined,
      });

      autoCopyType = mapStrategyToCopyType(controlDecision.strategy);
      tom = controlDecision.message_tone || tom;
      controlFallbackMessage = controlDecision.suggested_message;
      learningContextStr += `\n=== CONTROLE DE NEGOCIAÇÃO ===\nEstratégia: ${controlDecision.strategy}\nTiming: ${controlDecision.timing}\nPreço final: ${controlDecision.pricing.valor_final}\nFechamento: ${controlDecision.is_closing_opportunity ? "sim" : "não"}`;
    } catch {
      controlFallbackMessage = "";
    }

    try {
      const { getOptimizationEngine } = await import("@/services/ai/OptimizationEngine");
      const optimizer = getOptimizationEngine(tenantId);
      const opt = await optimizer.optimizeDecision(ctx);
      learningContextStr += `\n=== OTIMIZAÇÃO IA ===\n🎯 "${opt.recommended_strategy}" (${opt.strategy_confidence}% confiança)\n💰 Desconto ideal: ${opt.recommended_discount_range.optimal}%\n📝 ${opt.reasoning}`;
    } catch {
      // noop
    }

    try {
      const result = await Promise.race([
        supabase.functions.invoke("vendazap-ai", {
          body: {
            nome_cliente: client.nome,
            valor_orcamento: lastSim?.valor_final || lastSim?.valor_tela,
            status_negociacao: client.status || "novo",
            dias_sem_resposta: days,
            tipo_copy: autoCopyType,
            tom,
            mensagem_cliente: lastClientMsg,
            deal_room_link: dealRoomLink,
            historico: (recentMessages || []).slice(-20),
            prompt_sistema: addon.prompt_sistema,
            api_provider: addon.api_provider,
            openai_model: addon.openai_model,
            max_tokens: Math.min(addon.max_tokens_mensagem, 400),
            disc_profile: detectedDisc,
            learning_context: learningContextStr,
          },
        }),
        new Promise<never>((_, reject) => setTimeout(() => reject(new Error("timeout")), TIMEOUT_MS)),
      ]);

      if (controller.signal.aborted) return;

      const { data, error } = result as { data: Record<string, unknown> | null; error: Error | null };
      const rawMessage = (data?.mensagem as string) || controlFallbackMessage;
      if (error || data?.error || !rawMessage) {
        setLoading(false);
        if (controlFallbackMessage) {
          setSuggestion(controlFallbackMessage);
          setTipoCopy(autoCopyType);
        }
        return;
      }

      const tokens = (data?.tokens_usados as number) || 0;
      const detectedType = (data?.intencao as string) || autoCopyType;
      const serverDisc = (data?.disc_profile as string) || detectedDisc;
      const displayType = detectedType === "enviar_preco" ? "reuniao" : detectedType === "objecao" ? "objecao" : detectedType === "fechamento" ? "fechamento" : autoCopyType;

      setDiscProfile(serverDisc);
      setSuggestion(rawMessage);
      setTipoCopy(displayType);

      cacheRef.current = {
        clientId: client.id,
        suggestion: rawMessage,
        tipoCopy: displayType,
        discProfile: serverDisc,
        timestamp: Date.now(),
        messageHash,
      };

      const temperature = calcLeadTemperature({ status: client.status, diasSemResposta: days, temSimulacao: !!lastSim });
      let realClientId = client.id;
      const { data: trackingRow } = await supabase.from("client_tracking").select("client_id").eq("id", client.id).maybeSingle();
      if (trackingRow?.client_id) realClientId = trackingRow.client_id;

      await (supabase as unknown as { from: (table: string) => { update: (payload: Record<string, unknown>) => { eq: (column: string, value: string) => Promise<unknown> } } })
        .from("clients")
        .update({ lead_temperature: temperature, last_ai_analysis: new Date().toISOString() })
        .eq("id", realClientId);

      const { data: inserted } = await supabase
        .from("vendazap_suggestions" as unknown as "clients")
        .insert({
          tenant_id: tenantId,
          client_id: realClientId,
          usuario_id: userId || null,
          original_message: lastClientMsg || `${client.nome} - ${client.status} - ${days}d`,
          suggested_reply: rawMessage,
          tokens_usados: tokens,
          used: false,
        } as never)
        .select("id")
        .single();

      if (inserted) setSuggestionId((inserted as { id?: string }).id || null);

      logAudit({
        acao: "vendazap_auto_suggestion",
        entidade: "client",
        entidade_id: client.id,
        usuario_id: userId || null,
        usuario_nome: null,
        tenant_id: tenantId,
        detalhes: { tipo_copy: displayType, client_nome: client.nome, intencao: detectedType, tom, disc: serverDisc },
      });
    } catch (err: unknown) {
      if (err instanceof Error && err.message !== "timeout" && !controller.signal.aborted) {
        console.error("Auto-suggestion error:", err);
      }
      if (!controller.signal.aborted && controlFallbackMessage) {
        setSuggestion(controlFallbackMessage);
        setTipoCopy(autoCopyType);
      }
    } finally {
      if (!controller.signal.aborted) setLoading(false);
    }
  }, [tenantId, addon, userId]);

  const clear = useCallback(() => {
    abortRef.current?.abort();
    setSuggestion("");
    setTipoCopy("");
    setDiscProfile("");
    setSuggestionId(null);
    setLoading(false);
  }, []);

  const markUsed = useCallback(async (clientId: string) => {
    if (suggestionId) {
      await (supabase as unknown as { from: (table: string) => { update: (payload: Record<string, unknown>) => { eq: (column: string, value: string) => Promise<unknown> } } })
        .from("vendazap_suggestions")
        .update({ used: true })
        .eq("id", suggestionId);
    }
    logAudit({
      acao: "vendazap_suggestion_used",
      entidade: "client",
      entidade_id: clientId,
      usuario_id: userId || null,
      usuario_nome: null,
      tenant_id: tenantId,
      detalhes: { suggestion: suggestion.substring(0, 100), suggestion_id: suggestionId, disc: discProfile },
    });
  }, [suggestion, userId, tenantId, suggestionId, discProfile]);

  return { suggestion, loading, tipoCopy, discProfile, generate, clear, markUsed };
}
