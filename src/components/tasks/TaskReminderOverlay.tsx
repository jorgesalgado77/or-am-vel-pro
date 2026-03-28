import { useState } from "react";
import { X, Clock, Bell, AlarmClockCheck, ChevronDown } from "lucide-react";
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

export function TaskReminderOverlay({ tenantId, userId }: Props) {
  const { activeReminders, dismissReminder, snoozeReminder } = useTaskReminders(tenantId, userId);

  if (activeReminders.length === 0) return null;

  return (
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
      {/* Header */}
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
        <button
          onClick={onDismiss}
          className="text-muted-foreground hover:text-foreground transition-colors p-0.5 rounded"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      {/* Details */}
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

      {/* Actions */}
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
              <DropdownMenuItem
                key={opt.value}
                onClick={() => onSnooze(opt.value)}
                className="text-xs"
              >
                🔔 {opt.label}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
        <Button
          variant="ghost"
          size="sm"
          className="text-xs h-7 text-muted-foreground"
          onClick={onDismiss}
        >
          Dispensar
        </Button>
      </div>
    </div>
  );
}

/**
 * Settings component for reminder preferences (use inside Settings)
 */
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
          onChange={(e) => {
            const v = Number(e.target.value);
            setReminderMin(v);
            setReminderMinutes(v);
          }}
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
          onChange={(e) => {
            const v = Number(e.target.value);
            setSnoozeMin(v);
            setSnoozeMinutes(v);
          }}
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
