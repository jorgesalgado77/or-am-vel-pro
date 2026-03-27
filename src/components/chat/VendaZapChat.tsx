import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { supabase } from "@/lib/supabaseClient";
import { useAutoSuggestion } from "@/hooks/useAutoSuggestion";
import { useVendaZap } from "@/hooks/useVendaZap";
import { useAutoPilot } from "@/hooks/useAutoPilot";
import { useCurrentUser } from "@/hooks/useCurrentUser";
import { useWhatsAppSimulator } from "@/hooks/useWhatsAppSimulator";
import { useIsMobile } from "@/hooks/use-mobile";
import { playLeadNotificationSound } from "@/lib/notificationSound";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Wifi, WifiOff, Loader2, Brain, Phone } from "lucide-react";
import { ChatConversationList } from "./ChatConversationList";
import { ChatWindow } from "./ChatWindow";
import { AutoPilotPanel } from "./AutoPilotPanel";
import { WhatsAppSimulatorPanel } from "./WhatsAppSimulatorPanel";
import { SimulatorMetricsPanel } from "./SimulatorMetricsPanel";
import { StartConversationModal } from "./StartConversationModal";
import { ChatRightPanel } from "./ChatRightPanel";
import { WhatsAppContactsList } from "./WhatsAppContactsList";
import type { ChatConversation } from "./types";

type WhatsAppConnectionStatus = "checking" | "online" | "offline" | "not_configured";

function useWhatsAppConnectionStatus(tenantId: string | null) {
  const [status, setStatus] = useState<WhatsAppConnectionStatus>("checking");
  const [provider, setProvider] = useState<string | null>(null);

  useEffect(() => {
    if (!tenantId) { setStatus("not_configured"); return; }

    const checkConnection = async () => {
      setStatus("checking");

      // Read whatsapp_settings
      let response = await supabase
        .from("whatsapp_settings")
        .select("*")
        .limit(1)
        .maybeSingle();

      // If tenant_id filter fails, retry without it
      if (response.error?.code === "42703" || response.error?.code === "PGRST204") {
        response = await supabase
          .from("whatsapp_settings")
          .select("*")
          .limit(1)
          .maybeSingle();
      }

      const settings = response.data as any;

      if (!settings || !settings.ativo) {
        setStatus("not_configured");
        return;
      }

      setProvider(settings.provider);

      if (settings.provider === "zapi" && settings.zapi_instance_id && settings.zapi_token && settings.zapi_client_token) {
        try {
          const res = await fetch(
            `https://api.z-api.io/instances/${settings.zapi_instance_id}/token/${settings.zapi_token}/status`,
            {
              headers: {
                "Client-Token": settings.zapi_client_token,
                ...(settings.zapi_security_token ? { "Security-Token": settings.zapi_security_token } : {}),
              },
            }
          );
          const data = await res.json().catch(() => null);
          const connected =
            data?.connected === true ||
            data?.smartphoneConnected === true ||
            (typeof data?.error === "string" && data.error.toLowerCase().includes("already connected"));
          setStatus(connected ? "online" : "offline");
        } catch {
          setStatus("offline");
        }
      } else if (settings.provider === "evolution" && settings.evolution_api_url && settings.evolution_api_key) {
        try {
          const instanceName = settings.evolution_instance_name || "default";
          const res = await fetch(
            `${settings.evolution_api_url.replace(/\/$/, "")}/instance/connectionState/${instanceName}`,
            { headers: { apikey: settings.evolution_api_key } }
          );
          const data = await res.json().catch(() => null);
          const state = data?.instance?.state || data?.state || "";
          setStatus(state === "open" || state === "connected" ? "online" : "offline");
        } catch {
          setStatus("offline");
        }
      } else {
        setStatus("not_configured");
      }
    };

    checkConnection();
    // Re-check every 60 seconds
    const interval = setInterval(checkConnection, 60000);
    return () => clearInterval(interval);
  }, [tenantId]);

  return { status, provider };
}

