/**
 * Service for importing TXT/XML project files in the simulator.
 * Extracts environment name, piece count, and total value.
 */

export interface ParsedFileResult {
  envName: string;
  pieces: number;
  total: number | null;
  fornecedor?: string;
  corpo?: string;
  porta?: string;
  puxador?: string;
  complemento?: string;
  modelo?: string;
}

export function parseTxtFile(content: string, fileName: string): ParsedFileResult {
  let total: number | null = null;
  let envName = fileName.replace(/\.(txt|xml)$/i, "");
  let pieces = 0;
  let fornecedor = "";
  let corpo = "";
  let porta = "";
  let puxador = "";
  let complemento = "";
  let modelo = "";

  const matchTotal = content.match(/Total\s*=\s*([\d.,]+)/i);
  if (matchTotal) total = parseFloat(matchTotal[1].replace(",", "."));

  const matchEnv = content.match(/Ambiente\s*[=:]\s*(.+)/i);
  if (matchEnv) envName = matchEnv[1].trim();

  // Extract material details
  const matchFornecedor = content.match(/(?:Fornecedor|Fabricante|Marca)\s*[=:]\s*(.+)/i);
  if (matchFornecedor) fornecedor = matchFornecedor[1].trim();

  const matchCorpo = content.match(/(?:Corpo|Caixa|Lateral)\s*[=:]\s*(.+)/i);
  if (matchCorpo) corpo = matchCorpo[1].trim();

  const matchPorta = content.match(/(?:Porta|Frente|Fachada)\s*[=:]\s*(.+)/i);
  if (matchPorta) porta = matchPorta[1].trim();

  const matchPuxador = content.match(/(?:Puxador|Puxadores)\s*[=:]\s*(.+)/i);
  if (matchPuxador) puxador = matchPuxador[1].trim();

  const matchDobradicas = content.match(/(?:Dobradica|Dobradiça|Dobradiças)\s*[=:]\s*(.+)/i);
  const matchCorredicas = content.match(/(?:Corrediça|Corrediças|Corredica)\s*[=:]\s*(.+)/i);
  const compParts: string[] = [];
  if (matchDobradicas) compParts.push(`Dobradiças: ${matchDobradicas[1].trim()}`);
  if (matchCorredicas) compParts.push(`Corrediças: ${matchCorredicas[1].trim()}`);
  if (compParts.length) complemento = compParts.join(", ");

  const matchModelo = content.match(/(?:Modelo|Linha|Coleção)\s*[=:]\s*(.+)/i);
  if (matchModelo) modelo = matchModelo[1].trim();

  // Infer body/door from content patterns like "15mm BRANCO", "18mm Preto"
  if (!corpo) {
    const matchCorpoInline = content.match(/(?:caixa|corpo|lateral)\s*(\d+)\s*mm\s*(\w+)/i);
    if (matchCorpoInline) corpo = `${matchCorpoInline[1]}mm ${matchCorpoInline[2]}`;
  }
  if (!porta) {
    const matchPortaInline = content.match(/(?:porta|frente)\s*(\d+)\s*mm\s*(\w+)/i);
    if (matchPortaInline) porta = `${matchPortaInline[1]}mm ${matchPortaInline[2]}`;
  }

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
  return { envName, pieces, total, fornecedor, corpo, porta, puxador, complemento, modelo };
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

  const extractTag = (tags: string[]) => {
    for (const tag of tags) {
      const m = content.match(new RegExp(`<${tag}[^>]*>\\s*([^<]+)\\s*<`, "i"));
      if (m) return m[1].trim();
    }
    return "";
  };

  return {
    envName, pieces, total,
    fornecedor: extractTag(["Fornecedor", "Fabricante", "Marca"]),
    corpo: extractTag(["Corpo", "Caixa", "Lateral"]),
    porta: extractTag(["Porta", "Frente", "Fachada"]),
    puxador: extractTag(["Puxador", "Puxadores"]),
    complemento: extractTag(["Complemento", "Acessorios", "Ferragens"]),
    modelo: extractTag(["Modelo", "Linha", "Colecao"]),
  };
}

export function parseProjectFile(content: string, fileName: string): ParsedFileResult {
  if (fileName.toLowerCase().endsWith(".xml")) {
    return parseXmlFile(content, fileName);
  }
  return parseTxtFile(content, fileName);
}
