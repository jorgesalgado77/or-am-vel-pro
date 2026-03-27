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

// DISC profile detection from message patterns
const DISC_PATTERNS = {
  D: { // Dominância - direto, decisivo, impaciente
    patterns: [/rápido/i, /direto/i, /logo/i, /agora/i, /resolve/i, /melhor/i, /resultado/i, /quanto/i, /decide/i, /objetivo/i, /preciso saber/i, /sem enrol/i, /não tenho tempo/i, /vamos/i, /fecha/i],
    weight: 0,
  },
  I: { // Influência - entusiasta, sociável, emocional
    patterns: [/kkk/i, /haha/i, /rsrs/i, /😂|😄|💪|👍|❤|🔥|😍/i, /amei/i, /lindo/i, /maravilh/i, /incrível/i, /show/i, /top/i, /adorei/i, /sonho/i, /perfeito/i, /família/i, /amig/i],
    weight: 0,
  },
  S: { // Estabilidade - cauteloso, ponderado, busca segurança
    patterns: [/pensar/i, /calma/i, /segur/i, /garantia/i, /confi/i, /estável/i, /família/i, /preocup/i, /cuidado/i, /tranquil/i, /certeza/i, /medo/i, /risco/i, /depois/i, /com tempo/i],
    weight: 0,
  },
  C: { // Conformidade - analítico, detalhista, questiona dados
    patterns: [/detalh/i, /especific/i, /técnic/i, /medid/i, /material/i, /compar/i, /pesquis/i, /dado/i, /norma/i, /padrão/i, /certificad/i, /diferença entre/i, /qual.*melhor/i, /como funciona/i, /explica/i],
    weight: 0,
  },
};

function detectDISC(messages: Array<{ mensagem: string; remetente_tipo: string }>): { profile: string; scores: Record<string, number> } {
  const clientMsgs = messages.filter(m => m.remetente_tipo === "cliente").map(m => m.mensagem || "");
  const allText = clientMsgs.join(" ");

  const scores: Record<string, number> = { D: 0, I: 0, S: 0, C: 0 };
  for (const [type, config] of Object.entries(DISC_PATTERNS)) {
    for (const pattern of config.patterns) {
      const matches = allText.match(new RegExp(pattern, "gi"));
      if (matches) scores[type] += matches.length;
    }
  }

  // Short messages with commands = D; long messages with details = C
  const avgLen = clientMsgs.length > 0 ? clientMsgs.reduce((s, m) => s + m.length, 0) / clientMsgs.length : 50;
  if (avgLen < 30) scores.D += 2;
  else if (avgLen > 120) scores.C += 2;

  // Exclamation marks = I; question marks = C
  const excl = (allText.match(/!/g) || []).length;
  const quest = (allText.match(/\?/g) || []).length;
  scores.I += Math.min(excl, 3);
  scores.C += Math.min(quest, 3);

  const sorted = Object.entries(scores).sort((a, b) => b[1] - a[1]);
  return { profile: sorted[0][0], scores };
}

