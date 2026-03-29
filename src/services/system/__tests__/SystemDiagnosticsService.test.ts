import { describe, it, expect } from "vitest";
import { analyzeDiagnosticPatterns } from "../SystemDiagnosticsService";

describe("analyzeDiagnosticPatterns", () => {
  it("returns zero failure rate for empty logs", () => {
    const result = analyzeDiagnosticPatterns([]);
    expect(result.failureRate).toBe(0);
    expect(result.topIssues).toHaveLength(0);
    expect(result.suggestions).toHaveLength(0);
  });

  it("calculates failure rate correctly", () => {
    const logs = [
      { resultado: "sucesso" },
      { resultado: "sucesso" },
      { resultado: "falha_credencial" },
      { resultado: "falha_tenant" },
    ];
    const result = analyzeDiagnosticPatterns(logs);
    expect(result.failureRate).toBe(50);
  });

  it("ranks top issues by count", () => {
    const logs = [
      { resultado: "falha_credencial" },
      { resultado: "falha_credencial" },
      { resultado: "falha_credencial" },
      { resultado: "falha_tenant" },
      { resultado: "sucesso" },
    ];
    const result = analyzeDiagnosticPatterns(logs);
    expect(result.topIssues[0]).toContain("falha_credencial");
    expect(result.topIssues[0]).toContain("3x");
  });

  it("suggests credential reset for high credential failures", () => {
    const logs = Array.from({ length: 5 }, () => ({ resultado: "falha_credencial" }));
    const result = analyzeDiagnosticPatterns(logs);
    expect(result.suggestions.some(s => s.includes("senhas incorretas"))).toBe(true);
  });

  it("suggests tenant check for tenant failures", () => {
    const logs = [{ resultado: "falha_tenant" }];
    const result = analyzeDiagnosticPatterns(logs);
    expect(result.suggestions.some(s => s.includes("tenant"))).toBe(true);
  });

  it("warns about high failure rate", () => {
    const logs = [
      ...Array.from({ length: 4 }, () => ({ resultado: "falha_desconhecida" })),
      { resultado: "sucesso" },
    ];
    const result = analyzeDiagnosticPatterns(logs);
    expect(result.failureRate).toBe(80);
    expect(result.suggestions.some(s => s.includes("30%"))).toBe(true);
  });

  it("handles all success logs", () => {
    const logs = Array.from({ length: 10 }, () => ({ resultado: "sucesso" }));
    const result = analyzeDiagnosticPatterns(logs);
    expect(result.failureRate).toBe(0);
    expect(result.topIssues).toHaveLength(0);
  });
});
