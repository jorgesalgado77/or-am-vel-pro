/**
 * Service for importing TXT/XML project files in the simulator.
 * Supports: Promob, Focco, Gabster, and generic formats.
 * Extracts environment name, piece count, total value, material details, and individual modules.
 */

/** Module type classification */
export type ModuleType = "modulo" | "porta" | "frente" | "gaveta" | "painel" | "acessorio";

/** Individual parsed module from a Promob file */
export interface ParsedModule {
  id: string;
  code: string;
  description: string;
  type: ModuleType;
  quantity: number;
  unitPrice: number;
  totalPrice: number;
  dimensions: string;
  finish: string;
  supplier: string;
  category: string;
  group: string;
  /** Dedicated hardware/detail fields */
  doorType?: string;
  hingeModel?: string;
  slideModel?: string;
  boxColor?: string;
  doorColor?: string;
  thickness?: string;
}

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
  fileFormat?: "XML" | "TXT" | "PROMOB";
  modules?: ParsedModule[];
}

// ── Color / Material Normalization ───────────────────────────────────

const NORMALIZATION_MAP: Array<[RegExp, string]> = [
  [/^\s*BRISA\s*$/i, "Brisa"],
  [/^\s*NOG(?:UEIRA)?\s*AVE(?:NA)?\s*$/i, "Nogueira Avena"],
  [/^\s*BRANCO?\s*AUR(?:A)?\s*$/i, "Branco Aura"],
  [/^\s*BRANCO?\s*(?:TX|TEXTURIZADO)?\s*$/i, "Branco"],
  [/^\s*PRE(?:TO)?\s*FOS(?:CO)?\s*$/i, "Preto Fosco"],
  [/^\s*CINZA\s*LISO\s*FOSCO\s*$/i, "Cinza Liso Fosco"],
  [/^\s*GRAFITE\s*$/i, "Grafite"],
  [/^\s*CARVALHO\s*$/i, "Carvalho"],
  [/^\s*AMENDOA\s*$/i, "Amêndoa"],
  [/^\s*FREIJO\s*$/i, "Freijó"],
];

export function normalizeFinish(raw: string): string {
  if (!raw) return "";
  const trimmed = raw.trim();
  for (const [pattern, normalized] of NORMALIZATION_MAP) {
    if (pattern.test(trimmed)) return normalized;
  }
  // Title case fallback
  return trimmed
    .toLowerCase()
    .replace(/(?:^|\s)\S/g, (c) => c.toUpperCase());
}

/** Classify a module description into a type */
function classifyModuleType(description: string, code?: string): ModuleType {
  const d = description.toUpperCase();
  if (/^ARMARIO\b|^BALCAO\b/.test(d)) return "modulo";
  if (/^PORTA\b/.test(d)) return "porta";
  if (/^FRENTE\b/.test(d)) return "frente";
  if (/^GAVETA\b/.test(d)) return "gaveta";
  if (/^PAINEL\b|^MARCO\b/.test(d)) return "painel";
  // Accessories: codes starting with 850, or typical hardware items
  if (/^85\d/.test(code || "") || /DOBRADICA|PARAFUSO|PUXADOR|SELANTE|TAPA\s*FURO|SUPORTE|FECHO|ATENUADOR|ARAMADO|KIT\s|FITA\s*BORDA|CANTONEIRA|BUCHA|ETIQUETA|FORRACAO|DIVISOR|ROLO|BATENTE|PRATELEIRA/i.test(d)) return "acessorio";
  return "modulo";
}

// ── Helpers ──────────────────────────────────────────────────────────

/** Parse a number that may be in Brazilian (1.234,56) or US (1,234.56 / 1234.56) format */
function parseBRL(raw: string): number {
  if (!raw) return NaN;
  const cleaned = raw.trim();

  // Detect format by looking at the last separator
  const lastComma = cleaned.lastIndexOf(",");
  const lastDot = cleaned.lastIndexOf(".");

  if (lastComma > lastDot) {
    // Brazilian format: 1.234,56 or 1234,56 — comma is decimal
    return parseFloat(cleaned.replace(/\./g, "").replace(",", "."));
  } else if (lastDot > lastComma) {
    // Could be US format (1,234.56) or BR without decimals (636.175)
    const afterDot = cleaned.slice(lastDot + 1);
    if (afterDot.length === 3 && lastComma === -1 && cleaned.indexOf(".") === lastDot) {
      const asBR = parseFloat(cleaned.replace(/\./g, ""));
      const asUS = parseFloat(cleaned);
      const beforeDot = cleaned.slice(0, lastDot).replace(/,/g, "");
      if (parseInt(beforeDot) <= 999 && asBR > 50000) {
        return asUS;
      }
      return asBR;
    }
    return parseFloat(cleaned.replace(/,/g, ""));
  } else if (lastComma >= 0) {
    return parseFloat(cleaned.replace(",", "."));
  }
  return parseFloat(cleaned);
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
  // Promob fixed-width TXT: has "ID do Projeto" header + item lines with 5+ digit codes
  if (/ID do Projeto/i.test(content) && /^\s*\d+\s+[\d.]+\s+\d{5,}\s+\S/m.test(content)) return "promob";
  if (lower.includes("focco") || lower.includes("foccolojas") || lower.includes("foccosystem")) return "focco";
  if (lower.includes("gabster") || lower.includes("powerarq") || lower.includes("sketchup")) return "gabster";
  return "generico";
}

