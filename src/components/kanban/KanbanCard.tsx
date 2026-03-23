/**
 * Individual Kanban card rendered inside a Draggable.
 */
import { memo } from "react";
import { differenceInDays } from "date-fns";
import { format, addDays, isPast } from "date-fns";
import { Draggable } from "@hello-pangea/dnd";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { ArrowRight, UserPlus, GripVertical, Clock, AlertTriangle, User, Repeat, FileText, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatCurrency } from "@/lib/financing";
import { TEMPERATURE_CONFIG, type LeadTemperature } from "@/lib/leadTemperature";
import type { Client, LastSimInfo } from "./kanbanTypes";

interface KanbanCardProps {
  client: Client;
  index: number;
  sim: LastSimInfo | undefined;
  budgetValidityDays: number;
  cargoNome: string;
  followUpStatus?: "active" | "paused" | "completed";
  onClick: (client: Client) => void;
  onQuickDelete?: (client: Client) => void;
}

export const KanbanCard = memo(function KanbanCard({ client, index, sim, budgetValidityDays, cargoNome, followUpStatus, onClick }: KanbanCardProps) {
  const expired = sim ? isPast(addDays(new Date(sim.created_at), budgetValidityDays)) : false;
  const daysInColumn = differenceInDays(new Date(), new Date(client.updated_at));
  const agingColor =
    daysInColumn <= 1 ? "hsl(142, 71%, 45%)" :
    daysInColumn <= 3 ? "hsl(48, 96%, 53%)" :
    daysInColumn <= 7 ? "hsl(25, 95%, 53%)" :
    "hsl(0, 84%, 60%)";
  const agingGlow =
    daysInColumn > 7 ? "0 0 6px hsl(0 84% 60% / 0.3)" :
    daysInColumn > 3 ? "0 0 4px hsl(25 95% 53% / 0.2)" : "none";

  return (
    <Draggable key={client.id} draggableId={client.id} index={index}>
      {(provided, snapshot) => (
        <div
          ref={provided.innerRef}
          {...provided.draggableProps}
          className={cn(
            "rounded-lg border bg-card shadow-sm transition-colors cursor-pointer group border-l-[3px] sm:border-l-[4px]",
            "hover:shadow-md hover:border-primary/30",
            "active:scale-[0.98]",
            snapshot.isDragging && "shadow-lg ring-2 ring-primary/40 scale-[1.02]",
            expired && "border-destructive/30"
          )}
          style={{
            ...provided.draggableProps.style,
            borderLeftColor: agingColor,
          }}
          onClick={() => onClick(client)}
        >
          <div className="p-2 sm:p-3">
            {/* Badge de tipo na coluna Novo */}
            {((client as any).status || "novo") === "novo" && (
              <div className="mb-1.5">
                {(client as any).origem_lead && (client as any).origem_lead !== "manual" ? (
                  <Badge className="text-[9px] h-4 px-1.5 font-semibold bg-primary/15 text-primary border-primary/30 gap-0.5" variant="outline">
                    <ArrowRight className="h-2.5 w-2.5" />Lead Recebido
                  </Badge>
                ) : (
                  <Badge className="text-[9px] h-4 px-1.5 font-semibold bg-emerald-500/15 text-emerald-600 border-emerald-500/30 gap-0.5" variant="outline">
                    <UserPlus className="h-2.5 w-2.5" />Cliente Loja
                  </Badge>
                )}
              </div>
            )}
            <div className="flex items-start justify-between gap-1">
              <div className="flex-1 min-w-0">
                <p className="text-xs sm:text-sm font-semibold text-foreground truncate">{client.nome}</p>
                <div className="flex items-center gap-1 mt-0.5">
                  <p className="text-[11px] text-muted-foreground font-mono">
                    {(client as any).numero_orcamento || "Sem orçamento"}
                  </p>
                  {(() => {
                    const temp = (client as any).lead_temperature as LeadTemperature | null;
                    if (!temp || !TEMPERATURE_CONFIG[temp]) return null;
                    const cfg = TEMPERATURE_CONFIG[temp];
                    return (
                      <Badge variant="outline" className={cn("text-[9px] h-4 px-1 font-medium", cfg.color)}>
                        {cfg.emoji} {cfg.label}
                      </Badge>
                    );
                  })()}
                  {followUpStatus && (
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Badge
                          variant="outline"
                          className={cn(
                            "text-[9px] h-4 px-1 font-medium gap-0.5",
                            followUpStatus === "active" && "border-emerald-400 text-emerald-600 bg-emerald-50",
                            followUpStatus === "paused" && "border-amber-400 text-amber-600 bg-amber-50",
                            followUpStatus === "completed" && "border-sky-400 text-sky-600 bg-sky-50",
                          )}
                        >
                          <Repeat className="h-2.5 w-2.5" />
                          {followUpStatus === "active" ? "FU" : followUpStatus === "paused" ? "⏸" : "✓"}
                        </Badge>
                      </TooltipTrigger>
                      <TooltipContent side="top" className="text-xs">
                        {followUpStatus === "active" && "Follow-up ativo"}
                        {followUpStatus === "paused" && "Follow-up pausado"}
                        {followUpStatus === "completed" && "Follow-up concluído"}
                      </TooltipContent>
                    </Tooltip>
                  )}
                </div>
              </div>
              <div {...provided.dragHandleProps} className="opacity-0 group-hover:opacity-60 transition-opacity pt-0.5">
                <GripVertical className="h-4 w-4 text-muted-foreground" />
              </div>
            </div>
            <div className="flex items-center justify-between mt-2">
              <div className="flex items-center gap-1.5">
                <span className="text-[11px] text-muted-foreground">
                  {format(new Date(client.created_at), "dd/MM/yy")}
                </span>
                <Badge
                  variant="outline"
                  className={cn(
                    "text-[9px] h-4 px-1 font-medium",
                    daysInColumn === 0 && "border-green-400 text-green-600",
                    daysInColumn >= 1 && daysInColumn <= 3 && "border-yellow-400 text-yellow-600",
                    daysInColumn >= 4 && daysInColumn <= 7 && "border-orange-400 text-orange-600",
                    daysInColumn > 7 && "border-destructive text-destructive"
                  )}
                >
                  <Clock className="h-2.5 w-2.5 mr-0.5" />
                  {daysInColumn === 0 ? "hoje" : `${daysInColumn}d`}
                </Badge>
              </div>
              {sim && (
                <span className={cn("text-xs font-semibold", expired ? "text-destructive" : "text-foreground")}>
                  {formatCurrency(sim.valor_com_desconto)}
                </span>
              )}
            </div>
            {sim && (
              <div className="flex items-center justify-between mt-1">
                <div className="flex items-center gap-1">
                  <FileText className="h-3 w-3 text-muted-foreground" />
                  <span className="text-[10px] text-muted-foreground">{sim.sim_count} {sim.sim_count === 1 ? "simulação" : "simulações"}</span>
                </div>
                <span className="text-[10px] text-muted-foreground">
                  Última: {format(new Date(sim.created_at), "dd/MM/yy")}
                </span>
              </div>
            )}
            {(cargoNome.includes("administrador") || cargoNome.includes("gerente")) && client.vendedor && (
              <div className="flex items-center gap-1 mt-1.5">
                <User className="h-3 w-3 text-primary/60" />
                <span className="text-[10px] text-primary/80 font-medium truncate">{client.vendedor}</span>
              </div>
            )}
            {expired && (
              <div className="flex items-center gap-1 mt-1.5">
                <AlertTriangle className="h-3 w-3 text-destructive" />
                <span className="text-[10px] text-destructive font-medium">Orçamento expirado</span>
              </div>
            )}
          </div>
        </div>
      )}
    </Draggable>
  );
});
