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
  objecao: [/caro/i, /n[ãa]o sei/i, /vou pensar/i, /depois/i, /outro lugar/i, /concorr/i, /n[ãa]o quero/i, /desist/i, /cancel/i],
  saudacao: [/bom dia/i, /boa tarde/i, /boa noite/i, /oi/i, /ol[áa]/i, /tudo bem/i],
};

function detectIntent(message: string): string {
  if (!message) return "outro";
  const priority = ["fechamento", "orcamento", "preco", "objecao", "duvida", "saudacao"];
  for (const intent of priority) {
    const patterns = INTENT_PATTERNS[intent];
    if (patterns.some((p) => p.test(message))) return intent;
  }
  return "outro";
}

// Closing proximity score (0-100) based on intent
function calcClosingScore(intent: string, tipoCopy: string): number {
  const intentScores: Record<string, number> = {
    fechamento: 95,
    orcamento: 60,
    preco: 50,
    duvida: 40,
    objecao: 30,
    saudacao: 20,
    outro: 35,
  };
  const copyBonus: Record<string, number> = {
    fechamento: 15,
    urgencia: 10,
    objecao: 5,
    reuniao: 5,
    reativacao: -5,
    geral: 0,
  };
  const base = intentScores[intent] || 35;
  const bonus = copyBonus[tipoCopy] || 0;
  return Math.max(5, Math.min(100, base + bonus));
}

const INTENT_PROMPTS: Record<string, string> = {
  orcamento: `O cliente pediu orçamento — isso é um FORTE sinal de interesse. Responda com entusiasmo, valorize o projeto, pergunte detalhes técnicos e já sinalize que você tem condições especiais para fechamento rápido. Direcione para agendar uma apresentação ou enviar proposta completa.`,
  fechamento: `O cliente está PRONTO para fechar! NÃO hesite. Confirme os detalhes rapidamente, reforce que ele está fazendo a melhor escolha, crie senso de urgência positiva e facilite o fechamento IMEDIATAMENTE. Pergunte "Posso preparar o contrato agora?"`,
  preco: `O cliente está negociando preço — isso NÃO é rejeição, é interesse! Destaque o VALOR (não o preço): durabilidade, qualidade, garantia, personalização. Ofereça condições de pagamento flexíveis. Mostre que o investimento se paga. NUNCA reduza o preço sem trocar por algo (prazo, forma de pagamento). Sempre termine com uma proposta concreta de fechamento.`,
  duvida: `O cliente tem dúvidas — ÓTIMO, significa que está considerando! Responda com segurança e autoridade. Use cada resposta como oportunidade para mostrar diferenciais exclusivos. Termine SEMPRE direcionando para o próximo passo concreto (visita, simulação, proposta).`,
  objecao: `O cliente apresentou objeção — isso é NORMAL e contornável. NUNCA concorde com a objeção. NUNCA sugira desistência ou diga "sem problemas, quando estiver pronto". Quebre a objeção com firmeza e dados: provas sociais, comparativos, garantias, cases de sucesso. Mostre o CUSTO de NÃO comprar (perda das condições, aumento de preço, indisponibilidade). Termine com uma pergunta que leve ao fechamento.`,
  saudacao: `O cliente iniciou contato — CAPTURE o interesse imediatamente. Seja caloroso mas direto. Apresente-se, pergunte sobre o projeto e JÁ sinalize que tem condições especiais. Não perca tempo com banalidades — direcione para a necessidade do cliente.`,
  outro: `Identifique a necessidade do cliente e direcione a conversa SEMPRE para o fechamento. Cada mensagem deve ter um CTA (call-to-action) claro.`,
};

