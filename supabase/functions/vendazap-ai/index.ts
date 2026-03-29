import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

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

/**
 * Resolve API key for a given tenant + provider.
 * Falls back to global env var if tenant has no custom key.
 */
async function resolveApiKey(tenantId: string | null, provider: "openai" | "perplexity"): Promise<string | null> {
  if (tenantId) {
    try {
      const sbUrl = Deno.env.get("SUPABASE_URL");
      const sbKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
      if (sbUrl && sbKey) {
        const sb = createClient(sbUrl, sbKey);
        const { data } = await sb.rpc("get_api_config", { p_tenant_id: tenantId, p_provider: provider });
        if (data && data.length > 0 && data[0].api_key) {
          return data[0].api_key;
        }
      }
    } catch (e) {
      console.warn(`[resolveApiKey] Failed for tenant ${tenantId}/${provider}:`, e);
    }
  }
  // Fallback to global env
  const envKey = provider === "openai" ? "OPENAI_API_KEY" : "PERPLEXITY_API_KEY";
  return Deno.env.get(envKey) || null;
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

  // Decision-maker identification
  const mentionsMarido = /meu marido|marido/i.test(combined);
  const mentionsEsposa = /minha esposa|esposa|minha mulher/i.test(combined);
  const mentionsSocio = /s[oó]cio|s[oó]cia|parceiro de neg[oó]cio|meu parceiro|minha parceira/i.test(combined);
  const mentionsArquiteto = /arquitet[oa]|designer|projetista|meu arquiteto|minha arquiteta/i.test(combined);
  const decisionMakerType: string | null = mentionsMarido ? "marido" : mentionsEsposa ? "esposa" : mentionsSocio ? "socio" : mentionsArquiteto ? "arquiteto" : mentionsDecisionMaker ? "outro" : null;

  const signalLabels = [
    explicitDisinterest ? "cliente verbalizou desinteresse explícito" : "",
    decisionMakerType === "marido" ? "decisor: marido" : "",
    decisionMakerType === "esposa" ? "decisor: esposa" : "",
    decisionMakerType === "socio" ? "decisor: sócio/parceiro" : "",
    decisionMakerType === "arquiteto" ? "decisor: arquiteto/designer" : "",
    (mentionsDecisionMaker && !decisionMakerType) ? "há outro decisor envolvido" : "",
    asksAlternativeService ? "cliente quer atendimento remoto/prático" : "",
    mentionsTimeFriction ? "cliente quer reduzir tempo e deslocamento" : "",
  ].filter(Boolean);

  return {
    explicitDisinterest,
    mentionsDecisionMaker,
    decisionMakerType,
    asksAlternativeService,
    mentionsTimeFriction,
    signalLabels,
  };
}

