import { useState, useEffect, memo } from "react";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { Bot, ChevronDown, ChevronUp, Clock } from "lucide-react";
import { supabase } from "@/lib/supabaseClient";
import { format } from "date-fns";
import { MIAFeedback } from "@/components/mia/MIAFeedback";
interface Interaction {
  id: string;
  mensagem_cliente: string | null;
  intencao_detectada: string | null;
  resposta_ia: string | null;
  tokens_usados: number;
  modo: string;
  enviada: boolean;
  created_at: string;
}

const INTENT_BADGES: Record<string, { label: string; color: string }> = {
  orcamento: { label: "💰 Orçamento", color: "bg-emerald-500/15 text-emerald-700 border-emerald-500/30" },
  fechamento: { label: "🎯 Fechamento", color: "bg-primary/15 text-primary border-primary/30" },
  preco: { label: "💲 Preço", color: "bg-amber-500/15 text-amber-700 border-amber-500/30" },
  duvida: { label: "❓ Dúvida", color: "bg-blue-500/15 text-blue-700 border-blue-500/30" },
  objecao: { label: "⚠️ Objeção", color: "bg-destructive/15 text-destructive border-destructive/30" },
  saudacao: { label: "👋 Saudação", color: "bg-muted text-muted-foreground border-border" },
  outro: { label: "💬 Outro", color: "bg-muted text-muted-foreground border-border" },
};

interface Props {
  trackingId: string;
  tenantId: string | null;
  userId?: string;
}

export const AutoPilotHistory = memo(function AutoPilotHistory({ trackingId, tenantId, userId }: Props) {
  const [interactions, setInteractions] = useState<Interaction[]>([]);
  const [expanded, setExpanded] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!tenantId || !trackingId) return;

    const fetch = async () => {
      setLoading(true);
      const { data } = await supabase
        .from("vendazap_interactions" as any)
        .select("*")
        .eq("tracking_id", trackingId)
        .eq("tenant_id", tenantId)
        .order("created_at", { ascending: false })
        .limit(20);

      setInteractions((data as any[]) || []);
      setLoading(false);
    };

    fetch();

    // Realtime updates
    const channel = supabase
      .channel(`autopilot-history-${trackingId}`)
      .on("postgres_changes", {
        event: "INSERT",
        schema: "public",
        table: "vendazap_interactions",
      }, (payload) => {
        const item = payload.new as any;
        if (item.tracking_id === trackingId) {
          setInteractions((prev) => {
            if (prev.some((i) => i.id === item.id)) return prev;
            return [item, ...prev].slice(0, 20);
          });
        }
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [trackingId, tenantId]);

  if (interactions.length === 0 && !loading) return null;

  return (
    <div className="mx-3 mb-2">
      <Button
        variant="ghost"
        size="sm"
        className="w-full h-7 text-[10px] gap-1.5 text-muted-foreground hover:text-foreground justify-between px-2"
        onClick={() => setExpanded(!expanded)}
      >
        <span className="flex items-center gap-1">
          <Bot className="h-3 w-3" />
          Histórico Auto-Pilot ({interactions.length})
        </span>
        {expanded ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
      </Button>

      {expanded && (
        <ScrollArea className="max-h-48 border border-border rounded-lg mt-1 bg-card">
          <div className="p-2 space-y-2">
            {interactions.map((item) => {
              const intent = INTENT_BADGES[item.intencao_detectada || "outro"] || INTENT_BADGES.outro;
              return (
                <div key={item.id} className="text-[10px] border border-border rounded-md p-2 space-y-1 bg-background">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-1.5">
                      <Badge variant="outline" className={`text-[9px] px-1.5 py-0 h-4 ${intent.color}`}>
                        {intent.label}
                      </Badge>
                      <Badge variant="outline" className="text-[9px] px-1.5 py-0 h-4">
                        {item.modo === "autopilot" ? "🤖 Auto" : "💡 Sugestão"}
                      </Badge>
                      {item.enviada && (
                        <span className="text-emerald-600 text-[9px]">✓ Enviada</span>
                      )}
                    </div>
                    <span className="text-muted-foreground flex items-center gap-0.5 shrink-0">
                      <Clock className="h-2.5 w-2.5" />
                      {format(new Date(item.created_at), "HH:mm")}
                    </span>
                  </div>

                  {item.mensagem_cliente && (
                    <p className="text-muted-foreground truncate">
                      <span className="font-medium">Cliente:</span> {item.mensagem_cliente}
                    </p>
                  )}

                  {item.resposta_ia && (
                    <p className="text-foreground line-clamp-2">
                      <span className="font-medium">IA:</span> {item.resposta_ia}
                    </p>
                  )}

                  <span className="text-muted-foreground">{item.tokens_usados} tokens</span>
                </div>
              );
            })}
          </div>
        </ScrollArea>
      )}
    </div>
  );
});
