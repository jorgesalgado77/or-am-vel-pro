import { useState, useRef, useCallback, useEffect } from "react";
import { ContractEditorToolbar, type ToolType, type ShapeType } from "./ContractEditorToolbar";
import { Button } from "@/components/ui/button";
import { Save, X, ZoomIn, ZoomOut } from "lucide-react";
import { toast } from "sonner";

interface CanvasElement {
  id: string;
  type: "rect" | "circle" | "line" | "text" | "image";
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
  // Style
  fill: string;
  stroke: string;
  strokeWidth: number;
  borderRadius: number;
  // Text
  text: string;
  fontFamily: string;
  fontSize: number;
  fontWeight: string;
  fontStyle: string;
  textDecoration: string;
  textAlign: string;
  color: string;
  // Image
  imageUrl?: string;
  // Layer
  zIndex: number;
}

interface VariableInfo {
  var: string;
  desc: string;
}

interface ContractVisualEditorProps {
  onSave: (html: string) => void;
  onCancel: () => void;
  variables: VariableInfo[];
  initialHtml?: string;
}

const A4_WIDTH = 794;
const A4_HEIGHT = 1123;

let idCounter = 0;
function genId() { return `el_${++idCounter}_${Date.now()}`; }

function createDefaultElement(type: CanvasElement["type"], x: number, y: number): CanvasElement {
  const base: CanvasElement = {
    id: genId(), type, x, y,
    width: 200, height: 100, rotation: 0,
    fill: "transparent", stroke: "#000000", strokeWidth: 1, borderRadius: 0,
    text: "", fontFamily: "Arial", fontSize: 14, fontWeight: "normal",
    fontStyle: "normal", textDecoration: "none", textAlign: "left",
    color: "#000000", zIndex: idCounter,
  };
  switch (type) {
    case "rect": return { ...base, fill: "#ffffff", width: 200, height: 120 };
    case "circle": return { ...base, fill: "#ffffff", width: 120, height: 120 };
    case "line": return { ...base, width: 200, height: 2, strokeWidth: 2, stroke: "#000000" };
    case "text": return { ...base, text: "Texto", width: 200, height: 40, stroke: "transparent", strokeWidth: 0 };
    case "image": return { ...base, width: 200, height: 150, stroke: "#cccccc" };
    default: return base;
  }
}

