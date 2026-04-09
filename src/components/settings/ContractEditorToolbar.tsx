import { useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Undo2, Redo2, Bold, Italic, Underline, Strikethrough, Type, Paintbrush,
  AlignLeft, AlignCenter, AlignRight, AlignJustify, List, ListOrdered,
  RemoveFormatting, Square, Circle, Minus, Image, MousePointer, Table2,
  ArrowLeft, Pipette
} from "lucide-react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

export type ShapeType = "rect" | "circle" | "line";
export type ToolType = "select" | "shape" | "text" | "image" | "table" | "eyedropper";

interface ContractEditorToolbarProps {
  activeTool: ToolType;
  onToolChange: (tool: ToolType) => void;
  activeShapeType: ShapeType;
  onShapeTypeChange: (shape: ShapeType) => void;
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
  onUndo: () => void;
  onRedo: () => void;
  canUndo: boolean;
  canRedo: boolean;
  onImageUpload: () => void;
  onTableInsert: () => void;
  onBack?: () => void;
  // Eyedropper
  eyedropperColor?: string | null;
  eyedropperMode?: "fill" | "stroke" | "text" | null;
  onEyedropperClick?: () => void;
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

interface TipButtonProps {
  tip: string;
  children: React.ReactNode;
  variant?: "ghost" | "secondary" | "outline";
  className?: string;
  onClick?: () => void;
  disabled?: boolean;
}

function TipButton({ tip, children, variant = "ghost", className = "", onClick, disabled }: TipButtonProps) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button variant={variant} size="icon" className={`h-9 w-9 ${className}`} onClick={onClick} disabled={disabled}>
          {children}
        </Button>
      </TooltipTrigger>
      <TooltipContent side="bottom" className="text-xs">
        {tip}
      </TooltipContent>
    </Tooltip>
  );
}

