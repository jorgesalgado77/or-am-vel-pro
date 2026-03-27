import { useMemo, useState } from "react";
import { format, startOfMonth, endOfMonth, eachDayOfInterval, isSameDay, getDay, addMonths, subMonths } from "date-fns";
import { ptBR } from "date-fns/locale";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { TASK_COLUMNS, type Task } from "./taskTypes";

interface Props {
  tasks: Task[];
  onTaskClick: (task: Task) => void;
}

export function TaskCalendarView({ tasks, onTaskClick }: Props) {
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const start = startOfMonth(currentMonth);
  const end = endOfMonth(currentMonth);
  const days = eachDayOfInterval({ start, end });
  const startPad = getDay(start); // 0=Sun

  const tasksByDay = useMemo(() => {
    const map = new Map<string, Task[]>();
    tasks.forEach(t => {
      const key = t.data_tarefa; // YYYY-MM-DD
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(t);
    });
    return map;
  }, [tasks]);

  return (
    <div className="border rounded-lg bg-card">
      <div className="flex items-center justify-between p-3 border-b">
        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setCurrentMonth(prev => subMonths(prev, 1))}>
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <h3 className="text-sm font-semibold capitalize">
          {format(currentMonth, "MMMM yyyy", { locale: ptBR })}
        </h3>
        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setCurrentMonth(prev => addMonths(prev, 1))}>
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>
      <div className="grid grid-cols-7 text-center">
        {["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"].map(d => (
          <div key={d} className="text-[10px] font-semibold text-muted-foreground py-2 border-b">{d}</div>
        ))}
        {Array.from({ length: startPad }).map((_, i) => (
          <div key={`pad-${i}`} className="border-b border-r min-h-[80px]" />
        ))}
        {days.map(day => {
          const key = format(day, "yyyy-MM-dd");
          const dayTasks = tasksByDay.get(key) || [];
          const isToday = isSameDay(day, new Date());
          return (
            <div key={key} className={cn("border-b border-r min-h-[80px] p-1", isToday && "bg-primary/5")}>
              <span className={cn("text-[11px] font-medium", isToday ? "text-primary font-bold" : "text-muted-foreground")}>
                {format(day, "d")}
              </span>
              <div className="space-y-0.5 mt-0.5">
                {dayTasks.slice(0, 3).map(t => {
                  const col = TASK_COLUMNS.find(c => c.id === t.status);
                  return (
                    <button
                      key={t.id}
                      onClick={() => onTaskClick(t)}
                      className={cn(
                        "w-full text-left text-[9px] px-1 py-0.5 rounded truncate font-medium transition-colors",
                        t.status === "concluida" ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400" :
                        t.status === "em_execucao" ? "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400" :
                        t.status === "pendente" ? "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400" :
                        "bg-primary/10 text-primary"
                      )}
                    >
                      {t.horario ? `${t.horario} ` : ""}{t.titulo}
                    </button>
                  );
                })}
                {dayTasks.length > 3 && (
                  <span className="text-[9px] text-muted-foreground">+{dayTasks.length - 3} mais</span>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
