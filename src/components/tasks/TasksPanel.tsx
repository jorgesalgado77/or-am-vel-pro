import { useState, useMemo, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Plus, LayoutGrid, CalendarDays, CalendarSync } from "lucide-react";
import { useTasks } from "@/hooks/useTasks";
import { useGoogleCalendar } from "@/hooks/useGoogleCalendar";
import { TaskKanbanBoard } from "./TaskKanbanBoard";
import { TaskCalendarView } from "./TaskCalendarView";
import { TaskCreateModal } from "./TaskCreateModal";
import { TaskFilters } from "./TaskFilters";
import { type Task, type DateFilterPreset } from "./taskTypes";
import { startOfDay, endOfDay, startOfWeek, endOfWeek, startOfMonth, endOfMonth, isWithinInterval } from "date-fns";
import { playNotificationSound } from "@/lib/notificationSound";
import { toast } from "sonner";

interface Props {
  tenantId: string | null;
  userId?: string;
  userName?: string;
}

export function TasksPanel({ tenantId, userId, userName }: Props) {
  const { tasks, loading, createTask, updateTaskStatus, updateTask, deleteTask } = useTasks(tenantId, userId);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingTask, setEditingTask] = useState<Task | null>(null);
  const [dateFilter, setDateFilter] = useState<DateFilterPreset>("todos");
  const [typeFilter, setTypeFilter] = useState("todos");
  const [customStart, setCustomStart] = useState("");
  const [customEnd, setCustomEnd] = useState("");
  const [view, setView] = useState<"kanban" | "calendar">("kanban");

  // Alert for tasks due today
  const alertedRef = useRef(new Set<string>());
  useEffect(() => {
    const now = new Date();
    const todayStr = now.toISOString().slice(0, 10);
    tasks.forEach(t => {
      if (t.data_tarefa === todayStr && t.status !== "concluida" && !alertedRef.current.has(t.id)) {
        alertedRef.current.add(t.id);
        if (t.responsavel_id === userId) {
          // Check if it's close to the scheduled time
          if (t.horario) {
            const [h, m] = t.horario.split(":").map(Number);
            const taskTime = new Date(now);
            taskTime.setHours(h, m, 0, 0);
            const diff = taskTime.getTime() - now.getTime();
            if (diff > 0 && diff < 30 * 60 * 1000) {
              playNotificationSound();
              toast.warning(`⏰ Tarefa em breve: ${t.titulo} às ${t.horario}`, { duration: 8000 });
            }
          }
        }
      }
    });
  }, [tasks, userId]);

  const filteredTasks = useMemo(() => {
    let filtered = tasks;
    // Date filter
    if (dateFilter !== "todos") {
      const now = new Date();
      let start: Date, end: Date;
      switch (dateFilter) {
        case "hoje":
          start = startOfDay(now); end = endOfDay(now); break;
        case "semana":
          start = startOfWeek(now, { weekStartsOn: 1 }); end = endOfWeek(now, { weekStartsOn: 1 }); break;
        case "mes":
          start = startOfMonth(now); end = endOfMonth(now); break;
        case "personalizado":
          start = customStart ? startOfDay(new Date(customStart)) : startOfMonth(now);
          end = customEnd ? endOfDay(new Date(customEnd)) : endOfDay(now);
          break;
        default:
          start = startOfDay(now); end = endOfDay(now);
      }
      filtered = filtered.filter(t => {
        const d = new Date(t.data_tarefa + "T12:00:00");
        return isWithinInterval(d, { start, end });
      });
    }
    // Type filter
    if (typeFilter !== "todos") {
      filtered = filtered.filter(t => t.tipo === typeFilter);
    }
    return filtered;
  }, [tasks, dateFilter, typeFilter, customStart, customEnd]);

  const { syncTaskToCalendar, syncing: calendarSyncing } = useGoogleCalendar(tenantId);

  const handleSave = async (data: Partial<Task>) => {
    if (editingTask) {
      await updateTask(editingTask.id, data);
    } else {
      const created = await createTask(data);
      // Try to sync to Google Calendar (non-blocking)
      if (created) {
        syncTaskToCalendar({
          id: (created as any).id,
          titulo: data.titulo || "",
          descricao: data.descricao,
          data_tarefa: data.data_tarefa || "",
          horario: data.horario,
          responsavel_nome: data.responsavel_nome,
        });
      }
    }
  };

  const handleTaskClick = (task: Task) => {
    setEditingTask(task);
    setModalOpen(true);
  };

  const handleDelete = async (task: Task) => {
    if (confirm(`Excluir tarefa "${task.titulo}"?`)) {
      await deleteTask(task.id);
      toast.success("Tarefa excluída");
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <TaskFilters
          dateFilter={dateFilter}
          onDateFilterChange={setDateFilter}
          typeFilter={typeFilter}
          onTypeFilterChange={setTypeFilter}
          customStart={customStart}
          customEnd={customEnd}
          onCustomStartChange={setCustomStart}
          onCustomEndChange={setCustomEnd}
        />
        <div className="flex items-center gap-2">
          <Tabs value={view} onValueChange={(v) => setView(v as any)}>
            <TabsList className="h-8">
              <TabsTrigger value="kanban" className="text-xs gap-1 px-2 h-7"><LayoutGrid className="h-3.5 w-3.5" />Kanban</TabsTrigger>
              <TabsTrigger value="calendar" className="text-xs gap-1 px-2 h-7"><CalendarDays className="h-3.5 w-3.5" />Calendário</TabsTrigger>
            </TabsList>
          </Tabs>
          <Button size="sm" className="gap-1.5" onClick={() => { setEditingTask(null); setModalOpen(true); }}>
            <Plus className="h-4 w-4" />Nova Tarefa
          </Button>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-16">
          <div className="h-6 w-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
        </div>
      ) : view === "kanban" ? (
        <TaskKanbanBoard
          tasks={filteredTasks}
          onStatusChange={updateTaskStatus}
          onTaskClick={handleTaskClick}
          onTaskDelete={handleDelete}
        />
      ) : (
        <TaskCalendarView tasks={filteredTasks} onTaskClick={handleTaskClick} />
      )}

      <TaskCreateModal
        open={modalOpen}
        onClose={() => { setModalOpen(false); setEditingTask(null); }}
        onSave={handleSave}
        editingTask={editingTask}
        currentUserId={userId}
        currentUserName={userName}
        tenantId={tenantId}
      />
    </div>
  );
}
