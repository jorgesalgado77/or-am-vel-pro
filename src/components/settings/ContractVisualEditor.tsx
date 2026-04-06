import { useState, useRef, useCallback, useEffect } from "react";
import { supabase } from "@/lib/supabaseClient";
import { useTenant } from "@/contexts/TenantContext";
import { ContractEditorToolbar, type ToolType, type ShapeType } from "./ContractEditorToolbar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Save, X, ZoomIn, ZoomOut, Plus, Trash2, ChevronLeft, ChevronRight, FileUp, Copy, Download, FileText, LayoutTemplate, BookmarkPlus, Pencil, Trash, Upload, Image as ImageIcon } from "lucide-react";
import { getContractTemplates, type ContractTemplate } from "./contractTemplates";
import { useCustomTemplates, type CustomTemplate } from "@/hooks/useCustomTemplates";
import { toast } from "sonner";
import * as pdfjsLib from "pdfjs-dist";
import { jsPDF } from "jspdf";
import { Document, Packer, Paragraph, TextRun, ImageRun, PageBreak, AlignmentType, BorderStyle, Table, TableRow, TableCell, WidthType, ShadingType } from "docx";
import { saveAs } from "file-saver";

pdfjsLib.GlobalWorkerOptions.workerSrc = `//cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.mjs`;

interface CanvasElement {
  id: string;
  type: "rect" | "circle" | "line" | "text" | "image" | "table";
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
  fill: string;
  stroke: string;
  strokeWidth: number;
  borderRadius: number;
  text: string;
  fontFamily: string;
  fontSize: number;
  fontWeight: string;
  fontStyle: string;
  textDecoration: string;
  textAlign: string;
  color: string;
  imageUrl?: string;
  zIndex: number;
  tableData?: string[][];
  tableCols?: number;
  tableRows?: number;
}

interface PageData {
  id: string;
  elements: CanvasElement[];
  backgroundImage?: string;
  backgroundOpacity: number;
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
function pageId() { return `page_${++idCounter}_${Date.now()}`; }

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
    case "table": return {
      ...base, width: 500, height: 160, fill: "#ffffff", stroke: "#333333",
      tableData: [["Coluna 1", "Coluna 2", "Coluna 3"], ["", "", ""], ["", "", ""]],
      tableRows: 3, tableCols: 3,
    };
    default: return base;
  }
}

function hexToRgb(hex: string) {
  const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  return m ? { r: parseInt(m[1], 16), g: parseInt(m[2], 16), b: parseInt(m[3], 16) } : null;
}

function drawText(doc: jsPDF, el: CanvasElement) {
  if (!el.text) return;
  const c = hexToRgb(el.color || "#000000");
  if (c) doc.setTextColor(c.r, c.g, c.b);
  const fontStyle = el.fontWeight === "bold" && el.fontStyle === "italic" ? "bolditalic"
    : el.fontWeight === "bold" ? "bold"
    : el.fontStyle === "italic" ? "italic" : "normal";
  doc.setFont("helvetica", fontStyle);
  doc.setFontSize(el.fontSize * 0.75); // px to pt
  const padding = el.type === "text" ? 0 : 8;
  const maxW = el.width - padding * 2;
  const lines = doc.splitTextToSize(el.text, maxW);
  const lineH = el.fontSize * 0.85;
  const totalH = lines.length * lineH;
  let startY: number;
  if (el.type === "text") {
    startY = el.y + el.fontSize * 0.75;
  } else {
    startY = el.y + (el.height - totalH) / 2 + el.fontSize * 0.75;
  }
  const align = el.textAlign || "left";
  for (let i = 0; i < lines.length; i++) {
    let lx = el.x + padding;
    if (align === "center") lx = el.x + el.width / 2;
    else if (align === "right") lx = el.x + el.width - padding;
    doc.text(lines[i], lx, startY + i * lineH, { align: align as any });
  }
}