// === DECISION-MAKER OBJECTION MATRIX ===
const DECISION_MAKER_MATRIX: Record<string, { directive: string; strategies: string[] }> = {
  marido: {
    directive: `O MARIDO é o co-decisor. A cliente já tem interesse mas precisa do aval dele.
🔴 NÃO diga "traga seu marido na loja". Isso gera atrito.
🔴 FACILITE a participação dele sem esforço: videochamada, apresentação por link, resumo visual.
🔴 Fale na linguagem do marido: ROI, praticidade, valorização do imóvel, durabilidade.
🔴 Posicione o projeto como INVESTIMENTO, não gasto.`,
    strategies: [
      `"Consigo fazer uma apresentação rápida de 15 min por vídeo — seu marido entra do celular dele e vê tudo ao vivo, sem sair do trabalho."`,
      `"Preparo um resumo visual com investimento, materiais e valorização do imóvel pra ele analisar no tempo dele. Mando por WhatsApp mesmo."`,
      `"Muitos maridos que atendo preferem ver os números primeiro — posso montar um comparativo de custo x durabilidade que deixa a decisão mais fácil pros dois."`,
    ],
  },
  esposa: {
    directive: `A ESPOSA é a co-decisora. O cliente já tem interesse mas precisa do aval dela.
🔴 NÃO minimize a participação dela. Ela é decisora, não aprovadora.
🔴 FACILITE a participação com visualização do ambiente: projeto 3D, moodboard, referências.
🔴 Fale na linguagem do design, conforto, estética, funcionalidade do dia a dia.
🔴 Convide os dois para uma experiência visual juntos.`,
    strategies: [
      `"Que tal eu preparar uma visualização 3D do ambiente pra vocês verem juntos? Ela pode opinar sobre cores e acabamentos ao vivo."`,
      `"Monto um moodboard personalizado com as referências do espaço — é rápido e ela pode ver do celular. Assim vocês decidem juntos."`,
      `"Muitas esposas que atendo adoram participar da escolha de acabamento. Posso fazer uma call rápida com os dois pra mostrar as opções."`,
    ],
  },
  socio: {
    directive: `O SÓCIO/PARCEIRO COMERCIAL é o co-decisor. É uma decisão de negócio.
🔴 Trate como investimento empresarial: ROI, depreciação, imagem do negócio.
🔴 Ofereça apresentação executiva com números e payback.
🔴 Fale em valorização do ponto, produtividade do espaço, impressão nos clientes.
🔴 Facilite uma reunião rápida com ambos os sócios.`,
    strategies: [
      `"Consigo montar uma apresentação executiva com ROI e payback do investimento. Seu sócio pode entrar na call de 15 min e ver os números."`,
      `"Projetos comerciais como esse costumam se pagar em 2-3 anos pela valorização do ponto. Posso preparar o comparativo pra vocês dois analisarem."`,
      `"Muitos sócios pedem justificativa financeira — monto um one-pager com custo, benefício e prazo pra facilitar a decisão conjunta."`,
    ],
  },
  arquiteto: {
    directive: `O ARQUITETO/DESIGNER é o co-decisor técnico.
🔴 NÃO tente contornar o arquiteto — trate como ALIADO.
🔴 Fale linguagem TÉCNICA: especificações, catálogos, fichas de material.
🔴 Ofereça colaboração: planta com medidas, blocos 3D, paleta de materiais.
🔴 Posicione-se como parceiro do profissional, não concorrente.`,
    strategies: [
      `"Posso enviar nossa ficha técnica completa (materiais, ferragens, acabamentos) pro seu arquiteto avaliar. Trabalhamos com Blum, Hafele e laminados de primeira linha."`,
      `"Muitos arquitetos que trabalham conosco gostam de receber o arquivo técnico do projeto pra validar. Posso mandar o DWG/PDF detalhado."`,
      `"Se quiser, posso agendar uma call técnica rápida com seu arquiteto — alinhamos especificações e ele fica tranquilo com a qualidade do projeto."`,
    ],
  },
  outro: {
    directive: `Há um CO-DECISOR não identificado no processo.
🔴 Descubra quem é com uma pergunta natural.
🔴 Facilite a participação remota sem pressionar visita.
🔴 Ofereça material que possa ser compartilhado facilmente.`,
    strategies: [
      `"Entendi que vocês vão decidir juntos — posso preparar um resumo visual pra compartilhar? Assim a outra pessoa vê tudo sem precisar vir até aqui."`,
      `"Consigo fazer uma apresentação rápida por vídeo pra vocês dois verem ao mesmo tempo. Funciona pra você?"`,
    ],
  },
};

