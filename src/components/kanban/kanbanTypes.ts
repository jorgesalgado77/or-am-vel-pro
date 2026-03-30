/**
 * Shared types and constants for the Kanban components.
 */
import type { Database } from "@/integrations/supabase/types";

export type Client = Database["public"]["Tables"]["clients"]["Row"];

export interface LastSimInfo {
  valor_final: number;
  valor_com_desconto: number;
  created_at: string;
  sim_count: number;
}

export interface ClientsKanbanProps {
  clients: Client[];
  loading: boolean;
  onEdit: (client: Client) => void;
  onDelete: (id: string) => void;
  onAdd: () => void;
  onSimulate: (client: Client) => void;
  onHistory: (client: Client) => void;
  onContracts: (client: Client) => void;
}

export const KANBAN_COLUMNS_COMERCIAL = [
  { id: "novo", label: "Novo", color: "hsl(var(--primary))", icon: "🆕" },
  { id: "em_negociacao", label: "Em Negociação", color: "hsl(270 70% 55%)", icon: "🤝" },
  { id: "expirado", label: "Expirados", color: "hsl(30 80% 50%)", icon: "⏰" },
  { id: "fechado", label: "Fechado", color: "hsl(142 71% 45%)", icon: "✅" },
  { id: "perdido", label: "Perdido", color: "hsl(0 72% 51%)", icon: "❌" },
];

export const KANBAN_COLUMNS_OPERACIONAL = [
  { id: "em_medicao", label: "Em Medição", color: "hsl(200 70% 50%)", icon: "📐" },
  { id: "em_liberado", label: "Em Liberação", color: "hsl(180 60% 45%)", icon: "✔️" },
  { id: "em_compras", label: "Em Compras", color: "hsl(45 90% 50%)", icon: "🛒" },
  { id: "para_entrega", label: "Para Entrega", color: "hsl(220 70% 55%)", icon: "🚚" },
  { id: "para_montagem", label: "Para Montagem", color: "hsl(280 60% 55%)", icon: "🔧" },
  { id: "assistencia", label: "Assistência", color: "hsl(15 80% 55%)", icon: "🛠️" },
  { id: "finalizado", label: "Finalizado", color: "hsl(142 71% 35%)", icon: "🏁" },
];

// Columns for technical roles (técnico, liberador, conferente)
export const KANBAN_COLUMNS_TECNICO = [
  { id: "nova_solicitacao", label: "Nova Solicitação", color: "hsl(215 80% 55%)", icon: "📋" },
  { id: "em_medicao", label: "Em Medição", color: "hsl(270 70% 55%)", icon: "📐" },
  { id: "em_liberado", label: "Em Liberação", color: "hsl(30 80% 50%)", icon: "✔️" },
  { id: "negativos", label: "Negativos", color: "hsl(0 72% 51%)", icon: "❌" },
  { id: "enviado_compras", label: "Enviado Compras", color: "hsl(142 71% 45%)", icon: "🛒" },
];

export const KANBAN_COLUMNS = [...KANBAN_COLUMNS_COMERCIAL];

export const KANBAN_ALL_COLUMNS = [...KANBAN_COLUMNS_COMERCIAL, ...KANBAN_COLUMNS_OPERACIONAL, ...KANBAN_COLUMNS_TECNICO];
