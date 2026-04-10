/**
 * Report showing how many days each operational stage took for a client.
 * Reads from client_movements table to build the timeline.
 */
import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabaseClient";
import { Badge } from "@/components/ui/badge";
import { Clock, ArrowRight } from "lucide-react";
import { differenceInDays, differenceInHours } from "date-fns";
import { format } from "date-fns";
import { cn } from "@/lib/utils";

interface StageEntry {
  from: string;
  to: string;
  date: string;
  movedBy: string;
}

interface StageDuration {
  stage: string;
  days: number;
  hours: number;
  enteredAt: string;
  exitedAt: string | null;
}

const STAGE_LABELS: Record<string, string> = {
  novo: "Novo",
  em_negociacao: "Em Negociação",
  fechado: "Fechado",
  em_medicao: "Em Medição",
  em_andamento: "Em Medição",
  em_liberado: "Em Liberação",
  em_liberacao: "Em Liberação",
  em_compras: "Em Compras",
  enviado_compras: "Em Compras",
  para_entrega: "Para Entrega",
  para_montagem: "Para Montagem",
  assistencia: "Assistência",
  finalizado: "Finalizado",
  perdido: "Perdido",
  expirado: "Expirado",
};

const STAGE_COLORS: Record<string, string> = {
  novo: "bg-primary/15 text-primary border-primary/30",
  em_negociacao: "bg-[hsl(270_70%_55%/0.15)] text-[hsl(270_70%_45%)] border-[hsl(270_70%_55%/0.3)]",
  fechado: "bg-success/15 text-success border-success/30",
  em_medicao: "bg-[hsl(270_70%_55%/0.15)] text-[hsl(270_70%_45%)] border-[hsl(270_70%_55%/0.3)]",
  em_liberado: "bg-[hsl(30_80%_50%/0.15)] text-[hsl(30_80%_40%)] border-[hsl(30_80%_50%/0.3)]",
  em_compras: "bg-[hsl(45_90%_50%/0.15)] text-[hsl(45_90%_35%)] border-[hsl(45_90%_50%/0.3)]",
  para_entrega: "bg-primary/15 text-primary border-primary/30",
  para_montagem: "bg-[hsl(280_60%_55%/0.15)] text-[hsl(280_60%_40%)] border-[hsl(280_60%_55%/0.3)]",
  assistencia: "bg-[hsl(15_80%_55%/0.15)] text-[hsl(15_80%_40%)] border-[hsl(15_80%_55%/0.3)]",
  finalizado: "bg-success/15 text-success border-success/30",
};

interface Props {
  clientId: string;
  clientCreatedAt: string;
}

export function StageReport({ clientId, clientCreatedAt }: Props) {
  const [durations, setDurations] = useState<StageDuration[]>([]);
  const [loading, setLoading] = useState(true);
  const [totalDays, setTotalDays] = useState(0);

  useEffect(() => {
    const fetch = async () => {
      const { data } = await supabase
        .from("client_movements" as any)
        .select("from_column, to_column, created_at, moved_by")
        .eq("client_id", clientId)
        .order("created_at", { ascending: true });

      const movements: StageEntry[] = (data || []).map((m: any) => ({
        from: m.from_column,
        to: m.to_column,
        date: m.created_at,
        movedBy: m.moved_by || "",
      }));

      // Build stage durations
      const stages: StageDuration[] = [];
      
      if (movements.length === 0) {
        // No movements — client is still in initial stage
        stages.push({
          stage: "novo",
          days: differenceInDays(new Date(), new Date(clientCreatedAt)),
          hours: differenceInHours(new Date(), new Date(clientCreatedAt)) % 24,
          enteredAt: clientCreatedAt,
          exitedAt: null,
        });
      } else {
        // First stage: from creation to first movement
        stages.push({
          stage: movements[0].from || "novo",
          days: differenceInDays(new Date(movements[0].date), new Date(clientCreatedAt)),
          hours: differenceInHours(new Date(movements[0].date), new Date(clientCreatedAt)) % 24,
          enteredAt: clientCreatedAt,
          exitedAt: movements[0].date,
        });

        // Subsequent stages
        for (let i = 0; i < movements.length; i++) {
          const entered = movements[i].date;
          const exited = movements[i + 1]?.date || null;
          const exitDate = exited ? new Date(exited) : new Date();
          stages.push({
            stage: movements[i].to,
            days: differenceInDays(exitDate, new Date(entered)),
            hours: differenceInHours(exitDate, new Date(entered)) % 24,
            enteredAt: entered,
            exitedAt: exited,
          });
        }
      }

      setDurations(stages);
      setTotalDays(differenceInDays(new Date(), new Date(clientCreatedAt)));
      setLoading(false);
    };
    fetch();
  }, [clientId, clientCreatedAt]);

  if (loading) return <p className="text-xs text-muted-foreground py-2">Carregando relatório...</p>;
  if (durations.length === 0) return null;

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <h4 className="text-xs font-semibold text-foreground flex items-center gap-1.5">
          <Clock className="h-3.5 w-3.5 text-primary" />
          Relatório de Etapas
        </h4>
        <Badge variant="outline" className="text-[9px] h-4 px-1.5 font-medium">
          Total: {totalDays}d no sistema
        </Badge>
      </div>
      <div className="space-y-1">
        {durations.map((d, i) => {
          const label = STAGE_LABELS[d.stage] || d.stage;
          const colorCls = STAGE_COLORS[d.stage] || "bg-muted text-muted-foreground border-border";
          const durationText = d.days > 0 ? `${d.days}d ${d.hours}h` : `${d.hours}h`;
          return (
            <div key={i} className="flex items-center gap-2">
              <Badge variant="outline" className={cn("text-[9px] h-5 px-1.5 font-semibold min-w-[90px] justify-center", colorCls)}>
                {label}
              </Badge>
              <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden">
                <div
                  className={cn("h-full rounded-full transition-all", d.days > 5 ? "bg-destructive/60" : d.days > 2 ? "bg-warning/60" : "bg-success/60")}
                  style={{ width: `${Math.min(100, totalDays > 0 ? ((d.days + d.hours / 24) / totalDays) * 100 : 100)}%` }}
                />
              </div>
              <span className={cn(
                "text-[10px] font-bold min-w-[40px] text-right",
                d.days > 5 ? "text-destructive" : d.days > 2 ? "text-warning" : "text-success"
              )}>
                {durationText}
              </span>
              {!d.exitedAt && (
                <Badge variant="outline" className="text-[8px] h-4 px-1 border-primary/40 text-primary animate-pulse">
                  atual
                </Badge>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