function WhatsAppStatusTag({ status, provider }: { status: WhatsAppConnectionStatus; provider: string | null }) {
  if (status === "checking") {
    return (
      <Badge variant="outline" className="gap-1.5 text-[10px] px-2 py-0.5 border-muted-foreground/30 text-muted-foreground animate-pulse">
        <Loader2 className="h-3 w-3 animate-spin" />
        Verificando...
      </Badge>
    );
  }
  if (status === "online") {
    const label = provider === "zapi" ? "Z-API Online" : provider === "evolution" ? "Evolution Online" : "WhatsApp Online";
    return (
      <Badge className="gap-1.5 text-[10px] px-2 py-0.5 bg-emerald-500/15 text-emerald-700 border border-emerald-500/30 hover:bg-emerald-500/20">
        <Wifi className="h-3 w-3" />
        {label}
      </Badge>
    );
  }
  if (status === "offline") {
    const label = provider === "zapi" ? "Z-API Offline" : provider === "evolution" ? "Evolution Offline" : "WhatsApp Offline";
    return (
      <Badge variant="destructive" className="gap-1.5 text-[10px] px-2 py-0.5">
        <WifiOff className="h-3 w-3" />
        {label}
      </Badge>
    );
  }
  return (
    <Badge variant="outline" className="gap-1.5 text-[10px] px-2 py-0.5 text-muted-foreground">
      <WifiOff className="h-3 w-3" />
      Não configurado
    </Badge>
  );
}

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
  const [mobileAiOpen, setMobileAiOpen] = useState(false);
  const debounceRef = useRef<NodeJS.Timeout | null>(null);
  const conversationsRef = useRef<ChatConversation[]>([]);

  const isMobile = useIsMobile();
  const { currentUser } = useCurrentUser();
  const { status: whatsappStatus, provider: whatsappProvider } = useWhatsAppConnectionStatus(tenantId);
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

  const {
    config: simConfig,
    updateConfig: updateSimConfig,
    scheduleSimulatedReply,
    sendSimulatedMessage,
    isSimulating,
    cleanup: cleanupSim,
  } = useWhatsAppSimulator(tenantId);

  // Keep ref updated for use in realtime callback
  useEffect(() => { conversationsRef.current = conversations; }, [conversations]);

  // Cleanup simulator on unmount
  useEffect(() => () => cleanupSim(), [cleanupSim]);

  const isAdminOrManager = currentUser?.cargo_nome
    ? ["administrador", "gerente", "admin"].includes(currentUser.cargo_nome.toLowerCase())
    : false;

  const fetchConversations = useCallback(async () => {
    if (!tenantId) return;

    // Fetch client_tracking with client_id
    const { data: trackings } = await supabase
      .from("client_tracking")
      .select("id, numero_contrato, nome_cliente, client_id, projetista")
      .eq("tenant_id", tenantId)
      .order("updated_at", { ascending: false });

    // Also fetch clients directly to ensure we have all available clients
    const { data: allClients } = await supabase
      .from("clients")
      .select("id, nome, numero_orcamento, vendedor, status")
      .eq("tenant_id", tenantId)
      .in("status", ["novo", "em_negociacao", "proposta_enviada", "expirado", "fechado"]);

    // Build vendedor map from clients
    let vendedorMap: Record<string, { vendedor: string | null }> = {};
    (allClients || []).forEach((c: any) => {
      vendedorMap[c.id] = { vendedor: c.vendedor };
    });

    // Build tracking entries — merge client_tracking with clients fallback
    let allEntries: Array<{ id: string; nome_cliente: string; numero_contrato: string; client_id: string; projetista?: string; isClientDirect?: boolean }> = [];

    if (trackings && trackings.length > 0) {
      allEntries = (trackings as any[]).map(t => ({
        id: t.id,
        nome_cliente: t.nome_cliente,
        numero_contrato: t.numero_contrato,
        client_id: t.client_id,
        projetista: t.projetista,
      }));
    }

    // Add clients that don't have a tracking record
    const trackedClientIds = new Set(allEntries.map(t => t.client_id));
    (allClients || []).forEach((c: any) => {
      if (!trackedClientIds.has(c.id)) {
        allEntries.push({
          id: c.id, // Will use client ID — handleStartConversation creates tracking
          nome_cliente: c.nome,
          numero_contrato: c.numero_orcamento || "",
          client_id: c.id,
          isClientDirect: true,
        });
      }
    });

    // Role-based filtering
    let filteredEntries = allEntries;
    if (!isAdminOrManager && currentUser?.nome_completo) {
      const nameLower = currentUser.nome_completo.toLowerCase();
      filteredEntries = allEntries.filter(t =>
        vendedorMap[t.client_id]?.vendedor?.toLowerCase() === nameLower ||
        (t.projetista && t.projetista.toLowerCase() === nameLower)
      );
    }

    if (filteredEntries.length === 0) { setConversations([]); setLoading(false); return; }

    // Only query messages for entries that have tracking records (not direct client IDs)
    const trackingOnlyIds = filteredEntries.filter(t => !t.isClientDirect).map(t => t.id);

    let unreadMap: Record<string, number> = {};
    let lastMsgMap: Record<string, { msg: string; at: string }> = {};

    if (trackingOnlyIds.length > 0) {
      const { data: unreadData } = await supabase
        .from("tracking_messages")
        .select("tracking_id")
        .eq("remetente_tipo", "cliente")
        .eq("lida", false)
        .in("tracking_id", trackingOnlyIds);

      (unreadData || []).forEach((m: any) => {
        unreadMap[m.tracking_id] = (unreadMap[m.tracking_id] || 0) + 1;
      });

      const { data: lastMsgs } = await supabase
        .from("tracking_messages")
        .select("tracking_id, mensagem, created_at")
        .in("tracking_id", trackingOnlyIds)
        .order("created_at", { ascending: false });

      (lastMsgs || []).forEach((m: any) => {
        if (!lastMsgMap[m.tracking_id]) {
          lastMsgMap[m.tracking_id] = { msg: m.mensagem?.substring(0, 60) || "", at: m.created_at };
        }
      });
    }

    const hasMessages = new Set(Object.keys(lastMsgMap));

    // Show: entries with messages, entries with unread, AND all direct client entries (so they appear in the list)
    const result: ChatConversation[] = filteredEntries
      .filter((t) => hasMessages.has(t.id) || (unreadMap[t.id] || 0) > 0 || t.isClientDirect)
      .map((t) => ({
        id: t.id,
        numero_contrato: t.numero_contrato,
        nome_cliente: t.nome_cliente,
        unread_count: unreadMap[t.id] || 0,
        last_message: lastMsgMap[t.id]?.msg || (t.isClientDirect ? "Clique para iniciar conversa" : undefined),
        last_message_at: lastMsgMap[t.id]?.at,
        vendedor_nome: vendedorMap[t.client_id]?.vendedor || null,
        isClientDirect: t.isClientDirect || false,
        client_id: t.client_id,
      }))
      .sort((a, b) => {
        if (a.unread_count > 0 && b.unread_count === 0) return -1;
        if (b.unread_count > 0 && a.unread_count === 0) return 1;
        return (b.last_message_at || "").localeCompare(a.last_message_at || "");
      });

    setConversations(result);
    setLoading(false);
  }, [tenantId, isAdminOrManager, currentUser?.nome_completo]);

  useEffect(() => { fetchConversations(); }, [fetchConversations]);

  // AI auto-suggestion with debounce
  const triggerAI = useCallback(async (conv: ChatConversation, forceRefresh = false) => {
    if (!addon?.ativo) return;
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
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

            if (selected && selected.id === msg.tracking_id) {
              triggerAI(selected, true);
            }

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

  const handleSelectConversation = useCallback(async (conv: ChatConversation) => {
    // If this is a direct client without a tracking record, create one first
    if (conv.isClientDirect) {
      const clientId = conv.client_id || conv.id;
      
      // Check if a client_tracking record already exists for this client
      const { data: existingTracking } = await supabase
        .from("client_tracking")
        .select("id")
        .eq("client_id", clientId)
        .maybeSingle();

      let trackingId = existingTracking?.id;

      if (!trackingId) {
        const { data: newTracking, error: trackError } = await supabase
          .from("client_tracking")
          .insert({
            client_id: clientId,
            nome_cliente: conv.nome_cliente,
            numero_contrato: conv.numero_contrato || `CHAT-${Date.now()}`,
            tenant_id: tenantId,
            status: "em_negociacao",
          })
          .select("id")
          .single();

        if (trackError || !newTracking) {
          toast.error("Erro ao criar registro de conversa");
          console.error("client_tracking insert error:", trackError);
          return;
        }
        trackingId = newTracking.id;
      }

      // Update conv with the real tracking ID
      const updatedConv: ChatConversation = {
        ...conv,
        id: trackingId,
        isClientDirect: false,
      };

      setSelected(updatedConv);
      setInputValue("");
      clear();
      triggerAI(updatedConv);
      // Refresh conversations to get the updated list
      fetchConversations();
      return;
    }

    setSelected(conv);
    setInputValue("");
    clear();
    triggerAI(conv);
    setConversations((prev) =>
      prev.map((c) => (c.id === conv.id ? { ...c, unread_count: 0 } : c))
    );
  }, [tenantId, clear, triggerAI, fetchConversations]);

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

    let actualTrackingId = trackingId;

    // Check if a client_tracking record exists for this ID
    const { data: existingTracking } = await supabase
      .from("client_tracking")
      .select("id")
      .eq("id", trackingId)
      .maybeSingle();

    if (!existingTracking) {
      // trackingId is a client ID — create a client_tracking record
      const { data: newTracking, error: trackError } = await supabase
        .from("client_tracking")
        .insert({
          client_id: trackingId,
          nome_cliente: clientName,
          numero_contrato: contractNumber || `CHAT-${Date.now()}`,
          tenant_id: tenantId,
          status: "em_negociacao",
        })
        .select("id")
        .single();

      if (trackError || !newTracking) {
        toast.error("Erro ao criar registro de conversa");
        console.error("client_tracking insert error:", trackError);
        return;
      }
      actualTrackingId = newTracking.id;
    }

    // Send a system message to initialize the conversation
    const { error } = await supabase.from("tracking_messages").insert({
      tracking_id: actualTrackingId,
      mensagem: `Conversa iniciada por ${currentUser?.nome_completo || "Usuário"}`,
      remetente_tipo: "loja",
      remetente_nome: currentUser?.nome_completo || "Loja",
      lida: true,
      tenant_id: tenantId,
    });

    if (error) {
      toast.error("Erro ao iniciar conversa");
      console.error("tracking_messages insert error:", error);
      return;
    }

    toast.success(`Conversa com ${clientName} iniciada!`);
    await fetchConversations();

    // Select the new conversation
    const newConv: ChatConversation = {
      id: actualTrackingId,
      numero_contrato: contractNumber,
      nome_cliente: clientName,
      unread_count: 0,
    };
    handleSelectConversation(newConv);
  }, [conversations, currentUser, fetchConversations, tenantId]);

  const existingConvIds = useMemo(() => new Set(conversations.map((c) => c.id)), [conversations]);

  // Handle store message sent — trigger simulator reply
  const handleMessageSent = useCallback((message: string) => {
    if (isSimulating && selected) {
      scheduleSimulatedReply(selected.id, selected.nome_cliente, message);
    }
  }, [isSimulating, selected, scheduleSimulatedReply]);

  // Manual simulated message
  const handleSendSimulated = useCallback(async (customMessage?: string) => {
    if (!selected) return false;
    return sendSimulatedMessage(selected.id, selected.nome_cliente, customMessage);
  }, [selected, sendSimulatedMessage]);

  return (
    <div className="flex flex-col h-[calc(100vh-140px)] rounded-lg border border-border overflow-hidden bg-background shadow-sm">
      {/* WhatsApp Connection Status Bar */}
      <div className="flex items-center justify-between px-3 py-1.5 border-b border-border bg-muted/30">
        <span className="text-xs font-medium text-foreground">Chat de Vendas</span>
        <WhatsAppStatusTag status={whatsappStatus} provider={whatsappProvider} />
      </div>
      <div className="flex flex-1 min-h-0 overflow-hidden">
      {/* Conversation list */}
      <div className={`w-72 shrink-0 ${selected ? "hidden md:flex md:flex-col" : "flex flex-col w-full md:w-72"} overflow-hidden`}>
        {/* Simulator Panel — fixed at top */}
        <WhatsAppSimulatorPanel
          config={simConfig}
          onUpdateConfig={updateSimConfig}
          onSendManual={handleSendSimulated}
          hasSelectedConversation={!!selected}
        />
        {/* Scrollable area for metrics + conversations */}
        <div className="flex-1 overflow-y-auto min-h-0">
          {simConfig.enabled && (
            <div className="px-2 py-2 border-b border-border">
              <SimulatorMetricsPanel />
            </div>
          )}
          <ChatConversationList
            conversations={conversations}
            selectedId={selected?.id || null}
            onSelect={handleSelectConversation}
            loading={loading}
            onStartConversation={() => setShowStartModal(true)}
            currentUserName={currentUser?.nome_completo || null}
            isAdminOrManager={isAdminOrManager}
          />
        </div>
      </div>

      {/* Chat window + Right panel */}
      <div className={`flex-1 min-h-0 ${selected ? "flex" : "hidden md:flex md:items-center md:justify-center"}`}>
        {selected ? (
          <>
            <div className="flex-1 flex flex-col min-h-0 min-w-0 relative">
              <AutoPilotPanel
                settings={autoPilotSettings}
                isActive={autoPilotActive}
                onToggle={toggleAutoPilot}
                onUpdateSettings={updateAutoPilotSettings}
              />
              {isMobile && (
                <Button
                  type="button"
                  size="sm"
                  className="fixed bottom-20 right-4 z-40 h-10 rounded-full shadow-lg gap-2 md:hidden"
                  onClick={() => setMobileAiOpen((prev) => !prev)}
                >
                  <Brain className="h-4 w-4" />
                  IA
                </Button>
              )}
              <ChatWindow
                conversation={selected}
                onBack={() => { setSelected(null); setMobileAiOpen(false); clear(); fetchConversations(); }}
                onStartDealRoom={onDealRoom ? handleDealRoom : undefined}
                inputValue={inputValue}
                onInputChange={setInputValue}
                userId={userId}
                tenantId={tenantId}
                onMessageSent={handleMessageSent}
              />
            </div>
            <ChatRightPanel
              conversation={selected}
              tenantId={tenantId}
              messageCount={0}
              aiSuggestion={suggestion}
              aiLoading={aiLoading}
              aiTipoCopy={tipoCopy}
              aiDiscProfile={discProfile}
              onUseSuggestion={handleUseSuggestion}
              isMobile={isMobile}
              mobileOpen={mobileAiOpen}
              onMobileOpenChange={setMobileAiOpen}
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
        currentUserId={userId || currentUser?.id || null}
        existingConversationIds={existingConvIds}
      />
      </div>
    </div>
  );
}
