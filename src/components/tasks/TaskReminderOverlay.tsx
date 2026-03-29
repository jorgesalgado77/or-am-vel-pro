import { useState } from "react";
import { X, Clock, Bell, AlarmClockCheck, ChevronDown, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import {
  useTaskReminders,
  getReminderMinutes,
  setReminderMinutes,
  getSnoozeMinutes,
  setSnoozeMinutes,
  type TaskReminder,
} from "@/hooks/useTaskReminders";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ScrollArea } from "@/components/ui/scroll-area";
import { differenceInDays } from "date-fns";
import type { Task } from "@/components/tasks/taskTypes";

interface Props {
  tenantId: string | null;
  userId?: string;
}

const SNOOZE_OPTIONS = [
  { label: "5 min", value: 5 },
  { label: "10 min", value: 10 },
  { label: "15 min", value: 15 },
  { label: "30 min", value: 30 },
];

function getOverdueColor(daysOld: number): { bg: string; text: string; border: string; ring: string } {
  if (daysOld >= 7) return { bg: "bg-red-500/20", text: "text-red-500", border: "border-red-500/50", ring: "ring-red-500/30" };
  if (daysOld >= 3) return { bg: "bg-orange-500/20", text: "text-orange-500", border: "border-orange-500/50", ring: "ring-orange-500/30" };
  if (daysOld >= 1) return { bg: "bg-amber-500/20", text: "text-amber-500", border: "border-amber-500/50", ring: "ring-amber-500/30" };
  return { bg: "bg-yellow-500/10", text: "text-yellow-600", border: "border-yellow-500/40", ring: "ring-yellow-500/20" };
}

export function TaskReminderOverlay({ tenantId, userId }: Props) {
  const {
    activeReminders,
    dismissReminder,
    snoozeReminder,
    overdueTasks,
    showOverdueAlert,
    dismissOverdueAlert,
  } = useTaskReminders(tenantId, userId);

  return (
    <>
      {/* Time-based reminders (top-right) */}
      {activeReminders.length > 0 && (
        <div className="fixed top-4 right-4 z-[9999] flex flex-col gap-3 max-w-sm w-full pointer-events-none">
          {activeReminders.map((reminder) => (
            <ReminderCard
              key={reminder.task.id}
              reminder={reminder}
              onDismiss={() => dismissReminder(reminder.task.id)}
              onSnooze={(minutes) => snoozeReminder(reminder.task.id, minutes)}
            />
          ))}
        </div>
      )}

      {/* Overdue tasks alert (center modal) */}
      {showOverdueAlert && overdueTasks.length > 0 && (
        <OverdueTasksAlert
          tasks={overdueTasks}
          onDismiss={dismissOverdueAlert}
        />
      )}
    </>
  );
}

