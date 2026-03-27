import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

/**
 * Resolve Perplexity API key: tenant-specific first, then global fallback.
 */
async function resolvePerplexityKey(tenantId: string | null): Promise<string | null> {
  if (tenantId) {
    try {
      const sbUrl = Deno.env.get("SUPABASE_URL");
      const sbKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
      if (sbUrl && sbKey) {
        const sb = createClient(sbUrl, sbKey);
        const { data } = await sb.rpc("get_api_config", { p_tenant_id: tenantId, p_provider: "perplexity" });
        if (data && data.length > 0 && data[0].api_key) {
          return data[0].api_key;
        }
      }
    } catch (e) {
      console.warn("[resolvePerplexityKey] Fallback to global:", e);
    }
  }
  return Deno.env.get("PERPLEXITY_API_KEY") || null;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { query, context, search_recency_filter, tenant_id, _temp_key } = await req.json();

    const PERPLEXITY_API_KEY = _temp_key || await resolvePerplexityKey(tenant_id || null);
    if (!PERPLEXITY_API_KEY) {
      return new Response(JSON.stringify({ error: "PERPLEXITY_API_KEY não configurada. Configure nas Configurações > APIs." }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!query || typeof query !== "string") {
      return new Response(JSON.stringify({ error: "Query é obrigatória" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const response = await fetch("https://api.perplexity.ai/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${PERPLEXITY_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "sonar",
        messages: [
          {
            role: "system",
            content: `Você é um assistente de pesquisa de mercado especializado no setor de móveis planejados e sob medida no Brasil.
Forneça dados REAIS, atualizados e verificáveis. Inclua números, estatísticas, tendências e fontes quando disponível.
Foco: tendências de design, preços de mercado, materiais, concorrência, comportamento do consumidor brasileiro.
${context ? `Contexto adicional: ${context}` : ""}
Responda em português brasileiro, de forma concisa e prática para uso em argumentação de vendas.`,
          },
          { role: "user", content: query },
        ],
        search_recency_filter: search_recency_filter || "month",
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error("Perplexity error:", response.status, errText);
      if (response.status === 429) {
        return new Response(JSON.stringify({ error: "Limite de requisições excedido" }), {
          status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      return new Response(JSON.stringify({ error: "Erro na API Perplexity" }), {
        status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content || "";
    const citations = data.citations || [];

    return new Response(JSON.stringify({ content, citations }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("perplexity-search error:", e);
    return new Response(JSON.stringify({ error: "Erro interno" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
