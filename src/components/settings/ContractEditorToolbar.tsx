import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Undo2, Redo2, Bold, Italic, Underline, Strikethrough, Type, Paintbrush,
  AlignLeft, AlignCenter, AlignRight, AlignJustify, List, ListOrdered,
  RemoveFormatting, Square, Circle, Minus, Image, MousePointer
} from "lucide-react";

export type ShapeType = "rect" | "circle" | "line";
export type ToolType = "select" | "shape" | "text" | "image";

interface ContractEditorToolbarProps {
  activeTool: ToolType;
  onToolChange: (tool: ToolType) => void;
  activeShapeType: ShapeType;
  onShapeTypeChange: (shape: ShapeType) => void;
  // Text formatting
  fontFamily: string;
  onFontFamilyChange: (font: string) => void;
  fontSize: number;
  onFontSizeChange: (size: number) => void;
  isBold: boolean;
  onBoldToggle: () => void;
  isItalic: boolean;
  onItalicToggle: () => void;
  isUnderline: boolean;
  onUnderlineToggle: () => void;
  isStrikethrough: boolean;
  onStrikethroughToggle: () => void;
  textColor: string;
  onTextColorChange: (color: string) => void;
  textAlign: string;
  onTextAlignChange: (align: string) => void;
  // Actions
  onUndo: () => void;
  onRedo: () => void;
  canUndo: boolean;
  canRedo: boolean;
  onImageUpload: () => void;
}

const SYSTEM_FONTS = [
  "Arial", "Times New Roman", "Courier New", "Georgia", "Verdana",
  "Helvetica", "Tahoma", "Trebuchet MS", "Palatino", "Garamond"
];

const GOOGLE_FONTS = [
  "Roboto", "Open Sans", "Lato", "Montserrat", "Poppins",
  "Raleway", "Nunito", "Playfair Display", "Merriweather", "Source Sans 3",
  "Oswald", "Inter", "Rubik", "Work Sans", "Libre Baskerville",
  "Cormorant Garamond", "Dancing Script", "Pacifico", "Bebas Neue", "Caveat"
];

const FONTS = [...SYSTEM_FONTS, ...GOOGLE_FONTS].sort();

const FONT_SIZES = [8, 9, 10, 11, 12, 14, 16, 18, 20, 24, 28, 32, 36, 48, 64, 72];

const COLORS = [
  "#000000", "#333333", "#666666", "#999999", "#CCCCCC", "#FFFFFF",
  "#FF0000", "#FF6600", "#FFCC00", "#33CC00", "#0066FF", "#9933FF",
  "#CC0000", "#CC6600", "#999900", "#009900", "#003399", "#660099",
  "#990000", "#993300", "#666600", "#006600", "#003366", "#330066",
];

