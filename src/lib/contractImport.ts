// mammoth is dynamically imported to reduce initial bundle size

import * as pdfjsLib from "pdfjs-dist";
import pdfWorker from "pdfjs-dist/build/pdf.worker.min.mjs?url";
import { supabase } from "@/lib/supabaseClient";

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorker;

export interface ImportedContractContent {
  html: string;
  suggestedName: string;
  sourceLabel: string;
}

type PdfTextItem = {
  str: string;
  transform: number[];
  width?: number;
  height?: number;
};

const escapeHtml = (value: string) =>
  value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

const preserveDocumentStructure = (html: string) => {
  const trimmed = html.trim();
  if (!trimmed) return trimmed;

  if (/contract-page|data-contract-page/iu.test(trimmed)) return trimmed;

  const bodyMatch = trimmed.match(/<body[^>]*>([\s\S]*)<\/body>/iu);
  const content = bodyMatch?.[1]?.trim() ?? trimmed;

  if (/<html[\s>]/iu.test(trimmed)) return trimmed;

  const pages = content
    .split(/<hr\b[^>]*>/giu)
    .map((page) => page.trim())
    .filter(Boolean);

  return pages
    .map(
      (page) => `<section class="contract-page" data-contract-page="true"><div class="contract-page__content">${page}</div></section>`,
    )
    .join("");
};

export const sanitizeImportedHtml = (html: string) => {
  if (!html.trim() || typeof DOMParser === "undefined") return preserveDocumentStructure(html);

  const parser = new DOMParser();
  const doc = parser.parseFromString(html, "text/html");
  doc.querySelectorAll("script, meta, link, title").forEach((n) => n.remove());
  doc.querySelectorAll("*").forEach((el) => {
    [...el.attributes].forEach((attr) => {
      if (attr.name.toLowerCase().startsWith("on")) el.removeAttribute(attr.name);
    });
  });

  const styleTags = Array.from(doc.querySelectorAll("style")).map((style) => style.outerHTML).join("\n");
  const bodyContent = (doc.body?.innerHTML || html).trim();
  const preserved = preserveDocumentStructure(bodyContent);

  return styleTags ? `${styleTags}\n${preserved}` : preserved;
};

const normalizeSuggestedName = (fileName: string) => fileName.replace(/\.[^.]+$/u, "");

const buildPdfPageHtml = (items: PdfTextItem[], pageWidth: number, pageHeight: number) => {
  const textItems = items
    .map((item) => {
      const text = item.str.replace(/\s+/g, " ").trim();
      if (!text) return null;

      const x = item.transform[4];
      const y = item.transform[5];
      const fontSize = Math.max(Math.abs(item.transform[0] || item.height || 12), 8);
      const width = item.width || text.length * (fontSize * 0.52);

      return {
        text,
        x,
        y,
        width,
        fontSize,
        leftPercent: (x / pageWidth) * 100,
        topPercent: ((pageHeight - y - fontSize) / pageHeight) * 100,
        widthPercent: (width / pageWidth) * 100,
      };
    })
    .filter(Boolean) as Array<{
      text: string;
      x: number;
      y: number;
      width: number;
      fontSize: number;
      leftPercent: number;
      topPercent: number;
      widthPercent: number;
    }>;

  const positionedItems = textItems
    .map(
      (item) => `<div style="position:absolute;left:${item.leftPercent}%;top:${item.topPercent}%;width:${Math.max(item.widthPercent, 2)}%;font-size:${item.fontSize}px;line-height:1.15;white-space:pre-wrap;">${escapeHtml(item.text)}</div>`,
    )
    .join("");

  return `<section class="contract-page" data-contract-page="true"><div class="contract-page__content" style="position:relative;width:100%;min-height:267mm;">${positionedItems}</div></section>`;
};

const arrayBufferToBase64 = (buffer: ArrayBuffer): string => {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
};

const ocrPdfViaEdgeFunction = async (arrayBuffer: ArrayBuffer): Promise<string> => {
  const base64 = arrayBufferToBase64(arrayBuffer);

  const { data, error } = await supabase.functions.invoke("contract-ocr", {
    body: { pdfBase64: base64 },
  });

  if (error) throw new Error("Erro no OCR: " + (error.message || "falha na requisição"));
  if (data?.error) throw new Error(data.error);

  return data?.html || "";
};

