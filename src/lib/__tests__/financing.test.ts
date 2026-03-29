import { describe, it, expect } from "vitest";
import { calculateSimulation, formatCurrency, formatPercent, type SimulationInput } from "../financing";

const baseInput: SimulationInput = {
  valorTela: 10000,
  desconto1: 10,
  desconto2: 5,
  desconto3: 0,
  formaPagamento: "A vista",
  parcelas: 1,
  valorEntrada: 0,
  plusPercentual: 0,
};

describe("calculateSimulation", () => {
  // ─── Discount cascade ────────────────────────────────────
  it("applies cascading discounts correctly", () => {
    const result = calculateSimulation(baseInput);
    // 10000 * 0.9 * 0.95 = 8550
    expect(result.valorComDesconto).toBeCloseTo(8550, 2);
  });

  it("handles zero discounts", () => {
    const result = calculateSimulation({ ...baseInput, desconto1: 0, desconto2: 0, desconto3: 0 });
    expect(result.valorComDesconto).toBe(10000);
  });

  it("handles triple discounts", () => {
    const result = calculateSimulation({ ...baseInput, desconto1: 10, desconto2: 10, desconto3: 10 });
    // 10000 * 0.9 * 0.9 * 0.9 = 7290
    expect(result.valorComDesconto).toBeCloseTo(7290, 2);
  });

  // ─── À vista / Pix ──────────────────────────────────────
  it("applies plus percentual for A vista", () => {
    const result = calculateSimulation({ ...baseInput, plusPercentual: 5 });
    // saldo = 8550, final = 8550 * 0.95 = 8122.5
    expect(result.valorFinal).toBeCloseTo(8122.5, 2);
  });

  it("Pix behaves like A vista", () => {
    const avista = calculateSimulation({ ...baseInput, formaPagamento: "A vista", plusPercentual: 3 });
    const pix = calculateSimulation({ ...baseInput, formaPagamento: "Pix", plusPercentual: 3 });
    expect(pix.valorFinal).toBeCloseTo(avista.valorFinal, 2);
  });

  // ─── Entrada ─────────────────────────────────────────────
  it("subtracts valor entrada from saldo", () => {
    const result = calculateSimulation({ ...baseInput, valorEntrada: 2000 });
    expect(result.saldo).toBeCloseTo(6550, 2);
    expect(result.valorEntrada).toBe(2000);
  });

  // ─── Crédito ─────────────────────────────────────────────
  it("calculates credit with coefficient", () => {
    const result = calculateSimulation({
      ...baseInput,
      formaPagamento: "Credito",
      parcelas: 10,
      creditRates: { 10: 0.15 },
    });
    // saldo=8550, final=8550*1.15=9832.5, parcela=983.25
    expect(result.valorFinal).toBeCloseTo(9832.5, 2);
    expect(result.valorParcela).toBeCloseTo(983.25, 2);
    expect(result.taxaCredito).toBe(0.15);
  });

  it("calculates credit with taxa_fixa from creditRatesFull", () => {
    const result = calculateSimulation({
      ...baseInput,
      formaPagamento: "Credito",
      parcelas: 6,
      creditRatesFull: { 6: { coefficient: 0.10, taxa_fixa: 200 } },
    });
    // saldo=8550+200=8750, *1.10=9625, parcela=9625/6≈1604.17
    expect(result.valorFinal).toBeCloseTo(9625, 2);
    expect(result.valorParcela).toBeCloseTo(1604.17, 1);
  });

  // ─── Boleto ──────────────────────────────────────────────
  it("calculates boleto with coefficient (parcela = saldo * coeff)", () => {
    const result = calculateSimulation({
      ...baseInput,
      formaPagamento: "Boleto",
      parcelas: 12,
      boletoRatesFull: { 12: { coefficient: 0.1, taxa_fixa: 100, coeficiente_60: 0.11, coeficiente_90: 0.12 } },
    });
    // saldo=8550+100=8650, parcela=8650*0.1=865, final=865*12=10380
    expect(result.valorParcela).toBeCloseTo(865, 2);
    expect(result.valorFinal).toBeCloseTo(10380, 2);
  });

  it("uses carencia 60 coefficient for boleto", () => {
    const result = calculateSimulation({
      ...baseInput,
      formaPagamento: "Boleto",
      parcelas: 12,
      carenciaDias: 60,
      boletoRatesFull: { 12: { coefficient: 0.1, taxa_fixa: 0, coeficiente_60: 0.15, coeficiente_90: 0.2 } },
    });
    expect(result.taxaBoleto).toBe(0.15);
  });

  it("uses carencia 90 coefficient for boleto", () => {
    const result = calculateSimulation({
      ...baseInput,
      formaPagamento: "Boleto",
      parcelas: 12,
      carenciaDias: 90,
      boletoRatesFull: { 12: { coefficient: 0.1, taxa_fixa: 0, coeficiente_60: 0.15, coeficiente_90: 0.2 } },
    });
    expect(result.taxaBoleto).toBe(0.2);
  });

  // ─── Crédito/Boleto misto ────────────────────────────────
  it("splits 50/50 for Credito / Boleto", () => {
    const result = calculateSimulation({
      ...baseInput,
      formaPagamento: "Credito / Boleto",
      parcelas: 10,
      creditRates: { 10: 0.1 },
      boletoRates: { 10: 0.08 },
    });
    // half credit = 4275 * 1.1 = 4702.5
    // half boleto = 4275 * 0.08 * 10 = 3420
    // total = 8122.5
    expect(result.valorFinal).toBeCloseTo(8122.5, 2);
  });

  // ─── Entrada e Entrega ───────────────────────────────────
  it("Entrada e Entrega returns saldo as-is", () => {
    const result = calculateSimulation({
      ...baseInput,
      formaPagamento: "Entrada e Entrega",
      valorEntrada: 3000,
    });
    expect(result.saldo).toBeCloseTo(5550, 2);
    expect(result.valorFinal).toBe(result.saldo);
    expect(result.valorParcela).toBe(result.saldo);
  });

  // ─── Edge cases ──────────────────────────────────────────
  it("handles zero valorTela", () => {
    const result = calculateSimulation({ ...baseInput, valorTela: 0 });
    expect(result.valorComDesconto).toBe(0);
    expect(result.valorFinal).toBe(0);
  });

  it("rounds valorParcela to 2 decimal places", () => {
    const result = calculateSimulation({
      ...baseInput,
      valorTela: 10001,
      formaPagamento: "Credito",
      parcelas: 3,
      creditRates: { 3: 0.05 },
    });
    const str = result.valorParcela.toString();
    const decimals = str.includes(".") ? str.split(".")[1].length : 0;
    expect(decimals).toBeLessThanOrEqual(2);
  });
});

describe("formatCurrency", () => {
  it("formats BRL correctly", () => {
    const formatted = formatCurrency(1234.56);
    expect(formatted).toContain("1.234,56");
    expect(formatted).toContain("R$");
  });

  it("formats zero", () => {
    expect(formatCurrency(0)).toContain("0,00");
  });
});

describe("formatPercent", () => {
  it("formats with 2 decimal places", () => {
    expect(formatPercent(12.5)).toBe("12.50%");
    expect(formatPercent(0)).toBe("0.00%");
  });
});
