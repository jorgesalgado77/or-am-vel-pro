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

// Intent detection keywords
const INTENT_PATTERNS: Record<string, RegExp[]> = {
  orcamento: [/or[çc]amento/i, /quanto custa/i, /valor/i, /pre[çc]o/i, /tabela/i, /proposta/i],
  fechamento: [/fechar/i, /quero comprar/i, /vamos fechar/i, /aceito/i, /pode fazer/i, /fechado/i, /vou levar/i],
  preco: [/desconto/i, /mais barato/i, /negocia/i, /condi[çc][ãa]o/i, /parcel/i, /pagamento/i],
  duvida: [/como funciona/i, /dúvida/i, /explica/i, /qual a diferen/i, /tem garantia/i, /prazo/i],
  objecao: [/caro/i, /n[ãa]o sei/i, /vou pensar/i, /depois/i, /outro lugar/i, /concorr/i],
  saudacao: [/bom dia/i, /boa tarde/i, /boa noite/i, /oi/i, /ol[áa]/i, /tudo bem/i],
};

function detectIntent(message: string): string {
  if (!message) return "outro";
  
  const priority = ["fechamento", "orcamento", "preco", "objecao", "duvida", "saudacao"];
  
  for (const intent of priority) {
    const patterns = INTENT_PATTERNS[intent];
    if (patterns.some((p) => p.test(message))) {
      return intent;
    }
  }
  
  return "outro";
}

const INTENT_PROMPTS: Record<string, string> = {
  orcamento: "O cliente está pedindo um orçamento. Responda de forma profissional, pergunte detalhes do projeto e demonstre expertise.",
  fechamento: "O cliente está pronto para fechar! Confirme os detalhes, reforce o valor e facilite o fechamento.",
  preco: "O cliente está negociando preço. Destaque o valor agregado, ofereça condições e mantenha a margem.",
  duvida: "O cliente tem dúvidas. Responda de forma clara, didática e aproveite para mostrar diferenciais.",
  objecao: "O cliente tem objeções. Contorne com empatia, apresente provas sociais e benefícios exclusivos.",
  saudacao: "O cliente está iniciando contato. Seja caloroso, apresente-se brevemente e pergunte como pode ajudar.",
  outro: "Responda de forma atenciosa e tente identificar a necessidade do cliente.",
};

serve(async (req) => {
  if (req.method === "OPTIONS")
    return new Response(null, { headers: corsHeaders });

  try {
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
    const max_tokens = typeof body.max_tokens === "number" ? Math.min(body.max_tokens, 2000) : 500;
    const modo = typeof body.modo === "string" ? body.modo : "sugestao";
    const historico = Array.isArray(body.historico) ? body.historico.slice(-10) : [];

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      return respond({ error: "LOVABLE_API_KEY não configurada" }, 500);
    }

    // Detect intent from client message
    const intencao = detectIntent(mensagem_cliente);
    const intentContext = INTENT_PROMPTS[intencao] || INTENT_PROMPTS.outro;

    const systemPrompt =
      (prompt_sistema ||
      `Você é um assistente de vendas especializado em móveis planejados. 
Gere mensagens persuasivas para WhatsApp em português brasileiro.
Seja profissional, amigável e direto.`) +
      `\n\n--- CONTEXTO DA INTENÇÃO ---\n${intentContext}` +
      (modo === "autopilot"
        ? "\n\n--- MODO AUTO-PILOT ---\nVocê está respondendo AUTOMATICAMENTE. Seja conciso (máx 3 parágrafos). Inclua uma pergunta para manter a conversa. NÃO use saudações formais excessivas."
        : "");

    let userPrompt = `Gere uma mensagem de ${tipo_copy} com tom ${tom}.`;
    if (nome_cliente) userPrompt += `\nNome do cliente: ${nome_cliente}`;
    if (valor_orcamento) userPrompt += `\nValor do orçamento: R$ ${valor_orcamento}`;
    if (status_negociacao) userPrompt += `\nStatus da negociação: ${status_negociacao}`;
    if (dias_sem_resposta) userPrompt += `\nDias sem resposta: ${dias_sem_resposta}`;
    if (mensagem_cliente) userPrompt += `\nMensagem do cliente: "${mensagem_cliente}"`;
    if (deal_room_link) userPrompt += `\nLink da sala de negociação: ${deal_room_link}`;

    // Add conversation history for context
    if (historico.length > 0) {
      userPrompt += "\n\n--- HISTÓRICO RECENTE ---";
      for (const h of historico) {
        const role = h.remetente_tipo === "cliente" ? "Cliente" : "Vendedor";
        userPrompt += `\n${role}: ${(h.mensagem || "").slice(0, 200)}`;
      }
    }

    const aiRes = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
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
        max_tokens,
        temperature: 0.7,
      }),
    });

    if (!aiRes.ok) {
      const errText = await aiRes.text();
      console.error("AI gateway error:", aiRes.status, errText);

      if (aiRes.status === 429) {
        return respond({ error: "Limite de requisições excedido. Tente novamente em alguns segundos." }, 429);
      }
      if (aiRes.status === 402) {
        return respond({ error: "Créditos de IA esgotados. Adicione créditos no painel." }, 402);
      }

      return respond({ error: "Erro na API de IA" }, 502);
    }

    const aiData = await aiRes.json();
    const mensagem = aiData.choices?.[0]?.message?.content || "";
    const tokens_usados = aiData.usage?.total_tokens || 0;

    return respond({ mensagem, tokens_usados, intencao, modo });
  } catch (e) {
    console.error("vendazap-ai error:", e);
    return respond({ error: "Erro interno" }, 500);
  }
});
