import { useState, useRef, useCallback } from "react";
import { supabase } from "@/lib/supabaseClient";
import { logAudit } from "@/services/auditService";
import { calcLeadTemperature } from "@/lib/leadTemperature";

interface SuggestionCache {
  clientId: string;
  suggestion: string;
  tipoCopy: string;
  timestamp: number;
}

const CACHE_TTL_MS = 5 * 60 * 1000;
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
  const [suggestionId, setSuggestionId] = useState<string | null>(null);
  const cacheRef = useRef<SuggestionCache | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const generate = useCallback(async (
    client: { id: string; nome: string; status: string; updated_at: string; telefone1?: string | null },
    lastSim: { valor_final?: number; valor_tela?: number } | null,
  ) => {
    if (!tenantId || !addon?.ativo) return;

    const cached = cacheRef.current;
    if (cached && cached.clientId === client.id && Date.now() - cached.timestamp < CACHE_TTL_MS) {
      setSuggestion(cached.suggestion);
      setTipoCopy(cached.tipoCopy);
      return;
    }

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setLoading(true);
    setSuggestion("");
    setSuggestionId(null);

    const days = Math.floor((Date.now() - new Date(client.updated_at).getTime()) / (1000 * 60 * 60 * 24));

    let autoCopyType = "geral";
    if (days > 7) autoCopyType = "reativacao";
    else if (client.status === "proposta_enviada") autoCopyType = "fechamento";
    else if (client.status === "em_negociacao") autoCopyType = "reuniao";
    else if (days > 3) autoCopyType = "urgencia";

    try {
      const result = await Promise.race([
        supabase.functions.invoke("vendazap-ai", {
          body: {
            nome_cliente: client.nome,
            valor_orcamento: lastSim?.valor_final || lastSim?.valor_tela,
            status_negociacao: client.status || "novo",
            dias_sem_resposta: days,
            tipo_copy: autoCopyType,
            tom: "amigavel",
            prompt_sistema: addon.prompt_sistema,
            api_provider: addon.api_provider,
            openai_model: addon.openai_model,
            max_tokens: addon.max_tokens_mensagem,
          },
        }),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error("timeout")), TIMEOUT_MS)
        ),
      ]);

      if (controller.signal.aborted) return;

      const { data, error } = result as any;
      if (error || data?.error) {
        setLoading(false);
        return;
      }

      const msg = data?.mensagem || "";
      const tokens = data?.tokens_usados || 0;
      setSuggestion(msg);
      setTipoCopy(autoCopyType);

      cacheRef.current = {
        clientId: client.id,
        suggestion: msg,
        tipoCopy: autoCopyType,
        timestamp: Date.now(),
      };

      // Calculate and persist lead temperature
      const temperature = calcLeadTemperature({
        status: client.status,
        diasSemResposta: days,
        temSimulacao: !!lastSim,
      });

      await supabase
        .from("clients")
        .update({
          lead_temperature: temperature,
          last_ai_analysis: new Date().toISOString(),
        } as any)
        .eq("id", client.id);

      // Persist to vendazap_suggestions
      const { data: inserted } = await supabase
        .from("vendazap_suggestions" as any)
        .insert({
          tenant_id: tenantId,
          client_id: client.id,
          usuario_id: userId || null,
          original_message: `${client.nome} - ${client.status} - ${days}d`,
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
        detalhes: { tipo_copy: autoCopyType, client_nome: client.nome },
      });
    } catch (err: any) {
      if (err?.message !== "timeout" && !controller.signal.aborted) {
        console.error("Auto-suggestion error:", err);
      }
    } finally {
      if (!controller.signal.aborted) {
        setLoading(false);
      }
    }
  }, [tenantId, addon, userId]);

  const clear = useCallback(() => {
    abortRef.current?.abort();
    setSuggestion("");
    setTipoCopy("");
    setSuggestionId(null);
    setLoading(false);
  }, []);

  const markUsed = useCallback(async (clientId: string) => {
    // Mark as used in DB
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
      detalhes: { suggestion: suggestion.substring(0, 100), suggestion_id: suggestionId },
    });
  }, [suggestion, userId, tenantId, suggestionId]);

  return { suggestion, loading, tipoCopy, generate, clear, markUsed };
}