export function ContractVisualEditor({ onSave, onCancel, variables }: ContractVisualEditorProps) {
  const { tenantId } = useTenant();
  const [showTemplates, setShowTemplates] = useState(true);
  const [pages, setPages] = useState<PageData[]>([{ id: pageId(), elements: [], backgroundOpacity: 0.5 }]);
  const [currentPageIdx, setCurrentPageIdx] = useState(0);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [activeTool, setActiveTool] = useState<ToolType>("select");
  const [activeShapeType, setActiveShapeType] = useState<ShapeType>("rect");
  const [zoom, setZoom] = useState(0.75);
  const [dragState, setDragState] = useState<{ id: string; startX: number; startY: number; elX: number; elY: number } | null>(null);
  const [resizeState, setResizeState] = useState<{ id: string; startX: number; startY: number; startW: number; startH: number; corner: string } | null>(null);
  const [editingTextId, setEditingTextId] = useState<string | null>(null);
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number } | null>(null);
  const [varSearch, setVarSearch] = useState("");
  const [importingPdf, setImportingPdf] = useState(false);
  const [dragPageIdx, setDragPageIdx] = useState<number | null>(null);
  const [dragOverPageIdx, setDragOverPageIdx] = useState<number | null>(null);

  // Custom templates state
  const { templates: customTemplates, loading: loadingCustom, saveTemplate, updateTemplate, deleteTemplate } = useCustomTemplates();
  const [showSaveDialog, setShowSaveDialog] = useState(false);
  const [saveTemplateName, setSaveTemplateName] = useState("");
  const [saveTemplateDesc, setSaveTemplateDesc] = useState("");
  const [editingCustomId, setEditingCustomId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [overwriteTemplateId, setOverwriteTemplateId] = useState<string | null>(null);

  const canvasRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const pdfInputRef = useRef<HTMLInputElement>(null);

  const currentPage = pages[currentPageIdx];
  const elements = currentPage?.elements || [];
  const selected = elements.find(e => e.id === selectedId) || null;

  // Derived text formatting
  const fontFamily = selected?.fontFamily || "Arial";
  const fontSize = selected?.fontSize || 14;
  const isBold = selected?.fontWeight === "bold";
  const isItalic = selected?.fontStyle === "italic";
  const isUnderline = selected?.textDecoration?.includes("underline") || false;
  const isStrikethrough = selected?.textDecoration?.includes("line-through") || false;
  const textColor = selected?.color || "#000000";
  const textAlign = selected?.textAlign || "left";

  // --- Page management ---
  const setCurrentElements = useCallback((updater: (prev: CanvasElement[]) => CanvasElement[]) => {
    setPages(prev => prev.map((p, i) => i === currentPageIdx ? { ...p, elements: updater(p.elements) } : p));
  }, [currentPageIdx]);

  const addPage = () => {
    const newPage: PageData = { id: pageId(), elements: [], backgroundOpacity: 0.5 };
    setPages(prev => [...prev.slice(0, currentPageIdx + 1), newPage, ...prev.slice(currentPageIdx + 1)]);
    setCurrentPageIdx(currentPageIdx + 1);
    setSelectedId(null);
  };

  const duplicatePage = () => {
    const dup: PageData = {
      id: pageId(),
      elements: currentPage.elements.map(el => ({ ...el, id: genId() })),
      backgroundImage: currentPage.backgroundImage,
      backgroundOpacity: currentPage.backgroundOpacity,
    };
    setPages(prev => [...prev.slice(0, currentPageIdx + 1), dup, ...prev.slice(currentPageIdx + 1)]);
    setCurrentPageIdx(currentPageIdx + 1);
    setSelectedId(null);
  };

  const deletePage = () => {
    if (pages.length <= 1) { toast.error("O contrato deve ter pelo menos uma página"); return; }
    setPages(prev => prev.filter((_, i) => i !== currentPageIdx));
    setCurrentPageIdx(Math.max(0, currentPageIdx - 1));
    setSelectedId(null);
  };

  const goToPrevPage = () => { if (currentPageIdx > 0) { setCurrentPageIdx(currentPageIdx - 1); setSelectedId(null); } };
  const goToNextPage = () => { if (currentPageIdx < pages.length - 1) { setCurrentPageIdx(currentPageIdx + 1); setSelectedId(null); } };

  // --- Element operations ---
  const updateSelected = useCallback((updates: Partial<CanvasElement>) => {
    if (!selectedId) return;
    setCurrentElements(prev => prev.map(el => el.id === selectedId ? { ...el, ...updates } : el));
  }, [selectedId, setCurrentElements]);

  const handleCanvasClick = (e: React.MouseEvent) => {
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;
    const x = (e.clientX - rect.left) / zoom;
    const y = (e.clientY - rect.top) / zoom;

    if (activeTool === "shape") {
      const el = createDefaultElement(activeShapeType, x, y);
      setCurrentElements(prev => [...prev, el]);
      setSelectedId(el.id);
      setActiveTool("select");
    } else if (activeTool === "text") {
      const el = createDefaultElement("text", x, y);
      setCurrentElements(prev => [...prev, el]);
      setSelectedId(el.id);
      setEditingTextId(el.id);
      setActiveTool("select");
    } else if (activeTool === "select") {
      setSelectedId(null);
      setEditingTextId(null);
    }
  };

  const handleTableInsert = () => {
    const el = createDefaultElement("table", 100, 200);
    setCurrentElements(prev => [...prev, el]);
    setSelectedId(el.id);
    setActiveTool("select");
  };

  const updateTableCell = (elId: string, row: number, col: number, value: string) => {
    setCurrentElements(prev => prev.map(el => {
      if (el.id !== elId || !el.tableData) return el;
      const newData = el.tableData.map((r, ri) => ri === row ? r.map((c, ci) => ci === col ? value : c) : [...r]);
      return { ...el, tableData: newData };
    }));
  };

  const addTableRow = () => {
    if (!selected?.tableData) return;
    const cols = selected.tableCols || selected.tableData[0]?.length || 2;
    const newRow = Array(cols).fill("");
    updateSelected({ tableData: [...selected.tableData, newRow], tableRows: (selected.tableRows || selected.tableData.length) + 1, height: selected.height + 30 });
  };

  const addTableCol = () => {
    if (!selected?.tableData) return;
    const newData = selected.tableData.map(row => [...row, ""]);
    updateSelected({ tableData: newData, tableCols: (selected.tableCols || selected.tableData[0]?.length || 2) + 1, width: selected.width + 100 });
  };

  const removeTableRow = () => {
    if (!selected?.tableData || selected.tableData.length <= 1) return;
    updateSelected({ tableData: selected.tableData.slice(0, -1), tableRows: (selected.tableRows || selected.tableData.length) - 1, height: Math.max(60, selected.height - 30) });
  };

  const removeTableCol = () => {
    if (!selected?.tableData || (selected.tableData[0]?.length || 0) <= 1) return;
    const newData = selected.tableData.map(row => row.slice(0, -1));
    updateSelected({ tableData: newData, tableCols: (selected.tableCols || 2) - 1, width: Math.max(100, selected.width - 100) });
  };

  const handleContextMenu = (e: React.MouseEvent) => {
    e.preventDefault();
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;
    setContextMenu({ x: e.clientX - rect.left, y: e.clientY - rect.top });
    setVarSearch("");
  };

  const insertVariable = (varText: string) => {
    if (!canvasRef.current || !contextMenu) return;
    const x = contextMenu.x / zoom;
    const y = contextMenu.y / zoom;

    if (editingTextId && selectedId) {
      updateSelected({ text: (selected?.text || "") + varText });
    } else {
      const el = createDefaultElement("text", x, y);
      el.text = varText;
      el.width = Math.max(200, varText.length * 10);
      setCurrentElements(prev => [...prev, el]);
      setSelectedId(el.id);
    }
    setContextMenu(null);
  };

  const deleteSelected = () => {
    if (!selectedId) return;
    setCurrentElements(prev => prev.filter(e => e.id !== selectedId));
    setSelectedId(null);
    setContextMenu(null);
  };

  const duplicateSelected = () => {
    if (!selected) return;
    const dup = { ...selected, id: genId(), x: selected.x + 20, y: selected.y + 20, zIndex: elements.length + 1 };
    setCurrentElements(prev => [...prev, dup]);
    setSelectedId(dup.id);
    setContextMenu(null);
  };

  // --- Image upload ---
  const handleImageUpload = () => { fileInputRef.current?.click(); };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const url = ev.target?.result as string;
      const el = createDefaultElement("image", 100, 100);
      el.imageUrl = url;
      setCurrentElements(prev => [...prev, el]);
      setSelectedId(el.id);
      setActiveTool("select");
    };
    reader.readAsDataURL(file);
    e.target.value = "";
  };

  // --- PDF import as background ---
  const handlePdfImport = () => { pdfInputRef.current?.click(); };

  const handlePdfFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = "";

    setImportingPdf(true);
    try {
      const arrayBuffer = await file.arrayBuffer();
      const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
      const numPages = pdf.numPages;
      const newPages: PageData[] = [];

      for (let i = 1; i <= numPages; i++) {
        const page = await pdf.getPage(i);
        const viewport = page.getViewport({ scale: 2 });
        const canvas = document.createElement("canvas");
        canvas.width = viewport.width;
        canvas.height = viewport.height;
        const ctx = canvas.getContext("2d")!;
        await page.render({ canvasContext: ctx, viewport, canvas } as any).promise;
        const bgImage = canvas.toDataURL("image/png");
        newPages.push({ id: pageId(), elements: [], backgroundImage: bgImage, backgroundOpacity: 0.5 });
      }

      setPages(prev => {
        // If current page is empty and has no background, replace it
        if (prev.length === 1 && prev[0].elements.length === 0 && !prev[0].backgroundImage) {
          return newPages;
        }
        // Otherwise insert after current page
        return [...prev.slice(0, currentPageIdx + 1), ...newPages, ...prev.slice(currentPageIdx + 1)];
      });

      if (pages.length === 1 && pages[0].elements.length === 0 && !pages[0].backgroundImage) {
        setCurrentPageIdx(0);
      } else {
        setCurrentPageIdx(currentPageIdx + 1);
      }

      toast.success(`PDF importado: ${numPages} página${numPages > 1 ? "s" : ""} adicionada${numPages > 1 ? "s" : ""}`);
    } catch (err) {
      console.error(err);
      toast.error("Erro ao importar PDF");
    } finally {
      setImportingPdf(false);
    }
  };

  // --- Drag & Resize ---
  const handleElementMouseDown = (e: React.MouseEvent, el: CanvasElement) => {
    if (activeTool !== "select") return;
    e.stopPropagation();
    setSelectedId(el.id);
    setEditingTextId(null);
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;
    setDragState({ id: el.id, startX: e.clientX, startY: e.clientY, elX: el.x, elY: el.y });
  };

  const handleResizeMouseDown = (e: React.MouseEvent, el: CanvasElement, corner: string) => {
    e.stopPropagation();
    e.preventDefault();
    setResizeState({ id: el.id, startX: e.clientX, startY: e.clientY, startW: el.width, startH: el.height, corner });
  };

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (dragState) {
        const dx = (e.clientX - dragState.startX) / zoom;
        const dy = (e.clientY - dragState.startY) / zoom;
        setCurrentElements(prev => prev.map(el =>
          el.id === dragState.id ? { ...el, x: dragState.elX + dx, y: dragState.elY + dy } : el
        ));
      }
      if (resizeState) {
        const dx = (e.clientX - resizeState.startX) / zoom;
        const dy = (e.clientY - resizeState.startY) / zoom;
        setCurrentElements(prev => prev.map(el => {
          if (el.id !== resizeState.id) return el;
          return { ...el, width: Math.max(20, resizeState.startW + dx), height: Math.max(10, resizeState.startH + dy) };
        }));
      }
    };
    const handleMouseUp = () => {
      if (dragState) setDragState(null);
      if (resizeState) setResizeState(null);
    };
    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);
    return () => { window.removeEventListener("mousemove", handleMouseMove); window.removeEventListener("mouseup", handleMouseUp); };
  }, [dragState, resizeState, zoom, setCurrentElements]);

  useEffect(() => {
    if (!contextMenu) return;
    const handler = () => setContextMenu(null);
    window.addEventListener("click", handler);
    return () => window.removeEventListener("click", handler);
  }, [contextMenu]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Delete" || e.key === "Backspace") {
        if (editingTextId) return;
        if (selectedId) deleteSelected();
      }
      if (e.ctrlKey && e.key === "z") { e.preventDefault(); }
      if (e.ctrlKey && e.key === "y") { e.preventDefault(); }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  });

  // --- Convert all pages to HTML ---
  const convertToHtml = (): string => {
    return pages.map((page, pageIdx) => {
      const sortedEls = [...page.elements].sort((a, b) => a.zIndex - b.zIndex);
      let bgStyle = "";
      if (page.backgroundImage) {
        bgStyle = `background-image:url(${page.backgroundImage});background-size:contain;background-repeat:no-repeat;background-position:center;`;
      }
      let html = `<div class="contract-page" data-page="${pageIdx}" style="position:relative;width:${A4_WIDTH}px;min-height:${A4_HEIGHT}px;background:#fff;margin:0 auto;padding:0;box-sizing:border-box;${bgStyle}${pageIdx > 0 ? 'page-break-before:always;' : ''}">`;

      for (const el of sortedEls) {
        const baseStyle = `position:absolute;left:${el.x}px;top:${el.y}px;width:${el.width}px;height:${el.height}px;z-index:${el.zIndex};`;
        switch (el.type) {
          case "rect":
            html += `<div style="${baseStyle}background:${el.fill};border:${el.strokeWidth}px solid ${el.stroke};border-radius:${el.borderRadius}px;box-sizing:border-box;">`;
            if (el.text) html += `<div style="width:100%;height:100%;display:flex;align-items:center;justify-content:${el.textAlign === 'center' ? 'center' : el.textAlign === 'right' ? 'flex-end' : 'flex-start'};padding:8px;box-sizing:border-box;font-family:${el.fontFamily};font-size:${el.fontSize}px;font-weight:${el.fontWeight};font-style:${el.fontStyle};text-decoration:${el.textDecoration};color:${el.color};text-align:${el.textAlign};white-space:pre-wrap;">${el.text}</div>`;
            html += `</div>`;
            break;
          case "circle":
            html += `<div style="${baseStyle}background:${el.fill};border:${el.strokeWidth}px solid ${el.stroke};border-radius:50%;box-sizing:border-box;">`;
            if (el.text) html += `<div style="width:100%;height:100%;display:flex;align-items:center;justify-content:center;padding:8px;box-sizing:border-box;font-family:${el.fontFamily};font-size:${el.fontSize}px;color:${el.color};text-align:center;white-space:pre-wrap;">${el.text}</div>`;
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
            if (el.imageUrl) html += `<img src="${el.imageUrl}" style="width:100%;height:100%;object-fit:contain;" />`;
            html += `</div>`;
            break;
          case "table":
            if (el.tableData) {
              html += `<div style="${baseStyle}overflow:hidden;"><table style="width:100%;height:100%;border-collapse:collapse;font-family:${el.fontFamily};font-size:${el.fontSize}px;color:${el.color};">`;
              el.tableData.forEach((row, ri) => {
                html += `<tr>`;
                row.forEach(cell => {
                  const tag = ri === 0 ? "th" : "td";
                  const bg = ri === 0 ? `background:${el.stroke};color:#fff;font-weight:bold;` : "";
                  html += `<${tag} style="border:1px solid ${el.stroke};padding:4px 8px;text-align:${el.textAlign};${bg}">${cell}</${tag}>`;
                });
                html += `</tr>`;
              });
              html += `</table></div>`;
            }
            break;
        }
      }
      html += `</div>`;
      return html;
    }).join("\n");
  };

  const handleSave = () => {
    const html = convertToHtml();
    onSave(html);
    toast.success("Contrato salvo com sucesso!");
  };

  const [exporting, setExporting] = useState(false);

  const handleExportPdf = async () => {
    setExporting(true);
    try {
      const doc = new jsPDF({ orientation: "portrait", unit: "px", format: [A4_WIDTH, A4_HEIGHT] });

      for (let pageIdx = 0; pageIdx < pages.length; pageIdx++) {
        if (pageIdx > 0) doc.addPage([A4_WIDTH, A4_HEIGHT]);
        const page = pages[pageIdx];
        const sortedEls = [...page.elements].sort((a, b) => a.zIndex - b.zIndex);

        // Draw background image if exists
        if (page.backgroundImage) {
          doc.saveGraphicsState();
          (doc as any).setGState(new (doc as any).GState({ opacity: page.backgroundOpacity }));
          doc.addImage(page.backgroundImage, "PNG", 0, 0, A4_WIDTH, A4_HEIGHT);
          doc.restoreGraphicsState();
        }

        for (const el of sortedEls) {
          switch (el.type) {
            case "rect": {
              if (el.fill && el.fill !== "transparent") {
                const c = hexToRgb(el.fill);
                if (c) doc.setFillColor(c.r, c.g, c.b);
                if (el.borderRadius > 0) {
                  doc.roundedRect(el.x, el.y, el.width, el.height, el.borderRadius, el.borderRadius, "F");
                } else {
                  doc.rect(el.x, el.y, el.width, el.height, "F");
                }
              }
              if (el.stroke && el.stroke !== "transparent" && el.strokeWidth > 0) {
                const c = hexToRgb(el.stroke);
                if (c) doc.setDrawColor(c.r, c.g, c.b);
                doc.setLineWidth(el.strokeWidth);
                if (el.borderRadius > 0) {
                  doc.roundedRect(el.x, el.y, el.width, el.height, el.borderRadius, el.borderRadius, "S");
                } else {
                  doc.rect(el.x, el.y, el.width, el.height, "S");
                }
              }
              if (el.text) drawText(doc, el);
              break;
            }
            case "circle": {
              const rx = el.width / 2, ry = el.height / 2;
              const cx = el.x + rx, cy = el.y + ry;
              if (el.fill && el.fill !== "transparent") {
                const c = hexToRgb(el.fill);
                if (c) doc.setFillColor(c.r, c.g, c.b);
                doc.ellipse(cx, cy, rx, ry, "F");
              }
              if (el.stroke && el.stroke !== "transparent" && el.strokeWidth > 0) {
                const c = hexToRgb(el.stroke);
                if (c) doc.setDrawColor(c.r, c.g, c.b);
                doc.setLineWidth(el.strokeWidth);
                doc.ellipse(cx, cy, rx, ry, "S");
              }
              if (el.text) drawText(doc, el);
              break;
            }
            case "line": {
              const c = hexToRgb(el.stroke);
              if (c) doc.setDrawColor(c.r, c.g, c.b);
              doc.setLineWidth(el.strokeWidth);
              doc.line(el.x, el.y, el.x + el.width, el.y);
              break;
            }
            case "text": {
              drawText(doc, el);
              break;
            }
            case "image": {
              if (el.imageUrl) {
                try {
                  doc.addImage(el.imageUrl, "PNG", el.x, el.y, el.width, el.height);
                } catch { /* skip broken images */ }
              }
              break;
            }
            case "table": {
              if (el.tableData) {
                const rows = el.tableData.length;
                const cols = el.tableData[0]?.length || 1;
                const cellW = el.width / cols;
                const cellH = el.height / rows;
                doc.setLineWidth(0.5);
                const sc = hexToRgb(el.stroke);
                if (sc) doc.setDrawColor(sc.r, sc.g, sc.b);
                for (let ri = 0; ri < rows; ri++) {
                  for (let ci = 0; ci < cols; ci++) {
                    const cx = el.x + ci * cellW;
                    const cy = el.y + ri * cellH;
                    if (ri === 0 && sc) {
                      doc.setFillColor(sc.r, sc.g, sc.b);
                      doc.rect(cx, cy, cellW, cellH, "FD");
                      doc.setTextColor(255, 255, 255);
                    } else {
                      doc.rect(cx, cy, cellW, cellH, "S");
                      doc.setTextColor(0, 0, 0);
                    }
                    doc.setFontSize(el.fontSize * 0.75);
                    doc.setFont("helvetica", ri === 0 ? "bold" : "normal");
                    const txt = el.tableData[ri][ci] || "";
                    doc.text(txt, cx + 4, cy + cellH / 2 + 3, { maxWidth: cellW - 8 });
                  }
                }
              }
              break;
            }
          }
        }
      }

      doc.save("contrato.pdf");
      toast.success("PDF exportado com sucesso!");
    } catch (err) {
      console.error("Export PDF error:", err);
      toast.error("Erro ao exportar PDF");
    } finally {
      setExporting(false);
    }
  };

  const [exportingDocx, setExportingDocx] = useState(false);

  const handleExportDocx = async () => {
    setExportingDocx(true);
    try {
      const sections = [];

      for (let pageIdx = 0; pageIdx < pages.length; pageIdx++) {
        const page = pages[pageIdx];
        const sortedEls = [...page.elements].sort((a, b) => a.zIndex - b.zIndex);
        const children: (Paragraph | Table)[] = [];

        // Group elements roughly by vertical position for document flow
        const textEls = sortedEls.filter(el => el.type === "text" || ((el.type === "rect" || el.type === "circle") && el.text));
        const imageEls = sortedEls.filter(el => el.type === "image" && el.imageUrl);
        const lineEls = sortedEls.filter(el => el.type === "line");
        const tableEls = sortedEls.filter(el => el.type === "table" && el.tableData);

        // Sort by Y position for natural reading order
        const flowEls = [...textEls, ...imageEls, ...lineEls, ...tableEls].sort((a, b) => a.y - b.y || a.x - b.x);

        for (const el of flowEls) {
          if (el.type === "line") {
            children.push(new Paragraph({
              border: { bottom: { style: BorderStyle.SINGLE, size: el.strokeWidth * 4, color: el.stroke.replace("#", "") } },
              children: [],
            }));
            continue;
          }

          if (el.type === "image" && el.imageUrl) {
            try {
              // Convert data URL to buffer
              const base64 = el.imageUrl.split(",")[1];
              const binary = atob(base64);
              const bytes = new Uint8Array(binary.length);
              for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
              const ext = el.imageUrl.includes("image/png") ? "png" : "jpg";
              children.push(new Paragraph({
                children: [new ImageRun({
                  type: ext as "png" | "jpg",
                  data: bytes,
                  transformation: { width: el.width * 0.75, height: el.height * 0.75 },
                })],
              }));
            } catch { /* skip broken images */ }
            continue;
          }

          if (el.type === "table" && el.tableData) {
            const colCount = el.tableData[0]?.length || 1;
            const colW = Math.floor(9360 / colCount);
            const cellBorder = { style: BorderStyle.SINGLE, size: 1, color: el.stroke?.replace("#", "") || "333333" };
            const cellBorders = { top: cellBorder, bottom: cellBorder, left: cellBorder, right: cellBorder };
            children.push(new Table({
              width: { size: 9360, type: WidthType.DXA },
              columnWidths: Array(colCount).fill(colW),
              rows: el.tableData.map((row, ri) => new TableRow({
                children: row.map(cell => new TableCell({
                  borders: cellBorders,
                  width: { size: colW, type: WidthType.DXA },
                  shading: ri === 0 ? { fill: el.stroke?.replace("#", "") || "333333", type: ShadingType.CLEAR } : undefined,
                  children: [new Paragraph({
                    children: [new TextRun({
                      text: cell,
                      font: el.fontFamily,
                      size: Math.round(el.fontSize * 1.5),
                      bold: ri === 0,
                      color: ri === 0 ? "FFFFFF" : el.color?.replace("#", "") || "000000",
                    })],
                  })],
                })),
              })),
            }));
            continue;
          }

          // Text elements
          const text = el.text || "";
          if (!text.trim()) continue;

          const alignment = el.textAlign === "center" ? AlignmentType.CENTER
            : el.textAlign === "right" ? AlignmentType.RIGHT
            : el.textAlign === "justify" ? AlignmentType.JUSTIFIED
            : AlignmentType.LEFT;

          const textLines = text.split("\n");
          for (const line of textLines) {
            children.push(new Paragraph({
              alignment,
              spacing: { after: 80 },
              children: [new TextRun({
                text: line,
                font: el.fontFamily,
                size: Math.round(el.fontSize * 1.5), // px to half-points
                bold: el.fontWeight === "bold",
                italics: el.fontStyle === "italic",
                underline: el.textDecoration?.includes("underline") ? {} : undefined,
                strike: el.textDecoration?.includes("line-through") || false,
                color: el.color?.replace("#", "") || "000000",
              })],
            }));
          }
        }

        if (children.length === 0) {
          children.push(new Paragraph({ children: [] }));
        }

        sections.push({
          properties: {
            page: {
              size: { width: 11906, height: 16838 }, // A4 in DXA
              margin: { top: 720, right: 720, bottom: 720, left: 720 },
            },
          },
          children,
        });
      }

      const doc = new Document({ sections });
      const blob = await Packer.toBlob(doc);
      saveAs(blob, "contrato.docx");
      toast.success("DOCX exportado com sucesso! Abra no Word para editar.");
    } catch (err) {
      console.error("Export DOCX error:", err);
      toast.error("Erro ao exportar DOCX");
    } finally {
      setExportingDocx(false);
    }
  };

  const filteredVars = variables
    .filter(v => !varSearch || v.var.toLowerCase().includes(varSearch.toLowerCase()) || v.desc.toLowerCase().includes(varSearch.toLowerCase()))
    .sort((a, b) => a.var.localeCompare(b.var));

  // --- Render helpers ---
  const renderElement = (el: CanvasElement) => {
    const isSelected = el.id === selectedId;
    const isEditing = el.id === editingTextId;

    const style: React.CSSProperties = {
      position: "absolute", left: el.x, top: el.y, width: el.width, height: el.height,
      zIndex: el.zIndex, cursor: activeTool === "select" ? "move" : "default",
      outline: isSelected ? "2px solid hsl(210 80% 55%)" : "none", outlineOffset: "1px",
    };

    const handleDoubleClick = (e: React.MouseEvent) => {
      e.stopPropagation();
      if (el.type === "text" || el.type === "rect" || el.type === "circle") setEditingTextId(el.id);
    };

    const textContent = isEditing ? (
      <textarea
        autoFocus value={el.text}
        onChange={(e) => setCurrentElements(prev => prev.map(p => p.id === el.id ? { ...p, text: e.target.value } : p))}
        onBlur={() => setEditingTextId(null)}
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
        padding: el.type === "text" ? 0 : 8, boxSizing: "border-box",
      }}>
        {el.text || (el.type === "text" ? <span className="text-muted-foreground/40 italic text-xs">Duplo clique para editar</span> : null)}
      </div>
    );

    const resizeHandles = isSelected ? (
      <>
        {["se", "sw", "nw", "ne"].map(corner => {
          const pos: React.CSSProperties = {
            position: "absolute", width: 8, height: 8, background: "hsl(210 80% 55%)",
            borderRadius: 2, zIndex: 9999,
            ...(corner.includes("s") ? { bottom: -4 } : { top: -4 }),
            ...(corner.includes("e") ? { right: -4 } : { left: -4 }),
            cursor: corner === "se" || corner === "nw" ? "nwse-resize" : "nesw-resize",
          };
          return <div key={corner} style={pos} onMouseDown={e => handleResizeMouseDown(e, el, corner)} />;
        })}
      </>
    ) : null;

    let content: React.ReactNode;
    switch (el.type) {
      case "rect":
        content = <div style={{ ...style, background: el.fill, border: `${el.strokeWidth}px solid ${el.stroke}`, borderRadius: el.borderRadius, boxSizing: "border-box" }} onMouseDown={e => handleElementMouseDown(e, el)} onDoubleClick={handleDoubleClick}>{textContent}{resizeHandles}</div>;
        break;
      case "circle":
        content = <div style={{ ...style, background: el.fill, border: `${el.strokeWidth}px solid ${el.stroke}`, borderRadius: "50%", boxSizing: "border-box" }} onMouseDown={e => handleElementMouseDown(e, el)} onDoubleClick={handleDoubleClick}>{textContent}{resizeHandles}</div>;
        break;
      case "line":
        content = <div style={{ ...style, borderTop: `${el.strokeWidth}px solid ${el.stroke}` }} onMouseDown={e => handleElementMouseDown(e, el)}>{resizeHandles}</div>;
        break;
      case "text":
        content = <div style={style} onMouseDown={e => handleElementMouseDown(e, el)} onDoubleClick={handleDoubleClick}>{textContent}{resizeHandles}</div>;
        break;
      case "image":
        content = (
          <div style={{ ...style, overflow: "hidden", border: isSelected ? undefined : "1px dashed #ccc" }} onMouseDown={e => handleElementMouseDown(e, el)}>
            {el.imageUrl ? <img src={el.imageUrl} alt="" style={{ width: "100%", height: "100%", objectFit: "contain" }} draggable={false} /> : <div className="flex h-full w-full items-center justify-center text-xs text-muted-foreground">Imagem</div>}
            {resizeHandles}
          </div>
        );
        break;
      case "table":
        if (el.tableData) {
          const colW = el.width / (el.tableData[0]?.length || 1);
          const rowH = el.height / el.tableData.length;
          content = (
            <div style={{ ...style, overflow: "hidden" }} onMouseDown={e => handleElementMouseDown(e, el)}>
              <table style={{ width: "100%", height: "100%", borderCollapse: "collapse", fontFamily: el.fontFamily, fontSize: el.fontSize, color: el.color, tableLayout: "fixed" }}>
                <tbody>
                  {el.tableData.map((row, ri) => (
                    <tr key={ri}>
                      {row.map((cell, ci) => (
                        <td key={ci} style={{
                          border: `1px solid ${el.stroke}`,
                          padding: "2px 6px",
                          background: ri === 0 ? el.stroke : el.fill,
                          color: ri === 0 ? "#ffffff" : el.color,
                          fontWeight: ri === 0 ? "bold" : "normal",
                          textAlign: el.textAlign as any,
                          verticalAlign: "middle",
                        }}>
                          <input
                            type="text" value={cell}
                            onChange={e => updateTableCell(el.id, ri, ci, e.target.value)}
                            onClick={e => e.stopPropagation()}
                            style={{
                              width: "100%", border: "none", outline: "none",
                              background: "transparent", color: "inherit", fontFamily: "inherit",
                              fontSize: "inherit", fontWeight: "inherit", textAlign: "inherit",
                              padding: 0,
                            }}
                          />
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
              {resizeHandles}
            </div>
          );
        }
        break;
    }
    return <div key={el.id}>{content}</div>;
  };

  const renderPropertiesPanel = () => {
    return (
      <div className="w-56 border-l border-border bg-background p-3 overflow-y-auto text-xs space-y-3">
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

        {selected ? (
          <>
            <h3 className="font-semibold text-sm text-foreground">Propriedades</h3>
            <div className="space-y-1.5">
              <label className="text-muted-foreground">Posição</label>
              <div className="grid grid-cols-2 gap-1">
                <div><span className="text-muted-foreground">X</span><input type="number" value={Math.round(selected.x)} onChange={e => updateSelected({ x: Number(e.target.value) })} className="w-full rounded border border-border bg-muted/30 px-1.5 py-1 text-xs" /></div>
                <div><span className="text-muted-foreground">Y</span><input type="number" value={Math.round(selected.y)} onChange={e => updateSelected({ y: Number(e.target.value) })} className="w-full rounded border border-border bg-muted/30 px-1.5 py-1 text-xs" /></div>
              </div>
            </div>
            <div className="space-y-1.5">
              <label className="text-muted-foreground">Tamanho</label>
              <div className="grid grid-cols-2 gap-1">
                <div><span className="text-muted-foreground">L</span><input type="number" value={Math.round(selected.width)} onChange={e => updateSelected({ width: Number(e.target.value) })} className="w-full rounded border border-border bg-muted/30 px-1.5 py-1 text-xs" /></div>
                <div><span className="text-muted-foreground">A</span><input type="number" value={Math.round(selected.height)} onChange={e => updateSelected({ height: Number(e.target.value) })} className="w-full rounded border border-border bg-muted/30 px-1.5 py-1 text-xs" /></div>
              </div>
            </div>
            {(selected.type === "rect" || selected.type === "circle") && (
              <>
                <div className="space-y-1.5">
                  <label className="text-muted-foreground">Preenchimento</label>
                  <input type="color" value={selected.fill} onChange={e => updateSelected({ fill: e.target.value })} className="h-7 w-full cursor-pointer rounded border border-border" />
                </div>
                <div className="space-y-1.5">
                  <label className="text-muted-foreground">Borda</label>
                  <input type="color" value={selected.stroke} onChange={e => updateSelected({ stroke: e.target.value })} className="h-7 w-full cursor-pointer rounded border border-border" />
                  <input type="number" min={0} max={10} value={selected.strokeWidth} onChange={e => updateSelected({ strokeWidth: Number(e.target.value) })} className="w-full rounded border border-border bg-muted/30 px-1.5 py-1 text-xs" />
                </div>
                {selected.type === "rect" && (
                  <div className="space-y-1.5">
                    <label className="text-muted-foreground">Arredondamento</label>
                    <input type="range" min={0} max={50} value={selected.borderRadius} onChange={e => updateSelected({ borderRadius: Number(e.target.value) })} className="w-full" />
                  </div>
                )}
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
      </div>
    );
  };

  const applyTemplate = (tpl: ContractTemplate) => {
    setPages(tpl.pages.map(p => ({ ...p, id: pageId(), elements: p.elements.map(e => ({ ...e, id: genId() })) })));
    setCurrentPageIdx(0);
    setSelectedId(null);
    setShowTemplates(false);
    if (tpl.id !== "em-branco") toast.success(`Template "${tpl.name}" aplicado!`);
  };

  const applyCustomTemplate = (ct: CustomTemplate) => {
    const pagesData = ct.pages_data as PageData[];
    setPages(pagesData.map(p => ({ ...p, id: pageId(), elements: (p.elements || []).map(e => ({ ...e, id: genId() })) })));
    setCurrentPageIdx(0);
    setSelectedId(null);
    setShowTemplates(false);
    toast.success(`Template "${ct.name}" carregado!`);
  };

  const handleSaveAsTemplate = async () => {
    if (!saveTemplateName.trim()) {
      toast.error("Informe um nome para o template");
      return;
    }
    let ok: boolean;
    if (overwriteTemplateId) {
      ok = await updateTemplate(overwriteTemplateId, {
        name: saveTemplateName.trim(),
        description: saveTemplateDesc.trim(),
        pages_data: pages,
      });
    } else {
      ok = await saveTemplate(saveTemplateName.trim(), saveTemplateDesc.trim(), pages);
    }
    if (ok) {
      setShowSaveDialog(false);
      setSaveTemplateName("");
      setSaveTemplateDesc("");
      setOverwriteTemplateId(null);
    }
  };

  const handleDeleteCustom = async (id: string, name: string) => {
    if (!confirm(`Excluir template "${name}"?`)) return;
    await deleteTemplate(id);
  };

  const handleDuplicateCustom = async (ct: CustomTemplate) => {
    await saveTemplate(`${ct.name} (cópia)`, ct.description || "", ct.pages_data);
  };

  const handleRenameCustom = async (id: string) => {
    if (!editName.trim()) return;
    await updateTemplate(id, { name: editName.trim() });
    setEditingCustomId(null);
    setEditName("");
  };

  // --- JSON Export/Import ---
  const jsonInputRef = useRef<HTMLInputElement>(null);

  const handleExportTemplatesJson = () => {
    if (customTemplates.length === 0) {
      toast.error("Nenhum template customizado para exportar");
      return;
    }
    const exportData = customTemplates.map(ct => ({
      name: ct.name,
      description: ct.description,
      icon: ct.icon,
      pages_data: ct.pages_data,
    }));
    const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `templates_contratos_${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success(`${exportData.length} template(s) exportado(s) como JSON!`);
  };

  const handleImportTemplatesJson = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = "";
    try {
      const text = await file.text();
      const data = JSON.parse(text);
      const arr = Array.isArray(data) ? data : [data];
      let count = 0;
      for (const item of arr) {
        if (item.name && item.pages_data) {
          await saveTemplate(item.name, item.description || "", item.pages_data, item.icon || "📝");
          count++;
        }
      }
      if (count > 0) toast.success(`${count} template(s) importado(s) com sucesso!`);
      else toast.error("Nenhum template válido encontrado no arquivo");
    } catch (err) {
      console.error(err);
      toast.error("Erro ao importar JSON. Verifique o formato do arquivo.");
    }
  };

  // --- Insert company logo ---
  const handleInsertCompanyLogo = async () => {
    try {
      const { data: { user } } = await (supabase as any).auth.getUser();
      if (!user) { toast.error("Usuário não autenticado"); return; }
      
      const { data: tenant } = await (supabase as any)
        .from("tenants")
        .select("logo_url")
        .eq("id", tenantId)
        .single();
      
      if (!tenant?.logo_url) {
        toast.error("Nenhum logo encontrado. Configure o logo da empresa nas configurações.");
        return;
      }
      
      const el = createDefaultElement("image", 40, 40);
      el.imageUrl = tenant.logo_url;
      el.width = 180;
      el.height = 80;
      setCurrentElements(prev => [...prev, el]);
      setSelectedId(el.id);
      setActiveTool("select");
      toast.success("Logo da empresa inserido!");
    } catch (err) {
      console.error(err);
      toast.error("Erro ao buscar logo da empresa");
    }
  };

  // Render a mini thumbnail for a custom template's first page
  const renderMiniThumbnail = (ct: CustomTemplate) => {
    const pagesData = ct.pages_data as PageData[];
    const firstPage = pagesData?.[0];
    if (!firstPage || !firstPage.elements?.length) {
      return <div className="w-full bg-muted/30 rounded flex items-center justify-center text-muted-foreground text-[8px]" style={{ aspectRatio: `${A4_WIDTH}/${A4_HEIGHT}` }}>Vazio</div>;
    }
    const scale = 0.09;
    return (
      <div className="w-full rounded overflow-hidden border border-border bg-white relative" style={{ aspectRatio: `${A4_WIDTH}/${A4_HEIGHT}` }}>
        {firstPage.backgroundImage && (
          <img src={firstPage.backgroundImage} alt="" className="absolute inset-0 w-full h-full object-contain" style={{ opacity: firstPage.backgroundOpacity }} />
        )}
        <div style={{ transform: `scale(${scale})`, transformOrigin: "0 0", width: A4_WIDTH, height: A4_HEIGHT, position: "relative" }}>
          {firstPage.elements.slice(0, 20).map((el, i) => {
            if (el.type === "rect") return <div key={i} style={{ position: "absolute", left: el.x, top: el.y, width: el.width, height: el.height, background: el.fill, borderRadius: el.borderRadius, border: `${el.strokeWidth}px solid ${el.stroke}` }} />;
            if (el.type === "text") return <div key={i} style={{ position: "absolute", left: el.x, top: el.y, width: el.width, height: el.height, fontSize: el.fontSize, fontWeight: el.fontWeight, color: el.color, fontFamily: el.fontFamily, overflow: "hidden", whiteSpace: "pre-wrap", lineHeight: 1.1 }}>{el.text}</div>;
            if (el.type === "line") return <div key={i} style={{ position: "absolute", left: el.x, top: el.y, width: el.width, borderTop: `${el.strokeWidth}px solid ${el.stroke}` }} />;
            if (el.type === "table") return <div key={i} style={{ position: "absolute", left: el.x, top: el.y, width: el.width, height: el.height, border: `1px solid ${el.stroke}`, background: el.fill }} />;
            return null;
          })}
        </div>
      </div>
    );
  };

  if (showTemplates) {
    return (
      <div className="flex flex-col items-center justify-center h-full bg-muted/20 p-8 overflow-y-auto">
        <input ref={jsonInputRef} type="file" accept=".json" className="hidden" onChange={handleImportTemplatesJson} />
        <h2 className="text-xl font-bold text-foreground mb-2">Escolha um modelo para começar</h2>
        <p className="text-muted-foreground text-sm mb-6">Selecione um template pré-pronto, um salvo, ou comece do zero</p>

        {/* Pre-built templates */}
        <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3">Modelos Pré-prontos</h3>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3 max-w-5xl mb-8">
          {getContractTemplates().map(tpl => (
            <button
              key={tpl.id}
              onClick={() => applyTemplate(tpl)}
              className="flex flex-col items-center gap-2 p-4 rounded-xl border-2 border-border bg-background hover:border-primary hover:shadow-lg transition-all text-center group"
            >
              <span className="text-3xl">{tpl.icon}</span>
              <span className="font-semibold text-xs text-foreground group-hover:text-primary leading-tight">{tpl.name}</span>
              <span className="text-[10px] text-muted-foreground leading-tight line-clamp-2">{tpl.description}</span>
            </button>
          ))}
        </div>

        {/* Custom templates */}
        {(customTemplates.length > 0 || loadingCustom) && (
          <>
            <div className="flex items-center gap-3 mb-3">
              <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">Meus Templates Salvos</h3>
              <div className="flex gap-1">
                <Button variant="outline" size="sm" className="h-6 text-[10px] gap-1" onClick={handleExportTemplatesJson} title="Exportar templates como JSON">
                  <Download className="h-3 w-3" /> Exportar JSON
                </Button>
                <Button variant="outline" size="sm" className="h-6 text-[10px] gap-1" onClick={() => jsonInputRef.current?.click()} title="Importar templates de arquivo JSON">
                  <Upload className="h-3 w-3" /> Importar JSON
                </Button>
              </div>
            </div>
            {loadingCustom ? (
              <p className="text-xs text-muted-foreground">Carregando...</p>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 max-w-4xl mb-6">
                {customTemplates.map(ct => (
                  <div key={ct.id} className="relative flex flex-col gap-2 p-3 rounded-xl border-2 border-border bg-background hover:border-primary hover:shadow-lg transition-all group">
                    <button onClick={() => applyCustomTemplate(ct)} className="flex flex-col items-center gap-2 w-full">
                      {renderMiniThumbnail(ct)}
                      {editingCustomId === ct.id ? (
                        <div className="flex gap-1" onClick={e => e.stopPropagation()}>
                          <Input value={editName} onChange={e => setEditName(e.target.value)} className="h-6 text-xs w-32" onKeyDown={e => e.key === "Enter" && handleRenameCustom(ct.id)} />
                          <Button size="sm" className="h-6 text-[10px]" onClick={() => handleRenameCustom(ct.id)}>OK</Button>
                        </div>
                      ) : (
                        <span className="font-semibold text-xs text-foreground group-hover:text-primary leading-tight">{ct.name}</span>
                      )}
                      {ct.description && <span className="text-[10px] text-muted-foreground leading-tight line-clamp-2">{ct.description}</span>}
                    </button>
                    <div className="absolute top-1 right-1 flex gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                      <Button variant="ghost" size="icon" className="h-6 w-6" onClick={(e) => { e.stopPropagation(); handleDuplicateCustom(ct); }} title="Duplicar">
                        <Copy className="h-3 w-3" />
                      </Button>
                      <Button variant="ghost" size="icon" className="h-6 w-6" onClick={(e) => { e.stopPropagation(); setEditingCustomId(ct.id); setEditName(ct.name); }} title="Renomear">
                        <Pencil className="h-3 w-3" />
                      </Button>
                      <Button variant="ghost" size="icon" className="h-6 w-6 text-destructive hover:text-destructive" onClick={(e) => { e.stopPropagation(); handleDeleteCustom(ct.id, ct.name); }} title="Excluir">
                        <Trash className="h-3 w-3" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </>
        )}

        {customTemplates.length === 0 && !loadingCustom && (
          <div className="flex gap-2 mb-4">
            <Button variant="outline" size="sm" className="h-7 text-xs gap-1" onClick={() => jsonInputRef.current?.click()} title="Importar templates de arquivo JSON">
              <Upload className="h-3 w-3" /> Importar Templates (JSON)
            </Button>
          </div>
        )}

        <Button variant="ghost" className="mt-2 text-xs text-muted-foreground" onClick={onCancel}>
          <X className="h-3 w-3 mr-1" /> Cancelar
        </Button>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleFileChange} />
      <input ref={pdfInputRef} type="file" accept=".pdf" className="hidden" onChange={handlePdfFileChange} />
      <input ref={jsonInputRef} type="file" accept=".json" className="hidden" onChange={handleImportTemplatesJson} />

      {/* Toolbar */}
      <ContractEditorToolbar
        activeTool={activeTool} onToolChange={setActiveTool}
        activeShapeType={activeShapeType} onShapeTypeChange={setActiveShapeType}
        fontFamily={fontFamily} onFontFamilyChange={v => updateSelected({ fontFamily: v })}
        fontSize={fontSize} onFontSizeChange={v => updateSelected({ fontSize: v })}
        isBold={isBold} onBoldToggle={() => updateSelected({ fontWeight: isBold ? "normal" : "bold" })}
        isItalic={isItalic} onItalicToggle={() => updateSelected({ fontStyle: isItalic ? "normal" : "italic" })}
        isUnderline={isUnderline}
        onUnderlineToggle={() => { const c = selected?.textDecoration || "none"; const h = c.includes("underline"); updateSelected({ textDecoration: h ? c.replace("underline", "").trim() || "none" : (c === "none" ? "underline" : c + " underline") }); }}
        isStrikethrough={isStrikethrough}
        onStrikethroughToggle={() => { const c = selected?.textDecoration || "none"; const h = c.includes("line-through"); updateSelected({ textDecoration: h ? c.replace("line-through", "").trim() || "none" : (c === "none" ? "line-through" : c + " line-through") }); }}
        textColor={textColor} onTextColorChange={v => updateSelected({ color: v })}
        textAlign={textAlign} onTextAlignChange={v => updateSelected({ textAlign: v })}
        onUndo={() => {}} onRedo={() => {}} canUndo={false} canRedo={false}
        onImageUpload={handleImageUpload}
        onTableInsert={handleTableInsert}
      />

      {/* Action bar - row 1: tools */}
      <div className="flex items-center flex-wrap gap-1 border-x border-border bg-muted/20 px-2 py-1">
        <Button variant="ghost" size="sm" className="h-7 gap-1 text-xs shrink-0" onClick={() => setShowTemplates(true)} title="Templates">
          <LayoutTemplate className="h-3.5 w-3.5" /> Templates
        </Button>
        <div className="h-5 w-px bg-border" />
        <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0" onClick={() => setZoom(z => Math.max(0.25, z - 0.1))} title="Zoom -"><ZoomOut className="h-3.5 w-3.5" /></Button>
        <span className="text-xs text-muted-foreground w-10 text-center shrink-0">{Math.round(zoom * 100)}%</span>
        <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0" onClick={() => setZoom(z => Math.min(2, z + 0.1))} title="Zoom +"><ZoomIn className="h-3.5 w-3.5" /></Button>
        <div className="h-5 w-px bg-border" />
        <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0" onClick={goToPrevPage} disabled={currentPageIdx === 0}><ChevronLeft className="h-3.5 w-3.5" /></Button>
        <span className="text-xs text-foreground font-medium shrink-0">Pág. {currentPageIdx + 1}/{pages.length}</span>
        <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0" onClick={goToNextPage} disabled={currentPageIdx >= pages.length - 1}><ChevronRight className="h-3.5 w-3.5" /></Button>
        <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0" onClick={addPage} title="Adicionar página"><Plus className="h-3.5 w-3.5" /></Button>
        <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0" onClick={duplicatePage} title="Duplicar página"><Copy className="h-3.5 w-3.5" /></Button>
        <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0 text-destructive" onClick={deletePage} disabled={pages.length <= 1} title="Excluir página"><Trash2 className="h-3.5 w-3.5" /></Button>
        <div className="h-5 w-px bg-border" />
        <Button variant="ghost" size="sm" className="h-7 gap-1 text-xs shrink-0" onClick={handlePdfImport} disabled={importingPdf} title="Importar PDF como fundo">
          <FileUp className="h-3.5 w-3.5" /> {importingPdf ? "Importando..." : "PDF fundo"}
        </Button>
        <Button variant="ghost" size="sm" className="h-7 gap-1 text-xs shrink-0" onClick={handleInsertCompanyLogo} title="Inserir logo da empresa">
          <ImageIcon className="h-3.5 w-3.5" /> Logo
        </Button>
        <Button variant="ghost" size="sm" className="h-7 gap-1 text-xs shrink-0" onClick={() => setShowSaveDialog(true)} title="Salvar como Template">
          <BookmarkPlus className="h-3.5 w-3.5" /> Salvar Template
        </Button>
        <div className="flex-1" />
        <Button variant="outline" size="sm" className="h-7 gap-1 text-xs shrink-0" onClick={onCancel}><X className="h-3 w-3" /> Cancelar</Button>
        <Button variant="outline" size="sm" className="h-7 gap-1 text-xs shrink-0" onClick={handleExportPdf} disabled={exporting}>
          <Download className="h-3 w-3" /> PDF
        </Button>
        <Button variant="outline" size="sm" className="h-7 gap-1 text-xs shrink-0" onClick={handleExportDocx} disabled={exportingDocx}>
          <FileText className="h-3 w-3" /> DOCX
        </Button>
        <Button size="sm" className="h-7 gap-1 text-xs shrink-0" onClick={handleSave}><Save className="h-3 w-3" /> Salvar</Button>
      </div>

      {/* Save as Template Dialog */}
      {showSaveDialog && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={() => { setShowSaveDialog(false); setOverwriteTemplateId(null); }}>
          <div className="bg-background rounded-xl border border-border p-6 w-[420px] shadow-2xl" onClick={e => e.stopPropagation()}>
            <h3 className="text-lg font-bold text-foreground mb-4">
              {overwriteTemplateId ? "Atualizar Template Existente" : "Salvar como Template"}
            </h3>
            <div className="space-y-3">
              <div>
                <label className="text-xs font-medium text-muted-foreground">Nome do Template *</label>
                <Input value={saveTemplateName} onChange={e => setSaveTemplateName(e.target.value)} placeholder="Ex: Contrato padrão loja" className="mt-1" />
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground">Descrição (opcional)</label>
                <Input value={saveTemplateDesc} onChange={e => setSaveTemplateDesc(e.target.value)} placeholder="Breve descrição do modelo" className="mt-1" />
              </div>
            </div>

            {/* Overwrite existing option */}
            {customTemplates.length > 0 && !overwriteTemplateId && (
              <div className="mt-4 pt-3 border-t border-border">
                <label className="text-xs font-medium text-muted-foreground mb-2 block">Ou sobrescrever um template existente:</label>
                <div className="flex flex-wrap gap-1.5">
                  {customTemplates.map(ct => (
                    <Button
                      key={ct.id}
                      variant="outline"
                      size="sm"
                      className="h-7 text-xs gap-1"
                      onClick={() => {
                        setOverwriteTemplateId(ct.id);
                        setSaveTemplateName(ct.name);
                        setSaveTemplateDesc(ct.description || "");
                      }}
                    >
                      {ct.icon} {ct.name}
                    </Button>
                  ))}
                </div>
              </div>
            )}

            {overwriteTemplateId && (
              <p className="mt-3 text-xs text-amber-600 bg-amber-50 dark:bg-amber-950/30 rounded-md px-3 py-2">
                ⚠️ O layout atual substituirá completamente o template selecionado.
              </p>
            )}

            <div className="flex gap-2 mt-5 justify-end">
              {overwriteTemplateId && (
                <Button variant="ghost" size="sm" onClick={() => setOverwriteTemplateId(null)} className="mr-auto text-xs">
                  ← Novo template
                </Button>
              )}
              <Button variant="outline" size="sm" onClick={() => { setShowSaveDialog(false); setOverwriteTemplateId(null); }}>Cancelar</Button>
              <Button size="sm" onClick={handleSaveAsTemplate} disabled={!saveTemplateName.trim()}>
                <BookmarkPlus className="h-3.5 w-3.5 mr-1" /> {overwriteTemplateId ? "Atualizar" : "Salvar"}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Main area */}
      <div className="flex flex-1 overflow-hidden border border-border rounded-b-lg">
        {/* Page thumbnails sidebar */}
        <div className="w-24 border-r border-border bg-muted/20 overflow-y-auto p-2 space-y-2">
          {pages.map((page, idx) => (
            <div
              key={page.id}
              draggable
              onDragStart={() => setDragPageIdx(idx)}
              onDragOver={(e) => { e.preventDefault(); setDragOverPageIdx(idx); }}
              onDragLeave={() => setDragOverPageIdx(null)}
              onDrop={() => {
                if (dragPageIdx !== null && dragPageIdx !== idx) {
                  setPages(prev => {
                    const arr = [...prev];
                    const [moved] = arr.splice(dragPageIdx, 1);
                    arr.splice(idx, 0, moved);
                    return arr;
                  });
                  setCurrentPageIdx(idx);
                }
                setDragPageIdx(null);
                setDragOverPageIdx(null);
              }}
              onDragEnd={() => { setDragPageIdx(null); setDragOverPageIdx(null); }}
              onClick={() => { setCurrentPageIdx(idx); setSelectedId(null); }}
              className={`w-full rounded border-2 transition-all cursor-pointer ${idx === currentPageIdx ? "border-primary shadow-sm" : "border-border hover:border-muted-foreground/30"} ${dragOverPageIdx === idx && dragPageIdx !== idx ? "border-primary/50 bg-primary/5" : ""} ${dragPageIdx === idx ? "opacity-40" : ""}`}
              title={`Página ${idx + 1} — arraste para reordenar`}
            >
              <div className="relative w-full bg-background" style={{ aspectRatio: `${A4_WIDTH}/${A4_HEIGHT}` }}>
                {page.backgroundImage && (
                  <img src={page.backgroundImage} alt="" className="absolute inset-0 w-full h-full object-contain" style={{ opacity: page.backgroundOpacity }} />
                )}
                <div className="absolute bottom-0 left-0 right-0 bg-foreground/60 text-background text-[9px] text-center py-0.5 font-medium">
                  {idx + 1}
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Canvas */}
        <div className="flex-1 overflow-auto bg-muted/40 p-6" style={{ background: "repeating-conic-gradient(hsl(var(--muted)) 0% 25%, hsl(var(--background)) 0% 50%) 50% / 20px 20px" }}>
          <div
            ref={canvasRef}
            style={{
              width: A4_WIDTH * zoom, height: A4_HEIGHT * zoom, margin: "0 auto",
              position: "relative", background: "#fff",
              boxShadow: "0 2px 16px rgba(0,0,0,0.1)", overflow: "hidden",
            }}
            onClick={handleCanvasClick}
            onContextMenu={handleContextMenu}
          >
            {/* Background image */}
            {currentPage?.backgroundImage && (
              <img
                src={currentPage.backgroundImage}
                alt=""
                style={{
                  position: "absolute", top: 0, left: 0,
                  width: A4_WIDTH * zoom, height: A4_HEIGHT * zoom,
                  objectFit: "contain", pointerEvents: "none",
                  opacity: currentPage.backgroundOpacity,
                }}
              />
            )}
            {/* Scaled inner */}
            <div style={{ transform: `scale(${zoom})`, transformOrigin: "0 0", width: A4_WIDTH, height: A4_HEIGHT, position: "relative" }}>
              {elements.map(renderElement)}
            </div>

            {/* Context menu */}
            {contextMenu && (
              <div
                style={{ position: "absolute", left: contextMenu.x, top: contextMenu.y, zIndex: 99999 }}
                onClick={e => e.stopPropagation()}
                className="min-w-[200px] rounded-md border border-border bg-popover shadow-lg"
              >
                {selectedId && (
                  <>
                    <button className="w-full px-3 py-1.5 text-left text-sm hover:bg-accent text-accent-foreground" onClick={duplicateSelected}>Duplicar</button>
                    <button className="w-full px-3 py-1.5 text-left text-sm hover:bg-destructive/10 text-destructive" onClick={deleteSelected}>Excluir</button>
                    <div className="h-px bg-border my-1" />
                  </>
                )}
                <button className="w-full px-3 py-1.5 text-left text-sm hover:bg-accent text-accent-foreground flex items-center gap-2" onClick={() => { setContextMenu(null); handleInsertCompanyLogo(); }}>
                  <ImageIcon className="h-3.5 w-3.5" /> Inserir Logo da Empresa
                </button>
                <div className="h-px bg-border my-1" />
                <div className="px-3 py-1.5 text-xs font-semibold text-muted-foreground">Inserir Variável</div>
                <div className="px-2 pb-1">
                  <input type="text" placeholder="Buscar..." value={varSearch}
                    onChange={e => setVarSearch(e.target.value)}
                    className="w-full rounded border border-border bg-muted/30 px-2 py-1 text-xs outline-none"
                    autoFocus onClick={e => e.stopPropagation()} />
                </div>
                <div className="max-h-[200px] overflow-y-auto">
                  {filteredVars.map(v => (
                    <button key={v.var} className="w-full px-3 py-1 text-left hover:bg-accent" onClick={() => insertVariable(v.var)}>
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
