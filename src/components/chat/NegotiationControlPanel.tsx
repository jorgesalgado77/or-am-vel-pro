import { useEffect, useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { supabase } from "@/lib/supabaseClient";
import { useNegotiationControl } from "@/hooks/useNegotiationControl";
import type { NegotiationMode } from "@/services/commercial/NegotiationControlEngine";
import type { ChatConversation } from "./types";
import { Brain, Clock3, Crosshair, HandCoins, MessageSquareText, ShieldCheck, Sparkles } from "lucide-react";

interface Props {
  conversation: ChatConversation;
  tenantId: string | null;
  messageCount: number;
  mode: NegotiationMode;
}

function formatCurrency(value: number) {
  return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function normalizePhone(value?: string | null) {
  const digits = String(value || "")
    .replace(/^WA-/i, "")
    .replace(/@.*/, "")
    .replace(/\D/g, "")
    .replace(/^55(?=\d{10,11}$)/, "");
  return digits;
}

const MODE_LABEL: Record<NegotiationMode, string> = {
  automatico: "Automático",
  assistido: "Assistido",
  manual: "Manual",
};

export function NegotiationControlPanel({ conversation, tenantId, messageCount, mode }: Props) {
  const { decision, loading, setMode, controlNegotiation } = useNegotiationControl();
  const [expanded, setExpanded] = useState(true);

  const trackingIds = useMemo(
    () => Array.from(new Set([conversation.id, ...(conversation.relatedTrackingIds || [])])),
    [conversation.id, conversation.relatedTrackingIds]
  );

  useEffect(() => {
    setMode(mode);
  }, [mode, setMode]);

  useEffect(() => {
    if (!tenantId || !conversation.id) return;

    let cancelled = false;

    const loadDecision = async () => {
      const [{ data: messages }, { data: trackingRow }, clientResult] = await Promise.all([
        supabase
          .from("tracking_messages")
          .select("mensagem, remetente_tipo, created_at")
          .in("tracking_id", trackingIds)
          .order("created_at", { ascending: true })
          .limit(30),
        supabase
          .from("client_tracking")
          .select("status, updated_at, valor_contrato")
          .eq("id", conversation.id)
          .maybeSingle(),
        conversation.client_id
          ? supabase
              .from("clients")
              .select("status, telefone1, telefone2")
              .eq("id", conversation.client_id)
              .maybeSingle()
          : Promise.resolve({ data: null }),
      ]);

      if (cancelled) return;

      const lastClientMessageAt = [...((messages as Array<{ created_at?: string; remetente_tipo?: string }> | null) || [])]
        .reverse()
        .find((item) => item.remetente_tipo === "cliente")?.created_at;

      const referenceDate = lastClientMessageAt || trackingRow?.updated_at || conversation.updated_at;
      const daysInactive = referenceDate
        ? Math.max(0, Math.floor((Date.now() - new Date(referenceDate).getTime()) / 86400000))
        : 0;

      await controlNegotiation({
        tenant_id: tenantId,
        client_id: conversation.client_id || conversation.id,
        client_name: conversation.nome_cliente,
        client_status: clientResult?.data?.status || conversation.status || trackingRow?.status || "em_negociacao",
        days_inactive: daysInactive,
        has_simulation: Boolean(conversation.valor_orcamento || trackingRow?.valor_contrato),
        valor_orcamento: Number(conversation.valor_orcamento || trackingRow?.valor_contrato || 0),
        temperatura: conversation.lead_temperature,
        modo: mode,
        mensagens: (messages as Array<{ mensagem: string; remetente_tipo: string; created_at?: string }> | null) || [],
        estagio_venda: conversation.status || trackingRow?.status || "em_negociacao",
        phone: normalizePhone(conversation.phone || clientResult?.data?.telefone1 || clientResult?.data?.telefone2 || conversation.numero_contrato),
      });
    };

    void loadDecision();
    return () => {
      cancelled = true;
    };
  }, [tenantId, conversation, trackingIds, messageCount, mode, controlNegotiation]);

  if (!decision) return null;

  return (
    <div className="rounded-lg border border-border bg-muted/20 overflow-hidden">
      <button
        type="button"
        className="w-full px-3 py-2 flex items-center justify-between hover:bg-muted/30 transition-colors"
        onClick={() => setExpanded((prev) => !prev)}
      >
        <div className="flex items-center gap-2 min-w-0">
          <ShieldCheck className="h-4 w-4 text-primary shrink-0" />
          <span className="text-xs font-semibold text-foreground truncate">Controle de Negociação</span>
          <Badge variant="outline" className="text-[10px]">{MODE_LABEL[decision.mode]}</Badge>
        </div>
        <Badge variant={decision.is_closing_opportunity ? "destructive" : "secondary"} className="text-[10px]">
          {decision.deal_analysis.closing_probability}%
        </Badge>
      </button>

      {expanded && (
        <ScrollArea className="max-h-[340px]">
          <div className="p-3 space-y-3 text-xs">
            <div className="grid grid-cols-2 gap-2">
              <div className="rounded-md border border-border bg-background/70 p-2">
                <div className="flex items-center gap-1 text-muted-foreground mb-1"><Brain className="h-3 w-3" /> Estratégia</div>
                <div className="font-semibold text-foreground capitalize">{decision.strategy.replace(/_/g, " ")}</div>
                <div className="text-[10px] text-muted-foreground mt-1">{decision.strategy_confidence}% confiança</div>
              </div>
              <div className="rounded-md border border-border bg-background/70 p-2">
                <div className="flex items-center gap-1 text-muted-foreground mb-1"><Clock3 className="h-3 w-3" /> Timing</div>
                <div className="font-semibold text-foreground capitalize">{decision.timing.replace(/_/g, " ")}</div>
                {decision.wait_minutes ? <div className="text-[10px] text-muted-foreground mt-1">Aguardar {decision.wait_minutes} min</div> : null}
              </div>
            </div>

            <div className="rounded-md border border-border bg-background/70 p-2 space-y-1.5">
              <div className="flex items-center gap-1 text-muted-foreground"><HandCoins className="h-3 w-3" /> Preço controlado</div>
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Valor final</span>
                <span className="font-semibold text-foreground">{formatCurrency(decision.pricing.valor_final)}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Desconto</span>
                <span className="font-medium text-foreground">{decision.pricing.desconto_recomendado}%</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Margem</span>
                <span className="font-medium text-foreground">{decision.pricing.margem_estimada}%</span>
              </div>
              {decision.pricing.usar_brinde && decision.pricing.brinde_sugerido ? (
                <div className="text-[10px] text-primary">Brinde sugerido: {decision.pricing.brinde_sugerido}</div>
              ) : null}
            </div>

            <div className="rounded-md border border-border bg-background/70 p-2 space-y-1.5">
              <div className="flex items-center gap-1 text-muted-foreground"><Crosshair className="h-3 w-3" /> Fechamento</div>
              <div className="flex flex-wrap gap-1">
                {decision.closing_signals.map((signal) => (
                  <Badge key={signal} variant={signal === "nenhum" ? "outline" : "secondary"} className="text-[10px] capitalize">
                    {signal.replace(/_/g, " ")}
                  </Badge>
                ))}
              </div>
              {decision.closing_action ? <div className="text-[10px] text-foreground">{decision.closing_action}</div> : null}
            </div>

            <div className="rounded-md border border-border bg-background/70 p-2 space-y-1.5">
              <div className="flex items-center gap-1 text-muted-foreground"><MessageSquareText className="h-3 w-3" /> Sugestão automática</div>
              <p className="text-foreground leading-relaxed">{decision.suggested_message}</p>
              <div className="flex flex-wrap gap-1">
                <Badge variant="outline" className="text-[10px]">Tom: {decision.message_tone}</Badge>
                <Badge variant="outline" className="text-[10px]">Tipo: {decision.message_type}</Badge>
                {decision.requires_approval ? <Badge variant="destructive" className="text-[10px]">Requer aprovação</Badge> : null}
              </div>
            </div>

            <div className="rounded-md border border-border bg-background/70 p-2 space-y-1">
              <div className="flex items-center gap-1 text-muted-foreground"><Sparkles className="h-3 w-3" /> Leitura em tempo real</div>
              <p className="text-muted-foreground">{decision.strategy_reasoning}</p>
              <p className="text-muted-foreground">Próximo movimento previsto: <span className="text-foreground font-medium">{decision.predicted_move.nextMove.replace(/_/g, " ")}</span></p>
            </div>
          </div>
        </ScrollArea>
      )}
    </div>
  );
}
