/**
 * Service for importing TXT/XML project files in the simulator.
 * Supports: Promob, Focco, Gabster, and generic formats.
 * Extracts environment name, piece count, total value, and material details.
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
  software?: "promob" | "focco" | "gabster" | "generico";
}

// ── Helpers ──────────────────────────────────────────────────────────

/** Parse a Brazilian decimal (1.234,56 → 1234.56) */
function parseBRL(raw: string): number {
  return parseFloat(raw.replace(/\./g, "").replace(",", "."));
}

/** First capturing-group match or fallback */
function firstMatch(content: string, patterns: RegExp[], fallback = ""): string {
  for (const re of patterns) {
    const m = content.match(re);
    if (m?.[1]) return m[1].trim();
  }
  return fallback;
}

/** Detect which software generated the file */
function detectSoftware(content: string, fileName: string): ParsedFileResult["software"] {
  const lower = content.toLowerCase();
  if (lower.includes("promob") || lower.includes("plugin builder") || /catalog|listexport/i.test(fileName)) return "promob";
  if (lower.includes("focco") || lower.includes("foccolojas") || lower.includes("foccosystem")) return "focco";
  if (lower.includes("gabster") || lower.includes("powerarq") || lower.includes("sketchup")) return "gabster";
  return "generico";
}

// ── Promob TXT ───────────────────────────────────────────────────────
// Promob exports CSV/TXT lists with delimiters (tab or semicolon).
// Common columns: Ambiente;Módulo;Peça;Qtd;Material;Espessura;Cor;Fornecedor;Valor

function parsePromobTxt(content: string, fileName: string): ParsedFileResult {
  const lines = content.split(/\r?\n/).filter(l => l.trim());
  const software: ParsedFileResult["software"] = "promob";

  // Detect separator
  const sep = content.includes("\t") ? "\t" : ";";
  const headerLine = lines.find(l => /ambiente|modulo|módulo|peca|peça/i.test(l));
  const headers = headerLine?.split(sep).map(h => h.trim().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "")) || [];

  const colIdx = (names: string[]) => headers.findIndex(h => names.some(n => h.includes(n)));
  const iAmb = colIdx(["ambiente", "amb"]);
  const iForn = colIdx(["fornecedor", "fabricante", "marca"]);
  const iMat = colIdx(["material", "chapa", "acabamento"]);
  const iEsp = colIdx(["espessura", "esp"]);
  const iCor = colIdx(["cor", "padrao", "padrão"]);
  const iQtd = colIdx(["qtd", "quantidade", "qt"]);
  const iVal = colIdx(["valor", "total", "preco", "preço", "vlr"]);
  const iPux = colIdx(["puxador", "pux"]);
  const iModelo = colIdx(["modelo", "linha", "colecao", "coleção"]);

  let envName = fileName.replace(/\.(txt|csv|xml)$/i, "");
  let totalValue = 0;
  let pieceCount = 0;
  let fornecedor = "";
  let corpo = "";
  let porta = "";
  let puxador = "";
  let modelo = "";
  const compParts: string[] = [];

  const dataLines = headerLine ? lines.slice(lines.indexOf(headerLine) + 1) : lines;

  for (const line of dataLines) {
    const cols = line.split(sep).map(c => c.trim());
    if (cols.length < 2) continue;

    if (iAmb >= 0 && cols[iAmb] && !envName) envName = cols[iAmb];
    if (iForn >= 0 && cols[iForn] && !fornecedor) fornecedor = cols[iForn];
    if (iPux >= 0 && cols[iPux] && !puxador) puxador = cols[iPux];
    if (iModelo >= 0 && cols[iModelo] && !modelo) modelo = cols[iModelo];

    // Body/door from material + thickness + color columns
    if (iMat >= 0 && iEsp >= 0) {
      const mat = cols[iMat] || "";
      const esp = cols[iEsp] || "";
      const cor = iCor >= 0 ? cols[iCor] || "" : "";
      const desc = `${esp}mm ${cor || mat}`.trim();
      if (!corpo && /caixa|corpo|lateral|estrutura/i.test(mat)) corpo = desc;
      if (!porta && /porta|frente|fachada/i.test(mat)) porta = desc;
    }

    // Quantity
    if (iQtd >= 0) {
      const qty = parseInt(cols[iQtd]);
      if (!isNaN(qty) && qty > 0) pieceCount += qty;
    }
    // Value
    if (iVal >= 0 && cols[iVal]) {
      const val = parseBRL(cols[iVal]);
      if (!isNaN(val)) totalValue += val;
    }

    // Accessories
    const fullLine = line.toLowerCase();
    if (/dobradica|dobradiça/i.test(fullLine)) {
      const accDesc = cols[iMat >= 0 ? iMat : 1] || "";
      if (accDesc) compParts.push(`Dobradiças: ${accDesc}`);
    }
    if (/corredica|corrediça/i.test(fullLine)) {
      const accDesc = cols[iMat >= 0 ? iMat : 1] || "";
      if (accDesc) compParts.push(`Corrediças: ${accDesc}`);
    }
  }

  // Fallback: generic regex extraction
  if (!envName || envName === fileName.replace(/\.(txt|csv|xml)$/i, "")) {
    envName = firstMatch(content, [/Ambiente\s*[=:;]\s*(.+)/i], envName);
  }
  if (totalValue === 0) {
    const m = content.match(/(?:Total|Valor\s*Total|TOTAL)\s*[=:;]\s*([\d.,]+)/i);
    if (m) totalValue = parseBRL(m[1]);
  }

  return {
    envName, pieces: pieceCount, total: totalValue || null, software,
    fornecedor, corpo, porta, puxador, modelo,
    complemento: compParts.join(", "),
  };
}