/** Extract an XML attribute value */
function extractAttr(tag: string, attr: string, src: string): string {
  const re = new RegExp(`<${tag}[^>]*\\s${attr}="([^"]*)"`, "i");
  const m = src.match(re);
  return m?.[1]?.trim() || "";
}

// ── Promob TXT ───────────────────────────────────────────────────────
// Promob exports fixed-width TXT or CSV/TXT lists with delimiters (tab or semicolon).

function parsePromobTxt(content: string, fileName: string): ParsedFileResult {
  const lines = content.split(/\r?\n/).filter(l => l.trim());
  const software: ParsedFileResult["software"] = "promob";

  // Detect separator
  const sep = content.includes("\t") ? "\t" : ";";
  const headerLine = lines.find(l => /ambiente|modulo|módulo|peca|peça/i.test(l));

  let envName = fileName.replace(/\.(txt|csv|xml|promob)$/i, "");
  let totalValue = 0;
  let pieceCount = 0;
  let fornecedor = "";
  let corpo = "";
  let porta = "";
  let puxador = "";
  let modelo = "";
  const compParts: string[] = [];
  const modules: ParsedModule[] = [];

  // Promob TXT fixed-width format detection:
  // Lines like: "1     3       820227748    ARMARIO L1000 H700 P530 BRISA     349.48   1048.43  1000 x 700 x 530"
  const isFixedWidth = !headerLine && lines.some(l => /^\s*\d+\s+[\d.]+\s+\d{5,}\s+\S/.test(l));

  if (isFixedWidth) {
    // Extract environment name from header
    const clienteMatch = content.match(/Cliente\s*=\s*(.+)/i);
    if (clienteMatch && clienteMatch[1].trim()) envName = clienteMatch[1].trim();

    // Extract total
    const totalMatch = content.match(/Total\s*=\s*([\d.,]+)/i);
    if (totalMatch) totalValue = parseBRL(totalMatch[1]);

    // Parse each item line
    const itemRegex = /^\s*(\d+)\s+([\d.]+)\s+(\d{5,}\w*)\s+(.+?)\s{2,}([\d.,]+)\s+([\d.,]+)\s+([\d\s]+x[\d\s,]+x[\d\s,]+)/;

    for (const line of lines) {
      const m = line.match(itemRegex);
      if (!m) continue;

      const qty = parseFloat(m[2]);
      const code = m[3].trim();
      const desc = m[4].trim();
      const unitPrice = parseBRL(m[5]);
      const totalPrice = parseBRL(m[6]);
      const dimensions = m[7].trim();

      // Extract finish from description (last word(s))
      const finishMatch = desc.match(/\b(BRISA|NOGUEIRA\s*AVENA?|NOG(?:UEIRA)?\s*\w*|BRANCO?\s*\w*|PRETO\s*FOSCO|CINZA\s*\w*)\s*(?:\[\[.*)?$/i);
      const finish = finishMatch ? normalizeFinish(finishMatch[1]) : "";

      const moduleType = classifyModuleType(desc, code);

      modules.push({
        id: crypto.randomUUID(),
        code,
        description: desc,
        type: moduleType,
        quantity: Math.max(1, Math.round(qty)),
        unitPrice: isNaN(unitPrice) ? 0 : unitPrice,
        totalPrice: isNaN(totalPrice) ? 0 : totalPrice,
        dimensions,
        finish,
        supplier: "",
        category: "",
        group: "",
      });

      pieceCount += Math.max(1, Math.round(qty));
    }

    // Derive tech fields from modules
    const corpoModule = modules.find(m => m.type === "modulo");
    if (corpoModule) corpo = corpoModule.finish || "";

    const portaModule = modules.find(m => m.type === "porta" || m.type === "frente");
    if (portaModule) porta = portaModule.finish || "";

    const puxadorModule = modules.find(m => /PUXADOR/i.test(m.description));
    if (puxadorModule) puxador = puxadorModule.description;

    const dobradicaModule = modules.find(m => /DOBRADICA/i.test(m.description));
    if (dobradicaModule) compParts.push(`Dobradiças: ${dobradicaModule.description}`);
    const corredicaModule = modules.find(m => /TRILHO\s*TELESCOP|CORREDIC/i.test(m.description));
    if (corredicaModule) compParts.push(`Corrediças: ${corredicaModule.description}`);

    return {
      envName, pieces: pieceCount, total: totalValue || null, software,
      fornecedor, corpo, porta, puxador, modelo,
      complemento: compParts.join(", "),
      modules,
    };
  }

  // CSV/delimited format (original logic)
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
  const iTipo = colIdx(["tipo", "descricao", "desc", "componente", "modulo"]);

  const dataLines = headerLine ? lines.slice(lines.indexOf(headerLine) + 1) : lines;

  for (const line of dataLines) {
    const cols = line.split(sep).map(c => c.trim());
    if (cols.length < 2) continue;

    if (iAmb >= 0 && cols[iAmb] && !envName) envName = cols[iAmb];
    if (iForn >= 0 && cols[iForn] && !fornecedor) fornecedor = cols[iForn];
    if (iPux >= 0 && cols[iPux] && !puxador) puxador = cols[iPux];
    if (iModelo >= 0 && cols[iModelo] && !modelo) modelo = cols[iModelo];

    const mat = iMat >= 0 ? (cols[iMat] || "") : "";
    const tipo = iTipo >= 0 ? (cols[iTipo] || "") : "";
    const fullLine = line.toLowerCase();
    const isCorpo = /caixa|corpo|lateral|estrutura|base|tampo|fundo|prateleira/i.test(mat) ||
                    /caixa|corpo|lateral|estrutura/i.test(tipo) ||
                    (!mat && !tipo && /\bcaixa\b|\bcorpo\b|\blateral\b|\bestrutura\b/i.test(fullLine));
    const isPorta = /porta|frente|fachada|gaveta/i.test(mat) ||
                    /porta|frente|fachada/i.test(tipo) ||
                    (!mat && !tipo && /\bporta\b|\bfrente\b|\bfachada\b/i.test(fullLine));

    if (iEsp >= 0) {
      const esp = cols[iEsp] || "";
      const cor = iCor >= 0 ? cols[iCor] || "" : "";
      const desc = cor ? `${esp}mm ${cor}`.trim() : (mat ? `${esp}mm ${mat}`.trim() : `${esp}mm`);
      if (!corpo && isCorpo && esp) corpo = desc;
      if (!porta && isPorta && esp) porta = desc;
    } else if (iMat >= 0) {
      if (!corpo && isCorpo && mat) corpo = mat;
      if (!porta && isPorta && mat) porta = mat;
    }

    if (iQtd >= 0) {
      const qty = parseInt(cols[iQtd]);
      if (!isNaN(qty) && qty > 0) pieceCount += qty;
    }
    if (iVal >= 0 && cols[iVal]) {
      const val = parseBRL(cols[iVal]);
      if (!isNaN(val)) totalValue += val;
    }

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
  if (!fornecedor) {
    fornecedor = firstMatch(content, [/(?:Fornecedor|Fabricante|Marca|Industria)\s*[=:;]\s*(.+)/i]);
  }
  if (!corpo) {
    corpo = firstMatch(content, [
      /(?:Corpo|Caixa|Lateral|Estrutura)\s*[=:;]\s*(.+)/i,
      /(?:caixa|corpo|lateral|estrutura)\s*(\d+\s*mm\s*[\w\s]*)/i,
      /(?:Chapa\s*(?:do\s*)?Corpo|Chapa\s*Caixa)\s*[=:;]\s*(.+)/i,
    ]);
  }
  if (!porta) {
    porta = firstMatch(content, [
      /(?:Porta|Frente|Fachada)\s*[=:;]\s*(.+)/i,
      /(?:porta|frente|fachada)\s*(\d+\s*mm\s*[\w\s]*)/i,
      /(?:Chapa\s*(?:da\s*)?Porta|Chapa\s*Frente)\s*[=:;]\s*(.+)/i,
    ]);
  }
  if (!puxador) {
    puxador = firstMatch(content, [
      /(?:Puxador|Puxadores|Tipo\s*(?:de\s*)?Puxador)\s*[=:;]\s*(.+)/i,
      /(?:puxador|handle)\s*[-–]\s*(.+)/i,
    ]);
  }
  if (!modelo) {
    modelo = firstMatch(content, [/(?:Modelo|Linha|Coleção|Colecao)\s*[=:;]\s*(.+)/i]);
  }
  if (compParts.length === 0) {
    const mDob = content.match(/(?:Dobradica|Dobradiça|Dobradiças)\s*[=:;]\s*(.+)/i);
    if (mDob) compParts.push(`Dobradiças: ${mDob[1].trim()}`);
    const mCorr = content.match(/(?:Corrediça|Corrediças|Corredica)\s*[=:;]\s*(.+)/i);
    if (mCorr) compParts.push(`Corrediças: ${mCorr[1].trim()}`);
  }

  // Apply normalization
  corpo = normalizeFinish(corpo);
  porta = normalizeFinish(porta);

  return {
    envName, pieces: pieceCount, total: totalValue || null, software,
    fornecedor, corpo, porta, puxador, modelo,
    complemento: compParts.join(", "),
    modules: modules.length > 0 ? modules : undefined,
  };
}

// ── Promob XML ───────────────────────────────────────────────────────
// Promob Criare exports rich XML with <AMBIENTS> > <AMBIENT> > <CATEGORIES> > <ITEM>

/** Parse items from a single AMBIENT block (or full content if no AMBIENT tags) */
function parsePromobXmlBlock(blockContent: string, ambientDescription: string, fileName: string, globalFornecedor: string): ParsedFileResult {
  const software: ParsedFileResult["software"] = "promob";
  const modules: ParsedModule[] = [];
  let fornecedor = globalFornecedor;

  const envName = ambientDescription || fileName.replace(/\.(xml|promob)$/i, "");

  // Extract total price for this block
  let total: number | null = null;
  const totalPricesMatch = blockContent.match(/<TOTALPRICES\s+TABLE="([\d.]+)">/);
  if (totalPricesMatch) {
    const orderMatch = blockContent.match(/<ORDER\s+VALUE="([\d.]+)">/);
    if (orderMatch) total = parseBRL(orderMatch[1]);
    else total = parseBRL(totalPricesMatch[1]);
  }

  // Extract all ITEM elements
  const itemRegex = /<ITEM\s([^>]+)>/g;
  let itemMatch;
  let pieceCount = 0;

  while ((itemMatch = itemRegex.exec(blockContent)) !== null) {
    const attrs = itemMatch[1];
    const getAttr = (name: string): string => {
      const m = attrs.match(new RegExp(`${name}="([^"]*)"`));
      return m?.[1]?.trim() || "";
    };

    const description = getAttr("DESCRIPTION");
    const reference = getAttr("REFERENCE");
    const quantity = parseInt(getAttr("QUANTITY")) || 1;
    const dimensions = getAttr("TEXTDIMENSION");
    const family = getAttr("FAMILY");
    const group = getAttr("GROUP");
    const isComponent = getAttr("COMPONENT") === "Y";

    if (isComponent) continue;

    const itemEndIdx = blockContent.indexOf("</ITEM>", itemMatch.index);
    const itemContent = blockContent.slice(itemMatch.index, itemEndIdx > 0 ? itemEndIdx : itemMatch.index + 5000);

    let unitPrice = 0;
    let totalPrice = 0;
    const priceMatch = itemContent.match(/<PRICE\s+TABLE="([\d.]+)"\s+UNIT="([\d.]+)"\s+TOTAL="([\d.]+)"/);
    if (priceMatch) {
      unitPrice = parseBRL(priceMatch[2]);
      totalPrice = parseBRL(priceMatch[3]);
    }
    const orderUnitMatch = itemContent.match(/<ORDER\s+UNIT="([\d.]+)"\s+TOTAL="([\d.]+)"/);
    if (orderUnitMatch) {
      unitPrice = parseBRL(orderUnitMatch[1]);
      totalPrice = parseBRL(orderUnitMatch[2]);
    }

    let acab = "";
    const acabMatch = itemContent.match(/<ACAB\s+REFERENCE="([^"]+)"/);
    if (acabMatch) acab = acabMatch[1].trim();

    let itemSupplier = "";
    const itemFornMatch = itemContent.match(/<FORNECEDOR\s+REFERENCE="([^"]+)"/);
    if (itemFornMatch) itemSupplier = itemFornMatch[1].trim();
    if (!fornecedor && itemSupplier) fornecedor = itemSupplier;

    modules.push({
      id: crypto.randomUUID(),
      code: reference,
      description,
      type: classifyModuleType(description, reference),
      quantity,
      unitPrice: isNaN(unitPrice) ? 0 : unitPrice,
      totalPrice: isNaN(totalPrice) ? 0 : totalPrice,
      dimensions,
      finish: normalizeFinish(acab),
      supplier: itemSupplier || fornecedor,
      category: family,
      group,
    });
    pieceCount += quantity;
  }

  // If no per-block total, sum module totals
  if (total === null && modules.length > 0) {
    total = modules.reduce((s, m) => s + m.totalPrice, 0);
  }

  // Derive tech fields
  let corpo = "";
  let porta = "";
  let puxador = "";
  let complemento = "";
  let modelo = "";

  const firstModulo = modules.find(m => m.type === "modulo");
  if (firstModulo) corpo = firstModulo.finish;

  const firstPorta = modules.find(m => m.type === "porta" || m.type === "frente");
  if (firstPorta) porta = firstPorta.finish;

  const puxadorMatch = blockContent.match(/<MODELINFORMATION\s+DESCRIPTION="Puxadores"[^>]*>[\s\S]*?<MODELTYPEINFORMATION\s+DESCRIPTION="([^"]+)"/);
  if (puxadorMatch) puxador = puxadorMatch[1].split("\\")[0].trim();
  if (!puxador) {
    const puxModule = modules.find(m => /PUXADOR/i.test(m.description));
    if (puxModule) puxador = puxModule.description;
  }

  const dobMatch = blockContent.match(/<MODELINFORMATION\s+DESCRIPTION="Dobradiças"[^>]*>[\s\S]*?<MODELTYPEINFORMATION\s+DESCRIPTION="([^"]+)"/);
  if (dobMatch) complemento = `Dobradiças: ${dobMatch[1].trim()}`;

  const sistemaMatch = blockContent.match(/<ABOUTPROMOB[^>]*\sSYSTEM="([^"]+)"/);
  if (sistemaMatch) modelo = sistemaMatch[1].trim();

  return {
    envName, pieces: pieceCount, total, software,
    fornecedor, corpo, porta, puxador, complemento, modelo,
    modules,
  };
}

