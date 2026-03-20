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
 * Used in both Index.tsx and SimulatorPanel.tsx — now centralized.
 */
export async function generateOrcamentoNumber(): Promise<{
  numero_orcamento: string;
  numero_orcamento_seq: number;
}> {
  const { data: maxData } = await supabase
    .from("clients")
    .select("numero_orcamento_seq")
    .order("numero_orcamento_seq", { ascending: false })
    .limit(1)
    .single() as any;

  let nextSeq: number;
  if (!maxData?.numero_orcamento_seq) {
    const { data: settingsData } = await supabase
      .from("company_settings")
      .select("orcamento_numero_inicial")
      .limit(1)
      .single() as any;
    nextSeq = settingsData?.orcamento_numero_inicial || 1;
  } else {
    nextSeq = (maxData.numero_orcamento_seq as number) + 1;
  }

  const padded = String(nextSeq).padStart(11, "0");
  const formatted = `${padded.slice(0, 3)}.${padded.slice(3, 6)}.${padded.slice(6, 9)}.${padded.slice(9, 11)}`;
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
