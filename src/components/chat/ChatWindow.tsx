import { useState, useEffect, useRef, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Video, RefreshCw } from "lucide-react";
import { supabase } from "@/lib/supabaseClient";
import { toast } from "sonner";
import { ChatMessageBubble } from "./ChatMessageBubble";
import { ChatAISuggestion } from "./ChatAISuggestion";
import { ChatInput } from "./ChatInput";
import { TypingIndicator } from "./TypingIndicator";
import { TEMPERATURE_CONFIG } from "@/lib/leadTemperature";
import { useTypingIndicator } from "@/hooks/useTypingIndicator";
import type { ChatConversation, ChatMessage } from "./types";

interface Props {
  conversation: ChatConversation;
  userId?: string;
  onBack: () => void;
  onStartDealRoom?: () => void;
  aiSuggestion: string;
  aiLoading: boolean;
  aiTipoCopy: string;
  onUseSuggestion: () => void;
  inputValue: string;
  onInputChange: (v: string) => void;
}

const PAGE_SIZE = 40;

export function ChatWindow({
  conversation, onBack, onStartDealRoom,
  aiSuggestion, aiLoading, aiTipoCopy, onUseSuggestion,
  inputValue, onInputChange,
}: Props) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [hasMore, setHasMore] = useState(false);

  const { typingUsers, onKeystroke, stopTyping } = useTypingIndicator(
    conversation.id,
    userId,
    "Loja"
  );
  const scrollRef = useRef<HTMLDivElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const isInitialLoad = useRef(true);

  const fetchMessages = useCallback(async (before?: string) => {
    let query = supabase
      .from("tracking_messages")
      .select("*")
      .eq("tracking_id", conversation.id)
      .order("created_at", { ascending: false })
      .limit(PAGE_SIZE);

    if (before) {
      query = query.lt("created_at", before);
    }

    const { data } = await query;
    const msgs = ((data as any[]) || []).reverse() as ChatMessage[];

    if (before) {
      setMessages((prev) => [...msgs, ...prev]);
    } else {
      setMessages(msgs);
    }

    setHasMore((data?.length || 0) === PAGE_SIZE);
    setLoading(false);
  }, [conversation.id]);

  // Initial load + mark as read
  useEffect(() => {
    isInitialLoad.current = true;
    setLoading(true);
    fetchMessages();

    // Mark client messages as read
    supabase
      .from("tracking_messages")
      .update({ lida: true } as any)
      .eq("tracking_id", conversation.id)
      .eq("remetente_tipo", "cliente")
      .eq("lida", false)
      .then();
  }, [conversation.id, fetchMessages]);

  // Scroll to bottom on initial load and new messages
  useEffect(() => {
    if (isInitialLoad.current && messages.length > 0) {
      bottomRef.current?.scrollIntoView();
      isInitialLoad.current = false;
    }
  }, [messages]);

  // Realtime subscription
  useEffect(() => {
    const channel = supabase
      .channel(`chat-${conversation.id}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "tracking_messages" },
        (payload) => {
          const msg = payload.new as any;
          if (msg.tracking_id === conversation.id) {
            setMessages((prev) => {
              if (prev.some((m) => m.id === msg.id)) return prev;
              return [...prev, msg as ChatMessage];
            });

            // Mark as read if from client
            if (msg.remetente_tipo === "cliente") {
              supabase.from("tracking_messages").update({ lida: true } as any).eq("id", msg.id).then();
            }

            // Scroll to bottom
            requestAnimationFrame(() => {
              bottomRef.current?.scrollIntoView({ behavior: "smooth" });
            });
          }
        }
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [conversation.id]);

  const handleSend = async () => {
    if (!inputValue.trim()) return;
    setSending(true);
    stopTyping();

    const { error } = await supabase.from("tracking_messages").insert({
      tracking_id: conversation.id,
      mensagem: inputValue.trim(),
      remetente_tipo: "loja",
      remetente_nome: "Loja",
      lida: false,
    } as any);

    if (error) {
      toast.error("Erro ao enviar mensagem");
    } else {
      onInputChange("");
      requestAnimationFrame(() => {
        bottomRef.current?.scrollIntoView({ behavior: "smooth" });
      });
    }
    setSending(false);
  };

  const handleAttachmentSent = async (url: string, name: string, tipo: string) => {
    const { error } = await supabase.from("tracking_messages").insert({
      tracking_id: conversation.id,
      mensagem: "",
      remetente_tipo: "loja",
      remetente_nome: "Loja",
      lida: false,
      tipo_anexo: tipo,
      anexo_url: url,
      anexo_nome: name,
    } as any);

    if (error) toast.error("Erro ao enviar anexo");
  };

  const handleLoadMore = () => {
    if (messages.length > 0) {
      fetchMessages(messages[0].created_at);
    }
  };

  // Date separator logic
  const shouldShowDate = (msg: ChatMessage, idx: number) => {
    if (idx === 0) return true;
    const prev = messages[idx - 1];
    const prevDate = new Date(prev.created_at).toDateString();
    const currDate = new Date(msg.created_at).toDateString();
    return prevDate !== currDate;
  };

  const tempConfig = conversation.lead_temperature ? TEMPERATURE_CONFIG[conversation.lead_temperature] : null;

  return (
    <div className="flex flex-col h-full bg-background">
      {/* Header */}
      <div className="flex items-center gap-2 px-3 py-2 border-b border-border bg-card">
        <Button variant="ghost" size="icon" className="h-8 w-8 md:hidden" onClick={onBack}>
          <ArrowLeft className="h-4 w-4" />
        </Button>

        <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center text-xs font-semibold text-primary shrink-0">
          {conversation.nome_cliente.charAt(0).toUpperCase()}
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <span className="text-sm font-semibold text-foreground truncate">
              {conversation.nome_cliente}
            </span>
            {tempConfig && (
              <span className="text-xs" title={tempConfig.label}>
                {tempConfig.emoji}
              </span>
            )}
          </div>
          <p className="text-[10px] text-muted-foreground font-mono">
            {conversation.numero_contrato}
          </p>
        </div>

        {onStartDealRoom && (
          <Button
            variant="outline"
            size="sm"
            className="gap-1.5 text-xs h-7"
            onClick={onStartDealRoom}
          >
            <Video className="h-3.5 w-3.5" />
            Deal Room
          </Button>
        )}
      </div>

      {/* Messages area */}
      <div
        ref={scrollRef}
        className="flex-1 overflow-y-auto px-3 py-2"
        style={{ backgroundImage: "url(\"data:image/svg+xml,%3Csvg width='60' height='60' xmlns='http://www.w3.org/2000/svg'%3E%3Cdefs%3E%3Cpattern id='p' width='60' height='60' patternUnits='userSpaceOnUse'%3E%3Ccircle cx='30' cy='30' r='1' fill='%23e5e7eb' opacity='.3'/%3E%3C/pattern%3E%3C/defs%3E%3Crect width='60' height='60' fill='url(%23p)'/%3E%3C/svg%3E\")" }}
      >
        {hasMore && (
          <div className="flex justify-center mb-2">
            <Button variant="ghost" size="sm" className="text-xs gap-1" onClick={handleLoadMore}>
              <RefreshCw className="h-3 w-3" />
              Carregar anteriores
            </Button>
          </div>
        )}

        {loading ? (
          <div className="flex items-center justify-center h-full">
            <span className="text-sm text-muted-foreground">Carregando...</span>
          </div>
        ) : messages.length === 0 ? (
          <div className="flex items-center justify-center h-full">
            <span className="text-sm text-muted-foreground">Nenhuma mensagem. Inicie a conversa!</span>
          </div>
        ) : (
          messages.map((msg, idx) => (
            <ChatMessageBubble
              key={msg.id}
              message={msg}
              showDate={shouldShowDate(msg, idx)}
            />
          ))
        )}
        <div ref={bottomRef} />
      </div>

      {/* Typing indicator */}
      <TypingIndicator names={typingUsers.map((u) => u.user_name)} />

      {/* AI Suggestion */}
      <ChatAISuggestion
        suggestion={aiSuggestion}
        loading={aiLoading}
        tipoCopy={aiTipoCopy}
        onUse={onUseSuggestion}
      />

      {/* Input */}
      <ChatInput
        value={inputValue}
        onChange={onInputChange}
        onSend={handleSend}
        onAttachmentSent={handleAttachmentSent}
        sending={sending}
        trackingId={conversation.id}
        onKeystroke={onKeystroke}
      />
    </div>
  );
}
