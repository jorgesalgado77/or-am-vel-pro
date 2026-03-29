/**
 * VendaZapMonitorIndicator — Shows that VendaZap AI is actively monitoring
 * the current conversation in real-time. Displays a pulsing indicator badge
 * with CDE action suggestion in tooltip.
 */
import { useState, useEffect, useCallback, useRef } from "react";
import { Badge } from "@/components/ui/badge";
import { Bot, BrainCircuit, Target } from "lucide-react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { supabase } from "@/lib/supabaseClient";
import { detectDiscFromMessages } from "@/lib/vendazapAnalysis";
import { getCommercialEngine } from "@/services/commercial/CommercialDecisionEngine";
import type { TriggerContext } from "@/services/commercial/types";

interface Props {
  trackingId: string;
  clientId?: string | null;
  clientName?: string;
  tenantId?: string | null;
  enabled: boolean;
  onMemoryUpdate?: (memory: ConversationMemory) => void;
}

export interface ConversationMemory {
  totalMessages: number;
  lastClientMessage: string | null;
  lastStoreMessage: string | null;
  detectedDisc: string | null;
  sentiment: "positive" | "neutral" | "negative";
  updatedAt: string;
}

interface CDESuggestion {
  action: string;
  urgency: string;
  probability: number;
}

const ACTION_LABELS: Record<string, string> = {
  send_message: "Enviar mensagem",
  send_with_discount: "Enviar c/ desconto",
  suggest_dealroom: "Sugerir Deal Room",
  schedule_followup: "Agendar follow-up",
  wait: "Aguardar",
  escalate: "Escalar p/ gerente",
};

const URGENCY_LABELS: Record<string, string> = {
  immediate: "🔴 Imediato",
  today: "🟡 Hoje",
  this_week: "🔵 Esta semana",
  low: "⚪ Baixa",
};

