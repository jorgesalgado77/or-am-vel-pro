/**
 * useAutoSuggestion — Auto-generates AI reply suggestions for the chat.
 *
 * Delegates intent/tone/DISC detection to the CommercialDecisionEngine
 * via generateMessageContext, eliminating duplicated pattern matching.
 */

import { useState, useRef, useCallback } from "react";
import { supabase } from "@/lib/supabaseClient";
import { logAudit } from "@/services/auditService";
import { calcLeadTemperature } from "@/lib/leadTemperature";
import { getCommercialEngine } from "@/services/commercial/CommercialDecisionEngine";
import { detectDiscFromMessages, type VendaZapMessageLike } from "@/lib/vendazapAnalysis";
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

    const lastClientMsg = recentMessages
      ?.filter(m => m.remetente_tipo === "cliente")
      ?.slice(-1)[0]?.mensagem || "";
    const messageHash = `${client.id}-${lastClientMsg.slice(0, 50)}`;

    const cached = cacheRef.current;
    if (
      !options?.forceRefresh &&
      cached &&
      cached.clientId === client.id &&
      cached.messageHash === messageHash &&
      Date.now() - cached.timestamp < CACHE_TTL_MS
    ) {
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

    const days = Math.floor((Date.now() - new Date(client.updated_at).getTime()) / (1000 * 60 * 60 * 24));

    // ─── Use CDE for intent/tone/DISC detection ───────────────
    const engine = getCommercialEngine();

    // Build a lightweight DealContext for message context generation
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
      pricing: {
        total_price: lastSim?.valor_final || lastSim?.valor_tela || 0,
      },
      payment: {
        forma_pagamento: "A vista" as FormaPagamento,
        parcelas: 1,
        valor_entrada: 0,
        plus_percentual: 0,
      },
      discounts: { desconto1: 0, desconto2: 0, desconto3: 0 },
      negotiation_history: recentMessages?.map(m => ({
        mensagem: m.mensagem,
        remetente_tipo: m.remetente_tipo,
      })),
    };

    const messageContext = engine.generateMessageContext(ctx);
    let autoCopyType = messageContext.tipo_copy;
    let tom = messageContext.tom;
    const detectedDisc = messageContext.disc_profile || "";

    setDiscProfile(detectedDisc);

    // Recalibration logic for DISC at every 10 client messages
    const clientMsgCount = recentMessages?.filter(m => m.remetente_tipo === "cliente").length || 0;
    const isRecalibrationPoint = clientMsgCount > 0 && clientMsgCount % 10 === 0;

    if (isRecalibrationPoint && detectedDisc) {
      // Force stronger DISC tone at recalibration points
      const discToneMap: Record<string, string> = { D: "direto", I: "entusiasmado", S: "acolhedor", C: "tecnico" };
      tom = discToneMap[detectedDisc] || tom;

      const discCopyMap: Record<string, string> = { D: "fechamento", I: "reuniao", S: "reuniao", C: "objecao" };
      if (autoCopyType === "geral") autoCopyType = discCopyMap[detectedDisc] || autoCopyType;
    }

    const dealRoomLink = options?.dealRoomLink || `${window.location.origin}/app`;

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
          },
        }),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error("timeout")), TIMEOUT_MS)
        ),
      ]);

      if (controller.signal.aborted) return;

      const { data, error } = result as { data: Record<string, unknown> | null; error: Error | null };
      if (error || data?.error) { setLoading(false); return; }

      const msg = (data?.mensagem as string) || "";
      const tokens = (data?.tokens_usados as number) || 0;
      const detectedType = (data?.intencao as string) || autoCopyType;
      const serverDisc = (data?.disc_profile as string) || detectedDisc;

      let displayType = autoCopyType;
      if (detectedType === "fechamento") displayType = "fechamento";
      else if (detectedType === "enviar_preco") displayType = "reuniao";
      else if (detectedType === "objecao") displayType = "objecao";

      setDiscProfile(serverDisc);
      setSuggestion(msg);
      setTipoCopy(displayType);

      cacheRef.current = {
        clientId: client.id,
        suggestion: msg,
        tipoCopy: displayType,
        discProfile: serverDisc,
        timestamp: Date.now(),
        messageHash,
      };

      const temperature = calcLeadTemperature({
        status: client.status,
        diasSemResposta: days,
        temSimulacao: !!lastSim,
      });

      // Resolve real client_id: client.id might be a tracking_id
      let realClientId = client.id;
      const { data: trackingRow } = await supabase
        .from("client_tracking")
        .select("client_id")
        .eq("id", client.id)
        .maybeSingle();
      if (trackingRow?.client_id) realClientId = trackingRow.client_id;

      await (supabase as any)
        .from("clients")
        .update({
          lead_temperature: temperature,
          last_ai_analysis: new Date().toISOString(),
        })
        .eq("id", realClientId);

      const { data: inserted } = await supabase
        .from("vendazap_suggestions" as any)
        .insert({
          tenant_id: tenantId,
          client_id: realClientId,
          usuario_id: userId || null,
          original_message: lastClientMsg || `${client.nome} - ${client.status} - ${days}d`,
          suggested_reply: msg,
          tokens_usados: tokens,
          used: false,
        } as any)
        .select("id")
        .single();

      if (inserted) setSuggestionId((inserted as any).id);

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
      await supabase
        .from("vendazap_suggestions" as any)
        .update({ used: true } as any)
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
