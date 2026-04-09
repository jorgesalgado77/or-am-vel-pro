import { jsPDF } from "jspdf";
import { Document, Packer, Paragraph, TextRun, ImageRun, Table, TableRow, TableCell, WidthType, ShadingType, BorderStyle, AlignmentType } from "docx";
import { saveAs } from "file-saver";
import { toast } from "sonner";
import { type PageData, type CanvasElement, A4_WIDTH, A4_HEIGHT, hexToRgb } from "./types";

function drawText(doc: jsPDF, el: CanvasElement) {
  if (!el.text) return;
  const c = hexToRgb(el.color || "#000000");
  if (c) doc.setTextColor(c.r, c.g, c.b);
  const fontStyle = el.fontWeight === "bold" && el.fontStyle === "italic" ? "bolditalic"
    : el.fontWeight === "bold" ? "bold"
    : el.fontStyle === "italic" ? "italic" : "normal";
  doc.setFont("helvetica", fontStyle);
  doc.setFontSize(el.fontSize * 0.75);
  const padding = el.type === "text" ? 0 : 8;
  const maxW = el.width - padding * 2;
  const lines = doc.splitTextToSize(el.text, maxW);
  const lineH = el.fontSize * 0.85;
  const totalH = lines.length * lineH;
  let startY: number;
  if (el.type === "text") {
    startY = el.y + el.fontSize * 0.75;
  } else {
    startY = el.y + (el.height - totalH) / 2 + el.fontSize * 0.75;
  }
  const align = el.textAlign || "left";
  for (let i = 0; i < lines.length; i++) {
    let lx = el.x + padding;
    if (align === "center") lx = el.x + el.width / 2;
    else if (align === "right") lx = el.x + el.width - padding;
    doc.text(lines[i], lx, startY + i * lineH, { align: align as any });
  }
}

