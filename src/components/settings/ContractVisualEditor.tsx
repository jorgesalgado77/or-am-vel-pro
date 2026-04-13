import { useState, useRef, useCallback, useEffect } from "react";
import DOMPurify from "dompurify";
import { supabase } from "@/lib/supabaseClient";
import { useTenant } from "@/contexts/TenantContext";
import { ContractEditorToolbar, type ToolType, type ShapeType } from "./ContractEditorToolbar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { Save, X, ZoomIn, ZoomOut, Plus, Trash2, ChevronLeft, ChevronRight, FileUp, Copy, Download, FileText, BookmarkPlus, Pencil, Trash, Upload, Image as ImageIcon, AlignHorizontalJustifyStart, AlignHorizontalJustifyCenter, AlignHorizontalJustifyEnd, AlignVerticalJustifyStart, AlignVerticalJustifyCenter, AlignVerticalJustifyEnd, Eye, FileSpreadsheet, ToggleLeft, ToggleRight, Palette, Layers, ListOrdered, Search, Replace } from "lucide-react";
// jsPDF/docx imports removed - now in contract-editor/exportHelpers
import { ContractLayersPanel } from "./ContractLayersPanel";
import { ContractSectionsPanel } from "./ContractSectionsPanel";
import { getContractTemplates, type ContractTemplate } from "./contractTemplates";
import { useCustomTemplates, type CustomTemplate } from "@/hooks/useCustomTemplates";
import { toast } from "sonner";
import * as pdfjsLib from "pdfjs-dist";
import { buildContractDocumentHtml } from "@/lib/contractDocument";
import { evaluateCell, isFormula, SUPPORTED_FORMULAS, indexToCol } from "@/lib/formulaEngine";
import { replaceVariablesWithSample, isHtmlVariable, getConditionalStyle, matchesConditionalRule, type ConditionalRule, type ConditionalPreset, DEFAULT_CONDITIONAL_RULES, getAllPresets, loadCustomPresets, saveCustomPresets } from "@/lib/contractPreviewData";

import {
  type CanvasElement, type PageData, type VariableInfo, type ContractVisualEditorProps,
  A4_WIDTH, A4_HEIGHT, GRID_SIZE, RULER_SIZE,
  genId, pageId, createDefaultElement, hexToRgb,
} from "./contract-editor/types";
import { useEditorHistory } from "./contract-editor/useEditorHistory";
import { usePasteHelpers } from "./contract-editor/usePasteHelpers";
import { useTextSplitter } from "./contract-editor/useTextSplitter";
import { buildRepeatedElementFingerprints, createContinuationPageFromTemplate, getPageFlowBounds, isLikelyPageChrome, stripSplitMetadata } from "./contract-editor/pagination";
import { EditorPropertiesPanel } from "./contract-editor/EditorPropertiesPanel";
import { exportToPdf, exportToDocx, exportToXlsx } from "./contract-editor/exportHelpers";
import { HeaderFooterConfig, defaultHeaderSettings, defaultFooterSettings, type HeaderFooterSettings } from "./contract-editor/HeaderFooterConfig";

pdfjsLib.GlobalWorkerOptions.workerSrc = new URL("/pdf.worker.min.mjs", window.location.origin).href;

const DEFAULT_EDITOR_MARGINS = { top: 40, right: 40, bottom: 40, left: 40 };

const readStoredJson = <T,>(key: string, fallback: T, normalize: (value: unknown) => T): T => {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    return normalize(JSON.parse(raw));
  } catch {
    return fallback;
  }
};

const normalizeNumber = (value: unknown, fallback: number) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const normalizeMargins = (value: unknown) => {
  const parsed = value && typeof value === "object"
    ? value as Partial<Record<keyof typeof DEFAULT_EDITOR_MARGINS, unknown>>
    : {};

  return {
    top: normalizeNumber(parsed.top, DEFAULT_EDITOR_MARGINS.top),
    right: normalizeNumber(parsed.right, DEFAULT_EDITOR_MARGINS.right),
    bottom: normalizeNumber(parsed.bottom, DEFAULT_EDITOR_MARGINS.bottom),
    left: normalizeNumber(parsed.left, DEFAULT_EDITOR_MARGINS.left),
  };
};

const normalizeHeaderFooterSettings = (value: unknown, fallback: HeaderFooterSettings): HeaderFooterSettings => {
  const parsed = value && typeof value === "object"
    ? value as Partial<Record<keyof HeaderFooterSettings, unknown>>
    : {};

  return {
    ...fallback,
    enabled: typeof parsed.enabled === "boolean" ? parsed.enabled : fallback.enabled,
    height: normalizeNumber(parsed.height, fallback.height),
    leftText: typeof parsed.leftText === "string" ? parsed.leftText : fallback.leftText,
    centerText: typeof parsed.centerText === "string" ? parsed.centerText : fallback.centerText,
    rightText: typeof parsed.rightText === "string" ? parsed.rightText : fallback.rightText,
    fontSize: normalizeNumber(parsed.fontSize, fallback.fontSize),
    fontFamily: typeof parsed.fontFamily === "string" ? parsed.fontFamily : fallback.fontFamily,
    color: typeof parsed.color === "string" ? parsed.color : fallback.color,
    backgroundColor: typeof parsed.backgroundColor === "string" ? parsed.backgroundColor : fallback.backgroundColor,
    showLine: typeof parsed.showLine === "boolean" ? parsed.showLine : fallback.showLine,
    lineColor: typeof parsed.lineColor === "string" ? parsed.lineColor : fallback.lineColor,
  };
};

const getTextContentMetrics = (el: Pick<CanvasElement, "type" | "width" | "height">) => {
  const hasInnerPadding = el.type === "rect" || el.type === "circle";
  const paddingX = hasInnerPadding ? 16 : 0;
  const paddingY = hasInnerPadding ? 16 : 0;

  return {
    contentWidth: Math.max(1, el.width - paddingX),
    contentHeight: Math.max(1, el.height - paddingY),
    paddingY,
  };
};




