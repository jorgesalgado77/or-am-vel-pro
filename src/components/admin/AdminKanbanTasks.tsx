import { useState, useEffect, useCallback, useMemo } from "react";
import { supabase } from "@/lib/supabaseClient";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { toast } from "sonner";
import {
  DragDropContext, Droppable, Draggable,
  type DropResult,
} from "@hello-pangea/dnd";
import {
  Plus, Trash2, GripVertical, AlertTriangle, CalendarSync, Clock,
  Search, Filter, CalendarClock, Pencil, Archive,
} from "lucide-react";
import { differenceInDays, format, isPast, isToday } from "date-fns";
import { ptBR } from "date-fns/locale";
import { AdminArchivedTasks } from "./AdminArchivedTasks";

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
  vencimento: string | null;
  google_event_id: string | null;
  alerta_pendente_enviado: boolean;
}

type ColumnKey = AdminTask["coluna"];

// ─── Column config ───
const COLUMNS: { key: ColumnKey; label: string; bg: string; border: string; badge: string; cardBg: string; cardBorder: string }[] = [
  {
    key: "nova", label: "Nova Tarefa",
    bg: "bg-sky-50 dark:bg-sky-950/30", border: "border-sky-300 dark:border-sky-700",
    badge: "bg-sky-100 text-sky-700 dark:bg-sky-900 dark:text-sky-300",
    cardBg: "bg-sky-50/80 dark:bg-sky-900/40", cardBorder: "border-sky-200 dark:border-sky-800",
  },
  {
    key: "pendente", label: "Pendente",
    bg: "bg-amber-50 dark:bg-amber-950/30", border: "border-amber-300 dark:border-amber-700",
    badge: "bg-amber-100 text-amber-700 dark:bg-amber-900 dark:text-amber-300",
    cardBg: "bg-amber-50/80 dark:bg-amber-900/40", cardBorder: "border-amber-200 dark:border-amber-800",
  },
  {
    key: "execucao", label: "Em Execução",
    bg: "bg-violet-50 dark:bg-violet-950/30", border: "border-violet-300 dark:border-violet-700",
    badge: "bg-violet-100 text-violet-700 dark:bg-violet-900 dark:text-violet-300",
    cardBg: "bg-violet-50/80 dark:bg-violet-900/40", cardBorder: "border-violet-200 dark:border-violet-800",
  },
  {
    key: "concluida", label: "Concluída",
    bg: "bg-emerald-50 dark:bg-emerald-950/30", border: "border-emerald-300 dark:border-emerald-700",
    badge: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900 dark:text-emerald-300",
    cardBg: "bg-emerald-50/80 dark:bg-emerald-900/40", cardBorder: "border-emerald-200 dark:border-emerald-800",
  },
];

const PRIORIDADE_COLORS: Record<string, string> = {
  baixa: "bg-muted text-muted-foreground",
  media: "bg-sky-100 text-sky-700 dark:bg-sky-900 dark:text-sky-300",
  alta: "bg-amber-100 text-amber-700 dark:bg-amber-900 dark:text-amber-300",
  urgente: "bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300",
};

const PRIORIDADE_LABELS: Record<string, string> = {
  baixa: "Baixa", media: "Média", alta: "Alta", urgente: "Urgente",
};

function getDueBadge(vencimento: string | null, coluna: string) {
  if (!vencimento || coluna === "concluida") return null;
  const due = new Date(vencimento);
  if (isToday(due)) return { label: "Vence hoje", cls: "bg-amber-200 text-amber-900 dark:bg-amber-800 dark:text-amber-100" };
  if (isPast(due)) {
    const days = differenceInDays(new Date(), due);
    return { label: `Atrasada ${days}d`, cls: "bg-red-200 text-red-900 dark:bg-red-800 dark:text-red-100 animate-pulse" };
  }
  const daysLeft = differenceInDays(due, new Date());
  if (daysLeft <= 2) return { label: `${daysLeft}d restante${daysLeft > 1 ? "s" : ""}`, cls: "bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200" };
  return null;
}

