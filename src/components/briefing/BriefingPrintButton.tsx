/**
 * PDF generation button for briefing — generates a professional PDF document.
 * Uses jsPDF for PDF creation with company branding.
 */
import { useCallback, useState } from "react";
import { Button } from "@/components/ui/button";
import { FileDown, Printer } from "lucide-react";
import { useCompanySettings } from "@/hooks/useCompanySettings";
import jsPDF from "jspdf";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

interface BriefingPrintButtonProps {
  clientName: string;
  orcamentoNumero?: string;
  responses: Record<string, any>;
}

const FIELD_LABELS: Record<string, string> = {
  seller_name: "Vendedor/Projetista",
  initial_date: "Data Inicial",
  presentation_date: "Data de Apresentação",
  client_1_name: "Cliente 1 — Nome",
  client_1_phone: "Cliente 1 — Telefone",
  client_1_email: "Cliente 1 — E-mail",
  client_1_profession: "Cliente 1 — Profissão",
  client_1_profile: "Cliente 1 — Perfil DISC",
  client_2_name: "Cliente 2 — Nome",
  client_2_phone: "Cliente 2 — Telefone",
  client_2_email: "Cliente 2 — E-mail",
  client_2_profession: "Cliente 2 — Profissão",
  client_2_profile: "Cliente 2 — Perfil DISC",
  construction_stage: "Estágio da Obra",
  enterprise: "Empreendimento",
  has_floor_plan: "Possui planta?",
  has_measurements: "Medidas conferidas?",
  measurement_date: "Data da Medição",
  knows_company: "Já conhece a empresa?",
  lead_source: "Como nos conheceu?",
  company_knowledge: "O que sabe sobre a empresa",
  reason_for_contact: "Motivo do contato",
  environments: "Ambientes",
  environments_other: "Outros ambientes",
  technical_checklist: "Checklist Técnico",
  pain_points: "Problemas / Dores",
  residents_adults: "Adultos",
  residents_children: "Crianças",
  residents_pets: "Pets",
  residents_special_needs: "Necessidades especiais",
  previous_experience: "Já comprou planejados?",
  previous_budget: "Já fez orçamento em outro lugar?",
  competitors: "Concorrentes visitados",
  purchase_timeline: "Previsão de compra",
  budget_expectation: "Expectativa de investimento",
  payment_type: "Forma de pagamento",
  meeting_date: "Data da reunião",
  meeting_time: "Horário",
  notes: "Observações gerais",
  final_notes: "Anotações finais",
};

const SECTIONS: { title: string; keys: string[] }[] = [
  { title: "Dados Iniciais", keys: ["seller_name", "initial_date", "presentation_date"] },
  { title: "Dados dos Clientes", keys: ["client_1_name", "client_1_phone", "client_1_email", "client_1_profession", "client_1_profile", "client_2_name", "client_2_phone", "client_2_email", "client_2_profession", "client_2_profile"] },
  { title: "Dados da Obra / Imóvel", keys: ["construction_stage", "enterprise", "has_floor_plan", "has_measurements", "measurement_date"] },
  { title: "Origem do Lead", keys: ["knows_company", "lead_source", "company_knowledge", "reason_for_contact"] },
  { title: "Ambientes", keys: ["environments", "environments_other"] },
  { title: "Checklist Técnico", keys: ["technical_checklist"] },
  { title: "Problemas e Necessidades", keys: ["pain_points"] },
  { title: "Moradores", keys: ["residents_adults", "residents_children", "residents_pets", "residents_special_needs"] },
  { title: "Experiência Anterior", keys: ["previous_experience", "previous_budget", "competitors"] },
  { title: "Prazo e Investimento", keys: ["purchase_timeline", "budget_expectation", "payment_type"] },
  { title: "Agendamento", keys: ["meeting_date", "meeting_time"] },
  { title: "Observações", keys: ["notes", "final_notes"] },
];

function formatValue(value: any): string {
  if (value === true) return "Sim";
  if (value === false) return "Não";
  if (Array.isArray(value)) return value.join(", ");
  if (value === null || value === undefined || value === "") return "—";
  return String(value);
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

      const primaryColor: [number, number, number] = [30, 64, 175]; // blue-800
      const headerBg: [number, number, number] = [241, 245, 249]; // slate-100
      const textColor: [number, number, number] = [30, 41, 59]; // slate-800
      const mutedColor: [number, number, number] = [100, 116, 139]; // slate-500

      // Helper: add new page if needed
      const checkPage = (needed: number) => {
        if (y + needed > pageH - 20) {
          doc.addPage();
          y = 15;
          // Footer on each page
          addFooter();
        }
      };

      const addFooter = () => {
        const pageNum = doc.getNumberOfPages();
        doc.setFontSize(8);
        doc.setTextColor(...mutedColor);
        doc.text(`Página ${pageNum}`, pageW / 2, pageH - 8, { align: "center" });
      };

      // ===== HEADER =====
      // Logo placeholder or company name
      doc.setFillColor(...primaryColor);
      doc.rect(0, 0, pageW, 28, "F");

      doc.setTextColor(255, 255, 255);
      doc.setFontSize(18);
      doc.setFont("helvetica", "bold");
      doc.text(settings.company_name || "OrçaMóvel PRO", marginL, 13);

      doc.setFontSize(9);
      doc.setFont("helvetica", "normal");
      if (settings.company_subtitle) {
        doc.text(settings.company_subtitle, marginL, 19);
      }

      // Company info line
      const infoLine = [
        settings.telefone_loja,
        settings.email_loja,
        settings.cidade_loja ? `${settings.cidade_loja}/${settings.uf_loja}` : null,
      ].filter(Boolean).join("  •  ");
      if (infoLine) {
        doc.setFontSize(7);
        doc.text(infoLine, marginL, 24);
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
        marginL,
        y
      );
      y += 8;

      // Divider
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

        // Section header
        doc.setFillColor(...headerBg);
        doc.roundedRect(marginL, y, contentW, 7, 1, 1, "F");
        doc.setTextColor(...primaryColor);
        doc.setFontSize(10);
        doc.setFont("helvetica", "bold");
        doc.text(section.title, marginL + 3, y + 5);
        y += 10;

        // Fields
        for (const key of filledKeys) {
          const label = FIELD_LABELS[key] || key;
          const value = formatValue(responses[key]);

          // Calculate needed height
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

          // Subtle separator
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
          pageW / 2,
          pageH - 8,
          { align: "center" }
        );
      }

      doc.save(`Briefing_${clientName.replace(/\s+/g, "_")}_${format(new Date(), "yyyyMMdd")}.pdf`);
    } catch (err) {
      console.error("Erro ao gerar PDF:", err);
    } finally {
      setGenerating(false);
    }
  }, [clientName, orcamentoNumero, responses, settings]);

  // Simple print fallback
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
