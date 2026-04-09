/**
 * Archived Tasks — list view with filters
 */
import { useState, useMemo } from "react";
import { format, startOfMonth, endOfMonth, subMonths, subDays, startOfYear, endOfYear, subYears } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Archive, Search, Calendar, Clock, User, Tag, Filter } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { TASK_TYPES, type Task } from "./taskTypes";

interface Props {
  tasks: Task[];
  onTaskClick: (task: Task) => void;
  onRestore?: (task: Task) => void;
}

type DatePreset = "mes_atual" | "mes_anterior" | "90_dias" | "semestre" | "ano_atual" | "ano_anterior" | "personalizado";

const DATE_PRESETS: { value: DatePreset; label: string }[] = [
  { value: "mes_atual", label: "Mês atual" },
  { value: "mes_anterior", label: "Mês anterior" },
  { value: "90_dias", label: "Últimos 90 dias" },
  { value: "semestre", label: "Último semestre" },
  { value: "ano_atual", label: "Ano atual" },
  { value: "ano_anterior", label: "Ano anterior" },
  { value: "personalizado", label: "Período personalizado" },
];

export function ArchivedTasksList({ tasks, onTaskClick, onRestore }: Props) {
  const [search, setSearch] = useState("");
  const [datePreset, setDatePreset] = useState<DatePreset>("90_dias");
  const [customStart, setCustomStart] = useState("");
  const [customEnd, setCustomEnd] = useState("");

  const filteredTasks = useMemo(() => {
    const now = new Date();
    let filtered = tasks.filter(t => t.status === "arquivada");

    // Search by title
    if (search.trim()) {
      const q = search.toLowerCase();
      filtered = filtered.filter(t =>
        t.titulo.toLowerCase().includes(q) ||
        t.descricao?.toLowerCase().includes(q) ||
        t.responsavel_nome?.toLowerCase().includes(q)
      );
    }

    // Date filtering
    let start: Date, end: Date;
    switch (datePreset) {
      case "mes_atual":
        start = startOfMonth(now); end = endOfMonth(now); break;
      case "mes_anterior": {
        const prev = subMonths(now, 1);
        start = startOfMonth(prev); end = endOfMonth(prev); break;
      }
      case "90_dias":
        start = subDays(now, 90); end = now; break;
      case "semestre":
        start = subMonths(now, 6); end = now; break;
      case "ano_atual":
        start = startOfYear(now); end = endOfYear(now); break;
      case "ano_anterior": {
        const prevY = subYears(now, 1);
        start = startOfYear(prevY); end = endOfYear(prevY); break;
      }
      case "personalizado":
        start = customStart ? new Date(customStart) : subMonths(now, 1);
        end = customEnd ? new Date(customEnd) : now;
        break;
      default:
        start = startOfMonth(now); end = endOfMonth(now);
    }

    filtered = filtered.filter(t => {
      // Use updated_at (archive date) if available, fallback to data_tarefa
      const d = t.updated_at ? new Date(t.updated_at) : new Date(t.data_tarefa + "T12:00:00");
      return d >= start && d <= end;
    });

    return filtered.sort((a, b) => {
      const aDate = a.updated_at || `${a.data_tarefa}T12:00:00`;
      const bDate = b.updated_at || `${b.data_tarefa}T12:00:00`;
      return bDate.localeCompare(aDate);
    });
  }, [tasks, search, datePreset, customStart, customEnd]);

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Buscar por título, descrição ou responsável..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="pl-9 h-9"
          />
        </div>

        <Select value={datePreset} onValueChange={v => setDatePreset(v as DatePreset)}>
          <SelectTrigger className="w-[180px] h-9">
            <Filter className="h-3.5 w-3.5 mr-1.5" />
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {DATE_PRESETS.map(p => (
              <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        {datePreset === "personalizado" && (
          <div className="flex items-center gap-2">
            <Input type="date" value={customStart} onChange={e => setCustomStart(e.target.value)} className="h-9 w-[140px]" />
            <span className="text-xs text-muted-foreground">até</span>
            <Input type="date" value={customEnd} onChange={e => setCustomEnd(e.target.value)} className="h-9 w-[140px]" />
          </div>
        )}

        <Badge variant="secondary" className="text-xs">
          {filteredTasks.length} tarefa(s)
        </Badge>
      </div>

      {/* List */}
      {filteredTasks.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
          <Archive className="h-10 w-10 mb-3 opacity-40" />
          <p className="text-sm">Nenhuma tarefa arquivada encontrada</p>
        </div>
      ) : (
        <div className="rounded-lg border border-border overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-muted/50 border-b border-border">
                <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">Título</th>
                <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">Tipo</th>
                <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">Data</th>
                <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">Horário</th>
                <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">Responsável</th>
                <th className="text-right px-4 py-2.5 font-medium text-muted-foreground">Ações</th>
              </tr>
            </thead>
            <tbody>
              {filteredTasks.map(task => {
                const typeLabel = TASK_TYPES.find(t => t.value === task.tipo)?.label || task.tipo;
                return (
                  <tr
                    key={task.id}
                    className="border-b border-border last:border-0 hover:bg-muted/30 transition-colors cursor-pointer"
                    onClick={() => onTaskClick(task)}
                  >
                    <td className="px-4 py-3">
                      <p className="font-medium text-foreground">{task.titulo}</p>
                      {task.descricao && (
                        <p className="text-xs text-muted-foreground line-clamp-1 mt-0.5">{task.descricao}</p>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <Badge variant="outline" className="text-[10px]">{typeLabel}</Badge>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                        <Calendar className="h-3 w-3" />
                        {format(new Date(task.data_tarefa + "T00:00:00"), "dd/MM/yyyy")}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      {task.horario ? (
                        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                          <Clock className="h-3 w-3" />
                          {task.horario}
                        </div>
                      ) : (
                        <span className="text-xs text-muted-foreground">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      {task.responsavel_nome ? (
                        <div className="flex items-center gap-1.5 text-xs">
                          <User className="h-3 w-3 text-primary/60" />
                          <span className="text-primary/80 font-medium">{task.responsavel_nome}</span>
                        </div>
                      ) : (
                        <span className="text-xs text-muted-foreground">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right">
                      {onRestore && (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 text-xs gap-1"
                          onClick={(e) => { e.stopPropagation(); onRestore(task); }}
                        >
                          Restaurar
                        </Button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