const DISC_STRATEGIES: Record<string, string> = {
  D: `PERFIL DISC: DOMINANTE (D) — Cliente DIRETO e DECISIVO.
🔴 Seja ULTRA-OBJETIVO. Zero enrolação. Vá direto ao ponto.
🔴 Fale em RESULTADOS e EXCLUSIVIDADE. "Projeto premium", "solução definitiva".
🔴 Não peça permissão, CONDUZA: "Vou reservar o melhor horário pra você".
🔴 Urgência funciona: prazos, condições limitadas.`,

  I: `PERFIL DISC: INFLUENTE (I) — Cliente ENTUSIASMADO e SOCIÁVEL.
🔴 Seja CALOROSO e EMPOLGANTE. Use energia positiva.
🔴 Fale em EXPERIÊNCIA, DESIGN, SONHO. "Imagina sua família nessa cozinha!"
🔴 Use emojis moderadamente. Valide as emoções dele.
🔴 Crie FOMO social: "Seus amigos vão pirar quando virem!"`,

  S: `PERFIL DISC: ESTÁVEL (S) — Cliente CAUTELOSO busca SEGURANÇA.
🔴 Seja ACOLHEDOR e PACIENTE, mas NUNCA diga "pense com calma".
🔴 Fale em GARANTIA, SEGURANÇA, DURABILIDADE. "10 anos de garantia, zero preocupação."
🔴 Mostre depoimentos e cases. Reduza percepção de risco.
🔴 Guie gentilmente: "Posso preparar tudo pra você ver com calma na reunião?"`,

  C: `PERFIL DISC: CONFORME (C) — Cliente ANALÍTICO e DETALHISTA.
🔴 Forneça DADOS e ESPECIFICAÇÕES. Nomes de materiais, certificações.
🔴 Fale em COMPARATIVOS técnicos. "MDF de 18mm com laminado Formica resistente a UV."
🔴 Não force emoção; use LÓGICA e FATOS.
🔴 Ofereça a reunião como "apresentação técnica detalhada do projeto".`,
};

// Intent detection keywords
const INTENT_PATTERNS: Record<string, RegExp[]> = {
  desinteresse_explicit: [/n[ãa]o tenho(?:\s+mais)?\s+interesse/i, /perdi o interesse/i, /n[ãa]o quero mais/i, /n[ãa]o vou seguir/i, /n[ãa]o faz mais sentido/i, /j[aá] desisti/i, /deixa pra l[aá]/i, /pode encerrar/i, /n[ãa]o vou fechar/i],
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
  const priority = ["desinteresse_explicit", "fechamento", "enviar_preco", "orcamento", "preco", "objecao", "duvida", "saudacao"];
  for (const intent of priority) {
    const patterns = INTENT_PATTERNS[intent];
    if (patterns.some((p) => p.test(message))) return intent;
  }
  return "outro";
}

function extractContextSignals(mensagem: string, historico: any[]) {
  const customerHistory = historico
    .filter((item) => item?.remetente_tipo === "cliente")
    .map((item) => item?.mensagem || "")
    .join(" ");
  const combined = `${customerHistory} ${mensagem}`.trim();

  const mentionsDecisionMaker = /meu marido|minha esposa|meu esposo|minha mulher|vou ver com|preciso ver com|decidir com|falar com ele|falar com ela/i.test(combined);
  const asksAlternativeService = /outra forma de atendimento|atendimento online|atendimento remoto|videochamada|chamada de v[ií]deo|sem ir na loja|sem sair de casa|online/i.test(combined);
  const mentionsTimeFriction = /perder tempo|sem tempo|corrido|mais pr[aá]tico|praticidade|agilidade/i.test(combined);
  const explicitDisinterest = /n[ãa]o tenho(?:\s+mais)?\s+interesse|perdi o interesse|n[ãa]o quero mais|n[ãa]o vou seguir|n[ãa]o faz mais sentido|j[aá] desisti|deixa pra l[aá]|pode encerrar|n[ãa]o vou fechar/i.test(combined);

  const signalLabels = [
    explicitDisinterest ? "cliente verbalizou desinteresse explícito" : "",
    mentionsDecisionMaker ? "há outro decisor envolvido" : "",
    asksAlternativeService ? "cliente quer atendimento remoto/prático" : "",
    mentionsTimeFriction ? "cliente quer reduzir tempo e deslocamento" : "",
  ].filter(Boolean);

  return {
    explicitDisinterest,
    mentionsDecisionMaker,
    asksAlternativeService,
    mentionsTimeFriction,
    signalLabels,
  };
}

