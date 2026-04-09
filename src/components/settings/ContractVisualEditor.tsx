import { useState, useRef, useCallback, useEffect } from "react";
import { supabase } from "@/lib/supabaseClient";
import { useTenant } from "@/contexts/TenantContext";
import { ContractEditorToolbar, type ToolType, type ShapeType } from "./ContractEditorToolbar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { Save, X, ZoomIn, ZoomOut, Plus, Trash2, ChevronLeft, ChevronRight, FileUp, Copy, Download, FileText, BookmarkPlus, Pencil, Trash, Upload, Image as ImageIcon, AlignHorizontalJustifyStart, AlignHorizontalJustifyCenter, AlignHorizontalJustifyEnd, AlignVerticalJustifyStart, AlignVerticalJustifyCenter, AlignVerticalJustifyEnd, Eye, FileSpreadsheet, ToggleLeft, ToggleRight, Palette } from "lucide-react";
import { getContractTemplates, type ContractTemplate } from "./contractTemplates";
import { useCustomTemplates, type CustomTemplate } from "@/hooks/useCustomTemplates";
import { toast } from "sonner";
import * as pdfjsLib from "pdfjs-dist";
import { jsPDF } from "jspdf";
import { Document, Packer, Paragraph, TextRun, ImageRun, PageBreak, AlignmentType, BorderStyle, Table, TableRow, TableCell, WidthType, ShadingType } from "docx";
import { saveAs } from "file-saver";
import { buildContractDocumentHtml } from "@/lib/contractDocument";
import { evaluateCell, isFormula, SUPPORTED_FORMULAS, indexToCol } from "@/lib/formulaEngine";
import { replaceVariablesWithSample, isHtmlVariable, getConditionalStyle, matchesConditionalRule, type ConditionalRule, type ConditionalPreset, DEFAULT_CONDITIONAL_RULES, getAllPresets, loadCustomPresets, saveCustomPresets } from "@/lib/contractPreviewData";

