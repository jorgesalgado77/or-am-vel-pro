import jsPDF from "jspdf";
import { formatCurrency } from "@/lib/financing";

interface RegimeSummary {
  regime: string;
  count: number;
  totalBruto: number;
  totalDescontos: number;
  totalLiquido: number;
  totalCustoEmpresa: number;
}

interface EmployeeCostRow {
  nome: string;
  regime: string;
  salario: number;
  comissoes: number;
  bruto: number;
  descontos: number;
  liquido: number;
  custoEmpresa: number;
}

interface PayrollPdfData {
  companyName: string;
  mesReferencia: string;
  regimeSummaries: RegimeSummary[];
  employees: EmployeeCostRow[];
  totals: {
    totalBruto: number;
    totalDescontos: number;
    totalLiquido: number;
    totalCustoEmpresa: number;
    count: number;
  };
  chartImages?: { pie?: string; bar?: string };
}

const REGIME_COLORS: Record<string, [number, number, number]> = {
  CLT: [34, 197, 94],
  MEI: [59, 130, 246],
  Freelancer: [245, 158, 11],
  "Sem regime": [156, 163, 175],
};

export function generatePayrollPdf(data: PayrollPdfData) {
  const doc = new jsPDF("p", "mm", "a4");
  const pageWidth = doc.internal.pageSize.getWidth();
  const margin = 15;
  const contentWidth = pageWidth - margin * 2;
  let y = margin;

  // ========== HEADER ==========
  doc.setFillColor(30, 41, 59);
  doc.rect(0, 0, pageWidth, 32, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(16);
  doc.setFont("helvetica", "bold");
  doc.text(data.companyName || "Empresa", margin, 14);
  doc.setFontSize(10);
  doc.setFont("helvetica", "normal");
  doc.text(`RESUMO DA FOLHA DE PAGAMENTO — ${data.mesReferencia}`, margin, 22);
  doc.setFontSize(8);
  doc.text(`Gerado em ${new Date().toLocaleDateString("pt-BR")} às ${new Date().toLocaleTimeString("pt-BR")}`, margin, 28);

  y = 40;
  doc.setTextColor(0, 0, 0);

  // ========== REGIME SUMMARY CARDS ==========
  doc.setFontSize(11);
  doc.setFont("helvetica", "bold");
  doc.text("Resumo por Regime", margin, y);
  y += 6;

  const cardWidth = (contentWidth - (data.regimeSummaries.length - 1) * 4) / Math.min(data.regimeSummaries.length, 4);

  data.regimeSummaries.forEach((r, i) => {
    const x = margin + i * (cardWidth + 4);
    const color = REGIME_COLORS[r.regime] || [156, 163, 175];

    // Card border
    doc.setDrawColor(color[0], color[1], color[2]);
    doc.setLineWidth(0.8);
    doc.roundedRect(x, y, cardWidth, 36, 2, 2, "S");

    // Regime badge
    doc.setFillColor(color[0], color[1], color[2]);
    doc.roundedRect(x + 3, y + 3, 20, 5, 1, 1, "F");
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(7);
    doc.setFont("helvetica", "bold");
    doc.text(r.regime, x + 4, y + 6.5);

    // Count
    doc.setTextColor(100, 100, 100);
    doc.setFont("helvetica", "normal");
    doc.text(`${r.count} func.`, x + cardWidth - 3, y + 6.5, { align: "right" });

    // Values
    doc.setTextColor(0, 0, 0);
    doc.setFontSize(7);
    const labels = ["Bruto", "Descontos", "Líquido", "Custo Empresa"];
    const values = [r.totalBruto, r.totalDescontos, r.totalLiquido, r.totalCustoEmpresa];
    labels.forEach((label, li) => {
      const ly = y + 13 + li * 5;
      doc.setFont("helvetica", "normal");
      doc.setTextColor(120, 120, 120);
      doc.text(label, x + 3, ly);
      doc.setFont("helvetica", "bold");
      if (li === 1) doc.setTextColor(220, 38, 38);
      else if (li === 3) doc.setTextColor(color[0], color[1], color[2]);
      else doc.setTextColor(0, 0, 0);
      doc.text(formatCurrency(values[li]), x + cardWidth - 3, ly, { align: "right" });
    });
  });

  y += 42;

  // ========== CHARTS (if available) ==========
  if (data.chartImages?.pie || data.chartImages?.bar) {
    y += 4;
    doc.setFontSize(11);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(0, 0, 0);
    doc.text("Gráficos", margin, y);
    y += 4;

    const chartHeight = 55;
    const halfWidth = (contentWidth - 4) / 2;

    if (data.chartImages.pie) {
      try {
        doc.addImage(data.chartImages.pie, "PNG", margin, y, halfWidth, chartHeight);
      } catch {
        // fallback: skip if image fails
      }
    }
    if (data.chartImages.bar) {
      try {
        doc.addImage(data.chartImages.bar, "PNG", margin + halfWidth + 4, y, halfWidth, chartHeight);
      } catch {
        // fallback
      }
    }
    y += chartHeight + 6;
  }

  // ========== EMPLOYEE TABLE ==========
  // Check if we need a new page
  if (y > 200) {
    doc.addPage();
    y = margin;
  }

  doc.setFontSize(11);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(0, 0, 0);
  doc.text("Detalhamento por Funcionário", margin, y);
  y += 5;

  // Table header
  const cols = [
    { label: "Funcionário", width: 32 },
    { label: "Regime", width: 18 },
    { label: "Salário", width: 22 },
    { label: "Comissões", width: 22 },
    { label: "Bruto", width: 22 },
    { label: "Descontos", width: 22 },
    { label: "Líquido", width: 22 },
    { label: "Custo Emp.", width: 22 },
  ];

  const totalColWidth = cols.reduce((s, c) => s + c.width, 0);
  const scale = contentWidth / totalColWidth;
  cols.forEach(c => (c.width = c.width * scale));

  // Header row
  doc.setFillColor(241, 245, 249);
  doc.rect(margin, y, contentWidth, 7, "F");
  doc.setFontSize(6.5);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(50, 50, 50);
  let cx = margin;
  cols.forEach(col => {
    doc.text(col.label, cx + 1.5, y + 4.5);
    cx += col.width;
  });
  y += 7;

  // Data rows
  doc.setFont("helvetica", "normal");
  doc.setFontSize(6.5);

  data.employees.forEach((e, i) => {
    if (y > 275) {
      doc.addPage();
      y = margin;
    }

    if (i % 2 === 0) {
      doc.setFillColor(248, 250, 252);
      doc.rect(margin, y, contentWidth, 6, "F");
    }

    cx = margin;
    doc.setTextColor(0, 0, 0);
    doc.setFont("helvetica", "normal");
    doc.text(e.nome.substring(0, 18), cx + 1.5, y + 4);
    cx += cols[0].width;

    const color = REGIME_COLORS[e.regime] || [156, 163, 175];
    doc.setTextColor(color[0], color[1], color[2]);
    doc.setFont("helvetica", "bold");
    doc.text(e.regime, cx + 1.5, y + 4);
    cx += cols[1].width;

    doc.setTextColor(0, 0, 0);
    doc.setFont("helvetica", "normal");
    const values = [e.salario, e.comissoes, e.bruto, e.descontos, e.liquido, e.custoEmpresa];
    values.forEach((v, vi) => {
      if (vi === 3) doc.setTextColor(220, 38, 38); // descontos in red
      else if (vi === 5) doc.setTextColor(59, 130, 246); // custo empresa in blue
      else doc.setTextColor(0, 0, 0);
      const txt = vi === 1 && v === 0 ? "—" : (vi === 3 ? `- ${formatCurrency(v)}` : formatCurrency(v));
      doc.text(txt, cx + cols[vi + 2].width - 1.5, y + 4, { align: "right" });
      cx += cols[vi + 2].width;
    });

    y += 6;
  });

  // Total row
  doc.setFillColor(226, 232, 240);
  doc.rect(margin, y, contentWidth, 7, "F");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(7);
  doc.setTextColor(0, 0, 0);
  cx = margin;
  doc.text("TOTAL GERAL", cx + 1.5, y + 4.5);
  cx += cols[0].width + cols[1].width;

  const totalValues = [
    data.employees.reduce((s, e) => s + e.salario, 0),
    data.employees.reduce((s, e) => s + e.comissoes, 0),
    data.totals.totalBruto,
    data.totals.totalDescontos,
    data.totals.totalLiquido,
    data.totals.totalCustoEmpresa,
  ];
  totalValues.forEach((v, vi) => {
    if (vi === 3) doc.setTextColor(220, 38, 38);
    else if (vi === 5) doc.setTextColor(59, 130, 246);
    else doc.setTextColor(0, 0, 0);
    const txt = vi === 3 ? `- ${formatCurrency(v)}` : formatCurrency(v);
    doc.text(txt, cx + cols[vi + 2].width - 1.5, y + 4.5, { align: "right" });
    cx += cols[vi + 2].width;
  });
  y += 12;

  // ========== GRAND TOTALS ==========
  if (y > 260) {
    doc.addPage();
    y = margin;
  }

  // Three highlight boxes
  const boxW = (contentWidth - 8) / 3;

  // Líquido
  doc.setFillColor(236, 253, 245);
  doc.setDrawColor(34, 197, 94);
  doc.setLineWidth(0.5);
  doc.roundedRect(margin, y, boxW, 20, 2, 2, "FD");
  doc.setFontSize(7);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(100, 100, 100);
  doc.text("Total Líquido (Pagamento)", margin + boxW / 2, y + 7, { align: "center" });
  doc.setFontSize(12);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(22, 163, 74);
  doc.text(formatCurrency(data.totals.totalLiquido), margin + boxW / 2, y + 15, { align: "center" });

  // Descontos
  const x2 = margin + boxW + 4;
  doc.setFillColor(254, 242, 242);
  doc.setDrawColor(220, 38, 38);
  doc.roundedRect(x2, y, boxW, 20, 2, 2, "FD");
  doc.setFontSize(7);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(100, 100, 100);
  doc.text("Total Impostos e Descontos", x2 + boxW / 2, y + 7, { align: "center" });
  doc.setFontSize(12);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(220, 38, 38);
  doc.text(formatCurrency(data.totals.totalDescontos), x2 + boxW / 2, y + 15, { align: "center" });

  // Custo Empresa
  const x3 = x2 + boxW + 4;
  doc.setFillColor(239, 246, 255);
  doc.setDrawColor(59, 130, 246);
  doc.roundedRect(x3, y, boxW, 20, 2, 2, "FD");
  doc.setFontSize(7);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(100, 100, 100);
  doc.text("Custo Total Empresa", x3 + boxW / 2, y + 7, { align: "center" });
  doc.setFontSize(12);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(37, 99, 235);
  doc.text(formatCurrency(data.totals.totalCustoEmpresa), x3 + boxW / 2, y + 15, { align: "center" });

  // Footer
  const pageCount = doc.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    doc.setFontSize(7);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(150, 150, 150);
    doc.text(
      `Página ${i} de ${pageCount}`,
      pageWidth / 2,
      doc.internal.pageSize.getHeight() - 8,
      { align: "center" }
    );
  }

  doc.save(`Folha_Pagamento_${data.mesReferencia.replace("/", "-")}.pdf`);
}
