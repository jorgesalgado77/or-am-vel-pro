/**
 * ClientBehaviorEngine — Predicts and simulates client behavior.
 *
 * Pure functions that analyze conversation history, pricing context,
 * and behavioral signals to generate realistic simulated responses
 * and predict client next moves.
 *
 * Used by the WhatsApp Simulator to replace random response pools
 * with strategy-driven, context-aware client simulation.
 */

import { analyzeVendaZapMessage, detectDiscFromMessages, type DiscProfile, type VendaZapMessageLike } from "@/lib/vendazapAnalysis";
import { calcLeadTemperature, type LeadTemperature } from "@/lib/leadTemperature";

// ==================== TYPES ====================

export interface BehaviorContext {
  clientName: string;
  status: string;
  daysInactive: number;
  hasSimulation: boolean;
  valorOrcamento?: number;
  lastStoreMessage?: string;
  conversationHistory?: Array<{ mensagem: string; remetente_tipo: string }>;
  persona?: SimulatedPersona;
}

export type SimulatedPersona = "interessado" | "indeciso" | "apressado" | "resistente" | "curioso";

export interface EngagementScore {
  score: number;          // 0-100
  level: "alto" | "medio" | "baixo" | "perdido";
  signals: string[];
}

export interface ResistanceAnalysis {
  level: number;          // 0-100
  category: "nenhuma" | "preco" | "tempo" | "decisor" | "concorrencia" | "desistencia";
  objections: string[];
}

export type PredictedMove =
  | "vai_fechar"
  | "vai_pedir_desconto"
  | "vai_consultar_decisor"
  | "vai_pedir_prazo"
  | "vai_comparar_concorrente"
  | "vai_desistir"
  | "vai_perguntar_detalhes"
  | "vai_reagendar"
  | "neutro";

export interface BehaviorPrediction {
  nextMove: PredictedMove;
  confidence: number;     // 0-100
  reasoning: string;
}

// ==================== RESPONSE TEMPLATES ====================

interface ResponseTemplate {
  move: PredictedMove;
  persona: SimulatedPersona;
  templates: string[];
}

