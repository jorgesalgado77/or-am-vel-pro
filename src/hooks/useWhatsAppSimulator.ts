/**
 * WhatsApp Simulator Hook
 * Simulates client responses in the chat using the same tracking_messages table.
 * When the real WhatsApp API is connected, just disable simulation mode — everything keeps working.
 */
import { useState, useCallback, useRef } from "react";
import { supabase } from "@/lib/supabaseClient";
import { toast } from "sonner";

export type SimulationPersona = "interessado" | "indeciso" | "apressado" | "resistente" | "curioso";

interface SimulationConfig {
  enabled: boolean;
  persona: SimulationPersona;
  delayMin: number; // seconds
  delayMax: number; // seconds
  autoReply: boolean; // auto-reply to store messages
}

const DEFAULT_CONFIG: SimulationConfig = {
  enabled: false,
  persona: "interessado",
  delayMin: 3,
  delayMax: 8,
  autoReply: true,
};

// Simulated client response pools by persona
const PERSONA_RESPONSES: Record<SimulationPersona, string[]> = {
  interessado: [
    "Olá! Vi o orçamento e gostei bastante. Quando posso ir na loja ver os materiais?",
    "Que legal! Vocês trabalham com MDF ou MDP? Qual a diferença?",
    "Adorei o projeto! Meu marido quer ver também, posso levar ele sábado?",
    "Quanto fica o armário do quarto do casal? Quero algo bem espaçoso",
    "Amei a cozinha! Vocês fazem em laca? Quero tudo branquinho",
    "Perfeito! Pode me mandar fotos de projetos parecidos que vocês já fizeram?",
    "Show! Qual o prazo de entrega depois que fechar?",
    "Adorei! E a forma de pagamento, parcela em quantas vezes?",
    "Muito bom! Vocês fazem projeto 3D antes de fechar?",
    "Que maravilha! Aceita cartão de crédito?",
  ],
  indeciso: [
    "Hmm, achei legal mas preciso pensar um pouco mais...",
    "Vou ver com meu marido e te retorno, tá?",
    "Tá caro... vocês não fazem desconto?",
    "Deixa eu pesquisar mais um pouco, depois te falo",
    "Gostei mas tô em dúvida entre vocês e outra loja...",
    "Preciso falar com minha arquiteta antes de decidir",
    "Será que consigo um preço melhor se fechar tudo junto?",
    "Vou pensar com calma e te respondo amanhã, pode ser?",
    "Bonito mas não sei se cabe no meu orçamento agora...",
    "Interessante... mas será que vale a pena planejado ou modulado resolve?",
  ],
  apressado: [
    "Preciso pra ontem! Qual o prazo mais rápido que vocês fazem?",
    "Fecha logo, manda o contrato!",
    "Quanto fica? Me manda o valor AGORA por favor",
    "Sem enrolação, qual o melhor preço à vista?",
    "Tô reformando e preciso urgente, tem como entregar em 15 dias?",
    "Vamos fechar! Me manda o PIX",
    "Direto ao ponto: qual o desconto se eu fechar hoje?",
    "Preciso resolver isso essa semana, bora!",
  ],
  resistente: [
    "Não tenho mais interesse, obrigado",
    "Achei muito caro, impossível pagar isso",
    "Desculpa mas vou comprar em outro lugar",
    "Já desisti desse projeto, não quero mais",
    "O concorrente de vocês faz por metade do preço",
    "Não quero mais, pode encerrar",
    "Meu marido não quer ir na loja, existe outra forma de atendimento?",
    "Cancelei a reforma, não vou mais fazer",
    "Recebi uma proposta bem melhor de outra loja",
  ],
  curioso: [
    "Qual material vocês usam? É MDF de que marca?",
    "Como funciona a garantia? Cobre o quê exatamente?",
    "Vocês têm certificação? O MDF é resistente à umidade?",
    "Qual a diferença entre vocês e a Todeschini? E a Dell Anno?",
    "Quanto tempo dura um móvel planejado? Vi que modulado dura menos...",
    "Me explica o processo: como funciona do orçamento até a instalação?",
    "Vocês fazem projeto em 3D? Posso ver antes de fechar?",
    "Esse valor inclui instalação e frete? Ou é cobrado à parte?",
    "Como funciona o pagamento? Parcela no cartão ou só boleto?",
    "Tem algum showroom que eu possa visitar pra ver os materiais?",
  ],
};

