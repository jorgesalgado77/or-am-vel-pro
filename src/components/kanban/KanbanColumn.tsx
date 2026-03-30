import React from "react";
import { Droppable } from "@hello-pangea/dnd";
import { Badge } from "@/components/ui/badge";
import { ArrowRight, UserPlus } from "lucide-react";
import { cn } from "@/lib/utils";
import { KanbanCard } from "./KanbanCard";
import type { Client, LastSimInfo } from "./kanbanTypes";

interface KanbanColumnProps {
  col: { id: string; label: string; icon: string; color: string };
  clients: Client[];
  lastSims: Record<string, LastSimInfo>;
  budgetValidityDays: number;
  cargoNome: string;
  tenantId: string;
  followUpStatus: Record<string, "active" | "paused" | "completed">;
  measurementStatus: Record<string, { status: string; assigned_to: string | null }>;
  canDelete: boolean;
  onClientClick: (client: Client) => void;
  onDelete: (id: string) => void;
  onScheduleMeasurement?: (clientId: string, clientName: string) => void;
}

export const KanbanColumn = React.memo(function KanbanColumn({
  col, clients, lastSims, budgetValidityDays, cargoNome, tenantId,
  followUpStatus, measurementStatus, canDelete, onClientClick, onDelete, onScheduleMeasurement,
}: KanbanColumnProps) {
  return (
    <div className="flex flex-col min-w-[170px] w-[170px] sm:min-w-[200px] sm:w-[200px] md:min-w-[220px] md:w-[220px] lg:min-w-[240px] lg:w-[240px] shrink-0">
      <div className="flex flex-col gap-1 mb-2 px-1">
        <div className="flex items-center gap-1.5 sm:gap-2">
          <span className="text-sm sm:text-base">{col.icon}</span>
          <span className="text-xs sm:text-sm font-semibold text-foreground truncate">{col.label}</span>
          <Badge variant="outline" className="ml-auto text-[9px] sm:text-[10px] h-4 sm:h-5 px-1 sm:px-1.5">
            {clients.length}
          </Badge>
        </div>
        {col.id === "novo" && clients.length > 0 && (
          <div className="flex items-center gap-1.5 pl-6 sm:pl-7">
            {(() => {
              const recentes = clients.filter(c => !(c as any).origem_lead || (c as any).origem_lead === "manual").length;
              const leads = clients.length - recentes;
              return (
                <>
                  <Badge variant="outline" className="text-[8px] sm:text-[9px] h-3.5 sm:h-4 px-1 sm:px-1.5 border-emerald-500/30 text-emerald-600 gap-0.5">
                    <UserPlus className="h-2 w-2 sm:h-2.5 sm:w-2.5" />{recentes}
                  </Badge>
                  <Badge variant="outline" className="text-[8px] sm:text-[9px] h-3.5 sm:h-4 px-1 sm:px-1.5 border-primary/30 text-primary gap-0.5">
                    <ArrowRight className="h-2 w-2 sm:h-2.5 sm:w-2.5" />{leads}
                  </Badge>
                </>
              );
            })()}
          </div>
        )}
      </div>
      <div
        className="rounded-lg border border-border/60 bg-muted/20 p-1 sm:p-1.5 flex-1 min-h-[150px] sm:min-h-[200px]"
        style={{ borderTopColor: col.color, borderTopWidth: 3 }}
      >
        <Droppable droppableId={col.id}>
          {(provided, snapshot) => (
            <div
              ref={provided.innerRef}
              {...provided.droppableProps}
              className={cn(
                "space-y-1.5 sm:space-y-2 min-h-[130px] sm:min-h-[180px] rounded-md transition-colors duration-200 p-0.5 sm:p-1",
                snapshot.isDraggingOver && "bg-primary/5 ring-2 ring-primary/20"
              )}
            >
              {clients.map((client, index) => (
                <KanbanCard
                  key={client.id}
                  client={client}
                  index={index}
                  sim={lastSims[client.id]}
                  budgetValidityDays={budgetValidityDays}
                  cargoNome={cargoNome}
                  tenantId={tenantId}
                  followUpStatus={followUpStatus[client.id]}
                  assignedTechnician={measurementStatus[client.id]?.assigned_to || null}
                  onClick={onClientClick}
                  onQuickDelete={canDelete ? (c) => {
                    if (window.confirm(`Excluir o lead "${c.nome}"? Esta ação não pode ser desfeita.`)) {
                      onDelete(c.id);
                    }
                  } : undefined}
                  onScheduleMeasurement={onScheduleMeasurement}
                />
              ))}
              {provided.placeholder}
            </div>
          )}
        </Droppable>
      </div>
    </div>
  );
});