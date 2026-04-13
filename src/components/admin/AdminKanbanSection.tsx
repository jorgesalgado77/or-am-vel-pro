import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/lib/supabaseClient";
import { Badge } from "@/components/ui/badge";
import { AdminCollapsibleSection } from "./AdminCollapsibleSection";
import { AdminKanbanTasks } from "./AdminKanbanTasks";
import { ClipboardList } from "lucide-react";
import { differenceInDays } from "date-fns";

export function AdminKanbanSection() {
  const [newCount, setNewCount] = useState(0);
  const [stuckCount, setStuckCount] = useState(0);

  const fetchCounts = useCallback(async () => {
    const { data } = await supabase
      .from("admin_tasks" as any)
      .select("coluna, moved_at")
      .neq("coluna", "concluida")
      .neq("coluna", "arquivada");

    if (!data) return;
    const now = new Date();
    let newC = 0;
    let stuckC = 0;
    (data as any[]).forEach((t) => {
      if (t.coluna === "nova") newC++;
      if (t.coluna === "pendente" && differenceInDays(now, new Date(t.moved_at)) >= 2) stuckC++;
    });
    setNewCount(newC);
    setStuckCount(stuckC);
  }, []);

  useEffect(() => {
    fetchCounts();
    const channel = supabase
      .channel("admin-kanban-badges")
      .on("postgres_changes", { event: "*", schema: "public", table: "admin_tasks" }, () => fetchCounts())
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [fetchCounts]);

  const totalBadge = newCount + stuckCount;

  const title = (
    <span className="flex items-center gap-2">
      Kanban de Tarefas
      {newCount > 0 && (
        <Badge className="bg-sky-500 text-white text-[10px] h-5 min-w-[20px] px-1.5 rounded-full">
          {newCount} nova{newCount > 1 ? "s" : ""}
        </Badge>
      )}
      {stuckCount > 0 && (
        <Badge variant="destructive" className="text-[10px] h-5 min-w-[20px] px-1.5 rounded-full animate-pulse">
          {stuckCount} parada{stuckCount > 1 ? "s" : ""}
        </Badge>
      )}
    </span>
  );

  return (
    <AdminCollapsibleSection title={title as any} icon={ClipboardList}>
      <AdminKanbanTasks />
    </AdminCollapsibleSection>
  );
}