/** Parse a Promob XML — returns single result (first ambient or merged) */
function parsePromobXml(content: string, fileName: string): ParsedFileResult {
  const results = parsePromobXmlMulti(content, fileName);
  if (results.length === 1) return results[0];
  // Fallback: return first (for backward compat with single-call API)
  return results[0] || {
    envName: fileName.replace(/\.(xml|promob)$/i, ""),
    pieces: 0, total: null, software: "promob" as const,
  };
}

/** Parse a Promob XML — returns one result PER AMBIENT element */
function parsePromobXmlMulti(content: string, fileName: string): ParsedFileResult[] {
  // Detect global supplier
  let globalFornecedor = "";
  const fornecedorMatch = content.match(/<FORNECEDOR\s+REFERENCE="([^"]+)"/i);
  if (fornecedorMatch) globalFornecedor = fornecedorMatch[1].trim();

  // Global modelo from ABOUTPROMOB
  const sistemaMatch = content.match(/<ABOUTPROMOB[^>]*\sSYSTEM="([^"]+)"/);
  const globalModelo = sistemaMatch ? sistemaMatch[1].trim() : "";

  // Split by AMBIENT blocks
  const ambientRegex = /<AMBIENT\s([^>]*)>([\s\S]*?)(?=<AMBIENT\s|<\/AMBIENTS>|$)/gi;
  const blocks: Array<{ description: string; content: string }> = [];
  let m;
  while ((m = ambientRegex.exec(content)) !== null) {
    const descMatch = m[1].match(/DESCRIPTION="([^"]+)"/);
    blocks.push({
      description: descMatch ? descMatch[1].trim() : "",
      content: m[0],
    });
  }

  // If no AMBIENT tags found, parse whole content as single block
  if (blocks.length === 0) {
    const envName = firstMatch(content, [
      /DESCRIPTION="([^"]+)"/i,
      /<DATA\s+ID="Environment"\s+VALUE="([^"]+)"/i,
    ], fileName.replace(/\.(xml|promob)$/i, ""));
    const result = parsePromobXmlBlock(content, envName, fileName, globalFornecedor);
    if (!result.modelo && globalModelo) result.modelo = globalModelo;
    return [result];
  }

  // Parse each AMBIENT block separately
  const results: ParsedFileResult[] = [];
  for (const block of blocks) {
    const result = parsePromobXmlBlock(block.content, block.description, fileName, globalFornecedor);
    if (!result.modelo && globalModelo) result.modelo = globalModelo;
    // Inherit global fornecedor if not found per block
    if (!result.fornecedor && globalFornecedor) result.fornecedor = globalFornecedor;
    results.push(result);
  }

  // If total wasn't found per-block, try global total and distribute
  const globalTotalMatch = content.match(/<TOTALPRICES\s+TABLE="([\d.]+)">/);
  if (globalTotalMatch) {
    const globalOrderMatch = content.match(/<ORDER\s+VALUE="([\d.]+)">/);
    const globalTotal = globalOrderMatch ? parseBRL(globalOrderMatch[1]) : parseBRL(globalTotalMatch[1]);
    const blockSum = results.reduce((s, r) => s + (r.total || 0), 0);
    // If blocks have no totals but global does, distribute proportionally by module totals
    if (blockSum === 0 && globalTotal > 0 && results.length > 0) {
      const moduleTotals = results.map(r => r.modules?.reduce((s2, mod) => s2 + mod.totalPrice, 0) || 0);
      const moduleSum = moduleTotals.reduce((a, b) => a + b, 0);
      results.forEach((r, i) => {
        r.total = moduleSum > 0 ? (moduleTotals[i] / moduleSum) * globalTotal : globalTotal / results.length;
      });
    }
  }

  return results;
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

  const fornecedor = extractTag(["Fornecedor", "Fabricante", "Marca", "fornecedor", "NomeFornecedor"]);
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