const SYSTEM_PROMPT_CLOSING_RULES = `

=== REGRAS ABSOLUTAS DE VENDAS ===
1. NUNCA sugira que o cliente "pense com calma", "não tem pressa" ou "quando estiver pronto me avise". Isso MATA vendas.
2. NUNCA aceite objeções passivamente. SEMPRE contra-argumente com dados, provas e benefícios.
3. NUNCA mencione concorrentes de forma positiva ou sugira que o cliente "compare com outros".
4. SEMPRE termine a mensagem com um CTA direto que leve ao PRÓXIMO PASSO do fechamento.
5. SEMPRE use o nome do cliente para criar conexão pessoal.
6. SEMPRE crie senso de urgência REAL (condições limitadas, prazo, disponibilidade).
7. SEMPRE mostre o CUSTO DA INAÇÃO — o que o cliente PERDE ao não fechar agora.
8. Use emojis com moderação (máx 2-3 por mensagem) para humanizar.
9. Mensagens devem ser concisas e impactantes — máximo 4 parágrafos.
10. Se o cliente disse "vou pensar", responda: "Entendo que é importante! Justamente por isso, que tal resolvermos agora as dúvidas que ficaram? Assim você decide com total segurança."

=== ESTRUTURA IDEAL DA RESPOSTA ===
- Linha 1: Conexão pessoal (nome + empatia ativa, NÃO passiva)
- Linha 2-3: Contra-argumento forte com dados/provas
- Linha 4: Benefício exclusivo ou condição especial
- Linha 5: CTA direto para fechamento
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
    const max_tokens = typeof body.max_tokens === "number" ? Math.min(body.max_tokens, 2000) : 500;
    const modo = typeof body.modo === "string" ? body.modo : "sugestao";
    const historico = Array.isArray(body.historico) ? body.historico.slice(-10) : [];
    const learning_context = typeof body.learning_context === "string" ? body.learning_context.slice(0, 3000) : "";

    // Also support direct messages array (used by DealRoom AI Assistant)
    const messages = Array.isArray(body.messages) ? body.messages : null;

    const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY");
    if (!OPENAI_API_KEY) {
      return respond({ error: "OPENAI_API_KEY não configurada" }, 500);
    }

    // If direct messages array provided (DealRoom AI), use it directly
    if (messages && messages.length > 0) {
      const aiRes = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${OPENAI_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "gpt-4o-mini",
          messages,
          max_tokens: max_tokens,
          temperature: 0.7,
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
      const reply = aiData.choices?.[0]?.message?.content || "";
      return respond({ reply, tokens_usados: aiData.usage?.total_tokens || 0 });
    }

    // Standard VendaZap flow with intent detection
    const intencao = detectIntent(mensagem_cliente);
    const intentContext = INTENT_PROMPTS[intencao] || INTENT_PROMPTS.outro;
    const closingScore = calcClosingScore(intencao, tipo_copy);

    const systemPrompt =
      (prompt_sistema ||
      `Você é um CLOSER de elite especializado em móveis planejados. 
Sua missão é FECHAR VENDAS. Cada mensagem deve aproximar o cliente do SIM.
Seja profissional, confiante e assertivo. Nunca seja passivo.`) +
      `\n\n--- CONTEXTO DA INTENÇÃO ---\n${intentContext}` +
      SYSTEM_PROMPT_CLOSING_RULES +
      (learning_context ? `\n${learning_context}` : "") +
      (modo === "autopilot"
        ? "\n\n--- MODO AUTO-PILOT ---\nVocê está respondendo AUTOMATICAMENTE. Seja conciso (máx 3 parágrafos). Inclua uma pergunta de fechamento. NÃO use saudações formais excessivas."
        : "");

    let userPrompt = `Gere uma mensagem de ${tipo_copy} com tom ${tom}. FOCO: levar ao FECHAMENTO.`;
    if (nome_cliente) userPrompt += `\nNome do cliente: ${nome_cliente}`;
    if (valor_orcamento) userPrompt += `\nValor do orçamento: R$ ${valor_orcamento}`;
    if (status_negociacao) userPrompt += `\nStatus da negociação: ${status_negociacao}`;
    if (dias_sem_resposta) userPrompt += `\nDias sem resposta: ${dias_sem_resposta} — URGENTE, reative com firmeza!`;
    if (mensagem_cliente) userPrompt += `\nMensagem do cliente: "${mensagem_cliente}"`;
    if (deal_room_link) userPrompt += `\nLink da sala de negociação: ${deal_room_link}`;

    if (historico.length > 0) {
      userPrompt += "\n\n--- HISTÓRICO COMPLETO DA NEGOCIAÇÃO (USE COMO CONTEXTO!) ---";
      userPrompt += "\nIMPORTANTE: O cliente já interagiu antes. Considere TODAS as mensagens anteriores. Se o cliente está tentando fugir ou repetindo objeções, seja MAIS FIRME e use argumentos DIFERENTES dos já usados. Nunca repita a mesma abordagem.";
      for (const h of historico) {
        const role = h.remetente_tipo === "cliente" ? "Cliente" : "Vendedor (você)";
        userPrompt += `\n${role}: ${(h.mensagem || "").slice(0, 300)}`;
      }
      userPrompt += "\n--- FIM DO HISTÓRICO ---";
      userPrompt += "\nAgora gere uma resposta que EVOLUA a argumentação, usando dados e ângulos NOVOS que ainda não foram usados. Se o cliente repetiu uma objeção, quebre-a de forma DIFERENTE e mais contundente.";
    }

    const aiRes = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${OPENAI_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
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
      console.error("OpenAI error:", aiRes.status, errText);
      if (aiRes.status === 429) return respond({ error: "Limite de requisições excedido. Tente novamente em alguns segundos." }, 429);
      if (aiRes.status === 402) return respond({ error: "Créditos de IA esgotados." }, 402);
      return respond({ error: "Erro na API de IA" }, 502);
    }

    const aiData = await aiRes.json();
    const mensagem = aiData.choices?.[0]?.message?.content || "";
    const tokens_usados = aiData.usage?.total_tokens || 0;

    return respond({ mensagem, tokens_usados, intencao, modo, closing_score: closingScore });
  } catch (e) {
    console.error("vendazap-ai error:", e);
    return respond({ error: "Erro interno" }, 500);
  }
});
