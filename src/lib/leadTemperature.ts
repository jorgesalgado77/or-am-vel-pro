export type LeadTemperature = "quente" | "morno" | "frio";

interface LeadScoreInput {
  status: string;
  diasSemResposta: number;
  temSimulacao: boolean;
}

export function calcLeadTemperature(input: LeadScoreInput): LeadTemperature {
  const { status, diasSemResposta, temSimulacao } = input;

  if (status === "fechado") return "quente";

  // Hot: recent activity + in negotiation or proposal sent + has simulation
  if (
    diasSemResposta <= 3 &&
    ["em_negociacao", "proposta_enviada"].includes(status) &&
    temSimulacao
  ) {
    return "quente";
  }

  // Warm: some days, or new lead, or in negotiation without recent activity
  if (
    diasSemResposta <= 7 ||
    status === "novo" ||
    (["em_negociacao", "proposta_enviada"].includes(status) && diasSemResposta <= 14)
  ) {
    return "morno";
  }

  return "frio";
}

export const TEMPERATURE_CONFIG: Record<
  LeadTemperature,
  { label: string; emoji: string; color: string; bgColor: string }
> = {
  quente: { label: "Quente", emoji: "🔥", color: "text-red-500", bgColor: "bg-red-500/10" },
  morno: { label: "Morno", emoji: "🟡", color: "text-yellow-500", bgColor: "bg-yellow-500/10" },
  frio: { label: "Frio", emoji: "❄️", color: "text-blue-400", bgColor: "bg-blue-400/10" },
};
