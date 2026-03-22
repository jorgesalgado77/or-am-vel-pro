/**
 * Service for importing TXT/XML project files in the simulator.
 * Extracts environment name, piece count, and total value.
 */

export interface ParsedFileResult {
  envName: string;
  pieces: number;
  total: number | null;
}

export function parseTxtFile(content: string, fileName: string): ParsedFileResult {
  let total: number | null = null;
  let envName = fileName.replace(/\.(txt|xml)$/i, "");
  let pieces = 0;

  const matchTotal = content.match(/Total\s*=\s*([\d.,]+)/i);
  if (matchTotal) total = parseFloat(matchTotal[1].replace(",", "."));

  const matchEnv = content.match(/Ambiente\s*[=:]\s*(.+)/i);
  if (matchEnv) envName = matchEnv[1].trim();

  // Count pieces
  const lines = content.split(/\r?\n/).filter(l => l.trim());
  let itemCount = 0;
  let foundExplicit = false;

  const matchPieces = content.match(/(?:Pecas|Peças|Quantidade\s*(?:de\s*)?(?:Pe[çc]as)?|Total\s*de\s*Pe[çc]as|Qtd\s*(?:Pe[çc]as)?)\s*[=:]\s*(\d+)/i);
  if (matchPieces) {
    itemCount = parseInt(matchPieces[1]);
    foundExplicit = true;
  }

  if (!foundExplicit) {
    const hasTabs = content.includes('\t');
    const hasSemicolons = content.includes(';');
    const hasPipes = content.includes('|');
    const separator = hasTabs ? /\t/ : hasSemicolons ? /;/ : hasPipes ? /\|/ : null;

    for (const line of lines) {
      const trimmed = line.trim();
      if (/^(Total|Ambiente|Pecas|Peças|Quantidade|Descri|Nome|Projeto|Observ|Data|Vers|---|\*|#|=)/i.test(trimmed)) continue;
      if (trimmed.length < 3) continue;
      if (/^\d{1,2}\/\d{1,2}\/\d{2,4}$/.test(trimmed)) continue;
      if (/^[\d.,]+$/.test(trimmed)) continue;

      if (separator) {
        const cols = trimmed.split(separator);
        if (cols.length >= 2) {
          const qty = parseInt(cols[0].trim());
          if (!isNaN(qty) && qty > 0 && qty < 10000) itemCount += qty;
        }
      } else {
        const leadingQty = trimmed.match(/^(\d+)\s+\S/);
        if (leadingQty) {
          const qty = parseInt(leadingQty[1]);
          if (qty > 0 && qty < 10000) itemCount += qty;
        }
      }
    }
  }

  pieces = itemCount;
  return { envName, pieces, total };
}

export function parseXmlFile(content: string, fileName: string): ParsedFileResult {
  let total: number | null = null;
  let envName = fileName.replace(/\.(txt|xml)$/i, "");
  let pieces = 0;

  const matchTotal = content.match(/<(?:Total|ValorTotal|TOTAL|valor_total)[^>]*>\s*([\d.,]+)\s*</i);
  if (matchTotal) total = parseFloat(matchTotal[1].replace(/\./g, "").replace(",", "."));

  const matchEnv = content.match(/<(?:Ambiente|NomeAmbiente|AMBIENTE|ambiente)[^>]*>\s*([^<]+)\s*</i);
  if (matchEnv) envName = matchEnv[1].trim();

  const matchPieces = content.match(/<(?:QtdPecas|Quantidade|QTD|qtd_pecas|TotalPecas)[^>]*>\s*(\d+)\s*</i);
  if (matchPieces) pieces = parseInt(matchPieces[1]);

  return { envName, pieces, total };
}

export function parseProjectFile(content: string, fileName: string): ParsedFileResult {
  if (fileName.toLowerCase().endsWith(".xml")) {
    return parseXmlFile(content, fileName);
  }
  return parseTxtFile(content, fileName);
}
