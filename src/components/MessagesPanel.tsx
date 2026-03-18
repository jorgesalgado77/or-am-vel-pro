import { useState, useEffect, useRef } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Separator } from "@/components/ui/separator";
import { ArrowLeft, Send, RefreshCw, MessageCircle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { format } from "date-fns";

interface TrackingWithMessages {
  id: string;
  numero_contrato: string;
  nome_cliente: string;
  unread_count: number;
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

export function MessagesPanel({ onUnreadChange }: MessagesPanelProps) {
  const [trackings, setTrackings] = useState<TrackingWithMessages[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedTracking, setSelectedTracking] = useState<TrackingWithMessages | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [newReply, setNewReply] = useState("");
  const [sending, setSending] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const fetchTrackingsWithMessages = async () => {
    setLoading(true);

    // Get all trackings that have messages
    const { data: allTrackings } = await supabase
      .from("client_tracking")
      .select("id, numero_contrato, nome_cliente")
      .order("updated_at", { ascending: false });

    if (!allTrackings) { setLoading(false); return; }

    // Get unread counts (messages from clients not read by loja)
    const { data: unreadData } = await supabase
      .from("tracking_messages")
      .select("tracking_id")
      .eq("remetente_tipo", "cliente")
      .eq("lida", false);

    const unreadMap: Record<string, number> = {};
    (unreadData || []).forEach((m: any) => {
      unreadMap[m.tracking_id] = (unreadMap[m.tracking_id] || 0) + 1;
    });

    // Get trackings that have any messages
    const { data: msgTrackings } = await supabase
      .from("tracking_messages")
      .select("tracking_id");

    const hasMessages = new Set((msgTrackings || []).map((m: any) => m.tracking_id));

    const result = (allTrackings as any[])
      .filter((t) => hasMessages.has(t.id) || (unreadMap[t.id] || 0) > 0)
      .map((t) => ({
        ...t,
        unread_count: unreadMap[t.id] || 0,
      }))
      .sort((a, b) => b.unread_count - a.unread_count);

    setTrackings(result);

    const totalUnread = result.reduce((sum, t) => sum + t.unread_count, 0);
    onUnreadChange?.(totalUnread);

    setLoading(false);
  };

  useEffect(() => { fetchTrackingsWithMessages(); }, []);

  // Realtime: auto-refresh when new messages arrive
  useEffect(() => {
    const channel = supabase
      .channel("messages-panel-realtime")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "tracking_messages" },
        (payload) => {
          const msg = payload.new as any;
          if (msg.remetente_tipo === "cliente") {
            // Refresh list
            fetchTrackingsWithMessages();
            // If conversation is open for this tracking, auto-load new message
            if (selectedTracking && msg.tracking_id === selectedTracking.id) {
              setMessages((prev) => [...prev, msg]);
              // Mark as read immediately
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
    const { data } = await supabase
      .from("tracking_messages")
      .select("*")
      .eq("tracking_id", tracking.id)
      .order("created_at", { ascending: true });
    if (data) setMessages(data as any);

    // Mark client messages as read
    await supabase
      .from("tracking_messages")
      .update({ lida: true } as any)
      .eq("tracking_id", tracking.id)
      .eq("remetente_tipo", "cliente")
      .eq("lida", false);

    // Update local count
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
    <div className="max-w-3xl mx-auto">
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
                  <TableHead className="text-center">Novas</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  <TableRow><TableCell colSpan={3} className="text-center text-muted-foreground py-8">Carregando...</TableCell></TableRow>
                ) : trackings.length === 0 ? (
                  <TableRow><TableCell colSpan={3} className="text-center text-muted-foreground py-8">Nenhuma mensagem recebida</TableCell></TableRow>
                ) : (
                  trackings.map((t) => (
                    <TableRow key={t.id} className="cursor-pointer hover:bg-muted/50" onClick={() => openConversation(t)}>
                      <TableCell className="font-mono text-sm">{t.numero_contrato}</TableCell>
                      <TableCell>{t.nome_cliente}</TableCell>
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
}
