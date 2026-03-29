/**
 * WhatsApp Simulator Hook
 * Simulates client responses using the ClientBehaviorEngine for
 * context-aware, strategy-driven responses instead of random pools.
 *
 * When the real WhatsApp API is connected, just disable simulation
 * mode — everything keeps working with the same tracking_messages table.
 */
import { useState, useCallback, useRef } from "react";
import { supabase } from "@/lib/supabaseClient";
import { toast } from "sonner";
import {
  getBehaviorEngine,
  type SimulatedPersona,
  type BehaviorContext,
} from "@/services/commercial/ClientBehaviorEngine";

export type SimulationPersona = SimulatedPersona;

interface SimulationConfig {
  enabled: boolean;
  persona: SimulationPersona;
  delayMin: number; // seconds
  delayMax: number; // seconds
  autoReply: boolean; // auto-reply to store messages
}

const DEFAULT_CONFIG: SimulationConfig = {
  enabled: false,
  persona: "interessado",
  delayMin: 3,
  delayMax: 8,
  autoReply: true,
};

export function useWhatsAppSimulator(tenantId?: string | null) {
  const [config, setConfig] = useState<SimulationConfig>(() => {
    try {
      const saved = sessionStorage.getItem("whatsapp-sim-config");
      return saved ? { ...DEFAULT_CONFIG, ...JSON.parse(saved) } : DEFAULT_CONFIG;
    } catch {
      return DEFAULT_CONFIG;
    }
  });

  const pendingTimers = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());
  const tenantIdRef = useRef(tenantId);
  tenantIdRef.current = tenantId;

  // Track conversation history per tracking_id for context-aware responses
  const historyRef = useRef<Map<string, Array<{ mensagem: string; remetente_tipo: string }>>>(new Map());

  const updateConfig = useCallback((updates: Partial<SimulationConfig>) => {
    setConfig((prev) => {
      const next = { ...prev, ...updates };
      sessionStorage.setItem("whatsapp-sim-config", JSON.stringify(next));
      return next;
    });
  }, []);

  const getRandomDelay = useCallback(() => {
    const min = config.delayMin * 1000;
    const max = config.delayMax * 1000;
    return Math.floor(Math.random() * (max - min + 1)) + min;
  }, [config.delayMin, config.delayMax]);

  /**
   * Build behavior context from available data and generate a response
   * using the ClientBehaviorEngine instead of random pools.
   */
  const getSimulatedResponse = useCallback((
    lastStoreMessage?: string,
    clientName?: string,
    trackingId?: string,
  ): string => {
    const engine = getBehaviorEngine();
    const history = trackingId ? historyRef.current.get(trackingId) || [] : [];

    const behaviorCtx: BehaviorContext = {
      clientName: clientName || "Cliente",
      status: "em_negociacao",
      daysInactive: 0,
      hasSimulation: false,
      lastStoreMessage,
      conversationHistory: history,
      persona: config.persona,
    };

    return engine.generateResponse(behaviorCtx);
  }, [config.persona]);

  /**
   * Track a message in the local history for context building.
   */
  const trackMessage = useCallback((trackingId: string, mensagem: string, remetenteTipo: string) => {
    const history = historyRef.current.get(trackingId) || [];
    history.push({ mensagem, remetente_tipo: remetenteTipo });
    // Keep last 30 messages
    if (history.length > 30) history.splice(0, history.length - 30);
    historyRef.current.set(trackingId, history);
  }, []);

  /**
   * Schedule a simulated client response after the store sends a message.
   * Inserts into tracking_messages with remetente_tipo = "cliente" —
   * the exact same path the real WhatsApp webhook would use.
   */
  const scheduleSimulatedReply = useCallback(
    (trackingId: string, clientName: string, lastStoreMessage: string) => {
      if (!config.enabled || !config.autoReply) return;

      // Track the store message for context
      trackMessage(trackingId, lastStoreMessage, "loja");

      // Cancel any pending timer for this tracking
      const existing = pendingTimers.current.get(trackingId);
      if (existing) clearTimeout(existing);

      const delay = getRandomDelay();

      const timer = setTimeout(async () => {
        const response = getSimulatedResponse(lastStoreMessage, clientName, trackingId);

        // Track the simulated response
        trackMessage(trackingId, response, "cliente");

        const { error } = await supabase.from("tracking_messages").insert({
          tracking_id: trackingId,
          mensagem: response,
          remetente_tipo: "cliente",
          remetente_nome: clientName,
          lida: false,
          tenant_id: tenantIdRef.current,
        } as any);

        if (error) {
          console.error("Simulation insert error:", error);
        }

        pendingTimers.current.delete(trackingId);
      }, delay);

      pendingTimers.current.set(trackingId, timer);
    },
    [config.enabled, config.autoReply, getRandomDelay, getSimulatedResponse, trackMessage]
  );

  /**
   * Send a one-off simulated client message (manual trigger)
   */
  const sendSimulatedMessage = useCallback(
    async (trackingId: string, clientName: string, customMessage?: string) => {
      const message = customMessage || getSimulatedResponse(undefined, clientName, trackingId);

      // Track the message
      trackMessage(trackingId, message, "cliente");

      const { error } = await supabase.from("tracking_messages").insert({
        tracking_id: trackingId,
        mensagem: message,
        remetente_tipo: "cliente",
        remetente_nome: clientName,
        lida: false,
        tenant_id: tenantIdRef.current,
      } as any);

      if (error) {
        toast.error("Erro ao simular mensagem");
        return false;
      }
      return true;
    },
    [getSimulatedResponse, trackMessage]
  );

  const cleanup = useCallback(() => {
    pendingTimers.current.forEach((timer) => clearTimeout(timer));
    pendingTimers.current.clear();
    historyRef.current.clear();
  }, []);

  return {
    config,
    updateConfig,
    scheduleSimulatedReply,
    sendSimulatedMessage,
    cleanup,
    isSimulating: config.enabled,
    personas: ["interessado", "indeciso", "apressado", "resistente", "curioso"] as SimulationPersona[],
  };
}
