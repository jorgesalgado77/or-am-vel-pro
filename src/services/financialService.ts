/**
 * Centralized Financial Service (BudgetEngine)
 * 
 * Consolidates all financial calculations, commission logic,
 * and budget number generation. Single source of truth.
 */

import { supabase } from "@/lib/supabaseClient";
import { calculateSimulation, formatCurrency, type SimulationInput, type SimulationResult } from "@/lib/financing";
import { z } from "zod";

// ==================== VALIDATION SCHEMAS ====================

export const simulationInputSchema = z.object({
  valorTela: z.number().min(0, "Valor não pode ser negativo"),
  desconto1: z.number().min(0).max(100, "Desconto máximo é 100%"),
  desconto2: z.number().min(0).max(100, "Desconto máximo é 100%"),
  desconto3: z.number().min(0).max(100, "Desconto máximo é 100%"),
  parcelas: z.number().int().min(1, "Mínimo 1 parcela"),
  valorEntrada: z.number().min(0, "Entrada não pode ser negativa"),
  plusPercentual: z.number().min(0).max(100, "Plus máximo é 100%"),
});

export const commissionSchema = z.object({
  valorBase: z.number().min(0),
  percentual: z.number().min(0).max(100),
});

// ==================== CONSTANTS ====================

export const FORMAS_PAGAMENTO_LABELS: Record<string, string> = {
  "A vista": "À Vista",
  Pix: "Pix",
  Credito: "Cartão de Crédito",
  Boleto: "Boleto",
  "Credito / Boleto": "Crédito + Boleto",
  "Entrada e Entrega": "Entrada e Entrega",
};

// ==================== BUDGET NUMBER ====================

/**
 * Generates the next sequential budget (orçamento) number.
 * Format: CCC.CCC.SSS.GG where CCC.CCC is the store code (immutable),
 * SSS increments 000–999, and GG only increments when SSS wraps from 999→000.
 * Example: 487.559.101.26 → 487.559.102.26 → ... → 487.559.999.26 → 487.559.000.27
 * 
 * Internal seq = GG * 1000 + SSS (e.g., 101.26 = 26*1000+101 = 26101)
 */
export function formatOrcamentoFromSeq(storeCode: string, seq: number): string {
  const sss = seq % 1000;
  const gg = Math.floor(seq / 1000);
  const sssPad = String(sss).padStart(3, "0");
  const ggPad = String(gg).padStart(2, "0");
  return `${storeCode.slice(0, 3)}.${storeCode.slice(3, 6)}.${sssPad}.${ggPad}`;
}

export function parseOrcamentoInitial(value: number | string | null | undefined): number {
  if (!value) return 26101; // default: 101.26
  const str = String(value).replace(/\D/g, "");
  if (str.length <= 2) {
    // Just a GG value like "26" → start at GG*1000 + 1
    return parseInt(str) * 1000 + 1;
  }
  if (str.length <= 5) {
    // Raw seq number
    return parseInt(str) || 26101;
  }
  // Full format like "10126" → GG=26, SSS=101 → 26*1000+101
  const gg = parseInt(str.slice(-2));
  const sss = parseInt(str.slice(0, -2));
  return gg * 1000 + sss;
}

export async function generateOrcamentoNumber(tenantId?: string | null): Promise<{
  numero_orcamento: string;
  numero_orcamento_seq: number;
}> {
  // 1. Get the store code from company_settings
  let storeCode = "000000";
  const settingsQuery = tenantId
    ? (supabase as any).from("company_settings").select("codigo_loja, orcamento_numero_inicial").eq("tenant_id", tenantId).maybeSingle()
    : (supabase as any).from("company_settings").select("codigo_loja, orcamento_numero_inicial").limit(1).maybeSingle();
  const { data: settingsData } = await settingsQuery;
  if (settingsData?.codigo_loja) {
    storeCode = String(settingsData.codigo_loja).replace(/\D/g, "").padStart(6, "0").slice(0, 6);
  }

  // 2. Find the max existing sequential number for this tenant
  let maxQuery = supabase
    .from("clients")
    .select("numero_orcamento_seq")
    .order("numero_orcamento_seq", { ascending: false })
    .limit(1);
  if (tenantId) maxQuery = maxQuery.eq("tenant_id", tenantId);
  const { data: maxData } = await maxQuery.single() as any;

  let nextSeq: number;
  if (!maxData?.numero_orcamento_seq) {
    nextSeq = parseOrcamentoInitial(settingsData?.orcamento_numero_inicial);
  } else {
    nextSeq = (maxData.numero_orcamento_seq as number) + 1;
  }

  const formatted = formatOrcamentoFromSeq(storeCode, nextSeq);
  return { numero_orcamento: formatted, numero_orcamento_seq: nextSeq };
}

// ==================== DISCOUNT CALCULATION ====================

/**
 * Applies cascading discounts (D1, D2, D3) to a base value.
 * This is the "valor à vista" — the commission base.
 */
export function applyDiscounts(
  valorBase: number,
  desconto1: number,
  desconto2: number,
  desconto3: number
): number {
  const afterD1 = valorBase * (1 - desconto1 / 100);
  const afterD2 = afterD1 * (1 - desconto2 / 100);
  return afterD2 * (1 - desconto3 / 100);
}

// ==================== COMMISSION CALCULATION ====================

/**
 * Calculates a commission value from a base amount and percentage.
 */
export function calculateCommission(valorBase: number, percentual: number): number {
  const parsed = commissionSchema.safeParse({ valorBase, percentual });
  if (!parsed.success) return 0;
  return (valorBase * percentual) / 100;
}

/**
 * Calculates the valor à vista (commission base) from simulation inputs.
 * Excludes financing fees — only applies discounts.
 */
export function calculateValorAVista(
  valorTela: number,
  comissaoIndicador: number,
  desconto1: number,
  desconto2: number,
  desconto3: number
): number {
  const valorComComissao = valorTela * (1 + comissaoIndicador / 100);
  return applyDiscounts(valorComComissao, desconto1, desconto2, desconto3);
}

// ==================== VALIDATED SIMULATION ====================

/**
 * Runs calculateSimulation with input validation.
 * Returns null if validation fails.
 */
export function runSimulation(input: SimulationInput): SimulationResult | null {
  const validation = simulationInputSchema.safeParse({
    valorTela: input.valorTela,
    desconto1: input.desconto1,
    desconto2: input.desconto2,
    desconto3: input.desconto3,
    parcelas: input.parcelas,
    valorEntrada: input.valorEntrada,
    plusPercentual: input.plusPercentual,
  });

  if (!validation.success) {
    console.warn("Simulation input validation failed:", validation.error.flatten());
    return null;
  }

  return calculateSimulation(input);
}

// Re-export for convenience
export { formatCurrency, calculateSimulation };
export type { SimulationInput, SimulationResult };
