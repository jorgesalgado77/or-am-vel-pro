/**
 * CommercialDecisionEngine — Integration tests
 * Uses mocked Supabase to test pure commercial logic.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock supabase before importing engine
vi.mock("@/lib/supabaseClient", () => ({
  supabase: {
    from: () => ({
      select: () => ({
        eq: () => ({
          maybeSingle: () => Promise.resolve({ data: null, error: null }),
        }),
      }),
    }),
  },
  EXTERNAL_SUPABASE_URL: "https://mock.supabase.co",
}));

import { CommercialDecisionEngine } from "../CommercialDecisionEngine";
import type { DealContext } from "../types";

function buildCtx(overrides?: Partial<DealContext>): DealContext {
  return {
    tenant_id: "test-tenant",
    customer: {
      id: "c1",
      name: "João Teste",
      status: "em_negociacao",
      days_inactive: 2,
      has_simulation: true,
    },
    pricing: { total_price: 20000 },
    payment: {
      forma_pagamento: "Boleto",
      parcelas: 12,
      valor_entrada: 0,
      plus_percentual: 0,
      boleto_rates: { 12: 0.08 },
    },
    discounts: {
      desconto1: 5,
      desconto2: 3,
      desconto3: 0,
      available_options: {
        desconto1: [0, 5, 10, 15],
        desconto2: [0, 3, 5, 8],
        desconto3: [0, 2, 5],
        plus: [0, 3, 5],
      },
    },
    ...overrides,
  };
}

describe("CommercialDecisionEngine", () => {
  let engine: CommercialDecisionEngine;

  beforeEach(() => {
    engine = new CommercialDecisionEngine();
  });

  // ─── analyzeDeal ────────────────────────────────────────
  describe("analyzeDeal", () => {
    it("returns valid analysis structure", async () => {
      const result = await engine.analyzeDeal(buildCtx());
      expect(result.closing_probability).toBeGreaterThanOrEqual(5);
      expect(result.closing_probability).toBeLessThanOrEqual(98);
      expect(["low", "medium", "high"]).toContain(result.risk_level);
      expect(["conservadora", "comercial", "agressiva"]).toContain(result.recommended_aggressiveness);
      expect(Array.isArray(result.insights)).toBe(true);
    });

    it("gives high risk for very inactive lead", async () => {
      const result = await engine.analyzeDeal(buildCtx({
        customer: { id: "c2", name: "Lead Frio", status: "contato_inicial", days_inactive: 30, has_simulation: false },
      }));
      expect(result.risk_level).toBe("high");
      expect(result.recommended_aggressiveness).toBe("agressiva");
    });

    it("recommends conservadora for hot lead", async () => {
      const result = await engine.analyzeDeal(buildCtx({
        customer: { id: "c3", name: "Lead Quente", status: "em_negociacao", days_inactive: 1, has_simulation: true },
      }));
      expect(result.recommended_aggressiveness).toBe("conservadora");
    });

    it("has higher probability for hot lead with discount", async () => {
      const hot = await engine.analyzeDeal(buildCtx({
        customer: { id: "c4", name: "Quente", status: "em_negociacao", days_inactive: 1, has_simulation: true },
        discounts: { desconto1: 15, desconto2: 5, desconto3: 0 },
      }));
      const cold = await engine.analyzeDeal(buildCtx({
        customer: { id: "c5", name: "Frio", status: "contato_inicial", days_inactive: 20, has_simulation: false },
        discounts: { desconto1: 0, desconto2: 0, desconto3: 0 },
      }));
      expect(hot.closing_probability).toBeGreaterThan(cold.closing_probability);
    });
  });

  // ─── generateScenarios ─────────────────────────────────
  describe("generateScenarios", () => {
    it("generates exactly 3 scenarios", async () => {
      const scenarios = await engine.generateScenarios(buildCtx(), [1, 6, 12, 24]);
      expect(scenarios).toHaveLength(3);
    });

    it("scenarios are conservadora, comercial, agressiva", async () => {
      const scenarios = await engine.generateScenarios(buildCtx(), [1, 12]);
      expect(scenarios.map(s => s.type)).toEqual(["conservadora", "comercial", "agressiva"]);
    });

    it("conservadora has lowest discount", async () => {
      const scenarios = await engine.generateScenarios(buildCtx(), [1, 12, 24]);
      const [conserv, , agress] = scenarios;
      const conservTotal = conserv.desconto1 + conserv.desconto2 + conserv.desconto3;
      const agressTotal = agress.desconto1 + agress.desconto2 + agress.desconto3;
      expect(conservTotal).toBeLessThanOrEqual(agressTotal);
    });

    it("agressiva has highest closing probability", async () => {
      const scenarios = await engine.generateScenarios(buildCtx(), [1, 12, 24]);
      const [conserv, , agress] = scenarios;
      expect(agress.closing_probability).toBeGreaterThanOrEqual(conserv.closing_probability);
    });

    it("each scenario has valid simulation result", async () => {
      const scenarios = await engine.generateScenarios(buildCtx(), [1, 12]);
      for (const s of scenarios) {
        expect(s.simulation.valorComDesconto).toBeGreaterThan(0);
        expect(s.simulation.valorParcela).toBeGreaterThan(0);
        expect(s.margin_estimated).toBeGreaterThan(0);
        expect(typeof s.margin_ok).toBe("boolean");
        expect(typeof s.discount_ok).toBe("boolean");
      }
    });

    it("returns empty array when no options available", async () => {
      const ctx = buildCtx({ discounts: { desconto1: 5, desconto2: 0, desconto3: 0 } });
      const scenarios = await engine.generateScenarios(ctx, [1]);
      expect(scenarios).toHaveLength(0);
    });
  });

  // ─── decideDiscount ─────────────────────────────────────
  describe("decideDiscount", () => {
    it("returns valid discount decision", async () => {
      const result = await engine.decideDiscount(buildCtx());
      expect(typeof result.recommended_d1).toBe("number");
      expect(typeof result.recommended_d2).toBe("number");
      expect(typeof result.recommended_d3).toBe("number");
      expect(result.reasoning.length).toBeGreaterThan(0);
      expect(typeof result.respects_rules).toBe("boolean");
    });

    it("recommends minimal discount for hot lead", async () => {
      const hot = await engine.decideDiscount(buildCtx({
        customer: { id: "h1", name: "Hot", status: "em_negociacao", days_inactive: 1, has_simulation: true },
      }));
      const cold = await engine.decideDiscount(buildCtx({
        customer: { id: "c1", name: "Cold", status: "contato_inicial", days_inactive: 30, has_simulation: false },
      }));
      const hotTotal = hot.recommended_d1 + hot.recommended_d2 + hot.recommended_d3;
      const coldTotal = cold.recommended_d1 + cold.recommended_d2 + cold.recommended_d3;
      expect(hotTotal).toBeLessThanOrEqual(coldTotal);
    });

    it("respects rules by default (no rules = no violation)", async () => {
      const result = await engine.decideDiscount(buildCtx());
      expect(result.respects_rules).toBe(true);
    });

    it("returns zero discounts when no options", async () => {
      const result = await engine.decideDiscount(buildCtx({
        discounts: { desconto1: 0, desconto2: 0, desconto3: 0 },
      }));
      expect(result.recommended_d1).toBe(0);
      expect(result.recommended_d2).toBe(0);
      expect(result.recommended_d3).toBe(0);
    });

    it("includes DISC reasoning when profile provided", async () => {
      const result = await engine.decideDiscount(buildCtx({
        customer: { id: "d1", name: "D-Profile", status: "em_negociacao", days_inactive: 3, has_simulation: true, disc_profile: "D" },
      }));
      expect(result.reasoning).toContain("Dominante");
    });
  });

  // ─── calculatePrice ─────────────────────────────────────
  describe("calculatePrice", () => {
    it("returns valid price calculation", async () => {
      const result = await engine.calculatePrice(buildCtx());
      expect(result.simulation).toBeDefined();
      expect(result.valor_a_vista).toBeGreaterThan(0);
      expect(result.margin_estimated).toBeGreaterThan(0);
      expect(result.total_discount_percent).toBeGreaterThanOrEqual(0);
    });
  });

  // ─── suggestStrategy ────────────────────────────────────
  describe("suggestStrategy", () => {
    it("returns complete strategy", async () => {
      const result = await engine.suggestStrategy(buildCtx());
      expect(result.action.length).toBeGreaterThan(0);
      expect(["low", "medium", "high"]).toContain(result.priority);
      expect(result.reasoning.length).toBeGreaterThan(0);
      expect(result.suggested_discount).toBeDefined();
      expect(["conservadora", "comercial", "agressiva"]).toContain(result.suggested_scenario);
    });

    it("gives high priority for inactive lead", async () => {
      const result = await engine.suggestStrategy(buildCtx({
        customer: { id: "i1", name: "Inativo", status: "contato_inicial", days_inactive: 15, has_simulation: false },
      }));
      expect(result.priority).toBe("high");
    });
  });

  // ─── convenience methods ────────────────────────────────
  describe("convenience methods", () => {
    it("getLeadTemperature delegates correctly", () => {
      const engine2 = new CommercialDecisionEngine();
      expect(engine2.getLeadTemperature("fechado", 0, false)).toBe("quente");
      expect(engine2.getLeadTemperature("contato_inicial", 30, false)).toBe("frio");
    });

    it("getDiscProfile detects profiles", () => {
      const engine2 = new CommercialDecisionEngine();
      const result = engine2.getDiscProfile([
        { mensagem: "Preciso rápido, direto, resolve logo agora", remetente_tipo: "cliente" },
      ]);
      expect(result.profile).toBe("D");
    });
  });
});
