import { useState, useEffect, useCallback, useRef, useMemo, type ComponentProps } from "react";
import { supabase } from "@/lib/supabaseClient";
import { useAutoSuggestion } from "@/hooks/useAutoSuggestion";
import { useVendaZap } from "@/hooks/useVendaZap";
import { useAutoPilot } from "@/hooks/useAutoPilot";
import { useCurrentUser } from "@/hooks/useCurrentUser";
import { useWhatsAppSimulator } from "@/hooks/useWhatsAppSimulator";
import { useIsMobile } from "@/hooks/use-mobile";
import { playLeadNotificationSound } from "@/lib/notificationSound";
import { toast } from "sonner";
import { CloseSaleModal } from "@/components/CloseSaleModal";
import type { CloseSaleData } from "./AICloserBanner";
import { Button } from "@/components/ui/button";
import { Loader2, Brain, Phone, Merge } from "lucide-react";
import { ChatConversationList } from "./ChatConversationList";
import { ChatWindow } from "./ChatWindow";
import { AutoPilotPanel } from "./AutoPilotPanel";
import { WhatsAppSimulatorPanel } from "./WhatsAppSimulatorPanel";
import { SimulatorMetricsPanel } from "./SimulatorMetricsPanel";
import { StartConversationModal } from "./StartConversationModal";
import { ChatRightPanel } from "./ChatRightPanel";
import { WhatsAppContactsList } from "./WhatsAppContactsList";
import { useWhatsAppConnectionStatus, WhatsAppStatusTag } from "./useWhatsAppConnection";
import { VendaZapChatDialogs } from "./VendaZapChatDialogs";
import type { ChatConversation } from "./types";

type WhatsAppConnectionStatus = "checking" | "online" | "offline" | "not_configured";

type WhatsAppConnectionStatus = "checking" | "online" | "offline" | "not_configured";

