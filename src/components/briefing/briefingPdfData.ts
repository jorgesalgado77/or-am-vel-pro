/**
 * Shared constants and helpers for briefing PDF generation and printing.
 */

export const FIELD_LABELS: Record<string, string> = {
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

export const SECTIONS: { title: string; keys: string[] }[] = [
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

export function formatValue(value: any): string {
  if (value === true) return "Sim";
  if (value === false) return "Não";
  if (Array.isArray(value)) return value.join(", ");
  if (value === null || value === undefined || value === "") return "—";
  return String(value);
}