const FIELD_PATTERNS: Array<{ pattern: RegExp; variable: string; label: string }> = [
  { pattern: /\b\d{3}\.?\d{3}\.?\d{3}-?\d{2}\b/g, variable: "{{cpf_cliente}}", label: "CPF" },
  { pattern: /\b\d{2}\.?\d{3}\.?\d{3}\/?\d{4}-?\d{2}\b/g, variable: "{{cpf_cliente}}", label: "CNPJ" },
  { pattern: /R\$\s*[\d.,]+/g, variable: "{{valor_final}}", label: "Valor" },
  { pattern: /\b(\d{1,3})\s*(?:parcelas?|x\s*de|vezes)\b/gi, variable: "{{parcelas}}", label: "Parcelas" },
  { pattern: /\b\d{2}\/\d{2}\/\d{4}\b/g, variable: "{{data_atual}}", label: "Data" },
  { pattern: /\b\d{4}-\d{2}-\d{2}\b/g, variable: "{{data_atual}}", label: "Data ISO" },
  {
    pattern: /(?:(?:\(\d{2}\)\s?)|(?:\d{2}\s?))?\d{4,5}-?\d{4}\b/g,
    variable: "{{telefone_cliente}}",
    label: "Telefone",
  },
  {
    pattern: /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g,
    variable: "{{email_cliente}}",
    label: "E-mail",
  },
  // Contextual field patterns - detect labels followed by values
  { pattern: /(?:nome[:\s]*(?:do\s+)?(?:cliente|contratante|comprador))[:\s]+[A-ZÀ-Ú][a-zà-ú]+(?: [A-ZÀ-Ú][a-zà-ú]+){1,5}/gi, variable: "{{nome_cliente}}", label: "Nome do cliente" },
  { pattern: /(?:RG|identidade)[:\s]*[\d.\-\/]+/gi, variable: "{{rg_insc_estadual}}", label: "RG" },
  { pattern: /(?:inscri[çc][ãa]o\s*estadual)[:\s]*[\d.\-\/]+/gi, variable: "{{rg_insc_estadual}}", label: "Insc. Estadual" },
  { pattern: /(?:CEP|cep)[:\s]*\d{5}-?\d{3}/gi, variable: "{{cep}}", label: "CEP" },
  { pattern: /(?:endere[çc]o|rua|avenida|av\.)[:\s]+[A-ZÀ-Ú].{5,60}(?=,|\n|<)/gi, variable: "{{endereco}}", label: "Endereço" },
  { pattern: /(?:bairro)[:\s]+[A-ZÀ-Ú][a-zà-ú]+(?: [A-ZÀ-Ú]?[a-zà-ú]+){0,3}/gi, variable: "{{bairro}}", label: "Bairro" },
  { pattern: /(?:cidade|munic[ií]pio)[:\s]+[A-ZÀ-Ú][a-zà-ú]+(?: [a-zà-ú]*)*/gi, variable: "{{cidade}}", label: "Cidade" },
  { pattern: /(?:prazo\s*(?:de\s*)?entrega)[:\s]+\d+\s*(?:dias|meses|d\.u\.)/gi, variable: "{{prazo_entrega}}", label: "Prazo" },
  { pattern: /(?:projetista|designer|resp(?:onsável)?(?:\s*t[eé]cnico)?)[:\s]+[A-ZÀ-Ú][a-zà-ú]+(?: [A-ZÀ-Ú]?[a-zà-ú]+){0,4}/gi, variable: "{{projetista}}", label: "Projetista" },
  { pattern: /(?:contrato\s*n[ºo°]?|n[ºo°]\s*(?:do\s*)?contrato)[:\s]*[\d.\-\/]+/gi, variable: "{{numero_contrato}}", label: "Nº Contrato" },
  { pattern: /(?:profiss[ãa]o|ocupa[çc][ãa]o)[:\s]+[A-ZÀ-Ú][a-zà-ú]+(?: [a-zà-ú]*)*/gi, variable: "{{profissao}}", label: "Profissão" },
  { pattern: /(?:data\s*(?:de\s*)?nascimento)[:\s]*\d{2}\/\d{2}\/\d{4}/gi, variable: "{{data_nascimento}}", label: "Dt. Nascimento" },
  { pattern: /(?:forma\s*(?:de\s*)?pagamento)[:\s]+[^\n<]{3,40}/gi, variable: "{{forma_pagamento}}", label: "Forma Pgto" },
  { pattern: /(?:entrada|sinal)[:\s]*R\$\s*[\d.,]+/gi, variable: "{{valor_entrada}}", label: "Entrada" },
];

const isSafeTextContainer = (element: Element | null) => {
  if (!element) return false;
  const tag = element.tagName.toLowerCase();
  return !["style", "script", "mark", "table", "thead", "tbody", "tr", "td", "th"].includes(tag);
};

/**
 * Contextual patterns replace the entire "Label: Value" match with "Label: {{variable}}".
 * Standalone patterns replace just the matched value with {{variable}}.
 */
const CONTEXTUAL_FIELD_INDICES = new Set([
  // indices of patterns in FIELD_PATTERNS that include a label prefix (e.g. "Nome do cliente: Fulano")
  8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21,
]);

