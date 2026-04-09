import { useState, useRef, forwardRef } from "react";
import { Button } from "@/components/ui/button";
import { Eye, EyeOff, Lock, Unlock, GripVertical, Trash2, ChevronUp, ChevronDown } from "lucide-react";

interface CanvasElement {
  id: string;
  type: string;
  text: string;
  locked?: boolean;
  zIndex: number;
  imageUrl?: string;
  [key: string]: any;
}

interface ContractLayersPanelProps {
  elements: CanvasElement[];
  selectedIds: Set<string>;
  onSelect: (ids: Set<string>) => void;
  onUpdate: (updater: (prev: CanvasElement[]) => CanvasElement[]) => void;
  hiddenIds: Set<string>;
  onToggleHidden: (id: string) => void;
}

function getElementLabel(el: CanvasElement): string {
  const typeLabels: Record<string, string> = {
    text: "📝 Texto",
    rect: "⬜ Retângulo",
    circle: "⭕ Círculo",
    line: "➖ Linha",
    image: "🖼️ Imagem",
    table: "📊 Tabela",
  };
  const prefix = typeLabels[el.type] || el.type;
  if (el.type === "text" && el.text) {
    const plain = el.text.replace(/<[^>]*>/g, "").slice(0, 20);
    return `${prefix}: ${plain}${el.text.length > 20 ? "…" : ""}`;
  }
  return prefix;
}

