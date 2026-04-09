/**
 * Types and constants for the Contract Visual Editor
 */

export interface CanvasElement {
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
  locked?: boolean;
  /** ID of the original element this was split from (continuation marker) */
  splitFrom?: string;
  /** ID of the continuation element on the next page */
  splitContinuationId?: string;
}

export interface PageData {
  id: string;
  elements: CanvasElement[];
  backgroundImage?: string;
  backgroundOpacity: number;
}

export interface VariableInfo {
  var: string;
  desc: string;
}

export interface ContractVisualEditorProps {
  onSave: (html: string) => void;
  onCancel: () => void;
  variables: VariableInfo[];
  initialHtml?: string;
}

export const A4_WIDTH = 794;
export const A4_HEIGHT = 1123;
export const GRID_SIZE = 8;
export const RULER_SIZE = 24;

let idCounter = 0;
export function genId() { return `el_${++idCounter}_${Date.now()}`; }
export function pageId() { return `page_${++idCounter}_${Date.now()}`; }

export function createDefaultElement(type: CanvasElement["type"], x: number, y: number): CanvasElement {
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

export function hexToRgb(hex: string) {
  const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  return m ? { r: parseInt(m[1], 16), g: parseInt(m[2], 16), b: parseInt(m[3], 16) } : null;
}
