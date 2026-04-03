import { memo, useState, useCallback } from "react";
import { Draggable } from "@hello-pangea/dnd";
import { format } from "date-fns";
import { Clock, GripVertical, User, Paperclip, Trash2, CalendarCheck, CalendarX2, Eye } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { TASK_COLUMNS, TASK_TYPES, type Task } from "./taskTypes";
import { supabase } from "@/lib/supabaseClient";
import { ProductDetailModal } from "@/components/catalog/ProductDetailModal";
import type { Product } from "@/hooks/useProductCatalog";

function extractProductId(desc?: string | null): string | null {
  if (!desc) return null;
  const match = desc.match(/\[product_id:([a-f0-9-]+)\]/i);
  return match ? match[1] : null;
}

interface TaskCardProps {
  task: Task;
  index: number;
  onClick: (task: Task) => void;
  onDelete?: (task: Task) => void;
}

export const TaskCard = memo(function TaskCard({ task, index, onClick, onDelete }: TaskCardProps) {
  const col = TASK_COLUMNS.find(c => c.id === task.status);
  const typeLabel = TASK_TYPES.find(t => t.value === task.tipo)?.label || task.tipo;
  const isSynced = !!task.google_event_id;
  const productId = extractProductId(task.descricao);
  const [detailProduct, setDetailProduct] = useState<Product | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);

  const handleProductDetail = useCallback(async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!productId) return;
    const { data } = await (supabase as any).from("products").select("*").eq("id", productId).single();
    if (data) {
      setDetailProduct(data as Product);
      setDetailOpen(true);
    }
  }, [productId]);

  // Clean description: remove [product_id:...] marker for display
  const cleanDesc = task.descricao?.replace(/\[product_id:[a-f0-9-]+\]/gi, "").trim();

  return (
    <>
    <Draggable draggableId={task.id} index={index}>
      {(provided, snapshot) => (
        <div
          ref={provided.innerRef}
          {...provided.draggableProps}
          className={cn(
            "rounded-lg border shadow-sm cursor-pointer group",
            "transition-all duration-300 ease-in-out",
            "hover:shadow-md hover:-translate-y-0.5 active:scale-[0.98]",
            col?.cardBg || "bg-card",
            snapshot.isDragging && "shadow-xl ring-2 ring-primary/40 scale-[1.03] rotate-[1deg] z-50",
          )}
          style={provided.draggableProps.style}
          onClick={() => onClick(task)}
        >
          <div className="p-3">
            <div className="flex items-start justify-between gap-1">
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-foreground truncate">{task.titulo}</p>
                <div className="flex items-center gap-1.5 mt-1">
                  <Badge variant="outline" className="text-[9px] h-4 px-1 font-medium">
                    {typeLabel}
                  </Badge>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <span className="inline-flex">
                        {isSynced ? (
                          <CalendarCheck className="h-3.5 w-3.5 text-emerald-500" />
                        ) : (
                          <CalendarX2 className="h-3.5 w-3.5 text-muted-foreground/50" />
                        )}
                      </span>
                    </TooltipTrigger>
                    <TooltipContent side="top" className="text-xs">
                      {isSynced ? "Sincronizado com Google Agenda" : "Não sincronizado"}
                    </TooltipContent>
                  </Tooltip>
                </div>
              </div>
              <div {...provided.dragHandleProps} className="opacity-0 group-hover:opacity-60 transition-opacity pt-0.5">
                <GripVertical className="h-4 w-4 text-muted-foreground" />
              </div>
            </div>

            {cleanDesc && (
              <p className="text-xs text-muted-foreground mt-1.5 line-clamp-2 whitespace-pre-line">{cleanDesc}</p>
            )}

            {productId && (
              <Button
                variant="outline"
                size="sm"
                className="mt-2 h-6 text-[10px] gap-1 px-2"
                onClick={handleProductDetail}
              >
                <Eye className="h-3 w-3" />
                Detalhes do Produto
              </Button>
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

    {detailProduct && (
      <ProductDetailModal
        product={detailProduct}
        open={detailOpen}
        onOpenChange={(v) => { if (!v) { setDetailOpen(false); setDetailProduct(null); } }}
      />
    )}
    </>
  );
});