export const ContractLayersPanel = forwardRef<HTMLDivElement, ContractLayersPanelProps>(({
  elements,
  selectedIds,
  onSelect,
  onUpdate,
  hiddenIds,
  onToggleHidden,
}, ref) => {
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [customNames, setCustomNames] = useState<Record<string, string>>({});
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragId, setDragId] = useState<string | null>(null);
  const [dragOverId, setDragOverId] = useState<string | null>(null);

  // Sort by zIndex descending (top layers first)
  const sorted = [...elements].sort((a, b) => b.zIndex - a.zIndex);

  const moveLayer = (id: string, dir: "up" | "down") => {
    onUpdate(prev => {
      const sorted = [...prev].sort((a, b) => a.zIndex - b.zIndex);
      const idx = sorted.findIndex(e => e.id === id);
      if (idx === -1) return prev;
      const swapIdx = dir === "up" ? idx + 1 : idx - 1;
      if (swapIdx < 0 || swapIdx >= sorted.length) return prev;
      const zA = sorted[idx].zIndex;
      const zB = sorted[swapIdx].zIndex;
      return prev.map(e => {
        if (e.id === sorted[idx].id) return { ...e, zIndex: zB };
        if (e.id === sorted[swapIdx].id) return { ...e, zIndex: zA };
        return e;
      });
    });
  };

  const handleDrop = (targetId: string) => {
    if (!dragId || dragId === targetId) return;
    onUpdate(prev => {
      const sortedByZ = [...prev].sort((a, b) => a.zIndex - b.zIndex);
      const fromIdx = sortedByZ.findIndex(e => e.id === dragId);
      const toIdx = sortedByZ.findIndex(e => e.id === targetId);
      if (fromIdx === -1 || toIdx === -1) return prev;
      const [moved] = sortedByZ.splice(fromIdx, 1);
      sortedByZ.splice(toIdx, 0, moved);
      // Reassign zIndex
      const zMap = new Map<string, number>();
      sortedByZ.forEach((el, i) => zMap.set(el.id, i));
      return prev.map(e => ({ ...e, zIndex: zMap.get(e.id) ?? e.zIndex }));
    });
    setDragId(null);
    setDragOverId(null);
  };

  return (
    <div ref={ref} className="space-y-1">
      <h4 className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider px-1 mb-1">
        Camadas ({elements.length})
      </h4>
      {sorted.length === 0 && (
        <p className="text-[10px] text-muted-foreground text-center py-2">Nenhum elemento</p>
      )}
      {sorted.map(el => {
        const isSelected = selectedIds.has(el.id);
        const isHidden = hiddenIds.has(el.id);
        const displayName = customNames[el.id] || getElementLabel(el);

        return (
          <div
            key={el.id}
            draggable
            onDragStart={() => setDragId(el.id)}
            onDragOver={e => { e.preventDefault(); setDragOverId(el.id); }}
            onDragLeave={() => setDragOverId(null)}
            onDrop={() => handleDrop(el.id)}
            onDragEnd={() => { setDragId(null); setDragOverId(null); }}
            onClick={() => onSelect(new Set([el.id]))}
            onDoubleClick={() => {
              setRenamingId(el.id);
              setRenameValue(customNames[el.id] || "");
              setTimeout(() => inputRef.current?.focus(), 50);
            }}
            className={`flex items-center gap-1 px-1.5 py-1 rounded text-[11px] cursor-pointer transition-colors group
              ${isSelected ? "bg-primary/15 text-primary" : "hover:bg-muted/60 text-foreground"}
              ${isHidden ? "opacity-40" : ""}
              ${dragOverId === el.id && dragId !== el.id ? "border-t-2 border-primary" : ""}
              ${dragId === el.id ? "opacity-30" : ""}
            `}
          >
            <GripVertical className="h-3 w-3 text-muted-foreground/50 shrink-0 cursor-grab" />
            
            {renamingId === el.id ? (
              <input
                ref={inputRef}
                value={renameValue}
                onChange={e => setRenameValue(e.target.value)}
                onKeyDown={e => {
                  if (e.key === "Enter") {
                    if (renameValue.trim()) setCustomNames(prev => ({ ...prev, [el.id]: renameValue.trim() }));
                    setRenamingId(null);
                  }
                  if (e.key === "Escape") setRenamingId(null);
                }}
                onBlur={() => {
                  if (renameValue.trim()) setCustomNames(prev => ({ ...prev, [el.id]: renameValue.trim() }));
                  setRenamingId(null);
                }}
                onClick={e => e.stopPropagation()}
                className="flex-1 min-w-0 bg-muted/30 border border-border rounded px-1 py-0.5 text-[10px] outline-none"
                placeholder="Nome da camada"
              />
            ) : (
              <span className="flex-1 min-w-0 truncate">{displayName}</span>
            )}

            <div className="flex items-center gap-0.5 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
              <button
                onClick={e => { e.stopPropagation(); onToggleHidden(el.id); }}
                className="p-0.5 rounded hover:bg-muted/60"
                title={isHidden ? "Mostrar" : "Ocultar"}
              >
                {isHidden ? <EyeOff className="h-3 w-3" /> : <Eye className="h-3 w-3" />}
              </button>
              <button
                onClick={e => {
                  e.stopPropagation();
                  onUpdate(prev => prev.map(item => item.id === el.id ? { ...item, locked: !item.locked } : item));
                }}
                className="p-0.5 rounded hover:bg-muted/60"
                title={el.locked ? "Desbloquear" : "Bloquear"}
              >
                {el.locked ? <Lock className="h-3 w-3 text-destructive" /> : <Unlock className="h-3 w-3" />}
              </button>
              <button
                onClick={e => { e.stopPropagation(); moveLayer(el.id, "up"); }}
                className="p-0.5 rounded hover:bg-muted/60"
                title="Subir camada"
              >
                <ChevronUp className="h-3 w-3" />
              </button>
              <button
                onClick={e => { e.stopPropagation(); moveLayer(el.id, "down"); }}
                className="p-0.5 rounded hover:bg-muted/60"
                title="Descer camada"
              >
                <ChevronDown className="h-3 w-3" />
              </button>
              <button
                onClick={e => {
                  e.stopPropagation();
                  onUpdate(prev => prev.filter(item => item.id !== el.id));
                  onSelect(new Set());
                }}
                className="p-0.5 rounded hover:bg-destructive/20"
                title="Excluir"
              >
                <Trash2 className="h-3 w-3 text-destructive" />
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
});
ContractLayersPanel.displayName = "ContractLayersPanel";
