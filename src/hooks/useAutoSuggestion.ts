import { useState, useRef, useCallback } from "react";
import { supabase } from "@/lib/supabaseClient";
import { logAudit } from "@/services/auditService";

interface SuggestionCache {
  clientId: string;
  suggestion: string;
  tipoCopy: string;
  timestamp: number;
}

const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes
const TIMEOUT_MS = 15_000; // 15s safety timeout

interface UseAutoSuggestionParams {
  tenantId: string | null;
  addon: { ativo: boolean; prompt_sistema: string; api_provider: string; openai_model: string; max_tokens_mensagem: number } | null;
  userId?: string;
}

export function useAutoSuggestion({ tenantId, addon, userId }: UseAutoSuggestionParams) {
  const [suggestion, setSuggestion] = useState("");
  const [loading, setLoading] = useState(false);
  const [tipoCopy, setTipoCopy] = useState("");
  const cacheRef = useRef<SuggestionCache | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const generate = useCallback(async (
    client: { id: string; nome: string; status: string; updated_at: string; telefone1?: string | null },
    lastSim: { valor_final?: number; valor_tela?: number } | null,
  ) => {
    if (!tenantId || !addon?.ativo) return;

    // Check cache — avoid duplicate calls
    const cached = cacheRef.current;
    if (cached && cached.clientId === client.id && Date.now() - cached.timestamp < CACHE_TTL_MS) {
      setSuggestion(cached.suggestion);
      setTipoCopy(cached.tipoCopy);
      return;
    }

    // Abort any in-flight request
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setLoading(true);
    setSuggestion("");

    const days = Math.floor((Date.now() - new Date(client.updated_at).getTime()) / (1000 * 60 * 60 * 24));

    // Determine best copy type based on context
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
      setSuggestion(msg);
      setTipoCopy(autoCopyType);

      // Update cache
      cacheRef.current = {
        clientId: client.id,
        suggestion: msg,
        tipoCopy: autoCopyType,
        timestamp: Date.now(),
      };

      // Log usage audit
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
    setLoading(false);
  }, []);

  const markUsed = useCallback((clientId: string) => {
    logAudit({
      acao: "vendazap_suggestion_used",
      entidade: "client",
      entidade_id: clientId,
      usuario_id: userId || null,
      usuario_nome: null,
      tenant_id: tenantId,
      detalhes: { suggestion: suggestion.substring(0, 100) },
    });
  }, [suggestion, userId, tenantId]);

  return { suggestion, loading, tipoCopy, generate, clear, markUsed };
}