function isConversationAssignedToUser(conversation: ChatConversation | null | undefined, userName: string) {
  if (!conversation || !userName) return false;

  const normalizedUserName = userName.trim().toLowerCase();
  return [conversation.vendedor_nome, conversation.projetista_nome]
    .filter(Boolean)
    .some((name) => String(name).trim().toLowerCase() === normalizedUserName);
}

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
        .eq("tenant_id", tenantId)
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

      const defaultWebhookUrl = "https://bdhfzjuwtkiexyeusnqq.supabase.co/functions/v1/whatsapp-webhook";
      if (!settings.zapi_webhook_url || settings.zapi_webhook_url.includes("whatsapp-bot")) {
        const correctedUrl = (settings.zapi_webhook_url || defaultWebhookUrl).replace("whatsapp-bot", "whatsapp-webhook");
        settings.zapi_webhook_url = correctedUrl;
        await supabase
          .from("whatsapp_settings")
          .update({ zapi_webhook_url: correctedUrl } as any)
          .eq("id", settings.id);
        console.log("[WhatsApp] Auto-corrected webhook URL on chat open:", correctedUrl);
      }

      setProvider(settings.provider);

      if (settings.provider === "zapi" && settings.zapi_instance_id && settings.zapi_token && settings.zapi_client_token) {
        try {
          if (settings.zapi_webhook_url) {
            const webhookUrl = settings.zapi_webhook_url.includes("whatsapp-bot")
              ? settings.zapi_webhook_url.replace("whatsapp-bot", "whatsapp-webhook")
              : settings.zapi_webhook_url;
            
            const syncKey = `${settings.zapi_instance_id}:${webhookUrl}`;
            if (syncedWebhookRef.current !== syncKey) {
              const headers = {
                "Content-Type": "application/json",
                "Client-Token": settings.zapi_client_token,
                ...(settings.zapi_security_token ? { "Security-Token": settings.zapi_security_token } : {}),
              };

              const baseUrl = `https://api.z-api.io/instances/${settings.zapi_instance_id}/token/${settings.zapi_token}`;

              const [receivedRes, deliveryRes, notifyRes] = await Promise.all([
                // Incoming messages webhook
                fetch(`${baseUrl}/update-webhook-received`, {
                  method: "PUT",
                  headers,
                  body: JSON.stringify({ value: webhookUrl }),
                }),
                // Delivery receipts webhook
                fetch(`${baseUrl}/update-webhook-received-delivery`, {
                  method: "PUT",
                  headers,
                  body: JSON.stringify({ value: webhookUrl }),
                }),
                // Also mirror outbound messages
                fetch(`${baseUrl}/update-notify-sent-by-me`, {
                  method: "PUT",
                  headers,
                  body: JSON.stringify({ notifySentByMe: true }),
                }),
              ]);

              console.log("[WhatsApp] Webhook sync:", {
                received: receivedRes.ok,
                delivery: deliveryRes.ok,
                notify: notifyRes.ok,
                url: webhookUrl,
              });

              if (receivedRes.ok && deliveryRes.ok && notifyRes.ok) {
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
  initialClientId?: string | null;
  onInitialClientHandled?: () => void;
  onDealRoom?: (clientName: string, contractId: string) => void;
}

export function VendaZapChat({ tenantId, userId, initialClientId, onInitialClientHandled, onDealRoom }: Props) {
  const [conversations, setConversations] = useState<ChatConversation[]>([]);
  const [selected, setSelected] = useState<ChatConversation | null>(null);
  const [loading, setLoading] = useState(true);
  const [inputValue, setInputValue] = useState("");
  const [showStartModal, setShowStartModal] = useState(false);
  const [mobileAiOpen, setMobileAiOpen] = useState(false);
  const [showWhatsAppContacts, setShowWhatsAppContacts] = useState(false);
  const [pendingLeadConv, setPendingLeadConv] = useState<ChatConversation | null>(null);
  const [interventionMode, setInterventionMode] = useState<"automatico" | "assistido" | "manual">("assistido");
  const [closeSaleOpen, setCloseSaleOpen] = useState(false);
  const [closeSaleClient, setCloseSaleClient] = useState<ComponentProps<typeof CloseSaleModal>["client"] | null>(null);
  const [closeSaleSimData, setCloseSaleSimData] = useState<CloseSaleData | undefined>(undefined);
  const [closeSaleSaving, setCloseSaleSaving] = useState(false);
  const [messageCount, setMessageCount] = useState(0);
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

  const { suggestion, loading: aiLoading, tipoCopy, discProfile, generate, clear, markUsed } = useAutoSuggestion({ tenantId, addon: addonConfig, userId });
  const { settings: autoPilotSettings, isActive: autoPilotActive, toggle: toggleAutoPilot, updateSettings: updateAutoPilotSettings, processMessage: autoPilotProcess } = useAutoPilot({ tenantId, userId, addon: addonConfig });
  const { config: simConfig, updateConfig: updateSimConfig, scheduleSimulatedReply, sendSimulatedMessage, isSimulating, cleanup: cleanupSim } = useWhatsAppSimulator(tenantId);

  useEffect(() => { conversationsRef.current = conversations; }, [conversations]);
  useEffect(() => () => cleanupSim(), [cleanupSim]);

  const isAdminOrManager = currentUser?.cargo_nome ? ["administrador", "gerente", "admin"].includes(currentUser.cargo_nome.toLowerCase()) : false;
  const currentUserName = currentUser?.nome_completo?.trim().toLowerCase() || "";
  const normalizePhone = useCallback((value?: string | null) => String(value || "").replace(/^WA-/i, "").replace(/@.*/, "").replace(/\D/g, "").replace(/^55(?=\d{10,11}$)/, ""), []);

  const hiddenStorageKey = tenantId ? `vendazap-hidden:${tenantId}` : null;
  const [deletedIds, setDeletedIds] = useState<Set<string>>(new Set());
  const deletedIdsRef = useRef<Set<string>>(new Set());
  const [hiddenConversationKeys, setHiddenConversationKeys] = useState<Set<string>>(new Set());
  const hiddenConversationKeysRef = useRef<Set<string>>(new Set());

  const persistHiddenKeys = useCallback((next: Set<string>) => {
    hiddenConversationKeysRef.current = next;
    setHiddenConversationKeys(new Set(next));
    if (hiddenStorageKey) localStorage.setItem(hiddenStorageKey, JSON.stringify(Array.from(next)));
  }, [hiddenStorageKey]);

  useEffect(() => {
    if (!hiddenStorageKey) return;
    try {
      const raw = localStorage.getItem(hiddenStorageKey);
      const parsed = raw ? (JSON.parse(raw) as string[]) : [];
      const next = new Set(parsed);
      hiddenConversationKeysRef.current = next;
      setHiddenConversationKeys(next);
    } catch {
      hiddenConversationKeysRef.current = new Set();
      setHiddenConversationKeys(new Set());
    }
  }, [hiddenStorageKey]);

  const buildConversationMarkers = useCallback((conv: Partial<ChatConversation>) => {
    const markers = new Set<string>();
    if (conv.id) markers.add(`tracking:${conv.id}`);
    (conv.relatedTrackingIds || []).forEach((id) => markers.add(`tracking:${id}`));
    if (conv.client_id) markers.add(`client:${conv.client_id}`);
    const normalizedPhone = normalizePhone(conv.phone || (conv.numero_contrato?.startsWith("WA-") ? conv.numero_contrato.replace("WA-", "") : ""));
    if (normalizedPhone) markers.add(`phone:${normalizedPhone}`);
    if (conv.groupKey) markers.add(`group:${conv.groupKey}`);
    return markers;
  }, [normalizePhone]);

  const hideConversation = useCallback((conv: ChatConversation) => {
    const next = new Set(hiddenConversationKeysRef.current);
    buildConversationMarkers(conv).forEach((marker) => next.add(marker));
    persistHiddenKeys(next);
  }, [buildConversationMarkers, persistHiddenKeys]);

  const unhideConversation = useCallback((conv: Partial<ChatConversation>) => {
    const next = new Set(hiddenConversationKeysRef.current);
    buildConversationMarkers(conv).forEach((marker) => next.delete(marker));
    persistHiddenKeys(next);
  }, [buildConversationMarkers, persistHiddenKeys]);

  const isConversationHidden = useCallback((conv: Partial<ChatConversation>) => {
    const markers = buildConversationMarkers(conv);
    for (const marker of markers) {
      if (hiddenConversationKeysRef.current.has(marker)) return true;
    }
    return false;
  }, [buildConversationMarkers]);

  const fetchConversations = useCallback(async () => {
    if (!tenantId) return;
    const normalizePhoneValue = (value?: string | null) => normalizePhone(value);

    const [{ data: trackings }, { data: allClients }] = await Promise.all([
      supabase.from("client_tracking").select("id, numero_contrato, nome_cliente, client_id, projetista, updated_at, status, valor_contrato").eq("tenant_id", tenantId).order("updated_at", { ascending: false }),
      supabase.from("clients").select("id, nome, numero_orcamento, vendedor, status, telefone1, telefone2, updated_at").eq("tenant_id", tenantId).in("status", ["novo", "em_negociacao", "proposta_enviada", "expirado", "fechado"]),
    ]);

    const clientDataMap: Record<string, { vendedor: string | null; telefone: string | null; telefones: string[]; status?: string | null; updated_at?: string | null }> = {};
    ((allClients as Array<Record<string, unknown>> | null) || []).forEach((client) => {
      const phones = [client.telefone1, client.telefone2].map((phone) => normalizePhoneValue(String(phone || ""))).filter(Boolean);
      clientDataMap[String(client.id)] = {
        vendedor: typeof client.vendedor === "string" ? client.vendedor : null,
        telefone: (typeof client.telefone1 === "string" && client.telefone1) || (typeof client.telefone2 === "string" && client.telefone2) || null,
        telefones: phones,
        status: typeof client.status === "string" ? client.status : null,
        updated_at: typeof client.updated_at === "string" ? client.updated_at : null,
      };
    });

    type Entry = {
      id: string;
      nome_cliente: string;
      numero_contrato: string;
      client_id?: string;
      projetista?: string;
      isClientDirect?: boolean;
      groupKey: string;
      relatedTrackingIds: string[];
      phone?: string;
      updated_at?: string;
      status?: string;
      valor_orcamento?: number;
    };

    const trackingEntries: Entry[] = ((trackings as Array<Record<string, unknown>> | null) || []).map((tracking) => {
      const clientId = typeof tracking.client_id === "string" ? tracking.client_id : undefined;
      const clientPhones = clientId ? clientDataMap[clientId]?.telefones || [] : [];
      const contractPhone = typeof tracking.numero_contrato === "string" && tracking.numero_contrato.startsWith("WA-")
        ? normalizePhoneValue(tracking.numero_contrato.replace("WA-", ""))
        : "";
      const canonicalPhone = clientPhones[0] || contractPhone;
      return {
        id: String(tracking.id),
        nome_cliente: String(tracking.nome_cliente || ""),
        numero_contrato: String(tracking.numero_contrato || ""),
        client_id: clientId,
        projetista: typeof tracking.projetista === "string" ? tracking.projetista : undefined,
        groupKey: canonicalPhone || `client:${clientId || tracking.id}`,
        relatedTrackingIds: [String(tracking.id)],
        phone: canonicalPhone || (clientId ? clientDataMap[clientId]?.telefone || undefined : undefined),
        updated_at: typeof tracking.updated_at === "string" ? tracking.updated_at : undefined,
        status: typeof tracking.status === "string" ? tracking.status : undefined,
        valor_orcamento: typeof tracking.valor_contrato === "number" ? tracking.valor_contrato : undefined,
      };
    });

    const trackedClientIds = new Set(trackingEntries.map((entry) => entry.client_id).filter(Boolean));
    const directEntries: Entry[] = ((allClients as Array<Record<string, unknown>> | null) || [])
      .filter((client) => !trackedClientIds.has(String(client.id)))
      .map((client) => {
        const canonicalPhone = normalizePhoneValue(String(client.telefone1 || client.telefone2 || ""));
        return {
          id: String(client.id),
          nome_cliente: String(client.nome || ""),
          numero_contrato: String(client.numero_orcamento || ""),
          client_id: String(client.id),
          isClientDirect: true,
          groupKey: canonicalPhone || `client:${client.id}`,
          relatedTrackingIds: [],
          phone: canonicalPhone || undefined,
          updated_at: typeof client.updated_at === "string" ? client.updated_at : undefined,
          status: typeof client.status === "string" ? client.status : undefined,
        };
      });

    const allEntries = [...trackingEntries, ...directEntries];
    const filteredEntries = !isAdminOrManager && currentUser?.nome_completo
      ? allEntries.filter((entry) => clientDataMap[entry.client_id || ""]?.vendedor?.toLowerCase() === currentUser.nome_completo.toLowerCase() || entry.projetista?.toLowerCase() === currentUser.nome_completo.toLowerCase())
      : allEntries;

    if (filteredEntries.length === 0) {
      setConversations([]);
      setLoading(false);
      return;
    }

    const groupedEntries = new Map<string, Entry>();
    filteredEntries.forEach((entry) => {
      const existing = groupedEntries.get(entry.groupKey);
      if (!existing) {
        groupedEntries.set(entry.groupKey, { ...entry });
        return;
      }
      const mergedTrackingIds = Array.from(new Set([...existing.relatedTrackingIds, ...entry.relatedTrackingIds]));
      const existingHasMessages = existing.relatedTrackingIds.length > 0;
      const entryHasMessages = entry.relatedTrackingIds.length > 0;
      const preferred = !existingHasMessages && entryHasMessages ? entry : existing;
      groupedEntries.set(entry.groupKey, {
        ...preferred,
        client_id: preferred.client_id || existing.client_id || entry.client_id,
        isClientDirect: Boolean(existing.isClientDirect && entry.isClientDirect),
        projetista: preferred.projetista || existing.projetista || entry.projetista,
        relatedTrackingIds: mergedTrackingIds,
        phone: preferred.phone || existing.phone || entry.phone,
        status: preferred.status || existing.status || entry.status,
        updated_at: preferred.updated_at || existing.updated_at || entry.updated_at,
        valor_orcamento: preferred.valor_orcamento || existing.valor_orcamento || entry.valor_orcamento,
      });
    });

    const mergedEntries = Array.from(groupedEntries.values());
    const trackingOnlyIds = Array.from(new Set(mergedEntries.flatMap((entry) => entry.relatedTrackingIds)));
    const trackingToGroupKey = new Map<string, string>();
    mergedEntries.forEach((entry) => entry.relatedTrackingIds.forEach((trackingId) => trackingToGroupKey.set(trackingId, entry.groupKey)));

    const unreadMap: Record<string, number> = {};
    const lastMsgMap: Record<string, { msg: string; at: string }> = {};

    if (trackingOnlyIds.length > 0) {
      const [{ data: unreadData }, { data: lastMsgs }] = await Promise.all([
        supabase.from("tracking_messages").select("tracking_id").eq("remetente_tipo", "cliente").eq("lida", false).in("tracking_id", trackingOnlyIds),
        supabase.from("tracking_messages").select("tracking_id, mensagem, created_at").in("tracking_id", trackingOnlyIds).order("created_at", { ascending: false }),
      ]);

      ((unreadData as Array<{ tracking_id: string }> | null) || []).forEach((message) => {
        const groupKey = trackingToGroupKey.get(message.tracking_id);
        if (groupKey) unreadMap[groupKey] = (unreadMap[groupKey] || 0) + 1;
      });

      ((lastMsgs as Array<{ tracking_id: string; mensagem: string; created_at: string }> | null) || []).forEach((message) => {
        const groupKey = trackingToGroupKey.get(message.tracking_id);
        if (!groupKey || lastMsgMap[groupKey]) return;
        lastMsgMap[groupKey] = { msg: (message.mensagem || "[Mídia]").substring(0, 60), at: message.created_at };
      });
    }

    const hasMessages = new Set(Object.keys(lastMsgMap));
    const nextConversations = mergedEntries
      .filter((entry) => hasMessages.has(entry.groupKey) || (unreadMap[entry.groupKey] || 0) > 0 || entry.isClientDirect)
      .map((entry) => ({
        id: entry.id,
        numero_contrato: entry.numero_contrato,
        nome_cliente: entry.nome_cliente,
        unread_count: unreadMap[entry.groupKey] || 0,
        last_message: lastMsgMap[entry.groupKey]?.msg || (entry.isClientDirect ? "Clique para iniciar conversa" : undefined),
        last_message_at: lastMsgMap[entry.groupKey]?.at,
        vendedor_nome: entry.client_id ? clientDataMap[entry.client_id]?.vendedor || null : null,
        projetista_nome: entry.projetista || null,
        isClientDirect: entry.isClientDirect || false,
        client_id: entry.client_id,
        phone: entry.phone || (entry.client_id ? clientDataMap[entry.client_id]?.telefone || undefined : undefined),
        relatedTrackingIds: entry.relatedTrackingIds,
        groupKey: entry.groupKey,
        status: entry.status,
        updated_at: entry.updated_at,
        valor_orcamento: entry.valor_orcamento,
      }))
      .filter((conversation) => !isConversationHidden(conversation) && !deletedIdsRef.current.has(conversation.id))
      .sort((a, b) => {
        if (a.unread_count > 0 && b.unread_count === 0) return -1;
        if (b.unread_count > 0 && a.unread_count === 0) return 1;
        return (b.last_message_at || b.updated_at || "").localeCompare(a.last_message_at || a.updated_at || "");
      });

    setConversations(nextConversations);
    setLoading(false);
  }, [tenantId, normalizePhone, isAdminOrManager, currentUser?.nome_completo, isConversationHidden]);

  useEffect(() => { void fetchConversations(); }, [fetchConversations]);

  useEffect(() => {
    if (!initialClientId || conversations.length === 0) return;
    const match = conversations.find((conversation) => conversation.client_id === initialClientId);
    if (match) {
      setSelected(match);
      onInitialClientHandled?.();
    }
  }, [initialClientId, conversations, onInitialClientHandled]);

  const triggerAI = useCallback(async (conv: ChatConversation, forceRefresh = false) => {
    if (!addon?.ativo) return;
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      const trackingIds = Array.from(new Set([conv.id, ...(conv.relatedTrackingIds || [])]));
      const { data: recentMsgs } = await supabase.from("tracking_messages").select("mensagem, remetente_tipo").in("tracking_id", trackingIds).order("created_at", { ascending: false }).limit(20);
      generate({ id: conv.client_id || conv.id, nome: conv.nome_cliente, status: conv.status || "em_negociacao", updated_at: conv.last_message_at || conv.updated_at || new Date().toISOString(), telefone1: conv.phone || null }, null, (((recentMsgs as Array<{ mensagem: string; remetente_tipo: string }> | null) || []).reverse()), { forceRefresh });
    }, forceRefresh ? 300 : 800);
  }, [addon, generate]);

  useEffect(() => {
    const channel = supabase
      .channel("vendazap-chat-list")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "tracking_messages" }, async (payload) => {
        const msg = payload.new as { tracking_id?: string; remetente_tipo?: string; mensagem?: string };
        if (!msg.tracking_id || hiddenConversationKeysRef.current.has(`tracking:${msg.tracking_id}`)) return;

        let conv = conversationsRef.current.find((conversation) => conversation.id === msg.tracking_id || conversation.relatedTrackingIds?.includes(msg.tracking_id || ""));
        if (!conv) {
          const { data: trackingRow } = await supabase.from("client_tracking").select("client_id, numero_contrato").eq("id", msg.tracking_id).maybeSingle();
          const trackingPhone = normalizePhone(trackingRow?.numero_contrato);
          if (trackingRow?.client_id && hiddenConversationKeysRef.current.has(`client:${trackingRow.client_id}`)) return;
          if (trackingPhone && hiddenConversationKeysRef.current.has(`phone:${trackingPhone}`)) return;
          if (trackingRow?.client_id) conv = conversationsRef.current.find((conversation) => conversation.client_id === trackingRow.client_id);
        }

        const isSelectedConversation = Boolean(selected && (selected.id === msg.tracking_id || selected.relatedTrackingIds?.includes(msg.tracking_id)));
        const resolvedConversation = conv || (selected && (selected.id === msg.tracking_id || selected.relatedTrackingIds?.includes(msg.tracking_id)) ? selected : null);
        const shouldNotifyCurrentUser = isConversationAssignedToUser(resolvedConversation, currentUserName);

        if (msg.remetente_tipo === "cliente") {
          if (shouldNotifyCurrentUser) playLeadNotificationSound(resolvedConversation?.lead_temperature);
          if (shouldNotifyCurrentUser && !isSelectedConversation) {
            const tempEmoji = resolvedConversation?.lead_temperature === "quente" ? "🔥" : resolvedConversation?.lead_temperature === "morno" ? "🟡" : "❄️";
            toast.info(`${tempEmoji} Nova mensagem de cliente!`, { description: msg.mensagem?.substring(0, 50), duration: resolvedConversation?.lead_temperature === "quente" ? 8000 : 4000 });
          }
          if (selected && isSelectedConversation) triggerAI(selected, true);
          if (autoPilotActive && conv && interventionMode === "automatico") {
            const { data: recentMsgs } = await supabase.from("tracking_messages").select("mensagem, remetente_tipo").eq("tracking_id", msg.tracking_id).order("created_at", { ascending: false }).limit(5);
            const result = await autoPilotProcess(msg.tracking_id, msg.mensagem || "", conv.nome_cliente, conv.lead_temperature, (((recentMsgs as Array<{ mensagem: string; remetente_tipo: string }> | null) || []).reverse()));
            if (result) toast.success(`🤖 Auto-Pilot respondeu ${conv.nome_cliente}`, { description: `Intenção: ${result.intencao} | ${result.tokensUsed} tokens`, duration: 5000 });
          } else if (autoPilotActive && conv && interventionMode === "assistido" && !isSelectedConversation) {
            toast.info(`💡 Nova mensagem de ${conv.nome_cliente} — IA preparou sugestão`, { duration: 4000 });
          }
        }

        void fetchConversations();
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [selected, fetchConversations, autoPilotActive, autoPilotProcess, triggerAI, currentUserName, normalizePhone, interventionMode]);

  const handleSelectConversation = useCallback(async (conv: ChatConversation) => {
    unhideConversation(conv);
    if (conv.isClientDirect) {
      const clientId = conv.client_id || conv.id;
      const { data: existingTracking } = await supabase.from("client_tracking").select("id").eq("client_id", clientId).maybeSingle();
      let trackingId = existingTracking?.id;
      if (!trackingId) {
        const { data: newTracking, error: trackError } = await supabase.from("client_tracking").insert({ client_id: clientId, nome_cliente: conv.nome_cliente, numero_contrato: conv.numero_contrato || `CHAT-${Date.now()}`, tenant_id: tenantId, status: "em_negociacao" }).select("id").single();
        if (trackError || !newTracking) {
          toast.error("Erro ao criar registro de conversa");
          return;
        }
        trackingId = newTracking.id;
      }
      const updatedConv: ChatConversation = { ...conv, id: trackingId, isClientDirect: false };
      setSelected(updatedConv);
      setInputValue("");
      clear();
      triggerAI(updatedConv);
      void fetchConversations();
      return;
    }
    setSelected(conv);
    setInputValue("");
    clear();
    triggerAI(conv);
    setConversations((prev) => prev.map((conversation) => (conversation.id === conv.id ? { ...conversation, unread_count: 0 } : conversation)));
  }, [tenantId, clear, triggerAI, fetchConversations, unhideConversation]);

  const handleUseSuggestion = () => {
    setInputValue(suggestion);
    if (selected) markUsed(selected.id);
  };

  const handleDealRoom = () => {
    if (selected && onDealRoom) onDealRoom(selected.nome_cliente, selected.numero_contrato);
  };

  const handleCloseSaleFromAI = useCallback(async (data: CloseSaleData) => {
    if (!selected) return;
    if (selected.client_id) {
      const { data: clientData } = await supabase.from("clients").select("*").eq("id", selected.client_id).maybeSingle();
      setCloseSaleClient(clientData || null);
    } else {
      setCloseSaleClient(null);
    }
    setCloseSaleSimData(data);
    setCloseSaleOpen(true);
  }, [selected]);

  const handleCloseSaleConfirm = useCallback(async (formData: Record<string, unknown>, items: unknown[], itemDetails: unknown[]) => {
    if (!tenantId || !selected) return;
    setCloseSaleSaving(true);
    try {
      const { data: templateRow } = await supabase.from("contract_templates").select("conteudo_html").limit(1).maybeSingle();
      const template = (templateRow as Record<string, string> | null)?.conteudo_html || "<p>Contrato gerado automaticamente</p>";
      const { buildContractHtml } = await import("@/services/contractService");
      const { data: settingsData } = await supabase.from("company_settings").select("*").limit(1).maybeSingle();
      const contractHtml = buildContractHtml(template, {
        formData,
        client: { nome: selected.nome_cliente, cpf: null, telefone1: selected.phone || null, email: null, numero_orcamento: selected.numero_contrato || null, vendedor: selected.vendedor_nome || null },
        valorTela: closeSaleSimData?.valorFinal || 0,
        result: { valorFinal: closeSaleSimData?.valorFinal || 0, valorParcela: closeSaleSimData?.valorParcela || 0, valorComDesconto: closeSaleSimData?.valorFinal || 0 },
        formaPagamento: closeSaleSimData?.formaPagamento || "",
        parcelas: closeSaleSimData?.parcelas || 1,
        valorEntrada: closeSaleSimData?.valorEntrada || 0,
        settings: settingsData || {},
        selectedIndicador: null,
        comissaoPercentual: 0,
        items: items as Array<{ quantidade: number; descricao_ambiente: string; fornecedor: string; prazo: string; valor_ambiente: number }>,
        itemDetails: itemDetails as Array<{ item_num: number; titulos: string; corpo: string; porta: string; puxador: string; complemento: string; modelo: string }>,
      });
      const { error } = await supabase.from("client_contracts").insert({ client_id: selected.client_id!, conteudo_html: contractHtml, tenant_id: tenantId });
      if (error) throw error;
      if (selected.client_id) await supabase.from("clients").update({ etapa_funil: "contrato" } as Record<string, unknown>).eq("id", selected.client_id);
      toast.success("🎉 Contrato gerado com sucesso!");
      setCloseSaleOpen(false);
    } catch (err) {
      console.error("[CloseSale] Error:", err);
      toast.error("Erro ao gerar contrato");
    } finally {
      setCloseSaleSaving(false);
    }
  }, [tenantId, selected, closeSaleSimData]);

  const handleStartConversation = useCallback(async (trackingId: string, clientName: string, contractNumber: string) => {
    setShowStartModal(false);
    const isManualWA = trackingId.startsWith("WA-");

    if (isManualWA) {
      const normalizedPhone = trackingId.replace("WA-", "").replace(/\D/g, "");
      const existingConv = conversations.find((conversation) => normalizePhone(conversation.phone || (conversation.numero_contrato?.startsWith("WA-") ? conversation.numero_contrato.replace("WA-", "") : "")) === normalizedPhone);
      if (existingConv) {
        unhideConversation(existingConv);
        handleSelectConversation(existingConv);
        toast.info(`Conversa com ${clientName} já existe`);
        return;
      }

      try {
        const { data: existingClientRows } = await supabase.from("clients").select("id").eq("tenant_id", tenantId).eq("numero_orcamento", contractNumber).limit(1);
        const clientId = ((existingClientRows as Array<{ id: string }> | null) || [])[0]?.id || null;
        const { data: tracking, error: trackErr } = await supabase.from("client_tracking").insert({ tenant_id: tenantId, client_id: clientId, nome_cliente: clientName, numero_contrato: contractNumber, status: "em_negociacao" }).select("id").maybeSingle();
        let trackId = tracking?.id;
        if (trackErr || !trackId) {
          const { data: existingTrackingRows } = await supabase.from("client_tracking").select("id").eq("tenant_id", tenantId).eq("numero_contrato", contractNumber).limit(1);
          trackId = ((existingTrackingRows as Array<{ id: string }> | null) || [])[0]?.id;
        }
        if (!trackId) {
          toast.error("Erro ao criar conversa");
          return;
        }
        const newConv: ChatConversation = { id: trackId, numero_contrato: contractNumber, nome_cliente: clientName, unread_count: 0, phone: normalizedPhone, client_id: clientId || undefined, groupKey: normalizedPhone };
        unhideConversation(newConv);
        toast.success(`Conversa com ${clientName} iniciada!`);
        await fetchConversations();
        handleSelectConversation(newConv);
      } catch (err) {
        console.error("[Manual WA] error:", err);
        toast.error("Erro inesperado ao criar conversa");
      }
      return;
    }

    const existing = conversations.find((conversation) => conversation.id === trackingId);
    if (existing) {
      unhideConversation(existing);
      handleSelectConversation(existing);
      return;
    }

    let actualTrackingId = trackingId;
    const { data: existingTracking } = await supabase.from("client_tracking").select("id").eq("id", trackingId).maybeSingle();
    if (!existingTracking) {
      const { data: newTracking, error: trackError } = await supabase.from("client_tracking").insert({ client_id: trackingId, nome_cliente: clientName, numero_contrato: contractNumber || `CHAT-${Date.now()}`, tenant_id: tenantId, status: "em_negociacao" }).select("id").single();
      if (trackError || !newTracking) {
        toast.error("Erro ao criar registro de conversa");
        return;
      }
      actualTrackingId = newTracking.id;
    }

    const newConv: ChatConversation = { id: actualTrackingId, numero_contrato: contractNumber, nome_cliente: clientName, unread_count: 0, client_id: trackingId };
    unhideConversation(newConv);
    toast.success(`Conversa com ${clientName} iniciada!`);
    await fetchConversations();
    handleSelectConversation(newConv);
  }, [conversations, fetchConversations, tenantId, normalizePhone, handleSelectConversation, unhideConversation]);

  const [deleteTarget, setDeleteTarget] = useState<ChatConversation | null>(null);
  const [deleting, setDeleting] = useState(false);

  const handleDeleteConversation = useCallback((conv: ChatConversation) => {
    if (!isAdminOrManager) return;
    setDeleteTarget(conv);
  }, [isAdminOrManager]);

  const confirmDelete = useCallback(async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      const allTrackingIds = Array.from(new Set([deleteTarget.id, ...(deleteTarget.relatedTrackingIds || [])]));
      for (const trackId of allTrackingIds) {
        const { error: msgErr } = await supabase.from("tracking_messages").delete().eq("tracking_id", trackId);
        if (msgErr) console.warn("[Delete] msg error for", trackId, msgErr);
      }
      for (const trackId of allTrackingIds) {
        const { error: trackErr } = await supabase.from("client_tracking").delete().eq("id", trackId);
        if (trackErr) console.warn("[Delete] tracking error for", trackId, trackErr);
        deletedIdsRef.current.add(trackId);
      }
      hideConversation(deleteTarget);
      setDeletedIds(new Set(deletedIdsRef.current));
      if (selected?.id === deleteTarget.id) setSelected(null);
      setConversations((prev) => prev.filter((conversation) => !isConversationHidden(conversation) && !deletedIdsRef.current.has(conversation.id)));
      toast.success(`Conversa com "${deleteTarget.nome_cliente}" excluída e mantida oculta`);
    } catch (err) {
      console.error("Delete conversation error:", err);
      toast.error("Erro ao excluir conversa");
    } finally {
      setDeleting(false);
      setDeleteTarget(null);
    }
  }, [deleteTarget, selected, hideConversation, isConversationHidden]);

  const handleMergeDuplicate = useCallback(async (keep: ChatConversation, remove: ChatConversation) => {
    if (!isAdminOrManager) return;
    try {
      const removeTrackingIds = Array.from(new Set([remove.id, ...(remove.relatedTrackingIds || [])]));
      const keepTrackingIds = Array.from(new Set([keep.id, ...(keep.relatedTrackingIds || [])]));
      for (const trackId of removeTrackingIds) {
        if (!keepTrackingIds.includes(trackId)) {
          await supabase.from("tracking_messages").update({ tracking_id: keep.id }).eq("tracking_id", trackId);
        }
      }
      for (const trackId of removeTrackingIds) {
        if (!keepTrackingIds.includes(trackId)) {
          await supabase.from("client_tracking").delete().eq("id", trackId);
          deletedIdsRef.current.add(trackId);
        }
      }
      hideConversation(remove);
      setDeletedIds(new Set(deletedIdsRef.current));
      if (selected?.id === remove.id) setSelected(keep);
      toast.success(`Conversas mescladas. "${keep.nome_cliente}" mantida.`);
      await fetchConversations();
    } catch (err) {
      console.error("Merge duplicate error:", err);
      toast.error("Erro ao mesclar conversas");
    }
  }, [isAdminOrManager, selected, fetchConversations, hideConversation]);

  const [consolidating, setConsolidating] = useState(false);
  const handleConsolidateTrackings = useCallback(async (dryRun = false) => {
    if (!tenantId || !isAdminOrManager) return;
    setConsolidating(true);
    try {
      const [{ data: trackings }, { data: clients }] = await Promise.all([
        supabase.from("client_tracking").select("id, tenant_id, client_id, nome_cliente, numero_contrato, status, updated_at, created_at").eq("tenant_id", tenantId),
        supabase.from("clients").select("id, telefone1, telefone2").eq("tenant_id", tenantId),
      ]);

      const clientPhoneMap = new Map<string, string>();
      ((clients as Array<{ id: string; telefone1?: string | null; telefone2?: string | null }> | null) || []).forEach((client) => {
        const canonical = normalizePhone(client.telefone1 || client.telefone2 || "");
        if (canonical) clientPhoneMap.set(client.id, canonical);
      });

      const grouped = new Map<string, Array<{ id: string; client_id?: string | null; nome_cliente?: string | null; updated_at?: string | null; created_at?: string | null }>>();
      ((trackings as Array<{ id: string; client_id?: string | null; nome_cliente?: string | null; numero_contrato?: string | null; updated_at?: string | null; created_at?: string | null }> | null) || []).forEach((tracking) => {
        const byClient = tracking.client_id ? clientPhoneMap.get(tracking.client_id) : "";
        const byContract = normalizePhone(tracking.numero_contrato || "");
        const phone = byClient || byContract;
        if (!phone) return;
        const existing = grouped.get(phone) || [];
        grouped.set(phone, [...existing, tracking]);
      });

      const duplicateGroups = Array.from(grouped.entries()).filter(([, items]) => items.length > 1);
      if (duplicateGroups.length === 0) {
        toast.info("Nenhuma duplicata encontrada. Tudo limpo! ✅");
        return;
      }

      const preview = duplicateGroups.map(([phone, items]) => {
        const sorted = [...items].sort((a, b) => {
          if (a.client_id && !b.client_id) return -1;
          if (!a.client_id && b.client_id) return 1;
          return new Date(b.updated_at || b.created_at || 0).getTime() - new Date(a.updated_at || a.created_at || 0).getTime();
        });
        return { phone, keep: sorted[0], remove: sorted.slice(1) };
      });

      if (dryRun) {
        toast.info(`${preview.length} grupo(s) duplicado(s) encontrados. Clique novamente para consolidar.`, { duration: 7000 });
        return;
      }

      let totalRemoved = 0;
      let totalMessagesMoved = 0;
      for (const group of preview) {
        for (const remove of group.remove) {
          const { count } = await supabase.from("tracking_messages").select("id", { count: "exact", head: true }).eq("tracking_id", remove.id);
          await supabase.from("tracking_messages").update({ tracking_id: group.keep.id }).eq("tracking_id", remove.id);
          await supabase.from("client_tracking").delete().eq("id", remove.id);
          deletedIdsRef.current.add(remove.id);
          totalRemoved += 1;
          totalMessagesMoved += count || 0;
        }
      }

      setDeletedIds(new Set(deletedIdsRef.current));
      await fetchConversations();
      toast.success(`✅ ${preview.length} grupo(s) consolidado(s). ${totalRemoved} registro(s) removido(s), ${totalMessagesMoved} mensagem(ns) realocada(s).`, { duration: 8000 });
    } catch (err) {
      console.error("Consolidation error:", err);
      toast.error("Erro ao consolidar conversas duplicadas");
    } finally {
      setConsolidating(false);
    }
  }, [tenantId, isAdminOrManager, normalizePhone, fetchConversations]);

  const existingConvIds = useMemo(() => new Set(conversations.map((conversation) => conversation.id)), [conversations]);

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
          {isAdminOrManager && (
            <Button
              variant="ghost"
              size="sm"
              className="h-6 text-[10px] gap-1 px-2"
              onClick={() => handleConsolidateTrackings(consolidating ? false : true)}
              disabled={consolidating}
            >
              {consolidating ? <Loader2 className="h-3 w-3 animate-spin" /> : <Merge className="h-3 w-3" />}
              {consolidating ? "..." : "Consolidar"}
            </Button>
          )}
          {whatsappStatus === "online" && isAdminOrManager && (
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
            deletedIds={deletedIds}
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
                interventionMode={interventionMode}
                onModeChange={setInterventionMode}
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
                detectedDiscProfile={discProfile}
                vendazapActive={!!addon?.ativo}
                onCloseSale={handleCloseSaleFromAI}
              />
            </div>
              <ChatRightPanel
                conversation={selected}
                tenantId={tenantId}
                messageCount={messageCount}
                aiSuggestion={suggestion}
                aiLoading={aiLoading}
                aiTipoCopy={tipoCopy}
                aiDiscProfile={discProfile}
                onUseSuggestion={handleUseSuggestion}
                interventionMode={interventionMode}
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
            // Tag with current user's name so the conversation is private to them
            toast.loading("Criando conversa...", { id: "wa-flow", duration: 3000 });
            const { data: createdTracking, error: trackError } = await supabase
              .from("client_tracking")
              .insert({
                tenant_id: tenantId,
                client_id: clientId,
                nome_cliente: clientName,
                numero_contrato: contractNumber,
                status: "em_negociacao",
                projetista: currentUser?.nome_completo || null,
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

      {/* Close Sale Modal — triggered by AI Closer Banner */}
      <CloseSaleModal
        open={closeSaleOpen}
        onClose={() => setCloseSaleOpen(false)}
        onConfirm={handleCloseSaleConfirm as any}
        client={closeSaleClient}
        simulationData={closeSaleSimData}
        saving={closeSaleSaving}
      />
      </div>
    </div>
  );
}