function buildContextDirective(signals: ReturnType<typeof extractContextSignals>, dealRoomLink: string) {
  const parts: string[] = [];

  // Decision-maker matrix
  if (signals.decisionMakerType && DECISION_MAKER_MATRIX[signals.decisionMakerType]) {
    const matrix = DECISION_MAKER_MATRIX[signals.decisionMakerType];
    const strategyIndex = Math.floor(Math.random() * matrix.strategies.length);
    parts.push(`
=== MATRIZ DE DECISOR: ${signals.decisionMakerType.toUpperCase()} ===
${matrix.directive}

EXEMPLO DE RESPOSTA IDEAL (adapte ao contexto, NÃO copie literal):
${matrix.strategies[strategyIndex]}
`);
  }

  // Time friction / alternative service
  if (signals.asksAlternativeService || signals.mentionsTimeFriction) {
    parts.push(`
=== ATRITO DE DESLOCAMENTO/TEMPO ===
- Ofereça atendimento remoto objetivo, prático e confortável.
- Explique em 1 frase COMO funciona (ex.: videochamada de 15 min com projeto 3D).
- NÃO force material/ferragem se a dúvida for sobre formato de atendimento.`);
  }

  // Deal Room link for decision-maker contexts
  if (dealRoomLink && (signals.mentionsDecisionMaker || signals.asksAlternativeService)) {
    parts.push(`
🔴 Use este link da Deal Room como solução prática para decisão conjunta: ${dealRoomLink}`);
  }

  if (parts.length === 0) return "";
  return "\n\n=== LEITURA PROFUNDA DE CONTEXTO (OBRIGATÓRIA) ===\n" + parts.join("\n");
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

  return result;
}

// === QUALITY VALIDATOR ===
const GENERIC_BLACKLIST: RegExp[] = [
  /cada projeto [eé] [uú]nico/i,
  /preparei algo especial/i,
  /aten[çc][ãa]o especial/i,
  /transformam seu lar/i,
  /n[ãa]o perca a chance/i,
  /vamos explorar juntos/i,
  /espa[çc]o especial/i,
  /conforto e seguran[çc]a/i,
  /n[ãa]o perca essa oportunidade/i,
  /assim como um designer cuida/i,
  /nossos m[oó]veis transformam/i,
  /seu lar merece/i,
  /fa[çc]a a escolha certa/i,
  /invista no seu sonho/i,
  /estamos aqui para ajudar/i,
  /ficamos [àa] disposi[çc][ãa]o/i,
  /qualquer d[úu]vida estamos aqui/i,
  /será um prazer/i,
  /temos as melhores solu[çc][õo]es/i,
  /somos especialistas/i,
  /temos o melhor/i,
  /somos a melhor op[çc][ãa]o/i,
];

interface QualityResult {
  passed: boolean;
  reason: string;
  genericMatches: string[];
}

function validateResponseQuality(
  response: string,
  intent: string,
  originalMessage: string,
  previousSellerMessages: string[],
): QualityResult {
  if (!response || response.trim().length < 10) {
    return { passed: false, reason: "resposta vazia ou muito curta", genericMatches: [] };
  }

  // Check generic blacklist
  const genericMatches: string[] = [];
  for (const pattern of GENERIC_BLACKLIST) {
    if (pattern.test(response)) {
      const match = response.match(pattern);
      genericMatches.push(match?.[0] || pattern.source);
    }
  }
  if (genericMatches.length >= 2) {
    return { passed: false, reason: "múltiplas frases genéricas detectadas", genericMatches };
  }

  // Check if response is off-context for desinteresse
  if (intent === "desinteresse_explicit") {
    const pushesProduct = /cozinha|closet|dormit[oó]rio|banheiro|lavanderia|sala|quarto/i.test(response) &&
      !/por que|motivo|o que mudou|o que aconteceu|causa/i.test(response);
    if (pushesProduct) {
      return { passed: false, reason: "empurra produto quando cliente disse não ter interesse", genericMatches };
    }
  }

  // Check repetition against previous seller messages
  if (previousSellerMessages.length > 0) {
    const responseLower = response.toLowerCase().trim();
    const responseWords = new Set(responseLower.split(/\s+/).filter(w => w.length > 3));

    for (const prev of previousSellerMessages) {
      const prevLower = prev.toLowerCase().trim();
      if (!prevLower) continue;

      // Exact or near-exact match
      if (responseLower === prevLower) {
        return { passed: false, reason: "resposta idêntica a uma anterior", genericMatches };
      }

      // Word overlap > 70%
      const prevWords = new Set(prevLower.split(/\s+/).filter(w => w.length > 3));
      if (prevWords.size > 0 && responseWords.size > 0) {
        const overlap = [...responseWords].filter(w => prevWords.has(w)).length;
        const similarity = overlap / Math.max(responseWords.size, prevWords.size);
        if (similarity > 0.7) {
          return { passed: false, reason: `similaridade de ${Math.round(similarity * 100)}% com resposta anterior`, genericMatches };
        }
      }
    }
  }

  // Check if response mentions client's actual words (context relevance)
  if (originalMessage && originalMessage.length > 10) {
    const clientKeywords = originalMessage.toLowerCase()
      .split(/\s+/)
      .filter(w => w.length > 4)
      .filter(w => !["porque", "quando", "existe", "alguma", "outra", "forma", "tenho", "quero", "posso", "estou", "estava"].includes(w));

    if (clientKeywords.length > 0) {
      const respLower = response.toLowerCase();
      const hasAnyReference = clientKeywords.some(kw => respLower.includes(kw));
      // Only flag if there are enough meaningful keywords to expect a reference
      if (!hasAnyReference && clientKeywords.length >= 3) {
        // Soft warning — don't block, just note
        // return { passed: false, reason: "nenhuma referência ao que o cliente disse", genericMatches };
      }
    }
  }

  return { passed: true, reason: "ok", genericMatches };
}