// Context-aware responses based on store's last message
const CONTEXTUAL_RESPONSES: Array<{ trigger: RegExp; responses: string[] }> = [
  {
    trigger: /deal\s*room|sala\s*(online|virtual|exclusiva)|v[íi]deo/i,
    responses: [
      "Que legal! Pode ser por vídeo sim, meu marido pode participar de casa",
      "Show! Manda o link que eu entro agora",
      "Boa! Prefiro online mesmo, qual horário tem disponível?",
    ],
  },
  {
    trigger: /desconto|condi[çc][ãa]o|promo[çc][ãa]o/i,
    responses: [
      "Opa! Qual desconto vocês conseguem dar?",
      "Se der um bom desconto eu fecho hoje!",
      "Interessante... mas quero ver se consigo um preço melhor",
    ],
  },
  {
    trigger: /hor[áa]rio|agendar|agenda|reuni[ãa]o|visita/i,
    responses: [
      "Pode ser sábado de manhã? Às 10h fica bom",
      "Tenho disponibilidade na quarta-feira à tarde",
      "Qual horário vocês atendem? Só consigo à noite",
    ],
  },
  {
    trigger: /contrato|assinar|fechar|fechamento/i,
    responses: [
      "Antes de assinar quero tirar umas dúvidas sobre a garantia",
      "Pode mandar o contrato sim! Vou ler com calma",
      "Manda o contrato que eu e meu marido vamos analisar",
    ],
  },
  {
    trigger: /3d|projeto|render|imagem/i,
    responses: [
      "Quero ver o 3D sim! Pode mandar?",
      "Adorei! Dá pra mudar a cor no projeto?",
      "Show! Minha arquiteta pediu pra ver o projeto também",
    ],
  },
];

export function useWhatsAppSimulator() {
  const [config, setConfig] = useState<SimulationConfig>(() => {
    try {
      const saved = sessionStorage.getItem("whatsapp-sim-config");
      return saved ? { ...DEFAULT_CONFIG, ...JSON.parse(saved) } : DEFAULT_CONFIG;
    } catch {
      return DEFAULT_CONFIG;
    }
  });

  const pendingTimers = useRef<Map<string, NodeJS.Timeout>>(new Map());

  const updateConfig = useCallback((updates: Partial<SimulationConfig>) => {
    setConfig((prev) => {
      const next = { ...prev, ...updates };
      sessionStorage.setItem("whatsapp-sim-config", JSON.stringify(next));
      return next;
    });
  }, []);

  const getRandomDelay = useCallback(() => {
    const min = config.delayMin * 1000;
    const max = config.delayMax * 1000;
    return Math.floor(Math.random() * (max - min + 1)) + min;
  }, [config.delayMin, config.delayMax]);

  const getSimulatedResponse = useCallback((lastStoreMessage?: string): string => {
    // Try contextual match first
    if (lastStoreMessage) {
      for (const ctx of CONTEXTUAL_RESPONSES) {
        if (ctx.trigger.test(lastStoreMessage)) {
          return ctx.responses[Math.floor(Math.random() * ctx.responses.length)];
        }
      }
    }
    // Fallback to persona pool
    const pool = PERSONA_RESPONSES[config.persona];
    return pool[Math.floor(Math.random() * pool.length)];
  }, [config.persona]);

  /**
   * Schedule a simulated client response after the store sends a message.
   * Inserts into tracking_messages with remetente_tipo = "cliente" — 
   * the exact same path the real WhatsApp webhook would use.
   */
  const scheduleSimulatedReply = useCallback(
    (trackingId: string, clientName: string, lastStoreMessage: string) => {
      if (!config.enabled || !config.autoReply) return;

      // Cancel any pending timer for this tracking
      const existing = pendingTimers.current.get(trackingId);
      if (existing) clearTimeout(existing);

      const delay = getRandomDelay();

      const timer = setTimeout(async () => {
        const response = getSimulatedResponse(lastStoreMessage);

        const { error } = await supabase.from("tracking_messages").insert({
          tracking_id: trackingId,
          mensagem: response,
          remetente_tipo: "cliente",
          remetente_nome: clientName,
          lida: false,
          tenant_id: tenantIdRef.current,
        } as any);

        if (error) {
          console.error("Simulation insert error:", error);
        }

        pendingTimers.current.delete(trackingId);
      }, delay);

      pendingTimers.current.set(trackingId, timer);
    },
    [config.enabled, config.autoReply, getRandomDelay, getSimulatedResponse]
  );

  /**
   * Send a one-off simulated client message (manual trigger)
   */
  const sendSimulatedMessage = useCallback(
    async (trackingId: string, clientName: string, customMessage?: string) => {
      const message = customMessage || getSimulatedResponse();

      const { error } = await supabase.from("tracking_messages").insert({
        tracking_id: trackingId,
        mensagem: message,
        remetente_tipo: "cliente",
        remetente_nome: clientName,
        lida: false,
        tenant_id: tenantIdRef.current,
      } as any);

      if (error) {
        toast.error("Erro ao simular mensagem");
        return false;
      }
      return true;
    },
    [getSimulatedResponse]
  );

  const cleanup = useCallback(() => {
    pendingTimers.current.forEach((timer) => clearTimeout(timer));
    pendingTimers.current.clear();
  }, []);

  return {
    config,
    updateConfig,
    scheduleSimulatedReply,
    sendSimulatedMessage,
    cleanup,
    isSimulating: config.enabled,
    personas: Object.keys(PERSONA_RESPONSES) as SimulationPersona[],
  };
}
