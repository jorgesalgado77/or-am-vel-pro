import { useState, useEffect, useCallback, useRef } from "react";
import { supabase } from "@/lib/supabaseClient";
import { useAutoSuggestion } from "@/hooks/useAutoSuggestion";
import { useVendaZap } from "@/hooks/useVendaZap";
import { playLeadNotificationSound } from "@/lib/notificationSound";
import { toast } from "sonner";
import { ChatConversationList } from "./ChatConversationList";
import { ChatWindow } from "./ChatWindow";
import type { ChatConversation } from "./types";

interface Props {
  tenantId: string | null;
  userId?: string;
  onDealRoom?: (clientName: string, contractId: string) => void;
}

export function VendaZapChat({ tenantId, userId, onDealRoom }: Props) {
  const [conversations, setConversations] = useState<ChatConversation[]>([]);
  const [selected, setSelected] = useState<ChatConversation | null>(null);
  const [loading, setLoading] = useState(true);
  const [inputValue, setInputValue] = useState("");
  const debounceRef = useRef<NodeJS.Timeout | null>(null);

  const { addon } = useVendaZap(tenantId);
  const { suggestion, loading: aiLoading, tipoCopy, generate, clear, markUsed } = useAutoSuggestion({
    tenantId,
    addon: addon ? {
      ativo: addon.ativo,
      prompt_sistema: addon.prompt_sistema,
      api_provider: addon.api_provider,
      openai_model: addon.openai_model,
      max_tokens_mensagem: addon.max_tokens_mensagem,
    } : null,
    userId,
  });

  const fetchConversations = useCallback(async () => {
    if (!tenantId) return;

    // Get all trackings with messages
    const { data: trackings } = await supabase
      .from("client_tracking")
      .select("id, numero_contrato, nome_cliente")
      .order("updated_at", { ascending: false });

    if (!trackings) { setLoading(false); return; }

    // Unread counts
    const { data: unreadData } = await supabase
      .from("tracking_messages")
      .select("tracking_id")
      .eq("remetente_tipo", "cliente")
      .eq("lida", false);

    const unreadMap: Record<string, number> = {};
    (unreadData || []).forEach((m: any) => {
      unreadMap[m.tracking_id] = (unreadMap[m.tracking_id] || 0) + 1;
    });

    // Get last messages
    const { data: lastMsgs } = await supabase
      .from("tracking_messages")
      .select("tracking_id, mensagem, created_at")
      .order("created_at", { ascending: false });

    const lastMsgMap: Record<string, { msg: string; at: string }> = {};
    (lastMsgs || []).forEach((m: any) => {
      if (!lastMsgMap[m.tracking_id]) {
        lastMsgMap[m.tracking_id] = { msg: m.mensagem?.substring(0, 60) || "", at: m.created_at };
      }
    });

    const hasMessages = new Set(Object.keys(lastMsgMap));

    const result: ChatConversation[] = (trackings as any[])
      .filter((t) => hasMessages.has(t.id) || (unreadMap[t.id] || 0) > 0)
      .map((t) => ({
        id: t.id,
        numero_contrato: t.numero_contrato,
        nome_cliente: t.nome_cliente,
        unread_count: unreadMap[t.id] || 0,
        last_message: lastMsgMap[t.id]?.msg,
        last_message_at: lastMsgMap[t.id]?.at,
      }))
      .sort((a, b) => {
        // Unread first, then by last message
        if (a.unread_count > 0 && b.unread_count === 0) return -1;
        if (b.unread_count > 0 && a.unread_count === 0) return 1;
        return (b.last_message_at || "").localeCompare(a.last_message_at || "");
      });

    setConversations(result);
    setLoading(false);
  }, [tenantId]);

  useEffect(() => {
    fetchConversations();
  }, [fetchConversations]);

  // Realtime: refresh list on new client messages
  useEffect(() => {
    const channel = supabase
      .channel("vendazap-chat-list")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "tracking_messages" },
        (payload) => {
          const msg = payload.new as any;
          if (msg.remetente_tipo === "cliente") {
            // Find conversation to get temperature for differentiated sound
            const conv = conversations.find((c) => c.id === msg.tracking_id);
            playLeadNotificationSound(conv?.lead_temperature);

            if (!selected || selected.id !== msg.tracking_id) {
              const tempEmoji = conv?.lead_temperature === "quente" ? "🔥" : conv?.lead_temperature === "morno" ? "🟡" : "❄️";
              toast.info(`${tempEmoji} Nova mensagem de cliente!`, {
                description: msg.mensagem?.substring(0, 50),
                duration: conv?.lead_temperature === "quente" ? 8000 : 4000,
              });
            }
            fetchConversations();
          }
        }
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [selected, fetchConversations, conversations]);

  // AI auto-suggestion with debounce when conversation is selected
  const triggerAI = useCallback((conv: ChatConversation) => {
    if (!addon?.ativo) return;
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      generate(
        {
          id: conv.id,
          nome: conv.nome_cliente,
          status: "em_negociacao",
          updated_at: conv.last_message_at || new Date().toISOString(),
        },
        null
      );
    }, 800);
  }, [addon, generate]);

  const handleSelectConversation = (conv: ChatConversation) => {
    setSelected(conv);
    setInputValue("");
    clear();
    triggerAI(conv);

    // Mark as read locally
    setConversations((prev) =>
      prev.map((c) => (c.id === conv.id ? { ...c, unread_count: 0 } : c))
    );
  };

  const handleUseSuggestion = () => {
    setInputValue(suggestion);
    if (selected) markUsed(selected.id);
  };

  const handleDealRoom = () => {
    if (selected && onDealRoom) {
      onDealRoom(selected.nome_cliente, selected.numero_contrato);
    }
  };

  return (
    <div className="flex h-[calc(100vh-140px)] rounded-lg border border-border overflow-hidden bg-background shadow-sm">
      {/* Conversation list - hidden on mobile when chat is open */}
      <div className={`w-72 shrink-0 ${selected ? "hidden md:flex md:flex-col" : "flex flex-col w-full md:w-72"}`}>
        <ChatConversationList
          conversations={conversations}
          selectedId={selected?.id || null}
          onSelect={handleSelectConversation}
          loading={loading}
        />
      </div>

      {/* Chat window */}
      <div className={`flex-1 ${selected ? "flex flex-col" : "hidden md:flex md:flex-col md:items-center md:justify-center"}`}>
        {selected ? (
          <ChatWindow
            conversation={selected}
            onBack={() => { setSelected(null); clear(); fetchConversations(); }}
            onStartDealRoom={onDealRoom ? handleDealRoom : undefined}
            aiSuggestion={suggestion}
            aiLoading={aiLoading}
            aiTipoCopy={tipoCopy}
            onUseSuggestion={handleUseSuggestion}
            inputValue={inputValue}
            onInputChange={setInputValue}
            userId={userId}
          />
        ) : (
          <div className="text-center p-8 text-muted-foreground">
            <p className="text-lg font-medium mb-1">VendaZap AI Chat</p>
            <p className="text-sm">Selecione uma conversa para começar</p>
          </div>
        )}
      </div>
    </div>
  );
}
