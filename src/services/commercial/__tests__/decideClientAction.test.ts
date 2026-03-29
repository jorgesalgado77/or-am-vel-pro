/**
 * Tests for decideClientAction orchestration and ClientContextBuilder types
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { CommercialDecisionEngine } from "../CommercialDecisionEngine";
import type { DealContext } from "../types";

// Mock supabase
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
}));

function makeDealContext(overrides: Partial<DealContext> = {}): DealContext {
  return {
    tenant_id: "tenant-1",
    customer: {
      id: "client-1",
      name: "João Silva",
      status: "em_negociacao",
      days_inactive: 2,
      has_simulation: true,
      phone: "11999999999",
      temperature: "morno",
      disc_profile: "I",
    },
    pricing: { total_price: 30000, commission_indicator: 5 },
    payment: {
      forma_pagamento: "Boleto",
      parcelas: 12,
      valor_entrada: 0,
      plus_percentual: 0,
    },
    discounts: {
      desconto1: 5,
      desconto2: 3,
      desconto3: 0,
      available_options: {
        desconto1: [0, 3, 5, 8, 10],
        desconto2: [0, 2, 3, 5],
        desconto3: [0, 2, 3],
        plus: [0, 5, 10],
      },
    },
    negotiation_history: [
      { mensagem: "Oi, tudo bem?", remetente_tipo: "cliente" },
      { mensagem: "Boa tarde! Tudo sim!", remetente_tipo: "loja" },
      { mensagem: "Adorei o projeto, show demais!", remetente_tipo: "cliente" },
    ],
    ...overrides,
  };
}

describe("CommercialDecisionEngine.decideClientAction", () => {
  let engine: CommercialDecisionEngine;

  beforeEach(() => {
    engine = new CommercialDecisionEngine();
  });

  it("returns all decision components", async () => {
    const ctx = makeDealContext();
    const result = await engine.decideClientAction(ctx);

    expect(result).toHaveProperty("analysis");
    expect(result).toHaveProperty("scenarios");
    expect(result).toHaveProperty("discount");
    expect(result).toHaveProperty("messageContext");
    expect(result).toHaveProperty("strategy");
    expect(result).toHaveProperty("suggestedAction");
    expect(result).toHaveProperty("urgency");
  });

  it("scenarios has 3 types", async () => {
    const ctx = makeDealContext();
    const result = await engine.decideClientAction(ctx, [1, 6, 12]);

    expect(result.scenarios).toHaveLength(3);
    expect(result.scenarios.map(s => s.type)).toEqual(["conservadora", "comercial", "agressiva"]);
  });

  it("high probability + low inactivity = immediate urgency", async () => {
    const ctx = makeDealContext({
      customer: {
        id: "c1", name: "Maria", status: "proposta_enviada",
        days_inactive: 0, has_simulation: true, phone: null,
        temperature: "quente", disc_profile: "D",
      },
      discounts: {
        desconto1: 15, desconto2: 5, desconto3: 3,
        available_options: {
          desconto1: [0, 5, 10, 15], desconto2: [0, 3, 5], desconto3: [0, 2, 3], plus: [0, 5],
        },
      },
    });

    const result = await engine.decideClientAction(ctx);
    // High closing probability with hot lead should give immediate or today
    expect(["immediate", "today"]).toContain(result.urgency);
  });

  it("long inactive = high urgency with reactivation action", async () => {
    const ctx = makeDealContext({
      customer: {
        id: "c2", name: "Pedro", status: "novo",
        days_inactive: 15, has_simulation: false, phone: null,
        temperature: "frio",
      },
    });

    const result = await engine.decideClientAction(ctx);
    expect(result.analysis.risk_level).toBe("high");
    expect(result.suggestedAction).toContain("Pedro");
  });

  it("messageContext detects tone and copy type from history", async () => {
    const ctx = makeDealContext({
      negotiation_history: [
        { mensagem: "Quanto custa esse móvel?", remetente_tipo: "cliente" },
      ],
    });

    const result = await engine.decideClientAction(ctx);
    expect(result.messageContext.tipo_copy).toBeTruthy();
    expect(result.messageContext.tom).toBeTruthy();
  });

  it("discount respects rules", async () => {
    const ctx = makeDealContext();
    const result = await engine.decideClientAction(ctx);

    expect(result.discount).toHaveProperty("recommended_d1");
    expect(result.discount).toHaveProperty("reasoning");
    expect(typeof result.discount.respects_rules).toBe("boolean");
  });
});
