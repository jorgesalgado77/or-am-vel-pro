/**
 * Individual Kanban card rendered inside a Draggable.
 * Card background tinted to match its column color.
 */
import { memo } from "react";
import { differenceInDays } from "date-fns";
import { format, addDays, isPast } from "date-fns";
import { Draggable } from "@hello-pangea/dnd";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { ArrowRight, UserPlus, GripVertical, Clock, AlertTriangle, User, Repeat, FileText, Trash2, CheckCircle2, Phone, UserCheck } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatCurrency } from "@/lib/financing";
import { TEMPERATURE_CONFIG, type LeadTemperature } from "@/lib/leadTemperature";
import { KANBAN_ALL_COLUMNS } from "./kanbanTypes";
import { KanbanDealBadge } from "./KanbanDealBadge";
import type { Client, LastSimInfo } from "./kanbanTypes";

interface KanbanCardProps {
  client: Client;
  index: number;
  sim: LastSimInfo | undefined;
  budgetValidityDays: number;
  cargoNome: string;
  tenantId: string;
  followUpStatus?: "active" | "paused" | "completed";
  assignedTechnician?: string | null;
  onClick: (client: Client) => void;
  onQuickDelete?: (client: Client) => void;
}

/** Map column id to card tint styles (border-left + subtle bg) */
function getColumnTint(status: string): { borderColor: string; bgClass: string } {
  const col = KANBAN_ALL_COLUMNS.find(c => c.id === status);
  if (!col) return { borderColor: "hsl(var(--primary))", bgClass: "" };

  switch (status) {
    // Comercial
    case "novo":
      return { borderColor: col.color, bgClass: "bg-[hsl(215_80%_55%/0.12)] dark:bg-[hsl(215_80%_55%/0.18)]" };
    case "em_negociacao":
      return { borderColor: col.color, bgClass: "bg-[hsl(270_70%_55%/0.12)] dark:bg-[hsl(270_70%_55%/0.18)]" };
    case "expirado":
      return { borderColor: col.color, bgClass: "bg-[hsl(30_80%_50%/0.12)] dark:bg-[hsl(30_80%_50%/0.18)]" };
    case "fechado":
      return { borderColor: col.color, bgClass: "bg-[hsl(142_71%_45%/0.12)] dark:bg-[hsl(142_71%_45%/0.18)]" };
    case "perdido":
      return { borderColor: col.color, bgClass: "bg-[hsl(0_72%_51%/0.12)] dark:bg-[hsl(0_72%_51%/0.18)]" };
    // Operacional
    case "em_medicao":
      return { borderColor: col.color, bgClass: "bg-[hsl(200_70%_50%/0.12)] dark:bg-[hsl(200_70%_50%/0.18)]" };
    case "em_liberado":
      return { borderColor: col.color, bgClass: "bg-[hsl(180_60%_45%/0.12)] dark:bg-[hsl(180_60%_45%/0.18)]" };
    case "em_compras":
      return { borderColor: col.color, bgClass: "bg-[hsl(45_90%_50%/0.12)] dark:bg-[hsl(45_90%_50%/0.18)]" };
    case "para_entrega":
      return { borderColor: col.color, bgClass: "bg-[hsl(220_70%_55%/0.12)] dark:bg-[hsl(220_70%_55%/0.18)]" };
    case "para_montagem":
      return { borderColor: col.color, bgClass: "bg-[hsl(280_60%_55%/0.12)] dark:bg-[hsl(280_60%_55%/0.18)]" };
    case "assistencia":
      return { borderColor: col.color, bgClass: "bg-[hsl(15_80%_55%/0.12)] dark:bg-[hsl(15_80%_55%/0.18)]" };
    case "finalizado":
      return { borderColor: col.color, bgClass: "bg-[hsl(142_71%_35%/0.12)] dark:bg-[hsl(142_71%_35%/0.18)]" };
    default:
      return { borderColor: col.color, bgClass: "" };
  }
}