const RESPONSE_TEMPLATES: ResponseTemplate[] = [
  // INTERESSADO
  { move: "vai_fechar", persona: "interessado", templates: [
    "Adorei! Manda o contrato que eu assino hoje mesmo!",
    "Perfeito! Vamos fechar! Qual o próximo passo?",
    "Show! Aceito essa condição. Me manda o PIX!",
    "{name}, fechado! Quando posso ir assinar?",
  ]},
  { move: "vai_pedir_desconto", persona: "interessado", templates: [
    "Gostei muito! Se der um descontinho eu fecho agora!",
    "Amei o projeto! Consegue um precinho especial pra mim?",
    "Tô quase fechando! Se parcelar em mais vezes eu levo!",
  ]},
  { move: "vai_perguntar_detalhes", persona: "interessado", templates: [
    "Que lindo! Vocês fazem em qual material? MDF ou MDP?",
    "Adorei! Qual o prazo de entrega depois que fechar?",
    "Amei a cozinha! Vocês fazem projeto 3D antes?",
    "Show! E a forma de pagamento, parcela em quantas vezes?",
  ]},
  { move: "vai_consultar_decisor", persona: "interessado", templates: [
    "Adorei! Vou mostrar pro meu marido hoje à noite!",
    "Minha arquiteta vai amar! Deixa eu mandar pra ela ver!",
  ]},

  // INDECISO
  { move: "vai_consultar_decisor", persona: "indeciso", templates: [
    "Hmm, preciso ver com meu marido primeiro...",
    "Vou falar com minha esposa e te retorno, tá?",
    "Preciso consultar minha arquiteta antes de decidir",
    "Meu sócio precisa aprovar, te retorno amanhã",
  ]},
  { move: "vai_pedir_prazo", persona: "indeciso", templates: [
    "Deixa eu pensar com calma e te respondo amanhã...",
    "Gostei mas preciso organizar as finanças antes",
    "Vou pensar no final de semana e te falo segunda, pode ser?",
  ]},
  { move: "vai_comparar_concorrente", persona: "indeciso", templates: [
    "Tô em dúvida entre vocês e outra loja...",
    "Recebi outro orçamento, quero comparar antes de decidir",
    "Será que planejado vale a pena ou modulado resolve?",
  ]},
  { move: "vai_pedir_desconto", persona: "indeciso", templates: [
    "Achei um pouquinho salgado... consegue melhorar?",
    "Bonito mas não sei se cabe no orçamento... tem desconto?",
    "Se der pra parcelar em mais vezes eu consigo fechar",
  ]},

  // APRESSADO
  { move: "vai_fechar", persona: "apressado", templates: [
    "Fecha logo! Manda o contrato AGORA!",
    "Vamos fechar! Me manda o PIX que eu pago hoje!",
    "Sem enrolação, aceito! Qual o próximo passo?",
    "Fechado! Preciso pra ontem, quando começa?",
  ]},
  { move: "vai_pedir_desconto", persona: "apressado", templates: [
    "Direto ao ponto: qual o melhor preço à vista?",
    "Se eu fechar agora, quanto de desconto?",
    "Preciso resolver hoje — me dá a melhor condição!",
  ]},
  { move: "vai_perguntar_detalhes", persona: "apressado", templates: [
    "Qual o prazo mais rápido que vocês fazem?",
    "Tem como entregar em 15 dias? Tô reformando urgente!",
  ]},

  // RESISTENTE
  { move: "vai_desistir", persona: "resistente", templates: [
    "Não tenho mais interesse, obrigado",
    "Desculpa mas vou comprar em outro lugar",
    "Já desisti desse projeto, não quero mais",
    "Pode encerrar, não vou mais fazer",
    "Cancelei a reforma, obrigado pela atenção",
  ]},
  { move: "vai_comparar_concorrente", persona: "resistente", templates: [
    "O concorrente de vocês faz por metade do preço",
    "Recebi uma proposta MUITO melhor de outra loja",
    "Achei muito caro comparado com o que vi por aí",
  ]},
  { move: "vai_pedir_desconto", persona: "resistente", templates: [
    "Impossível pagar isso! Só se der um baita desconto...",
    "Por esse preço? Só se baixar pelo menos 30%",
  ]},
  { move: "vai_consultar_decisor", persona: "resistente", templates: [
    "Meu marido não quer ir na loja, existe outra forma?",
    "Minha esposa não gostou, vou ter que repensar tudo",
  ]},

  // CURIOSO
  { move: "vai_perguntar_detalhes", persona: "curioso", templates: [
    "Qual material vocês usam? É MDF de que marca?",
    "Como funciona a garantia? Cobre o quê exatamente?",
    "Me explica o processo: do orçamento até a instalação?",
    "Esse valor inclui instalação e frete? Ou é à parte?",
    "Vocês têm certificação? O MDF é resistente à umidade?",
    "Qual a diferença entre vocês e a Todeschini?",
    "Como funciona o pagamento? Cartão ou só boleto?",
  ]},
  { move: "vai_comparar_concorrente", persona: "curioso", templates: [
    "Vi que a Dell Anno usa ferragem Blum, vocês também?",
    "Quanto tempo dura planejado vs modulado?",
  ]},
  { move: "vai_consultar_decisor", persona: "curioso", templates: [
    "Minha arquiteta pediu pra ver o projeto técnico também",
    "Vou mandar essas informações pro meu engenheiro avaliar",
  ]},
];

// ==================== CONTEXTUAL TRIGGERS ====================

interface ContextualTrigger {
  pattern: RegExp;
  moveOverride: PredictedMove;
  responseTemplates: string[];
}

