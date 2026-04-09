import { Button } from "@/components/ui/button";
import type { CanvasElement, PageData } from "./types";

interface Props {
  currentPage: PageData | undefined;
  currentPageIdx: number;
  selectedIds: Set<string>;
  selected: CanvasElement | null;
  margins: { top: number; right: number; bottom: number; left: number };
  setMargins: React.Dispatch<React.SetStateAction<{ top: number; right: number; bottom: number; left: number }>>;
  setPages: React.Dispatch<React.SetStateAction<PageData[]>>;
  updateSelected: (updates: Partial<CanvasElement>) => void;
  updateSelectedPosition: (axis: "x" | "y", value: number) => void;
  addTableRow: () => void;
  addTableCol: () => void;
  removeTableRow: () => void;
  removeTableCol: () => void;
}

export function EditorPropertiesPanel({
  currentPage, currentPageIdx, selectedIds, selected, margins, setMargins, setPages,
  updateSelected, updateSelectedPosition,
  addTableRow, addTableCol, removeTableRow, removeTableCol,
}: Props) {
  return (
    <div className="w-56 min-h-0 h-full shrink-0 border-l border-border bg-background p-3 overflow-y-auto text-xs space-y-3">
      {/* Page background opacity */}
      {currentPage?.backgroundImage && (
        <>
          <h3 className="font-semibold text-sm text-foreground">Fundo da Página</h3>
          <div className="space-y-1.5">
            <label className="text-muted-foreground">Opacidade: {Math.round((currentPage.backgroundOpacity) * 100)}%</label>
            <input type="range" min={0} max={100} value={Math.round(currentPage.backgroundOpacity * 100)}
              onChange={e => {
                const val = Number(e.target.value) / 100;
                setPages(prev => prev.map((p, i) => i === currentPageIdx ? { ...p, backgroundOpacity: val } : p));
              }}
              className="w-full" />
          </div>
          <div className="h-px bg-border" />
        </>
      )}

      {selectedIds.size > 1 && !selected ? (
        <p className="text-muted-foreground text-center py-4">{selectedIds.size} elementos selecionados</p>
      ) : selected ? (
        <>
          <div className="flex items-center justify-between">
            <h3 className="font-semibold text-sm text-foreground">
              Propriedades {selectedIds.size > 1 ? `(${selectedIds.size} selecionados)` : ""}
            </h3>
            <button
              onClick={() => updateSelected({ locked: !selected.locked })}
              className={`flex items-center gap-1 text-[10px] px-2 py-0.5 rounded border transition-colors ${selected.locked ? "border-destructive/40 bg-destructive/10 text-destructive" : "border-border text-muted-foreground hover:bg-muted"}`}
              title={selected.locked ? "Desbloquear elemento" : "Bloquear elemento"}
            >
              {selected.locked ? "🔒 Bloqueado" : "🔓 Bloquear"}
            </button>
          </div>
          <div className="space-y-1.5">
            <label className="text-muted-foreground">Posição</label>
            <div className="grid grid-cols-2 gap-1">
              <div><span className="text-muted-foreground">X</span><input type="number" value={Math.round(selected.x)} onChange={e => updateSelectedPosition("x", Number(e.target.value))} className="w-full rounded border border-border bg-muted/30 px-1.5 py-1 text-xs" /></div>
              <div><span className="text-muted-foreground">Y</span><input type="number" value={Math.round(selected.y)} onChange={e => updateSelectedPosition("y", Number(e.target.value))} className="w-full rounded border border-border bg-muted/30 px-1.5 py-1 text-xs" /></div>
            </div>
          </div>
          <div className="space-y-1.5">
            <label className="text-muted-foreground">Tamanho</label>
            <div className="grid grid-cols-2 gap-1">
              <div><span className="text-muted-foreground">L</span><input type="number" value={Math.round(selected.width)} onChange={e => updateSelected({ width: Number(e.target.value) })} className="w-full rounded border border-border bg-muted/30 px-1.5 py-1 text-xs" /></div>
              <div><span className="text-muted-foreground">A</span><input type="number" value={Math.round(selected.height)} onChange={e => updateSelected({ height: Number(e.target.value) })} className="w-full rounded border border-border bg-muted/30 px-1.5 py-1 text-xs" /></div>
            </div>
          </div>
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <label className="text-muted-foreground">Rotação</label>
              <span className="text-[10px] text-muted-foreground">{Math.round(selected.rotation)}°</span>
            </div>
            <div className="flex items-center gap-1">
              <input type="range" min={-180} max={180} value={Math.round(selected.rotation)} onChange={e => updateSelected({ rotation: Number(e.target.value) })} className="flex-1" />
              <Button variant="outline" size="sm" className="h-6 px-1.5 text-[10px]" onClick={() => updateSelected({ rotation: 0 })}>0°</Button>
            </div>
          </div>
          {(selected.type === "rect" || selected.type === "circle") && (
            <>
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <label className="text-muted-foreground">Cor de fundo</label>
                  <button
                    onClick={() => updateSelected({ fill: selected.fill === "transparent" ? "#ffffff" : "transparent" })}
                    className={`text-[10px] px-1.5 py-0.5 rounded border ${selected.fill === "transparent" ? "border-primary text-primary bg-primary/10" : "border-border text-muted-foreground"}`}
                  >
                    {selected.fill === "transparent" ? "Transparente" : "Colorido"}
                  </button>
                </div>
                {selected.fill !== "transparent" && (
                  <input type="color" value={selected.fill} onChange={e => updateSelected({ fill: e.target.value })} className="h-7 w-full cursor-pointer rounded border border-border" />
                )}
              </div>
              <div className="space-y-1.5">
                <label className="text-muted-foreground">Cor da borda</label>
                <input type="color" value={selected.stroke === "transparent" ? "#000000" : selected.stroke} onChange={e => updateSelected({ stroke: e.target.value })} className="h-7 w-full cursor-pointer rounded border border-border" />
                <div className="flex items-center justify-between">
                  <label className="text-muted-foreground">Espessura</label>
                  <span className="text-[10px] text-muted-foreground">{selected.strokeWidth}px</span>
                </div>
                <input type="range" min={0} max={10} value={selected.strokeWidth} onChange={e => updateSelected({ strokeWidth: Number(e.target.value) })} className="w-full" />
              </div>
              {selected.type === "rect" && (
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <label className="text-muted-foreground">Arredondamento</label>
                    <span className="text-[10px] text-muted-foreground">{selected.borderRadius}px</span>
                  </div>
                  <input type="range" min={0} max={50} value={selected.borderRadius} onChange={e => updateSelected({ borderRadius: Number(e.target.value) })} className="w-full" />
                </div>
              )}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <label className="text-muted-foreground">Opacidade</label>
                  <span className="text-[10px] text-muted-foreground">{Math.round((selected.opacity ?? 1) * 100)}%</span>
                </div>
                <input type="range" min={0} max={100} value={Math.round((selected.opacity ?? 1) * 100)} onChange={e => updateSelected({ opacity: Number(e.target.value) / 100 })} className="w-full" />
              </div>
            </>
          )}
          {selected.type === "line" && (
            <div className="space-y-1.5">
              <label className="text-muted-foreground">Cor da linha</label>
              <input type="color" value={selected.stroke} onChange={e => updateSelected({ stroke: e.target.value })} className="h-7 w-full cursor-pointer rounded border border-border" />
              <label className="text-muted-foreground">Espessura</label>
              <input type="number" min={1} max={20} value={selected.strokeWidth} onChange={e => updateSelected({ strokeWidth: Number(e.target.value) })} className="w-full rounded border border-border bg-muted/30 px-1.5 py-1 text-xs" />
            </div>
          )}
          {selected.type === "table" && (
            <div className="space-y-1.5">
              <label className="text-muted-foreground">Cor do cabeçalho</label>
              <input type="color" value={selected.stroke} onChange={e => updateSelected({ stroke: e.target.value })} className="h-7 w-full cursor-pointer rounded border border-border" />
              <label className="text-muted-foreground">Linhas: {selected.tableData?.length || 0}</label>
              <div className="flex gap-1">
                <Button variant="outline" size="sm" className="h-6 text-[10px] flex-1" onClick={addTableRow}>+ Linha</Button>
                <Button variant="outline" size="sm" className="h-6 text-[10px] flex-1" onClick={removeTableRow}>- Linha</Button>
              </div>
              <label className="text-muted-foreground">Colunas: {selected.tableData?.[0]?.length || 0}</label>
              <div className="flex gap-1">
                <Button variant="outline" size="sm" className="h-6 text-[10px] flex-1" onClick={addTableCol}>+ Col</Button>
                <Button variant="outline" size="sm" className="h-6 text-[10px] flex-1" onClick={removeTableCol}>- Col</Button>
              </div>
            </div>
          )}
        </>
      ) : !currentPage?.backgroundImage ? (
        <p className="text-muted-foreground text-center py-4">Selecione um elemento para ver suas propriedades</p>
      ) : null}

      {/* Page margins */}
      <div className="h-px bg-border" />
      <h3 className="font-semibold text-sm text-foreground">Margens da Página</h3>
      <div className="space-y-1.5">
        <div className="grid grid-cols-2 gap-1.5">
          <div>
            <label className="text-muted-foreground text-[10px]">Superior</label>
            <input type="number" min={0} max={200} value={margins.top}
              onChange={e => setMargins(m => ({ ...m, top: Number(e.target.value) }))}
              className="w-full rounded border border-border bg-muted/30 px-1.5 py-1 text-xs" />
          </div>
          <div>
            <label className="text-muted-foreground text-[10px]">Inferior</label>
            <input type="number" min={0} max={200} value={margins.bottom}
              onChange={e => setMargins(m => ({ ...m, bottom: Number(e.target.value) }))}
              className="w-full rounded border border-border bg-muted/30 px-1.5 py-1 text-xs" />
          </div>
          <div>
            <label className="text-muted-foreground text-[10px]">Esquerda</label>
            <input type="number" min={0} max={200} value={margins.left}
              onChange={e => setMargins(m => ({ ...m, left: Number(e.target.value) }))}
              className="w-full rounded border border-border bg-muted/30 px-1.5 py-1 text-xs" />
          </div>
          <div>
            <label className="text-muted-foreground text-[10px]">Direita</label>
            <input type="number" min={0} max={200} value={margins.right}
              onChange={e => setMargins(m => ({ ...m, right: Number(e.target.value) }))}
              className="w-full rounded border border-border bg-muted/30 px-1.5 py-1 text-xs" />
          </div>
        </div>
      </div>
    </div>
  );
}