export const KanbanCard = memo(function KanbanCard({ client, index, sim, budgetValidityDays, cargoNome, tenantId, followUpStatus, assignedTechnician, onClick, onQuickDelete }: KanbanCardProps) {
  const clientStatus = ((client as any).status || "novo").toLowerCase();
  const hasClosedContract = clientStatus === "fechado" || !!(client as any).data_contrato;
  const expired = sim && !hasClosedContract ? isPast(addDays(new Date(sim.created_at), budgetValidityDays)) : false;
  const daysInColumn = differenceInDays(new Date(), new Date(client.updated_at));
  const tint = getColumnTint(clientStatus);

  return (
    <Draggable key={client.id} draggableId={client.id} index={index}>
      {(provided, snapshot) => (
        <div
          ref={provided.innerRef}
          {...provided.draggableProps}
          className={cn(
            "rounded-lg border shadow-sm transition-colors cursor-pointer group border-l-[3px] sm:border-l-[4px]",
            tint.bgClass,
            "hover:shadow-md hover:border-primary/30",
            "active:scale-[0.98]",
            snapshot.isDragging && "shadow-lg ring-2 ring-primary/40 scale-[1.02]",
            expired && "border-destructive/30",
            clientStatus === "fechado" && "ring-2 ring-success/50"
          )}
          style={{
            ...provided.draggableProps.style,
            borderLeftColor: tint.borderColor,
          }}
          onClick={() => onClick(client)}
        >
          <div className="p-2 sm:p-3">
            {/* Badge de tipo na coluna Novo */}
            {clientStatus === "novo" && (
              <div className="mb-1.5">
                {(client as any).origem_lead && (client as any).origem_lead !== "manual" ? (
                  <Badge className="text-[9px] h-4 px-1.5 font-semibold bg-primary/15 text-primary border-primary/30 gap-0.5" variant="outline">
                    <ArrowRight className="h-2.5 w-2.5" />Lead Recebido
                  </Badge>
                ) : (
                  <Badge className="text-[9px] h-4 px-1.5 font-semibold bg-success/15 text-success border-success/30 gap-0.5" variant="outline">
                    <UserPlus className="h-2.5 w-2.5" />Cliente Loja
                  </Badge>
                )}
              </div>
            )}
            <div className="flex items-start justify-between gap-1">
              <div className="flex-1 min-w-0">
                <p className="text-xs sm:text-sm font-semibold text-foreground truncate">{client.nome}</p>
                {(client as any).telefone1 && (
                  <div className="flex items-center gap-1 mt-0.5">
                    <Phone className="h-2.5 w-2.5 text-success" />
                    <span className="text-[10px] text-muted-foreground font-mono">{(client as any).telefone1}</span>
                  </div>
                )}
                <div className="flex items-center gap-1 mt-0.5">
                  <p className="text-[11px] text-muted-foreground font-mono">
                    {(() => {
                      const orc = (client as any).numero_orcamento;
                      if (!orc || /^(WA-?|55|\+?\d{10,})/i.test(orc)) return "Sem orçamento";
                      return orc;
                    })()}
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
                            followUpStatus === "active" && "border-success text-success bg-success/10",
                            followUpStatus === "paused" && "border-warning text-warning bg-warning/10",
                            followUpStatus === "completed" && "border-primary text-primary bg-primary/10",
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
                    daysInColumn === 0 && "border-success text-success",
                    daysInColumn >= 1 && daysInColumn <= 3 && "border-warning text-warning",
                    daysInColumn >= 4 && daysInColumn <= 7 && "border-warning text-warning",
                    daysInColumn > 7 && "border-destructive text-destructive"
                  )}
                >
                  <Clock className="h-2.5 w-2.5 mr-0.5" />
                  {daysInColumn === 0 ? "hoje" : `${daysInColumn}d`}
                </Badge>
              </div>
              <div className="flex items-center gap-1">
                {sim && (
                  <span className={cn("text-xs font-semibold", expired ? "text-destructive" : isFechado ? "text-success" : "text-foreground")}>
                    {formatCurrency(sim.valor_com_desconto)}
                  </span>
                )}
                {onQuickDelete && cargoNome.includes("administrador") && (
                  <button
                    onClick={(e) => { e.stopPropagation(); onQuickDelete(client); }}
                    className="opacity-0 group-hover:opacity-100 transition-opacity p-0.5 rounded hover:bg-destructive/10"
                    title="Excluir cliente"
                  >
                    <Trash2 className="h-3.5 w-3.5 text-destructive" />
                  </button>
                )}
              </div>
            </div>
            {sim && (
              <div className="flex items-center justify-between mt-1">
                <div className="flex items-center gap-1">
                  <FileText className="h-3 w-3 text-muted-foreground" />
                  <span className="text-[10px] text-muted-foreground">{sim.sim_count} {sim.sim_count === 1 ? "simulação" : "simulações"}</span>
                </div>
                <div className="flex items-center gap-1">
                  <KanbanDealBadge
                    clientId={client.id}
                    clientName={client.nome}
                    clientStatus={clientStatus}
                    tenantId={tenantId}
                    daysInactive={daysInColumn}
                    hasSimulation
                    valorOrcamento={sim.valor_com_desconto}
                    temperature={(client as any).lead_temperature}
                  />
                  <span className="text-[10px] text-muted-foreground">
                    Última: {format(new Date(sim.created_at), "dd/MM/yy")}
                  </span>
                </div>
              </div>
            )}
            {(client.vendedor || assignedTechnician) && (
              <div className="flex items-center gap-1 mt-1.5 flex-wrap">
                {client.vendedor && (
                  <>
                    <User className="h-3 w-3 text-primary/60 shrink-0" />
                    <span className="text-[10px] text-primary/80 font-medium truncate">{client.vendedor}</span>
                  </>
                )}
                {assignedTechnician && (
                  <>
                    <UserCheck className="h-3 w-3 text-emerald-500/70 shrink-0 ml-1" />
                    <span className="text-[10px] text-emerald-600 font-medium truncate">{assignedTechnician}</span>
                  </>
                )}
              </div>
            )}
            {expired && (
              <div className="flex items-center gap-1 mt-1.5">
                <AlertTriangle className="h-3 w-3 text-destructive" />
                <span className="text-[10px] text-destructive font-medium">Orçamento expirado</span>
              </div>
            )}
            {clientStatus === "fechado" && (
              <div className="flex items-center gap-1 mt-1.5">
                <CheckCircle2 className="h-3 w-3 text-success" />
                <span className="text-[10px] text-success font-semibold">
                  ✅ Contrato Fechado {(client as any).data_contrato ? `— ${format(new Date((client as any).data_contrato), "dd/MM/yy")}` : ""}
                </span>
              </div>
            )}
          </div>
        </div>
      )}
    </Draggable>
  );
});
