import { describe, it, expect } from "vitest";

/**
 * Tests for the discount checking logic extracted from useDiscountApproval.
 * We test the pure function directly without React hooks.
 */

interface SalesRulesCache {
  min_margin: number;
  max_discount: number;
  approval_required_above: number | null;
  max_parcelas: number | null;
}

// Extracted pure logic matching useDiscountApproval.checkDiscount
function checkDiscount(
  valorBase: number,
  desconto1: number,
  desconto2: number,
  desconto3: number,
  plusPercentual: number,
  rules: SalesRulesCache | null,
) {
  if (!rules) return { allowed: true, violations: [], needsApproval: false };

  const valorDesc = valorBase * (1 - desconto1 / 100) * (1 - desconto2 / 100) * (1 - desconto3 / 100);
  const discPct = valorBase > 0 ? ((valorBase - valorDesc) / valorBase) * 100 : 0;
  const margin = 100 - discPct + plusPercentual;

  const violations: string[] = [];
  let needsApproval = false;

  if (rules.max_discount < 100 && discPct > rules.max_discount) {
    violations.push(`Desconto de ${discPct.toFixed(1)}% excede o limite de ${rules.max_discount}%`);
    needsApproval = true;
  }

  if (rules.min_margin > 0 && margin < rules.min_margin) {
    violations.push(`Margem de ${margin.toFixed(1)}% abaixo do mínimo de ${rules.min_margin}%`);
    needsApproval = true;
  }

  if (rules.approval_required_above && valorDesc > rules.approval_required_above) {
    violations.push(`Valor acima do limite de aprovação`);
    needsApproval = true;
  }

  return { allowed: !needsApproval, violations, needsApproval };
}

describe("checkDiscount", () => {
  const strictRules: SalesRulesCache = {
    min_margin: 20,
    max_discount: 15,
    approval_required_above: 50000,
    max_parcelas: 24,
  };

  it("allows within limits", () => {
    const result = checkDiscount(10000, 5, 0, 0, 0, strictRules);
    expect(result.allowed).toBe(true);
    expect(result.violations).toHaveLength(0);
  });

  it("rejects discount above max", () => {
    // 20% discount > 15% limit
    const result = checkDiscount(10000, 20, 0, 0, 0, strictRules);
    expect(result.allowed).toBe(false);
    expect(result.needsApproval).toBe(true);
    expect(result.violations.some(v => v.includes("excede"))).toBe(true);
  });

  it("rejects margin below minimum", () => {
    // 30% discount => margin ~70%, but with min_margin=20 it's fine
    // Actually: 85% margin with 15% discount. Let's make margin violation.
    // discount=85% => margin=15 < 20
    const result = checkDiscount(10000, 50, 50, 50, 0, strictRules);
    expect(result.needsApproval).toBe(true);
    expect(result.violations.some(v => v.includes("Margem"))).toBe(true);
  });

  it("triggers approval for high value", () => {
    const result = checkDiscount(100000, 5, 0, 0, 0, strictRules);
    // 100000*0.95=95000 > 50000
    expect(result.needsApproval).toBe(true);
    expect(result.violations.some(v => v.includes("limite de aprovação"))).toBe(true);
  });

  it("allows everything with null rules", () => {
    const result = checkDiscount(100000, 50, 50, 50, 0, null);
    expect(result.allowed).toBe(true);
  });

  it("allows everything with permissive rules", () => {
    const permissive: SalesRulesCache = { min_margin: 0, max_discount: 100, approval_required_above: null, max_parcelas: null };
    const result = checkDiscount(10000, 40, 20, 10, 0, permissive);
    expect(result.allowed).toBe(true);
  });

  it("plus percentual increases effective margin", () => {
    // 15% discount, margin = 85, plus = 5 => effective margin = 90
    const result = checkDiscount(10000, 15, 0, 0, 5, strictRules);
    expect(result.violations.some(v => v.includes("Margem"))).toBe(false);
  });

  it("handles zero base value gracefully", () => {
    const result = checkDiscount(0, 10, 10, 10, 0, strictRules);
    expect(result.allowed).toBe(true);
  });
});
