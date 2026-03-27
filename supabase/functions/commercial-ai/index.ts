import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { action, tenant_id, messages, metrics_summary } = await req.json();

    // First try tenant's own OpenAI key, then fallback to LOVABLE_API_KEY
    let apiKey = "";
    let apiUrl = "https://ai.gateway.lovable.dev/v1/chat/completions";
    let model = "google/gemini-3-flash-preview";

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_ANON_KEY")!;

    if (tenant_id) {
      const adminClient = createClient(supabaseUrl, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || supabaseKey);
      const { data: apiConfig } = await adminClient
        .from("api_keys")
        .select("openai_key")
        .eq("tenant_id", tenant_id)
        .maybeSingle();

      if (apiConfig?.openai_key) {
        apiKey = apiConfig.openai_key;
        apiUrl = "https://api.openai.com/v1/chat/completions";
        model = "gpt-4o-mini";
      }
    }

    if (!apiKey) {
      apiKey = Deno.env.get("LOVABLE_API_KEY") || "";
    }

    if (!apiKey) {
      return new Response(JSON.stringify({ error: "Nenhuma API key configurada" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // --- ACTION: check_alerts (for push notifications) ---
    if (action === "check_alerts") {
      const adminClient = createClient(supabaseUrl, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || supabaseKey);
      
      const { data: clients } = await adminClient
        .from("clients")
        .select("id, status, created_at, nome, responsavel_id")
        .eq("tenant_id", tenant_id)
        .not("status", "in", '("fechado","perdido")');

      const threeDaysAgo = new Date();
      threeDaysAgo.setDate(threeDaysAgo.getDate() - 3);
      
      const stalled = (clients || []).filter((c: any) => new Date(c.created_at) < threeDaysAgo);
      
      // Calculate conversion rate
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

      return new Response(JSON.stringify({ success: true, alerts }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // --- ACTION: chat (streaming AI) ---
    const systemPrompt = `Você é a IA Gerente Comercial do OrçaMóvel PRO, um sistema SaaS para lojas de móveis planejados.

Seu papel é:
- Analisar dados de vendas e orientar vendedores
- Identificar gargalos e oportunidades
- Cobrar resultados de forma assertiva mas motivacional
- Sugerir ações práticas baseadas nos dados

Dados atuais do CRM:
${metrics_summary || "Dados não disponíveis no momento."}

Regras:
- Responda em português brasileiro
- Seja direto e prático
- Use emojis moderadamente
- Formate em Markdown
- Baseie-se SEMPRE nos dados fornecidos
- Sugira ações específicas e mensuráveis
- Aja como um gerente experiente que cobra mas também motiva`;

    const allMessages = [
      { role: "system", content: systemPrompt },
      ...(messages || []),
    ];

    const response = await fetch(apiUrl, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        messages: allMessages,
        stream: true,
      }),
    });

    if (!response.ok) {
      if (response.status === 429) {
        return new Response(JSON.stringify({ error: "Limite de requisições excedido. Tente novamente em alguns minutos." }), {
          status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (response.status === 402) {
        return new Response(JSON.stringify({ error: "Créditos de IA esgotados." }), {
          status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const t = await response.text();
      console.error("AI error:", response.status, t);
      return new Response(JSON.stringify({ error: "Erro na IA" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(response.body, {
      headers: { ...corsHeaders, "Content-Type": "text/event-stream" },
    });
  } catch (e) {
    console.error("commercial-ai error:", e);
    return new Response(JSON.stringify({ error: "Erro interno" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
