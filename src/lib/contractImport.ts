/**
 * Contract Import — orchestrates PDF/DOCX/XLSX import
 * 
 * Heavy logic has been extracted to:
 * - src/lib/contract/pdfExtractor.ts  (text extraction, line grouping, table detection, canvas render)
 * - src/lib/contract/pdfRenderer.ts   (HTML rendering)
 * - src/lib/contract/importUtils.ts   (sanitization, utilities)
 * - src/lib/contract/types.ts         (shared types)
 */

import { supabase } from "@/lib/supabaseClient";
import {
  pdfjsLib,
  extractTextItems,
  groupTextLines,
  detectTableBlocks,
  renderPageToBase64,
  buildStructureBlocks,
  extractEmbeddedImages,
} from "./contract/pdfExtractor";
import { buildPixelPerfectPageHtml } from "./contract/pdfRenderer";
import { sanitizeImportedHtml, normalizeSuggestedName, arrayBufferToBase64 } from "./contract/importUtils";
import type { ImportedContractContent, FieldReplacement, PdfTextItem, StructureBlock } from "./contract/types";

export type ImportProgressCallback = (info: { current: number; total: number; label: string }) => void;

// Re-export public types
export type { ImportedContractContent, FieldReplacement };

// Re-export utility functions used by other files
export { sanitizeImportedHtml } from "./contract/importUtils";

// ── OCR fallback ──

const ocrPdfViaEdgeFunction = async (arrayBuffer: ArrayBuffer): Promise<string> => {
  const base64 = arrayBufferToBase64(arrayBuffer);
  const { data, error } = await supabase.functions.invoke("contract-ocr", {
    body: { pdfBase64: base64 },
  });
  if (error) throw new Error("Erro no OCR: " + (error.message || "falha na requisição"));
  if (data?.error) throw new Error(data.error);
  return data?.html || "";
};

// ── Field detection patterns (regex-based) ──

