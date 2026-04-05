import * as pdfjsLib from "pdfjs-dist";
import pdfWorker from "pdfjs-dist/build/pdf.worker.min.mjs?url";
import type { PdfTextItem, ExtractedTextItem, TextLine, TableBlock, StructureBlock, SemanticBlockType } from "./types";
import { annotateLines } from "./semanticDetector";
import { normalizePageLayout } from "./layoutNormalizer";

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorker;

/** Re-export for external use */
export { pdfjsLib };

// ── Font helpers ──

const FONT_FAMILY_MAP: Record<string, string> = {
  courier: "Courier, monospace",
  helvetica: "Helvetica, Arial, sans-serif",
  arial: "Helvetica, Arial, sans-serif",
  times: "Times New Roman, serif",
  symbol: "Symbol, serif",
};

const resolveFontFamily = (fontName: string): string => {
  const lower = fontName.toLowerCase();
  for (const [key, value] of Object.entries(FONT_FAMILY_MAP)) {
    if (lower.includes(key)) return value;
  }
  return "Helvetica, Arial, sans-serif";
};

const resolveFontWeight = (fontName: string): string => {
  const lower = fontName.toLowerCase();
  if (lower.includes("bold") || lower.includes("black") || lower.includes("heavy")) return "bold";
  if (lower.includes("light") || lower.includes("thin")) return "300";
  return "normal";
};

// ── Text extraction ──

export const extractTextItems = (
  items: PdfTextItem[],
  pageWidth: number,
  pageHeight: number,
): ExtractedTextItem[] => {
  return items
    .map((item) => {
      const text = item.str.replace(/\s+/g, " ").trim();
      if (!text) return null;

      const x = item.transform[4];
      const y = item.transform[5];
      const fontSize = Math.max(Math.abs(item.transform[0] || item.height || 12), 8);
      const width = item.width || text.length * (fontSize * 0.52);
      const fontName = item.fontName || "";

      return {
        text,
        x,
        y,
        width,
        fontSize,
        fontFamily: resolveFontFamily(fontName),
        fontWeight: resolveFontWeight(fontName),
        leftPercent: (x / pageWidth) * 100,
        topPercent: ((pageHeight - y - fontSize) / pageHeight) * 100,
        widthPercent: (width / pageWidth) * 100,
      };
    })
    .filter(Boolean) as ExtractedTextItem[];
};

// ── Line grouping ──

export const groupTextLines = (items: ExtractedTextItem[]): TextLine[] => {
  if (items.length === 0) return [];

  // Sort by Y descending (PDF coordinates), then X ascending
  const sorted = [...items].sort((a, b) => b.y - a.y || a.x - b.x);

  const lines: TextLine[] = [];
  let currentLine: ExtractedTextItem[] = [sorted[0]];
  let currentY = sorted[0].y;
  let currentFontSize = sorted[0].fontSize;

  for (let i = 1; i < sorted.length; i++) {
    const item = sorted[i];
    const threshold = currentFontSize * 0.4;

    if (Math.abs(item.y - currentY) <= threshold) {
      currentLine.push(item);
    } else {
      // Finalize previous line
      currentLine.sort((a, b) => a.x - b.x);
      lines.push({
        y: currentY,
        topPercent: currentLine[0].topPercent,
        fontSize: Math.max(...currentLine.map((i) => i.fontSize)),
        items: currentLine,
      });
      currentLine = [item];
      currentY = item.y;
      currentFontSize = item.fontSize;
    }
  }

  // Finalize last line
  if (currentLine.length > 0) {
    currentLine.sort((a, b) => a.x - b.x);
    lines.push({
      y: currentY,
      topPercent: currentLine[0].topPercent,
      fontSize: Math.max(...currentLine.map((i) => i.fontSize)),
      items: currentLine,
    });
  }

  // Apply layout normalization to prevent overlaps and fix spacing
  return normalizePageLayout(lines);
};

// ── Table detection ──

const COLUMN_TOLERANCE = 8; // px tolerance for column alignment
const MIN_TABLE_ROWS = 3;

