import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS")
    return new Response(null, { headers: corsHeaders });

  try {
    const {
      nome_cliente,
      valor_orcamento,
      status_negociacao,
      dias_sem_resposta,
      mensagem_cliente,
      tipo_copy,
      tom,
      deal_room_link,
      prompt_sistema,
      api_provider,
      openai_model,
      max_tokens,
    } = await req.json();

    const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY");
    if (!OPENAI_API_KEY) {
      return new Response(
        JSON.stringify({ error: "OPENAI_API_KEY não configurada" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const systemPrompt =
      prompt_sistema ||
      `Você é um assistente de vendas especializado em móveis planejados. 
Gere mensagens persuasivas para WhatsApp em português brasileiro.
Seja profissional, amigável e direto.`;

    let userPrompt = `Gere uma mensagem de ${tipo_copy || "follow-up"} com tom ${tom || "persuasivo"}.`;
    if (nome_cliente) userPrompt += `\nNome do cliente: ${nome_cliente}`;
    if (valor_orcamento) userPrompt += `\nValor do orçamento: R$ ${valor_orcamento}`;
    if (status_negociacao) userPrompt += `\nStatus da negociação: ${status_negociacao}`;
    if (dias_sem_resposta) userPrompt += `\nDias sem resposta: ${dias_sem_resposta}`;
    if (mensagem_cliente) userPrompt += `\nÚltima mensagem do cliente: "${mensagem_cliente}"`;
    if (deal_room_link) userPrompt += `\nLink da sala de negociação: ${deal_room_link}`;

    const model = openai_model || "gpt-4o-mini";

    const openaiRes = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${OPENAI_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        max_tokens: max_tokens || 500,
        temperature: 0.7,
      }),
    });

    if (!openaiRes.ok) {
      const errText = await openaiRes.text();
      console.error("OpenAI error:", openaiRes.status, errText);
      return new Response(
        JSON.stringify({ error: "Erro na API de IA" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const openaiData = await openaiRes.json();
    const mensagem = openaiData.choices?.[0]?.message?.content || "";
    const tokens_usados = openaiData.usage?.total_tokens || 0;

    return new Response(
      JSON.stringify({ mensagem, tokens_usados }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (e) {
    console.error("vendazap-ai error:", e);
    return new Response(
      JSON.stringify({ error: "Erro interno" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
