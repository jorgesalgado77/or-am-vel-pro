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
  fechamento: "Gere uma mensagem de fechamento de venda. Seja direto mas não pressione demais. Facilite a decisão.",
  geral: "Gere uma mensagem de follow-up profissional e amigável para WhatsApp.",
};

const TOM_INSTRUCTIONS: Record<string, string> = {
  direto: "Use tom direto e objetivo. Vá direto ao ponto sem rodeios.",
  consultivo: "Use tom consultivo, como um especialista que quer ajudar. Faça perguntas estratégicas.",
  persuasivo: "Use tom persuasivo com gatilhos mentais sutis (escassez, prova social, autoridade).",
  amigavel: "Use tom amigável e próximo, como se fosse um amigo de confiança do cliente.",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY is not configured");

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
    } = await req.json();

    const copyInstruction = COPY_TYPES[tipo_copy] || COPY_TYPES.geral;
    const tomInstruction = TOM_INSTRUCTIONS[tom] || TOM_INSTRUCTIONS.persuasivo;

    let contextParts: string[] = [];
    if (nome_cliente) contextParts.push(`Nome do cliente: ${nome_cliente}`);
    if (valor_orcamento) contextParts.push(`Valor do orçamento: R$ ${Number(valor_orcamento).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`);
    if (status_negociacao) contextParts.push(`Status da negociação: ${status_negociacao}`);
    if (dias_sem_resposta !== undefined && dias_sem_resposta !== null) contextParts.push(`Dias sem resposta do cliente: ${dias_sem_resposta}`);
    if (deal_room_link) contextParts.push(`Link da Deal Room para incluir na mensagem: ${deal_room_link}`);

    const systemPrompt = prompt_sistema || "Você é um assistente de vendas especializado em móveis planejados. Gere mensagens curtas, persuasivas e naturais para WhatsApp. Foco em conversão.";

    const userPrompt = `${copyInstruction}
${tomInstruction}

CONTEXTO DO CLIENTE:
${contextParts.length > 0 ? contextParts.join("\n") : "Nenhum contexto específico fornecido."}

${mensagem_cliente ? `MENSAGEM DO CLIENTE PARA ANALISAR E RESPONDER:\n"${mensagem_cliente}"` : ""}

REGRAS:
- Máximo 3 parágrafos curtos
- Linguagem natural de WhatsApp (com emojis moderados)
- Não use saudações genéricas longas
- Inclua um CTA (call-to-action) claro
- Seja conciso e direto
${deal_room_link ? "- Inclua o link da Deal Room de forma natural na mensagem" : ""}

Gere APENAS a mensagem, sem explicações adicionais.`;

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        max_tokens: 500,
      }),
    });

    if (!response.ok) {
      if (response.status === 429) {
        return new Response(JSON.stringify({ error: "Limite de requisições excedido. Tente novamente em alguns segundos." }), {
          status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (response.status === 402) {
        return new Response(JSON.stringify({ error: "Créditos insuficientes. Entre em contato com o suporte." }), {
          status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const t = await response.text();
      console.error("AI gateway error:", response.status, t);
      return new Response(JSON.stringify({ error: "Erro ao gerar mensagem" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const data = await response.json();
    const mensagem = data.choices?.[0]?.message?.content || "";
    const tokensUsados = data.usage?.total_tokens || 0;

    return new Response(JSON.stringify({ mensagem, tokens_usados: tokensUsados }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("vendazap-ai error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Erro desconhecido" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
