import { useState, useEffect, useMemo, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { format, startOfMonth, endOfMonth, eachDayOfInterval, isSameDay, getDay, addMonths, subMonths } from "date-fns";
import { ptBR } from "date-fns/locale";
import { ChevronLeft, ChevronRight, Ruler, Clock, Download, Filter } from "lucide-react";
import { supabase } from "@/lib/supabaseClient";
import { getTenantId } from "@/lib/tenantState";
import { useCurrentUser } from "@/hooks/useCurrentUser";
import { useUsuarios } from "@/hooks/useUsuarios";
import { MeasurementScheduleDialog, type MeasurementScheduleData } from "@/components/kanban/MeasurementScheduleDialog";
import { toast } from "sonner";
import type { Task } from "@/components/tasks/taskTypes";
import jsPDF from "jspdf";

interface SelectedTask {
  task: Task;
  clientName: string;
  clientId: string | null;
}

export function MeasurementCalendarWidget() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const { currentUser } = useCurrentUser();
  const { usuarios } = useUsuarios();
  const [selectedTask, setSelectedTask] = useState<SelectedTask | null>(null);
  const [filterTechnician, setFilterTechnician] = useState("todos");
  const [showFilters, setShowFilters] = useState(false);

  const tenantId = getTenantId();

  // Get technical users for filter
  const technicians = useMemo(() => {
    return usuarios.filter(u => {
      const cargo = ((u as any).cargo_nome || "").toLowerCase();
      return cargo.includes("tecnico") || cargo.includes("técnico") || cargo.includes("liberador") || cargo.includes("conferente");
    });
  }, [usuarios]);

  const fetchTasks = useCallback(async () => {
    if (!tenantId || !currentUser) return;

    let query = supabase
      .from("tasks" as any)
      .select("*")
      .eq("tenant_id", tenantId)
      .eq("tipo", "medicao")
      .in("status", ["nova", "pendente", "em_execucao"]);

    const cargo = (currentUser.cargo_nome || "").toLowerCase();
    const isAdminOrManager = cargo.includes("administrador") || (cargo.includes("gerente") && !cargo.includes("tecnico") && !cargo.includes("técnico"));
    if (!isAdminOrManager) {
      query = query.eq("responsavel_id", currentUser.id);
    }

    const { data } = await query.order("data_tarefa", { ascending: true });
    setTasks(((data as any[]) || []) as Task[]);
  }, [tenantId, currentUser]);

  useEffect(() => { fetchTasks(); }, [fetchTasks]);

  const start = startOfMonth(currentMonth);
  const end = endOfMonth(currentMonth);
  const days = eachDayOfInterval({ start, end });
  const startPad = getDay(start);

  // Filter tasks by technician
  const filteredTasks = useMemo(() => {
    if (filterTechnician === "todos") return tasks;
    return tasks.filter(t => t.responsavel_id === filterTechnician || t.responsavel_nome === filterTechnician);
  }, [tasks, filterTechnician]);

  const tasksByDay = useMemo(() => {
    const map = new Map<string, Task[]>();
    filteredTasks.forEach(t => {
      const key = t.data_tarefa;
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(t);
    });
    return map;
  }, [filteredTasks]);

  const pendingCount = filteredTasks.filter(t => t.status !== "concluida").length;

  const handleTaskClick = (task: Task) => {
    const clientName = task.titulo.replace("Medição - ", "").trim();
    setSelectedTask({ task, clientName, clientId: null });
  };

  const handleRescheduleConfirm = useCallback(async (data: MeasurementScheduleData) => {
    if (!selectedTask || !tenantId) return;
    const { task, clientName } = selectedTask;

    const formattedDate = data.date.split("-").reverse().join("/");
    const { error: updateError } = await supabase
      .from("tasks" as any)
      .update({
        data_tarefa: data.date,
        horario: data.time,
        descricao: `[REAGENDAMENTO] ${data.rescheduleReason}\n\nAgendamento: ${formattedDate} às ${data.time}\n${data.observations || "Sem observações"}`,
        updated_at: new Date().toISOString(),
      } as any)
      .eq("id", task.id);

    if (updateError) {
      toast.error("Erro ao reagendar tarefa");
      return;
    }

    await supabase.from("measurement_schedule_history" as any).insert({
      tenant_id: tenantId,
      client_id: selectedTask.clientId || task.id,
      date: data.date,
      time: data.time,
      observations: data.observations || "",
      reason: data.rescheduleReason || null,
      created_by: currentUser?.nome_completo || "Sistema",
    } as any);

    try {
      const { sendPushIfEnabled } = await import("@/lib/pushHelper");
      if (currentUser?.id) {
        sendPushIfEnabled("medidas", currentUser.id, `📐 Medição Reagendada`, `Cliente: ${clientName} — ${formattedDate} às ${data.time}`, "medicao");
      }
    } catch { /* silent */ }

    toast.success(`Medição reagendada para ${formattedDate} às ${data.time}`);
    setSelectedTask(null);
    fetchTasks();
  }, [selectedTask, tenantId, currentUser, fetchTasks]);

  // PDF Export
  const handleExportPDF = useCallback(() => {
    const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
    const monthLabel = format(currentMonth, "MMMM yyyy", { locale: ptBR });
    const pageW = doc.internal.pageSize.getWidth();
    const pageH = doc.internal.pageSize.getHeight();
    const margin = 10;
    const cellW = (pageW - margin * 2) / 7;
    const headerH = 8;
    const dayNames = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];

    // Title
    doc.setFontSize(16);
    doc.text(`Calendário de Medições — ${monthLabel.charAt(0).toUpperCase() + monthLabel.slice(1)}`, pageW / 2, margin + 5, { align: "center" });
    if (filterTechnician !== "todos") {
      const techName = technicians.find(t => t.id === filterTechnician)?.nome_completo || filterTechnician;
      doc.setFontSize(10);
      doc.text(`Técnico: ${techName}`, pageW / 2, margin + 11, { align: "center" });
    }

    let startY = margin + 16;

    // Day headers
    doc.setFontSize(9);
    doc.setFillColor(240, 240, 240);
    dayNames.forEach((d, i) => {
      const x = margin + i * cellW;
      doc.rect(x, startY, cellW, headerH, "F");
      doc.rect(x, startY, cellW, headerH, "S");
      doc.text(d, x + cellW / 2, startY + 5.5, { align: "center" });
    });
    startY += headerH;

    // Calculate rows
    const totalCells = startPad + days.length;
    const totalRows = Math.ceil(totalCells / 7);
    const availableH = pageH - startY - margin;
    const cellH = Math.min(availableH / totalRows, 28);

    let col = 0;
    let row = 0;

    // Padding cells
    for (let i = 0; i < startPad; i++) {
      const x = margin + col * cellW;
      const y = startY + row * cellH;
      doc.setDrawColor(200);
      doc.rect(x, y, cellW, cellH, "S");
      col++;
    }

    // Day cells
    days.forEach(day => {
      const x = margin + col * cellW;
      const y = startY + row * cellH;
      const key = format(day, "yyyy-MM-dd");
      const dayTasks = tasksByDay.get(key) || [];
      const isToday = isSameDay(day, new Date());

      if (isToday) {
        doc.setFillColor(230, 240, 255);
        doc.rect(x, y, cellW, cellH, "FD");
      } else {
        doc.setDrawColor(200);
        doc.rect(x, y, cellW, cellH, "S");
      }

      doc.setFontSize(8);
      doc.setTextColor(isToday ? 0 : 100);
      doc.text(format(day, "d"), x + 2, y + 4);

      // Tasks
      doc.setFontSize(6);
      doc.setTextColor(50, 50, 150);
      dayTasks.slice(0, 3).forEach((t, i) => {
        const label = `${t.horario || "—"} ${t.titulo.replace("Medição - ", "")}`;
        const maxLen = Math.floor(cellW / 1.8);
        doc.text(label.substring(0, maxLen), x + 1.5, y + 8 + i * 4);
      });
      if (dayTasks.length > 3) {
        doc.setTextColor(120);
        doc.text(`+${dayTasks.length - 3} mais`, x + 1.5, y + 8 + 3 * 4);
      }
      doc.setTextColor(0);

      col++;
      if (col >= 7) { col = 0; row++; }
    });

    // Footer
    doc.setFontSize(7);
    doc.setTextColor(150);
    doc.text(`Gerado em ${format(new Date(), "dd/MM/yyyy HH:mm")} — ${pendingCount} medições pendentes`, pageW / 2, pageH - 4, { align: "center" });

    doc.save(`calendario-medicoes-${format(currentMonth, "yyyy-MM")}.pdf`);
    toast.success("PDF exportado com sucesso!");
  }, [currentMonth, tasksByDay, days, startPad, pendingCount, filterTechnician, technicians]);

  return (
    <>
      <Card>
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <CardTitle className="text-base flex items-center gap-2">
              <Ruler className="h-5 w-5 text-primary" />
              Agendamentos de Medição
              {pendingCount > 0 && (
                <Badge variant="secondary" className="text-xs">{pendingCount} pendentes</Badge>
              )}
            </CardTitle>
            <div className="flex items-center gap-1.5">
              <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setShowFilters(prev => !prev)} title="Filtros">
                <Filter className="h-4 w-4" />
              </Button>
              <Button variant="ghost" size="icon" className="h-7 w-7" onClick={handleExportPDF} title="Exportar PDF">
                <Download className="h-4 w-4" />
              </Button>
            </div>
          </div>
          {showFilters && (
            <div className="flex items-center gap-2 mt-2">
              <Select value={filterTechnician} onValueChange={setFilterTechnician}>
                <SelectTrigger className="h-7 text-xs w-[180px]">
                  <SelectValue placeholder="Todos os técnicos" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="todos">Todos os técnicos</SelectItem>
                  {technicians.map(t => (
                    <SelectItem key={t.id} value={t.id}>{t.nome_completo}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
        </CardHeader>
        <CardContent className="pt-0">
          <div className="border rounded-lg">
            <div className="flex items-center justify-between p-2 border-b">
              <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setCurrentMonth(prev => subMonths(prev, 1))}>
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <span className="text-sm font-semibold capitalize">
                {format(currentMonth, "MMMM yyyy", { locale: ptBR })}
              </span>
              <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setCurrentMonth(prev => addMonths(prev, 1))}>
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
            <div className="grid grid-cols-7 text-center">
              {["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"].map(d => (
                <div key={d} className="text-[10px] font-semibold text-muted-foreground py-1.5 border-b">{d}</div>
              ))}
              {Array.from({ length: startPad }).map((_, i) => (
                <div key={`pad-${i}`} className="border-b border-r min-h-[60px]" />
              ))}
              {days.map(day => {
                const key = format(day, "yyyy-MM-dd");
                const dayTasks = tasksByDay.get(key) || [];
                const isToday = isSameDay(day, new Date());
                return (
                  <div key={key} className={cn("border-b border-r min-h-[60px] p-1", isToday && "bg-primary/5")}>
                    <span className={cn("text-[10px] font-medium", isToday ? "text-primary font-bold" : "text-muted-foreground")}>
                      {format(day, "d")}
                    </span>
                    <div className="space-y-0.5 mt-0.5">
                      {dayTasks.slice(0, 2).map(t => (
                        <button
                          key={t.id}
                          onClick={() => handleTaskClick(t)}
                          className="w-full text-left text-[8px] px-1 py-0.5 rounded bg-primary/10 text-primary truncate font-medium cursor-pointer hover:bg-primary/20 transition-colors"
                          title={`${t.horario || ""} ${t.titulo} — Clique para reagendar`}
                        >
                          <Clock className="h-2 w-2 inline mr-0.5" />
                          {t.horario || "—"} {t.titulo.replace("Medição - ", "")}
                        </button>
                      ))}
                      {dayTasks.length > 2 && (
                        <span className="text-[8px] text-muted-foreground">+{dayTasks.length - 2}</span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </CardContent>
      </Card>

      <MeasurementScheduleDialog
        open={!!selectedTask}
        clientName={selectedTask?.clientName || ""}
        clientId={selectedTask?.clientId || selectedTask?.task.id}
        tenantId={tenantId || undefined}
        isReschedule
        onConfirm={handleRescheduleConfirm}
        onCancel={() => setSelectedTask(null)}
      />
    </>
  );
}

export default MeasurementCalendarWidget;
