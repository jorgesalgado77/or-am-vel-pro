import mammoth from "mammoth";
import * as XLSX from "xlsx";
import * as pdfjsLib from "pdfjs-dist";
import pdfWorker from "pdfjs-dist/build/pdf.worker.min.mjs?url";

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
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#39;");

export const sanitizeImportedHtml = (html: string) => {
  if (!html.trim() || typeof DOMParser === "undefined") {
    return html;
  }

  const parser = new DOMParser();
  const doc = parser.parseFromString(html, "text/html");

  doc.querySelectorAll("script, style, meta, link, title").forEach((node) => node.remove());
  doc.querySelectorAll("*").forEach((element) => {
    [...element.attributes].forEach((attribute) => {
      if (attribute.name.toLowerCase().startsWith("on")) {
        element.removeAttribute(attribute.name);
      }
    });
  });

  return (doc.body?.innerHTML || html).trim();
};

const normalizeSuggestedName = (fileName: string) => fileName.replace(/\.[^.]+$/u, "");

const textBlocksToHtml = (blocks: string[]) =>
  blocks
    .map((block) => block.replace(/\s+/g, " ").trim())
    .filter(Boolean)
    .map((block) => `<p>${escapeHtml(block)}</p>`)
    .join("");

const buildPdfPageHtml = (items: PdfTextItem[]) => {
  const lines: Array<{ y: number; chunks: Array<{ x: number; text: string }> }> = [];

  items.forEach((item) => {
    const text = item.str.replace(/\s+/g, " ").trim();
    if (!text) return;

    const y = Math.round(item.transform[5] * 2) / 2;
    let line = lines.find((entry) => Math.abs(entry.y - y) < 3);

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
        .map((chunk) => chunk.text)
        .join(" ")
        .replace(/\s+([,.;:!?])/g, "$1")
        .trim(),
    )
    .filter(Boolean);
};

const importPdf = async (file: File) => {
  const arrayBuffer = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: new Uint8Array(arrayBuffer) }).promise;
  const pages: string[] = [];

  for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
    const page = await pdf.getPage(pageNumber);
    const textContent = await page.getTextContent();
    const lines = buildPdfPageHtml(textContent.items as PdfTextItem[]);

    pages.push(`
      <section data-page="${pageNumber}">
        <h2>Página ${pageNumber}</h2>
        ${textBlocksToHtml(lines) || "<p><em>Não foi possível extrair texto editável desta página.</em></p>"}
      </section>
    `);
  }

  const html = sanitizeImportedHtml(pages.join("<hr />"));

  if (!html.replace(/<[^>]+>/g, "").trim()) {
    throw new Error("Não foi possível extrair texto deste PDF. Verifique se o arquivo não é apenas imagem escaneada.");
  }

  return {
    html,
    suggestedName: normalizeSuggestedName(file.name),
    sourceLabel: "PDF",
  } satisfies ImportedContractContent;
};

const importDocx = async (file: File) => {
  const arrayBuffer = await file.arrayBuffer();
  const result = await mammoth.convertToHtml({ arrayBuffer });

  return {
    html: sanitizeImportedHtml(result.value),
    suggestedName: normalizeSuggestedName(file.name),
    sourceLabel: "Documento Word",
  } satisfies ImportedContractContent;
};

const importSpreadsheet = async (file: File) => {
  const arrayBuffer = await file.arrayBuffer();
  const workbook = XLSX.read(arrayBuffer, { type: "array" });
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  const html = XLSX.utils.sheet_to_html(sheet);

  return {
    html: sanitizeImportedHtml(html),
    suggestedName: normalizeSuggestedName(file.name),
    sourceLabel: "Planilha",
  } satisfies ImportedContractContent;
};

export const importContractFile = async (file: File): Promise<ImportedContractContent> => {
  const extension = file.name.split(".").pop()?.toLowerCase();

  if (extension === "docx") {
    return importDocx(file);
  }

  if (extension === "xlsx" || extension === "xls" || extension === "csv") {
    return importSpreadsheet(file);
  }

  if (extension === "pdf") {
    return importPdf(file);
  }

  throw new Error("Formato não suportado. Use PDF, Word (.docx) ou Excel (.xlsx/.xls).");
};
