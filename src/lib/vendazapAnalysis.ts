export type DiscProfile = "D" | "I" | "S" | "C" | "";

export interface VendaZapMessageLike {
  mensagem: string;
  remetente_tipo: string;
}

export interface DiscInsight {
  profile: DiscProfile;
  confidence: number;
  summary: string;
  signals: string[];
  scores: Record<"D" | "I" | "S" | "C", number>;
}

export const DISC_PROFILE_META: Record<Exclude<DiscProfile, "">, { label: string; emoji: string; approach: string }> = {
  D: {
    label: "Dominante",
    emoji: "🔴",
    approach: "Seja direto, fale de resultado, rapidez e próximo passo sem rodeios.",
  },
  I: {
    label: "Influente",
    emoji: "🟡",
    approach: "Use energia, visualização do ambiente e prova social com linguagem envolvente.",
  },
  S: {
    label: "Estável",
    emoji: "🟢",
    approach: "Passe segurança, acolha a preocupação e reduza esforço, risco e atrito na decisão.",
  },
  C: {
    label: "Conforme",
    emoji: "🔵",
    approach: "Traga processo, detalhes concretos, comparativos e explicações objetivas.",
  },
};

const DISC_PATTERNS: Record<Exclude<DiscProfile, "">, RegExp[]> = {
  D: [/rápido/i, /direto/i, /agora/i, /logo/i, /objetivo/i, /resolve/i, /sem enrol/i, /não tenho tempo/i, /nao tenho tempo/i],
  I: [/kkk/i, /haha/i, /rsrs/i, /amei/i, /adorei/i, /lindo/i, /sonho/i, /show/i, /top/i, /😍|😄|🔥|❤|💛/i],
  S: [/marido/i, /esposa/i, /fam[ií]lia/i, /garantia/i, /seguran/i, /confian/i, /calma/i, /tranquil/i, /combin/i, /sem pressa/i, /atendimento/i, /suporte/i],
  C: [/detalh/i, /medid/i, /como funciona/i, /explica/i, /material/i, /ferragem/i, /compar/i, /especific/i, /projeto/i, /t[eé]cnic/i],
};

function countMatches(text: string, patterns: RegExp[]) {
  return patterns.reduce((total, pattern) => total + ((text.match(pattern) || []).length), 0);
}

export function analyzeVendaZapMessage(message: string): { score: number; intent: string } {
  if (!message || message.trim().length < 2) return { score: 0, intent: "vazio" };

  const lower = message.toLowerCase();
  const explicitDisinterest = /n[ãa]o tenho(?:\s+mais)?\s+interesse|perdi o interesse|n[ãa]o quero mais|n[ãa]o vou seguir|n[ãa]o faz mais sentido|j[aá] desisti|deixa pra l[aá]|pode encerrar|n[ãa]o vou fechar/i.test(lower);
  const mentionsDecisionMaker = /meu marido|minha esposa|meu esposo|minha mulher|preciso ver com|vou ver com|vou falar com|decidir com|ver com ele|ver com ela/i.test(lower);
  const mentionsArquiteto = /arquitet[oa]|designer|projetista/i.test(lower);
  const mentionsSocio = /s[oó]cio|s[oó]cia|parceiro de neg[oó]cio/i.test(lower);
  const asksAlternativeService = /outra forma de atendimento|atendimento online|atendimento remoto|videochamada|chamada de v[ií]deo|sem ir na loja|sem ir ai|sem sair de casa|por chamada|por v[ií]deo|online/i.test(lower);
  const mentionsTimeFriction = /perder tempo|sem tempo|corrido|agilidade|mais pr[aá]tico|praticidade/i.test(lower);

  if (/fechar|quero comprar|vou levar|aceito|pode fazer|fechado|manda o contrato|vamos nessa/i.test(lower)) {
    return { score: 90, intent: "fechamento" };
  }
  if (explicitDisinterest) {
    return { score: 8, intent: "desinteresse_explicit" };
  }
  if (mentionsDecisionMaker && asksAlternativeService) {
    return { score: 72, intent: "canal_alternativo" };
  }
  if (asksAlternativeService || mentionsTimeFriction) {
    return { score: 60, intent: "canal_alternativo" };
  }
  if (mentionsDecisionMaker) {
    return { score: 58, intent: mentionsArquiteto ? "decisor_arquiteto" : mentionsSocio ? "decisor_socio" : "decisor_familiar" };
  }
  if (/manda.*pre[çc]o|envia.*pre[çc]o|envia.*valor|manda.*valor|envia.*or[çc]amento|manda.*or[çc]amento|por whats|pelo whats|por e-?mail|pelo e-?mail|por mensagem|pela mensagem|me envia|pode mandar|pode enviar|passa.*pre[çc]o|passa.*valor|manda.*por aqui|envia.*por aqui/i.test(lower)) {
    return { score: 50, intent: "enviar_preco" };
  }
  if (/or[çc]amento|quanto custa|valor|pre[çc]o|proposta|me passa/i.test(lower)) {
    return { score: 65, intent: "orçamento" };
  }
  if (/desconto|condi[çc][ãa]o|parcel|pagamento|negocia|mais barato/i.test(lower)) {
    return { score: 55, intent: "negociação" };
  }
  if (/como funciona|d[úu]vida|explica|garantia|prazo|entrega/i.test(lower)) {
    return { score: 45, intent: "dúvida" };
  }
  if (/caro|vou pensar|depois|outro lugar|concorr|n[ãa]o sei|preciso ver/i.test(lower)) {
    return { score: 30, intent: "objeção" };
  }
  if (/n[ãa]o quero|desist|cancel|n[ãa]o tenho interesse|obrigad[oa] mas/i.test(lower)) {
    return { score: 15, intent: "resistência" };
  }
  if (/bom dia|boa tarde|boa noite|oi|ol[áa]|tudo bem/i.test(lower)) {
    return { score: 25, intent: "saudação" };
  }

  return { score: 35, intent: "neutro" };
}

