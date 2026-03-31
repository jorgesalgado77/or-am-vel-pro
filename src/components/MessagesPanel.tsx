import {useState, useEffect, useRef, forwardRef} from "react";
import {Card, CardContent, CardHeader, CardTitle} from "@/components/ui/card";
import {Table, TableBody, TableCell, TableHead, TableHeader, TableRow} from "@/components/ui/table";
import {Button} from "@/components/ui/button";
import {Textarea} from "@/components/ui/textarea";
import {Badge} from "@/components/ui/badge";
import {ArrowLeft, Send, RefreshCw, MessageCircle, Phone} from "lucide-react";
import {supabase} from "@/lib/supabaseClient";
import {getTenantId} from "@/lib/tenantState";
import {toast} from "sonner";
import {format} from "date-fns";
import {useCurrentUser} from "@/hooks/useCurrentUser";

function formatPhoneMask(phone: string | null | undefined): string {
  if (!phone) return "—";
  const digits = phone.replace(/\D/g, "");
  if (digits.length === 11) {
    return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`;
  }
  if (digits.length === 10) {
    return `(${digits.slice(0, 2)}) ${digits.slice(2, 6)}-${digits.slice(6)}`;
  }
  if (digits.length >= 12 && digits.startsWith("55")) {
    const local = digits.slice(2);
    if (local.length === 11) {
      return `+55 (${local.slice(0, 2)}) ${local.slice(2, 7)}-${local.slice(7)}`;
    }
    if (local.length === 10) {
      return `+55 (${local.slice(0, 2)}) ${local.slice(2, 6)}-${local.slice(6)}`;
    }
  }
  return phone;
}

interface TrackingWithMessages {
  id: string;
  numero_contrato: string;
  nome_cliente: string;
  unread_count: number;
  phone?: string | null;
  last_message_at?: string | null;
}

interface Message {
  id: string;
  mensagem: string;
  remetente_tipo: string;
  remetente_nome: string | null;
  created_at: string;
  lida: boolean;
}

interface MessagesPanelProps {
  onUnreadChange?: (count: number) => void;
}

export const MessagesPanel = forwardRef<HTMLDivElement, MessagesPanelProps>(function MessagesPanel({ onUnreadChange }, _ref) {
  const [trackings, setTrackings] = useState<TrackingWithMessages[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedTracking, setSelectedTracking] = useState<TrackingWithMessages | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [newReply, setNewReply] = useState("");
  const [sending, setSending] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const { currentUser } = useCurrentUser();

  // Determine if user should see all messages or only their own
  const cargoLower = currentUser?.cargo_nome?.toLowerCase() || "";
  const isGlobalRole = cargoLower.includes("admin") || cargoLower.includes("gerente");

  const fetchTrackingsWithMessages = async () => {
    setLoading(true);

    const tenantId = getTenantId();

    let trackQuery = supabase
      .from("client_tracking")
      .select("id, numero_contrato, nome_cliente, client_id")
      .order("updated_at", { ascending: false });
    if (tenantId) trackQuery = trackQuery.eq("tenant_id", tenantId);
    const { data: allTrackings } = await trackQuery;

    if (!allTrackings || allTrackings.length === 0) { setTrackings([]); setLoading(false); return; }

    const trackingIdList = (allTrackings as any[]).map((t) => t.id);

    // Get client phone numbers
    const clientIds = Array.from(new Set((allTrackings as any[]).map((t) => t.client_id).filter(Boolean)));
    let clientPhoneMap: Record<string, string> = {};
    if (clientIds.length > 0) {
      const { data: clientsData } = await supabase
        .from("clients")
        .select("id, telefone1, telefone2")
        .in("id", clientIds);
      (clientsData || []).forEach((c: any) => {
        clientPhoneMap[c.id] = c.telefone1 || c.telefone2 || "";
      });
    }

    // Get unread counts
    const { data: unreadData } = await supabase
      .from("tracking_messages")
      .select("tracking_id")
      .eq("remetente_tipo", "cliente")
      .eq("lida", false)
      .in("tracking_id", trackingIdList);

    const unreadMap: Record<string, number> = {};
    (unreadData || []).forEach((m: any) => {
      unreadMap[m.tracking_id] = (unreadMap[m.tracking_id] || 0) + 1;
    });

    // Get last message dates (from client)
    const { data: lastMsgsData } = await supabase
      .from("tracking_messages")
      .select("tracking_id, created_at")
      .eq("remetente_tipo", "cliente")
      .in("tracking_id", trackingIdList)
      .order("created_at", { ascending: false });

    const lastMsgMap: Record<string, string> = {};
    (lastMsgsData || []).forEach((m: any) => {
      if (!lastMsgMap[m.tracking_id]) {
        lastMsgMap[m.tracking_id] = m.created_at;
      }
    });

    // Get trackings that have any messages
    const { data: msgTrackings } = await supabase
      .from("tracking_messages")
      .select("tracking_id")
      .in("tracking_id", trackingIdList);

    const hasMessages = new Set((msgTrackings || []).map((m: any) => m.tracking_id));

    // Group by client_id
    const clientGroups = new Map<string, { tracking: any; unread: number; hasMsg: boolean; phone: string | null; lastMsgAt: string | null }>();

    (allTrackings as any[]).forEach((t) => {
      const groupKey = t.client_id || t.id;
      const unread = unreadMap[t.id] || 0;
      const hasMsg = hasMessages.has(t.id);
      const phone = clientPhoneMap[t.client_id] || (t.numero_contrato?.startsWith("WA-") ? t.numero_contrato.replace("WA-", "") : null);
      const lastMsgAt = lastMsgMap[t.id] || null;
      const existing = clientGroups.get(groupKey);

      if (!existing) {
        clientGroups.set(groupKey, { tracking: t, unread, hasMsg, phone, lastMsgAt });
      } else {
        existing.unread += unread;
        existing.hasMsg = existing.hasMsg || hasMsg;
        if (!existing.phone && phone) existing.phone = phone;
        if (lastMsgAt && (!existing.lastMsgAt || lastMsgAt > existing.lastMsgAt)) {
          existing.lastMsgAt = lastMsgAt;
        }
        if (unread > 0 && (unreadMap[existing.tracking.id] || 0) === 0) {
          existing.tracking = t;
        }
      }
    });

    const result: TrackingWithMessages[] = Array.from(clientGroups.values())
      .filter((g) => g.hasMsg || g.unread > 0)
      .map((g) => ({
        id: g.tracking.id,
        numero_contrato: g.tracking.numero_contrato,
        nome_cliente: g.tracking.nome_cliente,
        unread_count: g.unread,
        phone: g.phone,
        last_message_at: g.lastMsgAt,
      }))
      .sort((a, b) => b.unread_count - a.unread_count);

    setTrackings(result);

    const totalUnread = result.reduce((sum, t) => sum + t.unread_count, 0);
    onUnreadChange?.(totalUnread);

    setLoading(false);
  };

  useEffect(() => { fetchTrackingsWithMessages(); }, []);

  useEffect(() => {
    const channel = supabase
      .channel("messages-panel-realtime")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "tracking_messages" },
        (payload) => {
          const msg = payload.new as any;
          if (msg.remetente_tipo === "cliente") {
            fetchTrackingsWithMessages();
            if (selectedTracking && msg.tracking_id === selectedTracking.id) {
              setMessages((prev) => [...prev, msg]);
              supabase.from("tracking_messages").update({ lida: true } as any).eq("id", msg.id);
            }
          }
        }
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [selectedTracking]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const openConversation = async (tracking: TrackingWithMessages) => {
    setSelectedTracking(tracking);

    const { data: relatedTrackings } = await supabase
      .from("client_tracking")
      .select("id, client_id")
      .eq("id", tracking.id)
      .single();

    let allTrackingIds = [tracking.id];
    if (relatedTrackings?.client_id) {
      const { data: siblings } = await supabase
        .from("client_tracking")
        .select("id")
        .eq("client_id", relatedTrackings.client_id);
      if (siblings) {
        allTrackingIds = Array.from(new Set([tracking.id, ...siblings.map((s: any) => s.id)]));
      }
    }

    const { data } = await supabase
      .from("tracking_messages")
      .select("*")
      .in("tracking_id", allTrackingIds)
      .order("created_at", { ascending: true });
    if (data) setMessages(data as any);

    // Mark client messages as read
    await supabase
      .from("tracking_messages")
      .update({ lida: true } as any)
      .in("tracking_id", allTrackingIds)
      .eq("remetente_tipo", "cliente")
      .eq("lida", false);

    // Update local state and refresh sidebar count
    setTrackings((prev) => prev.map((t) => t.id === tracking.id ? { ...t, unread_count: 0 } : t));
    const newTotal = trackings.reduce((sum, t) => sum + (t.id === tracking.id ? 0 : t.unread_count), 0);
    onUnreadChange?.(newTotal);
  };

  const handleSendReply = async () => {
    if (!newReply.trim() || !selectedTracking) return;
    setSending(true);
    const { error } = await supabase.from("tracking_messages").insert({
      tracking_id: selectedTracking.id,
      mensagem: newReply.trim(),
      remetente_tipo: "loja",
      remetente_nome: "Loja",
      lida: false,
      tenant_id: getTenantId(),
    } as any);
    if (error) toast.error("Erro ao enviar");
    else {
      setNewReply("");
      const { data } = await supabase
        .from("tracking_messages")
        .select("*")
        .eq("tracking_id", selectedTracking.id)
        .order("created_at", { ascending: true });
      if (data) setMessages(data as any);
    }
    setSending(false);
  };

  if (selectedTracking) {
    return (
      <div className="max-w-3xl mx-auto space-y-4">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="sm" onClick={() => { setSelectedTracking(null); fetchTrackingsWithMessages(); }} className="gap-1">
            <ArrowLeft className="h-4 w-4" />Voltar
          </Button>
          <div>
            <h3 className="font-semibold text-foreground">{selectedTracking.nome_cliente}</h3>
            <p className="text-xs text-muted-foreground font-mono">Contrato: {selectedTracking.numero_contrato}</p>
          </div>
        </div>

        <Card>
          <CardContent className="p-4">
            <div className="border rounded-lg p-3 h-80 overflow-y-auto space-y-2 bg-background mb-3">
              {messages.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-8">Nenhuma mensagem</p>
              ) : (
                messages.map((msg) => (
                  <div key={msg.id} className={`flex ${msg.remetente_tipo === "loja" ? "justify-end" : "justify-start"}`}>
                    <div className={`max-w-[75%] rounded-lg px-3 py-2 text-sm ${msg.remetente_tipo === "loja" ? "bg-primary text-primary-foreground" : "bg-muted text-foreground"}`}>
                      <p className="text-[10px] opacity-70 mb-0.5">
                        {msg.remetente_nome || (msg.remetente_tipo === "loja" ? "Loja" : "Cliente")} • {format(new Date(msg.created_at), "dd/MM HH:mm")}
                      </p>
                      <p>{msg.mensagem}</p>
                    </div>
                  </div>
                ))
              )}
              <div ref={messagesEndRef} />
            </div>

            <div className="flex gap-2">
              <Textarea
                value={newReply}
                onChange={(e) => setNewReply(e.target.value)}
                placeholder="Digite sua resposta..."
                className="min-h-[40px] h-10 resize-none"
                onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSendReply(); } }}
              />
              <Button onClick={handleSendReply} disabled={sending || !newReply.trim()} size="icon" className="shrink-0">
                <Send className="h-4 w-4" />
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="text-base flex items-center gap-2">
              <MessageCircle className="h-4 w-4" />
              Mensagens dos Clientes
            </CardTitle>
            <Button variant="outline" size="sm" onClick={fetchTrackingsWithMessages} className="gap-1">
              <RefreshCw className="h-3 w-3" />Atualizar
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nº Contrato</TableHead>
                  <TableHead>Cliente</TableHead>
                  <TableHead>
                    <div className="flex items-center gap-1">
                      <Phone className="h-3 w-3" />
                      WhatsApp
                    </div>
                  </TableHead>
                  <TableHead>Última Msg Recebida</TableHead>
                  <TableHead className="text-center">Novas</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground py-8">Carregando...</TableCell></TableRow>
                ) : trackings.length === 0 ? (
                  <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground py-8">Nenhuma mensagem recebida</TableCell></TableRow>
                ) : (
                  trackings.map((t) => (
                    <TableRow key={t.id} className="cursor-pointer hover:bg-muted/50" onClick={() => openConversation(t)}>
                      <TableCell className="font-mono text-sm">{t.numero_contrato}</TableCell>
                      <TableCell>{t.nome_cliente}</TableCell>
                      <TableCell className="text-sm text-emerald-600 font-mono">
                        {formatPhoneMask(t.phone)}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {t.last_message_at
                          ? format(new Date(t.last_message_at), "dd/MM/yyyy HH:mm")
                          : "—"}
                      </TableCell>
                      <TableCell className="text-center">
                        {t.unread_count > 0 ? (
                          <Badge variant="destructive" className="text-xs">{t.unread_count}</Badge>
                        ) : (
                          <span className="text-muted-foreground text-xs">0</span>
                        )}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
});
