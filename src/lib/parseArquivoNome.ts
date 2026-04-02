/**
 * Utility to parse the arquivo_nome field from simulations.
 * Supports both legacy format (plain array of environments) and new format
 * ({ environments: [...], catalogProducts: [...] }).
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
}

export function parseArquivoNome(arquivoNome: string | null | undefined): ParsedArquivoNome {
  const empty: ParsedArquivoNome = { environments: [], catalogProducts: [] };
  if (!arquivoNome) return empty;

  try {
    const parsed = JSON.parse(arquivoNome);

    // New format: { environments: [...], catalogProducts: [...] }
    if (parsed && !Array.isArray(parsed) && parsed.environments) {
      return {
        environments: Array.isArray(parsed.environments) ? parsed.environments : [],
        catalogProducts: Array.isArray(parsed.catalogProducts) ? parsed.catalogProducts : [],
      };
    }

    // Legacy format: plain array of environments
    if (Array.isArray(parsed)) {
      return { environments: parsed, catalogProducts: [] };
    }
  } catch {
    // Not valid JSON
  }

  return empty;
}
