/**
 * DealRoomChat — Mirror of VendaZap sales chat + deal room messages
 * Shows WhatsApp conversation history and allows sending room link to client
 */

import { useState, useEffect, useRef, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Send, Link2, MessageSquare, Phone, Check, CheckCheck, Eye } from "lucide-react";
import { supabase } from "@/lib/supabaseClient";
import { toast } from "sonner";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

interface ChatMessage {
  id: string;
  session_id: string;
  sender: string;
  message: string;
  created_at: string;
}

interface WhatsAppMessage {
  id: string;
  tracking_id: string;
  sender: "me" | "client";
  content: string;
  status?: string;
  created_at: string;
}

interface DealRoomChatProps {
  sessionId: string;
  tenantId: string;
  userId?: string;
  clientId?: string;
  clientName?: string;
}

export function DealRoomChat({ sessionId, tenantId, userId, clientId, clientName }: DealRoomChatProps) {
  const [dealMessages, setDealMessages] = useState<ChatMessage[]>([]);
  const [waMessages, setWaMessages] = useState<WhatsAppMessage[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [activeTab, setActiveTab] = useState("whatsapp");
  const [sendingLink, setSendingLink] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const waScrollRef = useRef<HTMLDivElement>(null);

  const clientLink = `${window.location.origin}/sala/${sessionId}`;

  // Load Deal Room messages
  useEffect(() => {
    const load = async () => {
      const { data } = await supabase
        .from("dealroom_chat_messages" as any)
        .select("*")
        .eq("session_id", sessionId)
        .order("created_at", { ascending: true })
        .limit(200);
      if (data) setDealMessages(data as unknown as ChatMessage[]);
    };
    load();

    const channel = supabase
      .channel(`dealroom-chat-${sessionId}`)
      .on("postgres_changes", {
        event: "INSERT",
        schema: "public",
        table: "dealroom_chat_messages",
        filter: `session_id=eq.${sessionId}`,
      }, (payload) => {
        setDealMessages(prev => [...prev, payload.new as ChatMessage]);
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [sessionId]);

  // Load WhatsApp messages (mirror from chat de vendas)
  const loadWhatsAppMessages = useCallback(async () => {
    if (!clientId) return;
    
    // Find tracking_id for this client
    const { data: tracking } = await supabase
      .from("client_tracking" as any)
      .select("id, telefone_principal")
      .eq("client_id", clientId)
      .eq("tenant_id", tenantId)
      .limit(1);

    if (!tracking || tracking.length === 0) return;

    const trackingId = (tracking as any[])[0].id;

    // Fetch messages from whatsapp_messages table
    const { data: msgs } = await supabase
      .from("whatsapp_messages" as any)
      .select("id, tracking_id, sender, content, status, created_at")
      .eq("tracking_id", trackingId)
      .order("created_at", { ascending: true })
      .limit(300);

    if (msgs) setWaMessages(msgs as unknown as WhatsAppMessage[]);
  }, [clientId, tenantId]);

  useEffect(() => { loadWhatsAppMessages(); }, [loadWhatsAppMessages]);

  // Realtime for WhatsApp messages
  useEffect(() => {
    if (!clientId) return;
    
    const channel = supabase
      .channel(`dealroom-wa-mirror-${clientId}`)
      .on("postgres_changes", {
        event: "INSERT",
        schema: "public",
        table: "whatsapp_messages",
      }, (payload: any) => {
        // Check if message belongs to this client's tracking
        loadWhatsAppMessages();
      })
      .subscribe();

    // Polling de segurança (8s)
    const interval = setInterval(loadWhatsAppMessages, 8000);

    return () => {
      supabase.removeChannel(channel);
      clearInterval(interval);
    };
  }, [clientId, loadWhatsAppMessages]);

  // Auto-scroll
  useEffect(() => {
    scrollRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [dealMessages]);

  useEffect(() => {
    waScrollRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [waMessages]);

  // Send Deal Room message
  const handleSend = async () => {
    if (!input.trim()) return;
    setSending(true);
    await supabase.from("dealroom_chat_messages" as any).insert({
      session_id: sessionId,
      tenant_id: tenantId,
      sender: "projetista",
      sender_id: userId || null,
      message: input.trim(),
    });
    setInput("");
    setSending(false);
  };

  // Send room link via WhatsApp
  const handleSendRoomLink = async () => {
    if (!clientId) {
      toast.error("Nenhum cliente vinculado à sala");
      return;
    }
    setSendingLink(true);

    try {
      // Get client phone from tracking
      const { data: tracking } = await supabase
        .from("client_tracking" as any)
        .select("telefone_principal")
        .eq("client_id", clientId)
        .eq("tenant_id", tenantId)
        .limit(1);

      const phone = (tracking as any[])?.[0]?.telefone_principal;
      if (!phone) {
        toast.error("Telefone do cliente não encontrado");
        setSendingLink(false);
        return;
      }

      // Get WhatsApp instance for this tenant
      const { data: instance } = await supabase
        .from("whatsapp_instances" as any)
        .select("instance_id, api_token, provider")
        .eq("tenant_id", tenantId)
        .eq("status", "connected")
        .limit(1);

      if (!instance || (instance as any[]).length === 0) {
        // Fallback: copy link
        navigator.clipboard.writeText(
          `🎥 *Deal Room — Sala de Reunião*\n\n` +
          `Olá${clientName ? ` ${clientName}` : ""}! Sua sala de reunião está pronta.\n\n` +
          `Acesse pelo link:\n${clientLink}\n\n` +
          `Nos vemos lá! 🤝`
        );
        toast.success("Mensagem copiada para enviar manualmente!");
        setSendingLink(false);
        return;
      }

      const inst = (instance as any[])[0];
      const message = `🎥 *Deal Room — Sala de Reunião*\n\nOlá${clientName ? ` ${clientName}` : ""}! Sua sala de reunião está pronta.\n\nAcesse pelo link:\n${clientLink}\n\nNos vemos lá! 🤝`;

      // Send via WhatsApp gateway
      const { error } = await supabase.functions.invoke("whatsapp-gateway", {
        body: {
          action: "send_message",
          instance_id: inst.instance_id,
          api_token: inst.api_token,
          provider: inst.provider || "zapi",
          phone: phone.replace(/\D/g, ""),
          message,
          tenant_id: tenantId,
        },
      });

      if (error) throw error;
      toast.success("Link da sala enviado via WhatsApp!");
    } catch (err) {
      console.error("Error sending room link:", err);
      navigator.clipboard.writeText(clientLink);
      toast.info("Erro ao enviar. Link copiado para área de transferência.");
    }
    setSendingLink(false);
  };

  const StatusIcon = ({ status }: { status?: string }) => {
    if (status === "read") return <Eye className="h-3 w-3 text-blue-500" />;
    if (status === "delivered") return <CheckCheck className="h-3 w-3 text-muted-foreground" />;
    if (status === "sent") return <Check className="h-3 w-3 text-muted-foreground" />;
    return null;
  };

  return (
    <div className="flex flex-col h-[400px]">
      {/* Tab header */}
      <div className="flex items-center justify-between px-2 py-1.5 border-b bg-muted/30">
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="h-7 bg-transparent gap-1 p-0">
            <TabsTrigger value="whatsapp" className="h-6 px-2 text-[10px] gap-1 data-[state=active]:bg-emerald-500/10 data-[state=active]:text-emerald-700">
              <Phone className="h-3 w-3" /> WhatsApp
              {waMessages.length > 0 && (
                <Badge variant="secondary" className="h-4 text-[8px] px-1">{waMessages.length}</Badge>
              )}
            </TabsTrigger>
            <TabsTrigger value="sala" className="h-6 px-2 text-[10px] gap-1">
              <MessageSquare className="h-3 w-3" /> Sala
            </TabsTrigger>
          </TabsList>
        </Tabs>
        <Button
          variant="outline"
          size="sm"
          className="h-6 text-[10px] gap-1 px-2"
          onClick={handleSendRoomLink}
          disabled={sendingLink}
        >
          <Link2 className="h-3 w-3" />
          {sendingLink ? "Enviando..." : "Enviar Link"}
        </Button>
      </div>

      {/* WhatsApp Chat Mirror */}
      {activeTab === "whatsapp" && (
        <ScrollArea className="flex-1 p-3">
          <div className="space-y-2">
            {!clientId && (
              <p className="text-xs text-muted-foreground text-center py-8">
                Nenhum cliente vinculado. Inicie a sala com um cliente para ver o histórico.
              </p>
            )}
            {clientId && waMessages.length === 0 && (
              <p className="text-xs text-muted-foreground text-center py-8">
                Nenhuma conversa encontrada no Chat de Vendas para este cliente.
              </p>
            )}
            {waMessages.map(msg => (
              <div
                key={msg.id}
                className={`flex ${msg.sender === "me" ? "justify-end" : "justify-start"}`}
              >
                <div className={`max-w-[80%] rounded-lg px-3 py-2 text-sm ${
                  msg.sender === "me"
                    ? "bg-emerald-600/90 text-white"
                    : "bg-muted text-foreground"
                }`}>
                  <p className="text-[10px] font-medium opacity-70 mb-0.5">
                    {msg.sender === "me" ? "Você" : clientName || "Cliente"}
                  </p>
                  <p className="text-xs whitespace-pre-wrap">{msg.content}</p>
                  <div className="flex items-center justify-end gap-1 mt-0.5">
                    <span className="text-[9px] opacity-50">
                      {format(new Date(msg.created_at), "HH:mm", { locale: ptBR })}
                    </span>
                    {msg.sender === "me" && <StatusIcon status={msg.status} />}
                  </div>
                </div>
              </div>
            ))}
            <div ref={waScrollRef} />
          </div>
        </ScrollArea>
      )}

      {/* Deal Room Chat */}
      {activeTab === "sala" && (
        <>
          <ScrollArea className="flex-1 p-3">
            <div className="space-y-2">
              {dealMessages.length === 0 && (
                <p className="text-xs text-muted-foreground text-center py-8">
                  Nenhuma mensagem na sala. Inicie a conversa!
                </p>
              )}
              {dealMessages.map(msg => (
                <div
                  key={msg.id}
                  className={`flex ${msg.sender === "projetista" ? "justify-end" : "justify-start"}`}
                >
                  <div className={`max-w-[80%] rounded-lg px-3 py-2 text-sm ${
                    msg.sender === "projetista"
                      ? "bg-primary text-primary-foreground"
                      : "bg-muted text-foreground"
                  }`}>
                    <p className="text-[10px] font-medium opacity-70 mb-0.5">
                      {msg.sender === "projetista" ? "Você" : "Cliente"}
                    </p>
                    <p className="text-xs">{msg.message}</p>
                    <span className="text-[9px] opacity-50">
                      {format(new Date(msg.created_at), "HH:mm", { locale: ptBR })}
                    </span>
                  </div>
                </div>
              ))}
              <div ref={scrollRef} />
            </div>
          </ScrollArea>
          <div className="flex gap-2 p-3 border-t">
            <Input
              placeholder="Digite uma mensagem..."
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={e => e.key === "Enter" && handleSend()}
              className="h-9 text-sm"
            />
            <Button size="icon" onClick={handleSend} disabled={sending || !input.trim()}>
              <Send className="h-4 w-4" />
            </Button>
          </div>
        </>
      )}

      {/* WhatsApp reply input */}
      {activeTab === "whatsapp" && clientId && (
        <div className="flex gap-2 p-3 border-t">
          <Input
            placeholder="Responder via WhatsApp..."
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => {
              if (e.key === "Enter") handleSendWhatsApp();
            }}
            className="h-9 text-sm"
          />
          <Button size="icon" onClick={handleSendWhatsApp} disabled={sending || !input.trim()}>
            <Send className="h-4 w-4" />
          </Button>
        </div>
      )}
    </div>
  );

  async function handleSendWhatsApp() {
    if (!input.trim() || !clientId) return;
    setSending(true);

    try {
      const { data: tracking } = await supabase
        .from("client_tracking" as any)
        .select("id, telefone_principal")
        .eq("client_id", clientId)
        .eq("tenant_id", tenantId)
        .limit(1);

      const phone = (tracking as any[])?.[0]?.telefone_principal;
      if (!phone) {
        toast.error("Telefone não encontrado");
        setSending(false);
        return;
      }

      const { data: instance } = await supabase
        .from("whatsapp_instances" as any)
        .select("instance_id, api_token, provider")
        .eq("tenant_id", tenantId)
        .eq("status", "connected")
        .limit(1);

      if (!instance || (instance as any[]).length === 0) {
        toast.error("WhatsApp não conectado");
        setSending(false);
        return;
      }

      const inst = (instance as any[])[0];
      const { error } = await supabase.functions.invoke("whatsapp-gateway", {
        body: {
          action: "send_message",
          instance_id: inst.instance_id,
          api_token: inst.api_token,
          provider: inst.provider || "zapi",
          phone: phone.replace(/\D/g, ""),
          message: input.trim(),
          tenant_id: tenantId,
        },
      });

      if (error) throw error;
      setInput("");
      toast.success("Mensagem enviada!");
      // Reload after short delay for message to be persisted
      setTimeout(loadWhatsAppMessages, 1500);
    } catch {
      toast.error("Erro ao enviar mensagem");
    }
    setSending(false);
  }
}
