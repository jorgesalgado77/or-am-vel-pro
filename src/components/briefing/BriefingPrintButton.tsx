/**
 * Print button for briefing — generates a printable version.
 */
import { useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Printer } from "lucide-react";

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

function formatValue(value: any): string {
  if (value === true) return "Sim";
  if (value === false) return "Não";
  if (Array.isArray(value)) return value.join(", ");
  if (value === null || value === undefined || value === "") return "—";
  return String(value);
}

export function BriefingPrintButton({ clientName, orcamentoNumero, responses }: BriefingPrintButtonProps) {
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
    <Button variant="outline" size="sm" onClick={handlePrint} className="gap-1.5">
      <Printer className="h-3.5 w-3.5" /> Imprimir
    </Button>
  );
}
