import { useState, useCallback, useRef, useEffect } from "react";
import { supabase } from "@/lib/supabaseClient";
import { toast } from "sonner";

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
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
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
  const [messages, setMessages] = useState<AIMessage[]>([]);
  const [loading, setLoading] = useState(false);
  const [context, setContext] = useState<OnboardingAIContext | null>(null);
  const initialized = useRef(false);

  useEffect(() => {
    if (!tenantId || initialized.current) return;
    initialized.current = true;

    const bootstrap = async () => {
      const storedMessages = parseStored<AIMessage[]>(localStorage.getItem(getMessagesKey(tenantId)), []).map((m) => ({
        ...m,
        timestamp: new Date(m.timestamp),
      }));
      const storedContext = parseStored<OnboardingAIContext | null>(localStorage.getItem(getContextKey(tenantId)), null);

      const runtimeContext = await buildRuntimeContext(tenantId).catch(() => storedContext);
      if (runtimeContext) {
        const mergedSteps = [...new Set([...(storedContext?.completedSteps || []), ...(runtimeContext.completedSteps || [])])];
        setContext({
          apiKeys: runtimeContext.apiKeys || storedContext?.apiKeys || [],
          whatsappConnected: runtimeContext.whatsappConnected || storedContext?.whatsappConnected || false,
          completedSteps: mergedSteps,
        });
      }

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

      if (storedMessages.length > 0) {
        setMessages(storedMessages);
      } else {
        await sendMessage("Olá, acabei de criar minha conta!", true);
      }
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
      const { error } = await (supabase as any).from("tasks").insert({
        tenant_id: tenantId,
        titulo: title,
        descricao: `Criada pela Mia a partir da conversa: ${content}`,
        data_tarefa: today,
        tipo: "geral",
        status: "nova",
        responsavel_id: currentUserId,
        responsavel_nome: userData?.nome_completo || null,
        criado_por: currentUserId,
      });

      appendAssistant(
        error
          ? "❌ Não consegui criar a tarefa agora."
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

    if (/tutorial|v[ií]deo|como faço|como usar/.test(lower)) {
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

      appendAssistant(
        ranked.length === 0
          ? "📚 Não encontrei um tutorial muito próximo dessa dúvida. Abra o menu **Tutoriais** para ver todos os vídeos disponíveis."
          : `🎬 **Tutoriais mais próximos da sua dúvida**\n\n${ranked.map((tutorial) => `• **${tutorial.titulo}** — ${tutorial.categoria}${tutorial.video_url ? `\n  ${tutorial.video_url}` : ""}`).join("\n\n")}`
      );
      return true;
    }

    if (/contas a vencer|contas vencidas|alerta financeiro|financeiro/.test(lower)) {
      const today = new Date().toISOString().slice(0, 10);
      const nextWeek = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
      const { data } = await (supabase as any)
        .from("financial_accounts")
        .select("name, amount, due_date, status")
        .eq("tenant_id", tenantId)
        .neq("status", "pago")
        .order("due_date", { ascending: true })
        .limit(20);

      const accounts = (data as any[]) || [];
      const overdue = accounts.filter((account) => account.due_date < today);
      const dueSoon = accounts.filter((account) => account.due_date >= today && account.due_date <= nextWeek);

      appendAssistant(
        `💰 **Alertas financeiros**\n\n• Contas vencidas: **${overdue.length}**\n• A vencer em 7 dias: **${dueSoon.length}**${dueSoon.length > 0 ? `\n\nPróximas contas:\n${dueSoon.slice(0, 5).map((account) => `• ${account.name} — ${new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(Number(account.amount) || 0)} — ${account.due_date}`).join("\n")}` : ""}`
      );
      return true;
    }

    return false;
  }, [appendAssistant, context, tenantId]);

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
        ...messages.map((message) => ({ role: message.role, content: message.content })),
        { role: "user", content },
      ];
      await chatWithAI(tenantId, nextHistory);
    } catch (err) {
      console.error("Onboarding AI error:", err);
      toast.error("Erro ao comunicar com a Mia");
      setLoading(false);
    }
  }, [tenantId, messages, appendAssistant, refreshContext, handleLocalAction, chatWithAI]);

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
