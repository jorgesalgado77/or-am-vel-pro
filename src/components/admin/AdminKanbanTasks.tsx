import { useState, useEffect, useCallback, useMemo } from "react";
import { supabase } from "@/lib/supabaseClient";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import {
  DragDropContext, Droppable, Draggable,
  type DropResult,
} from "@hello-pangea/dnd";
import {
  Plus, Trash2, GripVertical, AlertTriangle, CalendarSync, Clock,
} from "lucide-react";
import { differenceInDays, format } from "date-fns";
import { ptBR } from "date-fns/locale";

// ─── Types ───
interface AdminTask {
  id: string;
  titulo: string;
  descricao: string | null;
  coluna: "nova" | "pendente" | "execucao" | "concluida";
  prioridade: "baixa" | "media" | "alta" | "urgente";
  created_at: string;
  updated_at: string;
  moved_at: string;
  google_event_id: string | null;
  alerta_pendente_enviado: boolean;
}

type ColumnKey = AdminTask["coluna"];

// ─── Column config ───
const COLUMNS: { key: ColumnKey; label: string; hue: string; bg: string; border: string; badge: string; cardBg: string; cardBorder: string }[] = [
  {
    key: "nova",
    label: "Nova Tarefa",
    hue: "199",
    bg: "bg-sky-50 dark:bg-sky-950/30",
    border: "border-sky-300 dark:border-sky-700",
    badge: "bg-sky-100 text-sky-700 dark:bg-sky-900 dark:text-sky-300",
    cardBg: "bg-sky-50/80 dark:bg-sky-900/40",
    cardBorder: "border-sky-200 dark:border-sky-800",
  },
  {
    key: "pendente",
    label: "Pendente",
    hue: "38",
    bg: "bg-amber-50 dark:bg-amber-950/30",
    border: "border-amber-300 dark:border-amber-700",
    badge: "bg-amber-100 text-amber-700 dark:bg-amber-900 dark:text-amber-300",
    cardBg: "bg-amber-50/80 dark:bg-amber-900/40",
    cardBorder: "border-amber-200 dark:border-amber-800",
  },
  {
    key: "execucao",
    label: "Em Execução",
    hue: "260",
    bg: "bg-violet-50 dark:bg-violet-950/30",
    border: "border-violet-300 dark:border-violet-700",
    badge: "bg-violet-100 text-violet-700 dark:bg-violet-900 dark:text-violet-300",
    cardBg: "bg-violet-50/80 dark:bg-violet-900/40",
    cardBorder: "border-violet-200 dark:border-violet-800",
  },
  {
    key: "concluida",
    label: "Concluída",
    hue: "142",
    bg: "bg-emerald-50 dark:bg-emerald-950/30",
    border: "border-emerald-300 dark:border-emerald-700",
    badge: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900 dark:text-emerald-300",
    cardBg: "bg-emerald-50/80 dark:bg-emerald-900/40",
    cardBorder: "border-emerald-200 dark:border-emerald-800",
  },
];

const PRIORIDADE_COLORS: Record<string, string> = {
  baixa: "bg-muted text-muted-foreground",
  media: "bg-sky-100 text-sky-700 dark:bg-sky-900 dark:text-sky-300",
  alta: "bg-amber-100 text-amber-700 dark:bg-amber-900 dark:text-amber-300",
  urgente: "bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300",
};