export function ContractVisualEditor({ onSave, onCancel, variables }: ContractVisualEditorProps) {
  const [elements, setElements] = useState<CanvasElement[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [activeTool, setActiveTool] = useState<ToolType>("select");
  const [activeShapeType, setActiveShapeType] = useState<ShapeType>("rect");
  const [zoom, setZoom] = useState(0.75);
  const [history, setHistory] = useState<CanvasElement[][]>([[]]);
  const [historyIdx, setHistoryIdx] = useState(0);
  const [dragState, setDragState] = useState<{ id: string; startX: number; startY: number; elX: number; elY: number } | null>(null);
  const [resizeState, setResizeState] = useState<{ id: string; startX: number; startY: number; startW: number; startH: number; corner: string } | null>(null);
  const [editingTextId, setEditingTextId] = useState<string | null>(null);
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; showVars: boolean } | null>(null);
  const [varSearch, setVarSearch] = useState("");

  const canvasRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const selected = elements.find(e => e.id === selectedId) || null;

  // Text formatting state derived from selected element
  const fontFamily = selected?.fontFamily || "Arial";
  const fontSize = selected?.fontSize || 14;
  const isBold = selected?.fontWeight === "bold";
  const isItalic = selected?.fontStyle === "italic";
  const isUnderline = selected?.textDecoration?.includes("underline") || false;
  const isStrikethrough = selected?.textDecoration?.includes("line-through") || false;
  const textColor = selected?.color || "#000000";
  const textAlign = selected?.textAlign || "left";

  const pushHistory = useCallback((newElements: CanvasElement[]) => {
    setHistory(prev => {
      const trimmed = prev.slice(0, historyIdx + 1);
      return [...trimmed, newElements];
    });
    setHistoryIdx(prev => prev + 1);
  }, [historyIdx]);

  const updateElements = useCallback((newEls: CanvasElement[]) => {
    setElements(newEls);
    pushHistory(newEls);
  }, [pushHistory]);

  const updateSelected = useCallback((updates: Partial<CanvasElement>) => {
    if (!selectedId) return;
    const newEls = elements.map(el => el.id === selectedId ? { ...el, ...updates } : el);
    setElements(newEls);
    pushHistory(newEls);
  }, [selectedId, elements, pushHistory]);

  const handleUndo = () => {
    if (historyIdx <= 0) return;
    const newIdx = historyIdx - 1;
    setHistoryIdx(newIdx);
    setElements(history[newIdx]);
  };

  const handleRedo = () => {
    if (historyIdx >= history.length - 1) return;
    const newIdx = historyIdx + 1;
    setHistoryIdx(newIdx);
    setElements(history[newIdx]);
  };

  // Canvas click to create elements
  const handleCanvasClick = (e: React.MouseEvent) => {
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;
    const x = (e.clientX - rect.left) / zoom;
    const y = (e.clientY - rect.top) / zoom;

    if (activeTool === "shape") {
      const el = createDefaultElement(activeShapeType === "rect" ? "rect" : activeShapeType === "circle" ? "circle" : "line", x, y);
      updateElements([...elements, el]);
      setSelectedId(el.id);
      setActiveTool("select");
    } else if (activeTool === "text") {
      const el = createDefaultElement("text", x, y);
      updateElements([...elements, el]);
      setSelectedId(el.id);
      setEditingTextId(el.id);
      setActiveTool("select");
    } else if (activeTool === "select") {
      setSelectedId(null);
      setEditingTextId(null);
    }
  };

  // Context menu
  const handleContextMenu = (e: React.MouseEvent) => {
    e.preventDefault();
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;
    setContextMenu({ x: e.clientX - rect.left, y: e.clientY - rect.top, showVars: true });
    setVarSearch("");
  };

  const insertVariable = (varText: string) => {
    if (!canvasRef.current || !contextMenu) return;
    const x = contextMenu.x / zoom;
    const y = contextMenu.y / zoom;

    if (editingTextId && selectedId) {
      // Insert into existing text element
      updateSelected({ text: (selected?.text || "") + varText });
    } else {
      // Create new text element with the variable
      const el = createDefaultElement("text", x, y);
      el.text = varText;
      el.width = Math.max(200, varText.length * 10);
      updateElements([...elements, el]);
      setSelectedId(el.id);
    }
    setContextMenu(null);
  };

  const deleteSelected = () => {
    if (!selectedId) return;
    updateElements(elements.filter(e => e.id !== selectedId));
    setSelectedId(null);
    setContextMenu(null);
  };

  const duplicateSelected = () => {
    if (!selected) return;
    const dup = { ...selected, id: genId(), x: selected.x + 20, y: selected.y + 20, zIndex: elements.length + 1 };
    updateElements([...elements, dup]);
    setSelectedId(dup.id);
    setContextMenu(null);
  };

  // Image upload
  const handleImageUpload = () => {
    fileInputRef.current?.click();
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const url = ev.target?.result as string;
      const el = createDefaultElement("image", 100, 100);
      el.imageUrl = url;
      updateElements([...elements, el]);
      setSelectedId(el.id);
      setActiveTool("select");
    };
    reader.readAsDataURL(file);
    e.target.value = "";
  };

  // Mouse handlers for drag & resize
  const handleElementMouseDown = (e: React.MouseEvent, el: CanvasElement) => {
    if (activeTool !== "select") return;
    e.stopPropagation();
    setSelectedId(el.id);
    setEditingTextId(null);

    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;
    setDragState({
      id: el.id,
      startX: e.clientX,
      startY: e.clientY,
      elX: el.x,
      elY: el.y,
    });
  };

  const handleResizeMouseDown = (e: React.MouseEvent, el: CanvasElement, corner: string) => {
    e.stopPropagation();
    e.preventDefault();
    setResizeState({
      id: el.id,
      startX: e.clientX,
      startY: e.clientY,
      startW: el.width,
      startH: el.height,
      corner,
    });
  };

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (dragState) {
        const dx = (e.clientX - dragState.startX) / zoom;
        const dy = (e.clientY - dragState.startY) / zoom;
        setElements(prev => prev.map(el =>
          el.id === dragState.id ? { ...el, x: dragState.elX + dx, y: dragState.elY + dy } : el
        ));
      }
      if (resizeState) {
        const dx = (e.clientX - resizeState.startX) / zoom;
        const dy = (e.clientY - resizeState.startY) / zoom;
        setElements(prev => prev.map(el => {
          if (el.id !== resizeState.id) return el;
          return { ...el, width: Math.max(20, resizeState.startW + dx), height: Math.max(10, resizeState.startH + dy) };
        }));
      }
    };
    const handleMouseUp = () => {
      if (dragState) {
        pushHistory(elements);
        setDragState(null);
      }
      if (resizeState) {
        pushHistory(elements);
        setResizeState(null);
      }
    };
    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);
    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
    };
  }, [dragState, resizeState, zoom, elements, pushHistory]);

  // Close context menu on click outside
  useEffect(() => {
    if (!contextMenu) return;
    const handler = () => setContextMenu(null);
    window.addEventListener("click", handler);
    return () => window.removeEventListener("click", handler);
  }, [contextMenu]);

  // Keyboard shortcuts
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Delete" || e.key === "Backspace") {
        if (editingTextId) return;
        if (selectedId) deleteSelected();
      }
      if (e.ctrlKey && e.key === "z") { e.preventDefault(); handleUndo(); }
      if (e.ctrlKey && e.key === "y") { e.preventDefault(); handleRedo(); }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  });

  // Convert elements to HTML for saving
  const convertToHtml = (): string => {
    const sortedEls = [...elements].sort((a, b) => a.zIndex - b.zIndex);
    let html = `<div class="contract-page" style="position:relative;width:${A4_WIDTH}px;min-height:${A4_HEIGHT}px;background:#fff;margin:0 auto;padding:0;box-sizing:border-box;">`;

    for (const el of sortedEls) {
      const baseStyle = `position:absolute;left:${el.x}px;top:${el.y}px;width:${el.width}px;height:${el.height}px;z-index:${el.zIndex};`;

      switch (el.type) {
        case "rect":
          html += `<div style="${baseStyle}background:${el.fill};border:${el.strokeWidth}px solid ${el.stroke};border-radius:${el.borderRadius}px;box-sizing:border-box;">`;
          if (el.text) {
            html += `<div style="width:100%;height:100%;display:flex;align-items:center;justify-content:${el.textAlign === 'center' ? 'center' : el.textAlign === 'right' ? 'flex-end' : 'flex-start'};padding:8px;box-sizing:border-box;font-family:${el.fontFamily};font-size:${el.fontSize}px;font-weight:${el.fontWeight};font-style:${el.fontStyle};text-decoration:${el.textDecoration};color:${el.color};text-align:${el.textAlign};white-space:pre-wrap;">${el.text}</div>`;
          }
          html += `</div>`;
          break;
        case "circle":
          html += `<div style="${baseStyle}background:${el.fill};border:${el.strokeWidth}px solid ${el.stroke};border-radius:50%;box-sizing:border-box;">`;
          if (el.text) {
            html += `<div style="width:100%;height:100%;display:flex;align-items:center;justify-content:center;padding:8px;box-sizing:border-box;font-family:${el.fontFamily};font-size:${el.fontSize}px;font-weight:${el.fontWeight};font-style:${el.fontStyle};color:${el.color};text-align:center;white-space:pre-wrap;">${el.text}</div>`;
          }
          html += `</div>`;
          break;
        case "line":
          html += `<div style="${baseStyle}border-top:${el.strokeWidth}px solid ${el.stroke};"></div>`;
          break;
        case "text":
          html += `<div style="${baseStyle}font-family:${el.fontFamily};font-size:${el.fontSize}px;font-weight:${el.fontWeight};font-style:${el.fontStyle};text-decoration:${el.textDecoration};color:${el.color};text-align:${el.textAlign};white-space:pre-wrap;overflow:hidden;word-wrap:break-word;">${el.text}</div>`;
          break;
        case "image":
          html += `<div style="${baseStyle}overflow:hidden;">`;
          if (el.imageUrl) {
            html += `<img src="${el.imageUrl}" style="width:100%;height:100%;object-fit:contain;" />`;
          }
          html += `</div>`;
          break;
      }
    }

    html += `</div>`;
    return html;
  };

  const handleSave = () => {
    const html = convertToHtml();
    onSave(html);
    toast.success("Contrato salvo com sucesso!");
  };

  const filteredVars = variables
    .filter(v => !varSearch || v.var.toLowerCase().includes(varSearch.toLowerCase()) || v.desc.toLowerCase().includes(varSearch.toLowerCase()))
    .sort((a, b) => a.var.localeCompare(b.var));

  const renderElement = (el: CanvasElement) => {
    const isSelected = el.id === selectedId;
    const isEditing = el.id === editingTextId;

    const style: React.CSSProperties = {
      position: "absolute",
      left: el.x,
      top: el.y,
      width: el.width,
      height: el.height,
      zIndex: el.zIndex,
      cursor: activeTool === "select" ? "move" : "default",
      outline: isSelected ? "2px solid hsl(210 80% 55%)" : "none",
      outlineOffset: "1px",
    };

    const handleDoubleClick = (e: React.MouseEvent) => {
      e.stopPropagation();
      if (el.type === "text" || el.type === "rect" || el.type === "circle") {
        setEditingTextId(el.id);
      }
    };

    const textContent = isEditing ? (
      <textarea
        autoFocus
        value={el.text}
        onChange={(e) => setElements(prev => prev.map(p => p.id === el.id ? { ...p, text: e.target.value } : p))}
        onBlur={() => { setEditingTextId(null); pushHistory(elements); }}
        style={{
          width: "100%", height: "100%", resize: "none", border: "none", outline: "none",
          background: "transparent", fontFamily: el.fontFamily, fontSize: el.fontSize,
          fontWeight: el.fontWeight as any, fontStyle: el.fontStyle,
          textDecoration: el.textDecoration, color: el.color, textAlign: el.textAlign as any,
          padding: el.type === "text" ? 0 : 8, boxSizing: "border-box",
        }}
        onClick={e => e.stopPropagation()}
      />
    ) : (
      <div style={{
        width: "100%", height: "100%", overflow: "hidden",
        fontFamily: el.fontFamily, fontSize: el.fontSize,
        fontWeight: el.fontWeight, fontStyle: el.fontStyle,
        textDecoration: el.textDecoration, color: el.color,
        textAlign: el.textAlign as any, whiteSpace: "pre-wrap", wordWrap: "break-word",
        display: (el.type !== "text") ? "flex" : undefined,
        alignItems: (el.type !== "text") ? "center" : undefined,
        justifyContent: (el.type !== "text") ? (el.textAlign === "center" ? "center" : el.textAlign === "right" ? "flex-end" : "flex-start") : undefined,
        padding: el.type === "text" ? 0 : 8,
        boxSizing: "border-box",
      }}>
        {el.text || (el.type === "text" ? <span className="text-muted-foreground/40 italic text-xs">Duplo clique para editar</span> : null)}
      </div>
    );

    let content: React.ReactNode;
    switch (el.type) {
      case "rect":
        content = (
          <div style={{ ...style, background: el.fill, border: `${el.strokeWidth}px solid ${el.stroke}`, borderRadius: el.borderRadius, boxSizing: "border-box" }}
            onMouseDown={e => handleElementMouseDown(e, el)}
            onDoubleClick={handleDoubleClick}
          >
            {textContent}
            {isSelected && renderResizeHandles(el)}
          </div>
        );
        break;
      case "circle":
        content = (
          <div style={{ ...style, background: el.fill, border: `${el.strokeWidth}px solid ${el.stroke}`, borderRadius: "50%", boxSizing: "border-box" }}
            onMouseDown={e => handleElementMouseDown(e, el)}
            onDoubleClick={handleDoubleClick}
          >
            {textContent}
            {isSelected && renderResizeHandles(el)}
          </div>
        );
        break;
      case "line":
        content = (
          <div style={{ ...style, borderTop: `${el.strokeWidth}px solid ${el.stroke}` }}
            onMouseDown={e => handleElementMouseDown(e, el)}
          >
            {isSelected && renderResizeHandles(el)}
          </div>
        );
        break;
      case "text":
        content = (
          <div style={{ ...style }}
            onMouseDown={e => handleElementMouseDown(e, el)}
            onDoubleClick={handleDoubleClick}
          >
            {textContent}
            {isSelected && renderResizeHandles(el)}
          </div>
        );
        break;
      case "image":
        content = (
          <div style={{ ...style, overflow: "hidden", border: isSelected ? undefined : `1px dashed #ccc` }}
            onMouseDown={e => handleElementMouseDown(e, el)}
          >
            {el.imageUrl ? (
              <img src={el.imageUrl} alt="" style={{ width: "100%", height: "100%", objectFit: "contain" }} draggable={false} />
            ) : (
              <div className="flex h-full w-full items-center justify-center text-xs text-muted-foreground">Imagem</div>
            )}
            {isSelected && renderResizeHandles(el)}
          </div>
        );
        break;
    }
    return <div key={el.id}>{content}</div>;
  };

  const renderResizeHandles = (el: CanvasElement) => {
    const handleStyle = (cursor: string): React.CSSProperties => ({
      position: "absolute", width: 8, height: 8, background: "hsl(210 80% 55%)",
      borderRadius: 2, cursor, zIndex: 9999,
    });
    return (
      <>
        <div style={{ ...handleStyle("nwse-resize"), bottom: -4, right: -4 }}
          onMouseDown={e => handleResizeMouseDown(e, el, "se")} />
        <div style={{ ...handleStyle("nesw-resize"), bottom: -4, left: -4 }}
          onMouseDown={e => handleResizeMouseDown(e, el, "sw")} />
        <div style={{ ...handleStyle("nwse-resize"), top: -4, left: -4 }}
          onMouseDown={e => handleResizeMouseDown(e, el, "nw")} />
        <div style={{ ...handleStyle("nesw-resize"), top: -4, right: -4 }}
          onMouseDown={e => handleResizeMouseDown(e, el, "ne")} />
      </>
    );
  };

  // Properties panel for selected element
  const renderPropertiesPanel = () => {
    if (!selected) return null;
    return (
      <div className="w-56 border-l border-border bg-background p-3 overflow-y-auto text-xs space-y-3">
        <h3 className="font-semibold text-sm text-foreground">Propriedades</h3>

        <div className="space-y-1.5">
          <label className="text-muted-foreground">Posição</label>
          <div className="grid grid-cols-2 gap-1">
            <div>
              <span className="text-muted-foreground">X</span>
              <input type="number" value={Math.round(selected.x)} onChange={e => updateSelected({ x: Number(e.target.value) })}
                className="w-full rounded border border-border bg-muted/30 px-1.5 py-1 text-xs" />
            </div>
            <div>
              <span className="text-muted-foreground">Y</span>
              <input type="number" value={Math.round(selected.y)} onChange={e => updateSelected({ y: Number(e.target.value) })}
                className="w-full rounded border border-border bg-muted/30 px-1.5 py-1 text-xs" />
            </div>
          </div>
        </div>

        <div className="space-y-1.5">
          <label className="text-muted-foreground">Tamanho</label>
          <div className="grid grid-cols-2 gap-1">
            <div>
              <span className="text-muted-foreground">L</span>
              <input type="number" value={Math.round(selected.width)} onChange={e => updateSelected({ width: Number(e.target.value) })}
                className="w-full rounded border border-border bg-muted/30 px-1.5 py-1 text-xs" />
            </div>
            <div>
              <span className="text-muted-foreground">A</span>
              <input type="number" value={Math.round(selected.height)} onChange={e => updateSelected({ height: Number(e.target.value) })}
                className="w-full rounded border border-border bg-muted/30 px-1.5 py-1 text-xs" />
            </div>
          </div>
        </div>

        {(selected.type === "rect" || selected.type === "circle") && (
          <>
            <div className="space-y-1.5">
              <label className="text-muted-foreground">Preenchimento</label>
              <input type="color" value={selected.fill} onChange={e => updateSelected({ fill: e.target.value })}
                className="h-7 w-full cursor-pointer rounded border border-border" />
            </div>
            <div className="space-y-1.5">
              <label className="text-muted-foreground">Borda</label>
              <input type="color" value={selected.stroke} onChange={e => updateSelected({ stroke: e.target.value })}
                className="h-7 w-full cursor-pointer rounded border border-border" />
              <input type="number" min={0} max={10} value={selected.strokeWidth} onChange={e => updateSelected({ strokeWidth: Number(e.target.value) })}
                className="w-full rounded border border-border bg-muted/30 px-1.5 py-1 text-xs" />
            </div>
            {selected.type === "rect" && (
              <div className="space-y-1.5">
                <label className="text-muted-foreground">Arredondamento</label>
                <input type="range" min={0} max={50} value={selected.borderRadius} onChange={e => updateSelected({ borderRadius: Number(e.target.value) })}
                  className="w-full" />
              </div>
            )}
          </>
        )}

        {selected.type === "line" && (
          <div className="space-y-1.5">
            <label className="text-muted-foreground">Cor da linha</label>
            <input type="color" value={selected.stroke} onChange={e => updateSelected({ stroke: e.target.value })}
              className="h-7 w-full cursor-pointer rounded border border-border" />
            <label className="text-muted-foreground">Espessura</label>
            <input type="number" min={1} max={20} value={selected.strokeWidth} onChange={e => updateSelected({ strokeWidth: Number(e.target.value) })}
              className="w-full rounded border border-border bg-muted/30 px-1.5 py-1 text-xs" />
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="flex flex-col h-full">
      {/* Hidden file input */}
      <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleFileChange} />

      {/* Toolbar */}
      <ContractEditorToolbar
        activeTool={activeTool}
        onToolChange={setActiveTool}
        activeShapeType={activeShapeType}
        onShapeTypeChange={setActiveShapeType}
        fontFamily={fontFamily}
        onFontFamilyChange={v => updateSelected({ fontFamily: v })}
        fontSize={fontSize}
        onFontSizeChange={v => updateSelected({ fontSize: v })}
        isBold={isBold}
        onBoldToggle={() => updateSelected({ fontWeight: isBold ? "normal" : "bold" })}
        isItalic={isItalic}
        onItalicToggle={() => updateSelected({ fontStyle: isItalic ? "normal" : "italic" })}
        isUnderline={isUnderline}
        onUnderlineToggle={() => {
          const current = selected?.textDecoration || "none";
          const has = current.includes("underline");
          updateSelected({ textDecoration: has ? current.replace("underline", "").trim() || "none" : (current === "none" ? "underline" : current + " underline") });
        }}
        isStrikethrough={isStrikethrough}
        onStrikethroughToggle={() => {
          const current = selected?.textDecoration || "none";
          const has = current.includes("line-through");
          updateSelected({ textDecoration: has ? current.replace("line-through", "").trim() || "none" : (current === "none" ? "line-through" : current + " line-through") });
        }}
        textColor={textColor}
        onTextColorChange={v => updateSelected({ color: v })}
        textAlign={textAlign}
        onTextAlignChange={v => updateSelected({ textAlign: v })}
        onUndo={handleUndo}
        onRedo={handleRedo}
        canUndo={historyIdx > 0}
        canRedo={historyIdx < history.length - 1}
        onImageUpload={handleImageUpload}
      />

      {/* Action bar */}
      <div className="flex items-center justify-between border-x border-border bg-muted/20 px-3 py-1.5">
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setZoom(z => Math.max(0.25, z - 0.1))} title="Zoom -">
            <ZoomOut className="h-3.5 w-3.5" />
          </Button>
          <span className="text-xs text-muted-foreground w-12 text-center">{Math.round(zoom * 100)}%</span>
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setZoom(z => Math.min(2, z + 0.1))} title="Zoom +">
            <ZoomIn className="h-3.5 w-3.5" />
          </Button>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" className="h-7 gap-1 text-xs" onClick={onCancel}>
            <X className="h-3 w-3" /> Cancelar
          </Button>
          <Button size="sm" className="h-7 gap-1 text-xs" onClick={handleSave}>
            <Save className="h-3 w-3" /> Salvar Contrato
          </Button>
        </div>
      </div>

      {/* Canvas area */}
      <div className="flex flex-1 overflow-hidden border border-border rounded-b-lg">
        <div className="flex-1 overflow-auto bg-muted/40 p-6" style={{ background: "repeating-conic-gradient(hsl(var(--muted)) 0% 25%, hsl(var(--background)) 0% 50%) 50% / 20px 20px" }}>
          <div
            ref={canvasRef}
            style={{
              width: A4_WIDTH * zoom,
              height: A4_HEIGHT * zoom,
              margin: "0 auto",
              position: "relative",
              background: "#fff",
              boxShadow: "0 2px 16px rgba(0,0,0,0.1)",
              overflow: "hidden",
            }}
            onClick={handleCanvasClick}
            onContextMenu={handleContextMenu}
          >
            {/* Scaled inner */}
            <div style={{ transform: `scale(${zoom})`, transformOrigin: "0 0", width: A4_WIDTH, height: A4_HEIGHT, position: "relative" }}>
              {elements.map(renderElement)}
            </div>

            {/* Context menu */}
            {contextMenu && (
              <div
                style={{
                  position: "absolute",
                  left: contextMenu.x,
                  top: contextMenu.y,
                  zIndex: 99999,
                }}
                onClick={e => e.stopPropagation()}
                className="min-w-[200px] rounded-md border border-border bg-popover shadow-lg"
              >
                {selectedId && (
                  <>
                    <button className="w-full px-3 py-1.5 text-left text-sm hover:bg-accent text-accent-foreground" onClick={duplicateSelected}>
                      Duplicar
                    </button>
                    <button className="w-full px-3 py-1.5 text-left text-sm hover:bg-destructive/10 text-destructive" onClick={deleteSelected}>
                      Excluir
                    </button>
                    <div className="h-px bg-border my-1" />
                  </>
                )}
                <div className="px-3 py-1.5 text-xs font-semibold text-muted-foreground">Inserir Variável</div>
                <div className="px-2 pb-1">
                  <input
                    type="text"
                    placeholder="Buscar..."
                    value={varSearch}
                    onChange={e => setVarSearch(e.target.value)}
                    className="w-full rounded border border-border bg-muted/30 px-2 py-1 text-xs outline-none"
                    autoFocus
                    onClick={e => e.stopPropagation()}
                  />
                </div>
                <div className="max-h-[200px] overflow-y-auto">
                  {filteredVars.map(v => (
                    <button
                      key={v.var}
                      className="w-full px-3 py-1 text-left hover:bg-accent"
                      onClick={() => insertVariable(v.var)}
                    >
                      <div className="text-xs font-mono text-primary">{v.var}</div>
                      <div className="text-[10px] text-muted-foreground">{v.desc}</div>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Properties panel */}
        {renderPropertiesPanel()}
      </div>
    </div>
  );
}