// ── Focco XML ────────────────────────────────────────────────────────
// FoccoLOJAS exports XML with nested <Ambiente>, <Item>, <Material> nodes.

function parseFoccoXml(content: string, fileName: string): ParsedFileResult {
  const software: ParsedFileResult["software"] = "focco";

  const extractTag = (tags: string[], src = content) => {
    for (const tag of tags) {
      const m = src.match(new RegExp(`<${tag}[^>]*>\\s*([^<]+)\\s*<`, "i"));
      if (m) return m[1].trim();
    }
    return "";
  };

  const extractNum = (tags: string[], src = content) => {
    const raw = extractTag(tags, src);
    if (!raw) return 0;
    return parseBRL(raw);
  };

  const envName = extractTag([
    "NomeAmbiente", "Ambiente", "AMBIENTE", "DescricaoAmbiente", "Nome_Ambiente",
    "ambiente", "descAmbiente",
  ]) || fileName.replace(/\.(xml|txt)$/i, "");

  const total = extractNum([
    "ValorTotal", "Total", "TOTAL", "valor_total", "VlrTotal",
    "PrecoTotal", "preco_total", "valorOrcamento",
  ]);

  const pieces = parseInt(extractTag([
    "QtdPecas", "Quantidade", "QTD", "qtd_pecas", "TotalPecas",
    "totalItens", "numPecas",
  ])) || 0;

  // Focco material tags
  const fornecedor = extractTag(["Fornecedor", "Fabricante", "Marca", "fornecedor", "NomeFornecedor"]);

  // Material descriptions — Focco uses <MaterialCorpo>, <MaterialPorta> etc.
  const corpo = extractTag([
    "MaterialCorpo", "Corpo", "Caixa", "Lateral", "EspCorpo",
    "corpo", "materialCaixa", "chapaCaixa",
  ]);
  const porta = extractTag([
    "MaterialPorta", "Porta", "Frente", "Fachada", "EspPorta",
    "porta", "materialFrente", "chapaFrente",
  ]);
  const puxador = extractTag([
    "Puxador", "Puxadores", "puxador", "TipoPuxador", "modeloPuxador",
  ]);
  const complemento = extractTag([
    "Complemento", "Acessorios", "Ferragens", "ferragens",
    "Dobradicas", "Corredicas", "acessorios",
  ]);
  const modelo = extractTag([
    "Modelo", "Linha", "Colecao", "modelo", "linhaProduto", "NomeLinha",
  ]);

  return {
    envName, pieces, total: total || null, software,
    fornecedor, corpo, porta, puxador, complemento, modelo,
  };
}

