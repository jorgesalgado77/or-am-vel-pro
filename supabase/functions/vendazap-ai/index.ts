import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

function respond(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

serve(async (req) => {
  if (req.method === "OPTIONS")
    return new Response(null, { headers: corsHeaders });

  try {
    // Validate auth header
    const authHeader = req.headers.get("authorization");
    if (!authHeader?.startsWith("Bearer ") || authHeader.replace("Bearer ", "").length < 20) {
      return respond({ error: "Não autorizado" }, 401);
    }

    let body: Record<string, unknown>;
    try {
      body = await req.json();
    } catch {
      return respond({ error: "Body inválido" }, 400);
    }

    const nome_cliente = typeof body.nome_cliente === "string" ? body.nome_cliente.slice(0, 200) : "";
    const valor_orcamento = typeof body.valor_orcamento === "number" ? body.valor_orcamento : null;
    const status_negociacao = typeof body.status_negociacao === "string" ? body.status_negociacao.slice(0, 100) : "";
    const dias_sem_resposta = typeof body.dias_sem_resposta === "number" ? body.dias_sem_resposta : null;
    const mensagem_cliente = typeof body.mensagem_cliente === "string" ? body.mensagem_cliente.slice(0, 1000) : "";
    const tipo_copy = typeof body.tipo_copy === "string" ? body.tipo_copy.slice(0, 50) : "follow-up";
    const tom = typeof body.tom === "string" ? body.tom.slice(0, 50) : "persuasivo";
    const deal_room_link = typeof body.deal_room_link === "string" ? body.deal_room_link.slice(0, 500) : "";
    const prompt_sistema = typeof body.prompt_sistema === "string" ? body.prompt_sistema.slice(0, 2000) : "";
    const openai_model = typeof body.openai_model === "string" ? body.openai_model.slice(0, 50) : "gpt-4o-mini";
    const max_tokens = typeof body.max_tokens === "number" ? Math.min(body.max_tokens, 2000) : 500;

    const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY");
    if (!OPENAI_API_KEY) {
      return respond({ error: "OPENAI_API_KEY não configurada" }, 500);
    }

    const systemPrompt =
      prompt_sistema ||
      `Você é um assistente de vendas especializado em móveis planejados. 
Gere mensagens persuasivas para WhatsApp em português brasileiro.
Seja profissional, amigável e direto.`;

    let userPrompt = `Gere uma mensagem de ${tipo_copy} com tom ${tom}.`;
    if (nome_cliente) userPrompt += `\nNome do cliente: ${nome_cliente}`;
    if (valor_orcamento) userPrompt += `\nValor do orçamento: R$ ${valor_orcamento}`;
    if (status_negociacao) userPrompt += `\nStatus da negociação: ${status_negociacao}`;
    if (dias_sem_resposta) userPrompt += `\nDias sem resposta: ${dias_sem_resposta}`;
    if (mensagem_cliente) userPrompt += `\nÚltima mensagem do cliente: "${mensagem_cliente}"`;
    if (deal_room_link) userPrompt += `\nLink da sala de negociação: ${deal_room_link}`;

    const openaiRes = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${OPENAI_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: openai_model,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        max_tokens,
        temperature: 0.7,
      }),
    });

    if (!openaiRes.ok) {
      const errText = await openaiRes.text();
      console.error("OpenAI error:", openaiRes.status, errText);
      return respond({ error: "Erro na API de IA" }, 502);
    }

    const openaiData = await openaiRes.json();
    const mensagem = openaiData.choices?.[0]?.message?.content || "";
    const tokens_usados = openaiData.usage?.total_tokens || 0;

    return respond({ mensagem, tokens_usados });
  } catch (e) {
    console.error("vendazap-ai error:", e);
    return respond({ error: "Erro interno" }, 500);
  }
});
