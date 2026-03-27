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
  created_at: string;
  updated_at: string;
}

export type TaskStatus = "nova" | "pendente" | "em_execucao" | "concluida";

export const TASK_COLUMNS = [
  { id: "nova" as TaskStatus, label: "Nova Tarefa", color: "hsl(var(--primary))", icon: "🆕", cardBg: "bg-primary/5 border-primary/20" },
  { id: "pendente" as TaskStatus, label: "Pendente", color: "hsl(48 96% 53%)", icon: "⏳", cardBg: "bg-amber-50 dark:bg-amber-950/20 border-amber-300/40" },
  { id: "em_execucao" as TaskStatus, label: "Em Execução", color: "hsl(220 70% 55%)", icon: "🔧", cardBg: "bg-blue-50 dark:bg-blue-950/20 border-blue-300/40" },
  { id: "concluida" as TaskStatus, label: "Concluída", color: "hsl(142 71% 45%)", icon: "✅", cardBg: "bg-emerald-50 dark:bg-emerald-950/20 border-emerald-300/40" },
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
