/**
 * HighResistanceAlerts — Dashboard widget showing clients with high
 * resistance (>70) detected by the ClientBehaviorEngine.
 * Queries tracking_messages for recent conversations and scores them.
 */
import { useState, useEffect, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { AlertTriangle, Shield, RefreshCw, ChevronDown, ChevronUp } from "lucide-react";
import { supabase } from "@/lib/supabaseClient";
import { getResolvedTenantId } from "@/contexts/TenantContext";
import { getBehaviorEngine, type BehaviorContext } from "@/services/commercial/ClientBehaviorEngine";

interface AlertClient {
  clientName: string;
  clientId: string;
  resistanceLevel: number;
  resistanceCategory: string;
  objections: string[];
  engagementLevel: string;
  engagementScore: number;
  predictedMove: string;
}

const MOVE_LABELS: Record<string, string> = {
  vai_fechar: "🎯 Vai fechar",
  vai_pedir_desconto: "💰 Pedir desconto",
  vai_consultar_decisor: "👥 Consultar decisor",
  vai_pedir_prazo: "⏳ Pedir prazo",
  vai_comparar_concorrente: "⚔️ Comparar",
  vai_desistir: "🚪 Vai desistir",
  vai_perguntar_detalhes: "🔍 Detalhes",
  vai_reagendar: "📅 Reagendar",
  neutro: "😐 Neutro",
};

export function HighResistanceAlerts() {
  const [alerts, setAlerts] = useState<AlertClient[]>([]);
  const [loading, setLoading] = useState(false);
  const [expanded, setExpanded] = useState(false);

  const analyze = useCallback(async () => {
    setLoading(true);
    try {
      const tenantId = await getResolvedTenantId();
      
      // Get active clients with recent messages
      let clientQuery = supabase
        .from("clients")
        .select("id, nome")
        .eq("status", "em_negociacao");
      if (tenantId) clientQuery = clientQuery.eq("tenant_id", tenantId);
      const { data: clients } = await clientQuery;
      if (!clients || clients.length === 0) { setAlerts([]); return; }

      // Get recent messages grouped by client tracking
      let msgQuery = supabase
        .from("tracking_messages")
        .select("tracking_id, mensagem, remetente_tipo, created_at")
        .order("created_at", { ascending: true })
        .limit(500);
      if (tenantId) msgQuery = msgQuery.eq("tenant_id", tenantId);
      const { data: messages } = await msgQuery;

      // Get trackings to map to clients
      const clientIds = clients.map(c => c.id);
      let trackingQuery = supabase
        .from("client_tracking")
        .select("id, client_id")
        .in("client_id", clientIds);
      if (tenantId) trackingQuery = trackingQuery.eq("tenant_id", tenantId);
      const { data: trackings } = await trackingQuery;

      if (!trackings || !messages) { setAlerts([]); return; }

      const trackingToClient = new Map<string, string>();
      trackings.forEach(t => trackingToClient.set(t.id, t.client_id));

      const clientNameMap = new Map<string, string>();
      clients.forEach(c => clientNameMap.set(c.id, c.nome));

      // Group messages by client
      const clientMessages = new Map<string, Array<{ mensagem: string; remetente_tipo: string }>>();
      messages.forEach(m => {
        const clientId = trackingToClient.get(m.tracking_id);
        if (!clientId) return;
        const arr = clientMessages.get(clientId) || [];
        arr.push({ mensagem: m.mensagem, remetente_tipo: m.remetente_tipo });
        clientMessages.set(clientId, arr);
      });

      const engine = getBehaviorEngine();
      const highResistance: AlertClient[] = [];

      clientMessages.forEach((msgs, clientId) => {
        if (msgs.length < 2) return; // Need at least some conversation
        const name = clientNameMap.get(clientId) || "Cliente";
        const ctx: BehaviorContext = {
          clientName: name,
          status: "em_negociacao",
          daysInactive: 0,
          hasSimulation: false,
          conversationHistory: msgs.slice(-20),
        };

        const resistance = engine.detectResistanceLevel(ctx);
        if (resistance.level > 70) {
          const engagement = engine.calculateEngagementScore(ctx);
          const prediction = engine.predictNextMove(ctx);
          highResistance.push({
            clientName: name,
            clientId,
            resistanceLevel: resistance.level,
            resistanceCategory: resistance.category,
            objections: resistance.objections,
            engagementLevel: engagement.level,
            engagementScore: engagement.score,
            predictedMove: prediction.nextMove,
          });
        }
      });

      highResistance.sort((a, b) => b.resistanceLevel - a.resistanceLevel);
      setAlerts(highResistance);
    } catch (err) {
      console.error("HighResistanceAlerts error:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { analyze(); }, [analyze]);

  if (alerts.length === 0 && !loading) return null;

  const displayAlerts = expanded ? alerts : alerts.slice(0, 3);

  return (
    <Card className="border-destructive/30 bg-destructive/5">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-destructive" />
            Alerta: Clientes com Alta Resistência
            {alerts.length > 0 && (
              <Badge variant="destructive" className="text-[9px] h-4">
                {alerts.length}
              </Badge>
            )}
          </CardTitle>
          <Button
            variant="ghost"
            size="sm"
            className="h-6 text-[10px] gap-1 text-muted-foreground"
            onClick={analyze}
            disabled={loading}
          >
            <RefreshCw className={`h-3 w-3 ${loading ? "animate-spin" : ""}`} />
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-2">
        {loading && alerts.length === 0 && (
          <p className="text-[11px] text-muted-foreground text-center py-2">Analisando clientes...</p>
        )}

        {displayAlerts.map(a => (
          <div
            key={a.clientId}
            className="flex items-center justify-between p-2 rounded-lg bg-background border border-border"
          >
            <div className="space-y-0.5 min-w-0 flex-1">
              <p className="text-xs font-medium text-foreground truncate">{a.clientName}</p>
              <div className="flex items-center gap-2">
                <Tooltip>
                  <TooltipTrigger asChild>
                    <span className="flex items-center gap-1 text-[10px] text-destructive font-medium cursor-help">
                      <Shield className="h-3 w-3" />
                      Resistência: {a.resistanceLevel}%
                    </span>
                  </TooltipTrigger>
                  <TooltipContent side="bottom" className="text-[10px] max-w-[200px]">
                    {a.objections.length > 0 ? a.objections.join(" • ") : "Resistência alta detectada"}
                  </TooltipContent>
                </Tooltip>
                <span className="text-[10px] text-muted-foreground">
                  Engajamento: {a.engagementScore}
                </span>
              </div>
            </div>
            <Badge
              variant="outline"
              className="text-[9px] h-5 shrink-0 ml-2"
            >
              {MOVE_LABELS[a.predictedMove] || a.predictedMove}
            </Badge>
          </div>
        ))}

        {alerts.length > 3 && (
          <Button
            variant="ghost"
            size="sm"
            className="w-full h-6 text-[10px] gap-1 text-muted-foreground"
            onClick={() => setExpanded(!expanded)}
          >
            {expanded ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
            {expanded ? "Ver menos" : `Ver todos (${alerts.length})`}
          </Button>
        )}
      </CardContent>
    </Card>
  );
}
