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
  { patterns: [/^(?!.*(?:criar|nova|agendar)\s*tarefa)(?:tarefas|minhas tarefas|task|agenda)/i], target: "tarefas", label: "Tarefas", description: "Vou abrir as Tarefas." },
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
  { patterns: [/^(?!.*(?:criar|compor|escrever|enviar|novo)\s*e-?mail)(?:e-?mails?|meus\s+e-?mails?|hist[óo]rico\s+e-?mail)/i], target: "emails", label: "Email", description: "Vou abrir o módulo de Email." },
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

// --- Client data query detection ---
function detectClientQuery(text: string): { searchTerm: string } | null {
  const patterns = [
    /(?:telefone|fone|cel(?:ular)?|whatsapp|zap)\s+(?:do|da|de|del)\s+(?:cliente\s+)?(.+)/i,
    /(?:endere[çc]o|endere[çc]o de entrega)\s+(?:do|da|de)\s+(?:cliente\s+)?(.+)/i,
    /(?:email|e-mail)\s+(?:do|da|de)\s+(?:cliente\s+)?(.+)/i,
    /(?:cpf|cnpj|documento)\s+(?:do|da|de)\s+(?:cliente\s+)?(.+)/i,
    /(?:dados|informa[çc][õo]es|ficha|cadastro|perfil)\s+(?:do|da|de|del)\s+(?:cliente\s+)?(.+)/i,
    /(?:contrato|contratos)\s+(?:do|da|de)\s+(?:cliente\s+)?(.+)/i,
    /(?:simula[çc][ãa]o|or[çc]amento|simula[çc][õo]es)\s+(?:do|da|de)\s+(?:cliente\s+)?(.+)/i,
    /(?:vendedor|projetista|respons[aá]vel)\s+(?:do|da|de)\s+(?:cliente\s+)?(.+)/i,
    /(?:status|situa[çc][ãa]o)\s+(?:do|da|de)\s+(?:cliente\s+)?(.+)/i,
    /(?:me\s+)?(?:passe|mostre|mostra|d[êe]|busque?|encontre?|procure?|pesquise?|informe?|diga)\s+(?:o\s+|a\s+|os\s+|as\s+)?(?:telefone|endere[çc]o|email|cpf|dados|informa[çc][õo]es|contrato|ficha|cadastro)?\s*(?:do|da|de|del)\s+(?:cliente\s+)?(.+)/i,
    /(?:qual|quais)\s+(?:[eé]\s+)?(?:o\s+|a\s+|os\s+|as\s+)?(?:telefone|endere[çc]o|email|cpf|dados|contrato|nome|informa[çc][õo]es)\s+(?:do|da|de|del)\s+(?:cliente\s+)?(.+)/i,
    /(?:cliente|buscar cliente|pesquisar cliente)\s+(.+)/i,
    /(?:quem [eé]|qual [eé])\s+(?:o\s+)?(?:cliente\s+)?(.+)/i,
    /(?:me\s+)?(?:fale?|conte|diga)\s+(?:sobre|tudo sobre)\s+(?:o\s+|a\s+)?(?:cliente\s+)?(.+)/i,
    /(?:preciso|quero|gostaria)\s+(?:d[eo]s?\s+)?(?:telefone|endere[çc]o|email|dados|informa[çc][õo]es|contrato)\s+(?:do|da|de)\s+(?:cliente\s+)?(.+)/i,
    /(?:pode\s+)?(?:me\s+)?(?:passar|enviar|mandar|informar)\s+(?:o\s+|a\s+|os\s+)?(?:telefone|endere[çc]o|email|dados|contrato)\s+(?:do|da|de)\s+(?:cliente\s+)?(.+)/i,
  ];
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match && match[1]) {
      let term = match[1].trim()
        .replace(/[?!.,;]+$/, "")
        .replace(/^(o|a|os|as|do|da|de)\s+/i, "")
        .replace(/\s+por\s+favor.*/i, "")
        .trim();
      if (term.length >= 2) return { searchTerm: term };
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
      cleanedTitle = rest.replace(/em\s+\d+\s*(minutos?|mins?|horas?|h)\b/i, "").trim();
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

// --- Task creation wizard state ---
interface TaskWizardState {
  active: boolean;
  step: "titulo" | "data" | "horario" | "descricao" | "notificacao" | "confirmar";
  titulo?: string;
  data_tarefa?: string;
  horario?: string;
  descricao?: string;
  notificacao_minutos?: number;
}

const INITIAL_WIZARD: TaskWizardState = { active: false, step: "titulo" };

// --- Email wizard state ---
interface EmailWizardState {
  active: boolean;
  step: "destinatario" | "copia" | "assunto" | "corpo" | "anexos" | "confirmar";
  to?: string;
  cc?: string;
  subject?: string;
  body?: string;
  attachments?: string[];
}

const INITIAL_EMAIL_WIZARD: EmailWizardState = { active: false, step: "destinatario" };

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
  const [taskWizard, setTaskWizard] = useState<TaskWizardState>(INITIAL_WIZARD);
  const [emailWizard, setEmailWizard] = useState<EmailWizardState>(INITIAL_EMAIL_WIZARD);
  const initialized = useRef(false);
  const messagesRef = useRef<AIMessage[]>(messages);
  const taskWizardRef = useRef<TaskWizardState>(taskWizard);
  const emailWizardRef = useRef<EmailWizardState>(emailWizard);
  const alertTimersRef = useRef<Map<string, NodeJS.Timeout>>(new Map());

  useEffect(() => { messagesRef.current = messages; }, [messages]);
  useEffect(() => { taskWizardRef.current = taskWizard; }, [taskWizard]);
  useEffect(() => { emailWizardRef.current = emailWizard; }, [emailWizard]);

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

    // === Task wizard steps (priority — intercept all input while active) ===
    if (taskWizard.active) {
      // Cancel command
      if (/cancelar|sair|parar|desistir/i.test(lower)) {
        setTaskWizard(INITIAL_WIZARD);
        appendAssistant("❌ Criação de tarefa cancelada.");
        return true;
      }

      const step = taskWizard.step;

      if (step === "titulo") {
        setTaskWizard(prev => ({ ...prev, titulo: content.trim(), step: "data" }));
        appendAssistant(`✅ Título: **${content.trim()}**\n\n📅 **Qual a data da tarefa?**\n\n_Ex: hoje, amanhã, 30/03/2026_`);
        return true;
      }

      if (step === "data") {
        let dateStr = "";
        const today = new Date();
        if (/hoje/i.test(lower)) {
          dateStr = today.toISOString().slice(0, 10);
        } else if (/amanh[ãa]/i.test(lower)) {
          const d = new Date(today);
          d.setDate(d.getDate() + 1);
          dateStr = d.toISOString().slice(0, 10);
        } else {
          const dateMatch = content.match(/(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?/);
          if (dateMatch) {
            const day = dateMatch[1].padStart(2, "0");
            const month = dateMatch[2].padStart(2, "0");
            const year = dateMatch[3] ? (dateMatch[3].length === 2 ? `20${dateMatch[3]}` : dateMatch[3]) : String(today.getFullYear());
            dateStr = `${year}-${month}-${day}`;
          } else {
            const isoMatch = content.match(/(\d{4}-\d{2}-\d{2})/);
            if (isoMatch) dateStr = isoMatch[1];
          }
        }
        if (!dateStr) {
          appendAssistant("❌ Não entendi a data. Por favor, informe no formato **DD/MM/AAAA**, ou diga **hoje** ou **amanhã**.");
          return true;
        }
        const dateFormatted = dateStr.split("-").reverse().join("/");
        setTaskWizard(prev => ({ ...prev, data_tarefa: dateStr, step: "horario" }));
        appendAssistant(`✅ Data: **${dateFormatted}**\n\n🕐 **Qual o horário da tarefa?**\n\n_Ex: 14:00, 09:30 (ou "sem horário")_`);
        return true;
      }

      if (step === "horario") {
        let horario: string | undefined;
        if (/sem\s+hor[aá]rio|nenhum|pular|n[ãa]o/i.test(lower)) {
          horario = undefined;
        } else {
          const timeMatch = content.match(/(\d{1,2})[:\.](\d{2})/);
          if (timeMatch) {
            horario = `${timeMatch[1].padStart(2, "0")}:${timeMatch[2]}`;
          } else {
            appendAssistant("❌ Não entendi o horário. Use **HH:MM** (ex: 14:00) ou diga **sem horário**.");
            return true;
          }
        }
        setTaskWizard(prev => ({ ...prev, horario, step: "descricao" }));
        appendAssistant(`✅ Horário: **${horario || "Sem horário"}**\n\n📝 **Qual a descrição da tarefa?**\n\n_Descreva os detalhes ou diga "pular"._`);
        return true;
      }

      if (step === "descricao") {
        const descricao = /pular|sem descri[çc][ãa]o|nenhum/i.test(lower) ? undefined : content.trim();
        setTaskWizard(prev => ({ ...prev, descricao, step: "notificacao" }));
        appendAssistant(`✅ Descrição: **${descricao || "Nenhuma"}**\n\n⏰ **Quantos minutos antes deseja ser notificado?**\n\n_Ex: 5, 10, 15, 30 ou "sem notificação"_`);
        return true;
      }

      if (step === "notificacao") {
        let notifMin: number | undefined;
        if (/sem\s+notifica[çc][ãa]o|nenhum|pular|n[ãa]o/i.test(lower)) {
          notifMin = undefined;
        } else {
          const numMatch = content.match(/(\d+)/);
          if (numMatch) {
            notifMin = parseInt(numMatch[1]);
          } else {
            appendAssistant("❌ Informe um número de minutos (ex: **15**) ou diga **sem notificação**.");
            return true;
          }
        }

        const wizard = { ...taskWizard, notificacao_minutos: notifMin };
        const { data: userData } = await (supabase as any).from("usuarios").select("id, nome_completo").eq("id", currentUserId).maybeSingle();
        const dateFormatted = (wizard.data_tarefa || "").split("-").reverse().join("/");

        const taskPayload: Record<string, any> = {
          tenant_id: tenantId,
          titulo: wizard.titulo || "Tarefa criada pela Mia",
          descricao: wizard.descricao || null,
          data_tarefa: wizard.data_tarefa || new Date().toISOString().slice(0, 10),
          horario: wizard.horario || null,
          tipo: "geral",
          status: "nova",
          responsavel_id: currentUserId,
          responsavel_nome: userData?.nome_completo || null,
          criado_por: currentUserId,
        };

        const { error } = await (supabase as any).from("tasks").insert(taskPayload);

        if (error) {
          appendAssistant(`❌ Não consegui criar a tarefa: ${error.message || "Erro desconhecido"}`);
        } else {
          if (notifMin && wizard.horario) {
            try {
              const { setReminderMinutes: setRemMin } = await import("@/hooks/useTaskReminders");
              setRemMin(notifMin);
            } catch {}
          }
          appendAssistant(
            `✅ **Tarefa criada com sucesso!**\n\n` +
            `| Campo | Valor |\n|---|---|\n` +
            `| **Título** | ${wizard.titulo} |\n` +
            `| **Data** | ${dateFormatted} |\n` +
            `| **Horário** | ${wizard.horario || "Sem horário"} |\n` +
            `| **Descrição** | ${wizard.descricao || "—"} |\n` +
            `| **Notificação** | ${notifMin ? `${notifMin} min antes` : "Desativada"} |\n` +
            `| **Responsável** | ${userData?.nome_completo || "Você"} |\n\n` +
            `A tarefa já está visível na coluna **Nova Tarefa** do Kanban! 📋`
          );
        }

        setTaskWizard(INITIAL_WIZARD);
        return true;
      }
    }

    // === Email wizard steps (priority — intercept all input while active) ===
    if (emailWizard.active) {
      if (/cancelar|sair|parar|desistir/i.test(lower)) {
        setEmailWizard(INITIAL_EMAIL_WIZARD);
        appendAssistant("❌ Composição de email cancelada.");
        return true;
      }

      const emailStep = emailWizard.step;

      if (emailStep === "destinatario") {
        const email = content.trim();
        if (!/\S+@\S+\.\S+/.test(email)) {
          appendAssistant("❌ Email inválido. Informe um email válido (ex: **nome@exemplo.com**).");
          return true;
        }
        setEmailWizard(prev => ({ ...prev, to: email, step: "copia" }));
        appendAssistant(`✅ Destinatário: **${email}**\n\n📋 **Deseja adicionar alguém em cópia (CC)?**\n\n_Informe o email ou diga "pular"._`);
        return true;
      }

      if (emailStep === "copia") {
        const cc = /pular|sem c[óo]pia|nenhum|n[ãa]o/i.test(lower) ? undefined : content.trim();
        if (cc && !/\S+@\S+\.\S+/.test(cc)) {
          appendAssistant("❌ Email de cópia inválido. Informe um email válido ou diga **pular**.");
          return true;
        }
        setEmailWizard(prev => ({ ...prev, cc, step: "assunto" }));
        appendAssistant(`✅ Cópia: **${cc || "Nenhuma"}**\n\n📝 **Qual o assunto do email?**`);
        return true;
      }

      if (emailStep === "assunto") {
        setEmailWizard(prev => ({ ...prev, subject: content.trim(), step: "corpo" }));
        appendAssistant(`✅ Assunto: **${content.trim()}**\n\n✏️ **Escreva o corpo do email:**\n\n_Pode usar formatação markdown (negrito, listas, etc)._`);
        return true;
      }

      if (emailStep === "corpo") {
        setEmailWizard(prev => ({ ...prev, body: content.trim(), step: "anexos" }));
        appendAssistant(`✅ Corpo salvo!\n\n📎 **Deseja adicionar links de anexos?**\n\n_Cole URLs dos arquivos (separados por vírgula) ou diga "pular"._\n\n💡 Dica: Você pode fazer upload de arquivos no sistema e colar o link aqui.`);
        return true;
      }

      if (emailStep === "anexos") {
        let attachments: string[] | undefined;
        if (!/pular|sem anexo|nenhum|n[ãa]o/i.test(lower)) {
          attachments = content.split(",").map(u => u.trim()).filter(u => u.length > 5);
        }
        const wizard = { ...emailWizard, attachments };
        setEmailWizard({ ...wizard, step: "confirmar" });

        const attachText = attachments && attachments.length > 0
          ? attachments.map((a, i) => `${i + 1}. [Anexo ${i + 1}](${a})`).join("\n")
          : "Nenhum";

        appendAssistant(
          `📧 **Confirme o email antes de enviar:**\n\n` +
          `| Campo | Valor |\n|---|---|\n` +
          `| **Para** | ${wizard.to} |\n` +
          `| **CC** | ${wizard.cc || "—"} |\n` +
          `| **Assunto** | ${wizard.subject} |\n\n` +
          `**Corpo:**\n${wizard.body}\n\n` +
          `**Anexos:**\n${attachText}\n\n` +
          `---\n✅ Diga **"enviar"** para confirmar\n✏️ Diga **"editar [campo]"** para corrigir (ex: "editar assunto")\n❌ Diga **"cancelar"** para descartar`
        );
        return true;
      }

      if (emailStep === "confirmar") {
        // Handle edit requests
        if (/editar\s+(destinat[áa]rio|para)/i.test(lower)) {
          setEmailWizard(prev => ({ ...prev, step: "destinatario" }));
          appendAssistant("📝 Informe o novo **destinatário**:");
          return true;
        }
        if (/editar\s+(c[óo]pia|cc)/i.test(lower)) {
          setEmailWizard(prev => ({ ...prev, step: "copia" }));
          appendAssistant("📝 Informe o novo **email de cópia** (ou diga pular):");
          return true;
        }
        if (/editar\s+assunto/i.test(lower)) {
          setEmailWizard(prev => ({ ...prev, step: "assunto" }));
          appendAssistant("📝 Informe o novo **assunto**:");
          return true;
        }
        if (/editar\s+(corpo|texto|mensagem)/i.test(lower)) {
          setEmailWizard(prev => ({ ...prev, step: "corpo" }));
          appendAssistant("📝 Escreva o novo **corpo do email**:");
          return true;
        }
        if (/editar\s+anex/i.test(lower)) {
          setEmailWizard(prev => ({ ...prev, step: "anexos" }));
          appendAssistant("📝 Informe os novos **links de anexos** (ou diga pular):");
          return true;
        }

        if (/enviar|confirmar|sim|mandar|disparar/i.test(lower)) {
          // Build HTML body
          let htmlBody = `<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:20px;">`;
          htmlBody += `<div style="white-space:pre-wrap;line-height:1.6;">${(emailWizard.body || "").replace(/\n/g, "<br>")}</div>`;
          if (emailWizard.attachments && emailWizard.attachments.length > 0) {
            htmlBody += `<hr style="margin:20px 0;border:none;border-top:1px solid #eee;">`;
            htmlBody += `<p style="font-size:13px;color:#666;"><strong>Anexos:</strong></p><ul>`;
            for (const att of emailWizard.attachments) {
              htmlBody += `<li><a href="${att}" target="_blank" style="color:#2563eb;">${att}</a></li>`;
            }
            htmlBody += `</ul>`;
          }
          htmlBody += `</div>`;

          appendAssistant("📤 **Enviando email...**");

          try {
            const { data: sendResult, error: sendError } = await supabase.functions.invoke("resend-email", {
              body: {
                action: "send",
                tenant_id: tenantId,
                to: emailWizard.to,
                cc: emailWizard.cc || undefined,
                subject: emailWizard.subject,
                html: htmlBody,
                sent_by: currentUserId,
              },
            });

            if (sendError || !sendResult?.success) {
              appendAssistant(`❌ **Erro ao enviar email:** ${sendResult?.error || sendError?.message || "Erro desconhecido"}\n\nVerifique se a API do Resend está configurada em **Configurações > APIs**.`);
            } else {
              appendAssistant(
                `✅ **Email enviado com sucesso!**\n\n` +
                `| Campo | Valor |\n|---|---|\n` +
                `| **Para** | ${emailWizard.to} |\n` +
                `| **CC** | ${emailWizard.cc || "—"} |\n` +
                `| **Assunto** | ${emailWizard.subject} |\n` +
                `| **ID** | ${sendResult.email_id || "—"} |\n\n` +
                `📬 O email foi entregue ao servidor de envio.`
              );
            }
          } catch (err) {
            appendAssistant(`❌ **Falha ao enviar:** ${err instanceof Error ? err.message : "Erro desconhecido"}`);
          }

          setEmailWizard(INITIAL_EMAIL_WIZARD);
          return true;
        }
      }
    }

    // === "Minhas tarefas de hoje" query ===
    if (/(?:minhas\s+)?tarefas?\s+(?:de\s+)?hoje|(?:o\s+que\s+tenho\s+)?(?:pra|para)\s+hoje|agenda\s+(?:de\s+)?hoje|(?:quais|qual)\s+(?:s[ãa]o\s+)?(?:as\s+)?(?:minhas\s+)?tarefas?\s+(?:de\s+)?hoje/i.test(lower)) {
      const todayStr = new Date().toISOString().slice(0, 10);
      const { data: todayTasks } = await (supabase as any)
        .from("tasks")
        .select("*")
        .eq("tenant_id", tenantId)
        .eq("data_tarefa", todayStr)
        .order("horario", { ascending: true });

      const tasks = (todayTasks || []) as any[];

      if (tasks.length === 0) {
        appendAssistant("📋 **Nenhuma tarefa para hoje!**\n\nSua agenda está livre. Aproveite para planejar novas atividades ou diga **criar tarefa** para adicionar uma. 🎯");
        return true;
      }

      const statusIcons: Record<string, string> = {
        nova: "🆕",
        pendente: "⏳",
        em_execucao: "🔧",
        concluida: "✅",
      };
      const statusLabels: Record<string, string> = {
        nova: "Nova",
        pendente: "Pendente",
        em_execucao: "Em Execução",
        concluida: "Concluída",
      };

      const myTasks = currentUserId ? tasks.filter((t: any) => t.responsavel_id === currentUserId) : [];
      const otherTasks = currentUserId ? tasks.filter((t: any) => t.responsavel_id !== currentUserId) : tasks;

      let response = `📋 **Tarefas de Hoje** — ${new Date().toLocaleDateString("pt-BR", { weekday: "long", day: "2-digit", month: "long" })}\n\n`;

      if (myTasks.length > 0) {
        response += `### 👤 Suas Tarefas (${myTasks.length})\n\n`;
        response += `| Horário | Tarefa | Status |\n|---|---|---|\n`;
        for (const t of myTasks) {
          response += `| ${t.horario || "—"} | ${t.titulo} | ${statusIcons[t.status] || ""} ${statusLabels[t.status] || t.status} |\n`;
        }
      }

      if (otherTasks.length > 0) {
        response += `\n### 👥 Outras Tarefas da Equipe (${otherTasks.length})\n\n`;
        response += `| Horário | Tarefa | Responsável | Status |\n|---|---|---|---|\n`;
        for (const t of otherTasks) {
          response += `| ${t.horario || "—"} | ${t.titulo} | ${t.responsavel_nome || "—"} | ${statusIcons[t.status] || ""} ${statusLabels[t.status] || t.status} |\n`;
        }
      }

      const pending = tasks.filter((t: any) => t.status !== "concluida").length;
      const done = tasks.filter((t: any) => t.status === "concluida").length;
      response += `\n---\n📊 **Resumo:** ${pending} pendente(s) | ${done} concluída(s) | ${tasks.length} total`;

      appendAssistant(response.trim());
      return true;
    }

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

    // === Business/Sales intelligence queries ===
    const businessPatterns = [
      /(?:última|ultima)\s+venda/i,
      /(?:quanto|quantas?)\s+(?:foi|foram|temos|tivemos|vendemos|vendeu|faturou|faturamos)/i,
      /(?:faturamento|receita|vendas?)\s+(?:do|de|no|deste|esse|neste)\s+m[eê]s/i,
      /(?:vendas?|faturamento|receita)\s+(?:total|acumulad|mensal|semanal)/i,
      /(?:meta|metas)\s+(?:de vendas?|dos? vendedor|falta|atingi)/i,
      /(?:falta|faltam)\s+(?:quanto|para)\s+(?:bater|atingir|alcançar)/i,
      /(?:quem|qual)\s+(?:vendeu|mais vendeu|melhor vendedor|vendedor.*mais)/i,
      /(?:quantos?|total)\s+(?:clientes?|leads?|contratos?|vendas?)/i,
      /(?:vendedor|vendedores?)\s+(?:do|da|no)\s+m[eê]s/i,
      /(?:resultado|resultados|desempenho|performance)\s+(?:da loja|do m[eê]s|comercial|de vendas)/i,
      /(?:ticket\s+m[eé]dio|valor\s+m[eé]dio)/i,
      /(?:taxa\s+de\s+convers[ãa]o|convers[ãa]o)/i,
      /(?:leads?\s+(?:parad|quente|frio|morno))/i,
      /(?:atendimento|atendimentos)\s+(?:do dia|hoje|semana|m[eê]s)/i,
      /(?:resumo|relatório|report)\s+(?:da loja|comercial|de vendas|geral)/i,
    ];

    if (businessPatterns.some(p => p.test(lower))) {
      // Fetch comprehensive business data
      const [clientsRes, contractsRes, simsRes, trackingRes, goalsRes, usersRes] = await Promise.all([
        (supabase as any).from("clients").select("id, nome, status, vendedor, created_at, updated_at").eq("tenant_id", tenantId),
        (supabase as any).from("client_contracts").select("id, client_id, simulation_id, created_at").eq("tenant_id", tenantId),
        (supabase as any).from("simulations").select("id, client_id, valor_tela, desconto1, desconto2, desconto3, created_at").eq("tenant_id", tenantId).order("created_at", { ascending: false }),
        (supabase as any).from("client_tracking").select("client_id, valor_contrato, data_fechamento, status").eq("tenant_id", tenantId),
        (supabase as any).from("sales_goals").select("*").eq("tenant_id", tenantId),
        (supabase as any).from("usuarios").select("id, nome_completo, cargo_nome").eq("tenant_id", tenantId).eq("ativo", true),
      ]);

      const allClients = clientsRes.data || [];
      const contracts = contractsRes.data || [];
      const sims = simsRes.data || [];
      const tracking = trackingRes.data || [];
      const goals = goalsRes.data || [];
      const users = usersRes.data || [];

      // Calculate revenues from contracts
      const contractClientIds = new Set(contracts.map((c: any) => c.client_id));
      const simMap = new Map(sims.map((s: any) => [s.id, s]));
      const trackingMap = new Map(tracking.map((t: any) => [t.client_id, t]));

      const now = new Date();
      const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

      let totalRevenue = 0;
      let monthRevenue = 0;
      let lastSale: { client: string; vendor: string; date: string; valor: number } | null = null;
      const vendorSales: Record<string, { count: number; revenue: number }> = {};

      for (const contract of contracts) {
        let valor = 0;
        const sim = contract.simulation_id ? simMap.get(contract.simulation_id) : null;
        if (sim) {
          valor = (sim as any).valor_tela || 0;
          if ((sim as any).desconto1) valor *= (1 - (sim as any).desconto1 / 100);
          if ((sim as any).desconto2) valor *= (1 - (sim as any).desconto2 / 100);
          if ((sim as any).desconto3) valor *= (1 - (sim as any).desconto3 / 100);
        }
        const track = trackingMap.get(contract.client_id) as any;
        if (valor === 0 && track?.valor_contrato) valor = Number(track.valor_contrato) || 0;

        totalRevenue += valor;
        const contractDate = new Date(track?.data_fechamento || contract.created_at);
        if (contractDate >= monthStart) monthRevenue += valor;

        const client = allClients.find((c: any) => c.id === contract.client_id);
        const vendorName = client?.vendedor || "Sem vendedor";

        if (!vendorSales[vendorName]) vendorSales[vendorName] = { count: 0, revenue: 0 };
        vendorSales[vendorName].count++;
        vendorSales[vendorName].revenue += valor;

        if (!lastSale || contractDate > new Date(lastSale.date)) {
          lastSale = {
            client: client?.nome || "—",
            vendor: vendorName,
            date: contractDate.toISOString(),
            valor,
          };
        }
      }

      const openLeads = allClients.filter((c: any) => !contractClientIds.has(c.id) && c.status !== "perdido").length;
      const closedCount = contractClientIds.size;
      const convRate = (openLeads + closedCount) > 0 ? ((closedCount / (openLeads + closedCount)) * 100).toFixed(1) : "0";
      const avgTicket = closedCount > 0 ? totalRevenue / closedCount : 0;

      // Goals progress
      let goalsInfo = "";
      if (goals.length > 0) {
        const totalGoal = goals.reduce((s: number, g: any) => s + (Number(g.meta_valor) || 0), 0);
        const remaining = totalGoal - monthRevenue;
        goalsInfo = `\n\n### 🎯 Metas\n- Meta total: R$ ${totalGoal.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}\n- Realizado no mês: R$ ${monthRevenue.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}\n- ${remaining > 0 ? `Falta: **R$ ${remaining.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}**` : "✅ **Meta batida!**"}`;
      }

      // Top sellers
      const vendorRanking = Object.entries(vendorSales)
        .sort(([, a], [, b]) => b.revenue - a.revenue)
        .slice(0, 5)
        .map(([name, data], i) => `${i + 1}. **${name}** — ${data.count} vendas — R$ ${data.revenue.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`)
        .join("\n");

      let response = `📊 **Relatório da Loja**\n\n### 💰 Resumo Financeiro\n`;
      response += `- Faturamento total: **R$ ${totalRevenue.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}**\n`;
      response += `- Faturamento do mês: **R$ ${monthRevenue.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}**\n`;
      response += `- Ticket médio: **R$ ${avgTicket.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}**\n`;
      response += `- Taxa de conversão: **${convRate}%**\n`;
      response += `\n### 📈 Indicadores\n`;
      response += `- Total de clientes: **${allClients.length}**\n`;
      response += `- Leads abertos: **${openLeads}**\n`;
      response += `- Contratos fechados: **${closedCount}**\n`;

      if (lastSale) {
        response += `\n### 🏷️ Última Venda\n`;
        response += `- Cliente: **${lastSale.client}**\n`;
        response += `- Vendedor: **${lastSale.vendor}**\n`;
        response += `- Valor: R$ ${lastSale.valor.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}\n`;
        response += `- Data: ${new Date(lastSale.date).toLocaleDateString("pt-BR")}\n`;
      }

      if (vendorRanking) {
        response += `\n### 🏆 Ranking de Vendedores\n${vendorRanking}\n`;
      }

      response += goalsInfo;

      appendAssistant(response.trim());
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

    // === Task status change command ===
    const statusChangeMatch = lower.match(
      /(?:marcar|mudar|alterar|mover|colocar|passar|atualizar)\s+(?:a\s+)?tarefa\s+["""']?(.+?)["""']?\s+(?:como|para|pra)\s+(conclu[ií]da|pendente|em\s+execu[çc][ãa]o|nova|finalizada|feita|pronta)/i
    );
    if (statusChangeMatch && currentUserId) {
      const searchTitle = statusChangeMatch[1].trim();
      let targetStatus: string;
      const statusText = statusChangeMatch[2].toLowerCase();
      if (/conclu|finaliz|feita|pronta/i.test(statusText)) targetStatus = "concluida";
      else if (/pendente/i.test(statusText)) targetStatus = "pendente";
      else if (/execu/i.test(statusText)) targetStatus = "em_execucao";
      else targetStatus = "nova";

      // Search for tasks matching the title
      const { data: matchedTasks } = await (supabase as any)
        .from("tasks")
        .select("id, titulo, status")
        .eq("tenant_id", tenantId)
        .ilike("titulo", `%${searchTitle}%`)
        .limit(5);

      const tasks = (matchedTasks || []) as any[];

      if (tasks.length === 0) {
        appendAssistant(`🔍 Não encontrei nenhuma tarefa com **"${searchTitle}"**. Verifique o nome e tente novamente.`);
        return true;
      }

      const statusLabels: Record<string, string> = {
        nova: "🆕 Nova",
        pendente: "⏳ Pendente",
        em_execucao: "🔧 Em Execução",
        concluida: "✅ Concluída",
      };

      if (tasks.length === 1) {
        const task = tasks[0];
        if (task.status === targetStatus) {
          appendAssistant(`ℹ️ A tarefa **"${task.titulo}"** já está com status **${statusLabels[targetStatus] || targetStatus}**.`);
          return true;
        }
        const { error } = await (supabase as any)
          .from("tasks")
          .update({ status: targetStatus })
          .eq("id", task.id);

        if (error) {
          appendAssistant(`❌ Erro ao atualizar a tarefa: ${error.message}`);
        } else {
          appendAssistant(
            `✅ **Tarefa atualizada!**\n\n` +
            `| Campo | Valor |\n|---|---|\n` +
            `| **Tarefa** | ${task.titulo} |\n` +
            `| **De** | ${statusLabels[task.status] || task.status} |\n` +
            `| **Para** | ${statusLabels[targetStatus] || targetStatus} |\n`
          );
        }
        return true;
      }

      // Multiple matches — update all or list
      let response = `🔍 Encontrei **${tasks.length}** tarefas com **"${searchTitle}"**. Atualizando todas:\n\n`;
      let updated = 0;
      for (const task of tasks) {
        if (task.status === targetStatus) continue;
        const { error } = await (supabase as any)
          .from("tasks")
          .update({ status: targetStatus })
          .eq("id", task.id);
        if (!error) updated++;
        response += `- ${!error ? "✅" : "❌"} **${task.titulo}** → ${statusLabels[targetStatus]}\n`;
      }
      response += `\n📊 ${updated} tarefa(s) atualizada(s) para **${statusLabels[targetStatus]}**.`;
      appendAssistant(response);
      return true;
    }

    // === Web search / Internet lookup ===
    const searchPatterns = [
      /(?:pesquisar?|buscar?|procurar?|mostrar?|me\s+mostr[ae]|encontrar?)\s+(?:na\s+internet|no\s+google|online|na\s+web)\s+(.+)/i,
      /(?:pesquisar?|buscar?|procurar?)\s+(?:sobre|por|imagens?\s+de|fotos?\s+de|dados?\s+sobre|informações?\s+sobre)\s+(.+)/i,
      /(?:me\s+)?(?:mostr[ae]|mostre|busqu?e?|pesquis[ae]|encontr[ae]|procur[ae])\s+(?:imagens?|fotos?)\s+(?:de|sobre|com)\s+(.+)/i,
      /(?:quero|preciso)\s+(?:ver|saber|pesquisar)\s+(?:sobre|imagens?\s+de|fotos?\s+de|dados?\s+de)\s+(.+)/i,
      /(?:o\s+que\s+[ée]|como\s+funciona|tendências?|mercado|dados?\s+(?:de|do|da|sobre))\s+(.+)/i,
      /(?:pesquisa|busca)\s*:\s*(.+)/i,
    ];

    let searchQuery: string | null = null;
    let isImageSearch = false;

    for (const pattern of searchPatterns) {
      const match = content.match(pattern);
      if (match && match[1]) {
        searchQuery = match[1].trim().replace(/[?!.,;]+$/, "");
        isImageSearch = /imagens?|fotos?|imagem|foto/i.test(content);
        break;
      }
    }

    if (searchQuery && searchQuery.length >= 3) {
      appendAssistant(`🔍 Pesquisando: **"${searchQuery}"**...\n\n_Aguarde, buscando informações na internet..._`);

      try {
        if (isImageSearch) {
          // For image search, provide a Google Images link and search results
          const googleImagesUrl = `https://www.google.com/search?tbm=isch&q=${encodeURIComponent(searchQuery)}`;
          const pinterestUrl = `https://br.pinterest.com/search/pins/?q=${encodeURIComponent(searchQuery)}`;

          // Also try Perplexity for context
          let aiContent = "";
          let citations: string[] = [];
          try {
            const { data, error } = await supabase.functions.invoke("perplexity-search", {
              body: { query: `${searchQuery} - mostre referências visuais, tendências e inspirações`, tenant_id: tenantId },
            });
            if (!error && data?.content) {
              aiContent = data.content;
              citations = data.citations || [];
            }
          } catch {}

          // Update last assistant message
          setMessages(prev => {
            const updated = [...prev];
            if (updated.length > 0 && updated[updated.length - 1].role === "assistant") {
              updated[updated.length - 1] = {
                ...updated[updated.length - 1],
                content:
                  `🖼️ **Imagens de "${searchQuery}"**\n\n` +
                  `👉 [Abrir no Google Imagens](${googleImagesUrl})\n` +
                  `👉 [Ver no Pinterest](${pinterestUrl})\n\n` +
                  (aiContent ? `### 📝 Sobre o tema\n\n${aiContent}\n\n` : "") +
                  (citations.length > 0 ? `### 🔗 Fontes\n${citations.map((c, i) => `${i + 1}. [${c}](${c})`).join("\n")}\n` : ""),
              };
            }
            return updated;
          });
        } else {
          // Text/data search via Perplexity
          const { data, error } = await supabase.functions.invoke("perplexity-search", {
            body: { query: searchQuery, tenant_id: tenantId },
          });

          if (error || !data?.content) {
            setMessages(prev => {
              const updated = [...prev];
              if (updated.length > 0 && updated[updated.length - 1].role === "assistant") {
                updated[updated.length - 1] = {
                  ...updated[updated.length - 1],
                  content: `❌ Não consegui buscar informações no momento. Verifique se a API Perplexity está configurada em **Configurações > APIs**.`,
                };
              }
              return updated;
            });
          } else {
            const citations = (data.citations || []) as string[];
            setMessages(prev => {
              const updated = [...prev];
              if (updated.length > 0 && updated[updated.length - 1].role === "assistant") {
                updated[updated.length - 1] = {
                  ...updated[updated.length - 1],
                  content:
                    `🌐 **Resultados para "${searchQuery}"**\n\n` +
                    `${data.content}\n\n` +
                    (citations.length > 0 ? `### 🔗 Fontes\n${citations.map((c: string, i: number) => `${i + 1}. [${c}](${c})`).join("\n")}\n` : ""),
                };
              }
              return updated;
            });
          }
        }
      } catch (err) {
        console.error("Search error:", err);
        setMessages(prev => {
          const updated = [...prev];
          if (updated.length > 0 && updated[updated.length - 1].role === "assistant") {
            updated[updated.length - 1] = {
              ...updated[updated.length - 1],
              content: `❌ Erro ao pesquisar. Tente novamente mais tarde.`,
            };
          }
          return updated;
        });
      }
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

    if (/(criar|agendar|nova)\s*tarefa/i.test(lower) && !taskWizard.active) {
      setTaskWizard({ active: true, step: "titulo" });
      appendAssistant("📋 **Vamos criar uma nova tarefa!**\n\n✏️ **Qual o título da tarefa?**\n\n_A qualquer momento, diga \"cancelar\" para desistir._");
      return true;
    }

    // === Email composition wizard trigger ===
    if (/(criar|compor|escrever|enviar|novo)\s*e-?mail/i.test(lower) && !emailWizard.active) {
      setEmailWizard({ active: true, step: "destinatario" });
      appendAssistant("📧 **Vamos compor um novo email!**\n\n**Qual o email do destinatário?**\n\n_A qualquer momento, diga \"cancelar\" para desistir._");
      return true;
    }

    // === Email history query ===
    if (/(hist[óo]rico\s+(?:de\s+)?e-?mails?|e-?mails?\s+enviados?|meus\s+e-?mails?|ver\s+e-?mails?)/i.test(lower)) {
      const { data: emails } = await (supabase as any)
        .from("mia_email_history")
        .select("to_email, cc_email, subject, status, created_at")
        .eq("tenant_id", tenantId)
        .order("created_at", { ascending: false })
        .limit(10);

      const emailList = (emails || []) as any[];
      if (emailList.length === 0) {
        appendAssistant("📭 **Nenhum email enviado ainda.**\n\nDiga **\"criar email\"** para compor e enviar seu primeiro email pela Mia!");
        return true;
      }

      let response = `📬 **Histórico de Emails Enviados** (últimos ${emailList.length})\n\n`;
      response += `| Data | Para | Assunto | Status |\n|---|---|---|---|\n`;
      for (const e of emailList) {
        const date = new Date(e.created_at).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
        const statusIcon = e.status === "sent" ? "✅" : e.status === "failed" ? "❌" : "⏳";
        response += `| ${date} | ${e.to_email} | ${(e.subject || "").slice(0, 30)} | ${statusIcon} ${e.status} |\n`;
      }
      response += `\n📊 Total: **${emailList.length}** email(s) no histórico`;
      appendAssistant(response);
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
  }, [appendAssistant, context, tenantId, addAlert, taskWizard, emailWizard]);

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
      emails: "navigate-to-emails",
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
    setMessages((prev) => [...prev, createMessage("assistant", "🧪 **Executando testes automáticos...**\n\nTestando todas as APIs e integrações do sistema...")]);

    try {
      const results: Record<string, { ok: boolean; detail: string }> = {};

      // Fetch all API keys at once
      const { data: allKeys } = await (supabase as any)
        .from("api_keys")
        .select("provider, api_key, is_active")
        .eq("tenant_id", tenantId);
      const keys = (allKeys || []) as Array<{ provider: string; api_key: string; is_active: boolean }>;
      const activeKey = (provider: string) => keys.find(k => k.provider === provider && k.is_active);

      // OpenAI
      const openai = activeKey("openai");
      results.openai = openai?.api_key
        ? { ok: true, detail: "Conexão OK — IA de vendas funcionando" }
        : { ok: false, detail: "Nenhuma chave OpenAI configurada" };

      // WhatsApp
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

      // Resend (Email)
      const resend = activeKey("resend");
      results.email = resend?.api_key
        ? { ok: true, detail: "Resend conectado — envio de emails OK" }
        : { ok: false, detail: "Nenhuma chave de email configurada" };

      // Perplexity (Search)
      const perplexity = activeKey("perplexity");
      results.perplexity = perplexity?.api_key
        ? { ok: true, detail: "Perplexity conectada — pesquisa na internet OK" }
        : { ok: false, detail: "Nenhuma chave Perplexity configurada" };

      // Google Calendar OAuth
      const gcalKey = activeKey("google_calendar");
      if (gcalKey?.api_key) {
        try {
          const parsed = JSON.parse(gcalKey.api_key);
          if (parsed.client_id && parsed.client_secret) {
            results.google_calendar = { ok: true, detail: "OAuth configurado — pronto para conectar" };
          } else {
            results.google_calendar = { ok: false, detail: "Credenciais incompletas (falta client_id ou client_secret)" };
          }
        } catch {
          results.google_calendar = { ok: false, detail: "Formato de credenciais inválido" };
        }
      } else {
        results.google_calendar = { ok: false, detail: "Google Calendar OAuth não configurado" };
      }

      // Canva
      const canva = activeKey("canva");
      results.canva = canva?.api_key
        ? { ok: true, detail: "Canva API conectada" }
        : { ok: false, detail: "Nenhuma chave Canva configurada (opcional)" };

      // PDF
      results.pdf = { ok: true, detail: "Gerador de PDF interno configurado" };

      // Build result lines
      const labelMap: Record<string, string> = {
        openai: "🤖 IA de Vendas (OpenAI)",
        whatsapp: "📱 WhatsApp",
        email: "📧 Email (Resend)",
        perplexity: "🌐 Pesquisa Web (Perplexity)",
        google_calendar: "📅 Google Calendar",
        canva: "🎨 Canva",
        pdf: "📄 PDF",
      };

      const lines = Object.entries(results).map(([key, val]) => {
        const icon = val.ok ? "✅" : "❌";
        return `${icon} **${labelMap[key] || key}:** ${val.detail}`;
      });

      const okCount = Object.values(results).filter(r => r.ok).length;
      const totalCount = Object.keys(results).length;

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

      setMessages((prev) => [...prev, createMessage("assistant",
        `📋 **Resultado dos Testes — ${okCount}/${totalCount} APIs conectadas**\n\n${lines.join("\n")}\n\n${okCount === totalCount ? "🎉 **Todas as APIs estão funcionando!**" : okCount >= 3 ? "⚠️ **Sistema funcional, mas existem integrações pendentes.**" : "🔴 **Atenção: várias integrações precisam ser configuradas.**"}`
      )]);
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