// ─── Component ───
export function AdminKanbanTasks() {
  const [tasks, setTasks] = useState<AdminTask[]>([]);
  const [loading, setLoading] = useState(true);
  const [showNewDialog, setShowNewDialog] = useState(false);
  const [newTitulo, setNewTitulo] = useState("");
  const [newDescricao, setNewDescricao] = useState("");
  const [newPrioridade, setNewPrioridade] = useState<AdminTask["prioridade"]>("media");
  const [newVencimento, setNewVencimento] = useState("");
  const [pendingAlerts, setPendingAlerts] = useState<AdminTask[]>([]);
  const [overdueAlerts, setOverdueAlerts] = useState<AdminTask[]>([]);
  const [alertsDismissed, setAlertsDismissed] = useState(false);
  const [gcalSyncing, setGcalSyncing] = useState(false);

  // Edit state
  const [editingTask, setEditingTask] = useState<AdminTask | null>(null);
  const [editTitulo, setEditTitulo] = useState("");
  const [editDescricao, setEditDescricao] = useState("");
  const [editPrioridade, setEditPrioridade] = useState<AdminTask["prioridade"]>("media");
  const [editVencimento, setEditVencimento] = useState("");

  // Filters
  const [searchQuery, setSearchQuery] = useState("");
  const [filterPrioridade, setFilterPrioridade] = useState("all");

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
      .on("postgres_changes", { event: "*", schema: "public", table: "admin_tasks" }, () => fetchTasks())
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [fetchTasks]);

  // Alerts: pending >2 days + overdue
  useEffect(() => {
    const now = new Date();
    const pending = tasks.filter(
      (t) => t.coluna === "pendente" && differenceInDays(now, new Date(t.moved_at)) >= 2
    );
    const overdue = tasks.filter(
      (t) => t.vencimento && t.coluna !== "concluida" && isPast(new Date(t.vencimento)) && !isToday(new Date(t.vencimento))
    );
    setPendingAlerts(pending);
    setOverdueAlerts(overdue);

    if (!alertsDismissed) {
      pending.forEach((t) => {
        toast.warning(`⏰ Pendente há ${differenceInDays(now, new Date(t.moved_at))}d: "${t.titulo}"`, {
          duration: 8000, id: `pending-${t.id}`,
        });
      });
      overdue.forEach((t) => {
        toast.error(`🚨 Prazo vencido: "${t.titulo}" (${format(new Date(t.vencimento!), "dd/MM")})`, {
          duration: 8000, id: `overdue-${t.id}`,
        });
      });
    }
  }, [tasks, alertsDismissed]);

  // Filtered tasks
  const filteredTasks = useMemo(() => {
    return tasks.filter((t) => {
      if (searchQuery && !t.titulo.toLowerCase().includes(searchQuery.toLowerCase())) return false;
      if (filterPrioridade !== "all" && t.prioridade !== filterPrioridade) return false;
      return true;
    });
  }, [tasks, searchQuery, filterPrioridade]);

  const tasksByColumn = useMemo(() => {
    const map: Record<ColumnKey, AdminTask[]> = { nova: [], pendente: [], execucao: [], concluida: [] };
    filteredTasks.forEach((t) => { if (map[t.coluna]) map[t.coluna].push(t); });
    return map;
  }, [filteredTasks]);

  const handleDragEnd = async (result: DropResult) => {
    const { destination, source, draggableId } = result;
    if (!destination) return;
    if (destination.droppableId === source.droppableId && destination.index === source.index) return;

    const newColumn = destination.droppableId as ColumnKey;

    setTasks((prev) =>
      prev.map((t) =>
        t.id === draggableId
          ? { ...t, coluna: newColumn, moved_at: new Date().toISOString(), alerta_pendente_enviado: false }
          : t
      )
    );

    const { error } = await supabase
      .from("admin_tasks" as any)
      .update({ coluna: newColumn, moved_at: new Date().toISOString(), alerta_pendente_enviado: false } as any)
      .eq("id", draggableId);

    if (error) { toast.error("Erro ao mover tarefa"); fetchTasks(); }
  };

  const createTask = async () => {
    if (!newTitulo.trim()) { toast.error("Título é obrigatório"); return; }
    const { error } = await supabase.from("admin_tasks" as any).insert({
      titulo: newTitulo.trim(),
      descricao: newDescricao.trim() || null,
      prioridade: newPrioridade,
      coluna: "nova",
      moved_at: new Date().toISOString(),
      vencimento: newVencimento ? new Date(newVencimento).toISOString() : null,
    } as any);
    if (error) { toast.error("Erro ao criar tarefa: " + error.message); return; }
    toast.success("Tarefa criada!");
    setNewTitulo(""); setNewDescricao(""); setNewPrioridade("media"); setNewVencimento("");
    setShowNewDialog(false);
  };

  const openEditDialog = (task: AdminTask) => {
    setEditingTask(task);
    setEditTitulo(task.titulo);
    setEditDescricao(task.descricao || "");
    setEditPrioridade(task.prioridade);
    setEditVencimento(task.vencimento ? format(new Date(task.vencimento), "yyyy-MM-dd") : "");
  };

  const updateTask = async () => {
    if (!editingTask) return;
    if (!editTitulo.trim()) { toast.error("Título é obrigatório"); return; }
    const { error } = await supabase
      .from("admin_tasks" as any)
      .update({
        titulo: editTitulo.trim(),
        descricao: editDescricao.trim() || null,
        prioridade: editPrioridade,
        vencimento: editVencimento ? new Date(editVencimento).toISOString() : null,
      } as any)
      .eq("id", editingTask.id);
    if (error) { toast.error("Erro ao atualizar tarefa: " + error.message); return; }
    toast.success("Tarefa atualizada!");
    setEditingTask(null);
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
    } finally { setGcalSyncing(false); }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="h-6 w-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  const totalAlerts = pendingAlerts.length + overdueAlerts.length;

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

      {/* Filters */}
      <div className="flex items-center gap-2 flex-wrap">
        <div className="relative flex-1 min-w-[200px] max-w-xs">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Buscar tarefa..."
            className="pl-8 h-8 text-sm"
          />
        </div>
        <div className="flex items-center gap-1.5">
          <Filter className="h-3.5 w-3.5 text-muted-foreground" />
          <Select value={filterPrioridade} onValueChange={setFilterPrioridade}>
            <SelectTrigger className="w-[130px] h-8 text-sm">
              <SelectValue placeholder="Prioridade" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todas</SelectItem>
              <SelectItem value="baixa">Baixa</SelectItem>
              <SelectItem value="media">Média</SelectItem>
              <SelectItem value="alta">Alta</SelectItem>
              <SelectItem value="urgente">Urgente</SelectItem>
            </SelectContent>
          </Select>
        </div>
        {(searchQuery || filterPrioridade !== "all") && (
          <Button variant="ghost" size="sm" className="text-xs h-8" onClick={() => { setSearchQuery(""); setFilterPrioridade("all"); }}>
            Limpar filtros
          </Button>
        )}
      </div>

      {/* Alerts Banner */}
      {totalAlerts > 0 && !alertsDismissed && (
        <Card className="border-red-400 dark:border-red-600 bg-red-50/50 dark:bg-red-950/20">
          <CardContent className="p-3 flex items-start gap-3">
            <AlertTriangle className="h-5 w-5 text-red-600 dark:text-red-400 shrink-0 mt-0.5" />
            <div className="flex-1">
              <p className="text-sm font-semibold text-red-800 dark:text-red-300">
                {totalAlerts} alerta(s) ativo(s)
              </p>
              <div className="mt-1 space-y-0.5">
                {overdueAlerts.map((t) => (
                  <p key={`od-${t.id}`} className="text-xs text-red-700 dark:text-red-400">
                    🚨 {t.titulo} — prazo vencido em {format(new Date(t.vencimento!), "dd/MM/yy")}
                  </p>
                ))}
                {pendingAlerts.map((t) => (
                  <p key={`pd-${t.id}`} className="text-xs text-amber-700 dark:text-amber-400">
                    ⏰ {t.titulo} — pendente há {differenceInDays(new Date(), new Date(t.moved_at))} dias
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
                  <div className="flex items-center justify-between mb-3 px-1">
                    <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${col.badge}`}>{col.label}</span>
                    <Badge variant="secondary" className="text-[10px] h-5">{tasksByColumn[col.key].length}</Badge>
                  </div>

                  {tasksByColumn[col.key].map((task, index) => {
                    const isPendingLong = task.coluna === "pendente" && differenceInDays(new Date(), new Date(task.moved_at)) >= 2;
                    const dueBadge = getDueBadge(task.vencimento, task.coluna);
                    const isOverdue = task.vencimento && task.coluna !== "concluida" && isPast(new Date(task.vencimento)) && !isToday(new Date(task.vencimento));

                    return (
                      <Draggable draggableId={task.id} index={index} key={task.id}>
                        {(dragProvided, dragSnapshot) => (
                          <div
                            ref={dragProvided.innerRef}
                            {...dragProvided.draggableProps}
                            className={`rounded-md border ${col.cardBorder} ${col.cardBg} p-2.5 mb-2 transition-all ${
                              dragSnapshot.isDragging ? "shadow-lg ring-2 ring-primary/40 rotate-1" : "shadow-sm"
                            } ${isPendingLong ? "ring-2 ring-amber-400 dark:ring-amber-600" : ""}
                            ${isOverdue ? "ring-2 ring-red-500 dark:ring-red-400" : ""}`}
                          >
                            <div className="flex items-start gap-1.5">
                              <div {...dragProvided.dragHandleProps} className="mt-0.5 cursor-grab active:cursor-grabbing">
                                <GripVertical className="h-3.5 w-3.5 text-muted-foreground/50" />
                              </div>
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center justify-between gap-1">
                                  <p
                                    className="text-sm font-medium text-foreground truncate cursor-pointer hover:underline"
                                    onClick={() => openEditDialog(task)}
                                    title="Clique para editar"
                                  >
                                    {task.titulo}
                                  </p>
                                  <div className="flex items-center gap-0.5 shrink-0">
                                    <Button
                                      variant="ghost" size="icon"
                                      className="h-5 w-5 text-muted-foreground hover:text-primary"
                                      onClick={() => openEditDialog(task)}
                                    >
                                      <Pencil className="h-3 w-3" />
                                    </Button>
                                    <Button
                                      variant="ghost" size="icon"
                                      className="h-5 w-5 text-muted-foreground hover:text-destructive"
                                      onClick={() => deleteTask(task.id)}
                                    >
                                      <Trash2 className="h-3 w-3" />
                                    </Button>
                                  </div>
                                </div>
                                {task.descricao && (
                                  <p className="text-[11px] text-muted-foreground mt-0.5 line-clamp-2">{task.descricao}</p>
                                )}
                                <div className="flex items-center gap-1.5 mt-1.5 flex-wrap">
                                  <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${PRIORIDADE_COLORS[task.prioridade]}`}>
                                    {PRIORIDADE_LABELS[task.prioridade]}
                                  </span>
                                  {dueBadge && (
                                    <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium flex items-center gap-0.5 ${dueBadge.cls}`}>
                                      <CalendarClock className="h-2.5 w-2.5" />
                                      {dueBadge.label}
                                    </span>
                                  )}
                                  {isPendingLong && (
                                    <span className="text-[10px] px-1.5 py-0.5 rounded-full font-medium bg-amber-200 text-amber-800 dark:bg-amber-800 dark:text-amber-200 flex items-center gap-0.5">
                                      <Clock className="h-2.5 w-2.5" />
                                      {differenceInDays(new Date(), new Date(task.moved_at))}d
                                    </span>
                                  )}
                                  {task.google_event_id && (
                                    <CalendarSync className="h-3 w-3 text-muted-foreground" />
                                  )}
                                </div>
                                <div className="flex items-center gap-2 mt-1">
                                  <p className="text-[9px] text-muted-foreground/70">
                                    {format(new Date(task.created_at), "dd/MM/yy HH:mm", { locale: ptBR })}
                                  </p>
                                  {task.vencimento && (
                                    <p className={`text-[9px] flex items-center gap-0.5 ${isOverdue ? "text-red-500 dark:text-red-400 font-semibold" : "text-muted-foreground/70"}`}>
                                      📅 {format(new Date(task.vencimento), "dd/MM/yy", { locale: ptBR })}
                                    </p>
                                  )}
                                </div>
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
                value={newTitulo} onChange={(e) => setNewTitulo(e.target.value)}
                className="mt-1 h-9 text-sm" placeholder="Descreva a tarefa..."
                onKeyDown={(e) => e.key === "Enter" && createTask()}
              />
            </div>
            <div>
              <Label className="text-xs">Descrição</Label>
              <Textarea
                value={newDescricao} onChange={(e) => setNewDescricao(e.target.value)}
                className="mt-1 text-sm min-h-[80px]" placeholder="Detalhes opcionais..."
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs">Prioridade</Label>
                <Select value={newPrioridade} onValueChange={(v) => setNewPrioridade(v as any)}>
                  <SelectTrigger className="mt-1 h-9 text-sm"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="baixa">Baixa</SelectItem>
                    <SelectItem value="media">Média</SelectItem>
                    <SelectItem value="alta">Alta</SelectItem>
                    <SelectItem value="urgente">Urgente</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs">Vencimento</Label>
                <Input
                  type="date" value={newVencimento}
                  onChange={(e) => setNewVencimento(e.target.value)}
                  className="mt-1 h-9 text-sm"
                />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setShowNewDialog(false)}>Cancelar</Button>
            <Button size="sm" onClick={createTask}>Criar Tarefa</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Task Dialog */}
      <Dialog open={!!editingTask} onOpenChange={(open) => { if (!open) setEditingTask(null); }}>
        <DialogContent className="max-w-[95vw] sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Editar Tarefa</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label className="text-xs">Título *</Label>
              <Input
                value={editTitulo} onChange={(e) => setEditTitulo(e.target.value)}
                className="mt-1 h-9 text-sm" placeholder="Título da tarefa..."
                onKeyDown={(e) => e.key === "Enter" && updateTask()}
              />
            </div>
            <div>
              <Label className="text-xs">Descrição</Label>
              <Textarea
                value={editDescricao} onChange={(e) => setEditDescricao(e.target.value)}
                className="mt-1 text-sm min-h-[80px]" placeholder="Detalhes opcionais..."
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs">Prioridade</Label>
                <Select value={editPrioridade} onValueChange={(v) => setEditPrioridade(v as any)}>
                  <SelectTrigger className="mt-1 h-9 text-sm"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="baixa">Baixa</SelectItem>
                    <SelectItem value="media">Média</SelectItem>
                    <SelectItem value="alta">Alta</SelectItem>
                    <SelectItem value="urgente">Urgente</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs">Vencimento</Label>
                <Input
                  type="date" value={editVencimento}
                  onChange={(e) => setEditVencimento(e.target.value)}
                  className="mt-1 h-9 text-sm"
                />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setEditingTask(null)}>Cancelar</Button>
            <Button size="sm" onClick={updateTask}>Salvar Alterações</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