export function VendaZapMonitorIndicator({ trackingId, clientId, clientName, tenantId, enabled, onMemoryUpdate }: Props) {
  const [memory, setMemory] = useState<ConversationMemory | null>(null);
  const [cdeSuggestion, setCdeSuggestion] = useState<CDESuggestion | null>(null);
  const [pulse, setPulse] = useState(false);
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);

  const refreshMemory = useCallback(async () => {
    if (!trackingId) return;

    const { data } = await supabase
      .from("tracking_messages")
      .select("mensagem, remetente_tipo, created_at")
      .eq("tracking_id", trackingId)
      .order("created_at", { ascending: false })
      .limit(30);

    if (!data || data.length === 0) return;

    const messages = (data as Array<{ mensagem: string; remetente_tipo: string; created_at: string }>).reverse();
    const clientMsgs = messages.filter((m) => m.remetente_tipo === "cliente");
    const storeMsgs = messages.filter((m) => m.remetente_tipo !== "cliente");

    const discResult = detectDiscFromMessages(
      messages.map((m) => ({
        mensagem: m.mensagem,
        remetente_tipo: m.remetente_tipo,
      }))
    );
    const disc = discResult.profile || null;

    const lastClient = clientMsgs[clientMsgs.length - 1]?.mensagem || null;
    let sentiment: ConversationMemory["sentiment"] = "neutral";
    if (lastClient) {
      const lower = lastClient.toLowerCase();
      const negWords = ["não", "caro", "desisto", "nunca", "problema", "reclamação"];
      const posWords = ["sim", "gostei", "perfeito", "fechado", "ótimo", "excelente", "quero"];
      if (negWords.some((w) => lower.includes(w))) sentiment = "negative";
      else if (posWords.some((w) => lower.includes(w))) sentiment = "positive";
    }

    const newMemory: ConversationMemory = {
      totalMessages: messages.length,
      lastClientMessage: lastClient,
      lastStoreMessage: storeMsgs[storeMsgs.length - 1]?.mensagem || null,
      detectedDisc: disc,
      sentiment,
      updatedAt: new Date().toISOString(),
    };

    setMemory(newMemory);
    onMemoryUpdate?.(newMemory);

    // CDE suggestion
    if (tenantId && clientId) {
      try {
        const engine = getCommercialEngine();
        const firstMsg = messages[0]?.created_at;
        const daysInactive = firstMsg
          ? Math.max(0, Math.floor((Date.now() - new Date(messages[messages.length - 1]?.created_at || firstMsg).getTime()) / 86400000))
          : 0;

        const triggerCtx: TriggerContext = {
          trigger_id: trackingId,
          trigger_type: "no_response",
          tenant_id: tenantId,
          client_id: clientId,
          client_name: clientName || "Cliente",
          client_status: "Em Negociação",
          days_inactive: daysInactive,
          has_simulation: true,
          valor_orcamento: 0,
          generated_message: lastClient || "",
        };

        const action = await engine.handleTrigger(triggerCtx);
        setCdeSuggestion({
          action: ACTION_LABELS[action.action] || action.action,
          urgency: URGENCY_LABELS[action.urgency] || action.urgency,
          probability: action.closing_probability,
        });
      } catch {
        // CDE analysis optional
      }
    }

    setPulse(true);
    setTimeout(() => setPulse(false), 2000);
  }, [trackingId, clientId, clientName, tenantId, onMemoryUpdate]);

  useEffect(() => {
    if (!enabled) return;
    refreshMemory();
  }, [enabled, refreshMemory]);

  useEffect(() => {
    if (!enabled || !trackingId) return;

    const channel = supabase
      .channel(`vendazap-monitor-${trackingId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "tracking_messages",
          filter: `tracking_id=eq.${trackingId}`,
        },
        () => {
          refreshMemory();
        }
      )
      .subscribe();

    channelRef.current = channel;

    return () => {
      supabase.removeChannel(channel);
    };
  }, [enabled, trackingId, refreshMemory]);

  if (!enabled || !memory) return null;

  const sentimentEmoji = memory.sentiment === "positive" ? "😊" : memory.sentiment === "negative" ? "😟" : "😐";
  const discLabel = memory.detectedDisc ? `DISC: ${memory.detectedDisc.toUpperCase()}` : "DISC: —";

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <div className="flex items-center gap-1.5">
          <Badge
            variant="outline"
            className={`gap-1 text-[10px] h-5 border-emerald-500/40 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 transition-all ${
              pulse ? "ring-2 ring-emerald-500/30 scale-105" : ""
            }`}
          >
            <Bot className="h-3 w-3" />
            <span className="relative flex h-1.5 w-1.5">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
              <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-emerald-500" />
            </span>
            VendaZap AI
          </Badge>
        </div>
      </TooltipTrigger>
      <TooltipContent side="bottom" className="max-w-[280px]">
        <div className="space-y-1.5 text-xs">
          <div className="flex items-center gap-1.5 font-semibold">
            <BrainCircuit className="h-3.5 w-3.5 text-emerald-500" />
            Monitoramento Ativo
          </div>
          <p className="text-muted-foreground">{memory.totalMessages} msgs analisadas</p>
          <div className="flex items-center gap-2">
            <span>{sentimentEmoji} {memory.sentiment === "positive" ? "Positivo" : memory.sentiment === "negative" ? "Negativo" : "Neutro"}</span>
            <span className="text-muted-foreground">•</span>
            <span>{discLabel}</span>
          </div>
          {cdeSuggestion && (
            <div className="border-t border-border pt-1.5 mt-1.5">
              <div className="flex items-center gap-1 font-semibold text-primary">
                <Target className="h-3 w-3" />
                Sugestão CDE
              </div>
              <p className="text-muted-foreground">
                {cdeSuggestion.action} • {cdeSuggestion.urgency}
              </p>
              <p className="text-muted-foreground">
                Prob. fechamento: <span className={cdeSuggestion.probability > 60 ? "text-emerald-500 font-medium" : cdeSuggestion.probability > 30 ? "text-amber-500 font-medium" : "text-red-500 font-medium"}>{cdeSuggestion.probability}%</span>
              </p>
            </div>
          )}
        </div>
      </TooltipContent>
    </Tooltip>
  );
}
