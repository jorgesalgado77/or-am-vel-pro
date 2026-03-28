import { useState, useEffect, useMemo, memo, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import {
  Mail, MessageCircle, Check, CheckCheck, Eye, Clock,
  RefreshCw, Send, AlertCircle,
} from "lucide-react";
import { supabase } from "@/lib/supabaseClient";
import { format } from "date-fns";
import { cn } from "@/lib/utils";

/* ── Types ── */

interface EmailLog {
  id: string;
  status: "pending" | "sent" | "delivered" | "opened" | "failed" | "bounced";
  recipient_email: string;
  created_at: string;
  template_name?: string;
}

interface WhatsAppLog {
  id: string;
  status: "sent" | "delivered" | "read" | "failed";
  phone: string;
  message_preview: string;
  created_at: string;
}

interface InteractionEvent {
  id: string;
  channel: "email" | "whatsapp";
  action: string;
  timestamp: string;
}

interface DeliveryStatusPanelProps {
  clientId?: string;
  contractNumber?: string;
  tenantId?: string | null;
}

/* ── Status configs ── */

const EMAIL_STATUS: Record<string, { icon: typeof Clock; label: string; color: string }> = {
  pending:   { icon: Clock,        label: "Pendente",    color: "text-muted-foreground" },
  sent:      { icon: Send,         label: "Enviado",     color: "text-blue-500" },
  delivered: { icon: Check,        label: "Entregue",    color: "text-emerald-500" },
  opened:    { icon: Eye,          label: "Aberto",      color: "text-emerald-600" },
  failed:    { icon: AlertCircle,  label: "Falhou",      color: "text-destructive" },
  bounced:   { icon: AlertCircle,  label: "Bounced",     color: "text-destructive" },
};

const WA_STATUS: Record<string, { icon: typeof Check; label: string; color: string }> = {
  sent:      { icon: Check,      label: "Enviado",     color: "text-muted-foreground" },
  delivered: { icon: CheckCheck,  label: "Entregue",    color: "text-muted-foreground" },
  read:      { icon: CheckCheck,  label: "Visualizado", color: "text-blue-500" },
  failed:    { icon: AlertCircle, label: "Falhou",      color: "text-destructive" },
};

/* ── Sub-components ── */

const EmailStatusBadge = memo(function EmailStatusBadge({ status }: { status: string }) {
  const cfg = EMAIL_STATUS[status] || EMAIL_STATUS.pending;
  const Icon = cfg.icon;
  return (
    <Badge variant="outline" className={cn("gap-1 text-[10px]", cfg.color)}>
      <Icon className="h-3 w-3" />
      {cfg.label}
    </Badge>
  );
});

const WhatsAppStatusIcon = memo(function WhatsAppStatusIcon({ status }: { status: string }) {
  const cfg = WA_STATUS[status] || WA_STATUS.sent;
  const Icon = cfg.icon;
  return (
    <span className={cn("inline-flex items-center gap-0.5", cfg.color)} title={cfg.label}>
      <Icon className="h-3.5 w-3.5" />
    </span>
  );
});

const InteractionItem = memo(function InteractionItem({ event }: { event: InteractionEvent }) {
  const isEmail = event.channel === "email";
  return (
    <div className="flex items-center gap-2 text-xs py-1.5 border-b border-border last:border-0">
      {isEmail ? (
        <Mail className="h-3.5 w-3.5 text-blue-500 shrink-0" />
      ) : (
        <MessageCircle className="h-3.5 w-3.5 text-emerald-500 shrink-0" />
      )}
      <span className="text-foreground flex-1 truncate">{event.action}</span>
      <span className="text-muted-foreground whitespace-nowrap">
        {format(new Date(event.timestamp), "dd/MM HH:mm")}
      </span>
    </div>
  );
});

/* ── Main Component ── */

export const DeliveryStatusPanel = memo(function DeliveryStatusPanel({
  clientId,
  contractNumber,
  tenantId,
}: DeliveryStatusPanelProps) {
  const [emailLogs, setEmailLogs] = useState<EmailLog[]>([]);
  const [waLogs, setWhatsAppLogs] = useState<WhatsAppLog[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchStatus = useCallback(async () => {
    if (!clientId && !contractNumber) { setLoading(false); return; }
    setLoading(true);

    try {
      // Fetch email logs (from email_send_log or tracking-based)
      const emailPromise = supabase
        .from("email_send_log" as any)
        .select("id, status, recipient_email, created_at, template_name")
        .or(
          clientId
            ? `metadata->>client_id.eq.${clientId}`
            : `metadata->>contract_number.eq.${contractNumber}`
        )
        .order("created_at", { ascending: false })
        .limit(5);

      // Fetch WhatsApp delivery status from tracking_messages
      let waQuery = supabase
        .from("tracking_messages")
        .select("id, mensagem, remetente_tipo, created_at, lida")
        .eq("remetente_tipo", "loja")
        .order("created_at", { ascending: false })
        .limit(5);

      if (clientId) {
        // Get tracking IDs for this client
        const { data: trackings } = await supabase
          .from("client_tracking")
          .select("id")
          .eq("client_id", clientId)
          .limit(10);

        if (trackings && trackings.length > 0) {
          const ids = trackings.map((t: any) => t.id);
          waQuery = waQuery.in("tracking_id", ids);
        }
      }

      const [emailResult, waResult] = await Promise.all([
        emailPromise.then(r => r.data).catch(() => null),
        waQuery.then(r => r.data).catch(() => null),
      ]);

      if (emailResult) {
        setEmailLogs(
          (emailResult as any[]).map((e) => ({
            id: e.id,
            status: e.status || "pending",
            recipient_email: e.recipient_email || "",
            created_at: e.created_at,
            template_name: e.template_name,
          }))
        );
      }

      if (waResult) {
        setWhatsAppLogs(
          (waResult as any[]).map((m) => ({
            id: m.id,
            status: m.lida ? "read" : "delivered",
            phone: "",
            message_preview: (m.mensagem || "").substring(0, 40),
            created_at: m.created_at,
          }))
        );
      }
    } catch (e) {
      console.error("[DeliveryStatus] Error:", e);
    } finally {
      setLoading(false);
    }
  }, [clientId, contractNumber]);

  useEffect(() => { fetchStatus(); }, [fetchStatus]);

  // Realtime: listen for status updates (async, non-blocking)
  useEffect(() => {
    if (!clientId) return;

    const channel = supabase
      .channel(`delivery-status-${clientId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "tracking_messages" },
        () => { fetchStatus(); }
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [clientId, fetchStatus]);

  // Build interaction history (last 3 events)
  const interactions = useMemo<InteractionEvent[]>(() => {
    const events: InteractionEvent[] = [];

    emailLogs.forEach((e) => {
      const statusLabel = EMAIL_STATUS[e.status]?.label || e.status;
      events.push({
        id: `email-${e.id}`,
        channel: "email",
        action: `E-mail ${statusLabel.toLowerCase()}${e.template_name ? ` (${e.template_name})` : ""}`,
        timestamp: e.created_at,
      });
    });

    waLogs.forEach((w) => {
      const statusLabel = WA_STATUS[w.status]?.label || w.status;
      events.push({
        id: `wa-${w.id}`,
        channel: "whatsapp",
        action: `WhatsApp ${statusLabel.toLowerCase()}: "${w.message_preview}..."`,
        timestamp: w.created_at,
      });
    });

    return events
      .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
      .slice(0, 3);
  }, [emailLogs, waLogs]);

  if (!clientId && !contractNumber) return null;

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm flex items-center gap-2">
            <Send className="h-4 w-4 text-primary" />
            Status de Entrega
          </CardTitle>
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            onClick={fetchStatus}
            disabled={loading}
          >
            <RefreshCw className={cn("h-3.5 w-3.5", loading && "animate-spin")} />
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {loading ? (
          <div className="space-y-2">
            <Skeleton className="h-8 w-full" />
            <Skeleton className="h-8 w-full" />
          </div>
        ) : (
          <>
            {/* Email Status */}
            {emailLogs.length > 0 && (
              <div className="space-y-1.5">
                <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1">
                  <Mail className="h-3 w-3" /> E-mail
                </p>
                {emailLogs.slice(0, 2).map((log) => (
                  <div key={log.id} className="flex items-center justify-between text-xs">
                    <span className="truncate max-w-[50%] text-foreground">
                      {log.recipient_email || "—"}
                    </span>
                    <EmailStatusBadge status={log.status} />
                  </div>
                ))}
              </div>
            )}

            {/* WhatsApp Status */}
            {waLogs.length > 0 && (
              <div className="space-y-1.5">
                <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1">
                  <MessageCircle className="h-3 w-3" /> WhatsApp
                </p>
                {waLogs.slice(0, 3).map((log) => (
                  <div key={log.id} className="flex items-center justify-between text-xs">
                    <span className="truncate max-w-[60%] text-foreground">
                      {log.message_preview || "Mensagem"}
                    </span>
                    <WhatsAppStatusIcon status={log.status} />
                  </div>
                ))}
              </div>
            )}

            {/* No data */}
            {emailLogs.length === 0 && waLogs.length === 0 && (
              <p className="text-xs text-muted-foreground text-center py-3">
                Nenhum envio registrado para este cliente
              </p>
            )}

            {/* Interaction History */}
            {interactions.length > 0 && (
              <div className="pt-1 border-t border-border">
                <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-1">
                  Últimas Interações
                </p>
                {interactions.map((evt) => (
                  <InteractionItem key={evt.id} event={evt} />
                ))}
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
});
