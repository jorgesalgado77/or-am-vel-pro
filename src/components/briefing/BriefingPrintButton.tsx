/**
 * PDF generation button for briefing — generates a professional PDF document.
 * Uses jsPDF for PDF creation with company branding and logo.
 */
import { useCallback, useState } from "react";
import { Button } from "@/components/ui/button";
import { FileDown, Printer } from "lucide-react";
import { useCompanySettings } from "@/hooks/useCompanySettings";
import jsPDF from "jspdf";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { FIELD_LABELS, SECTIONS, formatValue } from "./briefingPdfData";

interface BriefingPrintButtonProps {
  clientName: string;
  orcamentoNumero?: string;
  responses: Record<string, any>;
}

async function loadImageAsBase64(url: string): Promise<string | null> {
  try {
    const res = await fetch(url, { mode: "cors" });
    if (!res.ok) return null;
    const blob = await res.blob();
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result as string);
      reader.onerror = () => resolve(null);
      reader.readAsDataURL(blob);
    });
  } catch {
    return null;
  }
}

export function BriefingPrintButton({ clientName, orcamentoNumero, responses }: BriefingPrintButtonProps) {
  const { settings } = useCompanySettings();
  const [generating, setGenerating] = useState(false);

  const handleGeneratePdf = useCallback(async () => {
    setGenerating(true);
    try {
      const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
      const pageW = doc.internal.pageSize.getWidth();
      const pageH = doc.internal.pageSize.getHeight();
      const marginL = 15;
      const marginR = 15;
      const contentW = pageW - marginL - marginR;
      let y = 15;

      const primaryColor: [number, number, number] = [30, 64, 175];
      const headerBg: [number, number, number] = [241, 245, 249];
      const textColor: [number, number, number] = [30, 41, 59];
      const mutedColor: [number, number, number] = [100, 116, 139];

      const checkPage = (needed: number) => {
        if (y + needed > pageH - 20) {
          doc.addPage();
          y = 15;
        }
      };

      // ===== HEADER =====
      doc.setFillColor(...primaryColor);
      doc.rect(0, 0, pageW, 28, "F");

      // Try to load company logo
      let logoLoaded = false;
      if (settings.logo_url) {
        try {
          const base64 = await loadImageAsBase64(settings.logo_url);
          if (base64) {
            const img = new Image();
            await new Promise<void>((resolve) => {
              img.onload = () => resolve();
              img.onerror = () => resolve();
              img.src = base64;
            });
            if (img.width > 0) {
              const logoH = 16;
              const logoW = (img.width / img.height) * logoH;
              const logoX = marginL;
              const logoY = 6;
              doc.addImage(base64, "PNG", logoX, logoY, Math.min(logoW, 40), logoH);
              logoLoaded = true;

              // Company name next to logo
              doc.setTextColor(255, 255, 255);
              doc.setFontSize(14);
              doc.setFont("helvetica", "bold");
              doc.text(settings.company_name || "OrçaMóvel PRO", logoX + Math.min(logoW, 40) + 4, 16);
            }
          }
        } catch {
          // fallback to text-only header
        }
      }

      if (!logoLoaded) {
        doc.setTextColor(255, 255, 255);
        doc.setFontSize(18);
        doc.setFont("helvetica", "bold");
        doc.text(settings.company_name || "OrçaMóvel PRO", marginL, 13);
      }

      doc.setTextColor(255, 255, 255);
      doc.setFontSize(9);
      doc.setFont("helvetica", "normal");
      if (settings.company_subtitle) {
        doc.text(settings.company_subtitle, marginL, logoLoaded ? 24 : 19);
      }

      const infoLine = [
        settings.telefone_loja,
        settings.email_loja,
        settings.cidade_loja ? `${settings.cidade_loja}/${settings.uf_loja}` : null,
      ].filter(Boolean).join("  •  ");
      if (infoLine) {
        doc.setFontSize(7);
        doc.text(infoLine, marginL, logoLoaded ? 27 : 24);
      }

      y = 35;

      // ===== TITLE =====
      doc.setTextColor(...primaryColor);
      doc.setFontSize(14);
      doc.setFont("helvetica", "bold");
      doc.text("BRIEFING DO CLIENTE", marginL, y);
      y += 6;

      doc.setTextColor(...mutedColor);
      doc.setFontSize(9);
      doc.setFont("helvetica", "normal");
      doc.text(`Cliente: ${clientName}`, marginL, y);
      if (orcamentoNumero) {
        doc.text(`Orçamento: ${orcamentoNumero}`, pageW - marginR, y, { align: "right" });
      }
      y += 5;
      doc.text(
        `Gerado em: ${format(new Date(), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}`,
        marginL, y
      );
      y += 8;

      doc.setDrawColor(...primaryColor);
      doc.setLineWidth(0.5);
      doc.line(marginL, y, pageW - marginR, y);
      y += 6;

      // ===== SECTIONS =====
      for (const section of SECTIONS) {
        const filledKeys = section.keys.filter(k => {
          const v = responses[k];
          return v !== null && v !== undefined && v !== "" && !(Array.isArray(v) && v.length === 0);
        });
        if (filledKeys.length === 0) continue;

        checkPage(16);

        doc.setFillColor(...headerBg);
        doc.roundedRect(marginL, y, contentW, 7, 1, 1, "F");
        doc.setTextColor(...primaryColor);
        doc.setFontSize(10);
        doc.setFont("helvetica", "bold");
        doc.text(section.title, marginL + 3, y + 5);
        y += 10;

        for (const key of filledKeys) {
          const label = FIELD_LABELS[key] || key;
          const value = formatValue(responses[key]);

          const valueLines = doc.splitTextToSize(value, contentW - 55);
          const lineHeight = 4.5;
          const neededH = Math.max(lineHeight, valueLines.length * lineHeight) + 2;
          checkPage(neededH);

          doc.setTextColor(...mutedColor);
          doc.setFontSize(8);
          doc.setFont("helvetica", "bold");
          doc.text(label, marginL + 3, y + 3.5);

          doc.setTextColor(...textColor);
          doc.setFontSize(8);
          doc.setFont("helvetica", "normal");
          doc.text(valueLines, marginL + 55, y + 3.5);

          doc.setDrawColor(226, 232, 240);
          doc.setLineWidth(0.2);
          doc.line(marginL + 3, y + neededH - 1, pageW - marginR - 3, y + neededH - 1);

          y += neededH;
        }
        y += 4;
      }

      // ===== FOOTER =====
      const totalPages = doc.getNumberOfPages();
      for (let i = 1; i <= totalPages; i++) {
        doc.setPage(i);
        doc.setFontSize(7);
        doc.setTextColor(...mutedColor);
        doc.text(
          `${settings.company_name || "OrçaMóvel PRO"} — Briefing de ${clientName} — Página ${i}/${totalPages}`,
          pageW / 2, pageH - 8, { align: "center" }
        );
      }

      doc.save(`Briefing_${clientName.replace(/\s+/g, "_")}_${format(new Date(), "yyyyMMdd")}.pdf`);
    } catch (err) {
      console.error("Erro ao gerar PDF:", err);
    } finally {
      setGenerating(false);
    }
  }, [clientName, orcamentoNumero, responses, settings]);

  const handlePrint = useCallback(() => {
    const rows = Object.entries(responses)
      .filter(([, v]) => v !== null && v !== undefined && v !== "" && !(Array.isArray(v) && v.length === 0))
      .map(([key, val]) => {
        const label = FIELD_LABELS[key] || key;
        return `<tr><td style="padding:6px 10px;font-weight:600;border:1px solid #ddd;background:#f9f9f9;white-space:nowrap;vertical-align:top">${label}</td><td style="padding:6px 10px;border:1px solid #ddd">${formatValue(val)}</td></tr>`;
      })
      .join("");

    const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Briefing — ${clientName}</title>
    <style>body{font-family:Arial,sans-serif;padding:30px;color:#222}h1{font-size:18px;margin-bottom:4px}
    .sub{color:#666;font-size:13px;margin-bottom:20px}table{width:100%;border-collapse:collapse;font-size:13px}
    @media print{body{padding:15px}}</style></head>
    <body><h1>📋 Briefing — ${clientName}</h1>
    ${orcamentoNumero ? `<p class="sub">Orçamento: ${orcamentoNumero}</p>` : ""}
    <p class="sub">Gerado em: ${new Date().toLocaleDateString("pt-BR")} às ${new Date().toLocaleTimeString("pt-BR")}</p>
    <table>${rows}</table></body></html>`;

    const w = window.open("", "_blank", "width=800,height=600");
    if (w) {
      w.document.write(html);
      w.document.close();
      setTimeout(() => w.print(), 400);
    }
  }, [clientName, orcamentoNumero, responses]);

  return (
    <div className="flex gap-1.5">
      <Button variant="outline" size="sm" onClick={handleGeneratePdf} disabled={generating} className="gap-1.5">
        <FileDown className="h-3.5 w-3.5" />
        {generating ? "Gerando..." : "PDF"}
      </Button>
      <Button variant="ghost" size="sm" onClick={handlePrint} className="gap-1.5">
        <Printer className="h-3.5 w-3.5" /> Imprimir
      </Button>
    </div>
  );
}