// Fallback responses by intent for when quality validation fails
const FALLBACK_RESPONSES: Record<string, string[]> = {
  desinteresse_explicit: [
    "Entendi, [nome]. Sem insistência — mas me fala: foi pelo valor, pelo momento ou o projeto saiu da prioridade? Em 1 linha resolvo sua dúvida.",
    "[nome], respeito sua decisão. Só pra eu entender e melhorar: o que pesou mais — preço, prazo ou mudou de planos? Fico no aguardo sem pressão.",
    "Sem problema, [nome]. Antes de encerrar: foi algo que faltou no projeto ou mudou a prioridade? Pergunto pra te atender melhor se voltar.",
  ],
  objecao: [
    "[nome], entendo a hesitação. Pesquisa da ABIMÓVEL mostra que planejados valorizam o imóvel em até 15% — é investimento que se paga. Quer ver os números na nossa sala online?",
    "[nome], comparando com modulado: planejado dura 10-15 anos vs. 3-5. Dividido por dia, custa menos que um café. Vale a pena ver o comparativo ao vivo?",
  ],
  outro: [
    "[nome], pra avançar de forma objetiva: qual ambiente é prioridade pra você agora? Assim monto algo certeiro.",
  ],
};

function getFallbackResponse(intent: string, nomeCliente: string, attemptIndex: number): string {
  const pool = FALLBACK_RESPONSES[intent] || FALLBACK_RESPONSES.outro;
  const idx = attemptIndex % pool.length;
  return pool[idx].replace(/\[nome\]/g, nomeCliente || "");
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

    // ── Generate Copys action ──
    if (body.action === "generate_copys") {
      const tId = typeof body.tenant_id === "string" ? body.tenant_id : null;
      const count = typeof body.count === "number" ? Math.min(body.count, 8) : 4;
      const discProfile = typeof body.disc_profile === "string" ? body.disc_profile : null;

      const OPENAI_KEY = await resolveApiKey(tId, "openai");
      if (!OPENAI_KEY) return respond({ error: "Chave OpenAI não configurada" }, 500);

      const aiUrl = "https://api.openai.com/v1/chat/completions";

      const tipos = ["reativacao", "objecao", "urgencia", "fechamento", "reversao", "primeiro_contato", "follow_up", "pos_venda"];
      const labels: Record<string, string> = {
        reativacao: "Reativação",
        objecao: "Quebra de Objeção",
        urgencia: "Urgência",
        fechamento: "Fechamento",
        reversao: "Reversão",
        primeiro_contato: "1º Contato",
        follow_up: "Follow-up",
        pos_venda: "Pós-venda",
      };

      const discInstructions: Record<string, string> = {
        D: `PERFIL DISC: DOMINANTE (D). O cliente é direto, decisivo e impaciente.
Todas as mensagens devem ser ULTRA-OBJETIVAS, sem enrolação, focadas em resultado, exclusividade e urgência. Use tom imperativo e conduza a ação.`,
        I: `PERFIL DISC: INFLUENTE (I). O cliente é entusiasmado e sociável.
Todas as mensagens devem ser CALOROSAS, empolgantes, com energia positiva. Fale em experiência, design, sonho, use emojis e crie FOMO social.`,
        S: `PERFIL DISC: ESTÁVEL (S). O cliente é cauteloso e busca segurança.
Todas as mensagens devem ser ACOLHEDORAS, transmitir garantia, durabilidade e segurança. Mostre depoimentos, reduza percepção de risco, guie gentilmente.`,
        C: `PERFIL DISC: CONFORME (C). O cliente é analítico e detalhista.
Todas as mensagens devem conter DADOS, especificações técnicas, comparativos. Use lógica e fatos, nomes de materiais e certificações.`,
      };

      const discDirective = discProfile && discInstructions[discProfile]
        ? `\n\nIMPORTANTE — ADAPTE TODAS AS MENSAGENS PARA ESTE PERFIL:\n${discInstructions[discProfile]}`
        : "";

      const discTag = discProfile ? ` Inclua "disc_profile": "${discProfile}" em cada objeto.` : "";

      const prompt = `Você é um copywriter especialista em vendas de móveis planejados.
Gere exatamente ${count} mensagens de vendas para WhatsApp, cada uma de um tipo diferente.
Use [NOME] como placeholder para o nome do cliente.
Cada mensagem deve ter no máximo 300 caracteres, ser persuasiva e incluir emoji.${discDirective}

Retorne APENAS um JSON array com objetos { "tipo", "label", "mensagem"${discProfile ? ', "disc_profile"' : ''} }.
Tipos disponíveis: ${tipos.join(", ")}${discTag}

Exemplo:
[{"tipo":"reativacao","label":"Reativação Suave","mensagem":"[NOME], ainda pensando no projeto? ..."}]`;

      try {
        const aiRes = await fetch(aiUrl, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${OPENAI_KEY}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model: "gpt-4o-mini",
            messages: [
              { role: "system", content: "Retorne apenas JSON válido, sem markdown." },
              { role: "user", content: prompt },
            ],
            max_tokens: 2000,
            temperature: 0.9,
          }),
        });

        if (!aiRes.ok) {
          const errText = await aiRes.text();
          console.error("AI copy gen error:", aiRes.status, errText);
          return respond({ error: "Erro na API de IA", copys: [] }, 502);
        }

        const aiData = await aiRes.json();
        const raw = aiData.choices?.[0]?.message?.content || "[]";
        const cleaned = raw.replace(/```json\n?|\n?```/g, "").trim();

        let copys: Array<{ tipo: string; label: string; mensagem: string; disc_profile?: string }> = [];
        try {
          copys = JSON.parse(cleaned);
          if (!Array.isArray(copys)) copys = [];
        } catch {
          console.error("Failed to parse AI copys:", cleaned);
          copys = [];
        }

        // Ensure correct labels
        copys = copys.map((c) => ({
          tipo: tipos.includes(c.tipo) ? c.tipo : "ia_gerada",
          label: c.label || labels[c.tipo] || "Copy IA",
          mensagem: (c.mensagem || "").slice(0, 500),
          disc_profile: discProfile || c.disc_profile || null,
        })).filter((c) => c.mensagem.length > 10);

        return respond({ copys, tokens: aiData.usage?.total_tokens || 0 });
      } catch (err: any) {
        console.error("generate_copys error:", err);
        return respond({ error: err.message || "Erro interno", copys: [] }, 500);
      }
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
    const historico = Array.isArray(body.historico) ? body.historico.slice(-20) : [];
    const learning_context = typeof body.learning_context === "string" ? body.learning_context.slice(0, 3000) : "";
    const custom_arguments = typeof body.custom_arguments === "string" ? body.custom_arguments.slice(0, 3000) : "";
    let perplexity_data = typeof body.perplexity_data === "string" ? body.perplexity_data.slice(0, 2000) : "";
    const disc_profile = typeof body.disc_profile === "string" ? body.disc_profile : "";
    const openai_model = typeof body.openai_model === "string" ? body.openai_model.slice(0, 100) : "gpt-4o-mini";
    const tenant_id = typeof body.tenant_id === "string" ? body.tenant_id : null;

    // Direct messages array (DealRoom AI Assistant)
    const messages = Array.isArray(body.messages) ? body.messages : null;

    // Resolve tenant-specific API keys with global fallback
    const OPENAI_API_KEY = await resolveApiKey(tenant_id, "openai");
    if (!OPENAI_API_KEY) return respond({ error: "OPENAI_API_KEY não configurada. Configure nas Configurações > APIs." }, 500);

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

    // Extract previous seller messages for quality check
    const previousSellerMessages = historico
      .filter((h: any) => h.remetente_tipo !== "cliente")
      .map((h: any) => (h.mensagem || "").slice(0, 300));

    if (historico.length > 0) {
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
    const PERPLEXITY_API_KEY = await resolveApiKey(tenant_id, "perplexity");
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

    // === QUALITY VALIDATION ===
    let qualityResult = validateResponseQuality(mensagem, intencao, mensagem_cliente, previousSellerMessages);
    let validationAttempts = 0;

    if (!qualityResult.passed && validationAttempts < 1) {
      // Try regenerating once with stronger instructions
      validationAttempts++;
      const retryPrompt = userPrompt +
        `\n\n🔴🔴🔴 A RESPOSTA ANTERIOR FOI REJEITADA: ${qualityResult.reason}.` +
        (qualityResult.genericMatches.length > 0 ? `\nFrases genéricas detectadas: ${qualityResult.genericMatches.join(", ")}` : "") +
        `\nGere uma resposta COMPLETAMENTE DIFERENTE, sem frases genéricas, referenciando diretamente o que o cliente disse.`;

      try {
        const retryRes = await fetch("https://api.openai.com/v1/chat/completions", {
          method: "POST",
          headers: { Authorization: `Bearer ${OPENAI_API_KEY}`, "Content-Type": "application/json" },
          body: JSON.stringify({
            model: openai_model || "gpt-4o-mini",
            messages: [
              { role: "system", content: systemPrompt },
              { role: "user", content: retryPrompt },
            ],
            max_tokens: effectiveMaxTokens,
            temperature: Math.min(temperature + 0.15, 1.3),
            presence_penalty: 1.2,
            frequency_penalty: 1.0,
          }),
        });
        if (retryRes.ok) {
          const retryData = await retryRes.json();
          const retryMsg = retryData.choices?.[0]?.message?.content || "";
          const retryQuality = validateResponseQuality(retryMsg, intencao, mensagem_cliente, previousSellerMessages);
          if (retryQuality.passed) {
            mensagem = retryMsg;
            tokens_usados += retryData.usage?.total_tokens || 0;
            qualityResult = retryQuality;
          }
        }
      } catch (e) { console.error("Quality retry error:", e); }
    }

    // If still failing, use curated fallback
    if (!qualityResult.passed) {
      mensagem = getFallbackResponse(intencao, nome_cliente, historico.length);
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
      quality_validated: qualityResult.passed,
      quality_reason: qualityResult.reason,
      decision_maker: contextSignals.decisionMakerType || null,
    });
  } catch (e) {
    console.error("vendazap-ai error:", e);
    return respond({ error: "Erro interno" }, 500);
  }
});
