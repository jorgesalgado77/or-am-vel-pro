import { useState, useEffect, useRef, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Video, RefreshCw, UserPlus } from "lucide-react";
import { CloseDealButton } from "./CloseDealButton";
import { supabase } from "@/lib/supabaseClient";
import { toast } from "sonner";
import { ChatMessageBubble } from "./ChatMessageBubble";
import { ChatInput } from "./ChatInput";
import { TypingIndicator } from "./TypingIndicator";
import { TEMPERATURE_CONFIG } from "@/lib/leadTemperature";
import { useTypingIndicator } from "@/hooks/useTypingIndicator";
import { useQuickReplies } from "@/hooks/useQuickReplies";
import { sendWhatsAppText, sendWhatsAppMedia } from "@/lib/whatsappSender";
import { VendaZapMonitorIndicator } from "./VendaZapMonitorIndicator";
import type { ChatConversation, ChatMessage } from "./types";

interface Props {
  conversation: ChatConversation;
  userId?: string;
  tenantId?: string | null;
  onBack: () => void;
  onStartDealRoom?: () => void;
  onCreateLead?: () => void;
  inputValue: string;
  onInputChange: (v: string) => void;
  onMessageSent?: (message: string) => void;
  messageCount?: number;
  onMessagesLoaded?: (count: number) => void;
  detectedDiscProfile?: string;
  vendazapActive?: boolean;
}

const PAGE_SIZE = 40;

function normalizePhone(value?: string | null) {
  const digits = String(value || "")
    .replace(/^WA-/i, "")
    .replace(/@.*/, "")
    .replace(/\D/g, "")
    .replace(/^0+/, "");

  return /^55\d{10,11}$/.test(digits) ? digits.slice(2) : digits;
}

function phonesMatch(first?: string | null, second?: string | null) {
  const left = normalizePhone(first);
  const right = normalizePhone(second);

  if (!left || !right) return false;
  if (left === right) return true;
  if (left.endsWith(right) || right.endsWith(left)) return true;

  const leftLast8 = left.slice(-8);
  const rightLast8 = right.slice(-8);
  return Boolean(leftLast8 && rightLast8 && leftLast8 === rightLast8);
}

function getConversationPhone(conversation: ChatConversation | null | undefined) {
  if (!conversation) return "";
  return normalizePhone(
    conversation.phone || (conversation.numero_contrato?.startsWith("WA-") ? conversation.numero_contrato.replace("WA-", "") : "")
  );
}