const FIELD_PATTERNS: Array<{ pattern: RegExp; variable: string; label: string }> = [
  // Identity documents
  { pattern: /\b\d{3}\.?\d{3}\.?\d{3}-?\d{2}\b/g, variable: "{{cpf_cliente}}", label: "CPF" },
  { pattern: /\b\d{2}\.?\d{3}\.?\d{3}\/?\d{4}-?\d{2}\b/g, variable: "{{cpf_cliente}}", label: "CNPJ" },
  { pattern: /(?:RG|identidade)[:\s]*[\d.\-\/]+/gi, variable: "{{rg_insc_estadual}}", label: "RG" },
  { pattern: /(?:inscri[çc][ãa]o\s*estadual)[:\s]*[\d.\-\/]+/gi, variable: "{{rg_insc_estadual}}", label: "Insc. Estadual" },

  // Financial
  { pattern: /R\$\s*[\d.,]+/g, variable: "{{valor_final}}", label: "Valor" },
  { pattern: /\b(\d{1,3})\s*(?:parcelas?|x\s*de|vezes)\b/gi, variable: "{{parcelas}}", label: "Parcelas" },
  { pattern: /(?:entrada|sinal)[:\s]*R\$\s*[\d.,]+/gi, variable: "{{valor_entrada}}", label: "Entrada" },
  { pattern: /(?:forma\s*(?:de\s*)?pagamento)[:\s]+[^\n<]{3,40}/gi, variable: "{{forma_pagamento}}", label: "Forma Pgto" },

  // Dates
  { pattern: /\b\d{2}\/\d{2}\/\d{4}\b/g, variable: "{{data_atual}}", label: "Data" },
  { pattern: /\b\d{4}-\d{2}-\d{2}\b/g, variable: "{{data_atual}}", label: "Data ISO" },
  { pattern: /(?:data\s*(?:de\s*)?nascimento)[:\s]*\d{2}\/\d{2}\/\d{4}/gi, variable: "{{data_nascimento}}", label: "Dt. Nascimento" },

  // Contact
  { pattern: /(?:(?:\(\d{2}\)\s?)|(?:\d{2}\s?))?\d{4,5}-?\d{4}\b/g, variable: "{{telefone_cliente}}", label: "Telefone" },
  { pattern: /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g, variable: "{{email_cliente}}", label: "E-mail" },

  // Names & roles
  { pattern: /(?:nome[:\s]*(?:do\s+)?(?:cliente|contratante|comprador))[:\s]+[A-ZÀ-Ú][a-zà-ú]+(?: [A-ZÀ-Ú][a-zà-ú]+){1,5}/gi, variable: "{{nome_cliente}}", label: "Nome do cliente" },
  { pattern: /(?:projetista|designer|resp(?:onsável)?(?:\s*t[eé]cnico)?)[:\s]+[A-ZÀ-Ú][a-zà-ú]+(?: [A-ZÀ-Ú]?[a-zà-ú]+){0,4}/gi, variable: "{{projetista}}", label: "Projetista" },
  { pattern: /(?:profiss[ãa]o|ocupa[çc][ãa]o)[:\s]+[A-ZÀ-Ú][a-zà-ú]+(?: [a-zà-ú]*)*/gi, variable: "{{profissao}}", label: "Profissão" },
  { pattern: /(?:respons[áa]vel\s*(?:pela?\s*)?venda)[:\s]+[A-ZÀ-Ú][a-zà-ú]+(?: [A-ZÀ-Ú]?[a-zà-ú]+){0,5}/gi, variable: "{{responsavel_venda}}", label: "Responsável pela venda" },

  // Address
  { pattern: /(?:endere[çc]o|rua|avenida|av\.)[:\s]+[A-ZÀ-Ú].{5,80}(?=,|\n|<)/gi, variable: "{{endereco}}", label: "Endereço" },
  { pattern: /(?:bairro)[:\s]+[A-ZÀ-Ú][a-zà-ú]+(?: [A-ZÀ-Ú]?[a-zà-ú]+){0,3}/gi, variable: "{{bairro}}", label: "Bairro" },
  { pattern: /(?:cidade|munic[ií]pio)[:\s]+[A-ZÀ-Ú][a-zà-ú]+(?: [a-zà-ú]*)*/gi, variable: "{{cidade}}", label: "Cidade" },
  { pattern: /(?:CEP|cep)[:\s]*\d{5}-?\d{3}/gi, variable: "{{cep}}", label: "CEP" },

  // Delivery
  { pattern: /(?:prazo\s*(?:de\s*)?entrega)[:\s]+.{5,80}(?=\n|<|$)/gi, variable: "{{prazo_entrega}}", label: "Prazo de entrega" },
  { pattern: /(?:endere[çc]o\s*(?:de\s*)?entrega)[:\s]+[A-ZÀ-Ú].{5,80}(?=,|\n|<)/gi, variable: "{{endereco_entrega}}", label: "End. Entrega" },

  // Contract / order
  { pattern: /(?:contrato\s*n[ºo°.]?|n[ºo°]\s*(?:do\s*)?contrato)[:\s]*[\d.\-\/]+/gi, variable: "{{numero_contrato}}", label: "Nº Contrato" },
  { pattern: /(?:pedido\s*n[ºo°.]?|n[ºo°]\s*(?:do\s*)?pedido|or[çc]amento\s*n[ºo°.]?)[:\s]*[\d.\-\/]+/gi, variable: "{{numero_orcamento}}", label: "Nº Orçamento" },

  // Company
  { pattern: /(?:contratada|empresa|raz[ãa]o\s*social)[:\s]+[A-ZÀ-Ú].{3,60}(?:LTDA|S\.?A\.?|ME|EIRELI|EPP)/gi, variable: "{{empresa_nome}}", label: "Nome da empresa" },

  // Guarantee
  { pattern: /(?:garantia)[:\s]+.{3,60}(?=\n|<|$)/gi, variable: "{{garantia}}", label: "Garantia" },
  { pattern: /(?:validade\s*(?:da\s*)?proposta)[:\s]+.{3,40}(?=\n|<|$)/gi, variable: "{{validade_proposta}}", label: "Validade proposta" },
];

