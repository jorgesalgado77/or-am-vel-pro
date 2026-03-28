import { DragDropContext, Droppable, type DropResult } from "@hello-pangea/dnd";
import { TASK_COLUMNS, type Task, type TaskStatus } from "./taskTypes";
import { TaskCard } from "./TaskCard";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

interface Props {
  tasks: Task[];
  onStatusChange: (taskId: string, status: TaskStatus) => void;
  onTaskClick: (task: Task) => void;
  onTaskDelete: (task: Task) => void;
}

export function TaskKanbanBoard({ tasks, onStatusChange, onTaskClick, onTaskDelete }: Props) {
  const handleDragEnd = (result: DropResult) => {
    if (!result.destination) return;
    const newStatus = result.destination.droppableId as TaskStatus;
    const taskId = result.draggableId;
    const currentTask = tasks.find(t => t.id === taskId);
    if (currentTask && currentTask.status !== newStatus) {
      onStatusChange(taskId, newStatus);
    }
  };

  return (
    <DragDropContext onDragEnd={handleDragEnd}>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        {TASK_COLUMNS.map(col => {
          const colTasks = tasks.filter(t => t.status === col.id);
          return (
            <div key={col.id} className="flex flex-col min-h-[300px]">
              <div className="flex items-center gap-2 mb-2 px-1">
                <span className="text-base">{col.icon}</span>
                <h3 className="text-sm font-semibold text-foreground">{col.label}</h3>
                <Badge variant="secondary" className="text-[10px] h-5 px-1.5 font-bold">{colTasks.length}</Badge>
              </div>
              <Droppable droppableId={col.id}>
                {(provided, snapshot) => (
                  <div
                    ref={provided.innerRef}
                    {...provided.droppableProps}
                    className={cn(
                      "flex-1 rounded-lg border p-2 space-y-2 transition-all duration-300",
                      snapshot.isDraggingOver
                        ? "border-primary/50 bg-primary/5 scale-[1.01] shadow-inner"
                        : col.colBg
                    )}
                  >
                    {colTasks.map((task, idx) => (
                      <TaskCard key={task.id} task={task} index={idx} onClick={onTaskClick} onDelete={onTaskDelete} />
                    ))}
                    {provided.placeholder}
                    {colTasks.length === 0 && (
                      <p className="text-center text-xs text-muted-foreground py-8">Nenhuma tarefa</p>
                    )}
                  </div>
                )}
              </Droppable>
            </div>
          );
        })}
      </div>
    </DragDropContext>
  );
}