function OverdueTasksAlert({ tasks, onDismiss }: { tasks: Task[]; onDismiss: () => void }) {
  const today = new Date();
  
  const sortedTasks = [...tasks].sort((a, b) => {
    const dateA = a.data_tarefa ? new Date(a.data_tarefa).getTime() : Date.now();
    const dateB = b.data_tarefa ? new Date(b.data_tarefa).getTime() : Date.now();
    return dateA - dateB; // Oldest first
  });

  return (
    <div className="fixed inset-0 z-[9998] flex items-center justify-center bg-black/50 backdrop-blur-sm pointer-events-auto animate-in fade-in duration-300">
      <div className="bg-background border border-border rounded-2xl shadow-2xl max-w-lg w-[95vw] max-h-[80vh] flex flex-col animate-in zoom-in-95 duration-300">
        {/* Header */}
        <div className="flex items-center justify-between px-5 pt-5 pb-3">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-full bg-red-500/20 flex items-center justify-center animate-pulse">
              <AlertTriangle className="h-5 w-5 text-red-500" />
            </div>
            <div>
              <h3 className="text-base font-bold text-foreground">⚠️ Tarefas Pendentes</h3>
              <p className="text-xs text-muted-foreground">
                {tasks.length} tarefa(s) aguardando conclusão
              </p>
            </div>
          </div>
          <button onClick={onDismiss} className="text-muted-foreground hover:text-foreground p-1 rounded-lg hover:bg-muted transition-colors">
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Tasks list */}
        <ScrollArea className="flex-1 px-5 pb-2" style={{ maxHeight: "50vh" }}>
          <div className="space-y-2">
            {sortedTasks.map(task => {
              const taskDate = task.data_tarefa ? new Date(task.data_tarefa + "T00:00:00") : null;
              const daysOld = taskDate ? differenceInDays(today, taskDate) : 0;
              const colors = getOverdueColor(Math.max(0, daysOld));
              const isOverdue = daysOld > 0;

              return (
                <div
                  key={task.id}
                  className={cn(
                    "rounded-lg border p-3 transition-colors",
                    colors.border,
                    colors.bg,
                    "ring-1",
                    colors.ring,
                  )}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-foreground truncate">{task.titulo}</p>
                      {task.descricao && (
                        <p className="text-xs text-muted-foreground line-clamp-1 mt-0.5">{task.descricao}</p>
                      )}
                      <div className="flex items-center gap-2 mt-1 flex-wrap">
                        {task.data_tarefa && (
                          <span className={cn("text-[10px] font-medium", colors.text)}>
                            📅 {new Date(task.data_tarefa + "T00:00:00").toLocaleDateString("pt-BR")}
                          </span>
                        )}
                        {task.horario && (
                          <span className="text-[10px] text-muted-foreground">🕐 {task.horario}</span>
                        )}
                        {task.responsavel_nome && (
                          <span className="text-[10px] text-muted-foreground">👤 {task.responsavel_nome}</span>
                        )}
                      </div>
                    </div>
                    <div className="flex flex-col items-end gap-1 shrink-0">
                      <Badge
                        variant="outline"
                        className={cn("text-[9px] h-4 px-1.5", colors.border, colors.text)}
                      >
                        {task.status === "nova" ? "Nova" : "Pendente"}
                      </Badge>
                      {isOverdue && (
                        <span className={cn("text-[9px] font-bold", colors.text)}>
                          {daysOld === 1 ? "1 dia atrás" : `${daysOld} dias atrás`}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </ScrollArea>

        {/* Footer */}
        <div className="px-5 py-4 border-t border-border flex items-center justify-between">
          <p className="text-[10px] text-muted-foreground">
            Alerta reaparece a cada 30 minutos
          </p>
          <Button size="sm" onClick={onDismiss} className="gap-1.5">
            <Bell className="h-3.5 w-3.5" />
            Entendi
          </Button>
        </div>
      </div>
    </div>
  );
}

function ReminderCard({
  reminder,
  onDismiss,
  onSnooze,
}: {
  reminder: TaskReminder;
  onDismiss: () => void;
  onSnooze: (minutes: number) => void;
}) {
  const { task } = reminder;

  return (
    <div
      className={cn(
        "pointer-events-auto rounded-xl border shadow-2xl p-4 animate-in slide-in-from-right-5 fade-in duration-500",
        "bg-background/95 backdrop-blur-lg border-amber-500/40",
        "ring-2 ring-amber-500/20"
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2">
          <div className="h-9 w-9 rounded-full bg-amber-500/20 flex items-center justify-center flex-shrink-0 animate-pulse">
            <Bell className="h-4.5 w-4.5 text-amber-500" />
          </div>
          <div className="min-w-0">
            <p className="text-xs font-medium text-amber-500">⏰ Lembrete de Tarefa</p>
            <p className="text-sm font-bold text-foreground truncate mt-0.5">{task.titulo}</p>
          </div>
        </div>
        <button onClick={onDismiss} className="text-muted-foreground hover:text-foreground transition-colors p-0.5 rounded">
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="mt-2 ml-11 space-y-1">
        {task.descricao && (
          <p className="text-xs text-muted-foreground line-clamp-2">{task.descricao}</p>
        )}
        <div className="flex items-center gap-3 text-xs text-muted-foreground">
          <span className="flex items-center gap-1">
            <Clock className="h-3 w-3" />
            {task.horario}
          </span>
          {task.responsavel_nome && (
            <span className="truncate">👤 {task.responsavel_nome}</span>
          )}
        </div>
        <Badge
          variant="outline"
          className={cn(
            "text-[9px] h-4 px-1.5",
            task.status === "nova" ? "border-blue-400/50 text-blue-400" : "border-red-400/50 text-red-400"
          )}
        >
          {task.status === "nova" ? "Nova" : "Pendente"}
        </Badge>
      </div>

      <div className="flex items-center gap-2 mt-3 ml-11">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm" className="gap-1.5 text-xs h-7 border-amber-500/30 text-amber-600 dark:text-amber-400 hover:bg-amber-500/10">
              <AlarmClockCheck className="h-3.5 w-3.5" />
              Soneca
              <ChevronDown className="h-3 w-3" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="min-w-[120px]">
            {SNOOZE_OPTIONS.map((opt) => (
              <DropdownMenuItem key={opt.value} onClick={() => onSnooze(opt.value)} className="text-xs">
                🔔 {opt.label}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
        <Button variant="ghost" size="sm" className="text-xs h-7 text-muted-foreground" onClick={onDismiss}>
          Dispensar
        </Button>
      </div>
    </div>
  );
}

export function TaskReminderSettings() {
  const [reminderMin, setReminderMin] = useState(getReminderMinutes);
  const [snoozeMin, setSnoozeMin] = useState(getSnoozeMinutes);

  return (
    <div className="space-y-4">
      <div>
        <label className="text-sm font-medium text-foreground">Lembrar antes da tarefa (minutos)</label>
        <select
          className="mt-1 block w-full rounded-md border border-border bg-background text-foreground text-sm p-2"
          value={reminderMin}
          onChange={(e) => { const v = Number(e.target.value); setReminderMin(v); setReminderMinutes(v); }}
        >
          <option value={5}>5 minutos</option>
          <option value={10}>10 minutos</option>
          <option value={15}>15 minutos</option>
          <option value={30}>30 minutos</option>
          <option value={60}>1 hora</option>
        </select>
      </div>
      <div>
        <label className="text-sm font-medium text-foreground">Soneca padrão (minutos)</label>
        <select
          className="mt-1 block w-full rounded-md border border-border bg-background text-foreground text-sm p-2"
          value={snoozeMin}
          onChange={(e) => { const v = Number(e.target.value); setSnoozeMin(v); setSnoozeMinutes(v); }}
        >
          <option value={5}>5 minutos</option>
          <option value={10}>10 minutos</option>
          <option value={15}>15 minutos</option>
          <option value={30}>30 minutos</option>
        </select>
      </div>
    </div>
  );
}
