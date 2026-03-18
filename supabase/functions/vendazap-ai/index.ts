import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const COPY_TYPES: Record<string, string> = {
  reativacao: "Gere uma mensagem de reativação para um cliente que parou de responder. Seja empático e crie urgência sutil. Relembre o projeto e o valor que ele traz.",
  urgencia: "Gere uma mensagem de urgência informando que o orçamento está prestes a expirar. Crie FOMO sem ser agressivo. Mencione que as condições podem mudar.",
  objecao: "Analise a objeção do cliente e gere uma resposta que quebre essa objeção com argumentos convincentes. Use dados e benefícios concretos.",
  reuniao: "Gere um convite persuasivo para uma reunião/apresentação do projeto. Destaque o valor da conversa e o que o cliente vai ganhar.",
  fechamento: "Gere uma mensagem de fechamento de venda. Seja direto, confiante e facilite a decisão. Mostre segurança e profissionalismo.",
  geral: "Gere uma mensagem de follow-up profissional e amigável para WhatsApp. Mantenha o relacionamento e gere engajamento.",
};

const TOM_INSTRUCTIONS: Record<string, string> = {
  direto: "Use tom direto e objetivo. Vá direto ao ponto sem rodeios.",
  consultivo: "Use tom consultivo, como um especialista que quer ajudar. Faça perguntas estratégicas.",
  persuasivo: "Use tom persuasivo com gatilhos mentais sutis de conversão (escassez, prova social, autoridade).",
  amigavel: "Use tom amigável e próximo, como um consultor de confiança do cliente.",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY");
    if (!OPENAI_API_KEY) {
      return new Response(JSON.stringify({ error: "OPENAI_API_KEY ainda não foi configurada. Configure a chave no painel de administração." }), {
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
      openai_model = "gpt-4o-mini",
      max_tokens = 300,
    } = await req.json();

    const copyInstruction = COPY_TYPES[tipo_copy] || COPY_TYPES.geral;
    const tomInstruction = TOM_INSTRUCTIONS[tom] || TOM_INSTRUCTIONS.persuasivo;

    const contextParts: string[] = [];
    if (nome_cliente) contextParts.push(`Nome do cliente: ${nome_cliente}`);
    if (valor_orcamento) contextParts.push(`Valor do orçamento: R$ ${Number(valor_orcamento).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`);
    if (status_negociacao) {
      const statusMap: Record<string, string> = {
        novo: "Novo lead (primeiro contato)",
        em_negociacao: "Em negociação ativa",
        proposta_enviada: "Proposta já enviada, aguardando resposta",
        fechado: "Venda fechada",
        perdido: "Cliente perdido",
      };
      contextParts.push(`Status da negociação: ${statusMap[status_negociacao] || status_negociacao}`);
    }
    if (dias_sem_resposta !== undefined && dias_sem_resposta !== null) {
      contextParts.push(`Dias sem resposta do cliente: ${dias_sem_resposta}`);
      if (dias_sem_resposta > 7) contextParts.push("⚠️ Cliente está frio, precisa de reengajamento urgente.");
      else if (dias_sem_resposta > 3) contextParts.push("⚡ Cliente esfriando, agir rapidamente.");
    }
    if (deal_room_link) contextParts.push(`Link da Deal Room para incluir: ${deal_room_link}`);

    const systemPrompt = prompt_sistema || `Você é um assistente de vendas especializado em móveis planejados e marcenaria.
Você gera mensagens curtas, persuasivas e naturais para WhatsApp.
Seu objetivo é maximizar a conversão de vendas.
Regras:
- Use linguagem natural de WhatsApp (emojis com moderação, linguagem informal mas profissional)
- Máximo 3 blocos curtos de texto
- Sempre inclua um CTA (call-to-action) claro
- Personalize com o nome do cliente quando disponível
- Foco em gerar urgência e valor
- NÃO use saudações genéricas como "Prezado" ou "Caro"
- Responda APENAS com a mensagem final, sem explicações`;

    const userPrompt = `INSTRUÇÃO: ${copyInstruction}
TOM: ${tomInstruction}

CONTEXTO DO CLIENTE:
${contextParts.length > 0 ? contextParts.join("\n") : "Nenhum contexto específico fornecido."}

${mensagem_cliente ? `MENSAGEM DO CLIENTE PARA ANALISAR:\n"${mensagem_cliente}"\n\nAnalise essa mensagem, identifique objeções ou sentimentos e gere a melhor resposta possível.` : ""}

${deal_room_link ? "IMPORTANTE: Inclua o link da Deal Room de forma natural na mensagem." : ""}

Retorne APENAS a mensagem final pronta para enviar no WhatsApp.`;

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
      console.error("OpenAI API error:", response.status, errorText);
      
      if (response.status === 429) {
        return new Response(JSON.stringify({ error: "Limite de requisições da OpenAI atingido. Tente novamente em alguns segundos." }), {
          status: 429,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (response.status === 401) {
        return new Response(JSON.stringify({ error: "Chave da OpenAI inválida ou expirada. Verifique a configuração." }), {
          status: 401,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      
      return new Response(JSON.stringify({ error: `Erro na API OpenAI [${response.status}]` }), {
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
    console.error("VendaZap AI error:", error);
    const errorMessage = error instanceof Error ? error.message : "Erro desconhecido";
    return new Response(JSON.stringify({ error: errorMessage }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