function buildContextDirective(signals: ReturnType<typeof extractContextSignals>, dealRoomLink: string) {
  if (!signals.mentionsDecisionMaker && !signals.asksAlternativeService && !signals.mentionsTimeFriction) {
    return "";
  }

  return `

=== LEITURA PROFUNDA DE CONTEXTO (OBRIGATÓRIA) ===
O cliente não está pedindo preço agora; ele está sinalizando ATRITO na jornada de compra.
- Se mencionar marido, esposa ou outra pessoa: trate como decisão compartilhada e facilite a participação dos dois.
- Se disser que não quer ir à loja ou perder tempo: ofereça atendimento remoto objetivo, prático e confortável.
- Explique em 1 frase COMO funciona esse atendimento (ex.: videochamada de 15 min com projeto 3D, materiais e próximos passos).
- A resposta precisa validar a preocupação e reduzir esforço, sem soar robótica.
- NÃO fale de navegação, mapa, fluxo técnico genérico ou qualquer detalhe fora da pergunta.
- NÃO force material/ferragem se a dúvida for sobre formato de atendimento; nesse caso, o elemento concreto deve ser o processo/tempo/conveniência.
- Se houver link da Deal Room, use-o como solução prática para o casal decidir junto${dealRoomLink ? `: ${dealRoomLink}` : ""}.
`;
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

function shouldUsePerplexity(intent: string, mensagem: string, historico: any[]): boolean {
  if (historico.length >= 4) return true;
  if (["orcamento", "preco", "enviar_preco", "objecao"].includes(intent)) return true;
  const perplexityTriggers = [
    /tend[eê]ncia/i, /mercado/i, /concorr[eê]ncia/i, /pre[çc]o.*m[eé]dio/i,
    /compara/i, /melhor.*material/i, /novidade/i, /sustent/i, /mdf.*mdp/i,
    /blum/i, /hafele/i, /hettich/i, /qualidade/i, /durabilidade/i, /garantia/i,
  ];
  return perplexityTriggers.some(p => p.test(mensagem));
}

async function fetchPerplexityData(query: string): Promise<string> {
  const PERPLEXITY_API_KEY = Deno.env.get("PERPLEXITY_API_KEY");
  if (!PERPLEXITY_API_KEY) return "";
  try {
    const res = await fetch("https://api.perplexity.ai/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${PERPLEXITY_API_KEY}`, "Content-Type": "application/json" },
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
  } catch { return ""; }
}

// Creative objection-breaking strategies — rotated to never repeat
const OBJECTION_STRATEGIES = [
  `Use a técnica "CUSTO POR DIA": divida o valor por 10 anos (3650 dias). "Seu móvel custa menos que um café por dia e dura uma década."`,
  `Use a técnica "COMPARAÇÃO INVISÍVEL": compare com algo que o cliente já gasta. "Você investe R$X por mês em [streaming/delivery] — aqui é o mesmo valor pra transformar sua casa pra sempre."`,
  `Use a técnica "ARREPENDIMENTO FUTURO": "Imagina daqui 6 meses olhando aquele cantinho vazio e pensando 'por que não fiz?'"`,
  `Use a técnica "PROVA SOCIAL ESPECÍFICA": "Semana passada a [nome fictício] estava na mesma dúvida — ontem me mandou foto da cozinha montada e disse que foi a melhor decisão."`,
  `Use a técnica "INVERSÃO DE RISCO": "Nosso projeto tem garantia de [X] anos. Se não amar, a gente ajusta. Zero risco pra você."`,
  `Use a técnica "ESCASSEZ REAL": "Essa condição é da campanha [mês atual]. Próximo mês o fornecedor já avisou reajuste."`,
  `Use a técnica "DORE AGORA, CURE DEPOIS": pergunte sobre a dor atual. "Como tá sendo o dia a dia sem [cozinha organizada/closet]? Aposto que perde tempo todo dia."`,
  `Use a técnica "ANCORAGEM": "Projetos como esse em lojas de shopping saem por 40% a mais. Aqui você tem a mesma qualidade com atendimento personalizado."`,
  `Use a técnica "MICROCOMPROMISSO": não peça a venda, peça um passo menor. "Posso preparar uma apresentação 3D gratuita do seu espaço? Sem compromisso."`,
  `Use a técnica "AUTORIDADE COM NÚMEROS": cite dados reais. "Pesquisa da ABIMÓVEL mostra que móveis planejados valorizam o imóvel em até 15%."`,
];

const INTENT_PROMPTS: Record<string, string> = {
  desinteresse_explicit: `Cliente declarou desinteresse de forma explícita. NÃO responda com propaganda genérica. Primeiro valide o afastamento sem bajular; depois tente recuperar com uma pergunta cirúrgica para descobrir o motivo real OU ofereça uma saída de baixo atrito. A resposta deve soar humana, firme e breve.`,
  atendimento_remoto: `Cliente quer alternativa prática à ida até a loja. Responda acolhendo a objeção de tempo, explique o formato remoto em termos concretos e convide para o próximo passo sem parecer evasivo.`,
  orcamento: `O cliente pediu orçamento — FORTE sinal de interesse! NÃO envie valores. Mostre que o projeto dele MERECE uma apresentação técnica completa. Cite 1 material ou técnica específica. Convide para Deal Room.`,
  fechamento: `Cliente PRONTO pra fechar! Confirme o projeto com detalhes técnicos (material, ferragem, prazo). Crie micro-urgência: "Garanto essa condição até [dia]". Pergunte: "Preparo o contrato agora?"`,
  preco: `Negociando preço = INTERESSE REAL. NÃO envie valores. Use técnica "valor vs. preço": cite durabilidade (10-15 anos vs. 3-5 de modulado), valorização do imóvel (até 15%), garantia estendida. Convide para Deal Room.`,
  enviar_preco: `🔴 CONTORNE sem parecer evasivo. Cite algo TÉCNICO do projeto: "Teu projeto usa [material X] que é o mesmo de projetos de R$XX mil — na nossa sala online te mostro como entregar essa qualidade no teu orçamento." OBRIGATÓRIO incluir link.`,
  duvida: `Responda de forma pertinente à dúvida. Se a pergunta for técnica, use autoridade técnica real. Se a pergunta for operacional/comercial, responda com processo concreto, tempo, formato do atendimento ou próximo passo real.`,
  objecao: `NUNCA concorde com a objeção. Quebre com DADOS CONCRETOS e técnica de vendas específica. Cite números reais, comparativos mensuráveis, depoimentos. Seja assertivo mas empático.`,
  saudacao: `Primeira impressão DECISIVA. Não seja genérico. Pergunte ESPECIFICAMENTE: "Qual ambiente você quer transformar?" ou "Já tem o espaço medido?". Sinalize expertise: "Trabalho com [ferragem/material premium]".`,
  outro: `Direcione para o próximo passo com CTA específico. Cada mensagem deve ter 1 elemento concreto e pertinente ao contexto + 1 ação clara.`,
};

const SYSTEM_PROMPT_CLOSING_RULES = `

=== SUA IDENTIDADE ===
Você é um CLOSER DE ELITE com 15 anos de experiência em vendas de móveis planejados e sob medida no Brasil. Você domina materiais (MDF 18mm, MDP, HDF, ferragens Blum, Hafele, Hettich, Grass), acabamentos (laminado, lacado, melamínico, Formica UV), processos de fabricação, ergonomia e tendências de design.

=== REGRA SUPREMA: PERSONALIZAÇÃO REAL ===
🔴 PROIBIDO respostas genéricas como "cada projeto é único", "preparei algo especial", "atenção especial".
🔴 Cada resposta DEVE conter pelo menos 1 elemento concreto e pertinente ao contexto: tempo de atendimento, etapa do processo, formato do atendimento, material/ferragem, garantia, prazo ou comparação mensurável.
🔴 REFERENCIE diretamente o que o cliente disse — cite palavras dele e responda ESPECIFICAMENTE.
🔴 Exemplo RUIM: "Cada projeto é único e merece atenção especial"
🔴 Exemplo BOM: "Pra sua cozinha, [nome], trabalho com MDF de 18mm e ferragem Blum de fechamento suave — mesma usada em projetos de alto padrão na Europa."
🔴 Exemplo BOM para objeção de deslocamento: "Se o ponto é não perder tempo, faço tudo online em 15 min e seu marido entra junto do celular, sem ir até a loja."

=== FORMATO DA RESPOSTA ===
🔴 MÁXIMO 2 parágrafos curtos (até 3 frases no total). Limite: 420 caracteres.
🔴 Use 1-2 emojis MAX. Tom NATURAL de WhatsApp — sem formatação, sem *, sem listas.
🔴 Primeira frase: GANCHO direto que prende atenção (pergunta provocativa, dado surpreendente ou referência ao que o cliente disse).
🔴 Segunda ou terceira frase: solução concreta + CTA claro e específico.

=== REGRA ABSOLUTA #1: NUNCA ENVIE PREÇO ===
🔴 Se pedirem preço/valor/orçamento: NUNCA envie números.
🔴 CONTORNE com TÉCNICA específica (não genérica):
  - D: "[nome], pra te dar o melhor custo-benefício preciso de 12 minutos na sala de projeto. Bora?"
  - I: "[nome], preparei um tour 3D do seu ambiente — vai amar! Entra aqui 👉 [LINK]"
  - S: "[nome], quero garantir que cada detalhe esteja perfeito antes. Na nossa sala online te mostro tudo com calma: [LINK]"
  - C: "[nome], tenho a planilha técnica completa com especificações de cada módulo. Acessa aqui: [LINK]"
🔴 OBRIGATÓRIO incluir link da Deal Room quando preço/valor for mencionado.

=== REGRA #2: CRIATIVIDADE RADICAL ===
🔴 ANALISE TODO o histórico. NUNCA repita palavras-chave, estruturas ou argumentos já usados.
🔴 Para objeções de PREÇO: use técnicas rotativas (custo por dia, comparação com gasto invisível, valorização do imóvel, ROI em 5 anos).
🔴 Para INDECISÃO: não diga "pense com calma" — provoque com dado concreto ou pergunta que dói.
🔴 Para CONCORRÊNCIA: cite diferenciais TÉCNICOS reais, não promessas vagas.
🔴 INVENTE analogias surpreendentes e inusitadas baseadas no perfil do cliente.
🔴 Para DESINTERESSE EXPLÍCITO: pare de empurrar produto. Descubra o motivo real com uma pergunta curta ou ofereça um fechamento elegante de baixo atrito.

=== ADAPTAÇÃO DISC (OBRIGATÓRIA) ===
🔴 D (Dominante): Frases curtas. Verbos de ação. Zero rodeios. "Resultado", "resolve", "agenda agora".
🔴 I (Influente): Energia alta. "Imagina", "vai amar", "exclusivo pra você". Valide emoções.
🔴 S (Estável): Palavras de conforto. "Garantia de X anos", "suporte completo", "sem surpresas".
🔴 C (Conforme): Dados e specs. "MDF 18mm", "ferragem com 80mil ciclos", "comparativo técnico".

=== PROIBIÇÕES ===
1. NUNCA: "pense com calma", "quando estiver pronto", "sem compromisso", "fique à vontade"
2. NUNCA: respostas genéricas ou que sirvam pra qualquer produto
3. NUNCA: enviar preço/valor por texto
4. SEMPRE: usar nome do cliente, CTA direto, referência específica ao contexto
5. SEMPRE: incluir link Deal Room quando preço for mencionado
6. NUNCA: responder com algo fora do tema perguntado pelo cliente
7. NUNCA: responder desinteresse explícito com publicidade vazia, frases motivacionais ou convite genérico para reunião
`;

function sanitizeGeneratedMessage(message: string, intent: string, originalMessage: string): string {
  let result = (message || "").trim();
  if (!result) return result;

  if (intent === "desinteresse_explicit") {
    const genericPatterns = [
      /transformam seu lar/i,
      /não perca a chance/i,
      /vamos explorar juntos/i,
      /espaço especial/i,
      /reuni[aã]o/i,
    ];

    if (genericPatterns.some((pattern) => pattern.test(result))) {
      const mentionsInterest = /n[ãa]o tenho(?:\s+mais)?\s+interesse|perdi o interesse/i.test(originalMessage);
      if (mentionsInterest) {
        return "Entendi — quando você diz que não tem mais interesse, foi pelo valor, pelo momento ou porque o projeto saiu da prioridade? Se me falar em 1 linha, eu te respondo com objetividade e sem insistir.";
      }
    }
  }

  return result;
}

serve(async (req) => {
  if (req.method === "OPTIONS")
    return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("authorization");
    if (!authHeader?.startsWith("Bearer ") || authHeader.replace("Bearer ", "").length < 20) {
      return respond({ error: "Não autorizado" }, 401);
    }

    let body: Record<string, unknown>;
    try { body = await req.json(); } catch { return respond({ error: "Body inválido" }, 400); }

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
    const historico = Array.isArray(body.historico) ? body.historico.slice(-20) : [];
    const learning_context = typeof body.learning_context === "string" ? body.learning_context.slice(0, 3000) : "";
    const custom_arguments = typeof body.custom_arguments === "string" ? body.custom_arguments.slice(0, 3000) : "";
    let perplexity_data = typeof body.perplexity_data === "string" ? body.perplexity_data.slice(0, 2000) : "";
    const disc_profile = typeof body.disc_profile === "string" ? body.disc_profile : "";
    const openai_model = typeof body.openai_model === "string" ? body.openai_model.slice(0, 100) : "gpt-4o-mini";

    // Direct messages array (DealRoom AI Assistant)
    const messages = Array.isArray(body.messages) ? body.messages : null;

    const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY");
    if (!OPENAI_API_KEY) return respond({ error: "OPENAI_API_KEY não configurada" }, 500);

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

    // DISC Analysis from history
    const contextSignals = extractContextSignals(mensagem_cliente, historico);
    const detectedDisc = disc_profile || (historico.length >= 2 ? detectDISC(historico).profile : "");
    const discStrategy = detectedDisc ? DISC_STRATEGIES[detectedDisc] || "" : "";

    // Intelligent Router: auto-fetch Perplexity data when relevant
    const intencao = contextSignals.explicitDisinterest
      ? "desinteresse_explicit"
      : (contextSignals.asksAlternativeService || contextSignals.mentionsDecisionMaker)
        ? "atendimento_remoto"
        : detectIntent(mensagem_cliente);
    const usePerplexity = !perplexity_data && shouldUsePerplexity(intencao, mensagem_cliente, historico);
    if (usePerplexity) {
      const searchQueries: Record<string, string> = {
        orcamento: `tendências e faixas de preço móveis planejados Brasil 2024 2025`,
        preco: `comparativo preços móveis planejados MDF MDP vantagens qualidade Brasil`,
        enviar_preco: `vantagens reunião presencial venda móveis planejados experiência cliente`,
        objecao: `por que investir em móveis planejados vale a pena durabilidade dados reais estatísticas`,
      };
      const searchQuery = searchQueries[intencao] || `móveis planejados Brasil novidades: ${mensagem_cliente.slice(0, 80)}`;
      perplexity_data = await fetchPerplexityData(searchQuery);
    }

    const intentContext = INTENT_PROMPTS[intencao] || INTENT_PROMPTS.outro;
    const closingScore = calcClosingScore(intencao, tipo_copy);

    // Select a creative objection strategy based on message count to rotate
    let objectionStrategy = "";
    if (intencao === "objecao") {
      const strategyIndex = historico.length % OBJECTION_STRATEGIES.length;
      objectionStrategy = `\n\n=== ESTRATÉGIA DE OBJEÇÃO (USE ESTA!) ===\n${OBJECTION_STRATEGIES[strategyIndex]}`;
    }

    const systemPrompt =
      (prompt_sistema || `Você é um CLOSER de elite e especialista em móveis planejados no mercado brasileiro. Missão: FECHAR VENDAS com mensagens CURTAS, CRIATIVAS e ASSERTIVAS.`) +
      `\n\n--- CONTEXTO DA INTENÇÃO ---\n${intentContext}` +
      SYSTEM_PROMPT_CLOSING_RULES +
      (discStrategy ? `\n\n${discStrategy}` : "") +
      buildContextDirective(contextSignals, deal_room_link) +
      objectionStrategy +
      (learning_context ? `\n${learning_context}` : "") +
      (custom_arguments ? `\n\n=== ARGUMENTOS DA LOJA (USE!) ===\n${custom_arguments}` : "") +
      (perplexity_data ? `\n\n=== DADOS REAIS DE MERCADO (use para credibilidade e comparações criativas!) ===\n${perplexity_data}` : "") +
      (modo === "autopilot" ? "\n\n--- AUTO-PILOT ---\nSeja conciso (máx 2 parágrafos). Inclua pergunta de fechamento." : "");

    let userPrompt = `Gere uma mensagem humana, contextual e persuasiva de ${tipo_copy} com tom ${tom}. Máximo de 3 frases curtas e até 420 caracteres.`;
    if (detectedDisc) userPrompt += `\nPERFIL DISC detectado: ${detectedDisc} — adapte 100% a comunicação.`;
    if (nome_cliente) userPrompt += `\nCliente: ${nome_cliente}`;
    if (valor_orcamento) userPrompt += `\n(Valor interno — NÃO mencione ao cliente)`;
    if (status_negociacao) userPrompt += `\nStatus: ${status_negociacao}`;
    if (dias_sem_resposta && dias_sem_resposta > 1) userPrompt += `\n${dias_sem_resposta} dias sem resposta — URGENTE!`;
    if (mensagem_cliente) userPrompt += `\nÚltima mensagem do cliente: "${mensagem_cliente}"`;
    if (contextSignals.signalLabels.length > 0) userPrompt += `\nSinais contextuais detectados: ${contextSignals.signalLabels.join(", ")}`;
    if (contextSignals.explicitDisinterest) userPrompt += `\nIMPORTANTE: o cliente verbalizou desinteresse. Não faça propaganda; identifique a causa real com respeito e objetividade.`;
    if (contextSignals.mentionsDecisionMaker) userPrompt += `\nIMPORTANTE: responda facilitando a decisão conjunta, sem pressionar nem desviar do assunto.`;
    if (contextSignals.asksAlternativeService || contextSignals.mentionsTimeFriction) userPrompt += `\nIMPORTANTE: ofereça atendimento remoto/online de forma concreta e prática.`;

    // Force Deal Room link when ANY price-related intent
    const isPriceIntent = ["enviar_preco", "orcamento", "preco"].includes(intencao);
    if (deal_room_link && isPriceIntent) {
      userPrompt += `\n\n🔴🔴🔴 OBRIGATÓRIO: O cliente falou de PREÇO/VALOR. NÃO envie nenhum número.`;
      userPrompt += `\n🔴 INCLUA OBRIGATORIAMENTE este link da reunião online: ${deal_room_link}`;
      userPrompt += `\nExemplo: "Preparei uma sala exclusiva pra gente ver tudo ao vivo! Acessa aqui: ${deal_room_link}"`;
      userPrompt += `\n🔴 Se NÃO incluir o link, a resposta será REJEITADA.`;
    } else if (deal_room_link) {
      userPrompt += `\nLink Deal Room disponível (use se fizer sentido): ${deal_room_link}`;
    }

    if (historico.length > 0) {
      const previousSellerMessages = historico
        .filter((h: any) => h.remetente_tipo !== "cliente")
        .map((h: any) => (h.mensagem || "").slice(0, 200));

      userPrompt += "\n\n--- HISTÓRICO RECENTE ---";
      for (const h of historico.slice(-8)) {
        const role = h.remetente_tipo === "cliente" ? "Cliente" : "Vendedor";
        userPrompt += `\n${role}: ${(h.mensagem || "").slice(0, 150)}`;
      }

      if (previousSellerMessages.length > 0) {
        userPrompt += "\n\n⚠️ ARGUMENTOS JÁ USADOS (NÃO repita NENHUM, crie algo 100% NOVO):";
        previousSellerMessages.slice(-8).forEach((msg: string, i: number) => {
          userPrompt += `\n${i + 1}. "${msg.substring(0, 100)}"`;
        });
        userPrompt += "\n\n🔴 PROIBIDO repetir qualquer frase, argumento ou estrutura acima.";
        userPrompt += "\n🔴 Use uma abordagem COMPLETAMENTE DIFERENTE e CRIATIVA.";
        userPrompt += "\n🔴 Surpreenda com uma comparação inusitada ou dado novo.";
      }
    }

    const effectiveMaxTokens = Math.min(max_tokens, 300);
    const temperature = Math.min(0.95 + (historico.length * 0.02), 1.2);

    // Alternate between OpenAI and Perplexity for generation
    const PERPLEXITY_API_KEY = Deno.env.get("PERPLEXITY_API_KEY");
    const usePerplexityForGeneration = PERPLEXITY_API_KEY && historico.length >= 3 && historico.length % 2 === 1;

    let mensagem = "";
    let tokens_usados = 0;
    let ai_provider_used = "openai";

    if (usePerplexityForGeneration && PERPLEXITY_API_KEY) {
      try {
        const pRes = await fetch("https://api.perplexity.ai/chat/completions", {
          method: "POST",
          headers: { Authorization: `Bearer ${PERPLEXITY_API_KEY}`, "Content-Type": "application/json" },
          body: JSON.stringify({
            model: "sonar",
            messages: [
              { role: "system", content: systemPrompt },
              { role: "user", content: userPrompt + "\n\nUse dados REAIS e atuais do mercado para construir argumentos INÉDITOS e CRIATIVOS que nunca foram usados antes." },
            ],
            max_tokens: effectiveMaxTokens,
            temperature: 0.8,
            search_recency_filter: "month",
          }),
        });
        if (pRes.ok) {
          const pData = await pRes.json();
          mensagem = pData.choices?.[0]?.message?.content || "";
          tokens_usados = pData.usage?.total_tokens || 0;
          ai_provider_used = "perplexity";
        }
      } catch (e) { console.error("Perplexity generation error:", e); }
    }

    // Fallback to OpenAI
    if (!mensagem) {
      const aiRes = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: { Authorization: `Bearer ${OPENAI_API_KEY}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          model: openai_model || "gpt-4o-mini",
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: userPrompt },
          ],
          max_tokens: effectiveMaxTokens,
          temperature,
          presence_penalty: 1.0,
          frequency_penalty: 0.9,
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
      mensagem = aiData.choices?.[0]?.message?.content || "";
      tokens_usados = aiData.usage?.total_tokens || 0;
      ai_provider_used = "openai";
    }

    mensagem = sanitizeGeneratedMessage(mensagem, intencao, mensagem_cliente);

    // Post-process: if price intent and Deal Room link missing from response, append it
    if (isPriceIntent && deal_room_link && !mensagem.includes(deal_room_link)) {
      mensagem = mensagem.replace(/\s*$/, "") + `\n\nAcessa nossa sala exclusiva: ${deal_room_link}`;
    }

    return respond({
      mensagem,
      tokens_usados,
      intencao,
      modo,
      closing_score: closingScore,
      disc_profile: detectedDisc,
      used_perplexity: !!perplexity_data || ai_provider_used === "perplexity",
      ai_provider: ai_provider_used,
    });
  } catch (e) {
    console.error("vendazap-ai error:", e);
    return respond({ error: "Erro interno" }, 500);
  }
});