export function ChatWindow({
  conversation, onBack, onStartDealRoom, onCreateLead,
  inputValue, onInputChange, userId, tenantId, onMessageSent, onMessagesLoaded, detectedDiscProfile,
  vendazapActive = false,
}: Props) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [trackingIds, setTrackingIds] = useState<string[]>([conversation.id]);
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

  useEffect(() => {
    let active = true;

    void (async () => {
      const normalizedConversationPhone = getConversationPhone(conversation);
      const trackingIdSet = new Set<string>([conversation.id]);

      if (conversation.client_id) {
        const { data } = await supabase
          .from("client_tracking")
          .select("id")
          .eq("client_id", conversation.client_id)
          .order("updated_at", { ascending: false });

        ((data as Array<{ id: string }> | null) || []).forEach((row) => trackingIdSet.add(row.id));
      }

      if (normalizedConversationPhone) {
        let trackingQuery = supabase
          .from("client_tracking")
          .select("id, numero_contrato")
          .order("updated_at", { ascending: false })
          .limit(100);

        if (tenantId) {
          trackingQuery = trackingQuery.eq("tenant_id", tenantId);
        }

        const { data: phoneTrackings } = await trackingQuery.or(`numero_contrato.ilike.%${normalizedConversationPhone.slice(-8)}%`);

        ((phoneTrackings as Array<{ id: string; numero_contrato?: string | null }> | null) || [])
          .filter((row) => phonesMatch(row.numero_contrato, normalizedConversationPhone))
          .forEach((row) => trackingIdSet.add(row.id));

        let clientQuery = supabase
          .from("clients")
          .select("id, telefone1, telefone2")
          .or(`telefone1.ilike.%${normalizedConversationPhone.slice(-8)}%,telefone2.ilike.%${normalizedConversationPhone.slice(-8)}%`);

        if (tenantId) {
          clientQuery = clientQuery.eq("tenant_id", tenantId);
        }

        const { data: phoneClients } = await clientQuery;

        const relatedClientIds = ((phoneClients as any[]) || [])
          .filter((client) => {
            const phones = [client.telefone1, client.telefone2]
              .map((phone) => normalizePhone(phone));
            return phones.some((phone) => phonesMatch(phone, normalizedConversationPhone));
          })
          .map((client) => client.id);

        if (relatedClientIds.length > 0) {
          const { data: relatedTrackings } = await supabase
            .from("client_tracking")
            .select("id")
            .in("client_id", relatedClientIds)
            .order("updated_at", { ascending: false });

          ((relatedTrackings as Array<{ id: string }> | null) || []).forEach((row) => trackingIdSet.add(row.id));
        }
      }

      if (!active) return;
      setTrackingIds(Array.from(trackingIdSet));
    })();

    return () => {
      active = false;
    };
  }, [conversation, tenantId]);

  const fetchMessages = useCallback(async (before?: string) => {
    if (trackingIds.length === 0) {
      setMessages([]);
      setHasMore(false);
      setLoading(false);
      return;
    }

    let query = supabase
      .from("tracking_messages")
      .select("*")
      .in("tracking_id", trackingIds)
      .order("created_at", { ascending: false })
      .limit(PAGE_SIZE);

    if (before) {
      query = query.lt("created_at", before);
    }

    const { data } = await query;
    const msgs = ((data as any[]) || [])
      .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()) as ChatMessage[];

    if (before) {
      setMessages((prev) => {
        const merged = [...msgs, ...prev];
        return merged.filter((msg, index, arr) => arr.findIndex((item) => item.id === msg.id) === index);
      });
    } else {
      setMessages(msgs);
    }

    onMessagesLoaded?.(msgs.length);
    setHasMore((data?.length || 0) === PAGE_SIZE);
    setLoading(false);
  }, [trackingIds, onMessagesLoaded]);

  useEffect(() => {
    isInitialLoad.current = true;
    setLoading(true);
    void fetchMessages();

    if (trackingIds.length === 0) return;

    supabase
      .from("tracking_messages")
      .update({ lida: true } as any)
      .in("tracking_id", trackingIds)
      .eq("remetente_tipo", "cliente")
      .eq("lida", false)
      .then();
  }, [fetchMessages, trackingIds]);

  useEffect(() => {
    if (isInitialLoad.current && messages.length > 0) {
      bottomRef.current?.scrollIntoView();
      isInitialLoad.current = false;
    }
  }, [messages]);

  useEffect(() => {
    const channel = supabase
      .channel(`chat-${conversation.id}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "tracking_messages" },
        async (payload) => {
          const msg = payload.new as any;

          let isRelated = trackingIds.includes(msg.tracking_id);

          if (!isRelated) {
            const { data: trackingRow } = await supabase
              .from("client_tracking")
              .select("client_id, numero_contrato")
              .eq("id", msg.tracking_id)
              .maybeSingle();

            const trackingPhone = normalizePhone(trackingRow?.numero_contrato);

            if (trackingRow?.client_id && trackingRow.client_id === conversation.client_id) {
              isRelated = true;
            }

            if (!isRelated && phonesMatch(trackingPhone, getConversationPhone(conversation))) {
              isRelated = true;
            }

            if (isRelated) {
              setTrackingIds((prev) => {
                if (prev.includes(msg.tracking_id)) return prev;
                return [...prev, msg.tracking_id];
              });
            }
          }

          if (isRelated) {
            setMessages((prev) => {
              if (prev.some((m) => m.id === msg.id)) return prev;
              return [...prev, msg as ChatMessage].sort(
                (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
              );
            });

            if (msg.remetente_tipo === "cliente") {
              supabase.from("tracking_messages").update({ lida: true } as any).eq("id", msg.id).then();
            }

            requestAnimationFrame(() => {
              bottomRef.current?.scrollIntoView({ behavior: "smooth" });
            });
          }
        }
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [conversation, trackingIds]);

  const handleSend = async () => {
    if (!inputValue.trim()) return;
    setSending(true);
    stopTyping();

    const text = inputValue.trim();

    const { error } = await supabase.from("tracking_messages").insert({
      tracking_id: conversation.id,
      mensagem: text,
      remetente_tipo: "loja",
      remetente_nome: "Loja",
      lida: false,
      tenant_id: tenantId || undefined,
    } as any);

    if (error) {
      console.error("DB insert error:", error);
      toast.error("Erro ao salvar mensagem");
      setSending(false);
      return;
    }

    if (conversation.phone) {
      const sent = await sendWhatsAppText(conversation.phone, text);
      if (!sent) {
        console.warn("[WA] Failed to send via WhatsApp, message saved locally only");
      }
    }

    onInputChange("");
    onMessageSent?.(text);
    requestAnimationFrame(() => {
      bottomRef.current?.scrollIntoView({ behavior: "smooth" });
    });
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

    if (error) {
      toast.error("Erro ao enviar anexo");
      return;
    }

    if (conversation.phone) {
      await sendWhatsAppMedia(conversation.phone, url, name, tipo);
    }
  };

  const handleLoadMore = () => {
    if (messages.length > 0) {
      fetchMessages(messages[0].created_at);
    }
  };

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

        {onCreateLead && !conversation.client_id && (
          <Button
            variant="outline"
            size="sm"
            className="gap-1.5 text-xs h-7 border-emerald-500/30 text-emerald-700 dark:text-emerald-400"
            onClick={onCreateLead}
          >
            <UserPlus className="h-3.5 w-3.5" />
            Criar Lead
          </Button>
        )}

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

      <div className="shrink-0 border-t border-border bg-card">
        <TypingIndicator names={typingUsers.map((u) => u.user_name)} />

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
          detectedDiscProfile={detectedDiscProfile}
          onSendProductText={async (text) => {
            const { error } = await supabase.from("tracking_messages").insert({
              tracking_id: conversation.id,
              mensagem: text,
              remetente_tipo: "loja",
              remetente_nome: "Loja",
              lida: false,
              tenant_id: tenantId || undefined,
            } as any);
            if (error) {
              toast.error("Erro ao enviar produto");
            } else if (conversation.phone) {
              await sendWhatsAppText(conversation.phone, text);
            }
          }}
        />
      </div>
    </div>
  );
}
