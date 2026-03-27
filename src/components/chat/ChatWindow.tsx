import { useState, useEffect, useRef, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Video, RefreshCw } from "lucide-react";
import { CloseDealButton } from "./CloseDealButton";
import { supabase } from "@/lib/supabaseClient";
import { toast } from "sonner";
import { ChatMessageBubble } from "./ChatMessageBubble";
import { ChatAISuggestion } from "./ChatAISuggestion";
import { AutoPilotHistory } from "./AutoPilotHistory";
import { ChatInput } from "./ChatInput";
import { TypingIndicator } from "./TypingIndicator";
import { TEMPERATURE_CONFIG } from "@/lib/leadTemperature";
import { useTypingIndicator } from "@/hooks/useTypingIndicator";
import { useQuickReplies } from "@/hooks/useQuickReplies";
import { ChatDealInsights } from "./ChatDealInsights";
import type { ChatConversation, ChatMessage } from "./types";

const DISC_PROFILES: Record<string, { label: string; emoji: string; color: string; desc: string; tips: string }> = {
  D: { label: "Dominante", emoji: "🔴", color: "bg-red-100 text-red-800 border-red-200", desc: "Direto, decisivo, orientado a resultados", tips: "Seja objetivo, mostre ROI e resultados rápidos" },
  I: { label: "Influente", emoji: "🟡", color: "bg-yellow-100 text-yellow-800 border-yellow-200", desc: "Entusiasmado, sociável, emotivo", tips: "Use entusiasmo, depoimentos e exclusividade" },
  S: { label: "Estável", emoji: "🟢", color: "bg-green-100 text-green-800 border-green-200", desc: "Cauteloso, busca segurança e garantias", tips: "Ofereça garantias, prazos claros e suporte" },
  C: { label: "Conforme", emoji: "🔵", color: "bg-blue-100 text-blue-800 border-blue-200", desc: "Analítico, detalhista, precisa de dados", tips: "Apresente dados, comparativos e especificações" },
};

function DISCProfileBadge({ profile }: { profile: string }) {
  const disc = DISC_PROFILES[profile];
  if (!disc) return null;
  return (
    <div className={`mx-3 mb-1 px-3 py-1.5 rounded-lg border text-xs flex items-center gap-2 animate-in fade-in duration-300 ${disc.color}`}>
      <span className="text-sm">{disc.emoji}</span>
      <div className="flex-1 min-w-0">
        <span className="font-semibold">DISC: {disc.label}</span>
        <span className="mx-1.5 opacity-50">•</span>
        <span className="opacity-80">{disc.tips}</span>
      </div>
    </div>
  );
}

interface Props {
  conversation: ChatConversation;
  userId?: string;
  tenantId?: string | null;
  onBack: () => void;
  onStartDealRoom?: () => void;
  aiSuggestion: string;
  aiLoading: boolean;
  aiTipoCopy: string;
  aiDiscProfile?: string;
  onUseSuggestion: () => void;
  inputValue: string;
  onInputChange: (v: string) => void;
  onMessageSent?: (message: string) => void;
}

const PAGE_SIZE = 40;

export function ChatWindow({
  conversation, onBack, onStartDealRoom,
  aiSuggestion, aiLoading, aiTipoCopy, aiDiscProfile, onUseSuggestion,
  inputValue, onInputChange, userId, tenantId, onMessageSent,
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
  const { replies: quickReplies, loading: qrLoading, add: addQR, remove: removeQR } = useQuickReplies(tenantId ?? null);
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
      tenant_id: tenantId || undefined,
    } as any);

    if (error) {
      toast.error("Erro ao enviar mensagem");
    } else {
      const sentText = inputValue.trim();
      onInputChange("");
      onMessageSent?.(sentText);
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
      tenant_id: tenantId || undefined,
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
    <div className="flex flex-col h-full min-h-0 bg-background">
      {/* Header — fixed */}
      <div className="flex items-center gap-2 px-3 py-2 border-b border-border bg-card shrink-0">
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

        <CloseDealButton
          trackingId={conversation.id}
          clientName={conversation.nome_cliente}
          tenantId={tenantId ?? null}
          userId={userId}
        />

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

      {/* Messages area — scrollable, takes remaining space */}
      <div
        ref={scrollRef}
        className="flex-1 overflow-y-auto min-h-0 px-3 py-2"
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

      {/* Bottom pinned area — never scrolls away */}
      <div className="shrink-0 border-t border-border bg-card">
        {/* Typing indicator */}
        <TypingIndicator names={typingUsers.map((u) => u.user_name)} />

        {/* Auto-Pilot History */}
        <AutoPilotHistory trackingId={conversation.id} tenantId={tenantId ?? null} />

        {/* Deal Insights from Engine */}
        <ChatDealInsights
          conversation={conversation}
          tenantId={tenantId ?? null}
          messageCount={messages.length}
        />

        {/* DISC Profile Indicator */}
        {aiDiscProfile && (
          <DISCProfileBadge profile={aiDiscProfile} />
        )}

        {/* AI Suggestion */}
        <ChatAISuggestion
          suggestion={aiSuggestion}
          loading={aiLoading}
          tipoCopy={aiTipoCopy}
          discProfile={aiDiscProfile}
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
          quickReplies={quickReplies}
          quickRepliesLoading={qrLoading}
          onAddQuickReply={addQR}
          onRemoveQuickReply={removeQR}
          tenantId={tenantId}
          onSendProductText={async (text) => {
            const { error } = await supabase.from("tracking_messages").insert({
              tracking_id: conversation.id,
              mensagem: text,
              remetente_tipo: "loja",
              remetente_nome: "Loja",
              lida: false,
              tenant_id: tenantId || undefined,
            } as any);
            if (error) toast.error("Erro ao enviar produto");
          }}
        />
      </div>
    </div>
  );
}
