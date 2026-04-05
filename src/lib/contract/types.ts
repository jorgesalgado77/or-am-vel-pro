export interface PdfTextItem {
  str: string;
  transform: number[];
  width?: number;
  height?: number;
  fontName?: string;
}

export interface ExtractedTextItem {
  text: string;
  x: number;
  y: number;
  width: number;
  fontSize: number;
  fontFamily: string;
  fontWeight: string;
  leftPercent: number;
  topPercent: number;
  widthPercent: number;
}

export interface TextLine {
  y: number;
  topPercent: number;
  fontSize: number;
  items: ExtractedTextItem[];
}

export interface TableBlock {
  startLineIdx: number;
  endLineIdx: number;
  columns: number[];
  rows: TextLine[];
}

export type SemanticBlockType =
  | "header"
  | "empresa"
  | "cliente"
  | "clausula"
  | "tabela"
  | "valor"
  | "assinatura"
  | "rodape"
  | "texto";

export interface StructureBlock {
  type: "text" | "table" | "image";
  semantic?: SemanticBlockType;
  x: number;
  y: number;
  w: number;
  h: number;
  content: string;
  fontSize?: number;
  fontFamily?: string;
  fontWeight?: string;
  children?: StructureBlock[];
}

export interface ImportedContractContent {
  html: string;
  suggestedName: string;
  sourceLabel: string;
  structure?: StructureBlock[];
  templateType?: "flow" | "absolute" | "hybrid";
}

export interface FieldReplacement {
  id: string;
  originalValue: string;
  variable: string;
  label: string;
}