// Indices of patterns that include a context label prefix (e.g., "Endereço: ...")
const CONTEXTUAL_FIELD_INDICES = new Set([
  2, 3, // RG, Insc. Estadual
  10, 11, 12, // dates
  17, 18, 19, // projetista, profissão, responsável
  20, 21, 22, 23, // endereço, bairro, cidade, CEP
  24, 25, // prazo, end. entrega
  26, 27, // contrato, orçamento
  28, // empresa
  29, 30, // garantia, validade
]);

// ── Label-based detection (for PDFs with "LABEL\nVALUE" format) ──

const LABEL_VALUE_MAP: Array<{ labels: RegExp; variable: string; label: string }> = [
  { labels: /^(?:CLIENTE|CONTRATANTE|NOME\s*(?:DO\s*)?CLIENTE)$/i, variable: "{{nome_cliente}}", label: "Nome do cliente" },
  { labels: /^(?:CPF\/?CNPJ|CPF|CNPJ)$/i, variable: "{{cpf_cliente}}", label: "CPF/CNPJ" },
  { labels: /^(?:RG\/?INSCRI[ÇC][ÃA]O\s*ESTADUAL|RG|INSCRI[ÇC][ÃA]O\s*ESTADUAL)$/i, variable: "{{rg_insc_estadual}}", label: "RG" },
  { labels: /^(?:DATA\s*(?:DE\s*)?NASCIMENTO)$/i, variable: "{{data_nascimento}}", label: "Dt. Nascimento" },
  { labels: /^(?:ENDERE[ÇC]O\s*ATUAL|ENDERE[ÇC]O\s*(?:DO\s*)?CLIENTE|ENDERE[ÇC]O)$/i, variable: "{{endereco}}", label: "Endereço" },
  { labels: /^(?:BAIRRO)$/i, variable: "{{bairro}}", label: "Bairro" },
  { labels: /^(?:CIDADE|MUNIC[ÍI]PIO)$/i, variable: "{{cidade}}", label: "Cidade" },
  { labels: /^(?:UF|ESTADO)$/i, variable: "{{uf}}", label: "UF" },
  { labels: /^(?:CEP)$/i, variable: "{{cep}}", label: "CEP" },
  { labels: /^(?:PROFISS[ÃA]O|OCUPA[ÇC][ÃA]O)$/i, variable: "{{profissao}}", label: "Profissão" },
  { labels: /^(?:TELEFONE|TEL|FONE)$/i, variable: "{{telefone_cliente}}", label: "Telefone" },
  { labels: /^(?:E-?MAIL|EMAIL)$/i, variable: "{{email_cliente}}", label: "E-mail" },
  { labels: /^(?:RESPONS[ÁA]VEL\s*(?:PELA?\s*)?VENDA|VENDEDOR)$/i, variable: "{{responsavel_venda}}", label: "Resp. Venda" },
  { labels: /^(?:LOJA|FILIAL)$/i, variable: "{{empresa_nome}}", label: "Loja" },
  { labels: /^(?:DATA\s*(?:DO\s*)?CONTRATO|DATA\s*DA\s*VENDA|DATA)$/i, variable: "{{data_atual}}", label: "Data do contrato" },
  { labels: /^(?:ENDERE[ÇC]O\s*(?:DE\s*)?ENTREGA)$/i, variable: "{{endereco_entrega}}", label: "End. Entrega" },
  { labels: /^(?:PRAZO\s*(?:DE?\s*)?ENTREGA)$/i, variable: "{{prazo_entrega}}", label: "Prazo Entrega" },
  { labels: /^(?:FORMA\s*(?:DE\s*)?PAGAMENTO|CONDI[ÇC][ÃA]O\s*(?:DE\s*)?PAGAMENTO)$/i, variable: "{{forma_pagamento}}", label: "Forma Pgto" },
  { labels: /^(?:TOTAL\s*(?:A\s*)?PRAZO|TOTAL\s*(?:DO\s*)?PEDIDO|VALOR\s*TOTAL)$/i, variable: "{{valor_final}}", label: "Valor Total" },
  { labels: /^(?:PROJETISTA|DESIGNER)$/i, variable: "{{projetista}}", label: "Projetista" },
  { labels: /^(?:GARANTIA)$/i, variable: "{{garantia}}", label: "Garantia" },
  { labels: /^(?:OBSERVA[ÇC][ÃÕA]O|OBSERVA[ÇC][ÕO]ES|OBS)$/i, variable: "{{observacoes}}", label: "Observações" },
  { labels: /^(?:N[ÚU]MERO\s*(?:DO\s*)?OR[ÇC]AMENTO|OR[ÇC]AMENTO\s*N[ºO]?)$/i, variable: "{{numero_orcamento}}", label: "Nº Orçamento" },
  { labels: /^(?:VALIDADE\s*(?:DA\s*)?PROPOSTA)$/i, variable: "{{validade_proposta}}", label: "Validade" },
  { labels: /^(?:PRAZO\s*(?:DE\s*)?GARANTIA)$/i, variable: "{{prazo_garantia}}", label: "Prazo Garantia" },
  { labels: /^(?:VALOR\s*(?:DA\s*)?ENTRADA|ENTRADA|SINAL)$/i, variable: "{{valor_entrada}}", label: "Entrada" },
  { labels: /^(?:VALOR\s*(?:DA\s*)?PARCELA)$/i, variable: "{{valor_parcela}}", label: "Valor Parcela" },
  { labels: /^(?:PARCELAS?|N[ºO]\s*(?:DE\s*)?PARCELAS)$/i, variable: "{{parcelas}}", label: "Parcelas" },
  { labels: /^(?:VALOR\s*(?:DE\s*)?TELA|VALOR\s*ORIGINAL)$/i, variable: "{{valor_tela}}", label: "Valor de tela" },
  { labels: /^(?:DESCONTO|PERCENTUAL\s*(?:DE\s*)?DESCONTO)$/i, variable: "{{percentual_desconto}}", label: "Desconto" },
];

