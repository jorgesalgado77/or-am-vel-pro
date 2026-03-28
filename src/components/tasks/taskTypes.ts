/**
 * Types and constants for the Tasks Kanban module.
 */

export interface Task {
  id: string;
  tenant_id: string;
  titulo: string;
  descricao: string | null;
  data_tarefa: string;
  horario: string | null;
  tipo: string;
  status: TaskStatus;
  responsavel_id: string | null;
  responsavel_nome: string | null;
  criado_por: string | null;
  anexos: string[] | null;
  google_event_id?: string | null;
  google_calendar_url?: string | null;
  created_at: string;
  updated_at: string;
}

export type TaskStatus = "nova" | "pendente" | "em_execucao" | "concluida";

export const TASK_COLUMNS = [
  { id: "nova" as TaskStatus, label: "Nova Tarefa", icon: "🆕", colBg: "bg-blue-500/10 border-blue-500/30", cardBg: "bg-blue-500/10 border-blue-400/30 hover:border-blue-400/50" },
  { id: "pendente" as TaskStatus, label: "Pendente", icon: "⏳", colBg: "bg-red-500/10 border-red-500/30", cardBg: "bg-red-500/10 border-red-400/30 hover:border-red-400/50" },
  { id: "em_execucao" as TaskStatus, label: "Em Execução", icon: "🔧", colBg: "bg-orange-500/10 border-orange-500/30", cardBg: "bg-orange-500/10 border-orange-400/30 hover:border-orange-400/50" },
  { id: "concluida" as TaskStatus, label: "Concluída", icon: "✅", colBg: "bg-emerald-500/10 border-emerald-500/30", cardBg: "bg-emerald-500/10 border-emerald-400/30 hover:border-emerald-400/50" },
];

export const TASK_TYPES = [
  { value: "geral", label: "Geral" },
  { value: "visita", label: "Visita" },
  { value: "medicao", label: "Medição" },
  { value: "entrega", label: "Entrega" },
  { value: "instalacao", label: "Instalação" },
  { value: "follow_up", label: "Follow-up" },
  { value: "reuniao", label: "Reunião" },
  { value: "projeto", label: "Projeto" },
  { value: "financeiro", label: "Financeiro" },
];

export type DateFilterPreset = "hoje" | "semana" | "mes" | "todos" | "personalizado";

export const DATE_FILTER_OPTIONS: { value: DateFilterPreset; label: string }[] = [
  { value: "hoje", label: "Hoje" },
  { value: "semana", label: "Esta Semana" },
  { value: "mes", label: "Este Mês" },
  { value: "todos", label: "Todos" },
  { value: "personalizado", label: "Personalizado" },
];