export async function exportToPdf(pages: PageData[]) {
  const doc = new jsPDF({ orientation: "portrait", unit: "px", format: [A4_WIDTH, A4_HEIGHT] });

  for (let pageIdx = 0; pageIdx < pages.length; pageIdx++) {
    if (pageIdx > 0) doc.addPage([A4_WIDTH, A4_HEIGHT]);
    const page = pages[pageIdx];
    const sortedEls = [...page.elements].sort((a, b) => a.zIndex - b.zIndex);

    if (page.backgroundImage) {
      doc.saveGraphicsState();
      (doc as any).setGState(new (doc as any).GState({ opacity: page.backgroundOpacity }));
      doc.addImage(page.backgroundImage, "PNG", 0, 0, A4_WIDTH, A4_HEIGHT);
      doc.restoreGraphicsState();
    }

    for (const el of sortedEls) {
      switch (el.type) {
        case "rect": {
          if (el.fill && el.fill !== "transparent") {
            const c = hexToRgb(el.fill);
            if (c) doc.setFillColor(c.r, c.g, c.b);
            if (el.borderRadius > 0) doc.roundedRect(el.x, el.y, el.width, el.height, el.borderRadius, el.borderRadius, "F");
            else doc.rect(el.x, el.y, el.width, el.height, "F");
          }
          if (el.stroke && el.stroke !== "transparent" && el.strokeWidth > 0) {
            const c = hexToRgb(el.stroke);
            if (c) doc.setDrawColor(c.r, c.g, c.b);
            doc.setLineWidth(el.strokeWidth);
            if (el.borderRadius > 0) doc.roundedRect(el.x, el.y, el.width, el.height, el.borderRadius, el.borderRadius, "S");
            else doc.rect(el.x, el.y, el.width, el.height, "S");
          }
          if (el.text) drawText(doc, el);
          break;
        }
        case "circle": {
          const rx = el.width / 2, ry = el.height / 2;
          const cx = el.x + rx, cy = el.y + ry;
          if (el.fill && el.fill !== "transparent") {
            const c = hexToRgb(el.fill);
            if (c) doc.setFillColor(c.r, c.g, c.b);
            doc.ellipse(cx, cy, rx, ry, "F");
          }
          if (el.stroke && el.stroke !== "transparent" && el.strokeWidth > 0) {
            const c = hexToRgb(el.stroke);
            if (c) doc.setDrawColor(c.r, c.g, c.b);
            doc.setLineWidth(el.strokeWidth);
            doc.ellipse(cx, cy, rx, ry, "S");
          }
          if (el.text) drawText(doc, el);
          break;
        }
        case "line": {
          const c = hexToRgb(el.stroke);
          if (c) doc.setDrawColor(c.r, c.g, c.b);
          doc.setLineWidth(el.strokeWidth);
          doc.line(el.x, el.y, el.x + el.width, el.y);
          break;
        }
        case "text": drawText(doc, el); break;
        case "image": {
          if (el.imageUrl) {
            try { doc.addImage(el.imageUrl, "PNG", el.x, el.y, el.width, el.height); } catch { /* skip */ }
          }
          break;
        }
        case "table": {
          if (el.tableData) {
            const rows = el.tableData.length;
            const cols = el.tableData[0]?.length || 1;
            const cellW = el.width / cols;
            const cellH = el.height / rows;
            doc.setLineWidth(0.5);
            const sc = hexToRgb(el.stroke);
            if (sc) doc.setDrawColor(sc.r, sc.g, sc.b);
            for (let ri = 0; ri < rows; ri++) {
              for (let ci = 0; ci < cols; ci++) {
                const cx = el.x + ci * cellW;
                const cy = el.y + ri * cellH;
                if (ri === 0 && sc) {
                  doc.setFillColor(sc.r, sc.g, sc.b);
                  doc.rect(cx, cy, cellW, cellH, "FD");
                  doc.setTextColor(255, 255, 255);
                } else {
                  doc.rect(cx, cy, cellW, cellH, "S");
                  doc.setTextColor(0, 0, 0);
                }
                doc.setFontSize(el.fontSize * 0.75);
                doc.setFont("helvetica", ri === 0 ? "bold" : "normal");
                const txt = el.tableData[ri][ci] || "";
                doc.text(txt, cx + 4, cy + cellH / 2 + 3, { maxWidth: cellW - 8 });
              }
            }
          }
          break;
        }
      }
    }
  }

  doc.save("contrato.pdf");
  toast.success("PDF exportado com sucesso!");
}

