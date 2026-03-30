import { useState, useEffect, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { format, startOfMonth, endOfMonth, eachDayOfInterval, isSameDay, getDay, addMonths, subMonths } from "date-fns";
import { ptBR } from "date-fns/locale";
import { ChevronLeft, ChevronRight, Ruler, Clock } from "lucide-react";
import { supabase } from "@/lib/supabaseClient";
import { getTenantId } from "@/lib/tenantState";
import { useCurrentUser } from "@/hooks/useCurrentUser";
import type { Task } from "@/components/tasks/taskTypes";

export function MeasurementCalendarWidget() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const { currentUser } = useCurrentUser();

  useEffect(() => {
    const fetchTasks = async () => {
      const tenantId = getTenantId();
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
      setTasks((data as Task[]) || []);
    };
    fetchTasks();
  }, [currentUser]);

  const start = startOfMonth(currentMonth);
  const end = endOfMonth(currentMonth);
  const days = eachDayOfInterval({ start, end });
  const startPad = getDay(start);

  const tasksByDay = useMemo(() => {
    const map = new Map<string, Task[]>();
    tasks.forEach(t => {
      const key = t.data_tarefa;
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(t);
    });
    return map;
  }, [tasks]);

  const pendingCount = tasks.filter(t => t.status !== "concluida").length;

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base flex items-center gap-2">
            <Ruler className="h-5 w-5 text-primary" />
            Agendamentos de Medição
            {pendingCount > 0 && (
              <Badge variant="secondary" className="text-xs">{pendingCount} pendentes</Badge>
            )}
          </CardTitle>
        </div>
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
                      <div
                        key={t.id}
                        className="text-[8px] px-1 py-0.5 rounded bg-primary/10 text-primary truncate font-medium"
                        title={`${t.horario || ""} ${t.titulo}`}
                      >
                        <Clock className="h-2 w-2 inline mr-0.5" />
                        {t.horario || "—"} {t.titulo.replace("Medição - ", "")}
                      </div>
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
  );
}
