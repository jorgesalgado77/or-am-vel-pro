import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

async function resolveOpenAIKey(tenantId: string | null): Promise<string | null> {
  if (tenantId) {
    try {
      const sbUrl = Deno.env.get("SUPABASE_URL");
      const sbKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
      if (sbUrl && sbKey) {
        const sb = createClient(sbUrl, sbKey);
        const { data } = await sb.rpc("get_api_config", { p_tenant_id: tenantId, p_provider: "openai" });
        if (data && data.length > 0 && data[0].api_key) {
          return data[0].api_key;
        }
      }
    } catch (e) {
      console.warn("[resolveOpenAIKey] Fallback to global:", e);
    }
  }
  return Deno.env.get("OPENAI_API_KEY") || null;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { prompt, action, tenant_id } = await req.json();

    const OPENAI_API_KEY = await resolveOpenAIKey(tenant_id || null);
    if (!OPENAI_API_KEY) {
      return new Response(JSON.stringify({ error: "OPENAI_API_KEY não configurada. Configure nas Configurações > APIs." }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let systemPrompt = "";
    if (action === "improve_title") {
      systemPrompt = "Você é um especialista em copywriting para vendas de móveis planejados. Melhore o título do argumento de venda para ser mais persuasivo, profissional e impactante. Retorne APENAS o título melhorado, sem explicações, aspas ou prefixos.";
    } else if (action === "improve_argument") {
      systemPrompt = "Você é um especialista em vendas de móveis planejados. Melhore o argumento de venda para ser mais convincente, com linguagem persuasiva e técnica. Retorne APENAS o argumento melhorado, sem explicações, aspas ou prefixos. Máximo 500 caracteres.";
    } else if (action === "search_real_data") {
      systemPrompt = "Você é um pesquisador especialista no mercado de móveis planejados no Brasil. Busque e forneça dados reais, estatísticas, pesquisas e tendências sobre o tema solicitado. Inclua números, percentuais e fontes quando possível. Responda em português brasileiro. Máximo 500 caracteres.";
    } else {
      return new Response(JSON.stringify({ error: "Invalid action" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${OPENAI_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: prompt },
        ],
        max_tokens: 600,
      }),
    });

    if (!response.ok) {
      const t = await response.text();
      console.error("OpenAI error:", response.status, t);
      if (response.status === 429) {
        return new Response(JSON.stringify({ error: "Limite de requisições OpenAI excedido. Tente novamente em instantes." }), {
          status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      throw new Error(`OpenAI error ${response.status}`);
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content?.trim() || "";

    return new Response(JSON.stringify({ content }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("improve-argument error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
