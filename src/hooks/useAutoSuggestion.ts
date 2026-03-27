import { useState, useRef, useCallback } from "react";
import { supabase } from "@/lib/supabaseClient";
import { logAudit } from "@/services/auditService";
import { calcLeadTemperature } from "@/lib/leadTemperature";

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

// DISC detection delegated to centralized vendazapAnalysis.ts via CommercialDecisionEngine
import { detectDiscFromMessages, type VendaZapMessageLike } from "@/lib/vendazapAnalysis";

function detectDISCFromMessages(messages: Array<{ mensagem: string; remetente_tipo: string }>): string {
  // Delegate to central implementation (no more duplicated patterns)
  const result = detectDiscFromMessages(messages as VendaZapMessageLike[]);
  return result.profile || "";
}

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

    // Detect intent
    let autoCopyType = "geral";
    if (lastClientMsg) {
      const lower = lastClientMsg.toLowerCase();
      if (/fechar|quero comprar|vou levar|aceito|fechado|manda o contrato/i.test(lower)) {
        autoCopyType = "fechamento";
      } else if (/manda.*pre[çc]o|envia.*pre[çc]o|envia.*valor|manda.*valor|passa.*pre[çc]o|passa.*valor|por whats|pelo whats|por e-?mail|manda.*por aqui|envia.*por aqui|pode mandar|pode enviar|me envia/i.test(lower)) {
        autoCopyType = "reuniao";
      } else if (/or[çc]amento|quanto custa|valor|pre[çc]o|proposta|me passa/i.test(lower)) {
        autoCopyType = "reuniao";
      } else if (/desconto|condi[çc][ãa]o|parcel|pagamento|negocia|mais barato/i.test(lower)) {
        autoCopyType = "reuniao";
      } else if (/caro|vou pensar|depois|outro lugar|concorr|n[ãa]o sei/i.test(lower)) {
        autoCopyType = "objecao";
      } else if (/como funciona|d[úu]vida|explica|garantia|prazo|entrega/i.test(lower)) {
        autoCopyType = "geral";
      } else if (/bom dia|boa tarde|boa noite|oi|ol[áa]|tudo bem/i.test(lower)) {
        autoCopyType = "geral";
      }
    } else {
      if (days > 7) autoCopyType = "reativacao";
      else if (client.status === "proposta_enviada") autoCopyType = "fechamento";
      else if (client.status === "em_negociacao") autoCopyType = "reuniao";
      else if (days > 3) autoCopyType = "urgencia";
    }

    // Detect tone
    let tom = "amigavel";
    if (lastClientMsg) {
      const lower = lastClientMsg.toLowerCase();
      if (/urgente|rápido|preciso|logo|já|agora/i.test(lower)) tom = "urgente";
      else if (/obrigad|por favor|gentileza|gostaria/i.test(lower)) tom = "formal";
      else if (/kkk|haha|rsrs|😂|😄|💪|👍/i.test(lower)) tom = "descontraido";
      else if (/caro|absurdo|reclamar|insatisf/i.test(lower)) tom = "empatico";
    }

    // DISC detection — deeper analysis using full conversation
    const detectedDisc = recentMessages ? detectDISCFromMessages(recentMessages) : "";
    setDiscProfile(detectedDisc);

    // Count client messages for recalibration awareness
    const clientMsgCount = recentMessages?.filter(m => m.remetente_tipo === "cliente").length || 0;
    const isRecalibrationPoint = clientMsgCount > 0 && clientMsgCount % 10 === 0;

    // Adapt tone based on DISC — stronger adaptation at recalibration points
    if (detectedDisc === "D") tom = isRecalibrationPoint ? "direto" : (tom === "amigavel" ? "direto" : tom);
    else if (detectedDisc === "I") tom = isRecalibrationPoint ? "entusiasmado" : (tom === "amigavel" ? "entusiasmado" : tom);
    else if (detectedDisc === "S") tom = isRecalibrationPoint ? "acolhedor" : (tom === "amigavel" ? "acolhedor" : tom);
    else if (detectedDisc === "C") tom = isRecalibrationPoint ? "tecnico" : (tom === "amigavel" ? "tecnico" : tom);

    // At recalibration points, also adjust copy type based on DISC
    if (isRecalibrationPoint && detectedDisc) {
      const discCopyMap: Record<string, string> = { D: "fechamento", I: "reuniao", S: "reuniao", C: "objecao" };
      const discCopy = discCopyMap[detectedDisc];
      if (discCopy && autoCopyType === "geral") autoCopyType = discCopy;
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

      const { data, error } = result as any;
      if (error || data?.error) { setLoading(false); return; }

      const msg = data?.mensagem || "";
      const tokens = data?.tokens_usados || 0;
      const detectedType = data?.intencao || autoCopyType;
      const serverDisc = data?.disc_profile || detectedDisc;

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

      await supabase
        .from("clients")
        .update({
          lead_temperature: temperature,
          last_ai_analysis: new Date().toISOString(),
        } as any)
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
    } catch (err: any) {
      if (err?.message !== "timeout" && !controller.signal.aborted) {
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