function parseGabsterFile(content: string, fileName: string): ParsedFileResult {
  const software: ParsedFileResult["software"] = "gabster";
  const isXml = fileName.toLowerCase().endsWith(".xml");

  if (isXml) {
    const base = parseFoccoXml(content, fileName);
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

  fornecedor = firstMatch(content, [/(?:Fornecedor|Fabricante|Marca|Industria)\s*[=:]\s*(.+)/i]);
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

  if (!corpo) {
    const m = content.match(/(?:caixa|corpo|lateral)\s*(\d+)\s*mm\s*(\w+)/i);
    if (m) corpo = `${m[1]}mm ${m[2]}`;
  }
  if (!porta) {
    const m = content.match(/(?:porta|frente)\s*(\d+)\s*mm\s*(\w+)/i);
    if (m) porta = `${m[1]}mm ${m[2]}`;
  }

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
  if (sw === "promob") return parsePromobXml(content, fileName);
  if (sw === "focco") return parseFoccoXml(content, fileName);
  if (sw === "gabster") return parseGabsterFile(content, fileName);
  return parseGenericXml(content, fileName);
}

export function parseProjectFile(content: string, fileName: string): ParsedFileResult {
  const lower = fileName.toLowerCase();
  if (lower.endsWith(".xml")) {
    const result = parseXmlFile(content, fileName);
    return { ...result, fileFormat: "XML" };
  }
  if (lower.endsWith(".promob")) {
    const trimmed = content.trimStart();
    if (trimmed.startsWith("<?xml") || trimmed.startsWith("<")) {
      const result = parseXmlFile(content, fileName);
      return { ...result, fileFormat: "PROMOB" };
    }
    const result = parsePromobTxt(content, fileName);
    return { ...result, fileFormat: "PROMOB" };
  }
  const result = parseTxtFile(content, fileName);
  return { ...result, fileFormat: "TXT" };
}

/**
 * Multi-ambient parser: returns one ParsedFileResult per AMBIENT found in the file.
 * For non-Promob XML or TXT files, returns a single-element array.
 */
export function parseProjectFileMulti(content: string, fileName: string): ParsedFileResult[] {
  const lower = fileName.toLowerCase();
  const sw = detectSoftware(content, fileName);

  if ((lower.endsWith(".xml") || (lower.endsWith(".promob") && (content.trimStart().startsWith("<?xml") || content.trimStart().startsWith("<")))) && sw === "promob") {
    const fmt: ParsedFileResult["fileFormat"] = lower.endsWith(".promob") ? "PROMOB" : "XML";
    return parsePromobXmlMulti(content, fileName).map(r => ({ ...r, fileFormat: fmt }));
  }

  // Fallback: single result
  return [parseProjectFile(content, fileName)];
}
