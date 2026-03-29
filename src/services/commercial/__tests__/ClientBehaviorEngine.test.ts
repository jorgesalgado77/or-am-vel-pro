/**
 * Tests for ClientBehaviorEngine
 */
import { describe, it, expect, beforeEach } from "vitest";
import { ClientBehaviorEngine, type BehaviorContext, type SimulatedPersona } from "../ClientBehaviorEngine";

describe("ClientBehaviorEngine", () => {
  let engine: ClientBehaviorEngine;

  beforeEach(() => {
    engine = new ClientBehaviorEngine();
  });

  // ─── detectPersona ────────────────────────────────────────

  describe("detectPersona", () => {
    it("detects interested persona", () => {
      const msgs = [
        { mensagem: "Adorei o projeto! Show demais!", remetente_tipo: "cliente" },
        { mensagem: "Quando posso ir ver os materiais?", remetente_tipo: "cliente" },
      ];
      expect(engine.detectPersona(msgs)).toBe("interessado");
    });

    it("detects undecided persona", () => {
      const msgs = [
        { mensagem: "Hmm, preciso pensar um pouco...", remetente_tipo: "cliente" },
        { mensagem: "Vou ver com meu marido", remetente_tipo: "cliente" },
      ];
      expect(engine.detectPersona(msgs)).toBe("indeciso");
    });

    it("detects rushed persona", () => {
      const msgs = [
        { mensagem: "Preciso pra ontem! Urgente!", remetente_tipo: "cliente" },
        { mensagem: "Fecha logo, manda o contrato agora!", remetente_tipo: "cliente" },
      ];
      expect(engine.detectPersona(msgs)).toBe("apressado");
    });

    it("detects resistant persona", () => {
      const msgs = [
        { mensagem: "Não quero mais, desisti", remetente_tipo: "cliente" },
        { mensagem: "O concorrente faz pela metade do preço", remetente_tipo: "cliente" },
      ];
      expect(engine.detectPersona(msgs)).toBe("resistente");
    });

    it("detects curious persona", () => {
      const msgs = [
        { mensagem: "Como funciona a garantia? Explica pra mim?", remetente_tipo: "cliente" },
        { mensagem: "Qual a diferença entre MDF e MDP? É resistente à umidade?", remetente_tipo: "cliente" },
      ];
      expect(engine.detectPersona(msgs)).toBe("curioso");
    });

    it("returns curioso for empty messages", () => {
      expect(engine.detectPersona([])).toBe("curioso");
    });

    it("ignores store messages", () => {
      const msgs = [
        { mensagem: "Adorei! Perfeito!", remetente_tipo: "loja" },
      ];
      expect(engine.detectPersona(msgs)).toBe("interessado"); // no client msgs → default
    });
  });

  // ─── calculateEngagementScore ─────────────────────────────

  describe("calculateEngagementScore", () => {
    const baseCtx: BehaviorContext = {
      clientName: "João",
      status: "em_negociacao",
      daysInactive: 1,
      hasSimulation: true,
      conversationHistory: [
        { mensagem: "Adorei!", remetente_tipo: "cliente" },
        { mensagem: "Obrigado!", remetente_tipo: "loja" },
        { mensagem: "Quando posso ir?", remetente_tipo: "cliente" },
      ],
    };

    it("returns score between 0-100", () => {
      const result = engine.calculateEngagementScore(baseCtx);
      expect(result.score).toBeGreaterThanOrEqual(0);
      expect(result.score).toBeLessThanOrEqual(100);
    });

    it("high engagement for active client with simulation", () => {
      const result = engine.calculateEngagementScore(baseCtx);
      expect(result.level).toMatch(/alto|medio/);
    });

    it("low engagement for inactive client", () => {
      const result = engine.calculateEngagementScore({
        ...baseCtx,
        daysInactive: 15,
        hasSimulation: false,
        conversationHistory: [],
      });
      expect(result.level).toMatch(/baixo|perdido/);
    });

    it("boosts score for closing intent", () => {
      const ctx: BehaviorContext = {
        ...baseCtx,
        conversationHistory: [
          { mensagem: "Vou fechar! Manda o contrato!", remetente_tipo: "cliente" },
        ],
      };
      const result = engine.calculateEngagementScore(ctx);
      expect(result.score).toBeGreaterThan(65);
    });
  });

  // ─── detectResistanceLevel ────────────────────────────────

  describe("detectResistanceLevel", () => {
    it("detects price resistance", () => {
      const ctx: BehaviorContext = {
        clientName: "Maria",
        status: "em_negociacao",
        daysInactive: 2,
        hasSimulation: true,
        conversationHistory: [
          { mensagem: "Achei muito caro! Impossível pagar isso!", remetente_tipo: "cliente" },
        ],
      };
      const result = engine.detectResistanceLevel(ctx);
      expect(result.category).toBe("preco");
      expect(result.level).toBeGreaterThan(20);
    });

    it("detects co-decision maker resistance", () => {
      const ctx: BehaviorContext = {
        clientName: "Pedro",
        status: "novo",
        daysInactive: 0,
        hasSimulation: false,
        conversationHistory: [
          { mensagem: "Preciso ver com meu marido e pensar com calma", remetente_tipo: "cliente" },
        ],
      };
      const result = engine.detectResistanceLevel(ctx);
      expect(result.category).toBe("decisor");
    });

    it("detects explicit desistance", () => {
      const ctx: BehaviorContext = {
        clientName: "Ana",
        status: "em_negociacao",
        daysInactive: 5,
        hasSimulation: true,
        conversationHistory: [
          { mensagem: "Não quero mais, pode encerrar", remetente_tipo: "cliente" },
        ],
      };
      const result = engine.detectResistanceLevel(ctx);
      expect(result.category).toBe("desistencia");
      expect(result.level).toBeGreaterThanOrEqual(40);
    });

    it("returns no resistance for neutral messages", () => {
      const ctx: BehaviorContext = {
        clientName: "Carlos",
        status: "novo",
        daysInactive: 0,
        hasSimulation: false,
        conversationHistory: [
          { mensagem: "Bom dia!", remetente_tipo: "cliente" },
        ],
      };
      const result = engine.detectResistanceLevel(ctx);
      expect(result.category).toBe("nenhuma");
      expect(result.level).toBe(0);
    });
  });

  // ─── predictNextMove ──────────────────────────────────────

  describe("predictNextMove", () => {
    it("predicts closing for high-engagement interested client", () => {
      const ctx: BehaviorContext = {
        clientName: "João",
        status: "proposta_enviada",
        daysInactive: 0,
        hasSimulation: true,
        persona: "apressado",
        conversationHistory: [
          { mensagem: "Adorei! Vamos fechar!", remetente_tipo: "cliente" },
          { mensagem: "Ótimo!", remetente_tipo: "loja" },
          { mensagem: "Me manda o contrato!", remetente_tipo: "cliente" },
        ],
      };
      const result = engine.predictNextMove(ctx);
      expect(result.nextMove).toBe("vai_fechar");
    });

    it("predicts desistance for resistant client", () => {
      const ctx: BehaviorContext = {
        clientName: "Ana",
        status: "em_negociacao",
        daysInactive: 10,
        hasSimulation: true,
        persona: "resistente",
        conversationHistory: [
          { mensagem: "Não quero mais, já desisti", remetente_tipo: "cliente" },
          { mensagem: "O concorrente faz pela metade", remetente_tipo: "cliente" },
        ],
      };
      const result = engine.predictNextMove(ctx);
      expect(result.nextMove).toBe("vai_desistir");
    });

    it("overrides move based on contextual trigger", () => {
      const ctx: BehaviorContext = {
        clientName: "Pedro",
        status: "novo",
        daysInactive: 0,
        hasSimulation: false,
        lastStoreMessage: "Quer agendar uma reunião para ver o projeto?",
        conversationHistory: [],
      };
      const result = engine.predictNextMove(ctx);
      expect(result.nextMove).toBe("vai_reagendar");
    });
  });

  // ─── generateResponse ─────────────────────────────────────

  describe("generateResponse", () => {
    it("returns a non-empty string", () => {
      const ctx: BehaviorContext = {
        clientName: "Maria",
        status: "em_negociacao",
        daysInactive: 1,
        hasSimulation: true,
        persona: "interessado",
        conversationHistory: [],
      };
      const response = engine.generateResponse(ctx);
      expect(response).toBeTruthy();
      expect(typeof response).toBe("string");
      expect(response.length).toBeGreaterThan(5);
    });

    it("matches contextual trigger for deal room", () => {
      const ctx: BehaviorContext = {
        clientName: "João",
        status: "em_negociacao",
        daysInactive: 0,
        hasSimulation: true,
        lastStoreMessage: "Criei uma sala virtual exclusiva pra gente conversar!",
        conversationHistory: [],
      };
      const response = engine.generateResponse(ctx);
      expect(response).toBeTruthy();
      // Should be a deal-room contextual response
      expect(response.length).toBeGreaterThan(10);
    });

    it("generates different responses for different personas", () => {
      const personas: SimulatedPersona[] = ["interessado", "resistente", "apressado"];
      const responses = new Set<string>();

      // Run multiple times to collect diverse responses
      for (let i = 0; i < 20; i++) {
        for (const persona of personas) {
          const ctx: BehaviorContext = {
            clientName: "Test",
            status: "em_negociacao",
            daysInactive: 2,
            hasSimulation: true,
            persona,
            conversationHistory: [],
          };
          responses.add(engine.generateResponse(ctx));
        }
      }

      // Should have generated at least 3 different responses
      expect(responses.size).toBeGreaterThanOrEqual(3);
    });
  });
});