const extractLabelPrefix = (match: string): string => {
  const colonIdx = match.indexOf(":");
  if (colonIdx > 0) return match.substring(0, colonIdx + 1).trim();
  return "";
};

const isSafeTextContainer = (element: Element | null) => {
  if (!element) return false;
  const tag = element.tagName.toLowerCase();
  return !["style", "script", "mark", "table", "thead", "tbody", "tr", "td", "th"].includes(tag);
};

// ── Public API: field replacement ──

export const replaceDetectedFieldsWithPlaceholders = (
  html: string,
): { html: string; replacedCount: number; replacements: FieldReplacement[] } => {
  if (!html || typeof DOMParser === "undefined") return { html, replacedCount: 0, replacements: [] };

  const parser = new DOMParser();
  const doc = parser.parseFromString(`<div>${html}</div>`, "text/html");
  const container = doc.body.firstElementChild;
  if (!container) return { html, replacedCount: 0, replacements: [] };

  // ── Pass 1: Label-value pair detection ──
  // Finds patterns where a label element is followed by a value element (common in PDF extractions)
  const allElements = Array.from(container.querySelectorAll("*"));
  const replacedElements = new Set<Element>();

  for (let i = 0; i < allElements.length - 1; i++) {
    const el = allElements[i];
    const labelText = (el.textContent || "").trim();
    if (!labelText || labelText.length > 60) continue;

    for (const lv of LABEL_VALUE_MAP) {
      if (lv.labels.test(labelText)) {
        // Find the next sibling or adjacent element with value content
        let valueEl: Element | null = null;
        // Check next sibling element
        let next = el.nextElementSibling;
        if (next && next.textContent?.trim() && !replacedElements.has(next)) {
          valueEl = next;
        }
        // Or check the next element in document order
        if (!valueEl && i + 1 < allElements.length) {
          const candidate = allElements[i + 1];
          if (candidate.textContent?.trim() && !el.contains(candidate) && !replacedElements.has(candidate)) {
            valueEl = candidate;
          }
        }

        if (valueEl) {
          const valueText = (valueEl.textContent || "").trim();
          // Skip if the value looks like another label or is too long
          if (valueText.length > 0 && valueText.length < 200 && !LABEL_VALUE_MAP.some(l => l.labels.test(valueText))) {
            replacedElements.add(valueEl);
            break;
          }
        }
      }
    }
  }

  // ── Pass 2: Regex-based detection on text nodes ──
  const walker = doc.createTreeWalker(container, NodeFilter.SHOW_TEXT);
  const textNodes: Text[] = [];
  while (walker.nextNode()) textNodes.push(walker.currentNode as Text);

  let replacedCount = 0;
  const replacements: FieldReplacement[] = [];

  // First, do label-value replacements
  for (let i = 0; i < allElements.length - 1; i++) {
    const el = allElements[i];
    const labelText = (el.textContent || "").trim();
    if (!labelText || labelText.length > 60) continue;

    for (const lv of LABEL_VALUE_MAP) {
      if (lv.labels.test(labelText)) {
        let valueEl: Element | null = null;
        let next = el.nextElementSibling;
        if (next && next.textContent?.trim()) {
          valueEl = next;
        }
        if (!valueEl && i + 1 < allElements.length) {
          const candidate = allElements[i + 1];
          if (candidate.textContent?.trim() && !el.contains(candidate)) {
            valueEl = candidate;
          }
        }

        if (valueEl) {
          const valueText = (valueEl.textContent || "").trim();
          if (valueText.length > 0 && valueText.length < 200 && !LABEL_VALUE_MAP.some(l => l.labels.test(valueText))) {
            // Don't replace if already contains a variable
            if (!/\{\{[^}]+\}\}/.test(valueText)) {
              const origValue = valueText;
              valueEl.textContent = lv.variable;
              replacedCount++;
              replacements.push({
                id: `fr-${replacedCount}-${Date.now()}`,
                originalValue: origValue,
                variable: lv.variable,
                label: lv.label,
              });
            }
            break;
          }
        }
      }
    }
  }

  // Then, do regex-based replacements on remaining text nodes
  const walker2 = doc.createTreeWalker(container, NodeFilter.SHOW_TEXT);
  const textNodes2: Text[] = [];
  while (walker2.nextNode()) textNodes2.push(walker2.currentNode as Text);

  for (const textNode of textNodes2) {
    if (!isSafeTextContainer(textNode.parentElement)) continue;
    const text = textNode.textContent || "";
    // Skip nodes that already have variables
    if (/\{\{[^}]+\}\}/.test(text)) continue;

    let newText = text;
    let hasMatch = false;

    FIELD_PATTERNS.forEach((fp, idx) => {
      const regex = new RegExp(fp.pattern.source, fp.pattern.flags);
      if (regex.test(newText)) {
        // Skip if this would replace inside already-replaced content
        if (/\{\{[^}]+\}\}/.test(newText)) return;
        hasMatch = true;
        const regex2 = new RegExp(fp.pattern.source, fp.pattern.flags);
        newText = newText.replace(regex2, (match) => {
          replacedCount++;
          replacements.push({
            id: `fr-${replacedCount}-${Date.now()}`,
            originalValue: match,
            variable: fp.variable,
            label: fp.label,
          });
          if (CONTEXTUAL_FIELD_INDICES.has(idx)) {
            const label = extractLabelPrefix(match);
            return label ? `${label} ${fp.variable}` : fp.variable;
          }
          return fp.variable;
        });
      }
    });

    if (hasMatch) textNode.textContent = newText;
  }

  return { html: container.innerHTML, replacedCount, replacements };
};

