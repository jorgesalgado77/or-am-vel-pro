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
  enviar_preco: [/manda.*pre[çc]o/i, /envia.*pre[çc]o/i, /envia.*valor/i, /manda.*valor/i, /manda.*or[çc]amento/i, /envia.*or[çc]amento/i, /envia.*whats/i, /manda.*whats/i, /por whats/i, /pelo whats/i, /por e-?mail/i, /pelo e-?mail/i, /por mensagem/i, /pela mensagem/i, /manda.*por aqui/i, /envia.*por aqui/i, /passa.*pre[çc]o/i, /passa.*valor/i, /me envia/i, /pode mandar/i, /pode enviar/i],
  duvida: [/como funciona/i, /dúvida/i, /explica/i, /qual a diferen/i, /tem garantia/i, /prazo/i],
  objecao: [/caro/i, /n[ãa]o sei/i, /vou pensar/i, /depois/i, /outro lugar/i, /concorr/i, /n[ãa]o quero/i, /desist/i, /cancel/i],
  saudacao: [/bom dia/i, /boa tarde/i, /boa noite/i, /oi/i, /ol[áa]/i, /tudo bem/i],
};

function detectIntent(message: string): string {
  if (!message) return "outro";
  const priority = ["fechamento", "enviar_preco", "orcamento", "preco", "objecao", "duvida", "saudacao"];
  for (const intent of priority) {
    const patterns = INTENT_PATTERNS[intent];
    if (patterns.some((p) => p.test(message))) return intent;
  }
  return "outro";
}

function calcClosingScore(intent: string, tipoCopy: string): number {
  const intentScores: Record<string, number> = {
    fechamento: 95, enviar_preco: 55, orcamento: 60, preco: 50,
    duvida: 40, objecao: 30, saudacao: 20, outro: 35,
  };
  const copyBonus: Record<string, number> = {
    fechamento: 15, urgencia: 10, objecao: 5, reuniao: 5, reativacao: -5, geral: 0,
  };
  const base = intentScores[intent] || 35;
  const bonus = copyBonus[tipoCopy] || 0;
  return Math.max(5, Math.min(100, base + bonus));
}

// Determine if Perplexity search would add value
function shouldUsePerplexity(intent: string, mensagem: string): boolean {
  const perplexityTriggers = [
    /tend[eê]ncia/i, /mercado/i, /concorr[eê]ncia/i, /pre[çc]o.*m[eé]dio/i,
    /quanto.*custa.*m[eé]dia/i, /compara/i, /melhor.*material/i, /novidade/i,
    /sustent/i, /fsc/i, /mdf.*mdp/i, /blum/i, /hafele/i, /hettich/i,
    /design.*202/i, /feira/i, /pesquisa/i, /dado.*real/i, /estad[ií]stica/i,
  ];
  return perplexityTriggers.some(p => p.test(mensagem));
}

// Fetch real-time data from Perplexity when needed
async function fetchPerplexityData(query: string): Promise<string> {
  const PERPLEXITY_API_KEY = Deno.env.get("PERPLEXITY_API_KEY");
  if (!PERPLEXITY_API_KEY) return "";

  try {
    const res = await fetch("https://api.perplexity.ai/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${PERPLEXITY_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "sonar",
        messages: [
          { role: "system", content: "Forneça dados REAIS e atuais sobre o mercado de móveis planejados no Brasil. Seja conciso (máx 3 frases). Foque em números e fatos verificáveis." },
          { role: "user", content: query },
        ],
        search_recency_filter: "month",
      }),
    });
    if (!res.ok) return "";
    const data = await res.json();
    return data.choices?.[0]?.message?.content || "";
  } catch {
    return "";
  }
}

const INTENT_PROMPTS: Record<string, string> = {
  orcamento: `O cliente pediu orçamento — FORTE sinal de interesse. NÃO envie valores. Diga que o projeto é PERSONALIZADO e merece uma apresentação exclusiva. Convide para a Deal Room/reunião online.`,
  fechamento: `O cliente está PRONTO. Confirme detalhes, reforce a escolha, crie urgência e pergunte "Posso preparar o contrato agora?"`,
  preco: `Negociando preço = interesse! NÃO envie valores por texto. Destaque VALOR, não preço. Convide para a Deal Room para discutir condições especiais ao vivo.`,
  enviar_preco: `🔴 REGRA ABSOLUTA: NUNCA envie preço/valor/orçamento por mensagem. SEMPRE contorne: "Seu projeto é exclusivo e merece uma apresentação personalizada!" Inclua o link da Deal Room.`,
  duvida: `Responda com segurança e brevidade. Use cada resposta para mostrar diferenciais. Termine direcionando para próximo passo.`,
  objecao: `NUNCA concorde. Quebre com dados, provas sociais, comparativos. Mostre o CUSTO de NÃO comprar. Termine com pergunta de fechamento.`,
  saudacao: `Capture interesse. Seja caloroso mas direto. Pergunte sobre o projeto e sinalize condições especiais.`,
  outro: `Direcione para fechamento. Cada mensagem deve ter um CTA claro.`,
};