export async function exportToDocx(pages: PageData[]) {
  const sections = [];

  for (let pageIdx = 0; pageIdx < pages.length; pageIdx++) {
    const page = pages[pageIdx];
    const sortedEls = [...page.elements].sort((a, b) => a.zIndex - b.zIndex);
    const children: (Paragraph | Table)[] = [];

    const textEls = sortedEls.filter(el => el.type === "text" || ((el.type === "rect" || el.type === "circle") && el.text));
    const imageEls = sortedEls.filter(el => el.type === "image" && el.imageUrl);
    const lineEls = sortedEls.filter(el => el.type === "line");
    const tableEls = sortedEls.filter(el => el.type === "table" && el.tableData);

    const flowEls = [...textEls, ...imageEls, ...lineEls, ...tableEls].sort((a, b) => a.y - b.y || a.x - b.x);

    for (const el of flowEls) {
      if (el.type === "line") {
        children.push(new Paragraph({
          border: { bottom: { style: BorderStyle.SINGLE, size: el.strokeWidth * 4, color: el.stroke.replace("#", "") } },
          children: [],
        }));
        continue;
      }

      if (el.type === "image" && el.imageUrl) {
        try {
          const base64 = el.imageUrl.split(",")[1];
          const binary = atob(base64);
          const bytes = new Uint8Array(binary.length);
          for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
          const ext = el.imageUrl.includes("image/png") ? "png" : "jpg";
          children.push(new Paragraph({
            children: [new ImageRun({
              type: ext as "png" | "jpg",
              data: bytes,
              transformation: { width: el.width * 0.75, height: el.height * 0.75 },
            })],
          }));
        } catch { /* skip */ }
        continue;
      }

      if (el.type === "table" && el.tableData) {
        const colCount = el.tableData[0]?.length || 1;
        const colW = Math.floor(9360 / colCount);
        const cellBorder = { style: BorderStyle.SINGLE, size: 1, color: el.stroke?.replace("#", "") || "333333" };
        const cellBorders = { top: cellBorder, bottom: cellBorder, left: cellBorder, right: cellBorder };
        children.push(new Table({
          width: { size: 9360, type: WidthType.DXA },
          columnWidths: Array(colCount).fill(colW),
          rows: el.tableData.map((row, ri) => new TableRow({
            children: row.map(cell => new TableCell({
              borders: cellBorders,
              width: { size: colW, type: WidthType.DXA },
              shading: ri === 0 ? { fill: el.stroke?.replace("#", "") || "333333", type: ShadingType.CLEAR } : undefined,
              children: [new Paragraph({
                children: [new TextRun({
                  text: cell,
                  font: el.fontFamily,
                  size: Math.round(el.fontSize * 1.5),
                  bold: ri === 0,
                  color: ri === 0 ? "FFFFFF" : el.color?.replace("#", "") || "000000",
                })],
              })],
            })),
          })),
        }));
        continue;
      }

      const text = el.text || "";
      if (!text.trim()) continue;

      const alignment = el.textAlign === "center" ? AlignmentType.CENTER
        : el.textAlign === "right" ? AlignmentType.RIGHT
        : el.textAlign === "justify" ? AlignmentType.JUSTIFIED
        : AlignmentType.LEFT;

      const textLines = text.split("\n");
      for (const line of textLines) {
        children.push(new Paragraph({
          alignment,
          spacing: { after: 80 },
          children: [new TextRun({
            text: line,
            font: el.fontFamily,
            size: Math.round(el.fontSize * 1.5),
            bold: el.fontWeight === "bold",
            italics: el.fontStyle === "italic",
            color: el.color?.replace("#", "") || "000000",
          })],
        }));
      }
    }

    if (children.length === 0) {
      children.push(new Paragraph({ children: [new TextRun({ text: " " })] }));
    }

    sections.push({
      properties: pageIdx > 0 ? { page: { size: { width: 11906, height: 16838 } } } : {},
      children,
    });
  }

  const doc = new Document({ sections });
  const blob = await Packer.toBlob(doc);
  saveAs(blob, "contrato.docx");
  toast.success("DOCX exportado com sucesso!");
}

export async function exportToXlsx(pages: PageData[]) {
  const XLSX = await import("xlsx");
  const wb = XLSX.utils.book_new();

  for (let pageIdx = 0; pageIdx < pages.length; pageIdx++) {
    const page = pages[pageIdx];
    const sortedEls = [...page.elements].sort((a, b) => a.y - b.y || a.x - b.x);
    const rows: string[][] = [];

    for (const el of sortedEls) {
      if (el.type === "table" && el.tableData) {
        for (const row of el.tableData) rows.push([...row]);
        rows.push([]);
      } else if (el.type === "text" && el.text?.trim()) {
        rows.push([el.text]);
      } else if ((el.type === "rect" || el.type === "circle") && el.text?.trim()) {
        rows.push([el.text]);
      }
    }

    if (rows.length === 0) rows.push(["(Página vazia)"]);
    const ws = XLSX.utils.aoa_to_sheet(rows);
    XLSX.utils.book_append_sheet(wb, ws, `Página ${pageIdx + 1}`);
  }

  XLSX.writeFile(wb, "contrato.xlsx");
  toast.success("Excel exportado com sucesso!");
}
