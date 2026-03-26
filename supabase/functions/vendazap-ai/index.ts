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

// Closing proximity score (0-100) based on intent
function calcClosingScore(intent: string, tipoCopy: string): number {
  const intentScores: Record<string, number> = {
    fechamento: 95,
    enviar_preco: 55,
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
  enviar_preco: `O cliente pediu para enviar preço/orçamento por mensagem, WhatsApp ou e-mail. NUNCA envie valores por mensagem de texto. Isso MATA a venda porque o cliente compara friamente sem contexto. 
CONTORNE com elegância e firmeza:
- Explique que o projeto dele é PERSONALIZADO e merece uma apresentação completa
- Ofereça a DEAL ROOM: uma sala de reunião online exclusiva onde o cliente pode ver o projeto completo em tempo real, pedir ajustes ao vivo, negociar condições especiais e fechar a venda com envio imediato do contrato — tudo no conforto da casa dele
- Posicione como um BENEFÍCIO para o cliente: "Preparei algo muito melhor do que um simples PDF de preço!"
- Se o cliente insistir, ofereça como alternativa agendar uma reunião presencial ou por vídeo
- NUNCA ceda e envie valores por texto. A experiência da Deal Room ou reunião SEMPRE converte mais
- Exemplo de CTA: "Que tal agendarmos uma apresentação exclusiva pela nossa Deal Room? Você vai poder ver tudo em tempo real, do conforto da sua casa, e já sair com o contrato fechado!"`,
  duvida: `O cliente tem dúvidas — ÓTIMO, significa que está considerando! Responda com segurança e autoridade. Use cada resposta como oportunidade para mostrar diferenciais exclusivos. Termine SEMPRE direcionando para o próximo passo concreto (visita, simulação, proposta).`,
  objecao: `O cliente apresentou objeção — isso é NORMAL e contornável. NUNCA concorde com a objeção. NUNCA sugira desistência ou diga "sem problemas, quando estiver pronto". Quebre a objeção com firmeza e dados: provas sociais, comparativos, garantias, cases de sucesso. Mostre o CUSTO de NÃO comprar (perda das condições, aumento de preço, indisponibilidade). Termine com uma pergunta que leve ao fechamento.`,
  saudacao: `O cliente iniciou contato — CAPTURE o interesse imediatamente. Seja caloroso mas direto. Apresente-se, pergunte sobre o projeto e JÁ sinalize que tem condições especiais. Não perca tempo com banalidades — direcione para a necessidade do cliente.`,
  outro: `Identifique a necessidade do cliente e direcione a conversa SEMPRE para o fechamento. Cada mensagem deve ter um CTA (call-to-action) claro.`,
};

const SYSTEM_PROMPT_CLOSING_RULES = `

=== SUA IDENTIDADE ===
Você é um ESPECIALISTA em móveis planejados e sob medida no mercado brasileiro. Você tem profundo conhecimento sobre:
- Materiais: MDF, MDP, compensado naval, fórmica, laminato, vidro temperado, espelhos, LED, puxadores, ferragens (Blum, Hafele, Hettich)
- Acabamentos: pintura automotiva, lacado, texturizado, amadeirado, ultramate, supergloss
- Ambientes: cozinhas planejadas, closets, home offices, dormitórios, lavanderias, banheiros, salas de estar, home theaters
- Mercado brasileiro: tendências de design, feiras (FORMÓVEL, High Design Expo), custos de matéria-prima, concorrência, perfil do consumidor classe A/B/C
- Processo produtivo: projeto 3D, corte CNC, montagem, assistência técnica, prazos de entrega
- Valores agregados: ergonomia, funcionalidade, aproveitamento de espaço, durabilidade (10-15 anos vs móveis prontos 2-3 anos)

Use esse conhecimento ATIVAMENTE em cada resposta. Cite dados reais, tendências, comparativos técnicos específicos.

=== REGRA ANTI-REPETIÇÃO (CRÍTICO!) ===
ANALISE TODO O HISTÓRICO DA CONVERSA ANTES DE RESPONDER. 
- NUNCA repita um argumento que já foi usado em mensagens anteriores suas.
- NUNCA reutilize frases, exemplos ou dados que já apareceram no histórico.
- Se você já mencionou "valorização do imóvel", use outro ângulo: economia a longo prazo, qualidade de vida, funcionalidade, design exclusivo, prazo de entrega, garantia estendida, etc.
- Se já falou sobre durabilidade, mude para personalização, ou ergonomia, ou tendências de design, ou custo-benefício comparado com móveis prontos.
- Mantenha um BANCO MENTAL de argumentos já usados e VARIE entre pelo menos 15 ângulos diferentes:
  1. Valorização do imóvel
  2. Durabilidade vs móveis prontos (vida útil 10-15 anos vs 2-3)
  3. Personalização total (cores, medidas, acabamentos)
  4. Aproveitamento de 100% do espaço
  5. Ergonomia e funcionalidade (acessórios inteligentes, gavetas organizadoras)
  6. Design exclusivo (seu projeto é ÚNICO, nenhum vizinho terá igual)
  7. Economia a longo prazo (não precisa trocar em 3 anos como móvel pronto)
  8. Qualidade dos materiais e ferragens importadas
  9. Garantia estendida e assistência técnica
  10. Tendências atuais de design (minimalismo, integração de ambientes, cores da Suvinil/Coral do ano)
  11. Praticidade no dia-a-dia (organização, limpeza facilitada)
  12. Impacto na qualidade de vida da família
  13. Processo produtivo (projeto 3D, CNC de precisão, montagem especializada)
  14. Cases de clientes satisfeitos e transformações reais
  15. Comparativo de custo: preço/m² do planejado vs pronto de qualidade similar
  16. Sustentabilidade (madeiras certificadas, MDF com selo FSC)
  17. Exclusividade e status (projeto assinado, acabamentos premium)
  18. Flexibilidade de pagamento sem comprometer qualidade

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
11. NUNCA ENVIE PREÇO, VALOR OU ORÇAMENTO POR MENSAGEM DE TEXTO, WHATSAPP OU EMAIL. Se o cliente pedir, SEMPRE contorne:
    - Explique que o projeto é personalizado e merece uma apresentação exclusiva
    - Ofereça a DEAL ROOM (reunião online em tempo real onde pode ver o projeto, pedir ajustes, negociar e fechar com contrato imediato)
    - Ofereça agendamento de reunião presencial ou por vídeo como alternativa
    - Posicione como VANTAGEM para o cliente: experiência premium, não um simples PDF
    - NUNCA ceda mesmo se o cliente insistir. A experiência da Deal Room ou reunião SEMPRE converte mais.
12. SEJA HUMANO e NATURAL. Varie o vocabulário, o tom, a estrutura das frases. Não use templates. Cada mensagem deve parecer escrita por uma pessoa real, não por um robô.
13. VARIE a abertura das mensagens. Não comece sempre com "Oi [nome]!" ou "[nome], que bom!". Use aberturas diferentes: perguntas diretas, dados impactantes, provocações inteligentes, histórias rápidas de clientes.

=== ESTRUTURA IDEAL DA RESPOSTA (varie a ordem!) ===
- Conexão pessoal (nome + empatia ativa, NÃO passiva)
- Contra-argumento forte com dados/provas INÉDITOS nesta conversa
- Benefício exclusivo ou condição especial
- CTA direto para fechamento
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
      `Você é um CLOSER de elite e ESPECIALISTA em móveis planejados e sob medida no mercado brasileiro. 
Sua missão é FECHAR VENDAS. Cada mensagem deve aproximar o cliente do SIM.
Seja profissional, confiante e assertivo. Nunca seja passivo.
Você tem conhecimento profundo sobre materiais (MDF, MDP, ferragens Blum/Hafele/Hettich), acabamentos, design de interiores e todo o mercado brasileiro de móveis planejados.`) +
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
      // Extract arguments already used to prevent repetition
      const previousSellerMessages = historico
        .filter((h: any) => h.remetente_tipo !== "cliente")
        .map((h: any) => (h.mensagem || "").slice(0, 300));
      
      userPrompt += "\n\n--- HISTÓRICO COMPLETO DA NEGOCIAÇÃO ---";
      for (const h of historico) {
        const role = h.remetente_tipo === "cliente" ? "Cliente" : "Vendedor (você)";
        userPrompt += `\n${role}: ${(h.mensagem || "").slice(0, 300)}`;
      }
      userPrompt += "\n--- FIM DO HISTÓRICO ---";
      
      if (previousSellerMessages.length > 0) {
        userPrompt += "\n\n⚠️ ARGUMENTOS JÁ USADOS (NÃO REPITA NENHUM DELES!):";
        previousSellerMessages.forEach((msg: string, i: number) => {
          userPrompt += `\n${i + 1}. "${msg.substring(0, 150)}..."`;
        });
        userPrompt += "\n\n🔴 REGRA OBRIGATÓRIA: Sua resposta DEVE usar argumentos, dados e abordagens COMPLETAMENTE DIFERENTES dos listados acima. Use seu conhecimento de especialista em móveis planejados para trazer ângulos NOVOS: materiais, ferragens, tendências de design, ergonomia, sustentabilidade, cases reais, comparativos técnicos, dados do mercado brasileiro. Seja CRIATIVO e HUMANO — não use templates.";
      }
    }

    // Use higher temperature for more creative/varied responses
    const temperature = historico.length > 2 ? 0.95 : 0.8;

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