const CONTEXTUAL_TRIGGERS: ContextualTrigger[] = [
  {
    pattern: /deal\s*room|sala\s*(online|virtual|exclusiva)|v[íi]deo/i,
    moveOverride: "vai_fechar",
    responseTemplates: [
      "Que legal! Pode ser por vídeo sim, meu marido participa de casa!",
      "Show! Manda o link que eu entro agora!",
      "Boa! Prefiro online mesmo, qual horário tem disponível?",
    ],
  },
  {
    pattern: /desconto|condi[çc][ãa]o\s*especial|promo[çc][ãa]o/i,
    moveOverride: "vai_pedir_desconto",
    responseTemplates: [
      "Opa! Qual desconto vocês conseguem?",
      "Se der um bom desconto eu fecho hoje!",
      "Hmm, depende do valor... quanto fica com desconto?",
    ],
  },
  {
    pattern: /hor[áa]rio|agendar|agenda|reuni[ãa]o|visita/i,
    moveOverride: "vai_reagendar",
    responseTemplates: [
      "Pode ser sábado de manhã? Às 10h fica bom!",
      "Tenho disponibilidade na quarta à tarde",
      "Qual horário vocês atendem? Só consigo à noite",
    ],
  },
  {
    pattern: /contrato|assinar|fechar|fechamento/i,
    moveOverride: "vai_fechar",
    responseTemplates: [
      "Antes de assinar quero tirar umas dúvidas sobre a garantia",
      "Pode mandar o contrato sim! Vou ler com calma",
      "Manda o contrato que eu e meu marido vamos analisar!",
    ],
  },
  {
    pattern: /3d|projeto|render|imagem|foto/i,
    moveOverride: "vai_perguntar_detalhes",
    responseTemplates: [
      "Quero ver o 3D sim! Pode mandar?",
      "Adorei! Dá pra mudar a cor no projeto?",
      "Show! Minha arquiteta pediu pra ver também!",
    ],
  },
  {
    pattern: /pre[çc]o|valor|or[çc]amento|quanto/i,
    moveOverride: "vai_pedir_desconto",
    responseTemplates: [
      "Hmm, achei um pouco alto... tem como melhorar?",
      "Esse é o melhor preço? Consigo desconto à vista?",
      "Entendi! Vocês parcelam em quantas vezes?",
    ],
  },
];

// ==================== ENGINE ====================

export class ClientBehaviorEngine {
  /**
   * Detect the most likely persona based on conversation history.
   */
  detectPersona(messages: Array<{ mensagem: string; remetente_tipo: string }>): SimulatedPersona {
    if (!messages || messages.length === 0) return "curioso";

    const clientMsgs = messages
      .filter(m => m.remetente_tipo === "cliente")
      .map(m => m.mensagem || "");

    if (clientMsgs.length === 0) return "interessado";

    const fullText = clientMsgs.join(" ").toLowerCase();

    // Score each persona
    const scores: Record<SimulatedPersona, number> = {
      interessado: 0,
      indeciso: 0,
      apressado: 0,
      resistente: 0,
      curioso: 0,
    };

    // Interested signals
    if (/ador|amei|lindo|show|perfeito|quer|gost|maravilh/i.test(fullText)) scores.interessado += 3;
    if (/quando|como fa[çc]o|pr[oó]ximo passo|fechar/i.test(fullText)) scores.interessado += 2;

    // Undecided signals
    if (/pensar|dúvida|n[ãa]o sei|ver com|consultar|talvez/i.test(fullText)) scores.indeciso += 3;
    if (/marido|esposa|arquitet|s[oó]cio/i.test(fullText)) scores.indeciso += 2;

    // Rushed signals
    if (/urgente|r[aá]pido|agora|logo|ontem|hoje|sem enrol/i.test(fullText)) scores.apressado += 3;
    if (/fecha|manda.*contrato|pix|cart[ãa]o/i.test(fullText)) scores.apressado += 2;

    // Resistant signals
    if (/n[ãa]o quero|desist|cancel|caro demais|impossível|outro lugar/i.test(fullText)) scores.resistente += 3;
    if (/concorr|metade do pre[çc]o|melhor proposta/i.test(fullText)) scores.resistente += 2;

    // Curious signals
    if (/como funciona|explica|garantia|material|mdf|mdp|diferença|compar/i.test(fullText)) scores.curioso += 3;
    if (/\?/g.test(fullText)) scores.curioso += Math.min(3, (fullText.match(/\?/g) || []).length);

    // Find highest
    const sorted = Object.entries(scores).sort((a, b) => b[1] - a[1]);
    return sorted[0][0] as SimulatedPersona;
  }