// ── Gabster TXT/XML ──────────────────────────────────────────────────
// Gabster (via SketchUp) exports structured TXT or XML with
// module descriptions, BOM (bill of materials) with detailed specs.

function parseGabsterFile(content: string, fileName: string): ParsedFileResult {
  const software: ParsedFileResult["software"] = "gabster";
  const isXml = fileName.toLowerCase().endsWith(".xml");

  if (isXml) {
    const base = parseFoccoXml(content, fileName);
    // Gabster-specific XML tags
    const extractTag = (tags: string[]) => {
      for (const tag of tags) {
        const m = content.match(new RegExp(`<${tag}[^>]*>\\s*([^<]+)\\s*<`, "i"));
        if (m) return m[1].trim();
      }
      return "";
    };
    return {
      ...base,
      software,
      fornecedor: base.fornecedor || extractTag(["NomeFabricante", "fabricante", "Industria"]),
      corpo: base.corpo || extractTag(["ChapaCorpo", "EstruturaMaterial", "CorpoDescricao"]),
      porta: base.porta || extractTag(["ChapaPorta", "FrenteMaterial", "PortaDescricao"]),
      puxador: base.puxador || extractTag(["PuxadorModelo", "PuxadorDesc", "HandleModel"]),
      complemento: base.complemento || extractTag(["FerragensDesc", "HingeType", "SlideType"]),
      modelo: base.modelo || extractTag(["LinhaModelo", "ProductLine", "CollectionName"]),
    };
  }

  // Gabster TXT — typically has sections with "---" separators
  // and key: value or key = value pairs
  const envName = firstMatch(content, [
    /(?:Projeto|Ambiente|Nome\s*do\s*Projeto|Room)\s*[=:]\s*(.+)/i,
  ], fileName.replace(/\.(txt|csv)$/i, ""));

  let total: number | null = null;
  const mTotal = content.match(/(?:Total|Valor\s*Total|Total\s*Geral|Grand\s*Total)\s*[=:]\s*([\d.,]+)/i);
  if (mTotal) total = parseBRL(mTotal[1]);

  const fornecedor = firstMatch(content, [
    /(?:Fornecedor|Fabricante|Industria|Marca|Manufacturer)\s*[=:]\s*(.+)/i,
  ]);
  const corpo = firstMatch(content, [
    /(?:Corpo|Caixa|Estrutura|Lateral|Body|Carcass)\s*[=:]\s*(.+)/i,
    /(?:caixa|corpo|estrutura)\s*(\d+\s*mm\s*\w+)/i,
  ]);
  const porta = firstMatch(content, [
    /(?:Porta|Frente|Fachada|Door|Front)\s*[=:]\s*(.+)/i,
    /(?:porta|frente)\s*(\d+\s*mm\s*\w+)/i,
  ]);
  const puxador = firstMatch(content, [
    /(?:Puxador|Puxadores|Handle|Handles)\s*[=:]\s*(.+)/i,
  ]);

  const compParts: string[] = [];
  const mDob = content.match(/(?:Dobradica|Dobradiça|Dobradiças|Hinge)\s*[=:]\s*(.+)/i);
  if (mDob) compParts.push(`Dobradiças: ${mDob[1].trim()}`);
  const mCorr = content.match(/(?:Corrediça|Corrediças|Corredica|Slide|Runner)\s*[=:]\s*(.+)/i);
  if (mCorr) compParts.push(`Corrediças: ${mCorr[1].trim()}`);

  const modelo = firstMatch(content, [
    /(?:Modelo|Linha|Coleção|Collection|Product\s*Line)\s*[=:]\s*(.+)/i,
  ]);

  // Count pieces
  let pieces = 0;
  const mPieces = content.match(/(?:Pecas|Peças|Qtd\s*Pecas|Total\s*Pecas|Pieces|Qty)\s*[=:]\s*(\d+)/i);
  if (mPieces) pieces = parseInt(mPieces[1]);

  return { envName, pieces, total, software, fornecedor, corpo, porta, puxador, complemento: compParts.join(", "), modelo };
}

