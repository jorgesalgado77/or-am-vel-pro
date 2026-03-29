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
import { Wifi, WifiOff, Loader2, Brain, Phone, Trash2 } from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
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
  const syncedWebhookRef = useRef<string | null>(null);

  useEffect(() => {
    if (!tenantId) { setStatus("not_configured"); return; }

    const checkConnection = async () => {
      setStatus("checking");

      let response = await supabase
        .from("whatsapp_settings")
        .select("*")
        .limit(1)
        .maybeSingle();

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
          if (settings.zapi_webhook_url) {
            const syncKey = `${settings.zapi_instance_id}:${settings.zapi_webhook_url}`;
            if (syncedWebhookRef.current !== syncKey) {
              const syncRes = await fetch(
                `https://api.z-api.io/instances/${settings.zapi_instance_id}/token/${settings.zapi_token}/update-webhook-received-delivery`,
                {
                  method: "PUT",
                  headers: {
                    "Content-Type": "application/json",
                    "Client-Token": settings.zapi_client_token,
                    ...(settings.zapi_security_token ? { "Security-Token": settings.zapi_security_token } : {}),
                  },
                  body: JSON.stringify({ value: settings.zapi_webhook_url }),
                }
              );

              if (syncRes.ok) {
                syncedWebhookRef.current = syncKey;
              }
            }
          }

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
  const [showWhatsAppContacts, setShowWhatsAppContacts] = useState(false);
  const [pendingLeadConv, setPendingLeadConv] = useState<ChatConversation | null>(null);
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

  const normalizePhone = useCallback((value?: string | null) => (value || "").replace(/\D/g, ""), []);

  const fetchConversations = useCallback(async () => {
    if (!tenantId) return;

    const normalizePhoneValue = (value?: string | null) => (value || "").replace(/\D/g, "");

    // Fetch client_tracking with client_id
    const { data: trackings } = await supabase
      .from("client_tracking")
      .select("id, numero_contrato, nome_cliente, client_id, projetista")
      .eq("tenant_id", tenantId)
      .order("updated_at", { ascending: false });

    // Also fetch clients directly to ensure we have all available clients
    const { data: allClients } = await supabase
      .from("clients")
      .select("id, nome, numero_orcamento, vendedor, status, telefone1, telefone2")
      .eq("tenant_id", tenantId)
      .in("status", ["novo", "em_negociacao", "proposta_enviada", "expirado", "fechado"]);

    const clientDataMap: Record<string, { vendedor: string | null; telefone: string | null; telefones: string[] }> = {};
    const phoneToClientIds = new Map<string, string[]>();

    (allClients || []).forEach((c: any) => {
      const phones = [c.telefone1, c.telefone2]
        .map((phone: string | null | undefined) => normalizePhoneValue(phone))
        .filter(Boolean);

      clientDataMap[c.id] = {
        vendedor: c.vendedor || null,
        telefone: c.telefone1 || c.telefone2 || null,
        telefones: phones,
      };

      phones.forEach((phone) => {
        const existing = phoneToClientIds.get(phone) || [];
        if (!existing.includes(c.id)) {
          phoneToClientIds.set(phone, [...existing, c.id]);
        }
      });
    });

    type Entry = {
      id: string;
      nome_cliente: string;
      numero_contrato: string;
      client_id: string;
      projetista?: string;
      isClientDirect?: boolean;
      groupKey: string;
      relatedTrackingIds: string[];
      phone?: string;
    };

    let allEntries: Entry[] = [];

    if (trackings && trackings.length > 0) {
      allEntries = (trackings as any[]).map((t) => {
        const clientPhones = clientDataMap[t.client_id]?.telefones || [];
        const contractPhone = t.numero_contrato?.startsWith("WA-")
          ? normalizePhoneValue(t.numero_contrato.replace("WA-", ""))
          : "";
        const canonicalPhone = clientPhones[0] || contractPhone;

        return {
          id: t.id,
          nome_cliente: t.nome_cliente,
          numero_contrato: t.numero_contrato,
          client_id: t.client_id,
          projetista: t.projetista,
          groupKey: canonicalPhone || `client:${t.client_id || t.id}`,
          relatedTrackingIds: [t.id],
          phone: canonicalPhone || clientDataMap[t.client_id]?.telefone || undefined,
        };
      });
    }

    const trackedClientIds = new Set(allEntries.map((t) => t.client_id).filter(Boolean));
    (allClients || []).forEach((c: any) => {
      if (!trackedClientIds.has(c.id)) {
        const canonicalPhone = normalizePhoneValue(c.telefone1 || c.telefone2 || "");
        allEntries.push({
          id: c.id,
          nome_cliente: c.nome,
          numero_contrato: c.numero_orcamento || "",
          client_id: c.id,
          isClientDirect: true,
          groupKey: canonicalPhone || `client:${c.id}`,
          relatedTrackingIds: [],
          phone: canonicalPhone || undefined,
        });
      }
    });

    let filteredEntries = allEntries;
    if (!isAdminOrManager && currentUser?.nome_completo) {
      const nameLower = currentUser.nome_completo.toLowerCase();
      filteredEntries = allEntries.filter((t) =>
        clientDataMap[t.client_id]?.vendedor?.toLowerCase() === nameLower ||
        (t.projetista && t.projetista.toLowerCase() === nameLower)
      );
    }

    if (filteredEntries.length === 0) { setConversations([]); setLoading(false); return; }

    const groupedEntries = new Map<string, Entry>();
    filteredEntries.forEach((entry) => {
      const existing = groupedEntries.get(entry.groupKey);
      if (!existing) {
        groupedEntries.set(entry.groupKey, { ...entry });
        return;
      }

      const mergedTrackingIds = Array.from(new Set([
        ...existing.relatedTrackingIds,
        ...entry.relatedTrackingIds,
      ]));

      const existingHasMessages = existing.relatedTrackingIds.length > 0;
      const entryHasMessages = entry.relatedTrackingIds.length > 0;
      const preferred = !existingHasMessages && entryHasMessages ? entry : existing;

      groupedEntries.set(entry.groupKey, {
        ...preferred,
        client_id: preferred.client_id || existing.client_id || entry.client_id,
        isClientDirect: existing.isClientDirect && entry.isClientDirect,
        relatedTrackingIds: mergedTrackingIds,
        phone: preferred.phone || existing.phone || entry.phone,
      });
    });

    const mergedEntries = Array.from(groupedEntries.values());
    const trackingOnlyIds = Array.from(new Set(mergedEntries.flatMap((entry) => entry.relatedTrackingIds)));

    const trackingToGroupKey = new Map<string, string>();
    mergedEntries.forEach((entry) => {
      entry.relatedTrackingIds.forEach((trackingId) => {
        trackingToGroupKey.set(trackingId, entry.groupKey);
      });
    });

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
        const groupKey = trackingToGroupKey.get(m.tracking_id);
        if (!groupKey) return;
        unreadMap[groupKey] = (unreadMap[groupKey] || 0) + 1;
      });

      const { data: lastMsgs } = await supabase
        .from("tracking_messages")
        .select("tracking_id, mensagem, created_at, anexo_nome")
        .in("tracking_id", trackingOnlyIds)
        .order("created_at", { ascending: false });

      (lastMsgs || []).forEach((m: any) => {
        const groupKey = trackingToGroupKey.get(m.tracking_id);
        if (!groupKey || lastMsgMap[groupKey]) return;
        lastMsgMap[groupKey] = {
          msg: (m.mensagem || m.anexo_nome || "[Mídia]").substring(0, 60),
          at: m.created_at,
        };
      });
    }

    const hasMessages = new Set(Object.keys(lastMsgMap));

    const result: ChatConversation[] = mergedEntries
      .filter((entry) => hasMessages.has(entry.groupKey) || (unreadMap[entry.groupKey] || 0) > 0 || entry.isClientDirect)
      .map((entry) => ({
        id: entry.id,
        numero_contrato: entry.numero_contrato,
        nome_cliente: entry.nome_cliente,
        unread_count: unreadMap[entry.groupKey] || 0,
        last_message: lastMsgMap[entry.groupKey]?.msg || (entry.isClientDirect ? "Clique para iniciar conversa" : undefined),
        last_message_at: lastMsgMap[entry.groupKey]?.at,
        vendedor_nome: clientDataMap[entry.client_id]?.vendedor || null,
        isClientDirect: entry.isClientDirect || false,
        client_id: entry.client_id,
        phone: entry.phone || clientDataMap[entry.client_id]?.telefone || undefined,
        relatedTrackingIds: entry.relatedTrackingIds,
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

  // Realtime: espelhar mensagens recebidas e enviadas
  useEffect(() => {
    const channel = supabase
      .channel("vendazap-chat-list")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "tracking_messages" },
        async (payload) => {
          const msg = payload.new as any;

          let conv = conversationsRef.current.find((c) => c.id === msg.tracking_id);

          if (!conv && msg.tracking_id) {
            const { data: trackingRow } = await supabase
              .from("client_tracking")
              .select("client_id")
              .eq("id", msg.tracking_id)
              .maybeSingle();

            if (trackingRow?.client_id) {
              conv = conversationsRef.current.find((c) => c.client_id === trackingRow.client_id);
            }
          }

          const isSelectedConversation = Boolean(
            selected && (selected.id === msg.tracking_id || (conv && selected.id === conv.id))
          );

          if (msg.remetente_tipo === "cliente") {
            playLeadNotificationSound(conv?.lead_temperature);

            if (!isSelectedConversation) {
              const tempEmoji = conv?.lead_temperature === "quente" ? "🔥" : conv?.lead_temperature === "morno" ? "🟡" : "❄️";
              toast.info(`${tempEmoji} Nova mensagem de cliente!`, {
                description: msg.mensagem?.substring(0, 50),
                duration: conv?.lead_temperature === "quente" ? 8000 : 4000,
              });
            }

            if (selected && isSelectedConversation) {
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
          }

          fetchConversations();
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

    // Manual phone number flow (from "Novo Número" tab)
    const isManualWA = trackingId.startsWith("WA-");

    if (isManualWA) {
      const normalizedPhone = trackingId.replace("WA-", "").replace(/\D/g, "");
      // Check if conversation already exists for this phone
      const existingConv = conversations.find((c) => {
        const cPhone = normalizePhone(c.phone || (c.numero_contrato?.startsWith("WA-") ? c.numero_contrato.replace("WA-", "") : ""));
        return cPhone === normalizedPhone;
      });
      if (existingConv) {
        handleSelectConversation(existingConv);
        toast.info(`Conversa com ${clientName} já existe`);
        return;
      }

      try {
        // Check if client already exists — do NOT auto-create a lead
        let clientId: string | null = null;
        const { data: existing } = await supabase
          .from("clients")
          .select("id")
          .eq("tenant_id", tenantId)
          .eq("numero_orcamento", contractNumber)
          .limit(1);
        clientId = ((existing as any[]) || [])[0]?.id || null;

        // Create tracking
        const { data: tracking, error: trackErr } = await supabase
          .from("client_tracking")
          .insert({
            tenant_id: tenantId,
            client_id: clientId,
            nome_cliente: clientName,
            numero_contrato: contractNumber,
            status: "em_negociacao",
          } as any)
          .select("id")
          .maybeSingle();

        let trackId = tracking?.id;
        if (trackErr || !trackId) {
          const { data: existT } = await supabase
            .from("client_tracking")
            .select("id")
            .eq("tenant_id", tenantId)
            .eq("numero_contrato", contractNumber)
            .limit(1);
          trackId = ((existT as any[]) || [])[0]?.id;
        }

        if (!trackId) {
          toast.error("Erro ao criar conversa");
          return;
        }

        // Send initial message
        await supabase.from("tracking_messages").insert({
          tracking_id: trackId,
          mensagem: `Conversa iniciada por ${currentUser?.nome_completo || "Usuário"}`,
          remetente_tipo: "loja",
          remetente_nome: currentUser?.nome_completo || "Loja",
          lida: true,
          tenant_id: tenantId,
        });

        toast.success(`Conversa com ${clientName} iniciada!`);
        await fetchConversations();

        const newConv: ChatConversation = {
          id: trackId,
          numero_contrato: contractNumber,
          nome_cliente: clientName,
          unread_count: 0,
          phone: normalizedPhone,
        };
        handleSelectConversation(newConv);
      } catch (err) {
        console.error("[Manual WA] error:", err);
        toast.error("Erro inesperado ao criar conversa");
      }
      return;
    }

    // Standard client flow
    const existing = conversations.find((c) => c.id === trackingId);
    if (existing) {
      handleSelectConversation(existing);
      return;
    }

    let actualTrackingId = trackingId;

    const { data: existingTracking } = await supabase
      .from("client_tracking")
      .select("id")
      .eq("id", trackingId)
      .maybeSingle();

    if (!existingTracking) {
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

    const newConv: ChatConversation = {
      id: actualTrackingId,
      numero_contrato: contractNumber,
      nome_cliente: clientName,
      unread_count: 0,
    };
    handleSelectConversation(newConv);
  }, [conversations, currentUser, fetchConversations, tenantId, normalizePhone]);

  // Delete conversation state — rich confirmation dialog
  const [deleteTarget, setDeleteTarget] = useState<ChatConversation | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [deletedIds, setDeletedIds] = useState<Set<string>>(new Set());

  const handleDeleteConversation = useCallback((conv: ChatConversation) => {
    if (!isAdminOrManager) return;
    setDeleteTarget(conv);
  }, [isAdminOrManager]);

  const confirmDelete = useCallback(async () => {
    if (!deleteTarget) return;
    setDeleting(true);

    try {
      const allTrackingIds = Array.from(new Set([
        deleteTarget.id,
        ...(deleteTarget.relatedTrackingIds || []),
      ]));

      for (const trackId of allTrackingIds) {
        await supabase.from("tracking_messages").delete().eq("tracking_id", trackId);
      }

      for (const trackId of allTrackingIds) {
        await supabase.from("client_tracking").delete().eq("id", trackId);
      }

      // Add to deletedIds for exit animation
      setDeletedIds((prev) => new Set([...prev, deleteTarget.id]));

      // Wait for animation, then remove from state
      setTimeout(() => {
        setConversations((prev) => prev.filter((c) => c.id !== deleteTarget.id));
        setDeletedIds((prev) => {
          const next = new Set(prev);
          next.delete(deleteTarget.id);
          return next;
        });
        if (selected?.id === deleteTarget.id) setSelected(null);
        fetchConversations();
      }, 400);

      toast.success(`Conversa com "${deleteTarget.nome_cliente}" excluída completamente`);
    } catch (err) {
      console.error("Delete conversation error:", err);
      toast.error("Erro ao excluir conversa");
    } finally {
      setDeleting(false);
      setDeleteTarget(null);
    }
  }, [deleteTarget, selected, fetchConversations]);

  // Merge duplicate: keep chosen conversation, delete the other
  const handleMergeDuplicate = useCallback(async (keep: ChatConversation, remove: ChatConversation) => {
    if (!isAdminOrManager) return;

    try {
      const removeTrackingIds = Array.from(new Set([
        remove.id,
        ...(remove.relatedTrackingIds || []),
      ]));
      const keepTrackingIds = Array.from(new Set([
        keep.id,
        ...(keep.relatedTrackingIds || []),
      ]));

      // Move messages from removed tracking to the kept one (reassign tracking_id)
      for (const trackId of removeTrackingIds) {
        if (!keepTrackingIds.includes(trackId)) {
          await supabase
            .from("tracking_messages")
            .update({ tracking_id: keep.id } as any)
            .eq("tracking_id", trackId);
        }
      }

      // Delete the removed tracking records
      for (const trackId of removeTrackingIds) {
        if (!keepTrackingIds.includes(trackId)) {
          await supabase.from("client_tracking").delete().eq("id", trackId);
        }
      }

      if (selected?.id === remove.id) setSelected(keep);
      toast.success(`Conversas mescladas. "${keep.nome_cliente}" mantida.`);
      fetchConversations();
    } catch (err) {
      console.error("Merge duplicate error:", err);
      toast.error("Erro ao mesclar conversas");
    }
  }, [isAdminOrManager, selected, fetchConversations]);

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

  // Create lead from conversation (confirmation flow)
  const handleCreateLead = useCallback(async () => {
    const conv = pendingLeadConv || selected;
    if (!conv || !tenantId) return;
    try {
      const phone = conv.phone?.replace(/\D/g, "") || "";
      const { data: createdClient, error: clientError } = await supabase
        .from("clients")
        .insert({
          tenant_id: tenantId,
          nome: conv.nome_cliente,
          telefone1: phone,
          numero_orcamento: conv.numero_contrato || `WA-${phone}`,
          status: "novo",
          origem_lead: "CHAT DE VENDAS",
          vendedor: currentUser?.nome_completo || null,
        } as any)
        .select("id")
        .maybeSingle();

      if (clientError || !createdClient?.id) {
        toast.error("Erro ao criar lead");
        setPendingLeadConv(null);
        return;
      }

      // Link client to tracking
      await supabase
        .from("client_tracking")
        .update({ client_id: createdClient.id } as any)
        .eq("id", conv.id);

      const updatedConv = { ...conv, client_id: createdClient.id };
      setConversations(prev => prev.map(c => c.id === conv.id ? updatedConv : c));
      if (selected?.id === conv.id) setSelected(updatedConv);

      toast.success(`✅ Lead "${conv.nome_cliente}" criado! Origem: CHAT DE VENDAS`);
      fetchConversations();
    } catch (err) {
      toast.error("Erro ao criar lead");
    }
    setPendingLeadConv(null);
  }, [pendingLeadConv, selected, tenantId, currentUser, fetchConversations]);

  return (
    <div className="flex flex-col h-[calc(100vh-140px)] rounded-lg border border-border overflow-hidden bg-background shadow-sm">
      {/* WhatsApp Connection Status Bar */}
      <div className="flex items-center justify-between px-3 py-1.5 border-b border-border bg-muted/30">
        <span className="text-xs font-medium text-foreground">Chat de Vendas</span>
        <div className="flex items-center gap-2">
          {whatsappStatus === "online" && (
            <Button variant="ghost" size="sm" className="h-6 text-[10px] gap-1 px-2" onClick={() => setShowWhatsAppContacts(true)}>
              <Phone className="h-3 w-3" /> Contatos WA
            </Button>
          )}
          <WhatsAppStatusTag status={whatsappStatus} provider={whatsappProvider} />
        </div>
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
            onDelete={isAdminOrManager ? handleDeleteConversation : undefined}
            onMergeDuplicate={isAdminOrManager ? handleMergeDuplicate : undefined}
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
                onCreateLead={!selected.client_id ? () => setPendingLeadConv(selected) : undefined}
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

      {/* WhatsApp Contacts */}
      <WhatsAppContactsList
        tenantId={tenantId}
        open={showWhatsAppContacts}
        onClose={() => setShowWhatsAppContacts(false)}
        onStartChat={async (contact) => {
          if (!tenantId) {
            toast.error("Loja não identificada");
            return;
          }

          setShowWhatsAppContacts(false);

          const normalizedPhone = normalizePhone(contact.phone);
          if (!normalizedPhone) {
            toast.error("Contato sem telefone válido");
            return;
          }

          const contractNumber = `WA-${normalizedPhone}`;
          const clientName = contact.name?.trim() || normalizedPhone;

          // Check if conversation already exists for this phone
          const existingConv = conversations.find((c) => {
            const conversationPhone = normalizePhone(
              c.phone || (c.numero_contrato?.startsWith("WA-") ? c.numero_contrato.replace("WA-", "") : "")
            );
            return conversationPhone === normalizedPhone;
          });

          if (existingConv) {
            handleSelectConversation(existingConv);
            toast.info(`Conversa com ${clientName} já existe`);
            return;
          }

          try {
            const { data: existingTracking, error: existingTrackingError } = await supabase
              .from("client_tracking")
              .select("id, client_id, nome_cliente, numero_contrato, status")
              .eq("tenant_id", tenantId)
              .eq("numero_contrato", contractNumber)
              .maybeSingle();

            if (existingTrackingError) {
              console.error("tracking lookup error:", existingTrackingError);
              toast.loading(`Buscando tracking ${contractNumber}...`, { id: "wa-flow", duration: 2000 });
            }

            if (existingTracking) {
              const conv: ChatConversation = {
                id: existingTracking.id,
                numero_contrato: existingTracking.numero_contrato || contractNumber,
                nome_cliente: existingTracking.nome_cliente || clientName,
                unread_count: 0,
                phone: normalizedPhone,
                client_id: existingTracking.client_id || undefined,
              };

              setConversations((prev) => [conv, ...prev.filter((c) => c.id !== conv.id)]);
              handleSelectConversation(conv);
              return;
            }

            // Only check if client already exists — do NOT auto-create a lead
            let clientId: string | null = null;
            const { data: existingClientRows } = await supabase
              .from("clients")
              .select("id")
              .eq("tenant_id", tenantId)
              .eq("numero_orcamento", contractNumber)
              .limit(1);
            if (((existingClientRows as any[]) || [])[0]?.id) {
              clientId = ((existingClientRows as any[])[0]).id;
            }

            // Create tracking (conversation) only — NO lead auto-creation
            toast.loading("Criando conversa...", { id: "wa-flow", duration: 3000 });
            const { data: createdTracking, error: trackError } = await supabase
              .from("client_tracking")
              .insert({
                tenant_id: tenantId,
                client_id: clientId,
                nome_cliente: clientName,
                numero_contrato: contractNumber,
                status: "em_negociacao",
              } as any)
              .select("id, client_id, nome_cliente, numero_contrato")
              .maybeSingle();

            if (trackError || !createdTracking?.id) {
              const { data: recoveredTracking } = await supabase
                .from("client_tracking")
                .select("id, client_id, nome_cliente, numero_contrato")
                .eq("tenant_id", tenantId)
                .eq("numero_contrato", contractNumber)
                .maybeSingle();

              if (!recoveredTracking?.id) {
                toast.error("Erro ao criar conversa", { id: "wa-flow" });
                return;
              }

              const recoveredConv: ChatConversation = {
                id: recoveredTracking.id,
                numero_contrato: recoveredTracking.numero_contrato || contractNumber,
                nome_cliente: recoveredTracking.nome_cliente || clientName,
                unread_count: 0,
                phone: normalizedPhone,
                client_id: recoveredTracking.client_id || undefined,
              };
              setConversations((prev) => [recoveredConv, ...prev.filter((c) => c.id !== recoveredConv.id)]);
              handleSelectConversation(recoveredConv);
              toast.success(`Conversa com ${clientName} iniciada!`, { id: "wa-flow" });
              return;
            }

            const newConv: ChatConversation = {
              id: createdTracking.id,
              numero_contrato: createdTracking.numero_contrato || contractNumber,
              nome_cliente: createdTracking.nome_cliente || clientName,
              unread_count: 0,
              phone: normalizedPhone,
              client_id: clientId || undefined,
            };

            setConversations((prev) => [newConv, ...prev.filter((c) => c.id !== newConv.id)]);
            handleSelectConversation(newConv);
            toast.success(`Conversa com ${clientName} iniciada!`, { id: "wa-flow" });
          } catch (err) {
            console.error("[WA Flow] Unexpected error:", err);
            toast.error(`Erro inesperado: ${(err as Error)?.message || "Tente novamente"}`, { id: "wa-flow" });
          }
        }}
      />

      {/* Lead Creation Confirmation Dialog */}
      <AlertDialog open={!!pendingLeadConv} onOpenChange={(open) => !open && setPendingLeadConv(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Criar novo lead?</AlertDialogTitle>
            <AlertDialogDescription>
              Deseja criar um novo lead para <strong>{pendingLeadConv?.nome_cliente}</strong>?
              {pendingLeadConv?.phone && <> (Tel: {pendingLeadConv.phone})</>}
              <br />
              O lead será adicionado na coluna <strong>&quot;Novo&quot;</strong> com origem <strong>&quot;CHAT DE VENDAS&quot;</strong>.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleCreateLead}>Criar Lead</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Delete Conversation Confirmation Dialog */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <AlertDialogContent className="max-w-md">
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2 text-destructive">
              <Trash2 className="h-5 w-5" />
              Excluir conversa permanentemente?
            </AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-3">
                <p>
                  Tem certeza que deseja excluir a conversa com <strong className="text-foreground">{deleteTarget?.nome_cliente}</strong>?
                </p>
                <div className="bg-destructive/10 border border-destructive/20 rounded-lg p-3 space-y-1.5">
                  <p className="text-xs font-medium text-destructive">⚠️ Esta ação é irreversível:</p>
                  <ul className="text-xs text-muted-foreground space-y-0.5 list-disc pl-4">
                    <li>Todas as mensagens serão apagadas</li>
                    <li>O registro de acompanhamento será removido</li>
                    <li>Não será possível recuperar o histórico</li>
                  </ul>
                </div>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmDelete}
              disabled={deleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleting ? (
                <><Loader2 className="h-4 w-4 animate-spin mr-1" /> Excluindo...</>
              ) : (
                "Excluir permanentemente"
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      </div>
    </div>
  );
}
