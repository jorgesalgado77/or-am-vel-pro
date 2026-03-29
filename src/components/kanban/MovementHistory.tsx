import { useState, useEffect } from "react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { ArrowRight, History } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { supabase } from "@/lib/supabaseClient";
import { KANBAN_ALL_COLUMNS } from "./kanbanTypes";

interface Movement {
  id: string;
  from_column: string | null;
  to_column: string;
  moved_by: string | null;
  moved_at: string;
}

interface MovementHistoryProps {
  clientId: string;
}

function getColumnLabel(colId: string | null) {
  if (!colId) return "—";
  return KANBAN_ALL_COLUMNS.find(c => c.id === colId)?.label || colId;
}

function getColumnColor(colId: string | null) {
  if (!colId) return undefined;
  return KANBAN_ALL_COLUMNS.find(c => c.id === colId)?.color;
}

export function MovementHistory({ clientId }: MovementHistoryProps) {
  const [movements, setMovements] = useState<Movement[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!clientId) return;

    const load = async () => {
      const { data } = await supabase
        .from("client_movements" as any)
        .select("id, from_column, to_column, moved_by, moved_at")
        .eq("client_id", clientId)
        .order("moved_at", { ascending: false })
        .limit(20);

      if (data) setMovements(data as any[]);
      setLoading(false);
    };
    load();

    const channel = supabase
      .channel(`movements-${clientId}`)
      .on("postgres_changes" as any, {
        event: "INSERT",
        schema: "public",
        table: "client_movements",
        filter: `client_id=eq.${clientId}`,
      }, (payload: any) => {
        if (payload.new) {
          setMovements(prev => [payload.new as Movement, ...prev].slice(0, 20));
        }
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [clientId]);

  if (loading) return null;
  if (movements.length === 0) return null;

  return (
    <>
      <Separator />
      <div className="space-y-2">
        <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-1.5">
          <History className="h-3.5 w-3.5" /> Histórico de Movimentações
        </h4>
        <div className="space-y-1.5 max-h-[200px] overflow-y-auto">
          {movements.map(m => (
            <div key={m.id} className="flex items-center gap-2 text-[11px] bg-muted/30 rounded-md px-2 py-1.5">
              <span className="text-muted-foreground shrink-0">
                {format(new Date(m.moved_at), "dd/MM/yy HH:mm", { locale: ptBR })}
              </span>
              <Badge
                variant="outline"
                className="text-[9px] h-4 px-1"
                style={{ borderColor: getColumnColor(m.from_column), color: getColumnColor(m.from_column) }}
              >
                {getColumnLabel(m.from_column)}
              </Badge>
              <ArrowRight className="h-3 w-3 text-muted-foreground shrink-0" />
              <Badge
                variant="outline"
                className="text-[9px] h-4 px-1"
                style={{ borderColor: getColumnColor(m.to_column), color: getColumnColor(m.to_column) }}
              >
                {getColumnLabel(m.to_column)}
              </Badge>
              {m.moved_by && (
                <span className="text-muted-foreground ml-auto truncate max-w-[80px]" title={m.moved_by}>
                  {m.moved_by}
                </span>
              )}
            </div>
          ))}
        </div>
      </div>
    </>
  );
}
