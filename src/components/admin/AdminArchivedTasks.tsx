import { useMemo } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ArchiveRestore, Search, CalendarClock, Trash2 } from "lucide-react";
import { format, isAfter, isBefore, startOfDay, endOfDay } from "date-fns";
import { ptBR } from "date-fns/locale";

interface ArchivedTask {
  id: string;
  titulo: string;
  descricao: string | null;
  prioridade: string;
  created_at: string;
  updated_at: string;
  vencimento: string | null;
  moved_at: string;
}

const PRIORIDADE_COLORS: Record<string, string> = {
  baixa: "bg-muted text-muted-foreground",
  media: "bg-sky-100 text-sky-700 dark:bg-sky-900 dark:text-sky-300",
  alta: "bg-amber-100 text-amber-700 dark:bg-amber-900 dark:text-amber-300",
  urgente: "bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300",
};

const PRIORIDADE_LABELS: Record<string, string> = {
  baixa: "Baixa", media: "Média", alta: "Alta", urgente: "Urgente",
};

interface Props {
  tasks: ArchivedTask[];
  onRestore: (id: string) => void;
  onDelete: (id: string) => void;
  dateStart: string;
  dateEnd: string;
  onDateStartChange: (v: string) => void;
  onDateEndChange: (v: string) => void;
  searchQuery: string;
  onSearchChange: (v: string) => void;
}

export function AdminArchivedTasks({
  tasks, onRestore, onDelete, dateStart, dateEnd,
  onDateStartChange, onDateEndChange, searchQuery, onSearchChange,
}: Props) {
  const filtered = useMemo(() => {
    return tasks.filter((t) => {
      if (searchQuery && !t.titulo.toLowerCase().includes(searchQuery.toLowerCase())) return false;
      const taskDate = new Date(t.moved_at || t.updated_at);
      if (dateStart) {
        const start = startOfDay(new Date(dateStart + "T12:00:00"));
        if (isBefore(taskDate, start)) return false;
      }
      if (dateEnd) {
        const end = endOfDay(new Date(dateEnd + "T12:00:00"));
        if (isAfter(taskDate, end)) return false;
      }
      return true;
    });
  }, [tasks, searchQuery, dateStart, dateEnd]);

  return (
    <div className="space-y-3">
      {/* Filters */}
      <div className="flex items-center gap-2 flex-wrap">
        <div className="relative flex-1 min-w-[180px] max-w-xs">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder="Buscar arquivada..."
            className="pl-8 h-8 text-sm"
          />
        </div>
        <div className="flex items-center gap-1.5">
          <CalendarClock className="h-3.5 w-3.5 text-muted-foreground" />
          <Input type="date" value={dateStart} onChange={(e) => onDateStartChange(e.target.value)} className="w-[140px] h-8 text-sm" />
          <span className="text-xs text-muted-foreground">até</span>
          <Input type="date" value={dateEnd} onChange={(e) => onDateEndChange(e.target.value)} className="w-[140px] h-8 text-sm" />
        </div>
        {(searchQuery || dateStart || dateEnd) && (
          <Button variant="ghost" size="sm" className="text-xs h-8" onClick={() => { onSearchChange(""); onDateStartChange(""); onDateEndChange(""); }}>
            Limpar filtros
          </Button>
        )}
      </div>

      {/* Count */}
      <p className="text-xs text-muted-foreground">
        {filtered.length} tarefa{filtered.length !== 1 ? "s" : ""} arquivada{filtered.length !== 1 ? "s" : ""}
      </p>

      {/* List */}
      {filtered.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground text-sm">
          Nenhuma tarefa arquivada encontrada
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map((task) => (
            <div
              key={task.id}
              className="flex items-center gap-3 p-3 rounded-lg border border-border bg-muted/30 hover:bg-muted/50 transition-colors"
            >
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <p className="text-sm font-medium text-foreground truncate">{task.titulo}</p>
                  <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium shrink-0 ${PRIORIDADE_COLORS[task.prioridade] || ""}`}>
                    {PRIORIDADE_LABELS[task.prioridade] || task.prioridade}
                  </span>
                </div>
                {task.descricao && (
                  <p className="text-xs text-muted-foreground mt-0.5 line-clamp-1">{task.descricao}</p>
                )}
                <div className="flex items-center gap-3 mt-1 text-[10px] text-muted-foreground/70">
                  <span>Criada: {format(new Date(task.created_at), "dd/MM/yy", { locale: ptBR })}</span>
                  <span>Arquivada: {format(new Date(task.moved_at || task.updated_at), "dd/MM/yy HH:mm", { locale: ptBR })}</span>
                  {task.vencimento && (
                    <span>Vencimento: {format(new Date(task.vencimento), "dd/MM/yy", { locale: ptBR })}</span>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-1.5 shrink-0">
                <Button
                  variant="outline"
                  size="sm"
                  className="gap-1.5 text-xs"
                  onClick={() => onRestore(task.id)}
                >
                  <ArchiveRestore className="h-3.5 w-3.5" />
                  Restaurar
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="gap-1.5 text-xs text-destructive hover:bg-destructive hover:text-destructive-foreground"
                  onClick={() => onDelete(task.id)}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  Excluir
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
