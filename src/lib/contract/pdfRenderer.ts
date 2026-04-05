import type { TextLine, TableBlock } from "./types";
import type { EmbeddedImage } from "./pdfExtractor";

const escapeHtml = (value: string) =>
  value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

// ── Render a single text line as positioned HTML ──

const renderTextLine = (line: TextLine): string => {
  if (line.items.length === 1) {
    const item = line.items[0];
    return `<div style="position:absolute;left:${item.leftPercent}%;top:${item.topPercent}%;font-size:${item.fontSize}px;font-family:${item.fontFamily};font-weight:${item.fontWeight};line-height:1.2;white-space:pre-wrap;">${escapeHtml(item.text)}</div>`;
  }

  // Multiple items on same line — render as a group
  const minLeft = Math.min(...line.items.map((i) => i.leftPercent));
  const spans = line.items
    .map((item) => {
      const relativeLeft = item.leftPercent - minLeft;
      return `<span style="position:absolute;left:${relativeLeft}%;font-size:${item.fontSize}px;font-family:${item.fontFamily};font-weight:${item.fontWeight};white-space:pre-wrap;">${escapeHtml(item.text)}</span>`;
    })
    .join("");

  return `<div style="position:absolute;left:${minLeft}%;top:${line.topPercent}%;width:${100 - minLeft}%;line-height:1.2;">${spans}</div>`;
};

// ── Render a table block as <table> HTML ──

const renderTableBlock = (table: TableBlock): string => {
  const topPercent = table.rows[0].items[0]?.topPercent ?? 0;
  const leftPercent = Math.min(...table.rows[0].items.map((i) => i.leftPercent));
  const widthPercent = Math.max(...table.rows.flatMap((r) => r.items.map((i) => i.leftPercent + i.widthPercent))) - leftPercent;

  const rows = table.rows
    .map((row) => {
      const cells = row.items
        .map(
          (item) =>
            `<td style="padding:2px 6px;font-size:${item.fontSize}px;font-family:${item.fontFamily};font-weight:${item.fontWeight};border:1px solid #ddd;white-space:pre-wrap;">${escapeHtml(item.text)}</td>`,
        )
        .join("");
      return `<tr>${cells}</tr>`;
    })
    .join("");

  return `<table style="position:absolute;left:${leftPercent}%;top:${topPercent}%;width:${Math.max(widthPercent, 10)}%;border-collapse:collapse;table-layout:auto;">${rows}</table>`;
};

// ── Render embedded images ──

const renderEmbeddedImages = (images: EmbeddedImage[]): string => {
  return images
    .map(
      (img) =>
        `<img src="${img.dataUrl}" style="position:absolute;left:${img.leftPercent}%;top:${img.topPercent}%;width:${img.widthPercent}%;height:${img.heightPercent}%;object-fit:contain;pointer-events:none;" alt="Imagem do documento" />`,
    )
    .join("");
};

// ── Build full page HTML ──

export const buildPixelPerfectPageHtml = (
  lines: TextLine[],
  tables: TableBlock[],
  backgroundBase64: string | null,
  _pageIndex: number,
  embeddedImages: EmbeddedImage[] = [],
): string => {
  const tableLineIndices = new Set<number>();
  tables.forEach((t) => {
    for (let i = t.startLineIdx; i <= t.endLineIdx; i++) tableLineIndices.add(i);
  });

  // Render embedded images
  const imagesHtml = embeddedImages.length > 0 ? renderEmbeddedImages(embeddedImages) : "";

  // Render non-table lines
  const textHtml = lines
    .filter((_, idx) => !tableLineIndices.has(idx))
    .map(renderTextLine)
    .join("");

  // Render table blocks
  const tableHtml = tables.map(renderTableBlock).join("");

  const bgStyle = backgroundBase64
    ? `background-image:url(${backgroundBase64});background-size:100% 100%;background-repeat:no-repeat;`
    : "";

  const textLayerStyle = backgroundBase64
    ? "color:transparent;"
    : "";

  return `<section class="contract-page" data-contract-page="true" data-has-background="${backgroundBase64 ? "true" : "false"}" style="position:relative;width:210mm;min-height:297mm;overflow:hidden;${bgStyle}page-break-after:always;"><div class="contract-page__content" style="position:relative;width:100%;min-height:297mm;${textLayerStyle}">${imagesHtml}${textHtml}${tableHtml}</div></section>`;
};

// ── Legacy fallback (simple absolute positioning) ──

export const buildSimplePageHtml = (items: ExtractedTextItem[]): string => {
  const positionedItems = items
    .map(
      (item) =>
        `<div style="position:absolute;left:${item.leftPercent}%;top:${item.topPercent}%;width:${Math.max(item.widthPercent, 2)}%;font-size:${item.fontSize}px;font-family:${item.fontFamily};font-weight:${item.fontWeight};line-height:1.15;white-space:pre-wrap;">${escapeHtml(item.text)}</div>`,
    )
    .join("");

  return `<section class="contract-page" data-contract-page="true"><div class="contract-page__content" style="position:relative;width:210mm;min-height:297mm;">${positionedItems}</div></section>`;
};
