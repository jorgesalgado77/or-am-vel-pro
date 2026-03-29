import { describe, it, expect } from "vitest";
import { calculateSimulation, type SimulationInput } from "../financing";
import { calcLeadTemperature } from "../leadTemperature";

describe("performance — concurrent calculations", () => {
  it("handles 1000 simulations in under 500ms", () => {
    const input: SimulationInput = {
      valorTela: 25000,
      desconto1: 10,
      desconto2: 5,
      desconto3: 3,
      formaPagamento: "Boleto",
      parcelas: 24,
      valorEntrada: 5000,
      plusPercentual: 0,
      boletoRates: { 24: 0.06 },
    };

    const start = performance.now();
    const results = Array.from({ length: 1000 }, () => calculateSimulation(input));
    const elapsed = performance.now() - start;

    expect(elapsed).toBeLessThan(500);
    expect(results).toHaveLength(1000);
    // All results should be identical (pure function)
    expect(results.every(r => r.valorFinal === results[0].valorFinal)).toBe(true);
  });

  it("handles 5000 temperature calculations in under 200ms", () => {
    const statuses = ["novo", "em_negociacao", "proposta_enviada", "fechado", "contato_inicial"];

    const start = performance.now();
    const results = Array.from({ length: 5000 }, (_, i) =>
      calcLeadTemperature({
        status: statuses[i % statuses.length],
        diasSemResposta: i % 30,
        temSimulacao: i % 2 === 0,
      })
    );
    const elapsed = performance.now() - start;

    expect(elapsed).toBeLessThan(200);
    expect(results).toHaveLength(5000);
    results.forEach(r => expect(["quente", "morno", "frio"]).toContain(r));
  });

  it("simulation results are deterministic (no floating point drift)", () => {
    const input: SimulationInput = {
      valorTela: 99999.99,
      desconto1: 7.5,
      desconto2: 3.3,
      desconto3: 1.1,
      formaPagamento: "Credito",
      parcelas: 18,
      valorEntrada: 12345.67,
      plusPercentual: 2.5,
      creditRates: { 18: 0.12 },
    };

    const r1 = calculateSimulation(input);
    const r2 = calculateSimulation(input);
    expect(r1.valorFinal).toBe(r2.valorFinal);
    expect(r1.valorParcela).toBe(r2.valorParcela);
    expect(r1.valorComDesconto).toBe(r2.valorComDesconto);
  });
});