export const detectTableBlocks = (lines: TextLine[]): TableBlock[] => {
  const tables: TableBlock[] = [];
  let i = 0;

  while (i < lines.length) {
    const colCountsMap = new Map<string, number>();

    // Look ahead for consecutive lines with same number of items at similar X positions
    let j = i;
    const candidateLines: TextLine[] = [];

    while (j < lines.length) {
      const line = lines[j];
      if (line.items.length < 2) break; // Tables need at least 2 columns

      const xPositions = line.items.map((it) => Math.round(it.x / COLUMN_TOLERANCE) * COLUMN_TOLERANCE);
      const key = xPositions.join(",");

      if (candidateLines.length === 0) {
        candidateLines.push(line);
        colCountsMap.set(key, 1);
      } else {
        // Check if this line has similar column structure
        const prevLine = candidateLines[candidateLines.length - 1];
        if (line.items.length === prevLine.items.length) {
          candidateLines.push(line);
          colCountsMap.set(key, (colCountsMap.get(key) || 0) + 1);
        } else {
          break;
        }
      }
      j++;
    }

    if (candidateLines.length >= MIN_TABLE_ROWS) {
      const columns = candidateLines[0].items.map(
        (it) => Math.round(it.x / COLUMN_TOLERANCE) * COLUMN_TOLERANCE,
      );
      tables.push({
        startLineIdx: i,
        endLineIdx: i + candidateLines.length - 1,
        columns,
        rows: candidateLines,
      });
      i = j;
    } else {
      i++;
    }
  }

  return tables;
};

// ── Canvas background rendering ──

export const renderPageToBase64 = async (
  pdfDoc: pdfjsLib.PDFDocumentProxy,
  pageNumber: number,
  scale = 2,
): Promise<string> => {
  const page = await pdfDoc.getPage(pageNumber);
  const viewport = page.getViewport({ scale });
  const canvas = document.createElement("canvas");
  canvas.width = viewport.width;
  canvas.height = viewport.height;
  const ctx = canvas.getContext("2d")!;
  await page.render({ canvasContext: ctx, viewport, canvas } as any).promise;
  return canvas.toDataURL("image/png");
};

// ── Embedded image extraction via getOperatorList ──

export interface EmbeddedImage {
  dataUrl: string;
  x: number;
  y: number;
  width: number;
  height: number;
  leftPercent: number;
  topPercent: number;
  widthPercent: number;
  heightPercent: number;
}

/**
 * Extract embedded images/logos from a PDF page using getOperatorList().
 * Renders each image object to a small canvas and returns as data URLs.
 */