pdfjsLib.GlobalWorkerOptions.workerSrc = new URL("/pdf.worker.min.mjs", window.location.origin).href;

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
  opacity?: number;
  groupId?: string;
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
    case "rect": return { ...base, fill: "transparent", stroke: "#000000", strokeWidth: 1, width: 200, height: 120 };
    case "circle": return { ...base, fill: "transparent", stroke: "#000000", strokeWidth: 1, width: 120, height: 120 };
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
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [activeTool, setActiveTool] = useState<ToolType>("select");
  const [activeShapeType, setActiveShapeType] = useState<ShapeType>("rect");
  const [zoom, setZoom] = useState(0.75);
  const [dragState, setDragState] = useState<{ ids: string[]; startX: number; startY: number; origins: Record<string, { x: number; y: number }> } | null>(null);
  const [resizeState, setResizeState] = useState<{ id: string; startX: number; startY: number; startW: number; startH: number; corner: string; startElX: number; startElY: number } | null>(null);
  const [rotateState, setRotateState] = useState<{ id: string; startAngle: number; elRotation: number; centerX: number; centerY: number } | null>(null);
  const [clipboard, setClipboard] = useState<CanvasElement[]>([]);

  // Eyedropper state
  const [eyedropperColor, setEyedropperColor] = useState<string | null>(null);
  const [eyedropperMode, setEyedropperMode] = useState<"fill" | "stroke" | "text" | null>(null);
  const [eyedropperApplyMode, setEyedropperApplyMode] = useState<"fill" | "stroke" | "text" | null>(null);

  // Formula bar state
  const [formulaBarValue, setFormulaBarValue] = useState("");
  const [editingCellRef, setEditingCellRef] = useState<{ elId: string; row: number; col: number } | null>(null);
  const [showFormulaSuggestions, setShowFormulaSuggestions] = useState(false);

  // Variable preview mode
  const [previewVarsMode, setPreviewVarsMode] = useState(false);

  // Conditional formatting
  const [conditionalRules, setConditionalRules] = useState<ConditionalRule[]>(DEFAULT_CONDITIONAL_RULES);
  const [showConditionalPanel, setShowConditionalPanel] = useState(false);
  // Undo/Redo history
  const historyRef = useRef<PageData[][]>([]);
  const historyIdxRef = useRef(-1);
  const skipHistoryRef = useRef(false);

  const pushHistory = useCallback((snapshot: PageData[]) => {
    if (skipHistoryRef.current) { skipHistoryRef.current = false; return; }
    const h = historyRef.current;
    const idx = historyIdxRef.current;
    // Trim future states
    historyRef.current = h.slice(0, idx + 1);
    historyRef.current.push(JSON.parse(JSON.stringify(snapshot)));
    // Keep max 50 states
    if (historyRef.current.length > 50) historyRef.current.shift();
    historyIdxRef.current = historyRef.current.length - 1;
  }, []);

  // Push initial state
  useEffect(() => {
    if (historyRef.current.length === 0) {
      pushHistory(pages);
    }
  }, []);

  // Track pages changes for history
  const prevPagesRef = useRef<string>("");
  useEffect(() => {
    const serialized = JSON.stringify(pages);
    if (serialized !== prevPagesRef.current) {
      prevPagesRef.current = serialized;
      pushHistory(pages);
    }
  }, [pages, pushHistory]);

  const canUndo = historyIdxRef.current > 0;
  const canRedo = historyIdxRef.current < historyRef.current.length - 1;

  const handleUndo = useCallback(() => {
    if (historyIdxRef.current <= 0) return;
    historyIdxRef.current -= 1;
    const snapshot = historyRef.current[historyIdxRef.current];
    skipHistoryRef.current = true;
    prevPagesRef.current = JSON.stringify(snapshot);
    setPages(JSON.parse(JSON.stringify(snapshot)));
  }, []);

  const handleRedo = useCallback(() => {
    if (historyIdxRef.current >= historyRef.current.length - 1) return;
    historyIdxRef.current += 1;
    const snapshot = historyRef.current[historyIdxRef.current];
    skipHistoryRef.current = true;
    prevPagesRef.current = JSON.stringify(snapshot);
    setPages(JSON.parse(JSON.stringify(snapshot)));
  }, []);
  const [editingTextId, setEditingTextId] = useState<string | null>(null);
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number } | null>(null);
  const [varSearch, setVarSearch] = useState("");
  const [importingPdf, setImportingPdf] = useState(false);
  const [pdfProgress, setPdfProgress] = useState({ current: 0, total: 0, status: "" });
  const [pdfImportSettings, setPdfImportSettings] = useState(() => {
    try {
      const saved = localStorage.getItem("pdf_import_settings");
      if (saved) return JSON.parse(saved) as { scale: number; quality: number; format: "jpeg" | "png" };
    } catch {}
    return { scale: 1.5, quality: 0.85, format: "jpeg" as "jpeg" | "png" };
  });
  const [showPdfSettings, setShowPdfSettings] = useState(false);
  const [pendingPdfFile, setPendingPdfFile] = useState<File | null>(null);
  const [dragPageIdx, setDragPageIdx] = useState<number | null>(null);
  const [dragOverPageIdx, setDragOverPageIdx] = useState<number | null>(null);

  // Custom templates state
  const { templates: customTemplates, loading: loadingCustom, saveTemplate, updateTemplate, deleteTemplate } = useCustomTemplates();
  const [showSaveDialog, setShowSaveDialog] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
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
  // Derive selectedId as first in set for properties panel backward compat
  const selectedId = selectedIds.size > 0 ? [...selectedIds][0] : null;
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
    setSelectedIds(new Set());
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
    setSelectedIds(new Set());
  };

  const deletePage = () => {
    if (pages.length <= 1) { toast.error("O contrato deve ter pelo menos uma página"); return; }
    setPages(prev => prev.filter((_, i) => i !== currentPageIdx));
    setCurrentPageIdx(Math.max(0, currentPageIdx - 1));
    setSelectedIds(new Set());
  };

  const goToPrevPage = () => { if (currentPageIdx > 0) { setCurrentPageIdx(currentPageIdx - 1); setSelectedIds(new Set()); } };
  const goToNextPage = () => { if (currentPageIdx < pages.length - 1) { setCurrentPageIdx(currentPageIdx + 1); setSelectedIds(new Set()); } };

  // --- Element operations ---
  const updateSelected = useCallback((updates: Partial<CanvasElement>) => {
    if (selectedIds.size === 0) return;
    setCurrentElements(prev => prev.map(el => selectedIds.has(el.id) ? { ...el, ...updates } : el));
  }, [selectedIds, setCurrentElements]);

  const handleCanvasMouseDown = (e: React.MouseEvent) => {
    // Only deselect if clicking directly on canvas background, not on elements
    const target = e.target as HTMLElement;
    const isCanvasBg = target === canvasRef.current || target.closest('[data-canvas-bg]') !== null;
    if (!isCanvasBg) return;
    
    
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;
    const x = (e.clientX - rect.left) / zoom;
    const y = (e.clientY - rect.top) / zoom;

    if (activeTool === "shape") {
      const el = createDefaultElement(activeShapeType, x, y);
      setCurrentElements(prev => [...prev, el]);
      setSelectedIds(new Set([el.id]));
      setActiveTool("select");
    } else if (activeTool === "text") {
      const el = createDefaultElement("text", x, y);
      setCurrentElements(prev => [...prev, el]);
      setSelectedIds(new Set([el.id]));
      setEditingTextId(el.id);
      setActiveTool("select");
    } else if (activeTool === "select") {
      setSelectedIds(new Set());
      setEditingTextId(null);
    }
  };

  const handleTableInsert = () => {
    const el = createDefaultElement("table", 100, 200);
    setCurrentElements(prev => [...prev, el]);
    setSelectedIds(new Set([el.id]));
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
      setSelectedIds(new Set([el.id]));
    }
    setContextMenu(null);
  };

  const deleteSelected = () => {
    if (selectedIds.size === 0) return;
    setCurrentElements(prev => prev.filter(e => !selectedIds.has(e.id)));
    setSelectedIds(new Set());
    setContextMenu(null);
  };

  const duplicateSelected = () => {
    if (!selected) return;
    const dup = { ...selected, id: genId(), x: selected.x + 20, y: selected.y + 20, zIndex: elements.length + 1 };
    setCurrentElements(prev => [...prev, dup]);
    setSelectedIds(new Set([dup.id]));
    setContextMenu(null);
  };

  // --- Group / Ungroup ---
  const groupSelected = () => {
    if (selectedIds.size < 2) { toast.error("Selecione pelo menos 2 elementos para agrupar"); return; }
    const gid = `group_${++idCounter}_${Date.now()}`;
    setCurrentElements(prev => prev.map(el => selectedIds.has(el.id) ? { ...el, groupId: gid } : el));
    toast.success(`${selectedIds.size} elementos agrupados`);
    setContextMenu(null);
  };

  const ungroupSelected = () => {
    const selEls = elements.filter(e => selectedIds.has(e.id));
    const groupIds = new Set(selEls.map(e => e.groupId).filter(Boolean));
    if (groupIds.size === 0) { toast.error("Nenhum grupo encontrado na seleção"); return; }
    setCurrentElements(prev => prev.map(el => groupIds.has(el.groupId) ? { ...el, groupId: undefined } : el));
    toast.success("Elementos desagrupados");
    setContextMenu(null);
  };

  const hasGroupInSelection = elements.some(e => selectedIds.has(e.id) && e.groupId);

  // --- Alignment functions ---
  const alignElements = useCallback((alignment: "left" | "center-h" | "right" | "top" | "center-v" | "bottom" | "distribute-h" | "distribute-v") => {
    if (selectedIds.size === 0) return;
    setCurrentElements(prev => {
      const selEls = prev.filter(e => selectedIds.has(e.id));
      if (selEls.length === 0) return prev;

      // If multiple selected, align them relative to each other
      if (selEls.length > 1) {
        switch (alignment) {
          case "left": { const minX = Math.min(...selEls.map(e => e.x)); return prev.map(e => selectedIds.has(e.id) ? { ...e, x: minX } : e); }
          case "right": { const maxR = Math.max(...selEls.map(e => e.x + e.width)); return prev.map(e => selectedIds.has(e.id) ? { ...e, x: maxR - e.width } : e); }
          case "center-h": { const minX = Math.min(...selEls.map(e => e.x)); const maxR = Math.max(...selEls.map(e => e.x + e.width)); const centerX = (minX + maxR) / 2; return prev.map(e => selectedIds.has(e.id) ? { ...e, x: centerX - e.width / 2 } : e); }
          case "top": { const minY = Math.min(...selEls.map(e => e.y)); return prev.map(e => selectedIds.has(e.id) ? { ...e, y: minY } : e); }
          case "bottom": { const maxB = Math.max(...selEls.map(e => e.y + e.height)); return prev.map(e => selectedIds.has(e.id) ? { ...e, y: maxB - e.height } : e); }
          case "center-v": { const minY = Math.min(...selEls.map(e => e.y)); const maxB = Math.max(...selEls.map(e => e.y + e.height)); const centerY = (minY + maxB) / 2; return prev.map(e => selectedIds.has(e.id) ? { ...e, y: centerY - e.height / 2 } : e); }
          case "distribute-h": {
            if (selEls.length < 3) return prev;
            const sorted = [...selEls].sort((a, b) => a.x - b.x);
            const minX = sorted[0].x; const maxX = sorted[sorted.length - 1].x;
            const step = (maxX - minX) / (sorted.length - 1);
            const posMap = new Map(sorted.map((el, i) => [el.id, minX + step * i]));
            return prev.map(el => posMap.has(el.id) ? { ...el, x: posMap.get(el.id)! } : el);
          }
          case "distribute-v": {
            if (selEls.length < 3) return prev;
            const sorted = [...selEls].sort((a, b) => a.y - b.y);
            const minY = sorted[0].y; const maxY = sorted[sorted.length - 1].y;
            const step = (maxY - minY) / (sorted.length - 1);
            const posMap = new Map(sorted.map((el, i) => [el.id, minY + step * i]));
            return prev.map(el => posMap.has(el.id) ? { ...el, y: posMap.get(el.id)! } : el);
          }
        }
      }

      // Single selected: align to canvas
      const sel = selEls[0];
      let updates: Partial<CanvasElement> = {};
      switch (alignment) {
        case "left": updates = { x: 0 }; break;
        case "center-h": updates = { x: (A4_WIDTH - sel.width) / 2 }; break;
        case "right": updates = { x: A4_WIDTH - sel.width }; break;
        case "top": updates = { y: 0 }; break;
        case "center-v": updates = { y: (A4_HEIGHT - sel.height) / 2 }; break;
        case "bottom": updates = { y: A4_HEIGHT - sel.height }; break;
        case "distribute-h":
        case "distribute-v":
          return prev;
      }
      return prev.map(el => el.id === sel.id ? { ...el, ...updates } : el);
    });
  }, [selectedIds, setCurrentElements]);

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
      setSelectedIds(new Set([el.id]));
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

    if (file.size > 50 * 1024 * 1024) {
      toast.error("Arquivo muito grande. Máximo: 50MB");
      return;
    }

    const ext = file.name.split(".").pop()?.toLowerCase();

    // Excel import: convert to table elements
    if (ext === "xlsx" || ext === "xls") {
      try {
        setImportingPdf(true);
        setPdfProgress({ current: 0, total: 0, status: "Lendo planilha Excel..." });
        const XLSX = await import("xlsx");
        const arrayBuffer = await file.arrayBuffer();
        const workbook = XLSX.read(arrayBuffer, { type: "array" });

        const newPages: PageData[] = [];
        const totalSheets = workbook.SheetNames.length;

        for (let si = 0; si < totalSheets; si++) {
          const sheetName = workbook.SheetNames[si];
          setPdfProgress({ current: si, total: totalSheets, status: `Processando aba "${sheetName}" (${si + 1}/${totalSheets})...` });
          const sheet = workbook.Sheets[sheetName];
          const jsonData: string[][] = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "" }) as string[][];

          if (jsonData.length === 0) continue;

          // Split into chunks that fit on A4 pages (~30 rows per page)
          const ROWS_PER_PAGE = 28;
          const maxCols = Math.max(...jsonData.map(r => r.length), 1);
          const colWidth = Math.min(Math.floor((A4_WIDTH - 60) / maxCols), 200);
          const tableWidth = colWidth * maxCols;

          for (let chunk = 0; chunk < jsonData.length; chunk += ROWS_PER_PAGE) {
            const rowsSlice = jsonData.slice(chunk, chunk + ROWS_PER_PAGE);
            const rowHeight = 28;
            const tableHeight = rowsSlice.length * rowHeight;

            // Add sheet name as title on first chunk
            const titleElements: CanvasElement[] = chunk === 0 ? [{
              ...createDefaultElement("text", 30, 20),
              text: sheetName,
              fontSize: 16,
              fontWeight: "bold",
              width: tableWidth,
              height: 30,
            }] : [];

            const tableEl: CanvasElement = {
              ...createDefaultElement("table", 30, chunk === 0 ? 60 : 30),
              width: tableWidth,
              height: tableHeight,
              tableData: rowsSlice.map(r => {
                const row = r.map(c => String(c ?? ""));
                while (row.length < maxCols) row.push("");
                return row;
              }),
              tableRows: rowsSlice.length,
              tableCols: maxCols,
              fontSize: 10,
              stroke: "#333333",
              fill: "#ffffff",
            };

            newPages.push({
              id: pageId(),
              elements: [...titleElements, tableEl],
              backgroundOpacity: 0.5,
            });
          }
        }

        if (newPages.length === 0) {
          toast.error("Nenhuma aba com dados encontrada no Excel");
          return;
        }

        setPages(prev => {
          if (prev.length === 1 && prev[0].elements.length === 0 && !prev[0].backgroundImage) return newPages;
          return [...prev.slice(0, currentPageIdx + 1), ...newPages, ...prev.slice(currentPageIdx + 1)];
        });
        setCurrentPageIdx(pages.length === 1 && pages[0].elements.length === 0 ? 0 : currentPageIdx + 1);
        toast.success(`Excel importado: ${newPages.length} página(s) de ${totalSheets} aba(s)`);
      } catch (err: any) {
        console.error("Excel import error:", err);
        toast.error("Erro ao importar Excel: " + (err?.message || "Verifique o arquivo"));
      } finally {
        setImportingPdf(false);
        setPdfProgress({ current: 0, total: 0, status: "" });
      }
      return;
    }

    setPendingPdfFile(file);
    setShowPdfSettings(true);
  };

  const executePdfImport = async () => {
    if (!pendingPdfFile) return;
    const file = pendingPdfFile;
    const { scale, quality, format } = pdfImportSettings;

    setShowPdfSettings(false);
    try { localStorage.setItem("pdf_import_settings", JSON.stringify(pdfImportSettings)); } catch {}
    setPendingPdfFile(null);
    setImportingPdf(true);
    setPdfProgress({ current: 0, total: 0, status: "Lendo arquivo..." });

    try {
      const arrayBuffer = await file.arrayBuffer();
      setPdfProgress({ current: 0, total: 0, status: "Carregando PDF..." });

      const loadingTask = pdfjsLib.getDocument({ data: arrayBuffer });
      const pdf = await loadingTask.promise;
      const numPages = pdf.numPages;
      const newPages: PageData[] = [];

      setPdfProgress({ current: 0, total: numPages, status: `Processando 0/${numPages} páginas...` });

      for (let i = 1; i <= numPages; i++) {
        setPdfProgress({ current: i - 1, total: numPages, status: `Renderizando página ${i} de ${numPages}...` });

        try {
          const page = await pdf.getPage(i);
          const viewport = page.getViewport({ scale });
          const canvas = document.createElement("canvas");
          canvas.width = viewport.width;
          canvas.height = viewport.height;
          const ctx = canvas.getContext("2d");
          if (!ctx) throw new Error("Canvas context unavailable");

          await page.render({ canvasContext: ctx, viewport, canvas } as any).promise;
          const mimeType = format === "png" ? "image/png" : "image/jpeg";
          const bgImage = format === "png" ? canvas.toDataURL(mimeType) : canvas.toDataURL(mimeType, quality);
          newPages.push({ id: pageId(), elements: [], backgroundImage: bgImage, backgroundOpacity: 0.5 });

          setPdfProgress({ current: i, total: numPages, status: `Página ${i} de ${numPages} concluída` });
        } catch (pageErr) {
          console.warn(`Erro na página ${i}, pulando:`, pageErr);
          newPages.push({ id: pageId(), elements: [], backgroundOpacity: 0.5 });
        }
      }

      if (newPages.length === 0) {
        toast.error("Nenhuma página pôde ser importada do PDF");
        return;
      }

      setPdfProgress({ current: numPages, total: numPages, status: "Finalizando importação..." });

      setPages(prev => {
        if (prev.length === 1 && prev[0].elements.length === 0 && !prev[0].backgroundImage) {
          return newPages;
        }
        return [...prev.slice(0, currentPageIdx + 1), ...newPages, ...prev.slice(currentPageIdx + 1)];
      });

      if (pages.length === 1 && pages[0].elements.length === 0 && !pages[0].backgroundImage) {
        setCurrentPageIdx(0);
      } else {
        setCurrentPageIdx(currentPageIdx + 1);
      }

      toast.success(`PDF importado: ${newPages.length} página${newPages.length > 1 ? "s" : ""} adicionada${newPages.length > 1 ? "s" : ""}`);
    } catch (err: any) {
      console.error("Erro ao importar PDF:", err);
      const msg = err?.message || "";
      if (msg.includes("password")) {
        toast.error("PDF protegido por senha. Remova a proteção antes de importar.");
      } else if (msg.includes("Invalid PDF")) {
        toast.error("Arquivo PDF inválido ou corrompido.");
      } else {
        toast.error("Erro ao importar PDF: " + (msg || "Tente novamente com outro arquivo."));
      }
    } finally {
      setImportingPdf(false);
      setPdfProgress({ current: 0, total: 0, status: "" });
    }
  };

  // --- Drag & Resize ---
  const handleElementMouseDown = (e: React.MouseEvent, el: CanvasElement) => {
    // Eyedropper mode: pick or apply color
    if (activeTool === "eyedropper") {
      e.stopPropagation();
      if (!eyedropperColor) {
        // Pick color from element - show menu to choose which color
        const colors = { fill: el.fill, stroke: el.stroke, text: el.color };
        // Auto-pick: prefer text color for text elements, fill for shapes
        const picked = el.type === "text" ? colors.text : (colors.fill !== "transparent" ? colors.fill : colors.stroke);
        setEyedropperColor(picked);
        toast.success(`Cor copiada: ${picked}`);
      } else {
        // Apply color to element
        if (eyedropperApplyMode === "stroke") {
          setCurrentElements(prev => prev.map(e => e.id === el.id ? { ...e, stroke: eyedropperColor! } : e));
          toast.success("Cor aplicada à borda");
        } else if (eyedropperApplyMode === "text") {
          setCurrentElements(prev => prev.map(e => e.id === el.id ? { ...e, color: eyedropperColor! } : e));
          toast.success("Cor aplicada ao texto");
        } else {
          setCurrentElements(prev => prev.map(e => e.id === el.id ? { ...e, fill: eyedropperColor! } : e));
          toast.success("Cor aplicada ao fundo");
        }
        setEyedropperColor(null);
        setEyedropperApplyMode(null);
        setActiveTool("select");
      }
      return;
    }

    if (activeTool !== "select") return;
    e.stopPropagation();
    setEditingTextId(null);

    // Ctrl+click (or Cmd on Mac): toggle multi-select
    if (e.ctrlKey || e.metaKey) {
      setSelectedIds(prev => {
        const next = new Set(prev);
        if (next.has(el.id)) { next.delete(el.id); } else { next.add(el.id); }
        return next;
      });
      return;
    }

    // Shift+click: also supports multi-select
    if (e.shiftKey) {
      setSelectedIds(prev => {
        const next = new Set(prev);
        if (next.has(el.id)) { next.delete(el.id); } else { next.add(el.id); }
        return next;
      });
      return;
    }

    // If element is in a group, select all group members
    if (el.groupId) {
      const groupEls = elements.filter(e => e.groupId === el.groupId);
      const groupIds = new Set(groupEls.map(e => e.id));
      if (!selectedIds.has(el.id)) {
        setSelectedIds(groupIds);
      }
    } else if (!selectedIds.has(el.id)) {
      setSelectedIds(new Set([el.id]));
    }

    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;

    // Build origins for all selected elements (including the clicked one)
    const currentSelected = el.groupId 
      ? new Set(elements.filter(e => e.groupId === el.groupId).map(e => e.id))
      : selectedIds.has(el.id) ? selectedIds : new Set([el.id]);
    const idsToMove = [...currentSelected];
    const origins: Record<string, { x: number; y: number }> = {};
    for (const id of idsToMove) {
      const found = elements.find(e => e.id === id);
      if (found) origins[id] = { x: found.x, y: found.y };
    }
    if (!origins[el.id]) origins[el.id] = { x: el.x, y: el.y };
    setDragState({ ids: idsToMove, startX: e.clientX, startY: e.clientY, origins });
  };

  const handleResizeMouseDown = (e: React.MouseEvent, el: CanvasElement, corner: string) => {
    e.stopPropagation();
    e.preventDefault();
    setResizeState({ id: el.id, startX: e.clientX, startY: e.clientY, startW: el.width, startH: el.height, corner, startElX: el.x, startElY: el.y } as any);
  };

  const handleRotateMouseDown = (e: React.MouseEvent, el: CanvasElement) => {
    e.stopPropagation();
    e.preventDefault();
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;
    const centerX = rect.left + (el.x + el.width / 2) * zoom;
    const centerY = rect.top + (el.y + el.height / 2) * zoom;
    const startAngle = Math.atan2(e.clientY - centerY, e.clientX - centerX) * (180 / Math.PI);
    setRotateState({ id: el.id, startAngle, elRotation: el.rotation, centerX, centerY });
  };

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (dragState) {
        const dx = (e.clientX - dragState.startX) / zoom;
        const dy = (e.clientY - dragState.startY) / zoom;
        setCurrentElements(prev => prev.map(el => {
          const origin = dragState.origins[el.id];
          if (!origin) return el;
          return { ...el, x: origin.x + dx, y: origin.y + dy };
        }));
      }
      if (resizeState) {
        const dx = (e.clientX - resizeState.startX) / zoom;
        const dy = (e.clientY - resizeState.startY) / zoom;
        setCurrentElements(prev => prev.map(el => {
          if (el.id !== resizeState.id) return el;
          const c = resizeState.corner;
          let newX = resizeState.startElX;
          let newY = resizeState.startElY;
          let newW = resizeState.startW;
          let newH = resizeState.startH;

          if (c.includes("e")) newW = Math.max(20, resizeState.startW + dx);
          if (c.includes("s")) newH = Math.max(10, resizeState.startH + dy);
          if (c.includes("w")) { newW = Math.max(20, resizeState.startW - dx); newX = resizeState.startElX + (resizeState.startW - newW); }
          if (c.includes("n")) { newH = Math.max(10, resizeState.startH - dy); newY = resizeState.startElY + (resizeState.startH - newH); }

          return { ...el, x: newX, y: newY, width: newW, height: newH };
        }));
      }
      if (rotateState) {
        const angle = Math.atan2(e.clientY - rotateState.centerY, e.clientX - rotateState.centerX) * (180 / Math.PI);
        let newRotation = rotateState.elRotation + (angle - rotateState.startAngle);
        if (e.shiftKey) newRotation = Math.round(newRotation / 15) * 15;
        setCurrentElements(prev => prev.map(el =>
          el.id === rotateState.id ? { ...el, rotation: newRotation } : el
        ));
      }
    };
    const handleMouseUp = () => {
      if (dragState) setDragState(null);
      if (resizeState) setResizeState(null);
      if (rotateState) setRotateState(null);
    };
    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);
    return () => { window.removeEventListener("mousemove", handleMouseMove); window.removeEventListener("mouseup", handleMouseUp); };
  }, [dragState, resizeState, rotateState, zoom, setCurrentElements]);

  useEffect(() => {
    if (!contextMenu) return;
    const handler = () => setContextMenu(null);
    window.addEventListener("click", handler);
    return () => window.removeEventListener("click", handler);
  }, [contextMenu]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (editingTextId) return;

      if (e.key === "Delete" || e.key === "Backspace") {
        if (selectedIds.size > 0) { e.preventDefault(); deleteSelected(); }
      }

      // Copy
      if ((e.ctrlKey || e.metaKey) && e.key === "c") {
        const selEls = elements.filter(el => selectedIds.has(el.id));
        if (selEls.length > 0) { e.preventDefault(); setClipboard(selEls.map(el => ({ ...el }))); toast.success(`${selEls.length} elemento(s) copiado(s)`); }
      }

      // Paste
      if ((e.ctrlKey || e.metaKey) && e.key === "v") {
        if (clipboard.length > 0) {
          e.preventDefault();
          const newIds = new Set<string>();
          const dups = clipboard.map(el => {
            const dup = { ...el, id: genId(), x: el.x + 20, y: el.y + 20, zIndex: elements.length + 1 };
            newIds.add(dup.id);
            return dup;
          });
          setCurrentElements(prev => [...prev, ...dups]);
          setSelectedIds(newIds);
          toast.success(`${dups.length} elemento(s) colado(s)`);
        }
      }

      // Select all
      if ((e.ctrlKey || e.metaKey) && e.key === "a") {
        e.preventDefault();
        setSelectedIds(new Set(elements.map(el => el.id)));
      }

      // Arrow keys: move (normal) or resize (Shift)
      if (["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(e.key) && selectedIds.size > 0) {
        e.preventDefault();
        const step = e.ctrlKey || e.metaKey ? 10 : 1;
        const dx = e.key === "ArrowLeft" ? -step : e.key === "ArrowRight" ? step : 0;
        const dy = e.key === "ArrowUp" ? -step : e.key === "ArrowDown" ? step : 0;
        if (e.shiftKey) {
          setCurrentElements(prev => prev.map(el => selectedIds.has(el.id) ? { ...el, width: Math.max(20, el.width + dx), height: Math.max(10, el.height + dy) } : el));
        } else {
          setCurrentElements(prev => prev.map(el => selectedIds.has(el.id) ? { ...el, x: el.x + dx, y: el.y + dy } : el));
        }
      }

      // Undo / Redo
      if ((e.ctrlKey || e.metaKey) && e.key === "z") { e.preventDefault(); handleUndo(); }
      if ((e.ctrlKey || e.metaKey) && e.key === "y") { e.preventDefault(); handleRedo(); }
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
        const rotateStyle = el.rotation ? `transform:rotate(${el.rotation}deg);transform-origin:center center;` : "";
        const baseStyle = `position:absolute;left:${el.x}px;top:${el.y}px;width:${el.width}px;height:${el.height}px;z-index:${el.zIndex};${rotateStyle}`;
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

  const [exportingXlsx, setExportingXlsx] = useState(false);

  const handleExportXlsx = async () => {
    setExportingXlsx(true);
    try {
      const XLSX = await import("xlsx");
      const wb = XLSX.utils.book_new();

      for (let pageIdx = 0; pageIdx < pages.length; pageIdx++) {
        const page = pages[pageIdx];
        const sortedEls = [...page.elements].sort((a, b) => a.y - b.y || a.x - b.x);
        const rows: string[][] = [];

        for (const el of sortedEls) {
          if (el.type === "table" && el.tableData) {
            for (const row of el.tableData) {
              rows.push([...row]);
            }
            rows.push([]); // blank separator
          } else if (el.type === "text" && el.text?.trim()) {
            rows.push([el.text]);
          } else if ((el.type === "rect" || el.type === "circle") && el.text?.trim()) {
            rows.push([el.text]);
          }
        }

        if (rows.length === 0) rows.push(["(Página vazia)"]);
        const ws = XLSX.utils.aoa_to_sheet(rows);
        XLSX.utils.book_append_sheet(wb, ws, `Página ${pageIdx + 1}`);
      }

      XLSX.writeFile(wb, "contrato.xlsx");
      toast.success("Excel exportado com sucesso!");
    } catch (err) {
      console.error("Export XLSX error:", err);
      toast.error("Erro ao exportar Excel");
    } finally {
      setExportingXlsx(false);
    }
  };

  const filteredVars = variables
    .filter(v => !varSearch || v.var.toLowerCase().includes(varSearch.toLowerCase()) || v.desc.toLowerCase().includes(varSearch.toLowerCase()))
    .sort((a, b) => a.var.localeCompare(b.var));

  // --- Render helpers ---
  const renderElement = (el: CanvasElement) => {
    const isSelected = selectedIds.has(el.id);
    const isPrimary = selectedId === el.id; // primary = first in set, shows resize/rotate handles
    const isEditing = el.id === editingTextId;

    // Outer wrapper handles positioning, selection outline, and resize handles
    const isGrouped = !!el.groupId;
    const groupColor = isGrouped ? `hsl(${(el.groupId!.charCodeAt(6) * 37) % 360} 70% 55%)` : "";
    const wrapperStyle: React.CSSProperties = {
      position: "absolute", left: el.x, top: el.y, width: el.width, height: el.height,
      outline: isSelected 
        ? `2px ${isPrimary ? "solid" : "dashed"} hsl(210 80% 55%)` 
        : isGrouped ? `1px dashed ${groupColor}` : "none",
      outlineOffset: "1px",
      opacity: el.opacity ?? 1,
      transform: el.rotation ? `rotate(${el.rotation}deg)` : undefined,
      transformOrigin: "center center",
    };

    // Inner style fills the wrapper — no position/size needed
    const innerStyle: React.CSSProperties = {
      width: "100%", height: "100%", boxSizing: "border-box",
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
        {(() => {
          const displayText = previewVarsMode ? replaceVariablesWithSample(el.text) : el.text;
          // Check if preview replaced a variable with an HTML table
          if (previewVarsMode && displayText && displayText.includes("<table")) {
            return <div dangerouslySetInnerHTML={{ __html: displayText }} style={{ width: "100%", overflow: "hidden" }} />;
          }
          return displayText || (el.type === "text" ? <span className="text-muted-foreground/40 italic text-xs">Duplo clique para editar</span> : null);
        })()}
      </div>
    );

    const resizeHandles = isPrimary ? (
      <>
        {/* Rotation handle */}
        <div
          style={{
            position: "absolute", top: -32, left: "50%", transform: "translateX(-50%)",
            width: 18, height: 18, borderRadius: "50%",
            background: "hsl(150 60% 45%)", border: "2px solid white",
            cursor: "grab", zIndex: 9999,
            display: "flex", alignItems: "center", justifyContent: "center",
          }}
          onMouseDown={e => handleRotateMouseDown(e, el)}
          title="Arrastar para rotacionar"
        >
          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3" strokeLinecap="round">
            <path d="M21 12a9 9 0 1 1-3-6.7" />
            <path d="M21 3v5h-5" />
          </svg>
        </div>
        {/* Line connecting rotation handle */}
        <div style={{ position: "absolute", top: -14, left: "50%", transform: "translateX(-50%)", width: 1, height: 14, background: "hsl(150 60% 45%)", zIndex: 9998 }} />

        {/* Corner handles */}
        {["se", "sw", "nw", "ne"].map(corner => {
          const pos: React.CSSProperties = {
            position: "absolute", width: 10, height: 10, background: "hsl(210 80% 55%)",
            border: "1px solid white", borderRadius: 2, zIndex: 9999,
            ...(corner.includes("s") ? { bottom: -5 } : { top: -5 }),
            ...(corner.includes("e") ? { right: -5 } : { left: -5 }),
            cursor: corner === "se" || corner === "nw" ? "nwse-resize" : "nesw-resize",
          };
          return <div key={corner} style={pos} onMouseDown={e => handleResizeMouseDown(e, el, corner)} />;
        })}
        {/* Edge handles */}
        {[
          { key: "n", style: { top: -4, left: "50%", transform: "translateX(-50%)", width: 24, height: 8, cursor: "ns-resize" } as React.CSSProperties },
          { key: "s", style: { bottom: -4, left: "50%", transform: "translateX(-50%)", width: 24, height: 8, cursor: "ns-resize" } as React.CSSProperties },
          { key: "e", style: { right: -4, top: "50%", transform: "translateY(-50%)", width: 8, height: 24, cursor: "ew-resize" } as React.CSSProperties },
          { key: "w", style: { left: -4, top: "50%", transform: "translateY(-50%)", width: 8, height: 24, cursor: "ew-resize" } as React.CSSProperties },
        ].map(({ key, style }) => (
          <div key={key} style={{ position: "absolute", background: "hsl(210 80% 55%)", border: "1px solid white", borderRadius: 2, zIndex: 9999, ...style }} onMouseDown={e => handleResizeMouseDown(e, el, key)} />
        ))}
      </>
    ) : null;

    let innerContent: React.ReactNode;
    switch (el.type) {
      case "rect":
        innerContent = <div style={{ ...innerStyle, background: el.fill, border: `${el.strokeWidth}px solid ${el.stroke}`, borderRadius: el.borderRadius }} onDoubleClick={handleDoubleClick}>{textContent}</div>;
        break;
      case "circle":
        innerContent = <div style={{ ...innerStyle, background: el.fill, border: `${el.strokeWidth}px solid ${el.stroke}`, borderRadius: "50%", overflow: "hidden" }} onDoubleClick={handleDoubleClick}>{textContent}</div>;
        break;
      case "line":
        innerContent = <div style={{ ...innerStyle, borderTop: `${el.strokeWidth}px solid ${el.stroke}` }} />;
        break;
      case "text":
        innerContent = <div style={innerStyle} onDoubleClick={handleDoubleClick}>{textContent}</div>;
        break;
      case "image":
        innerContent = (
          <div style={{ ...innerStyle, overflow: "hidden", border: isSelected ? undefined : "1px dashed #ccc" }}>
            {el.imageUrl ? <img src={el.imageUrl} alt="" style={{ width: "100%", height: "100%", objectFit: "contain" }} draggable={false} /> : <div className="flex h-full w-full items-center justify-center text-xs text-muted-foreground">Imagem</div>}
          </div>
        );
        break;
      case "table":
        if (el.tableData) {
          const colW = el.width / (el.tableData[0]?.length || 1);
          const rowH = el.height / el.tableData.length;
          innerContent = (
            <div style={{ ...innerStyle, overflow: "hidden" }}>
              <table style={{ width: "100%", height: "100%", borderCollapse: "collapse", fontFamily: el.fontFamily, fontSize: el.fontSize, color: el.color, tableLayout: "fixed" }}>
                <tbody>
                  {el.tableData.map((row, ri) => (
                    <tr key={ri}>
                      {row.map((cell, ci) => {
                        const displayValue = isFormula(cell) ? evaluateCell(cell, el.tableData || []) : cell;
                        const previewValue = previewVarsMode ? replaceVariablesWithSample(displayValue) : displayValue;
                        const condStyle = getConditionalStyle(previewValue, conditionalRules, ri === 0);
                        return (
                          <td key={ci} style={{
                            border: `1px solid ${el.stroke}`,
                            padding: "2px 6px",
                            background: condStyle?.backgroundColor || (ri === 0 ? el.stroke : el.fill),
                            color: condStyle?.color || (ri === 0 ? "#ffffff" : el.color),
                            fontWeight: condStyle?.fontWeight as any || (ri === 0 ? "bold" : "normal"),
                            textAlign: el.textAlign as any,
                            verticalAlign: "middle",
                            transition: "background 0.2s, color 0.2s",
                          }}>
                            <input
                              type="text"
                              value={previewValue}
                              onChange={e => updateTableCell(el.id, ri, ci, e.target.value)}
                              onClick={e => {
                                e.stopPropagation();
                                setEditingCellRef({ elId: el.id, row: ri, col: ci });
                                setFormulaBarValue(cell);
                                setShowFormulaSuggestions(false);
                              }}
                              onFocus={() => {
                                setEditingCellRef({ elId: el.id, row: ri, col: ci });
                                setFormulaBarValue(cell);
                              }}
                              title={isFormula(cell) ? `Fórmula: ${cell}` : condStyle ? "Formatação condicional aplicada" : undefined}
                              style={{
                                width: "100%", border: "none", outline: "none",
                                background: isFormula(cell) && !condStyle ? "hsl(var(--accent) / 0.3)" : "transparent",
                                color: "inherit", fontFamily: "inherit",
                                fontSize: "inherit", fontWeight: "inherit", textAlign: "inherit",
                                padding: 0,
                              }}
                            />
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          );
        }
        break;
    }

    // Wrapper: positions element, captures mouse events, and renders handles OUTSIDE inner content
    return (
      <div
        key={el.id}
        style={wrapperStyle}
        onMouseDown={e => handleElementMouseDown(e, el)}
        onClick={e => e.stopPropagation()}
      >
        {innerContent}
        {resizeHandles}
      </div>
    );
  };

  const renderPropertiesPanel = () => {
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
            <h3 className="font-semibold text-sm text-foreground">
              Propriedades {selectedIds.size > 1 ? `(${selectedIds.size} selecionados)` : ""}
            </h3>
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
      </div>
    );
  };

  const applyTemplate = (tpl: ContractTemplate) => {
    setPages(tpl.pages.map(p => ({ ...p, id: pageId(), elements: p.elements.map(e => ({ ...e, id: genId() })) })));
    setCurrentPageIdx(0);
    setSelectedIds(new Set());
    setShowTemplates(false);
    if (tpl.id !== "em-branco") toast.success(`Template "${tpl.name}" aplicado!`);
  };

  const applyCustomTemplate = (ct: CustomTemplate) => {
    const pagesData = ct.pages_data as PageData[];
    setPages(pagesData.map(p => ({ ...p, id: pageId(), elements: (p.elements || []).map(e => ({ ...e, id: genId() })) })));
    setCurrentPageIdx(0);
    setSelectedIds(new Set());
    setShowTemplates(false);
    toast.success(`Template "${ct.name}" carregado!`);
  };

  const handleSaveAsTemplate = async () => {
    if (!saveTemplateName.trim()) {
      toast.error("Informe um nome para o template");
      return;
    }
    try {
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
      // Always close dialog and reset
      setShowSaveDialog(false);
      setSaveTemplateName("");
      setSaveTemplateDesc("");
      setOverwriteTemplateId(null);
      if (!ok) {
        toast.error("Não foi possível salvar o template. Verifique se a tabela existe no banco.");
      }
    } catch (err) {
      setShowSaveDialog(false);
      setSaveTemplateName("");
      setSaveTemplateDesc("");
      setOverwriteTemplateId(null);
      toast.error("Erro inesperado ao salvar template");
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
      setSelectedIds(new Set([el.id]));
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
    <div className="flex flex-col h-full min-h-0">
      <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleFileChange} />
      <input ref={pdfInputRef} type="file" accept=".pdf,.docx,.doc,.xlsx,.xls" className="hidden" onChange={handlePdfFileChange} />
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
        onUndo={handleUndo} onRedo={handleRedo} canUndo={canUndo} canRedo={canRedo}
        onImageUpload={handleImageUpload}
        onTableInsert={handleTableInsert}
        onBack={() => setShowTemplates(true)}
        eyedropperColor={eyedropperColor}
        eyedropperMode={eyedropperMode}
        onEyedropperClick={() => {
          if (activeTool === "eyedropper") {
            setActiveTool("select");
            setEyedropperColor(null);
            setEyedropperApplyMode(null);
          } else {
            setActiveTool("eyedropper");
            setEyedropperColor(null);
            setEyedropperApplyMode(null);
            toast.info("Conta-gotas ativo: clique em um elemento para copiar a cor");
          }
        }}
      />

      {/* Formula bar - shown when a table is selected */}
      {selected?.type === "table" && (
        <div className="flex items-center gap-2 border-x border-b border-border bg-background px-3 py-1">
          <span className="text-xs font-mono font-bold text-muted-foreground w-10 text-center shrink-0">
            {editingCellRef ? `${indexToCol(editingCellRef.col)}${editingCellRef.row + 1}` : "fx"}
          </span>
          <div className="h-5 w-px bg-border" />
          <span className="text-xs font-semibold text-muted-foreground italic shrink-0">fx</span>
          <div className="relative flex-1">
            <Input
              value={formulaBarValue}
              onChange={e => {
                setFormulaBarValue(e.target.value);
                setShowFormulaSuggestions(e.target.value.startsWith("="));
                if (editingCellRef) {
                  updateTableCell(editingCellRef.elId, editingCellRef.row, editingCellRef.col, e.target.value);
                }
              }}
              onKeyDown={e => {
                if (e.key === "Enter") {
                  setShowFormulaSuggestions(false);
                  if (editingCellRef && formulaBarValue.startsWith("=")) {
                    const result = evaluateCell(formulaBarValue, selected?.tableData || []);
                    toast.success(`Resultado: ${result}`);
                  }
                }
                if (e.key === "Escape") setShowFormulaSuggestions(false);
              }}
              placeholder={editingCellRef ? "Digite um valor ou fórmula (ex: =SUM(A1:A5))" : "Selecione uma célula da tabela"}
              className="h-7 text-xs font-mono"
            />
            {showFormulaSuggestions && formulaBarValue.startsWith("=") && (
              <div className="absolute top-full left-0 right-0 z-50 mt-1 max-h-[200px] overflow-y-auto rounded-md border border-border bg-popover shadow-lg">
                {SUPPORTED_FORMULAS
                  .filter(f => f.name.toLowerCase().includes(formulaBarValue.substring(1).split("(")[0].toLowerCase()) || formulaBarValue.length <= 1)
                  .map(f => (
                    <button
                      key={f.name}
                      className="w-full px-3 py-1.5 text-left hover:bg-accent flex items-center gap-3"
                      onClick={() => {
                        setFormulaBarValue(`=${f.syntax}`);
                        setShowFormulaSuggestions(false);
                        if (editingCellRef) {
                          updateTableCell(editingCellRef.elId, editingCellRef.row, editingCellRef.col, `=${f.syntax}`);
                        }
                      }}
                    >
                      <span className="text-xs font-mono font-bold text-primary">{f.name}</span>
                      <span className="text-[10px] text-muted-foreground flex-1">{f.desc}</span>
                      <span className="text-[10px] font-mono text-muted-foreground/60">{f.syntax}</span>
                    </button>
                  ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Conditional Formatting Panel */}
      {showConditionalPanel && (
        <div className="border-x border-b border-border bg-background px-3 py-2 space-y-2">
          <div className="flex items-center justify-between">
            <h4 className="text-xs font-semibold text-foreground flex items-center gap-1.5">
              <Palette className="h-3.5 w-3.5 text-primary" /> Formatação Condicional
            </h4>
            <div className="flex items-center gap-1">
              <Button variant="outline" size="sm" className="h-6 text-[10px]" onClick={() => {
                setConditionalRules(prev => [...prev, {
                  id: `rule_${Date.now()}`, type: "greater", value1: "5000",
                  bgColor: "#dbeafe", textColor: "#1e40af", bold: false,
                }]);
              }}>+ Regra</Button>
              <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => setShowConditionalPanel(false)}>
                <X className="h-3 w-3" />
              </Button>
            </div>
          </div>
          <div className="space-y-1.5 max-h-[160px] overflow-y-auto">
            {conditionalRules.map((rule, idx) => (
              <div key={rule.id} className="flex items-center gap-2 text-[11px] bg-muted/30 rounded px-2 py-1.5">
                <select
                  value={rule.type}
                  onChange={e => {
                    const updated = [...conditionalRules];
                    updated[idx] = { ...rule, type: e.target.value as ConditionalRule["type"] };
                    setConditionalRules(updated);
                  }}
                  className="rounded border border-border bg-background px-1.5 py-0.5 text-[11px] w-24"
                >
                  <option value="greater">Maior que</option>
                  <option value="less">Menor que</option>
                  <option value="equal">Igual a</option>
                  <option value="between">Entre</option>
                  <option value="text_contains">Contém texto</option>
                  <option value="text_starts">Começa com</option>
                  <option value="empty">Vazio</option>
                  <option value="not_empty">Não vazio</option>
                </select>
                {!["empty", "not_empty"].includes(rule.type) && (
                  <input
                    type="text" value={rule.value1}
                    onChange={e => {
                      const updated = [...conditionalRules];
                      updated[idx] = { ...rule, value1: e.target.value };
                      setConditionalRules(updated);
                    }}
                    className="w-20 rounded border border-border bg-background px-1.5 py-0.5 text-[11px]"
                    placeholder="Valor"
                  />
                )}
                {rule.type === "between" && (
                  <>
                    <span className="text-muted-foreground">e</span>
                    <input
                      type="text" value={rule.value2 || ""}
                      onChange={e => {
                        const updated = [...conditionalRules];
                        updated[idx] = { ...rule, value2: e.target.value };
                        setConditionalRules(updated);
                      }}
                      className="w-20 rounded border border-border bg-background px-1.5 py-0.5 text-[11px]"
                      placeholder="Valor 2"
                    />
                  </>
                )}
                <div className="flex items-center gap-1 ml-auto">
                  <label className="text-[10px] text-muted-foreground">Fundo</label>
                  <input type="color" value={rule.bgColor} onChange={e => {
                    const updated = [...conditionalRules];
                    updated[idx] = { ...rule, bgColor: e.target.value };
                    setConditionalRules(updated);
                  }} className="h-5 w-5 cursor-pointer rounded border border-border" />
                  <label className="text-[10px] text-muted-foreground">Texto</label>
                  <input type="color" value={rule.textColor} onChange={e => {
                    const updated = [...conditionalRules];
                    updated[idx] = { ...rule, textColor: e.target.value };
                    setConditionalRules(updated);
                  }} className="h-5 w-5 cursor-pointer rounded border border-border" />
                  <label className="flex items-center gap-0.5 text-[10px] text-muted-foreground">
                    <input type="checkbox" checked={rule.bold || false} onChange={e => {
                      const updated = [...conditionalRules];
                      updated[idx] = { ...rule, bold: e.target.checked };
                      setConditionalRules(updated);
                    }} className="h-3 w-3" />
                    <strong>N</strong>
                  </label>
                  <Button variant="ghost" size="icon" className="h-5 w-5" onClick={() => {
                    setConditionalRules(prev => prev.filter(r => r.id !== rule.id));
                  }}>
                    <Trash2 className="h-3 w-3 text-destructive" />
                  </Button>
                </div>
              </div>
            ))}
            {conditionalRules.length === 0 && (
              <p className="text-[11px] text-muted-foreground text-center py-2">Nenhuma regra. Clique em "+ Regra" para adicionar.</p>
            )}
          </div>
        </div>
      )}


      {/* Eyedropper apply mode bar */}
      {eyedropperColor && (
        <div className="flex items-center gap-2 border-x border-b border-border bg-accent/30 px-3 py-1">
          <span className="h-5 w-5 rounded border border-border shrink-0" style={{ backgroundColor: eyedropperColor }} />
          <span className="text-xs text-foreground">Cor copiada: <span className="font-mono font-bold">{eyedropperColor}</span></span>
          <span className="text-xs text-muted-foreground">Aplicar como:</span>
          <Button variant={eyedropperApplyMode === "fill" || !eyedropperApplyMode ? "secondary" : "ghost"} size="sm" className="h-6 text-[10px]" onClick={() => setEyedropperApplyMode("fill")}>Fundo</Button>
          <Button variant={eyedropperApplyMode === "stroke" ? "secondary" : "ghost"} size="sm" className="h-6 text-[10px]" onClick={() => setEyedropperApplyMode("stroke")}>Borda</Button>
          <Button variant={eyedropperApplyMode === "text" ? "secondary" : "ghost"} size="sm" className="h-6 text-[10px]" onClick={() => setEyedropperApplyMode("text")}>Texto</Button>
          <span className="text-xs text-muted-foreground">— Clique em um elemento</span>
          <Button variant="ghost" size="sm" className="h-6 text-[10px] text-destructive" onClick={() => { setEyedropperColor(null); setEyedropperApplyMode(null); setActiveTool("select"); }}>✕ Cancelar</Button>
        </div>
      )}

      {/* Action bar */}
      <div className="flex items-center flex-wrap gap-1.5 border-x border-border bg-muted/20 px-3 py-1.5">
        {/* Zoom */}
        <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0" onClick={() => setZoom(z => Math.max(0.25, z - 0.1))} title="Diminuir zoom"><ZoomOut className="h-4 w-4" /></Button>
        <span className="text-xs text-muted-foreground w-12 text-center shrink-0 font-medium">{Math.round(zoom * 100)}%</span>
        <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0" onClick={() => setZoom(z => Math.min(2, z + 0.1))} title="Aumentar zoom"><ZoomIn className="h-4 w-4" /></Button>
        <Separator orientation="vertical" className="mx-1 h-6" />

        {/* Páginas */}
        <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0" onClick={goToPrevPage} disabled={currentPageIdx === 0} title="Página anterior"><ChevronLeft className="h-4 w-4" /></Button>
        <span className="text-xs text-foreground font-semibold shrink-0 min-w-[60px] text-center" title={`Página ${currentPageIdx + 1} de ${pages.length}`}>Pág. {currentPageIdx + 1}/{pages.length}</span>
        <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0" onClick={goToNextPage} disabled={currentPageIdx >= pages.length - 1} title="Próxima página"><ChevronRight className="h-4 w-4" /></Button>
        <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0" onClick={addPage} title="Adicionar página"><Plus className="h-4 w-4" /></Button>
        <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0" onClick={duplicatePage} title="Duplicar página"><Copy className="h-4 w-4" /></Button>
        <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0 text-destructive" onClick={deletePage} disabled={pages.length <= 1} title="Excluir página"><Trash2 className="h-4 w-4" /></Button>
        <Separator orientation="vertical" className="mx-1 h-6" />

        {/* Importar / Logo / Template */}
        <Button variant="ghost" size="sm" className="h-8 gap-1.5 text-xs shrink-0" onClick={handlePdfImport} disabled={importingPdf} title="Importar PDF, DOCX ou Excel">
          <FileUp className="h-4 w-4" /> {importingPdf ? "Importando..." : "Importar"}
        </Button>
        <Button variant="ghost" size="sm" className="h-8 gap-1.5 text-xs shrink-0" onClick={handleInsertCompanyLogo} title="Inserir logo da empresa">
          <ImageIcon className="h-4 w-4" /> Logo
        </Button>
        <Button variant="ghost" size="sm" className="h-8 gap-1.5 text-xs shrink-0" onClick={() => setShowSaveDialog(true)} title="Salvar como Template">
          <BookmarkPlus className="h-4 w-4" /> Salvar Template
        </Button>

        {/* Alinhamento (condicional) */}
        {selectedIds.size > 0 && (
          <>
            <Separator orientation="vertical" className="mx-1 h-6" />
            <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0" onClick={() => alignElements("left")} title="Alinhar à esquerda"><AlignHorizontalJustifyStart className="h-4 w-4" /></Button>
            <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0" onClick={() => alignElements("center-h")} title="Centralizar horizontalmente"><AlignHorizontalJustifyCenter className="h-4 w-4" /></Button>
            <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0" onClick={() => alignElements("right")} title="Alinhar à direita"><AlignHorizontalJustifyEnd className="h-4 w-4" /></Button>
            <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0" onClick={() => alignElements("top")} title="Alinhar ao topo"><AlignVerticalJustifyStart className="h-4 w-4" /></Button>
            <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0" onClick={() => alignElements("center-v")} title="Centralizar verticalmente"><AlignVerticalJustifyCenter className="h-4 w-4" /></Button>
            <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0" onClick={() => alignElements("bottom")} title="Alinhar abaixo"><AlignVerticalJustifyEnd className="h-4 w-4" /></Button>
            {elements.length >= 3 && (
              <>
                <Separator orientation="vertical" className="mx-1 h-6" />
                <Button variant="ghost" size="sm" className="h-8 text-[11px] shrink-0" onClick={() => alignElements("distribute-h")} title="Distribuir horizontalmente">Dist. H</Button>
                <Button variant="ghost" size="sm" className="h-8 text-[11px] shrink-0" onClick={() => alignElements("distribute-v")} title="Distribuir verticalmente">Dist. V</Button>
              </>
            )}
          </>
        )}

        <div className="flex-1" />

        {/* Preview variables toggle */}
        <Button
          variant={previewVarsMode ? "default" : "outline"}
          size="sm"
          className="h-8 gap-1.5 text-xs shrink-0"
          onClick={() => setPreviewVarsMode(!previewVarsMode)}
          title={previewVarsMode ? "Ocultar dados de exemplo" : "Mostrar dados de exemplo nas variáveis"}
        >
          {previewVarsMode ? <ToggleRight className="h-4 w-4" /> : <ToggleLeft className="h-4 w-4" />}
          {previewVarsMode ? "Vars: ON" : "Vars: OFF"}
        </Button>

        {/* Conditional formatting toggle */}
        <Button
          variant={showConditionalPanel ? "default" : "outline"}
          size="sm"
          className="h-8 gap-1.5 text-xs shrink-0"
          onClick={() => setShowConditionalPanel(!showConditionalPanel)}
          title="Formatação condicional das tabelas"
        >
          <Palette className="h-4 w-4" /> Format. Cond.
        </Button>

        {/* Ações finais */}
        <Button variant="outline" size="sm" className="h-8 gap-1.5 text-xs shrink-0" onClick={() => setShowPreview(true)} title="Visualizar preview do contrato">
          <Eye className="h-4 w-4" /> Preview
        </Button>
        <Button variant="outline" size="sm" className="h-8 gap-1.5 text-xs shrink-0" onClick={handleExportPdf} disabled={exporting} title="Exportar como PDF">
          <Download className="h-4 w-4" /> PDF
        </Button>
        <Button variant="outline" size="sm" className="h-8 gap-1.5 text-xs shrink-0" onClick={handleExportDocx} disabled={exportingDocx} title="Exportar como DOCX (Word)">
          <FileText className="h-4 w-4" /> DOCX
        </Button>
        <Button variant="outline" size="sm" className="h-8 gap-1.5 text-xs shrink-0" onClick={handleExportXlsx} disabled={exportingXlsx} title="Exportar como Excel (.xlsx)">
          <FileSpreadsheet className="h-4 w-4" /> Excel
        </Button>
        <Button variant="outline" size="sm" className="h-8 gap-1.5 text-xs shrink-0 text-destructive border-destructive/30" onClick={onCancel} title="Cancelar edição"><X className="h-4 w-4" /> Cancelar</Button>
        <Button size="sm" className="h-8 gap-1.5 text-xs shrink-0" onClick={handleSave} title="Salvar contrato"><Save className="h-4 w-4" /> Salvar</Button>
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

      {/* PDF Import Settings Dialog */}
      {showPdfSettings && pendingPdfFile && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={() => { setShowPdfSettings(false); setPendingPdfFile(null); }}>
          <div className="bg-background rounded-xl border border-border p-6 w-[440px] shadow-2xl" onClick={e => e.stopPropagation()}>
            <h3 className="text-lg font-bold text-foreground mb-1">Configurações de Importação</h3>
            <p className="text-xs text-muted-foreground mb-5">
              Arquivo: <span className="font-medium text-foreground">{pendingPdfFile.name}</span>
              {" "}({(pendingPdfFile.size / 1024 / 1024).toFixed(1)} MB)
            </p>

            {/* Presets */}
            <div className="flex gap-2 mb-5">
              {[
                { label: "⚡ Rápido", desc: "Leve e veloz", scale: 0.75, quality: 0.6, format: "jpeg" as const },
                { label: "⚙️ Padrão", desc: "Equilibrado", scale: 1.5, quality: 0.85, format: "jpeg" as const },
                { label: "✨ Alta Qualidade", desc: "Máxima nitidez", scale: 2.5, quality: 0.95, format: "png" as const },
              ].map(preset => {
                const active = pdfImportSettings.scale === preset.scale && pdfImportSettings.quality === preset.quality && pdfImportSettings.format === preset.format;
                return (
                  <button
                    key={preset.label}
                    onClick={() => setPdfImportSettings({ scale: preset.scale, quality: preset.quality, format: preset.format })}
                    className={`flex-1 rounded-lg border-2 px-3 py-2.5 text-center transition-all ${active ? "border-primary bg-primary/10 shadow-sm" : "border-border hover:border-muted-foreground/40"}`}
                  >
                    <span className="block text-sm font-semibold text-foreground">{preset.label}</span>
                    <span className="block text-[10px] text-muted-foreground mt-0.5">{preset.desc}</span>
                    <span className="block text-[9px] text-muted-foreground/70 mt-0.5">{preset.scale}x · {preset.format.toUpperCase()}</span>
                  </button>
                );
              })}
            </div>

            <details className="group">
              <summary className="text-xs font-medium text-muted-foreground cursor-pointer hover:text-foreground transition-colors select-none flex items-center gap-1 mb-3">
                <span className="group-open:rotate-90 transition-transform">▶</span> Ajustes avançados
              </summary>

            <div className="space-y-5 pt-1">
              {/* Scale / Resolution */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <label className="text-sm font-medium text-foreground">Resolução (escala)</label>
                  <span className="text-xs font-mono text-primary bg-primary/10 px-2 py-0.5 rounded">{pdfImportSettings.scale}x</span>
                </div>
                <input
                  type="range" min={0.5} max={3} step={0.25}
                  value={pdfImportSettings.scale}
                  onChange={e => setPdfImportSettings(s => ({ ...s, scale: Number(e.target.value) }))}
                  className="w-full"
                />
                <div className="flex justify-between text-[10px] text-muted-foreground">
                  <span>0.5x — Rápido</span>
                  <span>1.5x — Padrão</span>
                  <span>3x — Alta qualidade</span>
                </div>
              </div>

              {/* Format */}
              <div className="space-y-2">
                <label className="text-sm font-medium text-foreground">Formato da imagem</label>
                <div className="flex gap-2">
                  <button
                    onClick={() => setPdfImportSettings(s => ({ ...s, format: "jpeg" }))}
                    className={`flex-1 rounded-lg border-2 px-3 py-2 text-xs font-medium transition-all ${pdfImportSettings.format === "jpeg" ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground hover:border-muted-foreground/50"}`}
                  >
                    JPEG <span className="block text-[10px] font-normal mt-0.5">Menor tamanho, leve perda</span>
                  </button>
                  <button
                    onClick={() => setPdfImportSettings(s => ({ ...s, format: "png" }))}
                    className={`flex-1 rounded-lg border-2 px-3 py-2 text-xs font-medium transition-all ${pdfImportSettings.format === "png" ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground hover:border-muted-foreground/50"}`}
                  >
                    PNG <span className="block text-[10px] font-normal mt-0.5">Sem perda, maior tamanho</span>
                  </button>
                </div>
              </div>

              {/* JPEG Quality */}
              {pdfImportSettings.format === "jpeg" && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <label className="text-sm font-medium text-foreground">Qualidade JPEG</label>
                    <span className="text-xs font-mono text-primary bg-primary/10 px-2 py-0.5 rounded">{Math.round(pdfImportSettings.quality * 100)}%</span>
                  </div>
                  <input
                    type="range" min={0.3} max={1} step={0.05}
                    value={pdfImportSettings.quality}
                    onChange={e => setPdfImportSettings(s => ({ ...s, quality: Number(e.target.value) }))}
                    className="w-full"
                  />
                  <div className="flex justify-between text-[10px] text-muted-foreground">
                    <span>30% — Comprimido</span>
                    <span>85% — Padrão</span>
                    <span>100% — Máxima</span>
                  </div>
                </div>
              )}

              {/* Estimated info */}
              <div className="rounded-lg bg-muted/40 border border-border px-3 py-2 text-[11px] text-muted-foreground">
                💡 Escala maior = imagem mais nítida, mas importação mais lenta e maior uso de memória.
                {pdfImportSettings.scale >= 2.5 && " ⚠️ Escalas acima de 2.5x podem causar lentidão em PDFs grandes."}
              </div>
            </div>
            </details>

            <div className="flex gap-2 mt-6 justify-end">
              <Button variant="outline" size="sm" onClick={() => { setShowPdfSettings(false); setPendingPdfFile(null); }}>Cancelar</Button>
              <Button size="sm" onClick={executePdfImport}>
                <FileUp className="h-3.5 w-3.5 mr-1" /> Importar PDF
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* PDF Import Progress Overlay */}
      {importingPdf && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
          <div className="bg-background rounded-xl border border-border p-8 w-[400px] shadow-2xl text-center space-y-4">
            <div className="flex justify-center">
              <div className="h-12 w-12 rounded-full border-4 border-primary border-t-transparent animate-spin" />
            </div>
            <h3 className="text-lg font-bold text-foreground">Importando PDF</h3>
            <p className="text-sm text-muted-foreground">{pdfProgress.status || "Processando..."}</p>
            {pdfProgress.total > 0 && (
              <div className="space-y-2">
                <div className="w-full h-3 bg-muted rounded-full overflow-hidden">
                  <div
                    className="h-full bg-primary rounded-full transition-all duration-300 ease-out"
                    style={{ width: `${Math.round((pdfProgress.current / pdfProgress.total) * 100)}%` }}
                  />
                </div>
                <p className="text-xs text-muted-foreground font-medium">
                  {pdfProgress.current} de {pdfProgress.total} página{pdfProgress.total > 1 ? "s" : ""}
                  {" — "}{Math.round((pdfProgress.current / pdfProgress.total) * 100)}%
                </p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Main area */}
      <div className="flex flex-1 min-h-0 overflow-hidden">
        {/* Page thumbnails sidebar */}
        <div className="w-24 min-h-0 border-r border-border bg-muted/20 overflow-y-auto p-2 space-y-2">
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
              onClick={() => { setCurrentPageIdx(idx); setSelectedIds(new Set()); }}
              className={`w-full rounded border-2 transition-all cursor-pointer ${idx === currentPageIdx ? "border-primary shadow-sm" : "border-border hover:border-muted-foreground/30"} ${dragOverPageIdx === idx && dragPageIdx !== idx ? "border-primary/50 bg-primary/5" : ""} ${dragPageIdx === idx ? "opacity-40" : ""}`}
              title={`Página ${idx + 1} — arraste para reordenar`}
            >
              <div className="relative w-full bg-background group/thumb" style={{ aspectRatio: `${A4_WIDTH}/${A4_HEIGHT}` }}>
                {page.backgroundImage && (
                  <img src={page.backgroundImage} alt="" className="absolute inset-0 w-full h-full object-contain" style={{ opacity: page.backgroundOpacity }} />
                )}
                {pages.length > 1 && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      if (!confirm(`Excluir página ${idx + 1}?`)) return;
                      setPages(prev => {
                        const arr = prev.filter((_, i) => i !== idx);
                        return arr;
                      });
                      setCurrentPageIdx(prev => prev >= pages.length - 1 ? Math.max(0, pages.length - 2) : prev > idx ? prev - 1 : prev);
                      setSelectedIds(new Set());
                    }}
                    className="absolute top-0.5 right-0.5 z-10 opacity-0 group-hover/thumb:opacity-100 transition-opacity bg-destructive/90 hover:bg-destructive text-destructive-foreground rounded p-0.5"
                    title={`Excluir página ${idx + 1}`}
                  >
                    <Trash2 className="h-3 w-3" />
                  </button>
                )}
                <div className="absolute bottom-0 left-0 right-0 bg-foreground/60 text-background text-[9px] text-center py-0.5 font-medium">
                  {idx + 1}
                </div>
              </div>
            </div>
          ))}
        </div>
        {/* Canvas area with Word-like feel */}
        <div className="flex-1 min-w-0 min-h-0 overflow-auto" style={{ background: "hsl(var(--muted) / 0.6)" }}>
          <div className="min-h-full flex justify-center py-6 px-4" style={{ minWidth: A4_WIDTH * zoom + 48 }}>
            <div
              ref={canvasRef}
              style={{
                width: A4_WIDTH * zoom, height: A4_HEIGHT * zoom,
                position: "relative", background: "#fff",
                boxShadow: "0 4px 24px rgba(0,0,0,0.12), 0 1px 4px rgba(0,0,0,0.08)",
                overflow: "hidden", flexShrink: 0,
              }}
              onMouseDown={handleCanvasMouseDown}
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
              <div data-canvas-bg style={{ transform: `scale(${zoom})`, transformOrigin: "0 0", width: A4_WIDTH, height: A4_HEIGHT, position: "relative" }}>
                {elements.map(renderElement)}
              </div>

              {/* Context menu */}
              {contextMenu && (
                <div
                  style={{ position: "absolute", left: contextMenu.x, top: contextMenu.y, zIndex: 99999 }}
                  onClick={e => e.stopPropagation()}
                  className="min-w-[200px] rounded-md border border-border bg-popover shadow-lg"
                >
                  {selectedIds.size > 0 && (
                    <>
                      <button className="w-full px-3 py-1.5 text-left text-sm hover:bg-accent text-accent-foreground" onClick={duplicateSelected}>Duplicar</button>
                      <button className="w-full px-3 py-1.5 text-left text-sm hover:bg-destructive/10 text-destructive" onClick={deleteSelected}>Excluir</button>
                      {selectedIds.size >= 2 && (
                        <button className="w-full px-3 py-1.5 text-left text-sm hover:bg-accent text-accent-foreground" onClick={groupSelected}>
                          🔗 Agrupar ({selectedIds.size} itens)
                        </button>
                      )}
                      {hasGroupInSelection && (
                        <button className="w-full px-3 py-1.5 text-left text-sm hover:bg-accent text-accent-foreground" onClick={ungroupSelected}>
                          ✂️ Desagrupar
                        </button>
                      )}
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
            {/* Add page button below canvas */}
            <div className="flex justify-center py-4">
              <Button variant="outline" size="sm" className="gap-2 text-xs" onClick={addPage} title="Adicionar nova página">
                <Plus className="h-4 w-4" /> Nova Página
              </Button>
            </div>
          </div>
        </div>

        {/* Properties panel */}
        {renderPropertiesPanel()}
      </div>

      {/* Preview Modal */}
      {showPreview && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50" onClick={() => setShowPreview(false)}>
          <div className="bg-background rounded-xl border border-border shadow-2xl w-[90vw] max-w-4xl h-[85vh] flex flex-col" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-4 py-3 border-b border-border">
              <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
                <Eye className="h-4 w-4 text-primary" /> Preview do Contrato
              </h3>
              <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setShowPreview(false)}>
                <X className="h-4 w-4" />
              </Button>
            </div>
            <div className="flex-1 overflow-hidden">
              <iframe
                title="Preview do contrato"
                className="w-full h-full bg-white"
                srcDoc={buildContractDocumentHtml(convertToHtml(), "Preview do Contrato")}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