// ─── Component ───
export function AdminKanbanTasks() {
  const [tasks, setTasks] = useState<AdminTask[]>([]);
  const [loading, setLoading] = useState(true);
  const [showNewDialog, setShowNewDialog] = useState(false);
  const [newTitulo, setNewTitulo] = useState("");
  const [newDescricao, setNewDescricao] = useState("");
  const [newPrioridade, setNewPrioridade] = useState<AdminTask["prioridade"]>("media");
  const [pendingAlerts, setPendingAlerts] = useState<AdminTask[]>([]);
  const [alertsDismissed, setAlertsDismissed] = useState(false);
  const [gcalSyncing, setGcalSyncing] = useState(false);

  const fetchTasks = useCallback(async () => {
    const { data, error } = await supabase
      .from("admin_tasks" as any)
      .select("*")
      .order("created_at", { ascending: true });
    if (error) {
      console.error("Error fetching admin tasks:", error);
      setLoading(false);
      return;
    }
    setTasks((data as any[]) || []);
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchTasks();
    const channel = supabase
      .channel("admin-tasks-realtime")
      .on("postgres_changes", { event: "*", schema: "public", table: "admin_tasks" }, () => {
        fetchTasks();
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [fetchTasks]);

  // Check pending alerts (>2 days in "pendente")
  useEffect(() => {
    const now = new Date();
    const alerts = tasks.filter(
      (t) => t.coluna === "pendente" && differenceInDays(now, new Date(t.moved_at)) >= 2
    );
    setPendingAlerts(alerts);
    if (alerts.length > 0 && !alertsDismissed) {
      // Only show toast once per session
      alerts.forEach((t) => {
        toast.warning(`⏰ Tarefa pendente há ${differenceInDays(now, new Date(t.moved_at))} dias: "${t.titulo}"`, {
          duration: 8000,
          id: `pending-alert-${t.id}`,
        });
      });
    }
  }, [tasks, alertsDismissed]);

  const tasksByColumn = useMemo(() => {
    const map: Record<ColumnKey, AdminTask[]> = { nova: [], pendente: [], execucao: [], concluida: [] };
    tasks.forEach((t) => {
      if (map[t.coluna]) map[t.coluna].push(t);
    });
    return map;
  }, [tasks]);

  const handleDragEnd = async (result: DropResult) => {
    const { destination, source, draggableId } = result;
    if (!destination) return;
    if (destination.droppableId === source.droppableId && destination.index === source.index) return;

    const newColumn = destination.droppableId as ColumnKey;
    const task = tasks.find((t) => t.id === draggableId);
    if (!task) return;

    // Optimistic update
    setTasks((prev) =>
      prev.map((t) =>
        t.id === draggableId
          ? { ...t, coluna: newColumn, moved_at: new Date().toISOString(), alerta_pendente_enviado: false }
          : t
      )
    );

    const { error } = await supabase
      .from("admin_tasks" as any)
      .update({
        coluna: newColumn,
        moved_at: new Date().toISOString(),
        alerta_pendente_enviado: false,
      } as any)
      .eq("id", draggableId);

    if (error) {
      toast.error("Erro ao mover tarefa");
      fetchTasks();
    }
  };

  const createTask = async () => {
    if (!newTitulo.trim()) { toast.error("Título é obrigatório"); return; }
    const { error } = await supabase.from("admin_tasks" as any).insert({
      titulo: newTitulo.trim(),
      descricao: newDescricao.trim() || null,
      prioridade: newPrioridade,
      coluna: "nova",
      moved_at: new Date().toISOString(),
    } as any);
    if (error) { toast.error("Erro ao criar tarefa: " + error.message); return; }
    toast.success("Tarefa criada!");
    setNewTitulo("");
    setNewDescricao("");
    setNewPrioridade("media");
    setShowNewDialog(false);
  };

  const deleteTask = async (id: string) => {
    if (!confirm("Excluir esta tarefa?")) return;
    const { error } = await supabase.from("admin_tasks" as any).delete().eq("id", id);
    if (error) { toast.error("Erro ao excluir"); return; }
    toast.success("Tarefa excluída");
  };

  const syncGoogleCalendar = async () => {
    setGcalSyncing(true);
    try {
      const activeTasks = tasks.filter((t) => t.coluna !== "concluida");
      const { data, error } = await supabase.functions.invoke("google-calendar-admin-sync", {
        body: { tasks: activeTasks },
      });
      if (error) throw error;
      toast.success(`Google Agenda sincronizado! ${data?.synced || 0} tarefas atualizadas.`);
      fetchTasks();
    } catch (err: any) {
      toast.error("Erro ao sincronizar: " + (err?.message || "Tente novamente"));
    } finally {
      setGcalSyncing(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="h-6 w-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h3 className="text-lg font-semibold text-foreground">Kanban de Tarefas</h3>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" className="gap-2" onClick={syncGoogleCalendar} disabled={gcalSyncing}>
            <CalendarSync className="h-3.5 w-3.5" />
            {gcalSyncing ? "Sincronizando..." : "Google Agenda"}
          </Button>
          <Button size="sm" className="gap-2" onClick={() => setShowNewDialog(true)}>
            <Plus className="h-3.5 w-3.5" /> Nova Tarefa
          </Button>
        </div>
      </div>

      {/* Pending Alerts Banner */}
      {pendingAlerts.length > 0 && !alertsDismissed && (
        <Card className="border-amber-400 dark:border-amber-600 bg-amber-50/50 dark:bg-amber-950/30">
          <CardContent className="p-3 flex items-start gap-3">
            <AlertTriangle className="h-5 w-5 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
            <div className="flex-1">
              <p className="text-sm font-semibold text-amber-800 dark:text-amber-300">
                {pendingAlerts.length} tarefa(s) pendente(s) há mais de 2 dias
              </p>
              <div className="mt-1 space-y-0.5">
                {pendingAlerts.map((t) => (
                  <p key={t.id} className="text-xs text-amber-700 dark:text-amber-400">
                    • {t.titulo} — parada há {differenceInDays(new Date(), new Date(t.moved_at))} dias
                  </p>
                ))}
              </div>
            </div>
            <Button variant="ghost" size="sm" className="text-xs shrink-0" onClick={() => setAlertsDismissed(true)}>
              Dispensar
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Kanban Board */}
      <DragDropContext onDragEnd={handleDragEnd}>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {COLUMNS.map((col) => (
            <Droppable droppableId={col.key} key={col.key}>
              {(provided, snapshot) => (
                <div
                  ref={provided.innerRef}
                  {...provided.droppableProps}
                  className={`rounded-lg border-2 ${col.border} ${col.bg} p-2 min-h-[200px] transition-colors ${
                    snapshot.isDraggingOver ? "ring-2 ring-primary/30" : ""
                  }`}
                >
                  {/* Column Header */}
                  <div className="flex items-center justify-between mb-3 px-1">
                    <div className="flex items-center gap-2">
                      <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${col.badge}`}>
                        {col.label}
                      </span>
                    </div>
                    <Badge variant="secondary" className="text-[10px] h-5">
                      {tasksByColumn[col.key].length}
                    </Badge>
                  </div>

                  {/* Task Cards */}
                  {tasksByColumn[col.key].map((task, index) => {
                    const isPendingLong = task.coluna === "pendente" && differenceInDays(new Date(), new Date(task.moved_at)) >= 2;
                    return (
                      <Draggable draggableId={task.id} index={index} key={task.id}>
                        {(dragProvided, dragSnapshot) => (
                          <div
                            ref={dragProvided.innerRef}
                            {...dragProvided.draggableProps}
                            className={`rounded-md border ${col.cardBorder} ${col.cardBg} p-2.5 mb-2 transition-all ${
                              dragSnapshot.isDragging ? "shadow-lg ring-2 ring-primary/40 rotate-1" : "shadow-sm"
                            } ${isPendingLong ? "ring-2 ring-amber-400 dark:ring-amber-600" : ""}`}
                          >
                            <div className="flex items-start gap-1.5">
                              <div {...dragProvided.dragHandleProps} className="mt-0.5 cursor-grab active:cursor-grabbing">
                                <GripVertical className="h-3.5 w-3.5 text-muted-foreground/50" />
                              </div>
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center justify-between gap-1">
                                  <p className="text-sm font-medium text-foreground truncate">{task.titulo}</p>
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-5 w-5 shrink-0 text-muted-foreground hover:text-destructive"
                                    onClick={() => deleteTask(task.id)}
                                  >
                                    <Trash2 className="h-3 w-3" />
                                  </Button>
                                </div>
                                {task.descricao && (
                                  <p className="text-[11px] text-muted-foreground mt-0.5 line-clamp-2">{task.descricao}</p>
                                )}
                                <div className="flex items-center gap-1.5 mt-1.5 flex-wrap">
                                  <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${PRIORIDADE_COLORS[task.prioridade]}`}>
                                    {task.prioridade.charAt(0).toUpperCase() + task.prioridade.slice(1)}
                                  </span>
                                  {isPendingLong && (
                                    <span className="text-[10px] px-1.5 py-0.5 rounded-full font-medium bg-amber-200 text-amber-800 dark:bg-amber-800 dark:text-amber-200 flex items-center gap-0.5">
                                      <Clock className="h-2.5 w-2.5" />
                                      {differenceInDays(new Date(), new Date(task.moved_at))}d
                                    </span>
                                  )}
                                  {task.google_event_id && (
                                    <CalendarSync className="h-3 w-3 text-muted-foreground" title="Sincronizado com Google Agenda" />
                                  )}
                                </div>
                                <p className="text-[9px] text-muted-foreground/70 mt-1">
                                  {format(new Date(task.created_at), "dd/MM/yy HH:mm", { locale: ptBR })}
                                </p>
                              </div>
                            </div>
                          </div>
                        )}
                      </Draggable>
                    );
                  })}
                  {provided.placeholder}
                </div>
              )}
            </Droppable>
          ))}
        </div>
      </DragDropContext>

      {/* New Task Dialog */}
      <Dialog open={showNewDialog} onOpenChange={setShowNewDialog}>
        <DialogContent className="max-w-[95vw] sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Nova Tarefa</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label className="text-xs">Título *</Label>
              <Input
                value={newTitulo}
                onChange={(e) => setNewTitulo(e.target.value)}
                className="mt-1 h-9 text-sm"
                placeholder="Descreva a tarefa..."
                onKeyDown={(e) => e.key === "Enter" && createTask()}
              />
            </div>
            <div>
              <Label className="text-xs">Descrição</Label>
              <Textarea
                value={newDescricao}
                onChange={(e) => setNewDescricao(e.target.value)}
                className="mt-1 text-sm min-h-[80px]"
                placeholder="Detalhes opcionais..."
              />
            </div>
            <div>
              <Label className="text-xs">Prioridade</Label>
              <Select value={newPrioridade} onValueChange={(v) => setNewPrioridade(v as any)}>
                <SelectTrigger className="mt-1 h-9 text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="baixa">Baixa</SelectItem>
                  <SelectItem value="media">Média</SelectItem>
                  <SelectItem value="alta">Alta</SelectItem>
                  <SelectItem value="urgente">Urgente</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setShowNewDialog(false)}>Cancelar</Button>
            <Button size="sm" onClick={createTask}>Criar Tarefa</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