// ── Public API: highlighting ──

export const highlightSuggestedFields = (html: string): string => {
  if (!html || typeof DOMParser === "undefined") return html;

  const parser = new DOMParser();
  const doc = parser.parseFromString(`<div>${html}</div>`, "text/html");
  const container = doc.body.firstElementChild;
  if (!container) return html;

  const walker = doc.createTreeWalker(container, NodeFilter.SHOW_TEXT);
  const textNodes: Text[] = [];
  while (walker.nextNode()) textNodes.push(walker.currentNode as Text);

  for (const textNode of textNodes) {
    if (!isSafeTextContainer(textNode.parentElement)) continue;
    const text = textNode.textContent || "";
    let newHtml = text;
    let hasMatch = false;

    for (const fp of FIELD_PATTERNS) {
      const regex = new RegExp(fp.pattern.source, fp.pattern.flags);
      if (regex.test(newHtml)) {
        hasMatch = true;
        const regex2 = new RegExp(fp.pattern.source, fp.pattern.flags);
        newHtml = newHtml.replace(
          regex2,
          (match) =>
            `<mark class="contract-field-highlight" data-variable="${fp.variable}" data-label="${fp.label}" title="Campo sugerido: ${fp.label} → ${fp.variable}" style="background: linear-gradient(135deg, hsl(45 93% 80% / 0.6), hsl(45 93% 70% / 0.4)); padding: 1px 4px; border-radius: 3px; border-bottom: 2px solid hsl(45 93% 47%); cursor: help;">${match}</mark>`,
        );
      }
    }

    if (hasMatch) {
      const span = doc.createElement("span");
      span.innerHTML = newHtml;
      textNode.parentNode?.replaceChild(span, textNode);
    }
  }

  return container.innerHTML;
};