const SYSTEM_PROMPT_CLOSING_RULES = `

=== SUA IDENTIDADE ===
Especialista em móveis planejados no mercado brasileiro. Conhece materiais (MDF, MDP, ferragens Blum/Hafele/Hettich), acabamentos, design e mercado.

=== REGRA CRÍTICA: RESPOSTAS ULTRA-CURTAS ===
🔴 MÁXIMO 2 parágrafos de 1-2 frases cada. NUNCA mais que isso.
🔴 Limite: 250 caracteres no total. Se passar, CORTE.
🔴 Use no máximo 1-2 emojis por mensagem.
🔴 Tom NATURAL e HUMANO — como um vendedor real digitando no WhatsApp.
🔴 NÃO use formatação com * ou listas. Texto corrido e direto.

=== REGRA ABSOLUTA: NUNCA ENVIE PREÇO ===
🔴 Se o cliente pedir preço, valor, orçamento ou tabela: NUNCA envie números.
🔴 SEMPRE contorne com: "Cada projeto é único, por isso preparei uma sala exclusiva pra gente conversar ao vivo!"
🔴 SEMPRE inclua o link da Deal Room quando o assunto for preço/valor.

=== ANTI-REPETIÇÃO ===
🔴 ANALISE TODO o histórico. NUNCA repita argumentos, aberturas ou estruturas já usados.
🔴 Se já disse "exclusivo", use "diferenciado". Se já disse "qualidade", use "durabilidade".
🔴 Varie COMPLETAMENTE a estrutura da frase. Se a anterior começou com pergunta, comece com afirmação.

=== ADAPTAÇÃO DE TOM ===
🔴 ANALISE o tom do cliente e ESPELHE: se é informal, seja informal. Se é formal, seja formal.
🔴 Se o cliente usa "kkk" ou emojis, responda de forma descontraída.
🔴 Se o cliente é objetivo, seja ainda MAIS objetivo.

=== REGRAS DE VENDAS ===
1. NUNCA diga "pense com calma" ou "quando estiver pronto".
2. SEMPRE termine com CTA direto.
3. Use nome do cliente.
4. Crie urgência REAL mas sutil.
5. NUNCA ENVIE PREÇO POR TEXTO — direcione para Deal Room.
6. Quando tiver link da Deal Room, INCLUA no texto.
`;

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
    const max_tokens = typeof body.max_tokens === "number" ? Math.min(body.max_tokens, 1000) : 350;
    const modo = typeof body.modo === "string" ? body.modo : "sugestao";
    const historico = Array.isArray(body.historico) ? body.historico.slice(-10) : [];
    const learning_context = typeof body.learning_context === "string" ? body.learning_context.slice(0, 3000) : "";
    const custom_arguments = typeof body.custom_arguments === "string" ? body.custom_arguments.slice(0, 3000) : "";
    let perplexity_data = typeof body.perplexity_data === "string" ? body.perplexity_data.slice(0, 2000) : "";

    // Direct messages array (DealRoom AI Assistant)
    const messages = Array.isArray(body.messages) ? body.messages : null;

    const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY");
    if (!OPENAI_API_KEY) {
      return respond({ error: "OPENAI_API_KEY não configurada" }, 500);
    }

    // DealRoom AI direct messages
    if (messages && messages.length > 0) {
      const aiRes = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: { Authorization: `Bearer ${OPENAI_API_KEY}`, "Content-Type": "application/json" },
        body: JSON.stringify({ model: "gpt-4o-mini", messages, max_tokens, temperature: 0.7 }),
      });

      if (!aiRes.ok) {
        const errText = await aiRes.text();
        console.error("OpenAI error:", aiRes.status, errText);
        if (aiRes.status === 429) return respond({ error: "Limite de requisições excedido." }, 429);
        if (aiRes.status === 402) return respond({ error: "Créditos esgotados." }, 402);
        return respond({ error: "Erro na API de IA" }, 502);
      }

      const aiData = await aiRes.json();
      return respond({ reply: aiData.choices?.[0]?.message?.content || "", tokens_usados: aiData.usage?.total_tokens || 0 });
    }

    // Intelligent Router: auto-fetch Perplexity data when relevant
    const intencao = detectIntent(mensagem_cliente);
    if (!perplexity_data && shouldUsePerplexity(intencao, mensagem_cliente)) {
      const searchQuery = mensagem_cliente
        ? `móveis planejados Brasil: ${mensagem_cliente.slice(0, 100)}`
        : "tendências móveis planejados Brasil 2024 preços mercado";
      perplexity_data = await fetchPerplexityData(searchQuery);
    }

    const intentContext = INTENT_PROMPTS[intencao] || INTENT_PROMPTS.outro;
    const closingScore = calcClosingScore(intencao, tipo_copy);

    const systemPrompt =
      (prompt_sistema ||
      `Você é um CLOSER de elite e especialista em móveis planejados no mercado brasileiro. Missão: FECHAR VENDAS com mensagens CURTAS e ASSERTIVAS.`) +
      `\n\n--- CONTEXTO DA INTENÇÃO ---\n${intentContext}` +
      SYSTEM_PROMPT_CLOSING_RULES +
      (learning_context ? `\n${learning_context}` : "") +
      (custom_arguments ? `\n\n=== ARGUMENTOS DA LOJA (USE!) ===\n${custom_arguments}` : "") +
      (perplexity_data ? `\n\n=== DADOS REAIS (PERPLEXITY) ===\n${perplexity_data}\nUse estes dados para dar credibilidade.` : "") +
      (modo === "autopilot"
        ? "\n\n--- AUTO-PILOT ---\nSeja conciso (máx 2 parágrafos). Inclua pergunta de fechamento."
        : "");

    let userPrompt = `Gere uma mensagem CURTA de ${tipo_copy} com tom ${tom}. MÁXIMO 3 parágrafos curtos. FOCO: fechamento.`;
    if (nome_cliente) userPrompt += `\nCliente: ${nome_cliente}`;
    if (valor_orcamento) userPrompt += `\nValor: R$ ${valor_orcamento}`;
    if (status_negociacao) userPrompt += `\nStatus: ${status_negociacao}`;
    if (dias_sem_resposta) userPrompt += `\n${dias_sem_resposta} dias sem resposta — URGENTE!`;
    if (mensagem_cliente) userPrompt += `\nMensagem do cliente: "${mensagem_cliente}"`;
    if (deal_room_link) userPrompt += `\nLink Deal Room: ${deal_room_link}`;

    if (historico.length > 0) {
      const previousSellerMessages = historico
        .filter((h: any) => h.remetente_tipo !== "cliente")
        .map((h: any) => (h.mensagem || "").slice(0, 200));

      userPrompt += "\n\n--- HISTÓRICO ---";
      for (const h of historico) {
        const role = h.remetente_tipo === "cliente" ? "Cliente" : "Vendedor";
        userPrompt += `\n${role}: ${(h.mensagem || "").slice(0, 200)}`;
      }

      if (previousSellerMessages.length > 0) {
        userPrompt += "\n\n⚠️ NÃO REPITA estes argumentos já usados:";
        previousSellerMessages.forEach((msg: string, i: number) => {
          userPrompt += `\n${i + 1}. "${msg.substring(0, 100)}"`;
        });
        userPrompt += "\n\n🔴 Use argumentos COMPLETAMENTE DIFERENTES. Seja CRIATIVO, CURTO e HUMANO.";
      }
    }

    const temperature = historico.length > 2 ? 0.95 : 0.8;

    const aiRes = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${OPENAI_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        max_tokens,
        temperature,
        presence_penalty: 0.6,
        frequency_penalty: 0.5,
      }),
    });

    if (!aiRes.ok) {
      const errText = await aiRes.text();
      console.error("OpenAI error:", aiRes.status, errText);
      if (aiRes.status === 429) return respond({ error: "Limite de requisições excedido." }, 429);
      if (aiRes.status === 402) return respond({ error: "Créditos esgotados." }, 402);
      return respond({ error: "Erro na API de IA" }, 502);
    }

    const aiData = await aiRes.json();
    const mensagem = aiData.choices?.[0]?.message?.content || "";
    const tokens_usados = aiData.usage?.total_tokens || 0;

    return respond({
      mensagem,
      tokens_usados,
      intencao,
      modo,
      closing_score: closingScore,
      used_perplexity: !!perplexity_data,
    });
  } catch (e) {
    console.error("vendazap-ai error:", e);
    return respond({ error: "Erro interno" }, 500);
  }
});
