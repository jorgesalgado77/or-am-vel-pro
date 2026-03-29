import {useState, useEffect, useCallback, useRef} from "react";
import {supabase} from "@/lib/supabaseClient";
import {toast} from "sonner";
import {logAudit} from "@/services/auditService";
import {type LeadTemperature} from "@/lib/leadTemperature";
import {getBehaviorEngine, type BehaviorContext} from "@/services/commercial/ClientBehaviorEngine";

export interface AutoPilotSettings {
  id: string;
  ativo: boolean;
  max_tokens_dia: number;
  tokens_usados_hoje: number;
  max_respostas_dia: number;
  respostas_hoje: number;
  tom_padrao: string;
  responder_frio: boolean;
  responder_morno: boolean;
  responder_quente: boolean;
  delay_segundos: number;
}

interface UseAutoPilotParams {
  tenantId: string | null;
  userId?: string;
  addon: {
    ativo: boolean;
    prompt_sistema: string;
    api_provider: string;
    openai_model: string;
    max_tokens_mensagem: number;
  } | null;
}

export function useAutoPilot({ tenantId, userId, addon }: UseAutoPilotParams) {
  const [settings, setSettings] = useState<AutoPilotSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const processingRef = useRef<Set<string>>(new Set());

  // Fetch settings
  const fetchSettings = useCallback(async () => {
    if (!tenantId || !userId) { setLoading(false); return; }

    const { data } = await supabase
      .from("vendazap_autopilot_settings" as any)
      .select("*")
      .eq("tenant_id", tenantId)
      .eq("usuario_id", userId)
      .maybeSingle();

    if (data) {
      setSettings(data as any);
    }
    setLoading(false);
  }, [tenantId, userId]);

  useEffect(() => { fetchSettings(); }, [fetchSettings]);

  // Toggle auto-pilot
  const toggle = useCallback(async (value: boolean) => {
    if (!tenantId || !userId) return;

    if (!settings) {
      // Create settings
      const { data, error } = await supabase
        .from("vendazap_autopilot_settings" as any)
        .insert({
          tenant_id: tenantId,
          usuario_id: userId,
          ativo: value,
        } as any)
        .select()
        .single();

      if (error) {
        toast.error("Erro ao salvar configuração");
        return;
      }
      setSettings(data as any);
    } else {
      const { error } = await supabase
        .from("vendazap_autopilot_settings" as any)
        .update({ ativo: value, updated_at: new Date().toISOString() } as any)
        .eq("id", settings.id);

      if (error) {
        toast.error("Erro ao atualizar configuração");
        return;
      }
      setSettings((prev) => prev ? { ...prev, ativo: value } : prev);
    }

    logAudit({
      acao: value ? "autopilot_ativado" : "autopilot_desativado",
      entidade: "vendazap",
      entidade_id: tenantId,
      usuario_id: userId,
      usuario_nome: null,
      tenant_id: tenantId,
      detalhes: {},
    });

    toast.success(value ? "🤖 Auto-Pilot ATIVADO" : "Auto-Pilot desativado");
  }, [tenantId, userId, settings]);

  // Update settings
  const updateSettings = useCallback(async (updates: Partial<AutoPilotSettings>) => {
    if (!settings) return;
    const { error } = await supabase
      .from("vendazap_autopilot_settings" as any)
      .update({ ...updates, updated_at: new Date().toISOString() } as any)
      .eq("id", settings.id);

    if (!error) {
      setSettings((prev) => prev ? { ...prev, ...updates } : prev);
      toast.success("Configurações atualizadas");
    }
  }, [settings]);

  // Check if can auto-respond based on limits and temperature
  const canAutoRespond = useCallback((temperature?: LeadTemperature | string) => {
    if (!settings?.ativo || !addon?.ativo) return false;

    // Check daily limits
    if (settings.max_respostas_dia > 0 && settings.respostas_hoje >= settings.max_respostas_dia) return false;
    if (settings.max_tokens_dia > 0 && settings.tokens_usados_hoje >= settings.max_tokens_dia) return false;

    // Check temperature permissions
    if (temperature === "frio" && !settings.responder_frio) return false;
    if (temperature === "morno" && !settings.responder_morno) return false;
    if (temperature === "quente" && !settings.responder_quente) return false;

    return true;
  }, [settings, addon]);

  // Process incoming client message automatically
  const processMessage = useCallback(async (
    trackingId: string,
    clientMessage: string,
    clientName: string,
    temperature?: LeadTemperature | string,
    recentMessages?: Array<{ mensagem: string; remetente_tipo: string }>,
    clientStatus?: string,
    daysInactive?: number,
    hasSimulation?: boolean,
  ) => {
    if (!canAutoRespond(temperature)) return null;
    if (!tenantId || !addon) return null;

    // --- Behavior Engine gate: skip auto-reply when engagement is too low or resistance too high ---
    const behaviorEngine = getBehaviorEngine();
    const behaviorCtx: BehaviorContext = {
      clientName,
      status: clientStatus || "em_negociacao",
      daysInactive: daysInactive ?? 0,
      hasSimulation: hasSimulation ?? false,
      lastStoreMessage: undefined,
      conversationHistory: recentMessages,
    };
    const engagement = behaviorEngine.calculateEngagementScore(behaviorCtx);
    const resistance = behaviorEngine.detectResistanceLevel(behaviorCtx);

    // Don't auto-respond to clients who explicitly gave up (resistance >= 80 & desistencia)
    if (resistance.level >= 80 && resistance.category === "desistencia") {
      console.log(`[AutoPilot] Skipping ${clientName}: desistência explícita (resistance=${resistance.level})`);
      return null;
    }

    // For very low engagement (lost), only respond if configured for cold leads
    if (engagement.level === "perdido" && !settings?.responder_frio) {
      console.log(`[AutoPilot] Skipping ${clientName}: engagement perdido (${engagement.score})`);
      return null;
    }

    // Prevent duplicate processing
    const key = `${trackingId}-${Date.now()}`;
    if (processingRef.current.has(trackingId)) return null;
    processingRef.current.add(trackingId);

    try {
      // Delay before responding (configurable)
      const delay = (settings?.delay_segundos || 5) * 1000;
      await new Promise((r) => setTimeout(r, delay));

      // Call AI with context
      // Predict next move for AI context enrichment
      const prediction = behaviorEngine.predictNextMove(behaviorCtx);

      const { data, error } = await supabase.functions.invoke("vendazap-ai", {
        body: {
          nome_cliente: clientName,
          mensagem_cliente: clientMessage,
          status_negociacao: clientStatus || "em_negociacao",
          tipo_copy: "resposta_automatica",
          tom: settings?.tom_padrao || "amigavel",
          prompt_sistema: addon.prompt_sistema,
          api_provider: addon.api_provider,
          openai_model: addon.openai_model,
          max_tokens: Math.min(addon.max_tokens_mensagem, 300),
          modo: "autopilot",
          historico: recentMessages?.slice(-5) || [],
          // Behavior Engine context
          engagement_score: engagement.score,
          engagement_level: engagement.level,
          resistance_level: resistance.level,
          resistance_category: resistance.category,
          predicted_move: prediction.nextMove,
          prediction_confidence: prediction.confidence,
        },
      });

      if (error || data?.error) {
        console.error("AutoPilot AI error:", error || data?.error);
        return null;
      }

      const resposta = data?.mensagem || "";
      const tokensUsed = data?.tokens_usados || 0;
      const intencao = data?.intencao || "outro";

      if (!resposta) return null;

      // Send message automatically
      const { error: sendError } = await supabase.from("tracking_messages").insert({
        tracking_id: trackingId,
        mensagem: resposta,
        remetente_tipo: "loja",
        remetente_nome: "🤖 Auto-Pilot",
        lida: false,
        tenant_id: tenantId,
      } as any);

      if (sendError) {
        console.error("AutoPilot send error:", sendError);
        return null;
      }

      // Log interaction
      await supabase.from("vendazap_interactions" as any).insert({
        tenant_id: tenantId,
        tracking_id: trackingId,
        client_name: clientName,
        mensagem_cliente: clientMessage.slice(0, 500),
        intencao_detectada: intencao,
        resposta_ia: resposta.slice(0, 2000),
        tokens_usados: tokensUsed,
        modo: "autopilot",
        enviada: true,
      } as any);

      // Update daily counters
      if (settings) {
        await supabase
          .from("vendazap_autopilot_settings" as any)
          .update({
            respostas_hoje: (settings.respostas_hoje || 0) + 1,
            tokens_usados_hoje: (settings.tokens_usados_hoje || 0) + tokensUsed,
            updated_at: new Date().toISOString(),
          } as any)
          .eq("id", settings.id);

        setSettings((prev) => prev ? {
          ...prev,
          respostas_hoje: (prev.respostas_hoje || 0) + 1,
          tokens_usados_hoje: (prev.tokens_usados_hoje || 0) + tokensUsed,
        } : prev);
      }

      logAudit({
        acao: "autopilot_resposta_enviada",
        entidade: "tracking_messages",
        entidade_id: trackingId,
        usuario_id: userId || null,
        usuario_nome: null,
        tenant_id: tenantId,
        detalhes: { intencao, tokens: tokensUsed, client: clientName },
      });

      return { resposta, intencao, tokensUsed };
    } catch (err) {
      console.error("AutoPilot error:", err);
      return null;
    } finally {
      processingRef.current.delete(trackingId);
    }
  }, [canAutoRespond, tenantId, addon, settings, userId]);

  return {
    settings,
    loading,
    isActive: settings?.ativo ?? false,
    toggle,
    updateSettings,
    canAutoRespond,
    processMessage,
    refreshSettings: fetchSettings,
  };
}