export const removeHighlights = (html: string): string => {
  if (!html || typeof DOMParser === "undefined") return html;
  const parser = new DOMParser();
  const doc = parser.parseFromString(`<div>${html}</div>`, "text/html");
  doc.querySelectorAll("mark.contract-field-highlight").forEach((mark) => {
    const parent = mark.parentNode;
    if (parent) {
      while (mark.firstChild) parent.insertBefore(mark.firstChild, mark);
      parent.removeChild(mark);
    }
  });
  doc.querySelectorAll("span:not([class])").forEach((span) => {
    if (span.childNodes.length && span.parentNode) {
      while (span.firstChild) span.parentNode.insertBefore(span.firstChild, span);
      span.parentNode.removeChild(span);
    }
  });
  return doc.body.firstElementChild?.innerHTML || html;
};

// ── PDF import (pixel-perfect) ──

const importPdf = async (file: File, onProgress?: ImportProgressCallback): Promise<ImportedContractContent> => {
  const arrayBuffer = await file.arrayBuffer();
  let html = "";
  let structure: StructureBlock[] = [];

  try {
    console.log("[PDF Import] Starting pdfjs extraction...");
    const pdf = await pdfjsLib.getDocument({ data: new Uint8Array(arrayBuffer) }).promise;
    const totalPages = pdf.numPages;
    console.log(`[PDF Import] PDF loaded: ${totalPages} pages`);
    const pages: string[] = [];
    const allStructure: StructureBlock[] = [];

    for (let pageNumber = 1; pageNumber <= totalPages; pageNumber++) {
      console.log(`[PDF Import] Processing page ${pageNumber}/${totalPages}...`);
      onProgress?.({ current: pageNumber, total: totalPages, label: `Processando página ${pageNumber} de ${totalPages}...` });
      const page = await pdf.getPage(pageNumber);
      const viewport = page.getViewport({ scale: 1 });
      const textContent = await page.getTextContent();

      // Extract with font info
      const items = textContent.items as PdfTextItem[];
      const extracted = extractTextItems(items, viewport.width, viewport.height);
      const lines = groupTextLines(extracted);
      const tables = detectTableBlocks(lines);

      // Extract embedded images/logos
      let embeddedImages: Awaited<ReturnType<typeof extractEmbeddedImages>> = [];
      try {
        embeddedImages = await extractEmbeddedImages(page, viewport.width, viewport.height);
      } catch (err) {
        console.warn(`Image extraction failed for page ${pageNumber}:`, err);
      }

      // Try canvas background for complex PDFs (use scale 1.5 to avoid memory issues)
      let bgBase64: string | null = null;
      try {
        bgBase64 = await renderPageToBase64(pdf, pageNumber, 1.5);
      } catch (err) {
        console.warn(`Canvas render failed for page ${pageNumber}:`, err);
      }

      const pageHtml = buildPixelPerfectPageHtml(lines, tables, bgBase64, pageNumber - 1, embeddedImages);
      if (pageHtml) pages.push(pageHtml);

      // Build structure blocks for hybrid storage
      const pageBlocks = buildStructureBlocks(lines, tables, viewport.width, viewport.height);
      allStructure.push(...pageBlocks);
    }

    html = pages.join("");
    structure = allStructure;
    console.log(`[PDF Import] Extraction complete. HTML length: ${html.length}`);
  } catch (err) {
    console.warn("pdfjs extraction failed, will try OCR:", err);
  }

  const plainText = html.replace(/<[^>]+>/g, "").trim();

  if (plainText.length < 50) {
    try {
      const ocrHtml = await ocrPdfViaEdgeFunction(arrayBuffer);
      if (ocrHtml) {
        html = sanitizeImportedHtml(ocrHtml);
      }
    } catch (ocrErr) {
      console.error("OCR fallback failed:", ocrErr);
      if (!html) {
        throw new Error(
          "Não foi possível extrair o layout deste PDF. Use um arquivo com texto selecionável ou PDF com melhor definição.",
        );
      }
    }
  }

  if (!html.replace(/<[^>]+>/g, "").trim()) {
    throw new Error("Não foi possível extrair texto deste PDF.");
  }

  return {
    html,
    suggestedName: normalizeSuggestedName(file.name),
    sourceLabel: "PDF",
    structure: structure.length > 0 ? structure : undefined,
    templateType: structure.length > 0 ? "hybrid" : "flow",
  };
};

