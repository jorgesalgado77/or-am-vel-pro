import { describe, it, expect } from "vitest";
import { calcLeadTemperature, TEMPERATURE_CONFIG } from "../leadTemperature";

describe("calcLeadTemperature", () => {
  it("returns quente for fechado status", () => {
    expect(calcLeadTemperature({ status: "fechado", diasSemResposta: 100, temSimulacao: false })).toBe("quente");
  });

  it("returns quente for hot lead in negotiation with simulation", () => {
    expect(calcLeadTemperature({ status: "em_negociacao", diasSemResposta: 2, temSimulacao: true })).toBe("quente");
    expect(calcLeadTemperature({ status: "proposta_enviada", diasSemResposta: 3, temSimulacao: true })).toBe("quente");
  });

  it("returns morno for new lead regardless of days", () => {
    expect(calcLeadTemperature({ status: "novo", diasSemResposta: 20, temSimulacao: false })).toBe("morno");
  });

  it("returns morno for recent activity (<=7 days)", () => {
    expect(calcLeadTemperature({ status: "contato_inicial", diasSemResposta: 5, temSimulacao: false })).toBe("morno");
  });

  it("returns morno for negotiation within 14 days", () => {
    expect(calcLeadTemperature({ status: "em_negociacao", diasSemResposta: 12, temSimulacao: false })).toBe("morno");
  });

  it("returns frio for inactive lead", () => {
    expect(calcLeadTemperature({ status: "contato_inicial", diasSemResposta: 30, temSimulacao: false })).toBe("frio");
  });

  it("returns frio for negotiation beyond 14 days without other conditions", () => {
    expect(calcLeadTemperature({ status: "em_negociacao", diasSemResposta: 15, temSimulacao: false })).toBe("frio");
  });
});

describe("TEMPERATURE_CONFIG", () => {
  it("has all three temperatures configured", () => {
    expect(TEMPERATURE_CONFIG.quente).toBeDefined();
    expect(TEMPERATURE_CONFIG.morno).toBeDefined();
    expect(TEMPERATURE_CONFIG.frio).toBeDefined();
  });

  it("each config has required fields", () => {
    for (const temp of Object.values(TEMPERATURE_CONFIG)) {
      expect(temp.label).toBeTruthy();
      expect(temp.emoji).toBeTruthy();
      expect(temp.color).toBeTruthy();
      expect(temp.bgColor).toBeTruthy();
    }
  });
});
