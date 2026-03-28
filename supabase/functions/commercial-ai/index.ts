import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

type AiProvider = "lovable" | "openai";

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

async function getAvailableProviders(adminClient: ReturnType<typeof createClient>, tenantId: string) {
  const { data } = await adminClient
    .from("api_keys")
    .select("provider, api_key, is_active")
    .eq("tenant_id", tenantId)
    .eq("is_active", true);

  const openaiKey = (data || []).find((item: any) => item.provider === "openai")?.api_key || null;

  return {
    openaiKey,
    availableProviders: [
      { value: "lovable", label: "Lovable AI", active: Boolean(Deno.env.get("LOVABLE_API_KEY")) },
      { value: "openai", label: "OpenAI", active: Boolean(openaiKey) },
    ].filter((item) => item.active),
  };
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { action, tenant_id, messages, metrics_summary, preferred_provider } = await req.json();
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || anonKey;
    const adminClient = createClient(supabaseUrl, serviceRoleKey);

    if (!tenant_id) return jsonResponse({ error: "tenant_id obrigatório" }, 400);

    const { openaiKey, availableProviders } = await getAvailableProviders(adminClient, tenant_id);

    if (action === "get_available_providers") {
      return jsonResponse({ providers: availableProviders, default_provider: openaiKey ? "openai" : "lovable" });
    }

    if (action === "check_alerts") {
      const { data: clients } = await adminClient
        .from("clients")
        .select("id, status, created_at, updated_at, nome, responsavel_id")
        .eq("tenant_id", tenant_id)
        .not("status", "in", '("fechado","perdido")');

      const threeDaysAgo = new Date();
      threeDaysAgo.setDate(threeDaysAgo.getDate() - 3);
      const stalled = (clients || []).filter((c: any) => new Date(c.updated_at || c.created_at) < threeDaysAgo);

      const { count: totalCount } = await adminClient
        .from("clients")
        .select("id", { count: "exact", head: true })
        .eq("tenant_id", tenant_id);

      const { count: closedCount } = await adminClient
        .from("clients")
        .select("id", { count: "exact", head: true })
        .eq("tenant_id", tenant_id)
        .eq("status", "fechado");

      const conversionRate = (totalCount && totalCount > 0) ? ((closedCount || 0) / totalCount) * 100 : 0;
      const alerts = [];

      if (stalled.length > 0) {
        alerts.push({
          type: "stalled_leads",
          priority: "high",
          title: "⚠️ Leads Parados",
          body: `${stalled.length} lead(s) sem resposta há mais de 3 dias!`,
          count: stalled.length,
        });
      }

      if (conversionRate < 15 && (totalCount || 0) > 5) {
        alerts.push({
          type: "low_conversion",
          priority: "high",
          title: "📉 Conversão em Queda",
          body: `Taxa de conversão em ${conversionRate.toFixed(1)}% — abaixo da média do setor.`,
          rate: conversionRate,
        });
      }

      return jsonResponse({ success: true, alerts, providers: availableProviders, connected: availableProviders.length > 0 });
    }

    const selectedProvider: AiProvider = preferred_provider === "openai" && openaiKey ? "openai" : "lovable";
    const apiKey = selectedProvider === "openai" ? openaiKey : Deno.env.get("LOVABLE_API_KEY");

    if (!apiKey) {
      return jsonResponse({ error: "Nenhuma IA ativa disponível para este tenant.", providers: availableProviders }, 500);
    }

    const systemPrompt = `Você é a IA Gerente Comercial do OrçaMóvel PRO.

Seu papel é:
- Analisar dados de vendas e orientar vendedores
- Identificar gargalos e oportunidades
- Cobrar resultados de forma assertiva, mas motivacional
- Sugerir ações práticas baseadas nos dados

Dados atuais do CRM:
${metrics_summary || "Dados não disponíveis no momento."}

Regras:
- Responda em português brasileiro
- Seja direto e prático
- Use Markdown
- Baseie-se sempre nos dados fornecidos
- Sugira ações específicas e mensuráveis`;

    if (selectedProvider === "openai") {
      const response = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "gpt-4o-mini",
          messages: [{ role: "system", content: systemPrompt }, ...(messages || [])],
          stream: true,
        }),
      });

      if (!response.ok) {
        const text = await response.text();
        console.error("commercial-ai openai error:", response.status, text);
        return jsonResponse({ error: "Erro ao conectar com OpenAI", provider: selectedProvider, providers: availableProviders }, response.status >= 400 && response.status < 600 ? response.status : 500);
      }

      return new Response(response.body, { headers: { ...corsHeaders, "Content-Type": "text/event-stream" } });
    }

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [{ role: "system", content: systemPrompt }, ...(messages || [])],
        stream: true,
      }),
    });

    if (!response.ok) {
      const text = await response.text();
      console.error("commercial-ai lovable error:", response.status, text);
      const errorMessage = response.status === 429
        ? "Limite de requisições excedido."
        : response.status === 402
        ? "Créditos de IA esgotados."
        : "Erro ao conectar com a IA.";
      return jsonResponse({ error: errorMessage, provider: selectedProvider, providers: availableProviders }, response.status >= 400 && response.status < 600 ? response.status : 500);
    }

    return new Response(response.body, { headers: { ...corsHeaders, "Content-Type": "text/event-stream" } });
  } catch (e) {
    console.error("commercial-ai error:", e);
    return jsonResponse({ error: e instanceof Error ? e.message : "Erro interno" }, 500);
  }
});