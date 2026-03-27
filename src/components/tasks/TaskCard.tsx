import { memo } from "react";
import { Draggable } from "@hello-pangea/dnd";
import { format } from "date-fns";
import { Clock, GripVertical, User, Paperclip, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { TASK_COLUMNS, TASK_TYPES, type Task, type TaskStatus } from "./taskTypes";

interface TaskCardProps {
  task: Task;
  index: number;
  onClick: (task: Task) => void;
  onDelete?: (task: Task) => void;
}

export const TaskCard = memo(function TaskCard({ task, index, onClick, onDelete }: TaskCardProps) {
  const col = TASK_COLUMNS.find(c => c.id === task.status);
  const typeLabel = TASK_TYPES.find(t => t.value === task.tipo)?.label || task.tipo;

  return (
    <Draggable draggableId={task.id} index={index}>
      {(provided, snapshot) => (
        <div
          ref={provided.innerRef}
          {...provided.draggableProps}
          className={cn(
            "rounded-lg border shadow-sm transition-all cursor-pointer group",
            "hover:shadow-md active:scale-[0.98]",
            col?.cardBg || "bg-card",
            snapshot.isDragging && "shadow-lg ring-2 ring-primary/40 scale-[1.02]",
          )}
          style={provided.draggableProps.style}
          onClick={() => onClick(task)}
        >
          <div className="p-3">
            <div className="flex items-start justify-between gap-1">
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-foreground truncate">{task.titulo}</p>
                <Badge variant="outline" className="text-[9px] h-4 px-1 mt-1 font-medium">
                  {typeLabel}
                </Badge>
              </div>
              <div {...provided.dragHandleProps} className="opacity-0 group-hover:opacity-60 transition-opacity pt-0.5">
                <GripVertical className="h-4 w-4 text-muted-foreground" />
              </div>
            </div>

            {task.descricao && (
              <p className="text-xs text-muted-foreground mt-1.5 line-clamp-2">{task.descricao}</p>
            )}

            <div className="flex items-center justify-between mt-2">
              <div className="flex items-center gap-1.5">
                <Clock className="h-3 w-3 text-muted-foreground" />
                <span className="text-[11px] text-muted-foreground">
                  {format(new Date(task.data_tarefa + "T00:00:00"), "dd/MM/yy")}
                </span>
                {task.horario && (
                  <span className="text-[11px] text-muted-foreground font-mono">{task.horario}</span>
                )}
              </div>
              <div className="flex items-center gap-1">
                {task.anexos && task.anexos.length > 0 && (
                  <Paperclip className="h-3 w-3 text-muted-foreground" />
                )}
                {onDelete && (
                  <button
                    onClick={(e) => { e.stopPropagation(); onDelete(task); }}
                    className="opacity-0 group-hover:opacity-100 transition-opacity p-0.5 rounded hover:bg-destructive/10"
                  >
                    <Trash2 className="h-3.5 w-3.5 text-destructive" />
                  </button>
                )}
              </div>
            </div>

            {task.responsavel_nome && (
              <div className="flex items-center gap-1 mt-1.5">
                <User className="h-3 w-3 text-primary/60" />
                <span className="text-[10px] text-primary/80 font-medium truncate">{task.responsavel_nome}</span>
              </div>
            )}
          </div>
        </div>
      )}
    </Draggable>
  );
});