export const extractEmbeddedImages = async (
  page: pdfjsLib.PDFPageProxy,
  pageWidth: number,
  pageHeight: number,
): Promise<EmbeddedImage[]> => {
  const images: EmbeddedImage[] = [];

  try {
    const ops = await page.getOperatorList();
    const OPS = pdfjsLib.OPS;

    // Track current transform matrix
    let ctm = [1, 0, 0, 1, 0, 0];
    const matrixStack: number[][] = [];

    for (let i = 0; i < ops.fnArray.length; i++) {
      const fn = ops.fnArray[i];
      const args = ops.argsArray[i];

      if (fn === OPS.save) {
        matrixStack.push([...ctm]);
      } else if (fn === OPS.restore) {
        ctm = matrixStack.pop() || [1, 0, 0, 1, 0, 0];
      } else if (fn === OPS.transform) {
        // Multiply matrices
        const [a, b, c, d, e, f] = args as number[];
        const [ca, cb, cc, cd, ce, cf] = ctm;
        ctm = [
          ca * a + cc * b,
          cb * a + cd * b,
          ca * c + cc * d,
          cb * c + cd * d,
          ca * e + cc * f + ce,
          cb * e + cd * f + cf,
        ];
      } else if (fn === OPS.paintImageXObject || fn === OPS.paintJpegXObject) {
        const imgName = args[0] as string;
        try {
          const imgData = await new Promise<any>((resolve, reject) => {
            page.objs.get(imgName, (obj: any) => {
              if (obj) resolve(obj);
              else reject(new Error("Image not found"));
            });
          });

          // imgData can be an ImageBitmap or an object with {data, width, height}
          const imgWidth = imgData.width || 0;
          const imgHeight = imgData.height || 0;
          if (imgWidth < 10 || imgHeight < 10) continue; // Skip tiny images (artifacts)

          // Render to canvas
          const canvas = document.createElement("canvas");
          canvas.width = imgWidth;
          canvas.height = imgHeight;
          const ctx = canvas.getContext("2d")!;

          if (imgData instanceof ImageBitmap) {
            ctx.drawImage(imgData, 0, 0);
          } else if (imgData.data) {
            // Raw pixel data
            const imageData = ctx.createImageData(imgWidth, imgHeight);
            const src = imgData.data;
            const dest = imageData.data;

            if (imgData.kind === 2) {
              // RGBAImage
              dest.set(src);
            } else {
              // RGB — expand to RGBA
              for (let p = 0, q = 0; p < src.length; p += 3, q += 4) {
                dest[q] = src[p];
                dest[q + 1] = src[p + 1];
                dest[q + 2] = src[p + 2];
                dest[q + 3] = 255;
              }
            }
            ctx.putImageData(imageData, 0, 0);
          } else {
            continue;
          }

          // Position from current transform matrix
          const x = ctm[4];
          const y = ctm[5];
          const w = Math.abs(ctm[0]) || imgWidth;
          const h = Math.abs(ctm[3]) || imgHeight;

          images.push({
            dataUrl: canvas.toDataURL("image/png"),
            x,
            y,
            width: w,
            height: h,
            leftPercent: (x / pageWidth) * 100,
            topPercent: ((pageHeight - y - h) / pageHeight) * 100,
            widthPercent: (w / pageWidth) * 100,
            heightPercent: (h / pageHeight) * 100,
          });
        } catch {
          // Skip images that can't be decoded
        }
      }
    }
  } catch (err) {
    console.warn("Image extraction failed:", err);
  }

  return images;
};

// ── Structure blocks ──

export const buildStructureBlocks = (
  lines: TextLine[],
  tables: TableBlock[],
  pageWidth: number,
  _pageHeight: number,
): StructureBlock[] => {
  const blocks: StructureBlock[] = [];
  const tableLineIndices = new Set<number>();
  tables.forEach((t) => {
    for (let i = t.startLineIdx; i <= t.endLineIdx; i++) tableLineIndices.add(i);
  });

  // Annotate lines with semantic types
  const annotated = annotateLines(lines);

  // Add table blocks
  for (const table of tables) {
    const firstLine = table.rows[0];
    const lastLine = table.rows[table.rows.length - 1];
    const children: StructureBlock[] = table.rows.flatMap((row) =>
      row.items.map((item) => ({
        type: "text" as const,
        x: item.x,
        y: item.y,
        w: item.width,
        h: item.fontSize,
        content: item.text,
        fontSize: item.fontSize,
        fontFamily: item.fontFamily,
        fontWeight: item.fontWeight,
      })),
    );
    blocks.push({
      type: "table",
      semantic: "tabela",
      x: Math.min(...firstLine.items.map((i) => i.x)),
      y: firstLine.y,
      w: pageWidth,
      h: Math.abs(firstLine.y - lastLine.y) + lastLine.fontSize,
      content: "",
      children,
    });
  }

  // Add text blocks with semantic annotation
  annotated.forEach(({ line, semantic }, idx) => {
    if (tableLineIndices.has(idx)) return;
    const joinedText = line.items.map((i) => i.text).join(" ");
    blocks.push({
      type: "text",
      semantic,
      x: line.items[0].x,
      y: line.y,
      w: Math.max(...line.items.map((i) => i.x + i.width)) - line.items[0].x,
      h: line.fontSize,
      content: joinedText,
      fontSize: line.fontSize,
      fontFamily: line.items[0].fontFamily,
      fontWeight: line.items[0].fontWeight,
    });
  });

  return blocks;
};
