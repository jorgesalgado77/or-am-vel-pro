/**
 * Contract Editor — barrel export for extracted modules
 */
export type { CanvasElement, PageData, VariableInfo, ContractVisualEditorProps } from "./types";
export { A4_WIDTH, A4_HEIGHT, GRID_SIZE, RULER_SIZE, genId, pageId, createDefaultElement, hexToRgb } from "./types";
export { useEditorHistory } from "./useEditorHistory";
export { usePasteHelpers } from "./usePasteHelpers";
export { useTextSplitter } from "./useTextSplitter";
export { buildRepeatedElementFingerprints, createContinuationPageFromTemplate, getPageFlowBounds, isLikelyPageChrome, stripSplitMetadata } from "./pagination";
export { EditorPropertiesPanel } from "./EditorPropertiesPanel";
export { exportToPdf, exportToDocx, exportToXlsx } from "./exportHelpers";
export { HeaderFooterConfig, defaultHeaderSettings, defaultFooterSettings } from "./HeaderFooterConfig";
export type { HeaderFooterSettings } from "./HeaderFooterConfig";