export function ContractEditorToolbar(props: ContractEditorToolbarProps) {
  const {
    activeTool, onToolChange, activeShapeType, onShapeTypeChange,
    fontFamily, onFontFamilyChange, fontSize, onFontSizeChange,
    isBold, onBoldToggle, isItalic, onItalicToggle,
    isUnderline, onUnderlineToggle, isStrikethrough, onStrikethroughToggle,
    textColor, onTextColorChange, textAlign, onTextAlignChange,
    onUndo, onRedo, canUndo, canRedo, onImageUpload,
  } = props;

  return (
    <div className="flex flex-wrap items-center gap-1 rounded-t-lg border border-border bg-muted/30 px-2 py-1.5">
      {/* Undo / Redo */}
      <Button variant="ghost" size="icon" className="h-8 w-8" onClick={onUndo} disabled={!canUndo} title="Desfazer">
        <Undo2 className="h-4 w-4" />
      </Button>
      <Button variant="ghost" size="icon" className="h-8 w-8" onClick={onRedo} disabled={!canRedo} title="Refazer">
        <Redo2 className="h-4 w-4" />
      </Button>

      <Separator orientation="vertical" className="mx-1 h-6" />

      {/* Tools */}
      <Button
        variant={activeTool === "select" ? "secondary" : "ghost"}
        size="icon" className="h-8 w-8"
        onClick={() => onToolChange("select")} title="Selecionar"
      >
        <MousePointer className="h-4 w-4" />
      </Button>
      <Button
        variant={activeTool === "text" ? "secondary" : "ghost"}
        size="icon" className="h-8 w-8"
        onClick={() => onToolChange("text")} title="Inserir Texto"
      >
        <Type className="h-4 w-4" />
      </Button>

      {/* Shape buttons */}
      <Button
        variant={activeTool === "shape" && activeShapeType === "rect" ? "secondary" : "ghost"}
        size="icon" className="h-8 w-8"
        onClick={() => { onToolChange("shape"); onShapeTypeChange("rect"); }} title="Retângulo"
      >
        <Square className="h-4 w-4" />
      </Button>
      <Button
        variant={activeTool === "shape" && activeShapeType === "circle" ? "secondary" : "ghost"}
        size="icon" className="h-8 w-8"
        onClick={() => { onToolChange("shape"); onShapeTypeChange("circle"); }} title="Círculo"
      >
        <Circle className="h-4 w-4" />
      </Button>
      <Button
        variant={activeTool === "shape" && activeShapeType === "line" ? "secondary" : "ghost"}
        size="icon" className="h-8 w-8"
        onClick={() => { onToolChange("shape"); onShapeTypeChange("line"); }} title="Linha"
      >
        <Minus className="h-4 w-4" />
      </Button>
      <Button
        variant={activeTool === "image" ? "secondary" : "ghost"}
        size="icon" className="h-8 w-8"
        onClick={() => { onToolChange("image"); onImageUpload(); }} title="Inserir Imagem"
      >
        <Image className="h-4 w-4" />
      </Button>

      <Separator orientation="vertical" className="mx-1 h-6" />

      {/* Font family */}
      <Select value={fontFamily} onValueChange={onFontFamilyChange}>
        <SelectTrigger className="h-8 w-[120px] text-xs">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {FONTS.map(f => (
            <SelectItem key={f} value={f} className="text-xs" style={{ fontFamily: f }}>{f}</SelectItem>
          ))}
        </SelectContent>
      </Select>

      {/* Font size */}
      <Select value={String(fontSize)} onValueChange={(v) => onFontSizeChange(Number(v))}>
        <SelectTrigger className="h-8 w-[65px] text-xs">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {FONT_SIZES.map(s => (
            <SelectItem key={s} value={String(s)} className="text-xs">{s}</SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Separator orientation="vertical" className="mx-1 h-6" />

      {/* Text formatting */}
      <Button variant={isBold ? "secondary" : "ghost"} size="icon" className="h-8 w-8" onClick={onBoldToggle} title="Negrito">
        <Bold className="h-4 w-4" />
      </Button>
      <Button variant={isItalic ? "secondary" : "ghost"} size="icon" className="h-8 w-8" onClick={onItalicToggle} title="Itálico">
        <Italic className="h-4 w-4" />
      </Button>
      <Button variant={isUnderline ? "secondary" : "ghost"} size="icon" className="h-8 w-8" onClick={onUnderlineToggle} title="Sublinhado">
        <Underline className="h-4 w-4" />
      </Button>
      <Button variant={isStrikethrough ? "secondary" : "ghost"} size="icon" className="h-8 w-8" onClick={onStrikethroughToggle} title="Tachado">
        <Strikethrough className="h-4 w-4" />
      </Button>

      {/* Text color */}
      <Popover>
        <PopoverTrigger asChild>
          <Button variant="ghost" size="icon" className="h-8 w-8 relative" title="Cor do texto">
            <Paintbrush className="h-4 w-4" />
            <span className="absolute bottom-1 left-1/2 -translate-x-1/2 h-0.5 w-4 rounded" style={{ backgroundColor: textColor }} />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-2">
          <div className="grid grid-cols-6 gap-1">
            {COLORS.map(c => (
              <button
                key={c}
                className="h-6 w-6 rounded border border-border hover:scale-110 transition-transform"
                style={{ backgroundColor: c }}
                onClick={() => onTextColorChange(c)}
                title={c}
              />
            ))}
          </div>
        </PopoverContent>
      </Popover>

      <Separator orientation="vertical" className="mx-1 h-6" />

      {/* Alignment */}
      <Button variant={textAlign === "left" ? "secondary" : "ghost"} size="icon" className="h-8 w-8" onClick={() => onTextAlignChange("left")} title="Alinhar à esquerda">
        <AlignLeft className="h-4 w-4" />
      </Button>
      <Button variant={textAlign === "center" ? "secondary" : "ghost"} size="icon" className="h-8 w-8" onClick={() => onTextAlignChange("center")} title="Centralizar">
        <AlignCenter className="h-4 w-4" />
      </Button>
      <Button variant={textAlign === "right" ? "secondary" : "ghost"} size="icon" className="h-8 w-8" onClick={() => onTextAlignChange("right")} title="Alinhar à direita">
        <AlignRight className="h-4 w-4" />
      </Button>
      <Button variant={textAlign === "justify" ? "secondary" : "ghost"} size="icon" className="h-8 w-8" onClick={() => onTextAlignChange("justify")} title="Justificar">
        <AlignJustify className="h-4 w-4" />
      </Button>

      <Separator orientation="vertical" className="mx-1 h-6" />

      {/* Lists */}
      <Button variant="ghost" size="icon" className="h-8 w-8" title="Lista não ordenada">
        <List className="h-4 w-4" />
      </Button>
      <Button variant="ghost" size="icon" className="h-8 w-8" title="Lista ordenada">
        <ListOrdered className="h-4 w-4" />
      </Button>
      <Button variant="ghost" size="icon" className="h-8 w-8" title="Limpar formatação">
        <RemoveFormatting className="h-4 w-4" />
      </Button>
    </div>
  );
}