export function ContractVisualEditor({ onSave, onCancel, variables }: ContractVisualEditorProps) {
  const { tenantId } = useTenant();
  const [showTemplates, setShowTemplates] = useState(true);
  const [pages, setPages] = useState<PageData[]>([{ id: pageId(), elements: [], backgroundOpacity: 0.5 }]);
  const [currentPageIdx, setCurrentPageIdx] = useState(0);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [activeTool, setActiveTool] = useState<ToolType>("select");
  const [activeShapeType, setActiveShapeType] = useState<ShapeType>("rect");
  const [margins, setMargins] = useState(() => readStoredJson("ce_margins", DEFAULT_EDITOR_MARGINS, normalizeMargins));
  const [headerSettings, setHeaderSettings] = useState<HeaderFooterSettings>(() => (
    readStoredJson("ce_header_settings", defaultHeaderSettings, (value) => normalizeHeaderFooterSettings(value, defaultHeaderSettings))
  ));
  const [footerSettings, setFooterSettings] = useState<HeaderFooterSettings>(() => (
    readStoredJson("ce_footer_settings", defaultFooterSettings, (value) => normalizeHeaderFooterSettings(value, defaultFooterSettings))
  ));
  const [zoom, setZoom] = useState(() => {
    try { const v = localStorage.getItem("ce_zoom"); if (v) return Number(v); } catch {} return 0.75;
  });
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

  // Find & Replace state
  const [showFindReplace, setShowFindReplace] = useState(false);
  const [findText, setFindText] = useState("");
  const [replaceText, setReplaceText] = useState("");
  const [findResults, setFindResults] = useState<{ pageIdx: number; elId: string; count: number }[]>([]);

  // Conditional formatting
  const [conditionalRules, setConditionalRules] = useState<ConditionalRule[]>(DEFAULT_CONDITIONAL_RULES);
  const [showConditionalPanel, setShowConditionalPanel] = useState(false);
  const [customPresets, setCustomPresets] = useState<ConditionalPreset[]>(() => loadCustomPresets());
  const [activePresetId, setActivePresetId] = useState<string | null>("preset_valores_padrao");
  const [savePresetName, setSavePresetName] = useState("");
  const [showSavePreset, setShowSavePreset] = useState(false);
  const allPresets = [...getAllPresets().filter(p => p.builtIn), ...customPresets];
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
  const [showFormatMarks, setShowFormatMarks] = useState(false);
  const [enterHint, setEnterHint] = useState<{ text: string; x: number; y: number } | null>(null);
  const enterHintTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number } | null>(null);
  const [varSearch, setVarSearch] = useState("");
  const [ctxSelectedText, setCtxSelectedText] = useState("");
  const [ctxReplaceText, setCtxReplaceText] = useState("");
  const [ctxReplaceVarSearch, setCtxReplaceVarSearch] = useState("");
  const [ctxShowReplace, setCtxShowReplace] = useState(false);
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
  const [smartGuides, setSmartGuides] = useState<{ x: number[]; y: number[] }>({ x: [], y: [] });
  const [hiddenIds, setHiddenIds] = useState<Set<string>>(new Set());
  const [showLayersPanel, setShowLayersPanel] = useState(() => {
    try { return localStorage.getItem("ce_layers") !== "false"; } catch { return true; }
  });
  const [showSectionsPanel, setShowSectionsPanel] = useState(() => {
    try { return localStorage.getItem("ce_sections") !== "false"; } catch { return true; }
  });
  const [showPageBreakIndicators, setShowPageBreakIndicators] = useState(() => {
    try { return localStorage.getItem("ce_pagebreak") !== "false"; } catch { return true; }
  });

  // User-placed draggable guide lines
  const [userGuides, setUserGuides] = useState<{ id: string; axis: "x" | "y"; pos: number }[]>([]);
  const [draggingGuide, setDraggingGuide] = useState<{ id: string; axis: "x" | "y"; startMouse: number; startPos: number } | null>(null);
  const [visiblePageIdx, setVisiblePageIdx] = useState(0);
  const pageRefsMap = useRef<Map<number, HTMLDivElement>>(new Map());
  const pendingEditRef = useRef<string | null>(null);

  // Persist editor preferences to localStorage
  useEffect(() => { try { localStorage.setItem("ce_zoom", String(zoom)); } catch {} }, [zoom]);
  useEffect(() => { try { localStorage.setItem("ce_layers", String(showLayersPanel)); } catch {} }, [showLayersPanel]);
  useEffect(() => { try { localStorage.setItem("ce_sections", String(showSectionsPanel)); } catch {} }, [showSectionsPanel]);
  useEffect(() => { try { localStorage.setItem("ce_pagebreak", String(showPageBreakIndicators)); } catch {} }, [showPageBreakIndicators]);
  useEffect(() => { try { localStorage.setItem("ce_margins", JSON.stringify(margins)); } catch {} }, [margins]);
  useEffect(() => { try { localStorage.setItem("ce_header_settings", JSON.stringify(headerSettings)); } catch {} }, [headerSettings]);
  useEffect(() => { try { localStorage.setItem("ce_footer_settings", JSON.stringify(footerSettings)); } catch {} }, [footerSettings]);

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
  const editableRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const reflowDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const editingBlurTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const currentPage = pages[currentPageIdx];
  const elements = currentPage?.elements || [];
  // Derive selectedId as first in set for properties panel backward compat
  const selectedId = selectedIds.size > 0 ? [...selectedIds][0] : null;
  const selected = elements.find(e => e.id === selectedId) || null;

  const snapToGrid = useCallback((v: number) => Math.round(v / GRID_SIZE) * GRID_SIZE, []);

  const clampToMargins = useCallback((el: { width: number; height: number }, x: number, y: number) => {
    const maxX = Math.max(margins.left, A4_WIDTH - margins.right - el.width);
    const maxY = Math.max(margins.top, A4_HEIGHT - margins.bottom - el.height);
    return {
      x: Math.min(Math.max(snapToGrid(x), margins.left), maxX),
      y: Math.min(Math.max(snapToGrid(y), margins.top), maxY),
    };
  }, [margins, snapToGrid]);

  const computeSmartGuides = useCallback((draggedIds: string[], currentElements: CanvasElement[]) => {
    const others = currentElements.filter(el => !draggedIds.includes(el.id) && !el.locked);
    const dragged = currentElements.filter(el => draggedIds.includes(el.id));
    if (dragged.length === 0 || others.length === 0) return { x: [] as number[], y: [] as number[] };

    const SNAP_THRESHOLD = 6;
    const guideX: number[] = [];
    const guideY: number[] = [];

    for (const d of dragged) {
      const dEdges = { left: d.x, right: d.x + d.width, cx: d.x + d.width / 2 };
      const dEdgesY = { top: d.y, bottom: d.y + d.height, cy: d.y + d.height / 2 };

      for (const o of others) {
        const oEdges = { left: o.x, right: o.x + o.width, cx: o.x + o.width / 2 };
        const oEdgesY = { top: o.y, bottom: o.y + o.height, cy: o.y + o.height / 2 };

        for (const dv of [dEdges.left, dEdges.right, dEdges.cx]) {
          for (const ov of [oEdges.left, oEdges.right, oEdges.cx]) {
            if (Math.abs(dv - ov) < SNAP_THRESHOLD) guideX.push(ov);
          }
        }
        for (const dv of [dEdgesY.top, dEdgesY.bottom, dEdgesY.cy]) {
          for (const ov of [oEdgesY.top, oEdgesY.bottom, oEdgesY.cy]) {
            if (Math.abs(dv - ov) < SNAP_THRESHOLD) guideY.push(ov);
          }
        }
      }
    }

    return { x: [...new Set(guideX)], y: [...new Set(guideY)] };
  }, []);

  const sanitizeClipboard = useCallback((htmlData: string, textData: string) => {
    // If we have HTML data, preserve formatting (bold, italic, underline, lists, etc.)
    if (htmlData) {
      const wrapper = document.createElement("div");
      wrapper.innerHTML = htmlData;

      // Remove dangerous/unwanted elements
      wrapper.querySelectorAll("script,style,meta,link,iframe,object,embed,form,input,button,select,textarea,svg,canvas,video,audio,noscript").forEach(n => n.remove());

      // Remove all class/id attributes and problematic inline styles, but keep structural formatting
      const walkAndClean = (node: Element) => {
        node.removeAttribute("class");
        node.removeAttribute("id");
        node.removeAttribute("data-ccp-props");
        node.removeAttribute("data-ccp-parastyle");

        // Clean inline styles: keep only font-weight, font-style, text-decoration, text-align, font-size
        const existingStyle = node.getAttribute("style") || "";
        const keepProps: string[] = [];

        const fwMatch = existingStyle.match(/font-weight\s*:\s*([^;]+)/i);
        if (fwMatch) keepProps.push(`font-weight:${fwMatch[1].trim()}`);

        const fsMatch = existingStyle.match(/font-style\s*:\s*([^;]+)/i);
        if (fsMatch) keepProps.push(`font-style:${fsMatch[1].trim()}`);

        const tdMatch = existingStyle.match(/text-decoration\s*:\s*([^;]+)/i);
        if (tdMatch) keepProps.push(`text-decoration:${tdMatch[1].trim()}`);

        const taMatch = existingStyle.match(/text-align\s*:\s*([^;]+)/i);
        if (taMatch) keepProps.push(`text-align:${taMatch[1].trim()}`);

        const fszMatch = existingStyle.match(/font-size\s*:\s*([^;]+)/i);
        if (fszMatch) keepProps.push(`font-size:${fszMatch[1].trim()}`);

        // Force visibility
        keepProps.push("color:#000000 !important");
        keepProps.push("background:transparent !important");
        keepProps.push("-webkit-text-fill-color:#000000 !important");

        node.setAttribute("style", keepProps.join(";"));

        // Recurse into children
        Array.from(node.children).forEach(walkAndClean);
      };

      walkAndClean(wrapper);

      const result = wrapper.innerHTML.trim();
      if (result && result !== "&nbsp;" && result.replace(/<[^>]*>/g, "").trim()) {
        return result;
      }
    }

    // Fallback to plain text
    const raw = (textData || "").replace(/\r\n/g, "\n");
    if (!raw.trim()) return "";
    return raw.split("\n")
      .map((line) => `<span style="color:#000000 !important;background:transparent !important;-webkit-text-fill-color:#000000 !important;">${line ? line.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;") : "&nbsp;"}</span>`)
      .join("<br>");
  }, []);

  const forcePastedTextVisible = useCallback((html: string, color = "#000000") => {
    const visibleColor = color;
    return html
      .replace(/color\s*:[^;\"]+;?/gi, "")
      .replace(/background(?:-color)?\s*:[^;\"]+;?/gi, "")
      .replace(/-webkit-text-fill-color\s*:[^;\"]+;?/gi, "")
      .replace(/opacity\s*:[^;\"]+;?/gi, "")
      .replace(/mix-blend-mode\s*:[^;\"]+;?/gi, "")
      .replace(/<(span|p|div|li|td|th|h[1-6])\b([^>]*)>/gi, (match, tag, attrs) => {
        // Don't double-add style if already has our visibility styles
        if (attrs.includes("-webkit-text-fill-color")) return match;
        return `<${tag}${attrs} style="color:${visibleColor} !important;background:transparent !important;opacity:1 !important;-webkit-text-fill-color:${visibleColor} !important;mix-blend-mode:normal !important;">`;
      })
      .replace(/<font\b([^>]*)color=(['\"])[^'\"]*\2([^>]*)>/gi, `<font$1$3>`);
  }, []);

  const { splitHtmlAtHeight, measureHtmlHeight } = useTextSplitter();
  const repeatedPageChrome = buildRepeatedElementFingerprints(pages);

  // Resolve header/footer text placeholders
  const resolveHeaderFooterText = useCallback((text: string, pageIdx: number) => {
    if (!text) return "";
    let resolved = text
      .replace(/\{\{pagina\}\}/g, String(pageIdx + 1))
      .replace(/\{\{total_paginas\}\}/g, String(pages.length));
    if (previewVarsMode) {
      resolved = replaceVariablesWithSample(resolved);
    }
    return resolved;
  }, [pages.length, previewVarsMode]);

  const FIXED_SECTION_BOX = { x: 40, y: 100, width: 714, height: 966 };
  // Alias for backward compat in reflow
  const GENERAL_CONDITIONS_BOX = FIXED_SECTION_BOX;

  // Patterns for all section titles that should use fixed-layout continuity
  const FIXED_SECTION_PATTERNS = [
    /CONDI(?:ÇÕES|COES)\s+GERAIS/i,
    /OBSERVA(?:ÇÕES|COES)/i,
    /AMBIENTES?\s+E\s+VALORES/i,
    /DETALHES?\s+D[OE]S?\s+AMBIENTES?/i,
    /PRODUTOS?\s+D[OE]\s+CAT[AÁ]LOGO/i,
  ];

  const SECTION_TITLE_PATTERNS = [
    ...FIXED_SECTION_PATTERNS,
    /RESPONS[AÁ]VEIS/i,
    /ASSINATURAS?/i,
    /TELEFONES?\s+ÚTEIS/i,
    /RESUMO\s+FINANCEIRO/i,
    /FORMA\s+DE\s+PAGAMENTO/i,
    /DADOS\s+DO\s+CLIENTE/i,
    /ENDERE[CÇ]O\s+DE\s+ENTREGA/i,
  ];

  const stripHtmlText = (value: string) => value.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();

  const isSectionTitleElement = (el: CanvasElement) => (
    el.type === "text"
    && !!el.text
    && SECTION_TITLE_PATTERNS.some((pattern) => pattern.test(stripHtmlText(el.text)))
  );

  const isGeneralConditionsElement = useCallback((el: CanvasElement, page: PageData) => {
    const isTextual = (el.type === "text" || el.type === "rect") && !!el.text;
    const matchesFrame = Math.abs(el.x - FIXED_SECTION_BOX.x) <= 8
      && Math.abs(el.y - FIXED_SECTION_BOX.y) <= 24
      && Math.abs(el.width - FIXED_SECTION_BOX.width) <= 16;

    if (!isTextual || !matchesFrame) return false;

    return page.elements.some((other) =>
      other.id !== el.id
      && other.type === "text"
      && FIXED_SECTION_PATTERNS.some(pat => pat.test(other.text))
      && other.y < el.y
      && Math.abs(other.x - FIXED_SECTION_BOX.x) <= 16,
    );
  }, []);

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
    const clienteEl = createDefaultElement("text", margins.left, margins.top + 90);
    clienteEl.text = "{{nome_cliente}}";
    clienteEl.fontSize = 13;
    clienteEl.fontWeight = "bold";
    clienteEl.color = "#333333";
    clienteEl.width = A4_WIDTH - margins.left - margins.right;
    clienteEl.height = 24;
    clienteEl.stroke = "transparent";
    clienteEl.strokeWidth = 0;
    const newPage: PageData = { id: pageId(), elements: [clienteEl], backgroundOpacity: 0.5 };
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

  // --- Reflow robusto: preserva cabeçalho/rodapé, margens e continuações entre páginas ---
  const reflowElements = useCallback((changedElId: string, newHeight: number, changedElUpdates?: Partial<CanvasElement>) => {
    setPages(prev => {
      const sourcePage = prev[currentPageIdx];
      if (!sourcePage) return prev;

      const sourceElements = sourcePage.elements;
      const changedEl = sourceElements.find(e => e.id === changedElId);
      if (!changedEl) return prev;

      const isGeneralConditionsBox = isGeneralConditionsElement(changedEl, sourcePage);
      const targetHeight = isGeneralConditionsBox
        ? Math.max(newHeight, GENERAL_CONDITIONS_BOX.height)
        : newHeight;
      const oldBottom = changedEl.y + changedEl.height;
      const heightDelta = targetHeight - changedEl.height;
      const repeatedChrome = buildRepeatedElementFingerprints(prev);

      if (heightDelta === 0) {
        if (!changedElUpdates || Object.keys(changedElUpdates).length === 0) return prev;
        const nextElements = sourceElements.map(el => el.id === changedElId
          ? {
              ...el,
              ...changedElUpdates,
              height: targetHeight,
              splitFrom: undefined,
              splitContinuationId: undefined,
            }
          : el);
        const nextPages = [...prev];
        nextPages[currentPageIdx] = { ...sourcePage, elements: nextElements };
        return nextPages;
      }

      // For both growth (heightDelta > 0) and shrinkage (heightDelta < 0),
      // reflow all elements below the changed one

      const workingPages = [...prev];

      const staticElements = sourceElements
        .filter(el => isLikelyPageChrome(el, repeatedChrome, margins) || el.y < changedEl.y)
        .map(stripSplitMetadata);

      const flowCandidates = sourceElements
        .filter(el => !staticElements.some(se => se.id === el.id))
        .map(el => el.id === changedElId ? { ...el, ...changedElUpdates, height: targetHeight } : el)
        .sort((a, b) => a.y - b.y || a.zIndex - b.zIndex);

      const adjustedFlow = flowCandidates.map(el => {
        if (el.id === changedElId) return { ...el, y: changedEl.y };
        if (el.y >= oldBottom - 5) return { ...el, y: el.y + heightDelta };
        return el;
      });

      let pending: CanvasElement[] = adjustedFlow.map(stripSplitMetadata);
      let pageIdx = currentPageIdx;
      let activeTemplatePage = sourcePage;
      const rewrittenPages = [...workingPages];
      const cloneRepeatedContext = () => staticElements.map((el) => ({ ...stripSplitMetadata(el), id: genId() }));

      // Track all IDs in the conditions continuation chain so multi-page splits work
      const conditionsChainIds = new Set<string>();
      if (isGeneralConditionsBox) conditionsChainIds.add(changedElId);

      while (pending.length > 0) {
        const page = pageIdx === currentPageIdx
          ? sourcePage
          : (rewrittenPages[pageIdx] ?? createContinuationPageFromTemplate(isGeneralConditionsBox ? sourcePage : activeTemplatePage, repeatedChrome, margins));

        if (pageIdx >= rewrittenPages.length) {
          rewrittenPages.push(page);
        } else {
          rewrittenPages[pageIdx] = page;
        }

        const flowBounds = getPageFlowBounds(page, repeatedChrome, margins);
        const reservedHeaderBottom = headerSettings.enabled
          ? Math.max(headerSettings.height + 4, margins.top - 4) + 8
          : margins.top;
        const reservedFooterTop = footerSettings.enabled
          ? A4_HEIGHT - Math.max(4, margins.bottom - footerSettings.height - 4) - footerSettings.height - 8
          : A4_HEIGHT - margins.bottom;
        const pageStartY = Math.max(flowBounds.startY, reservedHeaderBottom);
        const pageBottomY = Math.max(pageStartY + 40, Math.min(flowBounds.endY, reservedFooterTop));
        // Fixed section frames always use the standardized 714x966 box
        const fixedFragmentX = FIXED_SECTION_BOX.x;
        const fixedFragmentY = Math.max(FIXED_SECTION_BOX.y, pageStartY);
        const fixedFragmentWidth = FIXED_SECTION_BOX.width;
        const fixedFragmentHeight = FIXED_SECTION_BOX.height;
        const pageStatic = pageIdx === currentPageIdx
          ? staticElements
          : (isGeneralConditionsBox
              ? cloneRepeatedContext().filter(el => !el.text?.includes("{{nome_cliente}}"))
              : page.elements.filter(el => isLikelyPageChrome(el, repeatedChrome, margins)).map(stripSplitMetadata));

        const pageFlow: CanvasElement[] = [];
        const nextPending: CanvasElement[] = [];
        let cursorY = pageStartY;

        // Track whether this page already has a fixed-section fragment
        let pageHasFixedFragment = false;

        const moveSectionToNextPage = (items: CanvasElement[], startY: number) => {
          const sectionStartY = Math.min(...items.map((item) => item.y));
          nextPending.push(
            ...items.map((item) => ({
              ...stripSplitMetadata(item),
              y: startY + (item.y - sectionStartY),
            })),
          );
        };

        const getSectionGroup = (items: CanvasElement[], startIdx: number) => {
          const first = items[startIdx];
          if (!first || !isSectionTitleElement(first)) return null;

          let endIdx = startIdx;
          while (endIdx + 1 < items.length && !isSectionTitleElement(items[endIdx + 1])) {
            endIdx += 1;
          }

          const groupItems = items.slice(startIdx, endIdx + 1).map(stripSplitMetadata);
          const startY = Math.min(...groupItems.map((item) => item.y));
          const endY = Math.max(...groupItems.map((item) => item.y + item.height));

          return {
            endIdx,
            items: groupItems,
            startY,
            height: endY - startY,
          };
        };

        for (let pendingIdx = 0; pendingIdx < pending.length; pendingIdx += 1) {
          const original = pending[pendingIdx];
          const isConditionsFragment = isGeneralConditionsBox && (conditionsChainIds.has(original.id) || (original.splitFrom && conditionsChainIds.has(original.splitFrom)) || false);
          const normalizedBase = stripSplitMetadata(original);
          const sectionGroup = !isConditionsFragment ? getSectionGroup(pending, pendingIdx) : null;

          // If a fixed-section fragment already occupies this page, push all other elements to next page
          if (pageHasFixedFragment && !isConditionsFragment) {
            if (sectionGroup) {
              moveSectionToNextPage(sectionGroup.items, pageStartY);
              pendingIdx = sectionGroup.endIdx;
            } else {
              nextPending.push({
                ...normalizedBase,
                y: pageStartY,
              });
            }
            continue;
          }

          const normalized = isConditionsFragment
            ? {
                ...normalizedBase,
                x: fixedFragmentX,
                y: fixedFragmentY,
                width: fixedFragmentWidth,
                height: fixedFragmentHeight,
              }
            : normalizedBase;
          const shouldStartFreshPage = pageIdx > currentPageIdx && pageFlow.length === 0;
          const placedY = isConditionsFragment
            ? fixedFragmentY
            : Math.max(cursorY, pageFlow.length === 0 ? (shouldStartFreshPage ? pageStartY : Math.max(pageStartY, normalized.y)) : cursorY);
          const candidate = { ...normalized, y: placedY };

          const candidateBottom = candidate.y + candidate.height;
          const isTextual = (candidate.type === "text" || candidate.type === "rect") && !!candidate.text;

          if (sectionGroup && !isConditionsFragment) {
            const pageCapacity = pageBottomY - pageStartY;
            const availableHeight = pageBottomY - placedY;
            const sectionFitsPage = sectionGroup.height <= pageCapacity;

            if (pageFlow.length > 0 && sectionFitsPage && sectionGroup.height > availableHeight) {
              moveSectionToNextPage(sectionGroup.items, pageStartY);
              pendingIdx = sectionGroup.endIdx;
              continue;
            }
          }

          if (isConditionsFragment && isTextual) {
            const { contentWidth, paddingY } = getTextContentMetrics(candidate);
            // Use the actual available space on this page for the fixed frame
            const frameBottomOnPage = fixedFragmentY + fixedFragmentHeight;
            const effectiveBottom = Math.min(frameBottomOnPage, pageBottomY);
            const availableHeight = Math.max(24, effectiveBottom - fixedFragmentY - paddingY);
            const [fitHtml, remHtml] = splitHtmlAtHeight(
              candidate.text,
              contentWidth,
              {
                fontFamily: candidate.fontFamily,
                fontSize: candidate.fontSize,
                fontWeight: candidate.fontWeight,
                fontStyle: candidate.fontStyle,
                textAlign: candidate.textAlign,
              },
              availableHeight,
            );

            const fitHeight = fitHtml
              ? measureHtmlHeight(fitHtml, contentWidth, {
                  fontFamily: candidate.fontFamily,
                  fontSize: candidate.fontSize,
                  fontWeight: candidate.fontWeight,
                  fontStyle: candidate.fontStyle,
                  textAlign: candidate.textAlign,
                })
              : 0;

            const needsContinuation = !!remHtml && remHtml !== candidate.text;
            const canPlaceHere = !!fitHtml && fitHeight > 0;

            if (canPlaceHere) {
              const continuationId = needsContinuation ? genId() : undefined;
              const placedFrameHeight = Math.min(fixedFragmentHeight, effectiveBottom - fixedFragmentY);
              pageFlow.push({
                ...candidate,
                text: fitHtml,
                height: placedFrameHeight,
                width: fixedFragmentWidth,
                x: fixedFragmentX,
                splitContinuationId: continuationId,
              });
              pageHasFixedFragment = true;
              cursorY = fixedFragmentY + placedFrameHeight + 10;

              if (needsContinuation) {
                const contId = continuationId || genId();
                conditionsChainIds.add(contId);
                nextPending.push({
                  ...stripSplitMetadata(candidate),
                  id: contId,
                  text: remHtml,
                  x: fixedFragmentX,
                  y: fixedFragmentY,
                  width: fixedFragmentWidth,
                  height: fixedFragmentHeight,
                  splitFrom: candidate.id,
                });
              }
              continue;
            }
          }

          if (candidateBottom <= pageBottomY) {
            pageFlow.push(candidate);
            cursorY = candidate.y + candidate.height + 10;
            if (isConditionsFragment) pageHasFixedFragment = true;
            continue;
          }

          if (isTextual) {
            const { contentWidth, paddingY } = getTextContentMetrics(candidate);
            const availableHeight = pageBottomY - candidate.y - paddingY;
            const minSplitHeight = Math.max(candidate.fontSize * 1.6, 28);

            if (availableHeight >= minSplitHeight) {
              const [fitHtml, remHtml] = splitHtmlAtHeight(
                candidate.text,
                contentWidth,
                {
                  fontFamily: candidate.fontFamily,
                  fontSize: candidate.fontSize,
                  fontWeight: candidate.fontWeight,
                  fontStyle: candidate.fontStyle,
                  textAlign: candidate.textAlign,
                },
                availableHeight,
              );

              const fitHeight = fitHtml
                ? measureHtmlHeight(fitHtml, contentWidth, {
                    fontFamily: candidate.fontFamily,
                    fontSize: candidate.fontSize,
                    fontWeight: candidate.fontWeight,
                    fontStyle: candidate.fontStyle,
                    textAlign: candidate.textAlign,
                  })
                : 0;

              const didSplit = !!fitHtml && !!remHtml && fitHtml !== candidate.text && fitHeight > 0 && fitHeight + paddingY < candidate.height;

              if (didSplit) {
                const continuationId = genId();
                const placedHeight = Math.min(pageBottomY - candidate.y, fitHeight + paddingY + 4);
                pageFlow.push({
                  ...candidate,
                  text: fitHtml,
                  height: placedHeight,
                  splitContinuationId: continuationId,
                });
                nextPending.push({
                  ...stripSplitMetadata(candidate),
                  id: continuationId,
                  text: remHtml,
                  x: candidate.x,
                  y: pageStartY,
                  width: Math.max(candidate.width, A4_WIDTH - margins.left - margins.right),
                  height: Math.max(candidate.fontSize * 2 + paddingY, candidate.height - placedHeight),
                  splitFrom: candidate.id,
                });
                cursorY = candidate.y + placedHeight + 10;
                continue;
              }
            }
          }

          if (sectionGroup && !isConditionsFragment) {
            moveSectionToNextPage(sectionGroup.items, pageStartY);
            pendingIdx = sectionGroup.endIdx;
            continue;
          }

          nextPending.push({
            ...candidate,
            x: isConditionsFragment ? fixedFragmentX : candidate.x,
            y: isConditionsFragment ? fixedFragmentY : pageStartY,
            width: isConditionsFragment ? fixedFragmentWidth : candidate.width,
            height: isConditionsFragment ? fixedFragmentHeight : candidate.height,
          });
        }

        rewrittenPages[pageIdx] = {
          ...page,
          backgroundImage: activeTemplatePage.backgroundImage,
          backgroundOpacity: activeTemplatePage.backgroundOpacity,
          elements: [...pageStatic, ...pageFlow].sort((a, b) => a.zIndex - b.zIndex),
        };

        const noProgress = nextPending.length === pending.length
          && nextPending.every((el, idx) => el.text === pending[idx]?.text && Math.round(el.y) === Math.round(isGeneralConditionsBox ? fixedFragmentY : pageStartY));

        pending = noProgress ? [] : nextPending;
        pageIdx += 1;

        if (pageIdx >= rewrittenPages.length && pending.length > 0) {
          rewrittenPages.push(createContinuationPageFromTemplate(isGeneralConditionsBox ? sourcePage : activeTemplatePage, repeatedChrome, margins));
        }

        if (pageIdx < rewrittenPages.length) {
          activeTemplatePage = isGeneralConditionsBox
            ? sourcePage
            : (rewrittenPages[Math.min(pageIdx, rewrittenPages.length - 1)] ?? activeTemplatePage);
        }

        if (noProgress || pageIdx > currentPageIdx + 40) break;
      }

      const trimmedPages = rewrittenPages.filter((page, idx) => {
        if (idx <= currentPageIdx) return true;
        const hasFlowContent = page.elements.some(el => !isLikelyPageChrome(el, repeatedChrome, margins));
        return hasFlowContent;
      });

      // toast is fired outside setPages to avoid side effects in setState
      return trimmedPages.length > 0 ? trimmedPages : prev;
    });
    // Only show toast when not actively editing text (to avoid spamming during typing)
    if (!editingTextId) {
      toast.info("Contrato reorganizado mantendo margens e continuidade.", { id: "auto-reflow" });
    }
  }, [currentPageIdx, editingTextId, footerSettings.enabled, footerSettings.height, headerSettings.enabled, headerSettings.height, isGeneralConditionsElement, margins, measureHtmlHeight, splitHtmlAtHeight]);

  // --- Find & Replace ---
  const handleFind = useCallback(() => {
    if (!findText.trim()) { setFindResults([]); return; }
    const results: { pageIdx: number; elId: string; count: number }[] = [];
    const searchLower = findText.toLowerCase();
    pages.forEach((page, pageIdx) => {
      page.elements.forEach(el => {
        if ((el.type === "text" || el.type === "rect") && el.text) {
          const plain = el.text.replace(/<[^>]*>/g, "").toLowerCase();
          const matches = plain.split(searchLower).length - 1;
          if (matches > 0) results.push({ pageIdx, elId: el.id, count: matches });
        }
      });
    });
    setFindResults(results);
    if (results.length === 0) toast.info("Nenhuma ocorrência encontrada");
    else toast.success(`${results.reduce((s, r) => s + r.count, 0)} ocorrência(s) em ${results.length} elemento(s)`);
  }, [findText, pages]);

  const handleReplaceAll = useCallback(() => {
    if (!findText.trim()) return;
    const searchTerm = findText;
    let totalCount = 0;
    setPages(prev => prev.map(page => ({
      ...page,
      elements: page.elements.map(el => {
        if ((el.type === "text" || el.type === "rect") && el.text) {
          // Replace in HTML text preserving tags
          const regex = new RegExp(searchTerm.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "gi");
          const newText = el.text.replace(regex, (match) => {
            totalCount++;
            return replaceText;
          });
          if (newText !== el.text) return { ...el, text: newText };
        }
        return el;
      }),
    })));
    setFindResults([]);
    if (totalCount > 0) toast.success(`${totalCount} ocorrência(s) substituída(s) por "${replaceText}"`);
    else toast.info("Nenhuma ocorrência encontrada");
  }, [findText, replaceText]);

  // --- Element operations ---
  const updateSelected = useCallback((updates: Partial<CanvasElement>) => {
    if (selectedIds.size === 0) return;
    setCurrentElements(prev => prev.map(el => selectedIds.has(el.id) ? { ...el, ...updates } : el));
  }, [selectedIds, setCurrentElements]);

  const moveSelectionToNextPage = useCallback((ids: string[], positions?: Record<string, { x: number; y: number }>) => {
    if (ids.length === 0) return;
    setPages(prev => {
      const np = [...prev];
      const src = np[currentPageIdx];
      if (!src) return prev;
      const nextIdx = currentPageIdx + 1;
      if (nextIdx >= np.length) np.push({ id: pageId(), elements: [], backgroundOpacity: 0.5 });
      const moving = src.elements.filter(el => ids.includes(el.id));
      if (moving.length === 0) return prev;
      const minY = Math.min(...moving.map(el => positions?.[el.id]?.y ?? el.y));
      const tgt = np[nextIdx];
      const stackY = tgt.elements.length > 0
        ? Math.max(margins.top, Math.max(...tgt.elements.map(e => e.y + e.height)) + 16)
        : margins.top;
      const moved = moving.map(el => {
        const d = positions?.[el.id] ?? { x: el.x, y: el.y };
        const p = clampToMargins(el, d.x, stackY + (d.y - minY));
        return { ...el, x: p.x, y: p.y };
      });
      np[currentPageIdx] = { ...src, elements: src.elements.filter(el => !ids.includes(el.id)) };
      np[nextIdx] = { ...tgt, elements: [...tgt.elements, ...moved] };
      return np;
    });
    setCurrentPageIdx(prev => prev + 1);
    setSelectedIds(new Set(ids));
  }, [clampToMargins, currentPageIdx, margins.top]);

  const updateSelectedPosition = useCallback((axis: "x" | "y", value: number) => {
    if (!selected) return;
    const target = { x: axis === "x" ? value : selected.x, y: axis === "y" ? value : selected.y };
    if (axis === "y" && target.y + selected.height > A4_HEIGHT - margins.bottom) {
      moveSelectionToNextPage([selected.id], { [selected.id]: target });
      toast.info("Elemento movido para a próxima página.");
      return;
    }
    const np = clampToMargins(selected, target.x, target.y);
    updateSelected(np);
  }, [selected, margins.bottom, moveSelectionToNextPage, clampToMargins, updateSelected]);

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
      const cp = clampToMargins(el, x, y); el.x = cp.x; el.y = cp.y;
      setCurrentElements(prev => [...prev, el]);
      setSelectedIds(new Set([el.id]));
      setActiveTool("select");
    } else if (activeTool === "text") {
      const el = createDefaultElement("text", x, y);
      const cp = clampToMargins(el, x, y); el.x = cp.x; el.y = cp.y;
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
    const sel = window.getSelection();
    const selectedText = sel?.toString()?.trim() || "";
    setCtxSelectedText(selectedText);
    setCtxReplaceText("");
    setCtxReplaceVarSearch("");
    setCtxShowReplace(selectedText.length > 0);
    setContextMenu({ x: e.clientX - rect.left, y: e.clientY - rect.top });
    setVarSearch("");
  };

  const handleCtxReplace = (replaceWith: string, replaceAll: boolean) => {
    if (!ctxSelectedText) return;
    const escaped = ctxSelectedText.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    let totalCount = 0;

    // HTML-aware replacement: strip tags to find matches, then replace in HTML
    const replaceInHtml = (html: string, pattern: string, replacement: string, all: boolean) => {
      // Build a map of plain-text positions to HTML positions
      const tagRegex = /<[^>]*>/g;
      let plainText = "";
      const htmlToPlainMap: number[] = []; // htmlToPlainMap[htmlIdx] = plainIdx
      let inTag = false;
      let tagMatch;
      const tagRanges: { start: number; end: number }[] = [];
      while ((tagMatch = tagRegex.exec(html)) !== null) {
        tagRanges.push({ start: tagMatch.index, end: tagMatch.index + tagMatch[0].length });
      }
      let tagIdx = 0;
      for (let i = 0; i < html.length; i++) {
        if (tagIdx < tagRanges.length && i === tagRanges[tagIdx].start) {
          // Skip entire tag
          i = tagRanges[tagIdx].end - 1;
          tagIdx++;
          continue;
        }
        plainText += html[i];
        htmlToPlainMap.push(i);
      }

      const searchRegex = new RegExp(pattern, all ? "gi" : "i");
      const matches: { start: number; end: number }[] = [];
      let m;
      while ((m = searchRegex.exec(plainText)) !== null) {
        matches.push({ start: m.index, end: m.index + m[0].length });
        if (!all) break;
      }
      if (matches.length === 0) return html;

      // Replace from end to start to preserve positions
      let result = html;
      for (let i = matches.length - 1; i >= 0; i--) {
        const match = matches[i];
        const htmlStart = htmlToPlainMap[match.start];
        const htmlEnd = htmlToPlainMap[match.end - 1] + 1;
        // Remove any HTML tags between start and end, keep the structure
        result = result.substring(0, htmlStart) + replacement + result.substring(htmlEnd);
        totalCount++;
      }
      return result;
    };

    setPages(prev => prev.map(page => ({
      ...page,
      elements: page.elements.map(el => {
        if (el.type !== "text") return el;
        const plain = el.text.replace(/<[^>]*>/g, "");
        if (!new RegExp(escaped, "i").test(plain)) return el;
        const newText = replaceInHtml(el.text, escaped, replaceWith, replaceAll);
        return { ...el, text: newText };
      }),
    })));

    setTimeout(() => toast.success(`${totalCount} substituição(ões) realizada(s)`), 100);
    setContextMenu(null);
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
    const gid = `group_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
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

    // Locked elements: select but don't drag or edit
    if (el.locked) {
      setSelectedIds(new Set([el.id]));
      setEditingTextId(null);
      return;
    }

    // Single click only selects; double-click enters edit mode (handled in handleDoubleClick)
    // If already editing this element, don't start drag
    if (editingTextId === el.id) return;

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
    if (el.locked) return;
    setResizeState({ id: el.id, startX: e.clientX, startY: e.clientY, startW: el.width, startH: el.height, corner, startElX: el.x, startElY: el.y } as any);
  };

  const handleRotateMouseDown = (e: React.MouseEvent, el: CanvasElement) => {
    e.stopPropagation();
    e.preventDefault();
    if (el.locked) return;
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
        const GUIDE_SNAP = 6;

        // Detect which page the mouse is over for cross-page drag
        const scrollContainer = document.querySelector('[data-pages-scroll]');
        const pageGap = 40;

        setCurrentElements(prev => {
          const updated = prev.map(el => {
            const origin = dragState.origins[el.id];
            if (!origin) return el;
            // Free positioning - only snap to grid, no margin clamping
            let sx = snapToGrid(origin.x + dx);
            let sy = snapToGrid(origin.y + dy);
            // Snap to user guides
            for (const g of userGuides) {
              if (g.axis === "x") {
                const edges = [sx, sx + el.width / 2, sx + el.width];
                for (const edge of edges) {
                  if (Math.abs(edge - g.pos) < GUIDE_SNAP) { sx += g.pos - edge; break; }
                }
              } else {
                const edges = [sy, sy + el.height / 2, sy + el.height];
                for (const edge of edges) {
                  if (Math.abs(edge - g.pos) < GUIDE_SNAP) { sy += g.pos - edge; break; }
                }
              }
            }
            return { ...el, x: sx, y: sy };
          });
          setSmartGuides(computeSmartGuides(dragState.ids, updated));
          return updated;
        });
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
      // Dragging a user guide
      if (draggingGuide) {
        const delta = draggingGuide.axis === "x"
          ? (e.clientX - draggingGuide.startMouse) / zoom
          : (e.clientY - draggingGuide.startMouse) / zoom;
        const newPos = Math.max(0, Math.min(
          draggingGuide.axis === "x" ? A4_WIDTH : A4_HEIGHT,
          draggingGuide.startPos + delta
        ));
        setUserGuides(prev => prev.map(g => g.id === draggingGuide.id ? { ...g, pos: newPos } : g));
      }
    };
    const handleMouseUp = (e: MouseEvent) => {
      pendingEditRef.current = null;

      // Cross-page drag: detect elements that moved beyond page bounds
      if (dragState) {
        setPages(prev => {
          const srcPage = prev[currentPageIdx];
          if (!srcPage) return prev;
          const movedUp: CanvasElement[] = [];
          const movedDown: CanvasElement[] = [];
          const staying: CanvasElement[] = [];

          for (const el of srcPage.elements) {
            if (!dragState.ids.includes(el.id)) { staying.push(el); continue; }
            if (el.y + el.height < -10) { movedUp.push(el); }
            else if (el.y > A4_HEIGHT + 10) { movedDown.push(el); }
            else { staying.push(el); }
          }

          if (movedUp.length === 0 && movedDown.length === 0) return prev;

          const np = [...prev];
          np[currentPageIdx] = { ...srcPage, elements: staying };

          if (movedUp.length > 0 && currentPageIdx > 0) {
            const tgtPage = np[currentPageIdx - 1];
            const relocated = movedUp.map(el => ({ ...el, y: A4_HEIGHT + el.y }));
            np[currentPageIdx - 1] = { ...tgtPage, elements: [...tgtPage.elements, ...relocated] };
          }

          if (movedDown.length > 0) {
            const nextIdx = currentPageIdx + 1;
            if (nextIdx >= np.length) np.push({ id: pageId(), elements: [], backgroundOpacity: 0.5 });
            const tgtPage = np[nextIdx];
            const relocated = movedDown.map(el => ({ ...el, y: el.y - A4_HEIGHT }));
            np[nextIdx] = { ...tgtPage, elements: [...tgtPage.elements, ...relocated] };
          }

          if (movedUp.length > 0) {
            setTimeout(() => { setCurrentPageIdx(currentPageIdx - 1); setSelectedIds(new Set(movedUp.map(e => e.id))); }, 0);
          } else if (movedDown.length > 0) {
            setTimeout(() => { setCurrentPageIdx(currentPageIdx + 1); setSelectedIds(new Set(movedDown.map(e => e.id))); }, 0);
          }

          return np;
        });
        setDragState(null);
        setSmartGuides({ x: [], y: [] });
      }
      if (resizeState) setResizeState(null);
      if (rotateState) setRotateState(null);
      if (draggingGuide) {
        // Remove guide if dragged off canvas
        const g = userGuides.find(ug => ug.id === draggingGuide.id);
        if (g) {
          const max = g.axis === "x" ? A4_WIDTH : A4_HEIGHT;
          if (g.pos <= 2 || g.pos >= max - 2) {
            setUserGuides(prev => prev.filter(ug => ug.id !== draggingGuide.id));
            toast.info("Guia removida");
          }
        }
        setDraggingGuide(null);
      }
    };
    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);
    return () => { window.removeEventListener("mousemove", handleMouseMove); window.removeEventListener("mouseup", handleMouseUp); };
  }, [dragState, resizeState, rotateState, draggingGuide, userGuides, zoom, clampToMargins, computeSmartGuides, setCurrentElements]);

  // IntersectionObserver to track visible page during scroll
  useEffect(() => {
    const scrollContainer = document.querySelector('[data-pages-scroll]');
    if (!scrollContainer) return;
    const observer = new IntersectionObserver(
      (entries) => {
        let maxRatio = 0;
        let maxIdx = visiblePageIdx;
        entries.forEach(entry => {
          const idx = Number(entry.target.getAttribute('data-page-idx'));
          if (!isNaN(idx) && entry.intersectionRatio > maxRatio) {
            maxRatio = entry.intersectionRatio;
            maxIdx = idx;
          }
        });
        if (maxRatio > 0) setVisiblePageIdx(maxIdx);
      },
      { root: scrollContainer, threshold: [0, 0.25, 0.5, 0.75, 1] }
    );
    pageRefsMap.current.forEach((el) => observer.observe(el));
    return () => observer.disconnect();
  }, [pages.length, visiblePageIdx]);

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
        if (selectedIds.size > 0) {
          const hasLocked = elements.some(el => selectedIds.has(el.id) && el.locked);
          if (hasLocked) { toast.error("Desbloqueie os elementos antes de excluir"); return; }
          e.preventDefault(); deleteSelected();
        }
      }

      // Copy
      if ((e.ctrlKey || e.metaKey) && e.key === "c") {
        const selEls = elements.filter(el => selectedIds.has(el.id));
        if (selEls.length > 0) { e.preventDefault(); setClipboard(selEls.map(el => ({ ...el }))); toast.success(`${selEls.length} elemento(s) copiado(s)`); }
      }

      // Duplicate
      if ((e.ctrlKey || e.metaKey) && e.key === "d") {
        if (selectedIds.size > 0) {
          e.preventDefault();
          const newIds = new Set<string>();
          const selEls = elements.filter(el => selectedIds.has(el.id));
          const dups = selEls.map(el => {
            const dup = { ...el, id: genId(), x: el.x + 20, y: el.y + 20, zIndex: elements.length + 1 };
            newIds.add(dup.id);
            return dup;
          });
          setCurrentElements(prev => [...prev, ...dups]);
          setSelectedIds(newIds);
          toast.success(`${dups.length} elemento(s) duplicado(s)`);
        }
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
        } else {
          // No internal clipboard — try system clipboard
          e.preventDefault();
          (async () => {
            try {
              const items = await navigator.clipboard.read();
              let content = "";
              for (const item of items) {
                let html = "", plain = "";
                if (item.types.includes("text/plain")) { const b = await item.getType("text/plain"); plain = await b.text(); }
                if (item.types.includes("text/html")) { const b = await item.getType("text/html"); html = await b.text(); }
                content = sanitizeClipboard(html, plain);
                if (content) break;
              }
              if (!content) return;
              if (selectedIds.size > 0) {
                const selId = [...selectedIds][0];
                const selEl = elements.find(e => e.id === selId);
                const nextText = (selEl?.text || "") + content;
                setCurrentElements(prev => prev.map(el => el.id === selId ? { ...el, text: nextText } : el));
                if (selEl) {
                  const measuredNextHeight = measureHtmlHeight(nextText, selEl.width, {
                    fontFamily: selEl.fontFamily,
                    fontSize: selEl.fontSize,
                    fontWeight: selEl.fontWeight,
                    fontStyle: selEl.fontStyle,
                    textAlign: selEl.textAlign,
                    lineHeight: 1.4,
                  });
                  setTimeout(() => reflowElements(selId, Math.max(selEl.height, measuredNextHeight + 4), { text: nextText }), 50);
                }
                toast.success("Texto colado no elemento selecionado!");
              } else {
                const el = createDefaultElement("text", 100, 100);
                el.text = content;
                el.width = Math.min(500, Math.max(200, content.length * 4));
                el.height = Math.max(40, Math.ceil(content.length / 60) * 20);
                setCurrentElements(prev => [...prev, el]);
                setSelectedIds(new Set([el.id]));
                toast.success("Texto colado como novo elemento!");
              }
            } catch { /* clipboard not available, ignore */ }
          })();
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
          setCurrentElements(prev => prev.map(el => {
            if (!selectedIds.has(el.id) || el.locked) return el;
            const cp = clampToMargins(el, el.x + dx, el.y + dy);
            return { ...el, x: cp.x, y: cp.y };
          }));
        }
      }

      // Lock/Unlock selected (Ctrl+L)
      if ((e.ctrlKey || e.metaKey) && e.key === "l" && !e.shiftKey) {
        if (selectedIds.size > 0) {
          e.preventDefault();
          const selEls = elements.filter(el => selectedIds.has(el.id));
          const allLocked = selEls.every(el => el.locked);
          setCurrentElements(prev => prev.map(el => selectedIds.has(el.id) ? { ...el, locked: !allLocked } : el));
          toast.success(allLocked ? "Elemento(s) desbloqueado(s)" : "Elemento(s) bloqueado(s)");
        }
      }

      // Center on page (Ctrl+Shift+C)
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === "C") {
        if (selectedIds.size > 0) {
          e.preventDefault();
          setCurrentElements(prev => prev.map(el => {
            if (!selectedIds.has(el.id)) return el;
            return {
              ...el,
              x: (A4_WIDTH - el.width) / 2,
              y: (A4_HEIGHT - el.height) / 2,
            };
          }));
          toast.success("Elemento(s) centralizado(s) na página");
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
            html += `<div style="${baseStyle}font-family:${el.fontFamily};font-size:${el.fontSize}px;font-weight:${el.fontWeight};font-style:${el.fontStyle};text-decoration:${el.textDecoration};color:${el.color};-webkit-text-fill-color:${el.color};text-align:${el.textAlign};white-space:pre-wrap;overflow:hidden;word-wrap:break-word;">${forcePastedTextVisible(el.text || "", el.color || "#000000")}</div>`;
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
      // Page number
      html += `<div style="position:absolute;bottom:${Math.max(8, margins.bottom - 20)}px;right:${Math.max(12, margins.right)}px;font-size:10px;color:#888;font-family:Arial,sans-serif;">Página ${pageIdx + 1}/${pages.length}</div>`;
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
      await exportToPdf(pages);
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
      await exportToDocx(pages);
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
      await exportToXlsx(pages);
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
  const renderElement = (el: CanvasElement, _arrayIndex?: number, _array?: CanvasElement[]) => {
    const isSelected = selectedIds.has(el.id);
    const isPrimary = selectedId === el.id; // primary = first in set, shows resize/rotate handles
    const isEditing = el.id === editingTextId;

    // Outer wrapper handles positioning, selection outline, and resize handles
    const isGrouped = !!el.groupId;
    const isLocked = !!el.locked;
    const groupColor = isGrouped ? `hsl(${(el.groupId!.charCodeAt(6) * 37) % 360} 70% 55%)` : "";

    // Compute z-index: base from array position, boost for small variable-only elements
    const elIdx = elements.indexOf(el);
    const isVariableOnly = el.type === "text" && el.text && /^\s*\{\{[^}]+\}\}\s*$/.test(stripHtmlText(el.text));
    const baseZ = elIdx >= 0 ? elIdx + 1 : 1;
    const elZIndex = isVariableOnly ? baseZ + 1000 : (isSelected ? baseZ + 500 : baseZ);

    const wrapperStyle: React.CSSProperties = {
      position: "absolute", left: el.x, top: el.y, width: el.width,
      height: isEditing ? undefined : el.height,
      minHeight: isEditing ? el.height : undefined,
      zIndex: elZIndex,
      outline: isSelected 
        ? `2px ${isPrimary ? "solid" : "dashed"} ${isLocked ? "hsl(var(--destructive) / 0.6)" : "hsl(210 80% 55%)"}`
        : isGrouped ? `1px dashed ${groupColor}` : "none",
      outlineOffset: "1px",
      opacity: el.opacity ?? 1,
      transform: el.rotation ? `rotate(${el.rotation}deg)` : undefined,
      transformOrigin: "center center",
      cursor: isLocked ? "not-allowed" : undefined,
      overflow: isEditing ? "visible" : "hidden",
    };

    // Inner style fills the wrapper — no position/size needed
    const innerStyle: React.CSSProperties = {
      width: "100%", height: "100%", boxSizing: "border-box",
    };

    const handleDoubleClick = (e: React.MouseEvent) => {
      e.stopPropagation();
      if (editingBlurTimeoutRef.current) { clearTimeout(editingBlurTimeoutRef.current); editingBlurTimeoutRef.current = null; }
      if (el.type === "text" || el.type === "rect" || el.type === "circle") setEditingTextId(el.id);
    };

    // Auto-resize: delegates to shared reflowElements
    const autoResizeElement = (elId: string, textEl: HTMLElement, changedElUpdates?: Partial<CanvasElement>) => {
      const currentEl = elements.find(e => e.id === elId);
      if (!currentEl) return;

      const nextHtml = (changedElUpdates?.text as string | undefined) ?? textEl.innerHTML;
      const isFixedSectionText = !!currentPage && isGeneralConditionsElement({ ...currentEl, text: nextHtml }, currentPage);
      const { contentWidth, paddingY } = getTextContentMetrics(currentEl);
      const measuredHtmlHeight = measureHtmlHeight(nextHtml, contentWidth, {
        fontFamily: currentEl.fontFamily,
        fontSize: currentEl.fontSize,
        fontWeight: currentEl.fontWeight,
        fontStyle: currentEl.fontStyle,
        textAlign: currentEl.textAlign,
        lineHeight: 1.4,
      });
      const visualScrollHeight = textEl.scrollHeight;
      const minHeight = Math.max(20, currentEl.fontSize * 1.6);
      const contentBasedHeight = Math.max(minHeight, visualScrollHeight, measuredHtmlHeight + paddingY + 4);
      const newHeight = isFixedSectionText
        ? Math.max(currentEl.height, contentBasedHeight)
        : contentBasedHeight;

      reflowElements(elId, newHeight, changedElUpdates);
    };

    const syncEditedElementLayout = (elementId: string) => {
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          const target = editableRefs.current[elementId];
          if (!target) return;
          autoResizeElement(elementId, target, { text: target.innerHTML });
        });
      });
    };

    const insertManualBreak = (mode: "paragraph" | "line", root?: HTMLElement | null) => {
      const selection = window.getSelection();
      if (!selection || selection.rangeCount === 0) return false;

      const range = selection.getRangeAt(0);
      range.deleteContents();

      const commonContainer = range.commonAncestorContainer;
      const commonElement = (commonContainer.nodeType === Node.ELEMENT_NODE
        ? commonContainer as Element
        : commonContainer.parentElement);
      const editableRoot = root ?? (commonElement?.closest("[contenteditable='true']") as HTMLElement | null);

      if (mode === "paragraph") {
        const wrapper = document.createElement("div");
        const spacer = document.createElement("br");
        wrapper.appendChild(spacer);
        range.insertNode(wrapper);

        const trailingNode = wrapper.nextSibling;
        if (trailingNode && trailingNode.nodeType === Node.TEXT_NODE && trailingNode.textContent) {
          const trailingText = trailingNode.textContent;
          if (trailingText.trim()) {
            wrapper.removeChild(spacer);
            wrapper.appendChild(document.createTextNode(trailingText));
            trailingNode.textContent = "";
          }
        }

        range.selectNodeContents(wrapper);
        range.collapse(true);
      } else {
        const br = document.createElement("br");
        range.insertNode(br);
        if (!br.nextSibling) {
          br.parentNode?.insertBefore(document.createElement("br"), br.nextSibling);
        }
        range.setStartAfter(br);
        range.collapse(true);
      }

      range.collapse(true);

      selection.removeAllRanges();
      selection.addRange(range);
      editableRoot?.dispatchEvent(new Event("input", { bubbles: true }));
      return true;
    };

    // Rich-text exec command helper
    const execRichCmd = (command: string, value?: string) => {
      document.execCommand(command, false, value);
      syncEditedElementLayout(el.id);
    };

    const handleConvertToVariable = () => {
      const sel = window.getSelection();
      if (!sel || sel.rangeCount === 0 || sel.isCollapsed) {
        toast.error("Selecione um texto para converter em variável");
        return;
      }
      const selectedText = sel.toString().trim();
      if (!selectedText) return;
      const varName = selectedText.replace(/\s+/g, "_").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
      // Use execCommand to replace selection with variable marker
      document.execCommand("insertText", false, `{{${varName}}}`);
      toast.success(`"${selectedText}" → {{${varName}}}`);
    };

    const INLINE_COLORS = ["#000000", "#DC2626", "#2563EB", "#16A34A", "#D97706", "#7C3AED", "#DB2777"];
    const INLINE_FONT_SIZES = [8, 10, 12, 14, 16, 18, 20, 24, 28, 32, 36, 48];

    // Paste handler: sanitizes clipboard to visible plain text with line breaks
    const handlePaste = (e: React.ClipboardEvent<HTMLDivElement>) => {
      e.stopPropagation();
      e.preventDefault();
      const safeHtml = sanitizeClipboard(
        e.clipboardData.getData("text/html"),
        e.clipboardData.getData("text/plain"),
      );
      if (!safeHtml) return;
      const target = e.currentTarget;
      // Wrap pasted content in a span with explicit color to prevent invisible text
      const coloredHtml = forcePastedTextVisible(`<span>${safeHtml}</span>`, "#000000");
      const sel = window.getSelection();
      if (sel && sel.rangeCount > 0) {
        const range = sel.getRangeAt(0);
        range.deleteContents();
        const tmp = document.createElement("span");
        tmp.innerHTML = coloredHtml;
        const frag = document.createDocumentFragment();
        let lastNode: Node | null = null;
        while (tmp.firstChild) { lastNode = frag.appendChild(tmp.firstChild); }
        range.insertNode(frag);
        if (lastNode) { range.setStartAfter(lastNode); range.collapse(true); sel.removeAllRanges(); sel.addRange(range); }
      } else {
        target.innerHTML += coloredHtml;
      }
      syncEditedElementLayout(el.id);
    };

    const textContent = isEditing ? (
      <div style={{ position: "relative", width: "100%", minHeight: "100%" }}>
        {/* Floating rich-text toolbar */}
        <div
          style={{
            position: "absolute", top: -48, left: 0, zIndex: 99999,
            display: "flex", gap: 2, alignItems: "center",
            background: "hsl(var(--popover))",
            border: "1px solid hsl(var(--border))", borderRadius: 8,
            padding: "3px 6px", boxShadow: "0 4px 16px rgba(0,0,0,0.18)",
            whiteSpace: "nowrap", flexWrap: "nowrap",
          }}
          onClick={e => e.stopPropagation()}
          onMouseDown={e => { e.stopPropagation(); e.preventDefault(); }}
        >
          {/* Font size selector */}
          <select
            defaultValue={el.fontSize}
            onChange={e => {
              const size = e.target.value;
              execRichCmd("fontSize", "7"); // use largest size as placeholder
              // Replace font size with exact px via span
              const sel = window.getSelection();
              if (sel && sel.rangeCount > 0) {
                const container = sel.getRangeAt(0).commonAncestorContainer;
                const parent = container.nodeType === 3 ? container.parentElement : container as HTMLElement;
                const fonts = (parent?.closest?.("[contenteditable]") || parent)?.querySelectorAll?.('font[size="7"]');
                fonts?.forEach((font: Element) => {
                  const span = document.createElement("span");
                  span.style.fontSize = `${size}px`;
                  span.innerHTML = font.innerHTML;
                  font.replaceWith(span);
                });
              }
            }}
            onMouseDown={e => { e.stopPropagation(); }}
            style={{
              width: 52, height: 26, borderRadius: 4, fontSize: 11,
              border: "1px solid hsl(var(--border))", background: "hsl(var(--background))",
              color: "hsl(var(--foreground))", cursor: "pointer", padding: "0 2px",
            }}
            title="Tamanho da fonte"
          >
            {INLINE_FONT_SIZES.map(s => (
              <option key={s} value={s}>{s}px</option>
            ))}
          </select>

          <div style={{ width: 1, height: 20, background: "hsl(var(--border))", margin: "0 2px" }} />

          {/* Bold */}
          <button onClick={() => execRichCmd("bold")} title="Negrito (Ctrl+B)"
            style={{ width: 26, height: 26, borderRadius: 4, border: "none", cursor: "pointer",
              background: "transparent", fontWeight: "bold", fontSize: 13, color: "hsl(var(--foreground))",
              display: "flex", alignItems: "center", justifyContent: "center" }}
            onMouseOver={e => (e.currentTarget.style.background = "hsl(var(--accent))")}
            onMouseOut={e => (e.currentTarget.style.background = "transparent")}
          >B</button>
          {/* Italic */}
          <button onClick={() => execRichCmd("italic")} title="Itálico (Ctrl+I)"
            style={{ width: 26, height: 26, borderRadius: 4, border: "none", cursor: "pointer",
              background: "transparent", fontStyle: "italic", fontSize: 13, color: "hsl(var(--foreground))",
              display: "flex", alignItems: "center", justifyContent: "center" }}
            onMouseOver={e => (e.currentTarget.style.background = "hsl(var(--accent))")}
            onMouseOut={e => (e.currentTarget.style.background = "transparent")}
          >I</button>
          {/* Underline */}
          <button onClick={() => execRichCmd("underline")} title="Sublinhado (Ctrl+U)"
            style={{ width: 26, height: 26, borderRadius: 4, border: "none", cursor: "pointer",
              background: "transparent", textDecoration: "underline", fontSize: 13, color: "hsl(var(--foreground))",
              display: "flex", alignItems: "center", justifyContent: "center" }}
            onMouseOver={e => (e.currentTarget.style.background = "hsl(var(--accent))")}
            onMouseOut={e => (e.currentTarget.style.background = "transparent")}
          >U</button>
          {/* Strikethrough */}
          <button onClick={() => execRichCmd("strikeThrough")} title="Riscado"
            style={{ width: 26, height: 26, borderRadius: 4, border: "none", cursor: "pointer",
              background: "transparent", textDecoration: "line-through", fontSize: 13, color: "hsl(var(--foreground))",
              display: "flex", alignItems: "center", justifyContent: "center" }}
            onMouseOver={e => (e.currentTarget.style.background = "hsl(var(--accent))")}
            onMouseOut={e => (e.currentTarget.style.background = "transparent")}
          >S</button>

          <div style={{ width: 1, height: 20, background: "hsl(var(--border))", margin: "0 2px" }} />

          {/* Text alignment for selected text */}
          <button onClick={() => execRichCmd("justifyLeft")} title="Alinhar à esquerda"
            style={{ width: 26, height: 26, borderRadius: 4, border: "none", cursor: "pointer",
              background: "transparent", fontSize: 13, color: "hsl(var(--foreground))",
              display: "flex", alignItems: "center", justifyContent: "center" }}
            onMouseOver={e => (e.currentTarget.style.background = "hsl(var(--accent))")}
            onMouseOut={e => (e.currentTarget.style.background = "transparent")}
          >☰</button>
          <button onClick={() => execRichCmd("justifyCenter")} title="Centralizar"
            style={{ width: 26, height: 26, borderRadius: 4, border: "none", cursor: "pointer",
              background: "transparent", fontSize: 13, color: "hsl(var(--foreground))",
              display: "flex", alignItems: "center", justifyContent: "center" }}
            onMouseOver={e => (e.currentTarget.style.background = "hsl(var(--accent))")}
            onMouseOut={e => (e.currentTarget.style.background = "transparent")}
          >≡</button>
          <button onClick={() => execRichCmd("justifyRight")} title="Alinhar à direita"
            style={{ width: 26, height: 26, borderRadius: 4, border: "none", cursor: "pointer",
              background: "transparent", fontSize: 13, color: "hsl(var(--foreground))",
              display: "flex", alignItems: "center", justifyContent: "center" }}
            onMouseOver={e => (e.currentTarget.style.background = "hsl(var(--accent))")}
            onMouseOut={e => (e.currentTarget.style.background = "transparent")}
          >☰</button>

          <div style={{ width: 1, height: 20, background: "hsl(var(--border))", margin: "0 2px" }} />

          {/* Text colors */}
          {INLINE_COLORS.map(c => (
            <button key={c} onClick={() => execRichCmd("foreColor", c)} title={`Cor: ${c}`}
              style={{ width: 18, height: 18, borderRadius: 3, border: "1px solid hsl(var(--border))",
                background: c, cursor: "pointer", flexShrink: 0 }}
            />
          ))}

          <div style={{ width: 1, height: 20, background: "hsl(var(--border))", margin: "0 2px" }} />

          {/* Highlight */}
          <button onClick={() => execRichCmd("hiliteColor", "#fef08a")} title="Destacar amarelo"
            style={{ width: 26, height: 26, borderRadius: 4, border: "none", cursor: "pointer",
              background: "#fef08a", fontSize: 11, fontWeight: 600, color: "#854d0e",
              display: "flex", alignItems: "center", justifyContent: "center" }}
          >H</button>
          <button onClick={() => execRichCmd("removeFormat")} title="Limpar formatação"
            style={{ width: 26, height: 26, borderRadius: 4, border: "none", cursor: "pointer",
              background: "transparent", fontSize: 11, color: "hsl(var(--muted-foreground))",
              display: "flex", alignItems: "center", justifyContent: "center" }}
            onMouseOver={e => (e.currentTarget.style.background = "hsl(var(--accent))")}
            onMouseOut={e => (e.currentTarget.style.background = "transparent")}
          >✕</button>

          <div style={{ width: 1, height: 20, background: "hsl(var(--border))", margin: "0 2px" }} />

          {/* Paste from clipboard */}
          <button
            onClick={async () => {
              try {
                const items = await navigator.clipboard.read();
                const target = editableRefs.current[el.id];
                for (const item of items) {
                  let html = "", plain = "";
                  if (item.types.includes("text/plain")) { const b = await item.getType("text/plain"); plain = await b.text(); }
                  if (item.types.includes("text/html")) { const b = await item.getType("text/html"); html = await b.text(); }
                  const safe = forcePastedTextVisible(sanitizeClipboard(html, plain), "#000000");
                  if (!safe) continue;
                  document.execCommand("insertHTML", false, safe);
                  if (target) {
                    requestAnimationFrame(() => {
                      const nt = target.innerHTML;
                      autoResizeElement(el.id, target, { text: nt });
                    });
                  }
                  return;
                }
              } catch {
                toast.error("Não foi possível acessar a área de transferência. Use Ctrl+V.");
              }
            }}
            style={{
              fontSize: 10, padding: "2px 6px", borderRadius: 4,
              background: "hsl(var(--muted))", color: "hsl(var(--foreground))",
              border: "1px solid hsl(var(--border))", cursor: "pointer",
              display: "flex", alignItems: "center", gap: 3,
            }}
            title="Colar da área de transferência (Ctrl+V)"
          >
            📋 Colar
          </button>

          <div style={{ width: 1, height: 20, background: "hsl(var(--border))", margin: "0 2px" }} />

          {/* Variable buttons */}
          <button
            onClick={handleConvertToVariable}
            style={{
              fontSize: 10, padding: "2px 8px", borderRadius: 4,
              background: "hsl(var(--primary) / 0.1)", color: "hsl(var(--primary))",
              border: "1px solid hsl(var(--primary) / 0.3)", cursor: "pointer",
              fontWeight: 600, display: "flex", alignItems: "center", gap: 3,
            }}
            title="Selecione um texto e clique para converter em variável {{...}}"
          >
            {"{{ }}"} Var
          </button>
          <button
            onClick={() => {
              const varName = prompt("Nome da variável (sem {{ }}):");
              if (varName) {
                execRichCmd("insertText", `{{${varName.trim()}}}`);
              }
            }}
            style={{
              fontSize: 10, padding: "2px 6px", borderRadius: 4,
              background: "hsl(var(--muted))", color: "hsl(var(--foreground))",
              border: "1px solid hsl(var(--border))", cursor: "pointer",
            }}
            title="Inserir variável no cursor"
          >
            + Var
          </button>

          {/* Toggle format marks ¶ */}
          <div style={{ width: 1, height: 20, background: "hsl(var(--border))", margin: "0 2px" }} />
          <button
            onClick={() => setShowFormatMarks(prev => !prev)}
            style={{
              fontSize: 13, padding: "2px 6px", borderRadius: 4,
              background: showFormatMarks ? "hsl(var(--primary) / 0.15)" : "hsl(var(--muted))",
              color: showFormatMarks ? "hsl(var(--primary))" : "hsl(var(--foreground))",
              border: `1px solid ${showFormatMarks ? "hsl(var(--primary) / 0.4)" : "hsl(var(--border))"}`,
              cursor: "pointer", fontWeight: 600,
            }}
            title="Mostrar/ocultar marcadores de parágrafo (¶) e quebra de linha (↵)"
          >
            ¶
          </button>
        </div>
        <div
          contentEditable
          suppressContentEditableWarning
          ref={(ref) => {
            editableRefs.current[el.id] = ref;
            if (ref && !ref.dataset.initialized) {
              ref.innerHTML = el.text;
              ref.dataset.initialized = "1";
            }
          }}
          onFocus={(e) => {
            // Cancel any pending blur timeout when focus returns
            if (editingBlurTimeoutRef.current) {
              clearTimeout(editingBlurTimeoutRef.current);
              editingBlurTimeoutRef.current = null;
            }
          }}
          onInput={(e) => {
            // Debounce reflow during typing to avoid excessive re-renders
            const target = e.currentTarget as HTMLElement;
            const elId = el.id;
            if (reflowDebounceRef.current) clearTimeout(reflowDebounceRef.current);
            reflowDebounceRef.current = setTimeout(() => {
              const ref = editableRefs.current[elId];
              if (ref) {
                const newText = ref.innerHTML;
                autoResizeElement(elId, ref, { text: newText });
              }
            }, 250);
          }}
          onPaste={handlePaste}
          onBlur={(e) => {
            // Don't exit editing if focus moves to the toolbar or within the same element
            const related = e.relatedTarget as HTMLElement | null;
            if (related && (e.currentTarget.contains(related) || e.currentTarget.parentElement?.contains(related))) {
              return;
            }
            // Delay to allow click handlers on toolbar buttons to fire first
            if (editingBlurTimeoutRef.current) clearTimeout(editingBlurTimeoutRef.current);
            editingBlurTimeoutRef.current = setTimeout(() => {
              // Flush any pending debounced reflow
              if (reflowDebounceRef.current) {
                clearTimeout(reflowDebounceRef.current);
                reflowDebounceRef.current = null;
                const ref = editableRefs.current[el.id];
                if (ref) {
                  autoResizeElement(el.id, ref, { text: ref.innerHTML });
                }
              }
              setEditingTextId(null);
            }, 150);
          }}
          onKeyDown={(e) => {
            // Allow undo/redo shortcuts to bubble to the global handler
            if ((e.ctrlKey || e.metaKey) && (e.key === "z" || e.key === "y")) {
              return; // let it propagate
            }
            e.stopPropagation();
            if (e.key === "Escape") {
              setEditingTextId(null);
              return;
            }
            if (e.key === "Enter" && !e.ctrlKey && !e.metaKey && !e.altKey) {
              e.preventDefault();
              // Show floating hint
              const sel = window.getSelection();
              if (sel && sel.rangeCount > 0) {
                const rect = sel.getRangeAt(0).getBoundingClientRect();
                const hintText = e.shiftKey ? "Quebra de linha ↵" : "Novo parágrafo ¶";
                setEnterHint({ text: hintText, x: rect.left, y: rect.top - 28 });
                if (enterHintTimeoutRef.current) clearTimeout(enterHintTimeoutRef.current);
                enterHintTimeoutRef.current = setTimeout(() => setEnterHint(null), 1200);
              }
              const inserted = document.execCommand(
                "insertHTML",
                false,
                e.shiftKey ? "<br>" : "<div><br></div>",
              );
              if (!inserted) {
                insertManualBreak(e.shiftKey ? "line" : "paragraph", e.currentTarget as HTMLElement);
              } else {
                (e.currentTarget as HTMLElement).dispatchEvent(new Event("input", { bubbles: true }));
              }
              syncEditedElementLayout(el.id);
              return;
            }
            if (e.key === "Backspace" || e.key === "Delete") {
              // For structural keys, do an immediate resize after browser processes the key
              syncEditedElementLayout(el.id);
            }
          }}
          style={{
            width: "100%", minHeight: "100%", border: "none", outline: "none",
            background: "hsl(var(--primary) / 0.03)",
            fontFamily: el.fontFamily, fontSize: el.fontSize,
            fontWeight: el.fontWeight as any, fontStyle: el.fontStyle,
            textDecoration: el.textDecoration, color: el.color, textAlign: el.textAlign as any,
            padding: el.type === "text" ? 0 : 8, boxSizing: "border-box",
            whiteSpace: "pre-wrap", wordWrap: "break-word",
            cursor: "text", lineHeight: 1.4,
          }}
          className={showFormatMarks ? "show-format-marks" : undefined}
          onClick={e => e.stopPropagation()}
          onMouseDown={e => e.stopPropagation()}
        />
      </div>
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
          const normalizedDisplayText = forcePastedTextVisible(displayText || "", el.color || "#000000");
          if (normalizedDisplayText && (normalizedDisplayText.includes("<") || (previewVarsMode && normalizedDisplayText.includes("<table")))) {
            return <div dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(normalizedDisplayText) }} style={{ width: "100%", overflow: "hidden", color: el.color || "#000000", WebkitTextFillColor: el.color || "#000000" }} />;
          }
          return normalizedDisplayText || (el.type === "text" ? <span className="text-muted-foreground/40 italic text-xs">Clique para editar</span> : null);
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
        title={!isEditing && (el.type === "text" || el.type === "rect" || el.type === "circle") ? "Duplo-clique para editar" : undefined}
      >
        {innerContent}
        {/* Split continuation indicators */}
        {el.splitContinuationId && (
          <div style={{
            position: "absolute", bottom: -1, left: 0, right: 0, height: 20,
            borderTop: "2px dashed hsl(210 80% 55% / 0.6)",
            background: "linear-gradient(to bottom, hsl(210 80% 55% / 0.08), transparent)",
            display: "flex", alignItems: "center", justifyContent: "flex-end",
            paddingRight: 8, fontSize: 10, fontWeight: 600,
            color: "hsl(210 80% 45%)", pointerEvents: "none", zIndex: 9998,
          }}>
            Continua na próxima página ↓
          </div>
        )}
        {el.splitFrom && (
          <div style={{
            position: "absolute", top: -1, left: 0, right: 0, height: 20,
            borderBottom: "2px dashed hsl(150 60% 45% / 0.6)",
            background: "linear-gradient(to top, hsl(150 60% 45% / 0.08), transparent)",
            display: "flex", alignItems: "center", justifyContent: "flex-start",
            paddingLeft: 8, fontSize: 10, fontWeight: 600,
            color: "hsl(150 60% 35%)", pointerEvents: "none", zIndex: 9998,
          }}>
            ↑ Continuação da página anterior
          </div>
        )}
        {!isLocked && resizeHandles}
        {isLocked && (
          <div style={{
            position: "absolute", top: -8, right: -8, zIndex: 9999,
            width: 16, height: 16, borderRadius: "50%",
            background: "hsl(var(--destructive))", color: "white",
            display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: 9, pointerEvents: "none",
          }}>🔒</div>
        )}
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

        {/* Page margins - always visible */}
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
          <div className="flex gap-1">
            <Button variant="outline" size="sm" className="h-6 text-[10px] flex-1" onClick={() => setMargins({ top: 40, right: 40, bottom: 40, left: 40 })}>Padrão</Button>
            <Button variant="outline" size="sm" className="h-6 text-[10px] flex-1" onClick={() => setMargins({ top: 20, right: 20, bottom: 20, left: 20 })}>Estreita</Button>
            <Button variant="outline" size="sm" className="h-6 text-[10px] flex-1" onClick={() => setMargins({ top: 0, right: 0, bottom: 0, left: 0 })}>Nenhuma</Button>
          </div>
        </div>

        {/* Header & Footer config */}
        <div className="h-px bg-border" />
        <h3 className="font-semibold text-sm text-foreground">Cabeçalho & Rodapé</h3>
        <p className="text-[10px] text-muted-foreground">Repetidos automaticamente em todas as páginas. Use {"{{pagina}}"}, {"{{total_paginas}}"}, {"{{nome_cliente}}"} etc.</p>
        <HeaderFooterConfig label="Cabeçalho" settings={headerSettings} onChange={setHeaderSettings} />
        <HeaderFooterConfig label="Rodapé" settings={footerSettings} onChange={setFooterSettings} />
      </div>
    );
  };

  // Helper: insert {{nome_cliente}} on all pages below header area
  const insertNomeClienteOnPages = (pagesData: PageData[]): PageData[] => {
    // Only insert on the first page — continuation pages get it from chrome replication
    return pagesData.map((p, idx) => {
      if (idx > 0) return p; // Don't add to continuation/subsequent pages
      const hasClienteVar = p.elements.some(el => el.text?.includes("{{nome_cliente}}"));
      if (hasClienteVar) return p;
      const clienteEl = createDefaultElement("text", margins.left, margins.top + 90);
      clienteEl.text = "{{nome_cliente}}";
      clienteEl.fontSize = 13;
      clienteEl.fontWeight = "bold";
      clienteEl.color = "#333333";
      clienteEl.width = A4_WIDTH - margins.left - margins.right;
      clienteEl.height = 24;
      clienteEl.stroke = "transparent";
      clienteEl.strokeWidth = 0;
      return { ...p, elements: [...p.elements, clienteEl] };
    });
  };

  const applyTemplate = (tpl: ContractTemplate) => {
    const pagesData = tpl.pages.map(p => ({ ...p, id: pageId(), elements: p.elements.map(e => ({ ...e, id: genId() })) }));
    setPages(insertNomeClienteOnPages(pagesData));
    setCurrentPageIdx(0);
    setSelectedIds(new Set());
    setShowTemplates(false);
    if (tpl.id !== "em-branco") toast.success(`Template "${tpl.name}" aplicado!`);
  };

  const applyCustomTemplate = (ct: CustomTemplate) => {
    const pagesData = (ct.pages_data as PageData[]).map(p => ({ ...p, id: pageId(), elements: (p.elements || []).map(e => ({ ...e, id: genId() })) }));
    setPages(insertNomeClienteOnPages(pagesData));
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
      let logoUrl: string | null = null;

      // Try company_settings first (where the logo is saved in settings > empresa)
      const { data: companySettings } = await (supabase as any)
        .from("company_settings")
        .select("logo_url")
        .limit(1)
        .maybeSingle();

      if (companySettings?.logo_url) {
        logoUrl = companySettings.logo_url;
      }

      // Fallback to tenants table
      if (!logoUrl && tenantId) {
        const { data: tenant } = await (supabase as any)
          .from("tenants")
          .select("logo_url")
          .eq("id", tenantId)
          .single();
        if (tenant?.logo_url) logoUrl = tenant.logo_url;
      }

      if (!logoUrl) {
        toast.error("Nenhum logo encontrado. Configure o logo da empresa nas configurações → Empresa.");
        return;
      }
      
      const el = createDefaultElement("image", margins.left, margins.top);
      el.imageUrl = logoUrl;
      el.width = 180;
      el.height = 80;
      el.stroke = "transparent";
      el.strokeWidth = 0;
      const cp = clampToMargins(el, el.x, el.y);
      el.x = cp.x;
      el.y = cp.y;
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
                setActivePresetId(null);
              }}>+ Regra</Button>
              <Button variant="outline" size="sm" className="h-6 text-[10px]" onClick={() => setShowSavePreset(!showSavePreset)}>
                <BookmarkPlus className="h-3 w-3 mr-0.5" /> Salvar Preset
              </Button>
              <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => setShowConditionalPanel(false)}>
                <X className="h-3 w-3" />
              </Button>
            </div>
          </div>

          {/* Preset selector */}
          <div className="flex flex-wrap gap-1.5">
            {allPresets.map(preset => (
              <button
                key={preset.id}
                onClick={() => {
                  setConditionalRules(preset.rules.map(r => ({ ...r, id: `${r.id}_${Date.now()}` })));
                  setActivePresetId(preset.id);
                }}
                className={`flex items-center gap-1 rounded-full px-2.5 py-1 text-[10px] border transition-colors ${
                  activePresetId === preset.id
                    ? "border-primary bg-primary/10 text-primary font-semibold"
                    : "border-border bg-muted/30 text-foreground hover:bg-muted/60"
                }`}
              >
                <span>{preset.icon}</span>
                <span>{preset.name}</span>
                {!preset.builtIn && (
                  <span
                    onClick={e => {
                      e.stopPropagation();
                      const updated = customPresets.filter(p => p.id !== preset.id);
                      setCustomPresets(updated);
                      saveCustomPresets(updated);
                      if (activePresetId === preset.id) setActivePresetId(null);
                      toast.success(`Preset "${preset.name}" removido`);
                    }}
                    className="ml-0.5 text-destructive hover:text-destructive/80 cursor-pointer"
                    title="Remover preset"
                  >✕</span>
                )}
              </button>
            ))}
            <button
              onClick={() => {
                setConditionalRules([]);
                setActivePresetId(null);
              }}
              className={`flex items-center gap-1 rounded-full px-2.5 py-1 text-[10px] border transition-colors ${
                activePresetId === null && conditionalRules.length === 0
                  ? "border-muted-foreground bg-muted/40 text-muted-foreground font-semibold"
                  : "border-border bg-muted/30 text-muted-foreground hover:bg-muted/60"
              }`}
            >
              🚫 Nenhuma
            </button>
          </div>

          {/* Save preset form */}
          {showSavePreset && (
            <div className="flex items-center gap-2 bg-muted/30 rounded p-2">
              <input
                type="text" value={savePresetName}
                onChange={e => setSavePresetName(e.target.value)}
                placeholder="Nome do preset..."
                className="flex-1 rounded border border-border bg-background px-2 py-1 text-xs"
                autoFocus
                onKeyDown={e => {
                  if (e.key === "Enter" && savePresetName.trim()) {
                    const newPreset: ConditionalPreset = {
                      id: `custom_${Date.now()}`,
                      name: savePresetName.trim(),
                      icon: "⭐",
                      rules: conditionalRules.map(r => ({ ...r })),
                    };
                    const updated = [...customPresets, newPreset];
                    setCustomPresets(updated);
                    saveCustomPresets(updated);
                    setActivePresetId(newPreset.id);
                    setSavePresetName("");
                    setShowSavePreset(false);
                    toast.success(`Preset "${newPreset.name}" salvo!`);
                  }
                }}
              />
              <Button variant="default" size="sm" className="h-7 text-[10px]" disabled={!savePresetName.trim()} onClick={() => {
                if (!savePresetName.trim()) return;
                const newPreset: ConditionalPreset = {
                  id: `custom_${Date.now()}`,
                  name: savePresetName.trim(),
                  icon: "⭐",
                  rules: conditionalRules.map(r => ({ ...r })),
                };
                const updated = [...customPresets, newPreset];
                setCustomPresets(updated);
                saveCustomPresets(updated);
                setActivePresetId(newPreset.id);
                setSavePresetName("");
                setShowSavePreset(false);
                toast.success(`Preset "${newPreset.name}" salvo!`);
              }}>
                <Save className="h-3 w-3 mr-0.5" /> Salvar
              </Button>
              <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => { setShowSavePreset(false); setSavePresetName(""); }}>
                <X className="h-3 w-3" />
              </Button>
            </div>
          )}

          {/* Rules list */}
          <div className="space-y-1.5 max-h-[160px] overflow-y-auto">
            {conditionalRules.map((rule, idx) => (
              <div key={rule.id} className="flex items-center gap-2 text-[11px] bg-muted/30 rounded px-2 py-1.5">
                <select
                  value={rule.type}
                  onChange={e => {
                    const updated = [...conditionalRules];
                    updated[idx] = { ...rule, type: e.target.value as ConditionalRule["type"] };
                    setConditionalRules(updated);
                    setActivePresetId(null);
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
                      setActivePresetId(null);
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
                        setActivePresetId(null);
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
                    setActivePresetId(null);
                  }} className="h-5 w-5 cursor-pointer rounded border border-border" />
                  <label className="text-[10px] text-muted-foreground">Texto</label>
                  <input type="color" value={rule.textColor} onChange={e => {
                    const updated = [...conditionalRules];
                    updated[idx] = { ...rule, textColor: e.target.value };
                    setConditionalRules(updated);
                    setActivePresetId(null);
                  }} className="h-5 w-5 cursor-pointer rounded border border-border" />
                  <label className="flex items-center gap-0.5 text-[10px] text-muted-foreground">
                    <input type="checkbox" checked={rule.bold || false} onChange={e => {
                      const updated = [...conditionalRules];
                      updated[idx] = { ...rule, bold: e.target.checked };
                      setConditionalRules(updated);
                      setActivePresetId(null);
                    }} className="h-3 w-3" />
                    <strong>N</strong>
                  </label>
                  <Button variant="ghost" size="icon" className="h-5 w-5" onClick={() => {
                    setConditionalRules(prev => prev.filter(r => r.id !== rule.id));
                    setActivePresetId(null);
                  }}>
                    <Trash2 className="h-3 w-3 text-destructive" />
                  </Button>
                </div>
              </div>
            ))}
            {conditionalRules.length === 0 && (
              <p className="text-[11px] text-muted-foreground text-center py-2">Nenhuma regra ativa. Selecione um preset ou adicione regras.</p>
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

        {/* Guias */}
        {userGuides.length > 0 && (
          <>
            <Separator orientation="vertical" className="mx-1 h-6" />
            <span className="text-[10px] text-muted-foreground shrink-0">{userGuides.length} guia(s)</span>
            <Button variant="ghost" size="sm" className="h-8 text-[10px] shrink-0 text-destructive" onClick={() => { setUserGuides([]); toast.info("Todas as guias removidas"); }} title="Remover todas as guias">
              ✕ Limpar guias
            </Button>
          </>
        )}

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
        {/* Left sidebar: thumbnails + layers */}
        <div className="w-48 min-h-0 border-r border-border bg-muted/20 overflow-y-auto flex flex-col">
          {/* Page thumbnails */}
          <div className="p-2 space-y-2 shrink-0">
            <h4 className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider px-1">Páginas</h4>
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

          {/* Layers panel */}
          <div className="border-t border-border">
            <button
              onClick={() => setShowLayersPanel(!showLayersPanel)}
              className="w-full flex items-center gap-1.5 px-2 py-1.5 text-[11px] font-semibold text-muted-foreground uppercase tracking-wider hover:bg-muted/40 transition-colors"
            >
              <Layers className="h-3.5 w-3.5" />
              Camadas
              <span className="ml-auto text-[10px]">{showLayersPanel ? "▾" : "▸"}</span>
            </button>
            {showLayersPanel && (
              <div className="px-2 pb-2">
                <ContractLayersPanel
                  elements={elements}
                  selectedIds={selectedIds}
                  onSelect={setSelectedIds}
                  onUpdate={setCurrentElements}
                  hiddenIds={hiddenIds}
                  onToggleHidden={(id) => setHiddenIds(prev => {
                    const next = new Set(prev);
                    if (next.has(id)) next.delete(id); else next.add(id);
                    return next;
                  })}
                />
              </div>
            )}
          </div>

          {/* Sections order panel */}
          <div className="border-t border-border">
            <button
              onClick={() => setShowSectionsPanel(!showSectionsPanel)}
              className="w-full flex items-center gap-1.5 px-2 py-1.5 text-[11px] font-semibold text-muted-foreground uppercase tracking-wider hover:bg-muted/40 transition-colors"
            >
              <ListOrdered className="h-3.5 w-3.5" />
              Ordem das Seções
              <span className="ml-auto text-[10px]">{showSectionsPanel ? "▾" : "▸"}</span>
            </button>
            <label className="flex items-center gap-1.5 px-2 py-1 cursor-pointer hover:bg-muted/40 transition-colors">
              <input
                type="checkbox"
                checked={showPageBreakIndicators}
                onChange={e => setShowPageBreakIndicators(e.target.checked)}
                className="rounded h-3 w-3"
              />
              <span className="text-[10px] text-muted-foreground">Indicadores de quebra</span>
            </label>
            {showSectionsPanel && (
              <div className="px-2 pb-2">
                <ContractSectionsPanel
                  pages={pages}
                  currentPageIdx={currentPageIdx}
                  onReorderPages={(nextPages) => {
                    setPages(nextPages);
                    setSelectedIds(new Set());
                    toast.success("Ordem das seções atualizada");
                  }}
                />
              </div>
            )}
          </div>

          {/* Find & Replace panel */}
          <div className="border-t border-border">
            <button
              onClick={() => setShowFindReplace(!showFindReplace)}
              className="w-full flex items-center gap-1.5 px-2 py-1.5 text-[11px] font-semibold text-muted-foreground uppercase tracking-wider hover:bg-muted/40 transition-colors"
            >
              <Search className="h-3.5 w-3.5" />
              Localizar e Substituir
              <span className="ml-auto text-[10px]">{showFindReplace ? "▾" : "▸"}</span>
            </button>
            {showFindReplace && (
              <div className="px-2 pb-2 space-y-2">
                <div className="space-y-1">
                  <label className="text-[10px] text-muted-foreground font-medium">Localizar</label>
                  <Input
                    value={findText}
                    onChange={e => setFindText(e.target.value)}
                    onKeyDown={e => { if (e.key === "Enter") handleFind(); }}
                    placeholder="Ex: INOVAMAD"
                    className="h-7 text-xs"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] text-muted-foreground font-medium">Substituir por</label>
                  <Input
                    value={replaceText}
                    onChange={e => setReplaceText(e.target.value)}
                    onKeyDown={e => { if (e.key === "Enter") handleReplaceAll(); }}
                    placeholder="Ex: {{empresa_nome}}"
                    className="h-7 text-xs"
                  />
                </div>
                <div className="flex gap-1">
                  <Button variant="outline" size="sm" className="h-7 text-[10px] flex-1" onClick={handleFind}>
                    <Search className="h-3 w-3 mr-1" /> Localizar
                  </Button>
                  <Button variant="default" size="sm" className="h-7 text-[10px] flex-1" onClick={handleReplaceAll} disabled={!findText.trim()}>
                    <Replace className="h-3 w-3 mr-1" /> Substituir Tudo
                  </Button>
                </div>
                {findResults.length > 0 && (
                  <div className="space-y-1 max-h-[120px] overflow-y-auto">
                    {findResults.map((r, i) => (
                      <button
                        key={`${r.elId}-${i}`}
                        className="w-full text-left text-[10px] px-2 py-1 rounded hover:bg-accent transition-colors flex items-center justify-between"
                        onClick={() => {
                          setCurrentPageIdx(r.pageIdx);
                          setSelectedIds(new Set([r.elId]));
                          const target = pageRefsMap.current.get(r.pageIdx);
                          if (target) target.scrollIntoView({ behavior: "smooth", block: "start" });
                        }}
                      >
                        <span className="text-foreground">Pág. {r.pageIdx + 1}</span>
                        <span className="text-muted-foreground">{r.count}x</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
        {/* Canvas area with Word-like feel — all pages stacked vertically */}
        <div className="flex-1 min-w-0 min-h-0 relative">
          <div className="absolute inset-0 overflow-auto" data-pages-scroll style={{ background: "hsl(var(--muted) / 0.6)" }}>
          {/* Floating page indicator */}
          {pages.length > 1 && (
            <div style={{
              position: "sticky", top: 8, zIndex: 100, display: "flex", justifyContent: "center",
              pointerEvents: "none", marginBottom: -32,
            }}>
              <div style={{
                pointerEvents: "auto",
                background: "hsl(var(--background) / 0.95)", border: "1px solid hsl(var(--border))",
                borderRadius: 20, padding: "4px 12px",
                fontSize: 11, fontWeight: 600, color: "hsl(var(--foreground))",
                boxShadow: "0 2px 8px rgba(0,0,0,0.12)",
                display: "flex", alignItems: "center", gap: 8,
              }}>
                {pages.map((_, idx) => (
                  <button
                    key={idx}
                    onClick={() => {
                      const el = pageRefsMap.current.get(idx);
                      if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
                      setCurrentPageIdx(idx);
                      setSelectedIds(new Set());
                    }}
                    style={{
                      width: idx === visiblePageIdx ? 24 : 8,
                      height: 8,
                      borderRadius: 4,
                      border: "none",
                      cursor: "pointer",
                      transition: "all 0.2s",
                      background: idx === visiblePageIdx
                        ? "hsl(var(--primary))"
                        : idx === currentPageIdx
                          ? "hsl(var(--primary) / 0.4)"
                          : "hsl(var(--muted-foreground) / 0.3)",
                    }}
                    title={`Página ${idx + 1}`}
                  />
                ))}
                <span style={{ fontSize: 10, color: "hsl(var(--muted-foreground))", marginLeft: 4 }}>
                  {visiblePageIdx + 1}/{pages.length}
                </span>
              </div>
            </div>
          )}
          <div className="flex flex-col items-center py-6 px-4" style={{ minWidth: A4_WIDTH * zoom + RULER_SIZE + 48 }}>
            {pages.map((page, pageIdx) => {
              const isActivePage = pageIdx === currentPageIdx;
              const pageElements = page.elements || [];
              return (
                <div key={page.id} data-page-idx={pageIdx} ref={el => { if (el) pageRefsMap.current.set(pageIdx, el); else pageRefsMap.current.delete(pageIdx); }} style={{ marginBottom: 40, flexShrink: 0 }}>
                  <div
                    style={{
                      position: "relative",
                      width: A4_WIDTH * zoom + RULER_SIZE,
                      height: A4_HEIGHT * zoom + RULER_SIZE,
                      flexShrink: 0,
                    }}
                    onMouseDown={() => {
                      if (currentPageIdx !== pageIdx) {
                        setCurrentPageIdx(pageIdx);
                        setSelectedIds(new Set());
                        setEditingTextId(null);
                      }
                    }}
                  >
                    {/* Horizontal ruler */}
                    {isActivePage && (
                      <div
                        style={{
                          position: "absolute", left: RULER_SIZE, top: 0, width: A4_WIDTH * zoom, height: RULER_SIZE,
                          background: "hsl(var(--background))", borderBottom: "1px solid hsl(var(--border))", boxSizing: "border-box", overflow: "hidden",
                          cursor: "col-resize",
                        }}
                        onClick={(e) => {
                          const rect = e.currentTarget.getBoundingClientRect();
                          const pos = (e.clientX - rect.left) / zoom;
                          const id = `guide_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
                          setUserGuides(prev => [...prev, { id, axis: "x", pos }]);
                        }}
                      >
                        {Array.from({ length: Math.ceil(A4_WIDTH / 50) + 1 }).map((_, i) => {
                          const v = i * 50;
                          const major = v % 100 === 0;
                          return (
                            <div key={`rh${v}`} style={{ position: "absolute", left: v * zoom, top: 0, bottom: 0, width: 1 }}>
                              <div style={{ position: "absolute", bottom: 0, width: 1, height: major ? 14 : 8, background: "hsl(var(--border))" }} />
                              {major && <span style={{ position: "absolute", top: 2, left: 3, fontSize: 8, color: "hsl(var(--muted-foreground))", userSelect: "none" }}>{v}</span>}
                            </div>
                          );
                        })}
                        {userGuides.filter(g => g.axis === "x").map(g => (
                          <div key={g.id} style={{
                            position: "absolute", left: g.pos * zoom - 3, top: 0, bottom: 0, width: 7,
                            display: "flex", alignItems: "flex-end", justifyContent: "center",
                          }}>
                            <div style={{ width: 0, height: 0, borderLeft: "4px solid transparent", borderRight: "4px solid transparent", borderTop: "5px solid hsl(var(--chart-4))" }} />
                          </div>
                        ))}
                      </div>
                    )}
                    {/* Vertical ruler */}
                    {isActivePage && (
                      <div
                        style={{
                          position: "absolute", left: 0, top: RULER_SIZE, width: RULER_SIZE, height: A4_HEIGHT * zoom,
                          background: "hsl(var(--background))", borderRight: "1px solid hsl(var(--border))", boxSizing: "border-box", overflow: "hidden",
                          cursor: "row-resize",
                        }}
                        onClick={(e) => {
                          const rect = e.currentTarget.getBoundingClientRect();
                          const pos = (e.clientY - rect.top) / zoom;
                          const id = `guide_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
                          setUserGuides(prev => [...prev, { id, axis: "y", pos }]);
                        }}
                      >
                        {Array.from({ length: Math.ceil(A4_HEIGHT / 50) + 1 }).map((_, i) => {
                          const v = i * 50;
                          const major = v % 100 === 0;
                          return (
                            <div key={`rv${v}`} style={{ position: "absolute", top: v * zoom, left: 0, right: 0, height: 1 }}>
                              <div style={{ position: "absolute", right: 0, height: 1, width: major ? 14 : 8, background: "hsl(var(--border))" }} />
                              {major && <span style={{ position: "absolute", top: 2, left: 2, fontSize: 8, color: "hsl(var(--muted-foreground))", userSelect: "none" }}>{v}</span>}
                            </div>
                          );
                        })}
                        {isActivePage && userGuides.filter(g => g.axis === "y").map(g => (
                          <div key={g.id} style={{
                            position: "absolute", top: g.pos * zoom - 3, left: 0, right: 0, height: 7,
                            display: "flex", alignItems: "center", justifyContent: "flex-end",
                          }}>
                            <div style={{ width: 0, height: 0, borderTop: "4px solid transparent", borderBottom: "4px solid transparent", borderLeft: "5px solid hsl(var(--chart-4))" }} />
                          </div>
                        ))}
                      </div>
                    )}
                    {/* Corner box */}
                    {isActivePage && (
                      <div style={{ position: "absolute", left: 0, top: 0, width: RULER_SIZE, height: RULER_SIZE, background: "hsl(var(--muted))", borderRight: "1px solid hsl(var(--border))", borderBottom: "1px solid hsl(var(--border))", boxSizing: "border-box" }} />
                    )}
                    <div
                      ref={isActivePage ? canvasRef : undefined}
                      style={{
                        position: "absolute", left: isActivePage ? RULER_SIZE : 0, top: isActivePage ? RULER_SIZE : 0,
                        width: A4_WIDTH * zoom, height: A4_HEIGHT * zoom,
                        background: "#fff",
                        boxShadow: isActivePage
                          ? "0 4px 24px rgba(0,0,0,0.12), 0 1px 4px rgba(0,0,0,0.08)"
                          : "0 2px 12px rgba(0,0,0,0.08)",
                        overflow: "hidden",
                        outline: isActivePage ? "2px solid hsl(var(--primary) / 0.4)" : "none",
                        outlineOffset: 2,
                      }}
                      onMouseDown={isActivePage ? handleCanvasMouseDown : undefined}
                      onContextMenu={isActivePage ? handleContextMenu : undefined}
                    >
                      {/* Background image */}
                      {page.backgroundImage && (
                        <img
                          src={page.backgroundImage}
                          alt=""
                          style={{
                            position: "absolute", top: 0, left: 0,
                            width: A4_WIDTH * zoom, height: A4_HEIGHT * zoom,
                            objectFit: "contain", pointerEvents: "none",
                            opacity: page.backgroundOpacity,
                          }}
                        />
                      )}
                      {/* Scaled inner */}
                      <div data-canvas-bg style={{ transform: `scale(${zoom})`, transformOrigin: "0 0", width: A4_WIDTH, height: A4_HEIGHT, position: "relative" }}>
                        {/* Margin guides */}
                        {isActivePage && (
                          <div style={{ position: "absolute", top: margins.top, left: margins.left, right: margins.right, bottom: margins.bottom, border: "1px dashed hsl(var(--primary) / 0.35)", pointerEvents: "none", zIndex: 1 }} />
                        )}
                        {/* Page bottom limit indicator */}
                        {isActivePage && (
                          <div style={{
                            position: "absolute", left: 0, right: 0, top: A4_HEIGHT - margins.bottom,
                            borderTop: "2px dashed hsl(var(--destructive) / 0.55)", pointerEvents: "none", zIndex: 2,
                          }}>
                            <span style={{
                              position: "absolute", right: 4, top: -16,
                              fontSize: 9, color: "hsl(var(--destructive) / 0.9)", fontWeight: 600,
                              background: "hsl(var(--background) / 0.92)", padding: "1px 5px", borderRadius: 3,
                            }}>
                              Limite da página
                            </span>
                          </div>
                        )}
                        {/* Section break preview indicators */}
                        {isActivePage && showPageBreakIndicators && (() => {
                          const reservedFooterTop = footerSettings.enabled
                            ? A4_HEIGHT - Math.max(4, margins.bottom - footerSettings.height - 4) - footerSettings.height - 8
                            : A4_HEIGHT - margins.bottom;
                          const pageBottom = Math.min(A4_HEIGHT - margins.bottom, reservedFooterTop);

                          // Detect sections on this page
                          const sortedEls = pageElements
                            .filter(el => !hiddenIds.has(el.id))
                            .sort((a, b) => a.y - b.y);

                          const indicators: React.ReactNode[] = [];

                          for (let i = 0; i < sortedEls.length; i++) {
                            const el = sortedEls[i];
                            if (!isSectionTitleElement(el)) continue;

                            // Gather section elements (title + following non-title elements)
                            let sectionBottom = el.y + el.height;
                            let j = i + 1;
                            while (j < sortedEls.length && !isSectionTitleElement(sortedEls[j])) {
                              sectionBottom = Math.max(sectionBottom, sortedEls[j].y + sortedEls[j].height);
                              j++;
                            }

                            const sectionHeight = sectionBottom - el.y;
                            const pageCapacity = pageBottom - margins.top;
                            const fitsOnPage = sectionHeight <= pageCapacity;
                            const overflows = sectionBottom > pageBottom;

                            if (overflows && fitsOnPage) {
                              // Section would be moved entirely to next page
                              indicators.push(
                                <div
                                  key={`section-break-${el.id}`}
                                  style={{
                                    position: "absolute",
                                    left: Math.max(el.x - 4, margins.left),
                                    top: el.y - 2,
                                    right: margins.right,
                                    height: sectionBottom - el.y + 4,
                                    border: "2px dashed hsl(30 90% 50% / 0.5)",
                                    borderRadius: 6,
                                    background: "hsl(30 90% 50% / 0.04)",
                                    pointerEvents: "none",
                                    zIndex: 2,
                                  }}
                                >
                                  <span style={{
                                    position: "absolute",
                                    top: -10,
                                    left: 8,
                                    fontSize: 9,
                                    fontWeight: 600,
                                    color: "hsl(30 90% 40%)",
                                    background: "hsl(var(--background) / 0.95)",
                                    padding: "1px 6px",
                                    borderRadius: 3,
                                    whiteSpace: "nowrap",
                                  }}>
                                    ⚠ Seção será movida para a próxima página
                                  </span>
                                </div>,
                              );
                            } else if (overflows && !fitsOnPage) {
                              // Section is too large, will be split
                              indicators.push(
                                <div
                                  key={`section-split-${el.id}`}
                                  style={{
                                    position: "absolute",
                                    left: 0,
                                    right: 0,
                                    top: pageBottom - 1,
                                    height: 0,
                                    borderTop: "2px dashed hsl(210 80% 55% / 0.5)",
                                    pointerEvents: "none",
                                    zIndex: 2,
                                  }}
                                >
                                  <span style={{
                                    position: "absolute",
                                    left: 8,
                                    top: 2,
                                    fontSize: 9,
                                    fontWeight: 600,
                                    color: "hsl(210 80% 45%)",
                                    background: "hsl(var(--background) / 0.95)",
                                    padding: "1px 6px",
                                    borderRadius: 3,
                                    whiteSpace: "nowrap",
                                  }}>
                                    ✂ Texto será dividido entre páginas
                                  </span>
                                </div>,
                              );
                            }
                          }

                          return indicators;
                        })()}
                        {/* Continuation pages counter for fixed sections */}
                        {isActivePage && showPageBreakIndicators && (() => {
                          // Find elements on this page that have splitContinuationId (text continues on next page)
                          const splitEls = pageElements.filter(el =>
                            el.splitContinuationId && el.type === "text" && el.text
                          );
                          if (splitEls.length === 0) return null;

                          // Count how many continuation pages exist for each split chain
                          return splitEls.map(el => {
                            // Check if this is a fixed-section element
                            const isFixedSection = FIXED_SECTION_PATTERNS.some(pat =>
                              pageElements.some(other =>
                                other.id !== el.id && other.type === "text"
                                && FIXED_SECTION_PATTERNS.some(p => p.test(stripHtmlText(other.text)))
                                && other.y < el.y
                              )
                            );
                            if (!isFixedSection) return null;

                            // Count continuation pages and find last page index
                            let continuationCount = 0;
                            let currentId = el.id;
                            let lastContPageIdx = pageIdx;
                            for (let pi = 0; pi < pages.length; pi++) {
                              const cont = pages[pi].elements.find(e => e.splitFrom === currentId);
                              if (cont) {
                                continuationCount++;
                                currentId = cont.id;
                                lastContPageIdx = pi;
                              }
                            }

                            if (continuationCount === 0) return null;

                            return (
                              <div
                                key={`continuation-count-${el.id}`}
                                style={{
                                  position: "absolute",
                                  right: el.x + el.width - 8,
                                  top: el.y - 1,
                                  zIndex: 10,
                                  pointerEvents: "auto",
                                  cursor: "pointer",
                                }}
                                title={`Ir para última página de continuação (página ${lastContPageIdx + 1})`}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  const target = pageRefsMap.current.get(lastContPageIdx);
                                  if (target) target.scrollIntoView({ behavior: "smooth", block: "start" });
                                  setCurrentPageIdx(lastContPageIdx);
                                  setSelectedIds(new Set());
                                }}
                              >
                                <span style={{
                                  display: "inline-flex",
                                  alignItems: "center",
                                  gap: 4,
                                  fontSize: 10,
                                  fontWeight: 700,
                                  color: "hsl(210 80% 45%)",
                                  background: "hsl(210 80% 96%)",
                                  border: "1px solid hsl(210 80% 80%)",
                                  padding: "2px 8px",
                                  borderRadius: 12,
                                  whiteSpace: "nowrap",
                                  boxShadow: "0 1px 4px rgba(0,0,0,0.08)",
                                }}>
                                  📄 +{continuationCount} {continuationCount === 1 ? "página" : "páginas"} →
                                </span>
                              </div>
                            );
                          });
                        })()}
                        {isActivePage
                          ? pageElements.filter(el => !hiddenIds.has(el.id)).map(renderElement)
                          : pageElements.map(el => {
                              // Simplified read-only rendering for non-active pages
                              const wStyle: React.CSSProperties = {
                                position: "absolute", left: el.x, top: el.y, width: el.width, height: el.height,
                                opacity: el.opacity ?? 1,
                                transform: el.rotation ? `rotate(${el.rotation}deg)` : undefined,
                                transformOrigin: "center center",
                                overflow: "hidden",
                              };
                              // Apply variable preview on all pages
                              const resolveText = (txt: string | undefined) => {
                                if (!txt) return "";
                                return previewVarsMode ? replaceVariablesWithSample(txt) : txt;
                              };
                              let content: React.ReactNode = null;
                              switch (el.type) {
                                case "rect":
                                  content = (
                                    <div style={{ width: "100%", height: "100%", background: el.fill, border: `${el.strokeWidth}px solid ${el.stroke}`, borderRadius: el.borderRadius, boxSizing: "border-box" }}>
                                      {el.text && <div style={{ padding: 8, fontFamily: el.fontFamily, fontSize: el.fontSize, fontWeight: el.fontWeight, fontStyle: el.fontStyle, color: el.color, textAlign: el.textAlign as any, whiteSpace: "pre-wrap", wordWrap: "break-word", overflow: "hidden" }} dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(resolveText(el.text)) }} />}
                                    </div>
                                  );
                                  break;
                                case "circle":
                                  content = <div style={{ width: "100%", height: "100%", background: el.fill, border: `${el.strokeWidth}px solid ${el.stroke}`, borderRadius: "50%", boxSizing: "border-box", overflow: "hidden" }} />;
                                  break;
                                case "line":
                                  content = <div style={{ width: "100%", height: "100%", borderTop: `${el.strokeWidth}px solid ${el.stroke}` }} />;
                                  break;
                                case "text":
                                  content = (
                                    <div style={{ width: "100%", height: "100%", fontFamily: el.fontFamily, fontSize: el.fontSize, fontWeight: el.fontWeight, fontStyle: el.fontStyle, color: el.color, textAlign: el.textAlign as any, whiteSpace: "pre-wrap", wordWrap: "break-word", overflow: "hidden" }} dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(resolveText(el.text)) }} />
                                  );
                                  break;
                                case "image":
                                  content = el.imageUrl ? <img src={el.imageUrl} alt="" style={{ width: "100%", height: "100%", objectFit: "contain" }} draggable={false} /> : null;
                                  break;
                                case "table":
                                  if (el.tableData) {
                                    content = (
                                      <table style={{ width: "100%", height: "100%", borderCollapse: "collapse", fontFamily: el.fontFamily, fontSize: el.fontSize, color: el.color, tableLayout: "fixed" }}>
                                        <tbody>
                                          {el.tableData.map((row, ri) => (
                                            <tr key={ri}>
                                              {row.map((cell, ci) => (
                                                <td key={ci} style={{ border: `1px solid ${el.stroke}`, padding: "2px 6px", background: ri === 0 ? el.stroke : el.fill, color: ri === 0 ? "#ffffff" : el.color, fontWeight: ri === 0 ? "bold" : "normal" }}>{resolveText(cell)}</td>
                                              ))}
                                            </tr>
                                          ))}
                                        </tbody>
                                      </table>
                                    );
                                  }
                                  break;
                              }
                              return <div key={el.id} style={wStyle}>{content}</div>;
                            })
                        }
                        {/* Smart alignment guides - only on active page */}
                        {isActivePage && smartGuides.x.map((gx, i) => (
                          <div key={`sgx-${i}`} style={{
                            position: "absolute", left: gx, top: 0, width: 1, height: A4_HEIGHT,
                            background: "hsl(var(--primary) / 0.5)", pointerEvents: "none", zIndex: 9990,
                          }} />
                        ))}
                        {isActivePage && smartGuides.y.map((gy, i) => (
                          <div key={`sgy-${i}`} style={{
                            position: "absolute", top: gy, left: 0, height: 1, width: A4_WIDTH,
                            background: "hsl(var(--primary) / 0.5)", pointerEvents: "none", zIndex: 9990,
                          }} />
                        ))}
                        {/* User-placed draggable guide lines - only on active page */}
                        {isActivePage && userGuides.map(g => (
                          <div
                            key={g.id}
                            style={{
                              position: "absolute",
                              ...(g.axis === "x"
                                ? { left: g.pos, top: 0, width: 1, height: A4_HEIGHT, cursor: "col-resize" }
                                : { top: g.pos, left: 0, height: 1, width: A4_WIDTH, cursor: "row-resize" }),
                              background: "hsl(var(--chart-4))",
                              zIndex: 9995,
                            }}
                            onMouseDown={(e) => {
                              e.stopPropagation();
                              e.preventDefault();
                              setDraggingGuide({
                                id: g.id,
                                axis: g.axis,
                                startMouse: g.axis === "x" ? e.clientX : e.clientY,
                                startPos: g.pos,
                              });
                            }}
                            onDoubleClick={(e) => {
                              e.stopPropagation();
                              setUserGuides(prev => prev.filter(ug => ug.id !== g.id));
                              toast.info("Guia removida");
                            }}
                            title={`${g.axis === "x" ? "Vertical" : "Horizontal"}: ${Math.round(g.pos)}px — arraste para mover, duplo-clique para remover`}
                          >
                            <div style={{
                              position: "absolute",
                              ...(g.axis === "x"
                                ? { left: -3, top: 0, width: 7, height: "100%" }
                                : { top: -3, left: 0, height: 7, width: "100%" }),
                            }} />
                            <div style={{
                              position: "absolute",
                              ...(g.axis === "x"
                                ? { top: 4, left: 4 }
                                : { left: 4, top: -14 }),
                              fontSize: 9, color: "hsl(var(--chart-4))", fontWeight: 600,
                              background: "hsl(var(--background) / 0.9)", padding: "0 3px", borderRadius: 2,
                              pointerEvents: "none", whiteSpace: "nowrap",
                            }}>
                              {Math.round(g.pos)}px
                            </div>
                          </div>
                        ))}
                        {/* Configurable Header */}
                        {headerSettings.enabled && (
                          <div style={{
                            position: "absolute", top: Math.max(4, margins.top - headerSettings.height - 4),
                            left: Math.max(8, margins.left), right: Math.max(8, margins.right),
                            height: headerSettings.height,
                            display: "flex", justifyContent: "space-between", alignItems: "center",
                            fontSize: headerSettings.fontSize, color: headerSettings.color,
                            fontFamily: headerSettings.fontFamily,
                            background: headerSettings.backgroundColor,
                            pointerEvents: "none", zIndex: 3, userSelect: "none",
                            borderBottom: headerSettings.showLine ? `1px solid ${headerSettings.lineColor}` : "none",
                            paddingBottom: 4,
                          }}>
                            <span style={{ flex: 1, textAlign: "left" }}>
                              {resolveHeaderFooterText(headerSettings.leftText, pageIdx)}
                            </span>
                            <span style={{ flex: 1, textAlign: "center" }}>
                              {resolveHeaderFooterText(headerSettings.centerText, pageIdx)}
                            </span>
                            <span style={{ flex: 1, textAlign: "right" }}>
                              {resolveHeaderFooterText(headerSettings.rightText, pageIdx)}
                            </span>
                          </div>
                        )}
                        {/* Configurable Footer */}
                        {footerSettings.enabled && (
                          <div style={{
                            position: "absolute", bottom: Math.max(4, margins.bottom - footerSettings.height - 4),
                            left: Math.max(8, margins.left), right: Math.max(8, margins.right),
                            height: footerSettings.height,
                            display: "flex", justifyContent: "space-between", alignItems: "center",
                            fontSize: footerSettings.fontSize, color: footerSettings.color,
                            fontFamily: footerSettings.fontFamily,
                            background: footerSettings.backgroundColor,
                            pointerEvents: "none", zIndex: 3, userSelect: "none",
                            borderTop: footerSettings.showLine ? `1px solid ${footerSettings.lineColor}` : "none",
                            paddingTop: 4,
                          }}>
                            <span style={{ flex: 1, textAlign: "left" }}>
                              {resolveHeaderFooterText(footerSettings.leftText, pageIdx)}
                            </span>
                            <span style={{ flex: 1, textAlign: "center" }}>
                              {resolveHeaderFooterText(footerSettings.centerText, pageIdx)}
                            </span>
                            <span style={{ flex: 1, textAlign: "right" }}>
                              {resolveHeaderFooterText(footerSettings.rightText, pageIdx)}
                            </span>
                          </div>
                        )}
                      </div>

                      {/* Context menu - only on active page */}
                      {isActivePage && contextMenu && (
                        <div
                          style={{ position: "absolute", left: contextMenu.x, top: contextMenu.y, zIndex: 99999 }}
                          onClick={e => e.stopPropagation()}
                          className="min-w-[200px] rounded-md border border-border bg-popover shadow-lg"
                        >
                          <button className="w-full px-3 py-1.5 text-left text-sm hover:bg-accent text-popover-foreground flex items-center gap-2" onClick={async () => {
                            const sel = selectedIds.size > 0 ? elements.find(e => e.id === [...selectedIds][0]) : null;
                            if (sel?.text) {
                              try { await navigator.clipboard.writeText(sel.text.replace(/<[^>]*>/g, '')); toast.success("Texto copiado!"); } catch { toast.error("Erro ao copiar"); }
                            } else { toast.info("Selecione um elemento com texto para copiar"); }
                            setContextMenu(null);
                          }}>
                            📋 Copiar texto
                          </button>
                          <button className="w-full px-3 py-1.5 text-left text-sm hover:bg-accent text-popover-foreground flex items-center gap-2" onClick={async () => {
                            try {
                              const items = await navigator.clipboard.read();
                              let content = "";
                              for (const item of items) {
                                let html = "", plain = "";
                                if (item.types.includes("text/plain")) { const b = await item.getType("text/plain"); plain = await b.text(); }
                                if (item.types.includes("text/html")) { const b = await item.getType("text/html"); html = await b.text(); }
                                content = sanitizeClipboard(html, plain);
                                if (content) break;
                              }
                              if (!content) { toast.info("Área de transferência vazia"); setContextMenu(null); return; }
                              
                              if (selectedIds.size > 0) {
                                const selId = [...selectedIds][0];
                                const selEl = elements.find(e => e.id === selId);
                                const nextText = (selEl?.text || "") + content;
                                setCurrentElements(prev => prev.map(el => el.id === selId ? { ...el, text: nextText } : el));
                                if (selEl) {
                                  const measuredNextHeight = measureHtmlHeight(nextText, selEl.width, {
                                    fontFamily: selEl.fontFamily,
                                    fontSize: selEl.fontSize,
                                    fontWeight: selEl.fontWeight,
                                    fontStyle: selEl.fontStyle,
                                    textAlign: selEl.textAlign,
                                    lineHeight: 1.4,
                                  });
                                  setTimeout(() => reflowElements(selId, Math.max(selEl.height, measuredNextHeight + 4), { text: nextText }), 50);
                                }
                                toast.success("Texto colado no elemento selecionado!");
                              } else {
                                const x = contextMenu!.x / zoom;
                                const y = contextMenu!.y / zoom;
                                const el = createDefaultElement("text", x, y);
                                el.text = content;
                                el.width = Math.min(500, Math.max(200, content.length * 4));
                                el.height = Math.max(40, Math.ceil(content.length / 60) * 20);
                                const cp = clampToMargins(el, x, y); el.x = cp.x; el.y = cp.y;
                                setCurrentElements(prev => [...prev, el]);
                                setSelectedIds(new Set([el.id]));
                                toast.success("Texto colado como novo elemento!");
                              }
                            } catch {
                              toast.error("Não foi possível acessar a área de transferência. Verifique as permissões do navegador.");
                            }
                            setContextMenu(null);
                          }}>
                            📥 Colar da área de transferência
                          </button>
                          <div className="h-px bg-border my-1" />
                          {selectedIds.size > 0 && (
                            <>
                              <button className="w-full px-3 py-1.5 text-left text-sm hover:bg-accent text-popover-foreground" onClick={duplicateSelected}>Duplicar</button>
                              <button className="w-full px-3 py-1.5 text-left text-sm hover:bg-destructive/10 text-destructive/80" onClick={deleteSelected}>Excluir</button>
                              {selectedIds.size >= 2 && (
                                <button className="w-full px-3 py-1.5 text-left text-sm hover:bg-accent text-popover-foreground" onClick={groupSelected}>
                                  🔗 Agrupar ({selectedIds.size} itens)
                                </button>
                              )}
                              <button className="w-full px-3 py-1.5 text-left text-sm hover:bg-accent text-popover-foreground" onClick={() => {
                                const sel = elements.find(e => e.id === [...selectedIds][0]);
                                if (sel) {
                                  updateSelected({ locked: !sel.locked });
                                  toast.success(sel.locked ? "Elemento desbloqueado!" : "Elemento bloqueado!");
                                }
                                setContextMenu(null);
                              }}>
                                {elements.find(e => e.id === [...selectedIds][0])?.locked ? "🔓 Desbloquear" : "🔒 Bloquear"}
                              </button>
                              {hasGroupInSelection && (
                                <button className="w-full px-3 py-1.5 text-left text-sm hover:bg-accent text-popover-foreground" onClick={ungroupSelected}>
                                  ✂️ Desagrupar
                                </button>
                              )}
                              <div className="h-px bg-border my-1" />
                            </>
                          )}
                          {ctxShowReplace && ctxSelectedText && (
                            <>
                              <div className="h-px bg-border my-1" />
                              <div className="px-3 py-1.5 text-xs font-semibold text-muted-foreground">
                                Substituir: <span className="font-mono text-foreground">"{ctxSelectedText.length > 20 ? ctxSelectedText.slice(0, 20) + "…" : ctxSelectedText}"</span>
                              </div>
                              <div className="px-2 pb-1">
                                <input
                                  type="text"
                                  placeholder="Substituir por..."
                                  value={ctxReplaceText}
                                  onChange={e => setCtxReplaceText(e.target.value)}
                                  className="w-full rounded border border-border bg-muted/30 px-2 py-1 text-xs outline-none"
                                  onClick={e => e.stopPropagation()}
                                  onKeyDown={e => { if (e.key === "Enter") handleCtxReplace(ctxReplaceText, false); }}
                                />
                              </div>
                              {ctxReplaceText && (
                                <div className="flex gap-1 px-2 pb-1">
                                  <button className="flex-1 px-2 py-1 text-[10px] rounded bg-primary/10 text-primary hover:bg-primary/20" onClick={() => handleCtxReplace(ctxReplaceText, false)}>
                                    Substituir 1×
                                  </button>
                                  <button className="flex-1 px-2 py-1 text-[10px] rounded bg-primary/10 text-primary hover:bg-primary/20" onClick={() => handleCtxReplace(ctxReplaceText, true)}>
                                    Substituir Todas
                                  </button>
                                </div>
                              )}
                              <div className="px-2 pb-1">
                                <input
                                  type="text"
                                  placeholder="Ou substituir por variável..."
                                  value={ctxReplaceVarSearch}
                                  onChange={e => setCtxReplaceVarSearch(e.target.value)}
                                  className="w-full rounded border border-border bg-muted/30 px-2 py-1 text-xs outline-none"
                                  onClick={e => e.stopPropagation()}
                                />
                              </div>
                              <div className="max-h-[120px] overflow-y-auto">
                                {variables
                                  .filter(v => !ctxReplaceVarSearch || v.var.toLowerCase().includes(ctxReplaceVarSearch.toLowerCase()) || v.desc.toLowerCase().includes(ctxReplaceVarSearch.toLowerCase()))
                                  .sort((a, b) => a.var.localeCompare(b.var))
                                  .slice(0, 20)
                                  .map(v => (
                                    <div key={v.var} className="flex items-center gap-1 px-2 py-0.5">
                                      <button className="flex-1 text-left hover:bg-accent rounded px-1" onClick={() => handleCtxReplace(v.var, false)}>
                                        <div className="text-[10px] font-mono text-primary">{v.var}</div>
                                      </button>
                                      <button className="text-[9px] px-1.5 py-0.5 rounded bg-accent/50 hover:bg-accent text-muted-foreground" onClick={() => handleCtxReplace(v.var, true)} title="Substituir todas">
                                        Todas
                                      </button>
                                    </div>
                                  ))}
                              </div>
                            </>
                          )}
                          <div className="h-px bg-border my-1" />
                          <button className="w-full px-3 py-1.5 text-left text-sm hover:bg-accent text-popover-foreground flex items-center gap-2" onClick={() => { setContextMenu(null); handleInsertCompanyLogo(); }}>
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
                </div>
              );
            })}
            {/* Add page button below all pages */}
            <div className="flex justify-center py-4">
              <Button variant="outline" size="sm" className="gap-2 text-xs" onClick={addPage} title="Adicionar nova página">
                <Plus className="h-4 w-4" /> Nova Página
              </Button>
            </div>
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
      {/* Floating Enter hint tooltip */}
      {enterHint && (
        <div
          style={{
            position: "fixed",
            left: enterHint.x,
            top: enterHint.y,
            zIndex: 99999,
            pointerEvents: "none",
            animation: "enterHintFade 1.2s ease-out forwards",
          }}
        >
          <span
            style={{
              display: "inline-block",
              padding: "3px 10px",
              borderRadius: 6,
              fontSize: 11,
              fontWeight: 600,
              color: enterHint.text.includes("¶") ? "hsl(var(--primary))" : "hsl(var(--accent-foreground))",
              background: enterHint.text.includes("¶") ? "hsl(var(--primary) / 0.12)" : "hsl(var(--muted))",
              border: `1px solid ${enterHint.text.includes("¶") ? "hsl(var(--primary) / 0.25)" : "hsl(var(--border))"}`,
              boxShadow: "0 2px 8px hsl(var(--foreground) / 0.08)",
              whiteSpace: "nowrap",
            }}
          >
            {enterHint.text}
          </span>
        </div>
      )}
    </div>
  );
}