// ── DOCX import ──

const importDocx = async (file: File, onProgress?: ImportProgressCallback): Promise<ImportedContractContent> => {
  onProgress?.({ current: 1, total: 2, label: "Carregando documento Word..." });
  const arrayBuffer = await file.arrayBuffer();
  const mammoth = (await import("mammoth")).default;
  onProgress?.({ current: 2, total: 2, label: "Convertendo para HTML..." });
  const result = await mammoth.convertToHtml({ arrayBuffer });
  return {
    html: sanitizeImportedHtml(result.value),
    suggestedName: normalizeSuggestedName(file.name),
    sourceLabel: "Documento Word",
  };
};

// ── Spreadsheet import ──

const importSpreadsheet = async (file: File): Promise<ImportedContractContent> => {
  const XLSX = await import("xlsx");
  const arrayBuffer = await file.arrayBuffer();
  const workbook = XLSX.read(arrayBuffer, { type: "array" });
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  const html = XLSX.utils.sheet_to_html(sheet);
  return {
    html: sanitizeImportedHtml(html),
    suggestedName: normalizeSuggestedName(file.name),
    sourceLabel: "Planilha",
  };
};

// ── Public entry point ──

export const importContractFile = async (
  file: File,
  onProgress?: ImportProgressCallback,
): Promise<ImportedContractContent> => {
  const extension = file.name.split(".").pop()?.toLowerCase();
  if (extension === "docx") return importDocx(file, onProgress);
  if (extension === "xlsx" || extension === "xls" || extension === "csv") return importSpreadsheet(file);
  if (extension === "pdf") return importPdf(file, onProgress);
  throw new Error("Formato não suportado. Use PDF, Word (.docx) ou Excel (.xlsx/.xls).");
};
