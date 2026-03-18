import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const COPY_TYPES: Record<string, string> = {
  reativacao: "Gere uma mensagem de reativação para um cliente que parou de responder. Seja empático e crie urgência sutil.",
  urgencia: "Gere uma mensagem de urgência informando que o orçamento está prestes a expirar. Crie FOMO sem ser agressivo.",
  objecao: "Analise a objeção do cliente e gere uma resposta que quebre essa objeção com argumentos convincentes.",
  reuniao: "Gere um convite persuasivo para uma reunião/apresentação. Destaque o valor da conversa.",
  fechamento: "Gere uma mensagem de fechamento de venda. Seja direto, confiante e facilite a decisão.",
  geral: "Gere uma mensagem de follow-up profissional e amigável para WhatsApp.",
};

const TOM_INSTRUCTIONS: Record<string, string> = {
  direto: "Use tom direto e objetivo. Vá direto ao ponto sem rodeios.",
  consultivo: "Use tom consultivo, como um especialista que quer ajudar. Faça perguntas estratégicas.",
  persuasivo: "Use tom persuasivo com gatilhos mentais sutis de conversão.",
  amigavel: "Use tom amigável e próximo, como alguém de confiança do cliente.",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY");
    if (!OPENAI_API_KEY) {
      return new Response(JSON.stringify({ error: "OPENAI_API_KEY ainda não foi configurada para o VendaZap AI." }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const {
      nome_cliente,
      valor_orcamento,
      status_negociacao,
      dias_sem_resposta,
      mensagem_cliente,
      tipo_copy = "geral",
      tom = "persuasivo",
      prompt_sistema,
      deal_room_link,
      openai_model = "gpt-4.1-mini",
      max_tokens = 300,
    } = await req.json();

    const copyInstruction = COPY_TYPES[tipo_copy] || COPY_TYPES.geral;
    const tomInstruction = TOM_INSTRUCTIONS[tom] || TOM_INSTRUCTIONS.persuasivo;

    const contextParts: string[] = [];
    if (nome_cliente) contextParts.push(`Nome do cliente: ${nome_cliente}`);
    if (valor_orcamento) contextParts.push(`Valor do orçamento: R$ ${Number(valor_orcamento).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`);
    if (status_negociacao) contextParts.push(`Status da negociação: ${status_negociacao}`);
    if (dias_sem_resposta !== undefined && dias_sem_resposta !== null) contextParts.push(`Dias sem resposta do cliente: ${dias_sem_resposta}`);
    if (deal_room_link) contextParts.push(`Link da Deal Room para incluir: ${deal_room_link}`);

    const systemPrompt = prompt_sistema || "Você é um assistente de vendas especializado em móveis planejados. Gere mensagens curtas, persuasivas e naturais para WhatsApp. Foco em conversão.";

    const userPrompt = `${copyInstruction}
${tomInstruction}

CONTEXTO:
${contextParts.length > 0 ? contextParts.join("\n") : "Nenhum contexto específico fornecido."}

${mensagem_cliente ? `MENSAGEM DO CLIENTE:\n"${mensagem_cliente}"` : ""}

REGRAS:
- Responda em português do Brasil
- Máximo 3 blocos curtos
- Linguagem natural de WhatsApp
- Inclua CTA claro
- Seja conciso
${deal_room_link ? "- Inclua o link da Deal Room de forma natural" : ""}

Retorne apenas a mensagem final.`;

    const response = await fetch("https://api.openai.com/v1/chat/completions", {
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
        max_tokens: Math.min(Number(max_tokens) || 300, 600),
        temperature: 0.8,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      return new Response(JSON.stringify({ error: `Erro OpenAI [${response.status}]: ${errorText}` }), {
        status: response.status,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const data = await response.json();
    const mensagem = data.choices?.[0]?.message?.content?.trim() || "";
    const tokensUsados = data.usage?.total_tokens || 0;

    return new Response(JSON.stringify({ mensagem, tokens_usados: tokensUsados }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Erro desconhecido";
    return new Response(JSON.stringify({ error: errorMessage }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
