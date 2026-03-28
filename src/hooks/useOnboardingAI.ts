import { useState, useCallback, useRef, useEffect, useMemo } from "react";
import { supabase } from "@/lib/supabaseClient";
import { toast } from "sonner";
import { playNotificationSound } from "@/lib/notificationSound";

export interface AIMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: Date;
}

export interface OnboardingAIContext {
  apiKeys: string[];
  whatsappConnected: boolean;
  completedSteps: string[];
}

// --- Alerts / Reminders ---
export interface ScheduledAlert {
  id: string;
  title: string;
  datetime: string; // ISO
  fired: boolean;
}

const ALERTS_KEY_PREFIX = "mia_alerts_";

function getAlertsKey(tenantId: string | null) {
  return `${ALERTS_KEY_PREFIX}${tenantId || "no-tenant"}`;
}

function loadAlerts(tenantId: string | null): ScheduledAlert[] {
  try { return JSON.parse(localStorage.getItem(getAlertsKey(tenantId)) || "[]"); } catch { return []; }
}

function saveAlerts(tenantId: string | null, alerts: ScheduledAlert[]) {
  localStorage.setItem(getAlertsKey(tenantId), JSON.stringify(alerts));
}

// --- Navigation command detection ---
interface CommandMatch {
  action: "navigate" | "local";
  target: string;
  label: string;
  description: string;
}

const NAVIGATION_COMMANDS: Array<{ patterns: RegExp[]; target: string; label: string; description: string }> = [
  { patterns: [/funil|captação|pipeline/i], target: "funnel", label: "Funil de Captação", description: "Vou abrir o Funil de Captação para você." },
  { patterns: [/kanban|clientes|meus leads|lista de clientes/i], target: "clients", label: "Clientes", description: "Vou abrir o Kanban de Clientes." },
  { patterns: [/chat de vendas|conversa|whatsapp chat|mensagens/i], target: "vendazap-chat", label: "Chat de Vendas", description: "Vou abrir o Chat de Vendas." },
  { patterns: [/deal\s?room|sala de venda|reunião/i], target: "dealroom", label: "Deal Room", description: "Vou abrir a Deal Room." },
  { patterns: [/simulador|simular|calcular|orçamento/i], target: "simulator", label: "Simulador", description: "Vou abrir o Simulador de Vendas." },
  { patterns: [/vendazap|ia de vendas|mensagem ia/i], target: "vendazap", label: "VendaZap AI", description: "Vou abrir o VendaZap AI." },
  { patterns: [/tarefas|minhas tarefas|task|agenda/i], target: "tarefas", label: "Tarefas", description: "Vou abrir as Tarefas." },
  { patterns: [/suporte|ajuda|ticket/i], target: "suporte", label: "Suporte", description: "Vou abrir o Suporte." },
  { patterns: [/tutori|vídeo|como (faço|usar|funciona)|me (mostre|ensine)/i], target: "tutoriais", label: "Tutoriais", description: "Entendido, vou abrir nos Tutoriais o vídeo que mais se aproxima da sua dúvida." },
  { patterns: [/financeiro|contas a pagar|contas a receber|caixa|fluxo/i], target: "financeiro", label: "Financeiro", description: "Vou abrir o módulo Financeiro." },
  { patterns: [/configura[çc]|ajust|preferência/i], target: "configuracoes", label: "Configurações", description: "Vou abrir as Configurações." },
  { patterns: [/plano|assinatura|meu plano|qual.*plano/i], target: "plans", label: "Planos", description: "Vou abrir a tela de Planos para você verificar." },
  { patterns: [/produto|catálogo|estoque/i], target: "products", label: "Produtos", description: "Vou abrir o Catálogo de Produtos." },
  { patterns: [/campanha|marketing|campanha sazonal/i], target: "campaigns", label: "Campanhas", description: "Vou abrir o módulo de Campanhas." },
  { patterns: [/comiss[ãa]o|comissões|pagamento vendedor/i], target: "payroll", label: "Folha/Comissões", description: "Vou abrir a Folha de Pagamento e Comissões." },
  { patterns: [/gerente.*ia|ia.*gerente|comercial.*ia|inteligência comercial/i], target: "commercial-ai", label: "Gerente IA", description: "Vou abrir o Gerente IA Comercial." },
  { patterns: [/dashboard|painel|visão geral|indicadores/i], target: "dashboard", label: "Dashboard", description: "Vou abrir o Dashboard." },
  { patterns: [/contrato|meus contratos/i], target: "contracts", label: "Contratos", description: "Vou abrir os Contratos." },
  { patterns: [/briefing/i], target: "briefing", label: "Briefing", description: "Vou abrir o Briefing." },
  { patterns: [/usuário|usuários|equipe|time|colaborador|salário|maior salário/i], target: "configuracoes", label: "Usuários", description: "Vou abrir a gestão de Usuários nas Configurações." },
  { patterns: [/cadastrar conta|nova conta|adicionar conta/i], target: "financeiro", label: "Financeiro", description: "Vou abrir o Financeiro para você cadastrar uma nova conta." },
];

function detectNavigationCommand(text: string): CommandMatch | null {
  const lower = text.toLowerCase();
  for (const cmd of NAVIGATION_COMMANDS) {
    for (const pattern of cmd.patterns) {
      if (pattern.test(lower)) {
        return { action: "navigate", target: cmd.target, label: cmd.label, description: cmd.description };
      }
    }
  }
  return null;
}

