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

export function useOnboardingAI(tenantId: string | null) {
  const [messages, setMessages] = useState<AIMessage[]>([]);
  const [loading, setLoading] = useState(false);
  const [context, setContext] = useState<OnboardingAIContext | null>(null);
  const initialized = useRef(false);

  // Send initial greeting on mount
  useEffect(() => {
    if (!tenantId || initialized.current) return;
    initialized.current = true;

    // Load previous conversation
    loadHistory(tenantId).then((history) => {
      if (history.length > 0) {
        setMessages(history);
      } else {
        // Trigger initial AI greeting
        sendMessage("Olá, acabei de criar minha conta!", true);
      }
    });
  }, [tenantId]);

  const loadHistory = async (tid: string): Promise<AIMessage[]> => {
    const { data } = await (supabase as any)
      .from("onboarding_ai_conversations")
      .select("*")
      .eq("tenant_id", tid)
      .order("created_at", { ascending: true })
      .limit(50);

    if (!data || data.length === 0) return [];

    const msgs: AIMessage[] = [];
    for (const row of data) {
      if (row.user_message) {
        msgs.push({
          id: `u-${row.id}`,
          role: "user",
          content: row.user_message,
          timestamp: new Date(row.created_at),
        });
      }
      if (row.ai_response) {
        msgs.push({
          id: `a-${row.id}`,
          role: "assistant",
          content: row.ai_response,
          timestamp: new Date(row.created_at),
        });
      }
    }
    return msgs;
  };

  const sendMessage = useCallback(
    async (content: string, isInitial = false) => {
      if (!tenantId) return;

      const userMsg: AIMessage = {
        id: `u-${Date.now()}`,
        role: "user",
        content,
        timestamp: new Date(),
      };

      if (!isInitial) {
        setMessages((prev) => [...prev, userMsg]);
      }

      setLoading(true);

      try {
        // Check if message contains an API key
        const apiKeyAction = detectApiKeyInMessage(content);

        if (apiKeyAction) {
          // Validate and save API key
          const { data: validationResult } =
            await supabase.functions.invoke("onboarding-ai", {
              body: {
                action: "validate_api_key",
                tenant_id: tenantId,
                provider: apiKeyAction.provider,
                api_key: apiKeyAction.key,
                api_url: apiKeyAction.url,
              },
            });

          if (validationResult?.valid) {
            const successMsg: AIMessage = {
              id: `a-${Date.now()}`,
              role: "assistant",
              content: `✅ **${apiKeyAction.provider.toUpperCase()} configurada com sucesso!**\n\nSua chave foi validada e salva automaticamente. Vamos continuar a configuração!`,
              timestamp: new Date(),
            };
            setMessages((prev) => [...(isInitial ? [] : prev), successMsg]);
            setLoading(false);
            // Continue with AI chat to get next steps
            await chatWithAI(tenantId, [
              ...messages.map((m) => ({
                role: m.role,
                content: m.content,
              })),
              { role: "user", content: `Acabei de configurar a API ${apiKeyAction.provider} com sucesso` },
            ]);
            return;
          } else {
            const errorMsg: AIMessage = {
              id: `a-${Date.now()}`,
              role: "assistant",
              content: `❌ **Chave inválida:** ${validationResult?.error || "Não foi possível validar"}\n\nVerifique a chave e tente novamente. Se precisar de ajuda, me pergunte!`,
              timestamp: new Date(),
            };
            setMessages((prev) => [...(isInitial ? [] : prev), errorMsg]);
            setLoading(false);
            return;
          }
        }

        // Regular chat
        await chatWithAI(tenantId, [
          ...(isInitial
            ? []
            : messages.map((m) => ({
                role: m.role,
                content: m.content,
              }))),
          { role: "user", content },
        ]);
      } catch (err) {
        console.error("Onboarding AI error:", err);
        toast.error("Erro ao comunicar com a IA");
        setLoading(false);
      }
    },
    [tenantId, messages]
  );

  const chatWithAI = async (
    tid: string,
    chatMessages: { role: string; content: string }[]
  ) => {
    try {
      const { data, error } = await supabase.functions.invoke(
        "onboarding-ai",
        {
          body: {
            action: "chat",
            tenant_id: tid,
            messages: chatMessages,
          },
        }
      );

      console.log("[Mia] Response:", { data, error });

      if (error) {
        console.error("[Mia] Function error:", error);
        throw error;
      }

      const reply = data?.reply || "Desculpe, ocorreu um erro. Tente novamente.";

      if (data?.context) {
        setContext(data.context);
      }

      const aiMsg: AIMessage = {
        id: `a-${Date.now()}`,
        role: "assistant",
        content: reply,
        timestamp: new Date(),
      };

      setMessages((prev) => [...prev, aiMsg]);

      // Detect and execute AI actions from response
      detectAndExecuteActions(reply, tid);
    } catch (err) {
      console.error("Chat error:", err);
      const errorMsg: AIMessage = {
        id: `a-${Date.now()}`,
        role: "assistant",
        content:
          "Ops, tive um problema para responder. 😅 Mas não se preocupe, você pode continuar a configuração manualmente em **Configurações**.",
        timestamp: new Date(),
      };
      setMessages((prev) => [...prev, errorMsg]);
    } finally {
      setLoading(false);
    }
  };

  const savePreferences = useCallback(
    async (preferences: Record<string, string>) => {
      if (!tenantId) return;
      await supabase.functions.invoke("onboarding-ai", {
        body: {
          action: "save_preferences",
          tenant_id: tenantId,
          preferences,
        },
      });
    },
    [tenantId]
  );

  // FASE 6: Configure VendaZap AI
  const configureVendaZap = useCallback(async () => {
    if (!tenantId) return;
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("onboarding-ai", {
        body: { action: "configure_vendazap", tenant_id: tenantId },
      });
      if (error) throw error;
      const msg: AIMessage = {
        id: `a-${Date.now()}`,
        role: "assistant",
        content: `✅ **VendaZap AI configurado com sucesso!**\n\n🎯 **Tom:** ${data?.tom || "profissional"}\n📝 **Prompt gerado** com base no perfil da sua loja.\n\nPreview: _${data?.prompt_preview || ""}_\n\nAgora sugiro **executar os testes** para garantir que tudo está funcionando!`,
        timestamp: new Date(),
      };
      setMessages((prev) => [...prev, msg]);
    } catch {
      toast.error("Erro ao configurar VendaZap AI");
    }
    setLoading(false);
  }, [tenantId]);

  // FASE 7: Run guided tests
  const runTests = useCallback(async () => {
    if (!tenantId) return;
    setLoading(true);
    const startMsg: AIMessage = {
      id: `a-${Date.now()}`,
      role: "assistant",
      content: "🧪 **Executando testes automáticos...**\n\nTestando IA, WhatsApp, Email e PDF...",
      timestamp: new Date(),
    };
    setMessages((prev) => [...prev, startMsg]);

    try {
      const { data, error } = await supabase.functions.invoke("onboarding-ai", {
        body: { action: "run_tests", tenant_id: tenantId },
      });
      if (error) throw error;

      const results = data?.results || {};
      const lines = Object.entries(results).map(([key, val]: [string, any]) => {
        const icon = val.ok ? "✅" : "❌";
        const label: Record<string, string> = { openai: "IA de Vendas", whatsapp: "WhatsApp", email: "Email", pdf: "PDF" };
        return `${icon} **${label[key] || key}:** ${val.detail}`;
      });

      const summary = data?.criticalPassed
        ? "\n\n🎉 **Testes críticos OK!** Seu sistema está pronto. Que tal criar seu primeiro projeto?"
        : "\n\n⚠️ **Alguns testes falharam.** Verifique as APIs em Configurações > APIs.";

      const resultMsg: AIMessage = {
        id: `a-${Date.now() + 1}`,
        role: "assistant",
        content: `📋 **Resultado dos Testes:**\n\n${lines.join("\n")}${summary}`,
        timestamp: new Date(),
      };
      setMessages((prev) => [...prev, resultMsg]);
    } catch {
      toast.error("Erro ao executar testes");
    }
    setLoading(false);
  }, [tenantId]);

  // FASE 8: Suggest first project
  const suggestFirstProject = useCallback(async () => {
    if (!tenantId) return;
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("onboarding-ai", {
        body: { action: "suggest_first_project", tenant_id: tenantId },
      });
      if (error) throw error;

      const s = data?.suggestion;
      const envList = (s?.environments || []).map((e: string) => `  • ${e}`).join("\n");
      const modList = (s?.modules || []).map((m: string) => `  • ${m}`).join("\n");

      const msg: AIMessage = {
        id: `a-${Date.now()}`,
        role: "assistant",
        content: `🏗️ **Sugestão de Primeiro Projeto — ${data?.storeType || "Loja"}**\n\n📐 **Ambientes sugeridos:**\n${envList}\n\n🧩 **Módulos recomendados:**\n${modList}\n\n💰 **Faixa de preço:** ${s?.priceRange || "consulte"}\n\nPara começar, vá em **Simulador** e crie um orçamento com esses ambientes! 🚀`,
        timestamp: new Date(),
      };
      setMessages((prev) => [...prev, msg]);
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

function detectApiKeyInMessage(
  content: string
): { provider: string; key: string; url?: string } | null {
  // OpenAI key pattern
  const openaiMatch = content.match(/sk-[a-zA-Z0-9_-]{20,}/);
  if (openaiMatch) {
    return { provider: "openai", key: openaiMatch[0] };
  }

  // Resend key pattern
  const resendMatch = content.match(/re_[a-zA-Z0-9_]{20,}/);
  if (resendMatch) {
    return { provider: "resend", key: resendMatch[0] };
  }

  // Evolution API - look for URL + key combo
  const evolutionUrlMatch = content.match(
    /https?:\/\/[^\s]+evolution[^\s]*/i
  );
  const evolutionKeyMatch = content.match(
    /[A-Za-z0-9]{32,}/
  );
  if (
    evolutionUrlMatch &&
    evolutionKeyMatch &&
    !openaiMatch &&
    !resendMatch
  ) {
    return {
      provider: "evolution",
      key: evolutionKeyMatch[0],
      url: evolutionUrlMatch[0],
    };
  }

  return null;
}

function detectAndExecuteActions(reply: string, _tenantId: string) {
  try {
    const jsonMatch = reply.match(/\{[^}]*"action"[^}]*\}/);
    if (jsonMatch) {
      const action = JSON.parse(jsonMatch[0]);
      if (action.action === "save_api_key") {
        // Already handled in sendMessage
        console.log("AI suggested saving key for:", action.provider);
      }
    }
  } catch {
    // Not a JSON action, ignore
  }
}
