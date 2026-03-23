import { useState, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Send } from "lucide-react";
import { supabase } from "@/lib/supabaseClient";

interface ChatMessage {
  id: string;
  session_id: string;
  sender: string;
  message: string;
  created_at: string;
}

interface DealRoomChatProps {
  sessionId: string;
  tenantId: string;
  userId?: string;
}

export function DealRoomChat({ sessionId, tenantId, userId }: DealRoomChatProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Load messages
  useEffect(() => {
    const loadMessages = async () => {
      const { data } = await supabase
        .from("dealroom_chat_messages" as any)
        .select("*")
        .eq("session_id", sessionId)
        .order("created_at", { ascending: true })
        .limit(200);
      if (data) setMessages(data as unknown as ChatMessage[]);
    };
    loadMessages();

    // Realtime subscription
    const channel = supabase
      .channel(`dealroom-chat-${sessionId}`)
      .on("postgres_changes", {
        event: "INSERT",
        schema: "public",
        table: "dealroom_chat_messages",
        filter: `session_id=eq.${sessionId}`,
      }, (payload) => {
        setMessages(prev => [...prev, payload.new as ChatMessage]);
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [sessionId]);

  // Auto-scroll
  useEffect(() => {
    scrollRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

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

  return (
    <div className="flex flex-col h-[400px]">
      <ScrollArea className="flex-1 p-3">
        <div className="space-y-2">
          {messages.length === 0 && (
            <p className="text-xs text-muted-foreground text-center py-8">
              Nenhuma mensagem ainda. Inicie a conversa!
            </p>
          )}
          {messages.map(msg => (
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
                <p>{msg.message}</p>
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
    </div>
  );
}