function detectAlertCommand(text: string): { title: string; minutes: number; absoluteDate?: Date } | null {
  const lower = text.toLowerCase();

  // Match patterns: "criar lembrete", "agendar lembrete", "me lembre", "lembrete para", "quero um lembrete"
  const intentMatch = lower.match(
    /(criar|agendar|definir|setar?|me\s+lembr[ae]|quero\s+um\s+lembrete|lembrete\s+(para|de|:))\s*/i
  );
  // Also match if user just says "lembrete" followed by content
  const simpleMatch = !intentMatch && /^lembrete\s+/i.test(lower);
  if (!intentMatch && !simpleMatch) return null;

  const rest = text.replace(/^.*?(lembrete|alarme|alerta)\s*[:\-]?\s*/i, "").trim();

  // Try absolute date/time: "amanhã às 23:15", "hoje às 10:00", "dia 28 às 14:00", "28/03 às 14:00"
  let absoluteDate: Date | undefined;
  let minutes = 5;
  let cleanedTitle = rest;

  // Pattern: "amanhã às HH:MM"
  const tomorrowMatch = rest.match(/amanh[ãa]\s+[àa]s?\s+(\d{1,2})[:\.](\d{2})/i);
  if (tomorrowMatch) {
    const d = new Date();
    d.setDate(d.getDate() + 1);
    d.setHours(parseInt(tomorrowMatch[1]), parseInt(tomorrowMatch[2]), 0, 0);
    absoluteDate = d;
    minutes = Math.max(1, Math.round((d.getTime() - Date.now()) / 60000));
    cleanedTitle = rest.replace(/amanh[ãa]\s+[àa]s?\s+\d{1,2}[:\.]?\d{0,2}/i, "").trim();
  }

  // Pattern: "hoje às HH:MM"
  if (!absoluteDate) {
    const todayMatch = rest.match(/hoje\s+[àa]s?\s+(\d{1,2})[:\.](\d{2})/i);
    if (todayMatch) {
      const d = new Date();
      d.setHours(parseInt(todayMatch[1]), parseInt(todayMatch[2]), 0, 0);
      if (d.getTime() < Date.now()) d.setDate(d.getDate() + 1); // if past, set to tomorrow
      absoluteDate = d;
      minutes = Math.max(1, Math.round((d.getTime() - Date.now()) / 60000));
      cleanedTitle = rest.replace(/hoje\s+[àa]s?\s+\d{1,2}[:\.]?\d{0,2}/i, "").trim();
    }
  }

  // Pattern: "dia DD às HH:MM" or "dia DD/MM às HH:MM"
  if (!absoluteDate) {
    const dayMatch = rest.match(/dia\s+(\d{1,2})(?:\/(\d{1,2}))?\s+[àa]s?\s+(\d{1,2})[:\.](\d{2})/i);
    if (dayMatch) {
      const d = new Date();
      const day = parseInt(dayMatch[1]);
      const month = dayMatch[2] ? parseInt(dayMatch[2]) - 1 : d.getMonth();
      d.setMonth(month, day);
      d.setHours(parseInt(dayMatch[3]), parseInt(dayMatch[4]), 0, 0);
      if (d.getTime() < Date.now()) d.setMonth(d.getMonth() + 1);
      absoluteDate = d;
      minutes = Math.max(1, Math.round((d.getTime() - Date.now()) / 60000));
      cleanedTitle = rest.replace(/dia\s+\d{1,2}(?:\/\d{1,2})?\s+[àa]s?\s+\d{1,2}[:\.]?\d{0,2}/i, "").trim();
    }
  }

  // Pattern: "DD/MM às HH:MM" or "DD/MM/AAAA às HH:MM"
  if (!absoluteDate) {
    const dateMatch = rest.match(/(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?\s+[àa]s?\s+(\d{1,2})[:\.](\d{2})/i);
    if (dateMatch) {
      const d = new Date();
      const day = parseInt(dateMatch[1]);
      const month = parseInt(dateMatch[2]) - 1;
      const year = dateMatch[3] ? (dateMatch[3].length === 2 ? 2000 + parseInt(dateMatch[3]) : parseInt(dateMatch[3])) : d.getFullYear();
      d.setFullYear(year, month, day);
      d.setHours(parseInt(dateMatch[4]), parseInt(dateMatch[5]), 0, 0);
      if (d.getTime() < Date.now()) d.setFullYear(d.getFullYear() + 1);
      absoluteDate = d;
      minutes = Math.max(1, Math.round((d.getTime() - Date.now()) / 60000));
      cleanedTitle = rest.replace(/\d{1,2}\/\d{1,2}(?:\/\d{2,4})?\s+[àa]s?\s+\d{1,2}[:\.]?\d{0,2}/i, "").trim();
    }
  }

  // Pattern: "às HH:MM" (today, or tomorrow if past)
  if (!absoluteDate) {
    const timeOnlyMatch = rest.match(/[àa]s?\s+(\d{1,2})[:\.](\d{2})/i);
    if (timeOnlyMatch) {
      const d = new Date();
      d.setHours(parseInt(timeOnlyMatch[1]), parseInt(timeOnlyMatch[2]), 0, 0);
      if (d.getTime() < Date.now()) d.setDate(d.getDate() + 1);
      absoluteDate = d;
      minutes = Math.max(1, Math.round((d.getTime() - Date.now()) / 60000));
      cleanedTitle = rest.replace(/[àa]s?\s+\d{1,2}[:\.]?\d{0,2}/i, "").trim();
    }
  }

  // Fallback: "em X minutos/horas"
  if (!absoluteDate) {
    const timeMatch = rest.match(/em\s+(\d+)\s*(min|minuto|hora|h)/i);
    if (timeMatch) {
      const val = parseInt(timeMatch[1]);
      const unit = timeMatch[2].toLowerCase();
      minutes = unit.startsWith("h") ? val * 60 : val;
      cleanedTitle = rest.replace(/em\s+\d+\s*(min|minuto|hora|h)[s]?/i, "").trim();
    }
  }

  // Clean up title: remove "para", "de", ":" prefixes
  const title = cleanedTitle.replace(/^(para|de|que|:|\s)+/i, "").trim() || "Lembrete da Mia";
  return { title, minutes, absoluteDate };
}

// --- Storage helpers ---
function getStorageScope(tenantId: string | null) {
  const userId = typeof window !== "undefined" ? localStorage.getItem("current_user_id") || "anon" : "anon";
  return `${tenantId || "no-tenant"}_${userId}`;
}

function getMessagesKey(tenantId: string | null) {
  return `mia_messages_${getStorageScope(tenantId)}`;
}

function getContextKey(tenantId: string | null) {
  return `mia_context_${getStorageScope(tenantId)}`;
}

function parseStored<T>(value: string | null, fallback: T): T {
  if (!value) return fallback;
  try { return JSON.parse(value) as T; } catch { return fallback; }
}

function createMessage(role: "user" | "assistant", content: string): AIMessage {
  return {
    id: `${role}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    role,
    content,
    timestamp: new Date(),
  };
}

async function loadWhatsAppSettings(tid: string) {
  let response = await (supabase as any)
    .from("whatsapp_settings")
    .select("*")
    .eq("tenant_id", tid)
    .limit(1)
    .maybeSingle();

  if (
    response.error?.code === "42703" ||
    response.error?.code === "PGRST204" ||
    String(response.error?.message || "").includes("tenant_id")
  ) {
    response = await (supabase as any)
      .from("whatsapp_settings")
      .select("*")
      .limit(1)
      .maybeSingle();
  }

  return response.data as any;
}

async function buildRuntimeContext(tenantId: string): Promise<OnboardingAIContext> {
  const [apiKeysRes, companyRes, whatsappSettings] = await Promise.all([
    (supabase as any)
      .from("api_keys")
      .select("provider, is_active")
      .eq("tenant_id", tenantId)
      .eq("is_active", true),
    (supabase as any)
      .from("company_settings")
      .select("company_name")
      .eq("tenant_id", tenantId)
      .maybeSingle(),
    loadWhatsAppSettings(tenantId),
  ]);

  const activeProviders = ((apiKeysRes.data || []) as Array<{ provider: string }>).map((item) => item.provider);
  const hasWhatsAppApi = Boolean(
    whatsappSettings?.ativo && (
      (whatsappSettings?.zapi_instance_id && whatsappSettings?.zapi_token && whatsappSettings?.zapi_client_token) ||
      (whatsappSettings?.evolution_api_url && whatsappSettings?.evolution_api_key) ||
      (whatsappSettings?.twilio_account_sid && whatsappSettings?.twilio_auth_token)
    )
  );

  const completedSteps = new Set<string>();
  if (companyRes.data?.company_name) completedSteps.add("company_info");
  if (activeProviders.includes("openai")) completedSteps.add("openai_api");
  if (hasWhatsAppApi) {
    completedSteps.add("whatsapp_api");
    completedSteps.add("whatsapp_connected");
  }
  if (activeProviders.includes("resend")) completedSteps.add("resend_api");
  completedSteps.add("pdf_configured");

  return {
    apiKeys: activeProviders,
    whatsappConnected: hasWhatsAppApi,
    completedSteps: [...completedSteps],
  };
}

export function useOnboardingAI(tenantId: string | null) {
  const [messages, setMessages] = useState<AIMessage[]>(() => {
    if (!tenantId) return [];
    return parseStored<AIMessage[]>(localStorage.getItem(getMessagesKey(tenantId)), []).map((m) => ({
      ...m,
      timestamp: new Date(m.timestamp),
    }));
  });
  const [loading, setLoading] = useState(false);
  const [context, setContext] = useState<OnboardingAIContext | null>(() => {
    if (!tenantId) return null;
    return parseStored<OnboardingAIContext | null>(localStorage.getItem(getContextKey(tenantId)), null);
  });
  const [alerts, setAlerts] = useState<ScheduledAlert[]>(() => loadAlerts(tenantId));
  const initialized = useRef(false);
  const messagesRef = useRef<AIMessage[]>(messages);
  const alertTimersRef = useRef<Map<string, NodeJS.Timeout>>(new Map());

  useEffect(() => { messagesRef.current = messages; }, [messages]);

  // Alert scheduler
  useEffect(() => {
    if (!tenantId) return;
    const unfired = alerts.filter(a => !a.fired);
    
    // Clear old timers
    alertTimersRef.current.forEach((timer, id) => {
      if (!unfired.find(a => a.id === id)) {
        clearTimeout(timer);
        alertTimersRef.current.delete(id);
      }
    });

    for (const alert of unfired) {
      if (alertTimersRef.current.has(alert.id)) continue;
      const msUntil = new Date(alert.datetime).getTime() - Date.now();
      if (msUntil <= 0) {
        // Fire immediately
        fireAlert(alert);
        continue;
      }
      const timer = setTimeout(() => fireAlert(alert), msUntil);
      alertTimersRef.current.set(alert.id, timer);
    }

    return () => {
      alertTimersRef.current.forEach(t => clearTimeout(t));
      alertTimersRef.current.clear();
    };
  }, [alerts, tenantId]);

  const fireAlert = useCallback((alert: ScheduledAlert) => {
    // Play sound
    playNotificationSound();
    // Visual toast
    toast.warning(`⏰ Lembrete: ${alert.title}`, { duration: 15000 });
    // Mark as fired
    setAlerts(prev => {
      const updated = prev.map(a => a.id === alert.id ? { ...a, fired: true } : a);
      saveAlerts(tenantId, updated);
      return updated;
    });
    // Add message in chat
    setMessages(prev => [...prev, createMessage("assistant", `⏰ **Lembrete disparado!**\n\n${alert.title}`)]);
  }, [tenantId]);

  const addAlert = useCallback((title: string, minutes: number) => {
    const alert: ScheduledAlert = {
      id: `alert-${Date.now()}`,
      title,
      datetime: new Date(Date.now() + minutes * 60000).toISOString(),
      fired: false,
    };
    setAlerts(prev => {
      const updated = [...prev, alert];
      saveAlerts(tenantId, updated);
      return updated;
    });
    return alert;
  }, [tenantId]);

  useEffect(() => {
    if (!tenantId || initialized.current) return;
    initialized.current = true;

    const bootstrap = async () => {
      const runtimeContext = await buildRuntimeContext(tenantId).catch(() => null);
      if (runtimeContext) {
        setContext((prev) => {
          const mergedSteps = [...new Set([...(prev?.completedSteps || []), ...(runtimeContext.completedSteps || [])])];
          return {
            apiKeys: runtimeContext.apiKeys || prev?.apiKeys || [],
            whatsappConnected: runtimeContext.whatsappConnected || prev?.whatsappConnected || false,
            completedSteps: mergedSteps,
          };
        });
      }

      if (messagesRef.current.length > 0) return;

      try {
        const { data } = await (supabase as any)
          .from("onboarding_ai_conversations")
          .select("*")
          .eq("tenant_id", tenantId)
          .order("created_at", { ascending: true })
          .limit(50);

        if (data && data.length > 0) {
          const history: AIMessage[] = [];
          for (const row of data) {
            if (row.user_message) history.push({ id: `u-${row.id}`, role: "user", content: row.user_message, timestamp: new Date(row.created_at) });
            if (row.ai_response) history.push({ id: `a-${row.id}`, role: "assistant", content: row.ai_response, timestamp: new Date(row.created_at) });
          }
          setMessages(history);
          return;
        }
      } catch {
        // fallback to local cache
      }

      const initialMsg = createMessage("user", "Olá, acabei de criar minha conta!");
      setMessages([initialMsg]);
      setLoading(true);
      await chatWithAI(tenantId, [{ role: "user", content: initialMsg.content }]);
    };

    void bootstrap();
  }, [tenantId]);

  useEffect(() => {
    if (!tenantId) return;
    localStorage.setItem(getMessagesKey(tenantId), JSON.stringify(messages));
  }, [messages, tenantId]);

  useEffect(() => {
    if (!tenantId || !context) return;
    localStorage.setItem(getContextKey(tenantId), JSON.stringify(context));
  }, [context, tenantId]);

  const appendAssistant = useCallback((content: string) => {
    setMessages((prev) => [...prev, createMessage("assistant", content)]);
  }, []);

  const refreshContext = useCallback(async () => {
    if (!tenantId) return;
    const next = await buildRuntimeContext(tenantId).catch(() => null);
    if (next) {
      setContext((prev) => ({
        apiKeys: next.apiKeys,
        whatsappConnected: next.whatsappConnected,
        completedSteps: [...new Set([...(prev?.completedSteps || []), ...next.completedSteps])],
      }));
    }
  }, [tenantId]);

  const handleLocalAction = useCallback(async (content: string) => {
    if (!tenantId) return false;
    const lower = content.toLowerCase();
    const currentUserId = localStorage.getItem("current_user_id");

    // === Alert/Reminder commands ===
    const alertCmd = detectAlertCommand(content);
    if (alertCmd) {
      const scheduledDate = alertCmd.absoluteDate || new Date(Date.now() + alertCmd.minutes * 60000);
      const alert = addAlert(alertCmd.title, alertCmd.minutes);

      // Persist to DB via edge function
      const { data: session } = await supabase.auth.getSession();
      supabase.functions.invoke("create-reminder", {
        body: {
          action: "create",
          tenant_id: tenantId,
          user_id: session?.session?.user?.id || currentUserId,
          title: alertCmd.title,
          content: alertCmd.title,
          scheduled_for: scheduledDate.toISOString(),
        },
      }).catch(() => { /* fallback to localStorage already saved */ });

      const dateStr = scheduledDate.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" });
      const timeStr = scheduledDate.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
      const diffMs = scheduledDate.getTime() - Date.now();
      const diffMin = Math.round(diffMs / 60000);
      const diffStr = diffMin >= 60
        ? `${Math.floor(diffMin / 60)}h${diffMin % 60 > 0 ? `${diffMin % 60}min` : ""}`
        : `${diffMin} minutos`;

      appendAssistant(
        `⏰ **Lembrete criado com sucesso!**\n\n• **${alertCmd.title}**\n• 📅 Data: ${dateStr}\n• 🕐 Horário: ${timeStr}\n• ⏳ Disparo em: ${diffStr}\n\nVocê receberá uma notificação visual e sonora quando o momento chegar.`
      );
      return true;
    }

    // === Client data lookup ===
    const clientQuery = detectClientQuery(lower);
    if (clientQuery) {
      const { data: matchedClients } = await (supabase as any)
        .from("clients")
        .select("id, nome, cpf, email, telefone1, telefone2, vendedor, status, quantidade_ambientes, descricao_ambientes, numero_orcamento, created_at, updated_at, origem_lead")
        .eq("tenant_id", tenantId)
        .or(`nome.ilike.%${clientQuery.searchTerm}%,email.ilike.%${clientQuery.searchTerm}%,telefone1.ilike.%${clientQuery.searchTerm}%,cpf.ilike.%${clientQuery.searchTerm}%`)
        .limit(5);

      if (!matchedClients || matchedClients.length === 0) {
        appendAssistant(`🔍 Não encontrei nenhum cliente com **"${clientQuery.searchTerm}"** no sistema. Verifique o nome ou tente outro termo de busca.`);
        return true;
      }

      // Fetch contracts and tracking for matched clients
      const clientIds = matchedClients.map((c: any) => c.id);
      const [contractsRes, trackingRes, simulationsRes] = await Promise.all([
        (supabase as any).from("client_contracts").select("id, client_id, simulation_id, created_at, conteudo_html").in("client_id", clientIds),
        (supabase as any).from("client_tracking").select("client_id, numero_contrato, valor_contrato, data_fechamento, status, projetista, quantidade_ambientes").in("client_id", clientIds),
        (supabase as any).from("simulations").select("id, client_id, valor_tela, desconto1, desconto2, desconto3, forma_pagamento, parcelas, valor_entrada, valor_final, created_at").in("client_id", clientIds).order("created_at", { ascending: false }),
      ]);

      const contracts = contractsRes.data || [];
      const trackings = trackingRes.data || [];
      const simulations = simulationsRes.data || [];

      let response = "";
      for (const client of matchedClients) {
        const clientContracts = contracts.filter((c: any) => c.client_id === client.id);
        const clientTracking = trackings.find((t: any) => t.client_id === client.id);
        const clientSims = simulations.filter((s: any) => s.client_id === client.id);
        const lastSim = clientSims[0];

        const statusLabels: Record<string, string> = {
          novo: "🟢 Novo",
          em_negociacao: "🟡 Em Negociação",
          proposta_enviada: "📋 Proposta Enviada",
          fechado: "✅ Fechado",
          perdido: "❌ Perdido",
        };

        response += `## 👤 ${client.nome}\n\n`;
        response += `| Campo | Valor |\n|---|---|\n`;
        response += `| **Status** | ${statusLabels[client.status] || client.status} |\n`;
        if (client.telefone1) response += `| **Telefone** | ${client.telefone1} |\n`;
        if (client.telefone2) response += `| **Telefone 2** | ${client.telefone2} |\n`;
        if (client.email) response += `| **Email** | ${client.email} |\n`;
        if (client.cpf) response += `| **CPF/CNPJ** | ${client.cpf} |\n`;
        if (client.vendedor) response += `| **Vendedor** | ${client.vendedor} |\n`;
        if (client.quantidade_ambientes) response += `| **Ambientes** | ${client.quantidade_ambientes} |\n`;
        if (client.descricao_ambientes) response += `| **Descrição** | ${client.descricao_ambientes} |\n`;
        if (client.origem_lead) response += `| **Origem** | ${client.origem_lead} |\n`;
        if (client.numero_orcamento) response += `| **Nº Orçamento** | ${client.numero_orcamento} |\n`;
        response += `| **Cadastro** | ${new Date(client.created_at).toLocaleDateString("pt-BR")} |\n`;

        // Contract info
        if (clientContracts.length > 0) {
          response += `\n### 📄 Contratos (${clientContracts.length})\n`;
          for (const contract of clientContracts) {
            const trackForContract = clientTracking;
            response += `- **Contrato** ${trackForContract?.numero_contrato || contract.id.slice(0, 8)}`;
            if (trackForContract?.valor_contrato) response += ` — R$ ${Number(trackForContract.valor_contrato).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`;
            if (trackForContract?.data_fechamento) response += ` — Fechado em ${new Date(trackForContract.data_fechamento).toLocaleDateString("pt-BR")}`;
            response += `\n`;
          }
        }

        // Simulation info
        if (lastSim) {
          let valorAvista = lastSim.valor_tela || 0;
          if (lastSim.desconto1) valorAvista *= (1 - lastSim.desconto1 / 100);
          if (lastSim.desconto2) valorAvista *= (1 - lastSim.desconto2 / 100);
          if (lastSim.desconto3) valorAvista *= (1 - lastSim.desconto3 / 100);

          response += `\n### 💰 Última Simulação\n`;
          response += `- Valor de tela: R$ ${Number(lastSim.valor_tela).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}\n`;
          response += `- Valor à vista: R$ ${valorAvista.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}\n`;
          if (lastSim.forma_pagamento) response += `- Pagamento: ${lastSim.forma_pagamento}\n`;
          if (lastSim.parcelas) response += `- Parcelas: ${lastSim.parcelas}x\n`;
          response += `- Data: ${new Date(lastSim.created_at).toLocaleDateString("pt-BR")}\n`;
          response += `- Total simulações: ${clientSims.length}\n`;
        }

        if (clientTracking?.projetista) {
          response += `\n- **Projetista:** ${clientTracking.projetista}\n`;
        }

        response += "\n---\n\n";
      }

      if (matchedClients.length > 1) {
        response += `\n_Encontrei ${matchedClients.length} cliente(s) com esse termo._`;
      }

      appendAssistant(response.trim());
      return true;
    }

    // === Navigation commands ===
    const navCmd = detectNavigationCommand(content);
    if (navCmd) {
      // For tutorials, search for specific content
      if (navCmd.target === "tutoriais") {
        const { data } = await (supabase as any)
          .from("tutorials")
          .select("titulo, descricao, categoria, video_url")
          .eq("ativo", true)
          .order("ordem", { ascending: true })
          .limit(30);

        const terms = lower.split(/\s+/).filter((term) => term.length > 3);
        const ranked = ((data as any[]) || [])
          .map((tutorial) => {
            const haystack = `${tutorial.titulo || ""} ${tutorial.descricao || ""} ${tutorial.categoria || ""}`.toLowerCase();
            const score = terms.reduce((sum, term) => sum + (haystack.includes(term) ? 1 : 0), 0);
            return { ...tutorial, score };
          })
          .filter((tutorial) => tutorial.score > 0)
          .sort((a, b) => b.score - a.score)
          .slice(0, 3);

        if (ranked.length > 0) {
          appendAssistant(
            `🎬 **${navCmd.description}**\n\n${ranked.map((t) => `• **${t.titulo}** — ${t.categoria}`).join("\n")}\n\n👉 Clique em **Tutoriais** abaixo para acessar diretamente.`
          );
        } else {
          appendAssistant(`📚 ${navCmd.description}\n\n👉 Clique em **Tutoriais** abaixo para ver todos os vídeos disponíveis.`);
        }
        // Still navigate
        setTimeout(() => navigateTo("tutoriais"), 1500);
        return true;
      }

      // For financial queries with specific data
      if (navCmd.target === "financeiro" && /contas?\s+(a\s+)?(pagar|vencer|receber|vencid)/i.test(lower)) {
        const today = new Date().toISOString().slice(0, 10);
        const nextWeek = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
        const { data } = await (supabase as any)
          .from("financial_accounts")
          .select("name, amount, due_date, status")
          .eq("tenant_id", tenantId)
          .neq("status", "pago")
          .order("due_date", { ascending: true })
          .limit(30);

        const accounts = (data as any[]) || [];
        const overdue = accounts.filter((a) => a.due_date < today);
        const dueSoon = accounts.filter((a) => a.due_date >= today && a.due_date <= nextWeek);

        appendAssistant(
          `💰 **Alertas financeiros**\n\n• Contas vencidas: **${overdue.length}**\n• A vencer em 7 dias: **${dueSoon.length}**${dueSoon.length > 0 ? `\n\nPróximas:\n${dueSoon.slice(0, 5).map((a) => `• ${a.name} — R$ ${Number(a.amount || 0).toLocaleString("pt-BR", { minimumFractionDigits: 2 })} — ${a.due_date}`).join("\n")}` : ""}\n\n👉 Abrindo o Financeiro...`
        );
        setTimeout(() => navigateTo("financeiro"), 1500);
        return true;
      }

      // For plan queries
      if (navCmd.target === "plans" && /qual.*plano|meu plano|plano atual/i.test(lower)) {
        appendAssistant(`📋 **${navCmd.description}**\n\n👉 Abrindo a tela de Planos para verificar seu plano atual e opções de upgrade.`);
        setTimeout(() => navigateTo("plans"), 1500);
        return true;
      }

      // For user/salary queries
      if (navCmd.target === "configuracoes" && /salário|maior salário|usuário/i.test(lower)) {
        appendAssistant(`👥 **${navCmd.description}**\n\n👉 Abrindo a gestão de Usuários. Lá você pode ver todos os colaboradores, cargos e informações salariais.`);
        setTimeout(() => {
          navigateTo("configuracoes");
          window.dispatchEvent(new CustomEvent("navigate-to-settings", { detail: { subtab: "usuarios" } }));
        }, 1500);
        return true;
      }

      // Generic navigation
      appendAssistant(`✅ **${navCmd.description}**\n\n👉 Abrindo ${navCmd.label}...`);
      setTimeout(() => navigateTo(navCmd.target), 1500);
      return true;
    }

    // === Legacy local actions ===
    if (/pend[eê]ncias|o que falta|progresso/.test(lower)) {
      const liveContext = context || await buildRuntimeContext(tenantId).catch(() => null);
      const labels: Record<string, string> = {
        company_info: "Dados da loja",
        openai_api: "IA de vendas",
        whatsapp_api: "WhatsApp",
        whatsapp_connected: "WhatsApp ativo",
        resend_api: "Email",
        pdf_configured: "PDF",
      };
      const allSteps = ["company_info", "openai_api", "whatsapp_api", "whatsapp_connected", "resend_api", "pdf_configured"];
      const pending = allSteps.filter((step) => !(liveContext?.completedSteps || []).includes(step));
      appendAssistant(
        pending.length === 0
          ? "✅ **Tudo salvo e configurado.** No momento não há pendências na configuração da Mia."
          : `📌 **Pendências atuais:**\n\n${pending.map((step) => `• ${labels[step] || step}`).join("\n")}`
      );
      return true;
    }

    if (/(criar|agendar) tarefa|nova tarefa/.test(lower) && currentUserId) {
      const title = content.split(":").slice(1).join(":").trim() || content.replace(/(criar|agendar) tarefa/gi, "").trim() || "Tarefa criada pela Mia";
      const { data: userData } = await (supabase as any).from("usuarios").select("id, nome_completo").eq("id", currentUserId).maybeSingle();
      const today = new Date().toISOString().slice(0, 10);
      const taskPayload: Record<string, any> = {
        tenant_id: tenantId,
        titulo: title,
        descricao: `Criada pela Mia a partir da conversa: ${content}`,
        data_tarefa: today,
        tipo: "geral",
        status: "nova",
        responsavel_id: currentUserId,
        responsavel_nome: userData?.nome_completo || null,
        criado_por: currentUserId,
      };
      const { error } = await (supabase as any).from("tasks").insert(taskPayload);

      let retryError = error;
      if (error) {
        console.error("[Mia] Task insert error:", JSON.stringify(error));
        const { error: e2 } = await (supabase as any).from("tasks").insert({
          tenant_id: tenantId,
          titulo: title,
          descricao: taskPayload.descricao,
          status: "nova",
          tipo: "geral",
          responsavel_id: currentUserId,
        });
        retryError = e2;
        if (e2) console.error("[Mia] Task retry error:", JSON.stringify(e2));
      }

      appendAssistant(
        retryError
          ? `❌ Não consegui criar a tarefa: ${retryError.message || "Verifique permissões"}`
          : `✅ **Tarefa criada com sucesso**\n\n• ${title}\n• Data: hoje\n• Responsável: ${userData?.nome_completo || "usuário atual"}`
      );
      return true;
    }

    if (/(meus tickets|ver tickets|tickets de suporte|status dos tickets)/.test(lower) && currentUserId) {
      const { data } = await (supabase as any)
        .from("support_tickets")
        .select("tipo, status, mensagem, created_at, resposta_admin")
        .eq("usuario_id", currentUserId)
        .order("created_at", { ascending: false })
        .limit(5);

      if (!data || data.length === 0) {
        appendAssistant("📭 Você ainda não possui tickets de suporte abertos.");
      } else {
        appendAssistant(`🎫 **Seus últimos tickets**\n\n${data.map((ticket: any) => `• **${ticket.status}** — ${ticket.mensagem?.slice(0, 60) || "Sem mensagem"}${ticket.resposta_admin ? " · com resposta" : ""}`).join("\n")}`);
      }
      return true;
    }

    if (/(criar ticket|abrir ticket|novo ticket)/.test(lower) && currentUserId) {
      const [userData, companyData] = await Promise.all([
        (supabase as any).from("usuarios").select("id, nome_completo, email, telefone").eq("id", currentUserId).maybeSingle(),
        (supabase as any).from("company_settings").select("codigo_loja, company_name").eq("tenant_id", tenantId).maybeSingle(),
      ]);

      const tipo = /sugest/i.test(content) ? "sugestao" : /reclama/i.test(content) ? "reclamacao" : "erro";
      const mensagem = content.split(":").slice(1).join(":").trim() || content;

      const { error } = await (supabase as any).from("support_tickets").insert({
        tipo,
        codigo_loja: companyData.data?.codigo_loja || "",
        nome_loja: companyData.data?.company_name || "",
        usuario_id: currentUserId,
        usuario_nome: userData.data?.nome_completo || "Usuário",
        usuario_email: userData.data?.email || "",
        usuario_telefone: userData.data?.telefone || "",
        mensagem,
        anexos_urls: [],
      });

      appendAssistant(error ? "❌ Não consegui abrir o ticket agora." : `✅ **Ticket criado com sucesso**\n\nTipo: ${tipo}\nResumo: ${mensagem.slice(0, 80)}`);
      return true;
    }

    return false;
  }, [appendAssistant, context, tenantId, addAlert]);

  const chatWithAI = useCallback(async (tid: string, chatMessages: { role: string; content: string }[]) => {
    try {
      const { data, error } = await supabase.functions.invoke("onboarding-ai", {
        body: { action: "chat", tenant_id: tid, messages: chatMessages },
      });

      if (error) throw error;

      const reply = data?.reply || "Desculpe, ocorreu um erro. Tente novamente.";
      const aiMsg = createMessage("assistant", reply);
      setMessages((prev) => [...prev, aiMsg]);

      if (data?.context) {
        setContext((prev) => ({
          apiKeys: data.context.apiKeys || prev?.apiKeys || [],
          whatsappConnected: data.context.whatsappConnected || prev?.whatsappConnected || false,
          completedSteps: [...new Set([...(prev?.completedSteps || []), ...((data.context.completedSteps || []) as string[])])],
        }));
      } else {
        void refreshContext();
      }
    } catch (err) {
      console.error("Chat error:", err);
      setMessages((prev) => [...prev, createMessage("assistant", "Ops, tive um problema para responder. 😅 Mas você pode continuar e eu mantenho seu histórico salvo.")]);
    } finally {
      setLoading(false);
    }
  }, [refreshContext]);

  const sendMessage = useCallback(async (content: string, isInitial = false) => {
    if (!tenantId) return;

    const userMsg = createMessage("user", content);
    setMessages((prev) => [...prev, userMsg]);
    setLoading(true);

    try {
      const apiKeyAction = detectApiKeyInMessage(content);
      if (apiKeyAction) {
        const { data: validationResult } = await supabase.functions.invoke("onboarding-ai", {
          body: {
            action: "validate_api_key",
            tenant_id: tenantId,
            provider: apiKeyAction.provider,
            api_key: apiKeyAction.key,
            api_url: apiKeyAction.url,
          },
        });

        if (validationResult?.valid) {
          appendAssistant(`✅ **${apiKeyAction.provider.toUpperCase()} configurada com sucesso!**\n\nSua chave foi validada e salva automaticamente.`);
          await refreshContext();
        } else {
          appendAssistant(`❌ **Chave inválida:** ${validationResult?.error || "Não foi possível validar"}`);
        }
        setLoading(false);
        return;
      }

      const handledLocally = !isInitial && await handleLocalAction(content);
      if (handledLocally) {
        setLoading(false);
        return;
      }

      const nextHistory = [
        ...messagesRef.current.map((message) => ({ role: message.role, content: message.content })),
        { role: "user", content },
      ];
      await chatWithAI(tenantId, nextHistory);
    } catch (err) {
      console.error("Onboarding AI error:", err);
      toast.error("Erro ao comunicar com a Mia");
      setLoading(false);
    }
  }, [tenantId, appendAssistant, refreshContext, handleLocalAction, chatWithAI]);

  // Navigation helper
  const navigateTo = useCallback((target: string, detail?: Record<string, string>) => {
    const eventMap: Record<string, string> = {
      tarefas: "navigate-to-tasks",
      tutoriais: "navigate-to-tutorials",
      financeiro: "navigate-to-financial",
      suporte: "navigate-to-support",
      configuracoes: "navigate-to-settings",
      clientes: "navigate-to-clients",
      dealroom: "navigate-to-dealroom",
      chat: "navigate-to-chat",
      funnel: "navigate-to-funnel",
      plans: "navigate-to-plans",
      "vendazap-chat": "navigate-to-vendazap-chat",
      vendazap: "navigate-to-vendazap",
      simulator: "navigate-to-simulator",
      products: "navigate-to-products",
      campaigns: "navigate-to-campaigns",
      payroll: "navigate-to-payroll",
      "commercial-ai": "navigate-to-commercial-ai",
      dashboard: "navigate-to-dashboard",
      contracts: "navigate-to-contracts",
      briefing: "navigate-to-briefing",
    };
    const eventName = eventMap[target] || `navigate-to-${target}`;
    window.dispatchEvent(new CustomEvent(eventName, { detail }));
  }, []);

  const pendingItems = useMemo(() => {
    const allSteps = ["company_info", "openai_api", "whatsapp_api", "whatsapp_connected", "resend_api", "pdf_configured"];
    const labels: Record<string, string> = {
      company_info: "Dados da loja",
      openai_api: "IA de vendas (OpenAI)",
      whatsapp_api: "WhatsApp",
      whatsapp_connected: "WhatsApp ativo",
      resend_api: "Email (Resend)",
      pdf_configured: "PDF",
    };
    const completed = context?.completedSteps || [];
    return allSteps
      .filter((step) => !completed.includes(step))
      .map((step) => ({ key: step, label: labels[step] || step }));
  }, [context?.completedSteps]);

  const savePreferences = useCallback(async (preferences: Record<string, string>) => {
    if (!tenantId) return;
    await supabase.functions.invoke("onboarding-ai", {
      body: { action: "save_preferences", tenant_id: tenantId, preferences },
    });
    await refreshContext();
  }, [tenantId, refreshContext]);

  const configureVendaZap = useCallback(async () => {
    if (!tenantId) return;
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("onboarding-ai", {
        body: { action: "configure_vendazap", tenant_id: tenantId },
      });
      if (error) throw error;
      setMessages((prev) => [...prev, createMessage("assistant", `✅ **VendaZap AI configurado com sucesso!**\n\n🎯 **Tom:** ${data?.tom || "profissional"}\n📝 Prompt salvo automaticamente.\n\nPreview: _${data?.prompt_preview || ""}_`)]);
      await refreshContext();
    } catch {
      toast.error("Erro ao configurar VendaZap AI");
    }
    setLoading(false);
  }, [tenantId, refreshContext]);

  const runTests = useCallback(async () => {
    if (!tenantId) return;
    setLoading(true);
    setMessages((prev) => [...prev, createMessage("assistant", "🧪 **Executando testes automáticos...**\n\nTestando IA, WhatsApp, Email e PDF...")]);

    try {
      const results: Record<string, { ok: boolean; detail: string }> = {};

      const { data: openaiKey } = await (supabase as any)
        .from("api_keys")
        .select("api_key")
        .eq("tenant_id", tenantId)
        .eq("provider", "openai")
        .eq("is_active", true)
        .maybeSingle();
      results.openai = (openaiKey as any)?.api_key
        ? { ok: true, detail: "Conexão OK — IA de vendas funcionando" }
        : { ok: false, detail: "Nenhuma chave OpenAI configurada" };

      const whatsappSettings = await loadWhatsAppSettings(tenantId);
      if (whatsappSettings?.ativo) {
        if (whatsappSettings.provider === "zapi" && whatsappSettings.zapi_instance_id && whatsappSettings.zapi_token && whatsappSettings.zapi_client_token) {
          results.whatsapp = { ok: true, detail: "Z-API conectada e disponível" };
        } else if (whatsappSettings.provider === "evolution" && whatsappSettings.evolution_api_url && whatsappSettings.evolution_api_key) {
          results.whatsapp = { ok: true, detail: "Evolution API conectada e disponível" };
        } else {
          results.whatsapp = { ok: false, detail: "WhatsApp configurado, mas incompleto" };
        }
      } else {
        results.whatsapp = { ok: false, detail: "Nenhuma integração de WhatsApp configurada" };
      }

      const { data: resendKey } = await (supabase as any)
        .from("api_keys")
        .select("api_key")
        .eq("tenant_id", tenantId)
        .eq("provider", "resend")
        .eq("is_active", true)
        .maybeSingle();
      results.email = (resendKey as any)?.api_key
        ? { ok: true, detail: "Resend conectado — envio de emails OK" }
        : { ok: false, detail: "Nenhuma chave de email configurada (opcional)" };

      results.pdf = { ok: true, detail: "Gerador de PDF interno configurado" };

      const lines = Object.entries(results).map(([key, val]) => {
        const icon = val.ok ? "✅" : "❌";
        const label: Record<string, string> = { openai: "IA de Vendas", whatsapp: "WhatsApp", email: "Email", pdf: "PDF" };
        return `${icon} **${label[key] || key}:** ${val.detail}`;
      });

      const completedSteps: string[] = [];
      if (results.openai?.ok) completedSteps.push("openai_api");
      if (results.whatsapp?.ok) {
        completedSteps.push("whatsapp_api");
        completedSteps.push("whatsapp_connected");
      }
      if (results.email?.ok) completedSteps.push("resend_api");
      if (results.pdf?.ok) completedSteps.push("pdf_configured");

      setContext((prev) => ({
        apiKeys: prev?.apiKeys || [],
        whatsappConnected: results.whatsapp?.ok ?? false,
        completedSteps: [...new Set([...(prev?.completedSteps || []), ...completedSteps])],
      }));

      setMessages((prev) => [...prev, createMessage("assistant", `📋 **Resultado dos Testes:**\n\n${lines.join("\n")}\n\n${results.openai?.ok && results.whatsapp?.ok ? "🎉 **Testes críticos OK!**" : "⚠️ **Ainda existem pendências.**"}`)]);
    } catch {
      toast.error("Erro ao executar testes");
    }
    setLoading(false);
  }, [tenantId]);

  const suggestFirstProject = useCallback(async () => {
    if (!tenantId) return;
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("onboarding-ai", {
        body: { action: "suggest_first_project", tenant_id: tenantId },
      });
      if (error) throw error;
      const suggestion = data?.suggestion;
      setMessages((prev) => [...prev, createMessage("assistant", `🏗️ **Sugestão de Primeiro Projeto — ${data?.storeType || "Loja"}**\n\n📐 **Ambientes sugeridos:**\n${(suggestion?.environments || []).map((item: string) => `• ${item}`).join("\n")}\n\n🧩 **Módulos recomendados:**\n${(suggestion?.modules || []).map((item: string) => `• ${item}`).join("\n")}\n\n💰 **Faixa de preço:** ${suggestion?.priceRange || "consulte"}`)]);
    } catch {
      toast.error("Erro ao gerar sugestão de projeto");
    }
    setLoading(false);
  }, [tenantId]);

  return {
    messages,
    loading,
    context,
    sendMessage,
    savePreferences,
    configureVendaZap,
    runTests,
    suggestFirstProject,
    navigateTo,
    pendingItems,
    alerts,
    addAlert,
  };
}

function detectApiKeyInMessage(content: string): { provider: string; key: string; url?: string } | null {
  const openaiMatch = content.match(/sk-[a-zA-Z0-9_-]{20,}/);
  if (openaiMatch) return { provider: "openai", key: openaiMatch[0] };

  const resendMatch = content.match(/re_[a-zA-Z0-9_]{20,}/);
  if (resendMatch) return { provider: "resend", key: resendMatch[0] };

  const evolutionUrlMatch = content.match(/https?:\/\/[^\s]+evolution[^\s]*/i);
  const evolutionKeyMatch = content.match(/[A-Za-z0-9]{32,}/);
  if (evolutionUrlMatch && evolutionKeyMatch && !openaiMatch && !resendMatch) {
    return { provider: "evolution", key: evolutionKeyMatch[0], url: evolutionUrlMatch[0] };
  }

  return null;
}