const extractLabelPrefix = (match: string): string => {
  // For contextual patterns like "Nome do cliente: João Silva", extract "Nome do cliente:"
  const colonIdx = match.indexOf(":");
  if (colonIdx > 0) return match.substring(0, colonIdx + 1).trim();
  return "";
};

export const replaceDetectedFieldsWithPlaceholders = (html: string): { html: string; replacedCount: number } => {
  if (!html || typeof DOMParser === "undefined") return { html, replacedCount: 0 };

  const parser = new DOMParser();
  const doc = parser.parseFromString(`<div>${html}</div>`, "text/html");
  const container = doc.body.firstElementChild;
  if (!container) return { html, replacedCount: 0 };

  const walker = doc.createTreeWalker(container, NodeFilter.SHOW_TEXT);
  const textNodes: Text[] = [];
  while (walker.nextNode()) {
    textNodes.push(walker.currentNode as Text);
  }

  let replacedCount = 0;
  const alreadyReplaced = new Set<string>(); // track which variables were already placed to avoid duplicates in same text node

  for (const textNode of textNodes) {
    if (!isSafeTextContainer(textNode.parentElement)) continue;

    const text = textNode.textContent || "";
    let newText = text;
    let hasMatch = false;

    FIELD_PATTERNS.forEach((fp, idx) => {
      const regex = new RegExp(fp.pattern.source, fp.pattern.flags);
      if (regex.test(newText)) {
        hasMatch = true;
        const regex2 = new RegExp(fp.pattern.source, fp.pattern.flags);
        newText = newText.replace(regex2, (match) => {
          replacedCount++;
          if (CONTEXTUAL_FIELD_INDICES.has(idx)) {
            const label = extractLabelPrefix(match);
            return label ? `${label} ${fp.variable}` : fp.variable;
          }
          return fp.variable;
        });
      }
    });

    if (hasMatch) {
      textNode.textContent = newText;
    }
  }

  return { html: container.innerHTML, replacedCount };
};

export const highlightSuggestedFields = (html: string): string => {
  if (!html || typeof DOMParser === "undefined") return html;

  const parser = new DOMParser();
  const doc = parser.parseFromString(`<div>${html}</div>`, "text/html");
  const container = doc.body.firstElementChild;
  if (!container) return html;

  const walker = doc.createTreeWalker(container, NodeFilter.SHOW_TEXT);
  const textNodes: Text[] = [];
  while (walker.nextNode()) {
    textNodes.push(walker.currentNode as Text);
  }

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
        newHtml = newHtml.replace(regex2, (match) => {
          return `<mark class="contract-field-highlight" data-variable="${fp.variable}" data-label="${fp.label}" title="Campo sugerido: ${fp.label} → ${fp.variable}" style="background: linear-gradient(135deg, hsl(45 93% 80% / 0.6), hsl(45 93% 70% / 0.4)); padding: 1px 4px; border-radius: 3px; border-bottom: 2px solid hsl(45 93% 47%); cursor: help;">${match}</mark>`;
        });
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

const importPdf = async (file: File): Promise<ImportedContractContent> => {
  const arrayBuffer = await file.arrayBuffer();

  let html = "";
  try {
    const pdf = await pdfjsLib.getDocument({ data: new Uint8Array(arrayBuffer) }).promise;
    const pages: string[] = [];

    for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber++) {
      const page = await pdf.getPage(pageNumber);
      const viewport = page.getViewport({ scale: 1 });
      const textContent = await page.getTextContent();
      const pageHtml = buildPdfPageHtml(textContent.items as PdfTextItem[], viewport.width, viewport.height);
      if (pageHtml) {
        pages.push(pageHtml);
      }
    }

    html = sanitizeImportedHtml(pages.join(""));
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
          "Não foi possível extrair o layout deste PDF. Use um arquivo com texto selecionável ou PDF com melhor definição."
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
  };
};

const importDocx = async (file: File): Promise<ImportedContractContent> => {
  const arrayBuffer = await file.arrayBuffer();
  const mammoth = (await import("mammoth")).default;
  const result = await mammoth.convertToHtml({ arrayBuffer });

  return {
    html: sanitizeImportedHtml(result.value),
    suggestedName: normalizeSuggestedName(file.name),
    sourceLabel: "Documento Word",
  };
};

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

export const importContractFile = async (file: File): Promise<ImportedContractContent> => {
  const extension = file.name.split(".").pop()?.toLowerCase();

  if (extension === "docx") return importDocx(file);
  if (extension === "xlsx" || extension === "xls" || extension === "csv") return importSpreadsheet(file);
  if (extension === "pdf") return importPdf(file);

  throw new Error("Formato não suportado. Use PDF, Word (.docx) ou Excel (.xlsx/.xls).");
};
