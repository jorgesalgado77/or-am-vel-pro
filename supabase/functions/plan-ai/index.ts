import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { action, plan_name, plan_slug, enabled_features, price } = await req.json();

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      return new Response(JSON.stringify({ error: "LOVABLE_API_KEY não configurada" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let systemPrompt = "";
    let userPrompt = "";

    if (action === "generate_description") {
      systemPrompt = `Você é um copywriter especialista em SaaS B2B para o setor de móveis planejados. 
Crie descrições curtas, persuasivas e profissionais para planos de assinatura do sistema OrçaMóvel PRO.
A descrição deve ter no máximo 2 frases e destacar o valor do plano para o lojista.
Responda APENAS com o texto da descrição, sem aspas, sem explicações adicionais.`;

      const featList = (enabled_features || []).join(", ");
      const priceText = price > 0 ? `R$ ${price.toFixed(2).replace(".", ",")}/mês` : "gratuito";
      userPrompt = `Crie uma descrição para o plano "${plan_name}" (${priceText}) com as funcionalidades: ${featList || "funcionalidades básicas"}.`;
    } else if (action === "suggest_features") {
      systemPrompt = `Você é um especialista em planos de assinatura SaaS para lojas de móveis planejados (sistema OrçaMóvel PRO).
Sugira uma lista de benefícios/features que devem aparecer na landing page para um plano de assinatura.
Baseie-se nas funcionalidades habilitadas do sistema para criar descrições claras e atrativas.
Responda APENAS com uma lista JSON de objetos com "label" (string) e "included" (boolean true).
Exemplo: [{"label": "Gestão completa de clientes", "included": true}]`;

      const featList = (enabled_features || []).join(", ");
      userPrompt = `Sugira de 5 a 8 benefícios para o plano "${plan_name}" (slug: ${plan_slug}) com as funcionalidades ativas: ${featList || "básicas"}. Retorne APENAS o JSON array.`;
    } else {
      return new Response(JSON.stringify({ error: "Ação inválida" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
      }),
    });

    if (!response.ok) {
      if (response.status === 429) {
        return new Response(JSON.stringify({ error: "Limite de requisições excedido. Tente novamente em instantes." }), {
          status: 429,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (response.status === 402) {
        return new Response(JSON.stringify({ error: "Créditos de IA insuficientes." }), {
          status: 402,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const t = await response.text();
      console.error("AI gateway error:", response.status, t);
      return new Response(JSON.stringify({ error: "Erro no gateway de IA" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content || "";

    return new Response(JSON.stringify({ result: content }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("plan-ai error:", err);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