// ── Generic TXT (fallback) ───────────────────────────────────────────

function parseGenericTxt(content: string, fileName: string): ParsedFileResult {
  let total: number | null = null;
  let envName = fileName.replace(/\.(txt|csv|xml)$/i, "");
  let pieces = 0;
  let fornecedor = "";
  let corpo = "";
  let porta = "";
  let puxador = "";
  let complemento = "";
  let modelo = "";

  // Total value — multiple patterns
  const totalPatterns = [
    /Total\s*(?:Geral|do\s*Ambiente|do\s*Projeto)?\s*[=:]\s*R?\$?\s*([\d.,]+)/i,
    /(?:Valor|Preço)\s*Total\s*[=:]\s*R?\$?\s*([\d.,]+)/i,
    /Total\s*=\s*([\d.,]+)/i,
  ];
  for (const re of totalPatterns) {
    const m = content.match(re);
    if (m) { total = parseBRL(m[1]); break; }
  }

  envName = firstMatch(content, [
    /Ambiente\s*[=:]\s*(.+)/i,
    /Nome\s*(?:do\s*)?Ambiente\s*[=:]\s*(.+)/i,
  ], envName);

  fornecedor = firstMatch(content, [
    /(?:Fornecedor|Fabricante|Marca|Industria)\s*[=:]\s*(.+)/i,
  ]);
  corpo = firstMatch(content, [
    /(?:Corpo|Caixa|Lateral|Estrutura)\s*[=:]\s*(.+)/i,
    /(?:caixa|corpo|lateral)\s*(\d+)\s*mm\s*(\w+)/i,
  ]);
  porta = firstMatch(content, [
    /(?:Porta|Frente|Fachada)\s*[=:]\s*(.+)/i,
    /(?:porta|frente)\s*(\d+)\s*mm\s*(\w+)/i,
  ]);
  puxador = firstMatch(content, [/(?:Puxador|Puxadores)\s*[=:]\s*(.+)/i]);
  modelo = firstMatch(content, [/(?:Modelo|Linha|Coleção)\s*[=:]\s*(.+)/i]);

  const compParts: string[] = [];
  const mDob = content.match(/(?:Dobradica|Dobradiça|Dobradiças)\s*[=:]\s*(.+)/i);
  if (mDob) compParts.push(`Dobradiças: ${mDob[1].trim()}`);
  const mCorr = content.match(/(?:Corrediça|Corrediças|Corredica)\s*[=:]\s*(.+)/i);
  if (mCorr) compParts.push(`Corrediças: ${mCorr[1].trim()}`);
  complemento = compParts.join(", ");

  // Inline patterns for body/door
  if (!corpo) {
    const m = content.match(/(?:caixa|corpo|lateral)\s*(\d+)\s*mm\s*(\w+)/i);
    if (m) corpo = `${m[1]}mm ${m[2]}`;
  }
  if (!porta) {
    const m = content.match(/(?:porta|frente)\s*(\d+)\s*mm\s*(\w+)/i);
    if (m) porta = `${m[1]}mm ${m[2]}`;
  }

  // Count pieces
  const lines = content.split(/\r?\n/).filter(l => l.trim());
  let itemCount = 0;
  let foundExplicit = false;

  const matchPieces = content.match(/(?:Pecas|Peças|Quantidade\s*(?:de\s*)?(?:Pe[çc]as)?|Total\s*de\s*Pe[çc]as|Qtd\s*(?:Pe[çc]as)?)\s*[=:]\s*(\d+)/i);
  if (matchPieces) { itemCount = parseInt(matchPieces[1]); foundExplicit = true; }

  if (!foundExplicit) {
    const sep = content.includes("\t") ? /\t/ : content.includes(";") ? /;/ : content.includes("|") ? /\|/ : null;
    for (const line of lines) {
      const trimmed = line.trim();
      if (/^(Total|Ambiente|Pecas|Peças|Quantidade|Descri|Nome|Projeto|Observ|Data|Vers|---|\*|#|=)/i.test(trimmed)) continue;
      if (trimmed.length < 3 || /^\d{1,2}\/\d{1,2}\/\d{2,4}$/.test(trimmed) || /^[\d.,]+$/.test(trimmed)) continue;
      if (sep) {
        const cols = trimmed.split(sep);
        if (cols.length >= 2) { const qty = parseInt(cols[0].trim()); if (!isNaN(qty) && qty > 0 && qty < 10000) itemCount += qty; }
      } else {
        const lq = trimmed.match(/^(\d+)\s+\S/);
        if (lq) { const qty = parseInt(lq[1]); if (qty > 0 && qty < 10000) itemCount += qty; }
      }
    }
  }

  pieces = itemCount;
  return { envName, pieces, total, software: "generico", fornecedor, corpo, porta, puxador, complemento, modelo };
}

// ── Generic XML (fallback) ───────────────────────────────────────────

function parseGenericXml(content: string, fileName: string): ParsedFileResult {
  const extractTag = (tags: string[]) => {
    for (const tag of tags) {
      const m = content.match(new RegExp(`<${tag}[^>]*>\\s*([^<]+)\\s*<`, "i"));
      if (m) return m[1].trim();
    }
    return "";
  };

  const envName = extractTag([
    "NomeAmbiente", "Ambiente", "AMBIENTE", "DescricaoAmbiente",
    "ambiente", "Nome_Ambiente", "descAmbiente", "Room", "ProjectName",
  ]) || fileName.replace(/\.(xml|txt)$/i, "");

  let total: number | null = null;
  const rawTotal = extractTag([
    "ValorTotal", "Total", "TOTAL", "valor_total", "VlrTotal",
    "PrecoTotal", "preco_total", "GrandTotal", "TotalPrice",
  ]);
  if (rawTotal) total = parseBRL(rawTotal);

  const rawPieces = extractTag([
    "QtdPecas", "Quantidade", "QTD", "qtd_pecas", "TotalPecas",
    "totalItens", "numPecas", "PieceCount",
  ]);
  const pieces = parseInt(rawPieces) || 0;

  return {
    envName, pieces, total,
    software: "generico",
    fornecedor: extractTag(["Fornecedor", "Fabricante", "Marca", "fornecedor", "NomeFornecedor", "Manufacturer"]),
    corpo: extractTag(["MaterialCorpo", "Corpo", "Caixa", "Lateral", "EspCorpo", "corpo", "Body", "Carcass"]),
    porta: extractTag(["MaterialPorta", "Porta", "Frente", "Fachada", "EspPorta", "porta", "Door", "Front"]),
    puxador: extractTag(["Puxador", "Puxadores", "puxador", "TipoPuxador", "Handle"]),
    complemento: extractTag(["Complemento", "Acessorios", "Ferragens", "ferragens", "Accessories"]),
    modelo: extractTag(["Modelo", "Linha", "Colecao", "modelo", "linhaProduto", "NomeLinha", "ProductLine"]),
  };
}

// ── Public API ───────────────────────────────────────────────────────

export function parseTxtFile(content: string, fileName: string): ParsedFileResult {
  const sw = detectSoftware(content, fileName);
  if (sw === "promob") return parsePromobTxt(content, fileName);
  if (sw === "gabster") return parseGabsterFile(content, fileName);
  return parseGenericTxt(content, fileName);
}

export function parseXmlFile(content: string, fileName: string): ParsedFileResult {
  const sw = detectSoftware(content, fileName);
  if (sw === "focco") return parseFoccoXml(content, fileName);
  if (sw === "gabster") return parseGabsterFile(content, fileName);
  return parseGenericXml(content, fileName);
}

export function parseProjectFile(content: string, fileName: string): ParsedFileResult {
  if (fileName.toLowerCase().endsWith(".xml")) {
    return parseXmlFile(content, fileName);
  }
  return parseTxtFile(content, fileName);
}