export function detectDiscFromMessages(messages: VendaZapMessageLike[]): DiscInsight {
  const clientMessages = messages
    .filter((message) => message.remetente_tipo === "cliente")
    .map((message) => message.mensagem?.trim())
    .filter(Boolean) as string[];

  if (clientMessages.length === 0) {
    return {
      profile: "",
      confidence: 0,
      summary: "Aguardando mensagem do cliente para ler o perfil comportamental.",
      signals: [],
      scores: { D: 0, I: 0, S: 0, C: 0 },
    };
  }

  const fullText = clientMessages.join(" ");
  const lower = fullText.toLowerCase();
  const scores = {
    D: countMatches(fullText, DISC_PATTERNS.D),
    I: countMatches(fullText, DISC_PATTERNS.I),
    S: countMatches(fullText, DISC_PATTERNS.S),
    C: countMatches(fullText, DISC_PATTERNS.C),
  };

  const signals: string[] = [];

  if (/n[ãa]o tenho(?:\s+mais)?\s+interesse|perdi o interesse|n[ãa]o quero mais|n[ãa]o vou seguir|j[aá] desisti/i.test(lower)) {
    signals.push("rejeição explícita");
  }

  if (/meu marido|minha esposa|preciso ver com|vou ver com|decidir com/i.test(lower)) {
    scores.S += 3;
    signals.push("decisão compartilhada");
  }
  if (/arquitet[oa]|designer|projetista/i.test(lower)) {
    scores.C += 3;
    signals.push("decisor: arquiteto/designer");
  }
  if (/s[oó]cio|s[oó]cia|parceiro de neg[oó]cio/i.test(lower)) {
    scores.D += 2;
    scores.C += 1;
    signals.push("decisor: sócio/parceiro");
  }
  if (/outra forma de atendimento|atendimento online|atendimento remoto|videochamada|sem ir na loja|sem sair de casa/i.test(lower)) {
    scores.S += 2;
    scores.C += 1;
    signals.push("busca praticidade no atendimento");
  }
  if (/perder tempo|sem tempo|corrido|agilidade|mais pr[aá]tico/i.test(lower)) {
    scores.D += 2;
    scores.S += 1;
    signals.push("resistência a deslocamento/tempo");
  }
  if ((fullText.match(/\?/g) || []).length >= 2) {
    scores.C += 1;
  }

  const averageLength = clientMessages.reduce((sum, message) => sum + message.length, 0) / clientMessages.length;
  if (averageLength < 35) scores.D += 1;
  if (averageLength > 110) scores.C += 2;

  const sorted = Object.entries(scores).sort((a, b) => b[1] - a[1]) as Array<[Exclude<DiscProfile, "">, number]>;
  const [profile, topScore] = sorted[0];
  const secondScore = sorted[1]?.[1] ?? 0;
  const confidence = Math.max(0, Math.min(100, 45 + (topScore - secondScore) * 15 + topScore * 6));

  if (topScore < 2) {
    return {
      profile: "",
      confidence: Math.min(confidence, 40),
      summary: "Ainda há poucos sinais para cravar o DISC; continue alimentando a conversa para refinar a leitura.",
      signals,
      scores,
    };
  }

  const meta = DISC_PROFILE_META[profile];
  const summaryBase = `Leitura atual: ${meta.label} ${meta.emoji}. ${meta.approach}`;
  const summary = signals.length > 0 ? `${summaryBase} Sinais: ${signals.join(" • ")}.` : summaryBase;

  return {
    profile,
    confidence,
    summary,
    signals,
    scores,
  };
}