export function ContractEditorToolbar(props: ContractEditorToolbarProps) {
  const {
    activeTool, onToolChange, activeShapeType, onShapeTypeChange,
    fontFamily, onFontFamilyChange, fontSize, onFontSizeChange,
    isBold, onBoldToggle, isItalic, onItalicToggle,
    isUnderline, onUnderlineToggle, isStrikethrough, onStrikethroughToggle,
    textColor, onTextColorChange, textAlign, onTextAlignChange,
    onUndo, onRedo, canUndo, canRedo, onImageUpload, onTableInsert, onBack,
  } = props;

  useEffect(() => {
    const families = GOOGLE_FONTS.map(f => f.replace(/ /g, "+")).join("&family=");
    const linkId = "google-fonts-editor";
    if (!document.getElementById(linkId)) {
      const link = document.createElement("link");
      link.id = linkId;
      link.rel = "stylesheet";
      link.href = `https://fonts.googleapis.com/css2?family=${families}&display=swap`;
      document.head.appendChild(link);
    }
  }, []);

  return (
    <TooltipProvider delayDuration={300}>
      <div className="flex flex-wrap items-center gap-1.5 border-b border-border bg-muted/40 px-3 py-2">

        {/* Voltar */}
        {onBack && (
          <>
            <TipButton tip="Voltar" onClick={onBack}>
              <ArrowLeft className="h-[18px] w-[18px]" />
            </TipButton>
            <Separator orientation="vertical" className="mx-1 h-7" />
          </>
        )}

        {/* Undo / Redo */}
        <TipButton tip="Desfazer (Ctrl+Z)" onClick={onUndo} disabled={!canUndo}>
          <Undo2 className="h-[18px] w-[18px]" />
        </TipButton>
        <TipButton tip="Refazer (Ctrl+Y)" onClick={onRedo} disabled={!canRedo}>
          <Redo2 className="h-[18px] w-[18px]" />
        </TipButton>

        <Separator orientation="vertical" className="mx-1.5 h-7" />

        {/* Tools */}
        <TipButton tip="Selecionar" variant={activeTool === "select" ? "secondary" : "ghost"} onClick={() => onToolChange("select")}>
          <MousePointer className="h-[18px] w-[18px]" />
        </TipButton>
        <TipButton tip="Inserir Texto" variant={activeTool === "text" ? "secondary" : "ghost"} onClick={() => onToolChange("text")}>
          <Type className="h-[18px] w-[18px]" />
        </TipButton>

        <Separator orientation="vertical" className="mx-1.5 h-7" />

        {/* Shapes */}
        <TipButton tip="Retângulo" variant={activeTool === "shape" && activeShapeType === "rect" ? "secondary" : "ghost"} onClick={() => { onToolChange("shape"); onShapeTypeChange("rect"); }}>
          <Square className="h-[18px] w-[18px]" />
        </TipButton>
        <TipButton tip="Círculo" variant={activeTool === "shape" && activeShapeType === "circle" ? "secondary" : "ghost"} onClick={() => { onToolChange("shape"); onShapeTypeChange("circle"); }}>
          <Circle className="h-[18px] w-[18px]" />
        </TipButton>
        <TipButton tip="Linha" variant={activeTool === "shape" && activeShapeType === "line" ? "secondary" : "ghost"} onClick={() => { onToolChange("shape"); onShapeTypeChange("line"); }}>
          <Minus className="h-[18px] w-[18px]" />
        </TipButton>

        <Separator orientation="vertical" className="mx-1.5 h-7" />

        {/* Insert */}
        <TipButton tip="Inserir Imagem" variant={activeTool === "image" ? "secondary" : "ghost"} onClick={() => { onToolChange("image"); onImageUpload(); }}>
          <Image className="h-[18px] w-[18px]" />
        </TipButton>
        <TipButton tip="Inserir Tabela" variant={activeTool === "table" ? "secondary" : "ghost"} onClick={() => { onToolChange("table"); onTableInsert(); }}>
          <Table2 className="h-[18px] w-[18px]" />
        </TipButton>

        <Separator orientation="vertical" className="mx-1.5 h-7" />

        {/* Font family */}
        <Select value={fontFamily} onValueChange={onFontFamilyChange}>
          <SelectTrigger className="h-9 w-[160px] text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent className="max-h-[300px]">
            <div className="px-2 py-1 text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Sistema</div>
            {SYSTEM_FONTS.map(f => (
              <SelectItem key={f} value={f} className="text-xs" style={{ fontFamily: f }}>{f}</SelectItem>
            ))}
            <div className="h-px bg-border my-1" />
            <div className="px-2 py-1 text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Google Fonts</div>
            {GOOGLE_FONTS.sort().map(f => (
              <SelectItem key={f} value={f} className="text-xs" style={{ fontFamily: f }}>{f}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        {/* Font size */}
        <Select value={String(fontSize)} onValueChange={(v) => onFontSizeChange(Number(v))}>
          <SelectTrigger className="h-9 w-[70px] text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {FONT_SIZES.map(s => (
              <SelectItem key={s} value={String(s)} className="text-xs">{s}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Separator orientation="vertical" className="mx-1.5 h-7" />

        {/* Text formatting */}
        <TipButton tip="Negrito (Ctrl+B)" variant={isBold ? "secondary" : "ghost"} onClick={onBoldToggle}>
          <Bold className="h-[18px] w-[18px]" />
        </TipButton>
        <TipButton tip="Itálico (Ctrl+I)" variant={isItalic ? "secondary" : "ghost"} onClick={onItalicToggle}>
          <Italic className="h-[18px] w-[18px]" />
        </TipButton>
        <TipButton tip="Sublinhado (Ctrl+U)" variant={isUnderline ? "secondary" : "ghost"} onClick={onUnderlineToggle}>
          <Underline className="h-[18px] w-[18px]" />
        </TipButton>
        <TipButton tip="Tachado" variant={isStrikethrough ? "secondary" : "ghost"} onClick={onStrikethroughToggle}>
          <Strikethrough className="h-[18px] w-[18px]" />
        </TipButton>

        {/* Text color */}
        <Popover>
          <PopoverTrigger asChild>
            <Button variant="ghost" size="icon" className="h-9 w-9 relative" title="Cor do texto">
              <Paintbrush className="h-[18px] w-[18px]" />
              <span className="absolute bottom-1 left-1/2 -translate-x-1/2 h-1 w-5 rounded-full" style={{ backgroundColor: textColor }} />
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

        <Separator orientation="vertical" className="mx-1.5 h-7" />

        {/* Alignment */}
        <TipButton tip="Alinhar à esquerda" variant={textAlign === "left" ? "secondary" : "ghost"} onClick={() => onTextAlignChange("left")}>
          <AlignLeft className="h-[18px] w-[18px]" />
        </TipButton>
        <TipButton tip="Centralizar" variant={textAlign === "center" ? "secondary" : "ghost"} onClick={() => onTextAlignChange("center")}>
          <AlignCenter className="h-[18px] w-[18px]" />
        </TipButton>
        <TipButton tip="Alinhar à direita" variant={textAlign === "right" ? "secondary" : "ghost"} onClick={() => onTextAlignChange("right")}>
          <AlignRight className="h-[18px] w-[18px]" />
        </TipButton>
        <TipButton tip="Justificar" variant={textAlign === "justify" ? "secondary" : "ghost"} onClick={() => onTextAlignChange("justify")}>
          <AlignJustify className="h-[18px] w-[18px]" />
        </TipButton>

        <Separator orientation="vertical" className="mx-1.5 h-7" />

        {/* Lists / Clear */}
        <TipButton tip="Lista com marcadores">
          <List className="h-[18px] w-[18px]" />
        </TipButton>
        <TipButton tip="Lista numerada">
          <ListOrdered className="h-[18px] w-[18px]" />
        </TipButton>
        <TipButton tip="Limpar formatação">
          <RemoveFormatting className="h-[18px] w-[18px]" />
        </TipButton>
      </div>
    </TooltipProvider>
  );
}
