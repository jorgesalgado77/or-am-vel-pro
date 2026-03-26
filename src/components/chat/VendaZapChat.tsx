import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { supabase } from "@/lib/supabaseClient";
import { useAutoSuggestion } from "@/hooks/useAutoSuggestion";
import { useVendaZap } from "@/hooks/useVendaZap";
import { useAutoPilot } from "@/hooks/useAutoPilot";
import { useCurrentUser } from "@/hooks/useCurrentUser";
import { playLeadNotificationSound } from "@/lib/notificationSound";
import { toast } from "sonner";
import { ChatConversationList } from "./ChatConversationList";
import { ChatWindow } from "./ChatWindow";
import { AutoPilotPanel } from "./AutoPilotPanel";
import { StartConversationModal } from "./StartConversationModal";
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
  const [showStartModal, setShowStartModal] = useState(false);
  const debounceRef = useRef<NodeJS.Timeout | null>(null);
  const conversationsRef = useRef<ChatConversation[]>([]);

  const { currentUser } = useCurrentUser();
  const { addon } = useVendaZap(tenantId);
  const addonConfig = addon ? {
    ativo: addon.ativo,
    prompt_sistema: addon.prompt_sistema,
    api_provider: addon.api_provider,
    openai_model: addon.openai_model,
    max_tokens_mensagem: addon.max_tokens_mensagem,
  } : null;

  const { suggestion, loading: aiLoading, tipoCopy, discProfile, generate, clear, markUsed } = useAutoSuggestion({
    tenantId,
    addon: addonConfig,
    userId,
  });

  const {
    settings: autoPilotSettings,
    isActive: autoPilotActive,
    toggle: toggleAutoPilot,
    updateSettings: updateAutoPilotSettings,
    processMessage: autoPilotProcess,
  } = useAutoPilot({ tenantId, userId, addon: addonConfig });

  // Keep ref updated for use in realtime callback
  useEffect(() => { conversationsRef.current = conversations; }, [conversations]);

  const fetchConversations = useCallback(async () => {
    if (!tenantId) return;

    let trackingQuery = supabase
      .from("client_tracking")
      .select("id, numero_contrato, nome_cliente")
      .order("updated_at", { ascending: false });
    if (tenantId) trackingQuery = trackingQuery.eq("tenant_id", tenantId);
    const { data: trackings } = await trackingQuery;

    if (!trackings) { setLoading(false); return; }

    const { data: unreadData } = await supabase
      .from("tracking_messages")
      .select("tracking_id")
      .eq("remetente_tipo", "cliente")
      .eq("lida", false);

    const unreadMap: Record<string, number> = {};
    (unreadData || []).forEach((m: any) => {
      unreadMap[m.tracking_id] = (unreadMap[m.tracking_id] || 0) + 1;
    });

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
        if (a.unread_count > 0 && b.unread_count === 0) return -1;
        if (b.unread_count > 0 && a.unread_count === 0) return 1;
        return (b.last_message_at || "").localeCompare(a.last_message_at || "");
      });

    setConversations(result);
    setLoading(false);
  }, [tenantId]);

  useEffect(() => { fetchConversations(); }, [fetchConversations]);

  // AI auto-suggestion with debounce — now fetches recent messages for context
  const triggerAI = useCallback(async (conv: ChatConversation, forceRefresh = false) => {
    if (!addon?.ativo) return;
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      // Fetch recent messages for context
      const { data: recentMsgs } = await supabase
        .from("tracking_messages")
        .select("mensagem, remetente_tipo")
        .eq("tracking_id", conv.id)
        .order("created_at", { ascending: false })
        .limit(10);

      const messages = ((recentMsgs as any[]) || []).reverse();

      generate(
        {
          id: conv.id,
          nome: conv.nome_cliente,
          status: "em_negociacao",
          updated_at: conv.last_message_at || new Date().toISOString(),
        },
        null,
        messages,
        { forceRefresh },
      );
    }, forceRefresh ? 300 : 800);
  }, [addon, generate]);

  // Realtime: new client messages → notify + auto-pilot
  useEffect(() => {
    const channel = supabase
      .channel("vendazap-chat-list")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "tracking_messages" },
        async (payload) => {
          const msg = payload.new as any;
          if (msg.remetente_tipo === "cliente") {
            const conv = conversationsRef.current.find((c) => c.id === msg.tracking_id);
            playLeadNotificationSound(conv?.lead_temperature);

            if (!selected || selected.id !== msg.tracking_id) {
              const tempEmoji = conv?.lead_temperature === "quente" ? "🔥" : conv?.lead_temperature === "morno" ? "🟡" : "❄️";
              toast.info(`${tempEmoji} Nova mensagem de cliente!`, {
                description: msg.mensagem?.substring(0, 50),
                duration: conv?.lead_temperature === "quente" ? 8000 : 4000,
              });
            }

            // Re-trigger AI with fresh context for the selected conversation
            if (selected && selected.id === msg.tracking_id) {
              triggerAI(selected, true);
            }

            // AUTO-PILOT: process the message automatically
            if (autoPilotActive && conv) {
              const { data: recentMsgs } = await supabase
                .from("tracking_messages")
                .select("mensagem, remetente_tipo")
                .eq("tracking_id", msg.tracking_id)
                .order("created_at", { ascending: false })
                .limit(5);

              const result = await autoPilotProcess(
                msg.tracking_id,
                msg.mensagem || "",
                conv.nome_cliente,
                conv.lead_temperature,
                ((recentMsgs as any[]) || []).reverse()
              );

              if (result) {
                toast.success(`🤖 Auto-Pilot respondeu ${conv.nome_cliente}`, {
                  description: `Intenção: ${result.intencao} | ${result.tokensUsed} tokens`,
                  duration: 5000,
                });
              }
            }

            fetchConversations();
          }
        }
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [selected, fetchConversations, autoPilotActive, autoPilotProcess, triggerAI]);

  const handleSelectConversation = (conv: ChatConversation) => {
    setSelected(conv);
    setInputValue("");
    clear();
    triggerAI(conv);
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

  const handleStartConversation = useCallback(async (trackingId: string, clientName: string, contractNumber: string) => {
    setShowStartModal(false);

    // Check if conversation already exists in the list
    const existing = conversations.find((c) => c.id === trackingId);
    if (existing) {
      handleSelectConversation(existing);
      return;
    }

    // Send a system message to initialize the conversation
    const { error } = await supabase.from("tracking_messages").insert({
      tracking_id: trackingId,
      mensagem: `Conversa iniciada por ${currentUser?.nome_completo || "Usuário"}`,
      remetente_tipo: "loja",
      remetente_nome: currentUser?.nome_completo || "Loja",
      lida: true,
    });

    if (error) {
      toast.error("Erro ao iniciar conversa");
      return;
    }

    toast.success(`Conversa com ${clientName} iniciada!`);
    await fetchConversations();

    // Select the new conversation
    const newConv: ChatConversation = {
      id: trackingId,
      numero_contrato: contractNumber,
      nome_cliente: clientName,
      unread_count: 0,
    };
    handleSelectConversation(newConv);
  }, [conversations, currentUser, fetchConversations]);

  const existingConvIds = useMemo(() => new Set(conversations.map((c) => c.id)), [conversations]);

  return (
    <div className="flex h-[calc(100vh-140px)] rounded-lg border border-border overflow-hidden bg-background shadow-sm">
      {/* Conversation list */}
      <div className={`w-72 shrink-0 ${selected ? "hidden md:flex md:flex-col" : "flex flex-col w-full md:w-72"}`}>
        <ChatConversationList
          conversations={conversations}
          selectedId={selected?.id || null}
          onSelect={handleSelectConversation}
          loading={loading}
          onStartConversation={() => setShowStartModal(true)}
        />
      </div>

      {/* Chat window */}
      <div className={`flex-1 ${selected ? "flex flex-col" : "hidden md:flex md:flex-col md:items-center md:justify-center"}`}>
        {selected ? (
          <>
            <AutoPilotPanel
              settings={autoPilotSettings}
              isActive={autoPilotActive}
              onToggle={toggleAutoPilot}
              onUpdateSettings={updateAutoPilotSettings}
            />
            <ChatWindow
              conversation={selected}
              onBack={() => { setSelected(null); clear(); fetchConversations(); }}
              onStartDealRoom={onDealRoom ? handleDealRoom : undefined}
              aiSuggestion={suggestion}
              aiLoading={aiLoading}
              aiTipoCopy={tipoCopy}
              aiDiscProfile={discProfile}
              onUseSuggestion={handleUseSuggestion}
              inputValue={inputValue}
              onInputChange={setInputValue}
              userId={userId}
              tenantId={tenantId}
            />
          </>
        ) : (
          <div className="text-center p-8 text-muted-foreground">
            <p className="text-lg font-medium mb-1">VendaZap AI Chat</p>
            <p className="text-sm">Selecione uma conversa para começar</p>
          </div>
        )}
      </div>

      {/* Start Conversation Modal */}
      <StartConversationModal
        open={showStartModal}
        onClose={() => setShowStartModal(false)}
        onSelect={handleStartConversation}
        tenantId={tenantId}
        currentUserName={currentUser?.nome_completo || null}
        currentUserRole={currentUser?.cargo_nome || null}
        existingConversationIds={existingConvIds}
      />
    </div>
  );
}