  /**
   * Calculate engagement score from conversation signals.
   */
  calculateEngagementScore(ctx: BehaviorContext): EngagementScore {
    const messages = ctx.conversationHistory || [];
    const clientMsgs = messages.filter(m => m.remetente_tipo === "cliente");
    const signals: string[] = [];

    let score = 50; // neutral start

    // Message count impact
    if (clientMsgs.length >= 10) { score += 15; signals.push("conversa longa"); }
    else if (clientMsgs.length >= 5) { score += 8; signals.push("bom engajamento"); }
    else if (clientMsgs.length <= 1) { score -= 10; signals.push("pouca interação"); }

    // Has simulation = interested
    if (ctx.hasSimulation) { score += 15; signals.push("tem simulação"); }

    // Days inactive penalty
    if (ctx.daysInactive > 7) { score -= 25; signals.push(`${ctx.daysInactive}d inativo`); }
    else if (ctx.daysInactive > 3) { score -= 12; signals.push(`${ctx.daysInactive}d sem contato`); }
    else if (ctx.daysInactive <= 1) { score += 10; signals.push("ativo recentemente"); }

    // Intent analysis from last client message
    const lastClientMsg = clientMsgs.slice(-1)[0]?.mensagem || "";
    if (lastClientMsg) {
      const analysis = analyzeVendaZapMessage(lastClientMsg);
      if (analysis.intent === "fechamento") { score += 20; signals.push("intenção de fechar"); }
      else if (analysis.intent === "orçamento") { score += 10; signals.push("pediu orçamento"); }
      else if (analysis.intent === "desinteresse_explicit") { score -= 30; signals.push("desinteresse explícito"); }
      else if (analysis.intent === "objeção") { score -= 8; signals.push("levantou objeção"); }
    }

    // Status-based
    if (ctx.status === "proposta_enviada") { score += 8; signals.push("proposta enviada"); }
    if (ctx.status === "em_negociacao") { score += 5; signals.push("em negociação"); }

    score = Math.max(0, Math.min(100, score));

    const level: EngagementScore["level"] =
      score >= 70 ? "alto" :
      score >= 40 ? "medio" :
      score >= 15 ? "baixo" : "perdido";

    return { score, level, signals };
  }

  /**
   * Detect resistance level and categorize objections.
   */
  detectResistanceLevel(ctx: BehaviorContext): ResistanceAnalysis {
    const messages = ctx.conversationHistory || [];
    const clientMsgs = messages
      .filter(m => m.remetente_tipo === "cliente")
      .map(m => m.mensagem || "");

    const fullText = clientMsgs.join(" ").toLowerCase();
    const objections: string[] = [];
    let level = 0;
    let category: ResistanceAnalysis["category"] = "nenhuma";

    // Price resistance
    if (/caro|prec[oç]o alto|muito caro|impossível pagar|absurdo|salgado/i.test(fullText)) {
      level += 30;
      category = "preco";
      objections.push("Resistência ao preço");
    }
    if (/desconto|mais barato|baixar|melhorar.*pre[çc]o/i.test(fullText)) {
      level += 15;
      if (category === "nenhuma") category = "preco";
      objections.push("Pede desconto");
    }

    // Time/decision resistance
    if (/pensar|depois|n[ãa]o sei|calma|sem pressa|ver com/i.test(fullText)) {
      level += 20;
      if (category === "nenhuma") category = "decisor";
      objections.push("Precisa de tempo");
    }
    if (/marido|esposa|arquitet|s[oó]cio|consultar/i.test(fullText)) {
      level += 15;
      category = "decisor";
      objections.push("Depende de co-decisor");
    }

    // Competition
    if (/concorr|outra loja|outro lugar|melhor proposta|comparar/i.test(fullText)) {
      level += 25;
      category = "concorrencia";
      objections.push("Comparando com concorrência");
    }

    // Explicit drop
    if (/n[ãa]o quero|desist|cancel|encerrar|n[ãa]o tenho interesse/i.test(fullText)) {
      level += 40;
      category = "desistencia";
      objections.push("Desistência explícita");
    }

    // Time friction
    if (/sem tempo|corrido|perder tempo|sem ir/i.test(fullText)) {
      level += 10;
      if (category === "nenhuma") category = "tempo";
      objections.push("Resistência logística");
    }

    return {
      level: Math.min(100, level),
      category,
      objections,
    };
  }

