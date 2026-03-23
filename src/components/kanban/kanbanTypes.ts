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

export const KANBAN_COLUMNS = [
  { id: "novo", label: "Novo", color: "hsl(var(--primary))", icon: "🆕" },
  { id: "em_negociacao", label: "Em Negociação", color: "hsl(270 70% 55%)", icon: "🤝" },
  { id: "proposta_enviada", label: "Proposta Enviada", color: "hsl(45 93% 47%)", icon: "📨" },
  { id: "fechado", label: "Fechado", color: "hsl(142 71% 45%)", icon: "✅" },
  { id: "perdido", label: "Perdido", color: "hsl(0 72% 51%)", icon: "❌" },
];
