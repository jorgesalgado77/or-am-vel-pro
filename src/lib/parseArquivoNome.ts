/**
 * Utility to parse the arquivo_nome field from simulations.
 * Supports both legacy format (plain array of environments) and new format
 * ({ environments: [...], catalogProducts: [...], metadata: {...} }).
 */

export interface ParsedArquivoNome {
  environments: any[];
  catalogProducts: Array<{
    product_id: string;
    internal_code: string;
    name: string;
    sale_price: number;
    quantity: number;
  }>;
  metadata?: {
    iaStrategyEnabled?: boolean;
    estrategiaIa?: string | null;
  };
}

export function parseArquivoNome(arquivoNome: string | null | undefined): ParsedArquivoNome {
  const empty: ParsedArquivoNome = { environments: [], catalogProducts: [], metadata: {} };
  if (!arquivoNome) return empty;

  try {
    const parsed = JSON.parse(arquivoNome);

    if (parsed && !Array.isArray(parsed) && typeof parsed === "object") {
      return {
        environments: Array.isArray(parsed.environments) ? parsed.environments : [],
        catalogProducts: Array.isArray(parsed.catalogProducts) ? parsed.catalogProducts : [],
        metadata: parsed.metadata && typeof parsed.metadata === "object"
          ? {
              iaStrategyEnabled: Boolean(parsed.metadata.iaStrategyEnabled),
              estrategiaIa: parsed.metadata.estrategiaIa || null,
            }
          : {},
      };
    }

    if (Array.isArray(parsed)) {
      return { environments: parsed, catalogProducts: [], metadata: {} };
    }
  } catch {
    // Not valid JSON
  }

  return empty;
}