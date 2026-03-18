import mammoth from "mammoth";
import * as XLSX from "xlsx";
import * as pdfjsLib from "pdfjs-dist";
import pdfWorker from "pdfjs-dist/build/pdf.worker.min.mjs?url";
import { supabase } from "@/integrations/supabase/client";

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorker;

export interface ImportedContractContent {
  html: string;
  suggestedName: string;
  sourceLabel: string;
}

type PdfTextItem = {
  str: string;
  transform: number[];
};

const escapeHtml = (value: string) =>
  value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

export const sanitizeImportedHtml = (html: string) => {
  if (!html.trim() || typeof DOMParser === "undefined") return html;

  const parser = new DOMParser();
  const doc = parser.parseFromString(html, "text/html");
  doc.querySelectorAll("script, style, meta, link, title").forEach((n) => n.remove());
  doc.querySelectorAll("*").forEach((el) => {
    [...el.attributes].forEach((attr) => {
      if (attr.name.toLowerCase().startsWith("on")) el.removeAttribute(attr.name);
    });
  });
  return (doc.body?.innerHTML || html).trim();
};

const normalizeSuggestedName = (fileName: string) => fileName.replace(/\.[^.]+$/u, "");

const textBlocksToHtml = (blocks: string[]) =>
  blocks
    .map((b) => b.replace(/\s+/g, " ").trim())
    .filter(Boolean)
    .map((b) => `<p>${escapeHtml(b)}</p>`)
    .join("");

const buildPdfPageHtml = (items: PdfTextItem[]) => {
  const lines: Array<{ y: number; chunks: Array<{ x: number; text: string }> }> = [];

  items.forEach((item) => {
    const text = item.str.replace(/\s+/g, " ").trim();
    if (!text) return;
    const y = Math.round(item.transform[5] * 2) / 2;
    let line = lines.find((e) => Math.abs(e.y - y) < 3);
    if (!line) {
      line = { y, chunks: [] };
      lines.push(line);
    }
    line.chunks.push({ x: item.transform[4], text });
  });

  return lines
    .sort((a, b) => b.y - a.y)
    .map((line) =>
      line.chunks
        .sort((a, b) => a.x - b.x)
        .map((c) => c.text)
        .join(" ")
        .replace(/\s+([,.;:!?])/g, "$1")
        .trim(),
    )
    .filter(Boolean);
};

/* ─── OCR fallback via edge function ─── */
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

/* ─── Field highlighting ─── */

const FIELD_PATTERNS: Array<{ pattern: RegExp; variable: string; label: string }> = [
  { pattern: /\b\d{3}\.?\d{3}\.?\d{3}-?\d{2}\b/g, variable: "{{cpf_cliente}}", label: "CPF" },
  { pattern: /\b\d{2}\.?\d{3}\.?\d{3}\/?\d{4}-?\d{2}\b/g, variable: "{{cpf_cliente}}", label: "CNPJ" },
  { pattern: /R\$\s*[\d.,]+/g, variable: "{{valor_final}}", label: "Valor" },
  { pattern: /\b(\d{1,3})\s*(?:parcelas?|x\s*de|vezes)\b/gi, variable: "{{parcelas}}", label: "Parcelas" },
  { pattern: /\b\d{2}\/\d{2}\/\d{4}\b/g, variable: "{{data_atual}}", label: "Data" },
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
];

export const highlightSuggestedFields = (html: string): string => {
  if (!html) return html;

  let result = html;

  // Work on text nodes only by using a temporary DOM
  if (typeof DOMParser === "undefined") return result;

  const parser = new DOMParser();
  const doc = parser.parseFromString(`<div>${html}</div>`, "text/html");
  const container = doc.body.firstElementChild;
  if (!container) return result;

  const walker = doc.createTreeWalker(container, NodeFilter.SHOW_TEXT);
  const textNodes: Text[] = [];
  while (walker.nextNode()) {
    textNodes.push(walker.currentNode as Text);
  }

  for (const textNode of textNodes) {
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
  // Also unwrap our helper spans
  doc.querySelectorAll("span:not([class])").forEach((span) => {
    if (span.childNodes.length && span.parentNode) {
      while (span.firstChild) span.parentNode.insertBefore(span.firstChild, span);
      span.parentNode.removeChild(span);
    }
  });
  return doc.body.firstElementChild?.innerHTML || html;
};

/* ─── Import functions ─── */

const importPdf = async (file: File): Promise<ImportedContractContent> => {
  const arrayBuffer = await file.arrayBuffer();

  // Step 1: try programmatic extraction
  let html = "";
  try {
    const pdf = await pdfjsLib.getDocument({ data: new Uint8Array(arrayBuffer) }).promise;
    const pages: string[] = [];

    for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber++) {
      const page = await pdf.getPage(pageNumber);
      const textContent = await page.getTextContent();
      const lines = buildPdfPageHtml(textContent.items as PdfTextItem[]);
      if (lines.length > 0) {
        pages.push(textBlocksToHtml(lines));
      }
    }

    html = sanitizeImportedHtml(pages.join("<hr />"));
  } catch (err) {
    console.warn("pdfjs extraction failed, will try OCR:", err);
  }

  // Step 2: check if extraction yielded meaningful text
  const plainText = html.replace(/<[^>]+>/g, "").trim();

  if (plainText.length < 50) {
    // Fallback to OCR via edge function
    console.log("PDF text extraction yielded minimal content, using OCR...");
    try {
      const ocrHtml = await ocrPdfViaEdgeFunction(arrayBuffer);
      if (ocrHtml) {
        html = sanitizeImportedHtml(ocrHtml);
      }
    } catch (ocrErr) {
      console.error("OCR fallback failed:", ocrErr);
      if (!html) {
        throw new Error(
          "Não foi possível extrair texto deste PDF. O arquivo pode ser uma imagem escaneada sem texto selecionável."
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
  const result = await mammoth.convertToHtml({ arrayBuffer });

  return {
    html: sanitizeImportedHtml(result.value),
    suggestedName: normalizeSuggestedName(file.name),
    sourceLabel: "Documento Word",
  };
};

const importSpreadsheet = async (file: File): Promise<ImportedContractContent> => {
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