  /**
   * Predict the client's most likely next move.
   */
  predictNextMove(ctx: BehaviorContext): BehaviorPrediction {
    const engagement = this.calculateEngagementScore(ctx);
    const resistance = this.detectResistanceLevel(ctx);
    const persona = ctx.persona || this.detectPersona(ctx.conversationHistory || []);

    // Last store message context
    const lastStore = ctx.lastStoreMessage?.toLowerCase() || "";

    // Check contextual triggers from store's last message
    if (ctx.lastStoreMessage) {
      for (const trigger of CONTEXTUAL_TRIGGERS) {
        if (trigger.pattern.test(ctx.lastStoreMessage)) {
          return {
            nextMove: trigger.moveOverride,
            confidence: 70,
            reasoning: `Resposta contextual ao tema: ${trigger.moveOverride}`,
          };
        }
      }
    }

    // High engagement + low resistance = closing
    if (engagement.score >= 70 && resistance.level < 20) {
      return {
        nextMove: persona === "apressado" ? "vai_fechar" : "vai_pedir_desconto",
        confidence: 75,
        reasoning: `Alto engajamento (${engagement.score}) e baixa resistência. Cliente propenso a fechar.`,
      };
    }

    // High resistance = based on category
    if (resistance.level >= 60) {
      if (resistance.category === "desistencia") {
        return { nextMove: "vai_desistir", confidence: 85, reasoning: "Desistência explícita detectada." };
      }
      if (resistance.category === "concorrencia") {
        return { nextMove: "vai_comparar_concorrente", confidence: 70, reasoning: "Comparando com concorrência." };
      }
      if (resistance.category === "preco") {
        return { nextMove: "vai_pedir_desconto", confidence: 75, reasoning: "Resistência ao preço." };
      }
      if (resistance.category === "decisor") {
        return { nextMove: "vai_consultar_decisor", confidence: 70, reasoning: "Depende de co-decisor." };
      }
    }

    // Persona-based defaults
    const personaDefaults: Record<SimulatedPersona, PredictedMove> = {
      interessado: "vai_perguntar_detalhes",
      indeciso: "vai_pedir_prazo",
      apressado: "vai_fechar",
      resistente: "vai_comparar_concorrente",
      curioso: "vai_perguntar_detalhes",
    };

    return {
      nextMove: personaDefaults[persona],
      confidence: 55,
      reasoning: `Baseado no perfil ${persona} e engajamento ${engagement.level}.`,
    };
  }

  /**
   * Generate a context-aware simulated response.
   * Uses behavior prediction + persona to select the most appropriate response.
   */
  generateResponse(ctx: BehaviorContext): string {
    const persona = ctx.persona || this.detectPersona(ctx.conversationHistory || []);

    // Check contextual triggers first (from store's last message)
    if (ctx.lastStoreMessage) {
      for (const trigger of CONTEXTUAL_TRIGGERS) {
        if (trigger.pattern.test(ctx.lastStoreMessage)) {
          const templates = trigger.responseTemplates;
          return templates[Math.floor(Math.random() * templates.length)];
        }
      }
    }

    // Get prediction and find matching templates
    const prediction = this.predictNextMove(ctx);
    const matchingTemplates = RESPONSE_TEMPLATES.filter(
      t => t.persona === persona && t.move === prediction.nextMove
    );

    // Fallback: same persona, any move
    const templates = matchingTemplates.length > 0
      ? matchingTemplates
      : RESPONSE_TEMPLATES.filter(t => t.persona === persona);

    if (templates.length === 0) {
      // Ultimate fallback
      return "Oi, pode me dar mais informações?";
    }

    const selected = templates[Math.floor(Math.random() * templates.length)];
    const template = selected.templates[Math.floor(Math.random() * selected.templates.length)];

    // Replace placeholders
    return template.replace("{name}", ctx.clientName || "");
  }
}

// ==================== SINGLETON ====================

let _behaviorEngine: ClientBehaviorEngine | null = null;

export function getBehaviorEngine(): ClientBehaviorEngine {
  if (!_behaviorEngine) _behaviorEngine = new ClientBehaviorEngine();
  return _behaviorEngine;
}
