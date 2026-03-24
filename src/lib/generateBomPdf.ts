/**
 * Gerador de PDF para Lista de Corte e Ferragens — OrçaMóvel Pro
 */
import jsPDF from "jspdf";
import type { ModuleBOM, ParametricModule } from "@/types/parametricModule";
import { calculateInternalSpans } from "./spanEngine";

export function generateBomPdf(module: ParametricModule, bom: ModuleBOM) {
  const doc = new jsPDF("p", "mm", "a4");
  const pw = 190; // page width usable
  let y = 15;

  // Header
  doc.setFontSize(16);
  doc.setFont("helvetica", "bold");
  doc.text("Lista de Corte e Ferragens", 105, y, { align: "center" });
  y += 8;
  doc.setFontSize(10);
  doc.setFont("helvetica", "normal");
  doc.text(`Módulo: ${module.name}`, 10, y);
  y += 5;
  doc.text(
    `Dimensões: ${module.width} × ${module.height} × ${module.depth} mm (L×A×P)  |  Chapa: ${module.thickness}mm  |  Fundo: ${module.backThickness}mm`,
    10, y
  );
  y += 5;
  if (module.baseboardHeight > 0) {
    doc.text(`Rodapé: ${module.baseboardHeight}mm`, 10, y);
    y += 5;
  }

  // Internal spans
  const spans = calculateInternalSpans(module);
  doc.text(
    `Vão Interno: ${spans.vaoInterno}mm  |  Largura Interna: ${spans.larguraInterna}mm  |  Vão Livre: ${spans.vaoLivre.toFixed(0)}mm`,
    10, y
  );
  y += 8;

  // Line
  doc.setDrawColor(180);
  doc.line(10, y, 200, y);
  y += 5;

  // Parts table
  doc.setFontSize(12);
  doc.setFont("helvetica", "bold");
  doc.text("Peças", 10, y);
  y += 6;

  // Table header
  const cols = [10, 70, 85, 110, 140, 165];
  const headers = ["Peça", "Qtd", "L × A (mm)", "Esp.", "Área m²", "Borda m"];
  doc.setFontSize(8);
  doc.setFont("helvetica", "bold");
  doc.setFillColor(240, 240, 240);
  doc.rect(10, y - 3, pw, 6, "F");
  headers.forEach((h, i) => doc.text(h, cols[i], y));
  y += 5;

  doc.setFont("helvetica", "normal");
  bom.parts.forEach((p) => {
    if (y > 270) {
      doc.addPage();
      y = 15;
    }
    doc.text(p.name, cols[0], y);
    doc.text(String(p.quantity), cols[1], y);
    doc.text(`${p.width.toFixed(0)} × ${p.height.toFixed(0)}`, cols[2], y);
    doc.text(`${p.thickness}mm`, cols[3], y);
    doc.text(p.area.toFixed(3), cols[4], y);
    doc.text(p.edgeBanding.toFixed(2), cols[5], y);
    y += 4.5;
  });

  // Totals
  y += 2;
  doc.setFont("helvetica", "bold");
  doc.text(`Área Total: ${bom.totalArea.toFixed(3)} m²`, 10, y);
  doc.text(`Fita de Borda Total: ${bom.totalEdgeBanding.toFixed(2)} m`, 100, y);
  y += 8;

  // Hardware
  doc.setDrawColor(180);
  doc.line(10, y, 200, y);
  y += 5;
  doc.setFontSize(12);
  doc.text("Ferragens", 10, y);
  y += 6;

  doc.setFontSize(8);
  doc.setFont("helvetica", "bold");
  doc.setFillColor(240, 240, 240);
  doc.rect(10, y - 3, pw, 6, "F");
  doc.text("Item", 10, y);
  doc.text("Qtd", 120, y);
  doc.text("Unidade", 150, y);
  y += 5;

  doc.setFont("helvetica", "normal");
  bom.hardware.forEach((h) => {
    if (y > 270) {
      doc.addPage();
      y = 15;
    }
    doc.text(h.name, 10, y);
    doc.text(String(h.quantity), 120, y);
    doc.text(h.unit, 150, y);
    y += 4.5;
  });

  // Footer
  y += 10;
  doc.setFontSize(7);
  doc.setTextColor(150);
  doc.text(`Gerado por OrçaMóvel Pro em ${new Date().toLocaleDateString("pt-BR")}`, 105, y, { align: "center" });

  doc.save(`Lista_Corte_${module.name.replace(/\s+/g, "_")}.pdf`);
}
