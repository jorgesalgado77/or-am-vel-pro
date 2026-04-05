import { useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Bold,
  Italic,
  Underline,
  Strikethrough,
  AlignLeft,
  AlignCenter,
  AlignRight,
  AlignJustify,
  List,
  ListOrdered,
  Undo2,
  Redo2,
  Paintbrush,
  Type,
  RemoveFormatting,
} from "lucide-react";

interface EditorToolbarProps {
  editorRef: React.RefObject<HTMLDivElement>;
}

const FONT_FAMILIES = [
  { value: "Arial, sans-serif", label: "Arial" },
  { value: "Times New Roman, serif", label: "Times New Roman" },
  { value: "Georgia, serif", label: "Georgia" },
  { value: "Verdana, sans-serif", label: "Verdana" },
  { value: "Courier New, monospace", label: "Courier New" },
  { value: "Trebuchet MS, sans-serif", label: "Trebuchet" },
  { value: "Tahoma, sans-serif", label: "Tahoma" },
  { value: "Calibri, sans-serif", label: "Calibri" },
];

const FONT_SIZES = [
  { value: "1", label: "8px" },
  { value: "2", label: "10px" },
  { value: "3", label: "12px" },
  { value: "4", label: "14px" },
  { value: "5", label: "18px" },
  { value: "6", label: "24px" },
  { value: "7", label: "36px" },
];

const COLORS = [
  "#000000", "#333333", "#666666", "#999999",
  "#DC2626", "#EA580C", "#D97706", "#CA8A04",
  "#16A34A", "#059669", "#0891B2", "#2563EB",
  "#7C3AED", "#9333EA", "#DB2777", "#E11D48",
];

function ToolbarButton({
  onClick,
  title,
  children,
  active = false,
}: {
  onClick: () => void;
  title: string;
  children: React.ReactNode;
  active?: boolean;
}) {
  return (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      className={`h-7 w-7 ${active ? "bg-accent text-accent-foreground" : ""}`}
      onClick={(e) => {
        e.preventDefault();
        onClick();
      }}
      title={title}
    >
      {children}
    </Button>
  );
}

export function EditorToolbar({ editorRef }: EditorToolbarProps) {
  const exec = useCallback(
    (command: string, value?: string) => {
      editorRef.current?.focus();
      document.execCommand(command, false, value);
    },
    [editorRef]
  );

  return (
    <div className="flex flex-wrap items-center gap-0.5 rounded-t-lg border border-b-0 border-border bg-muted/50 px-1.5 py-1">
      {/* Undo / Redo */}
      <ToolbarButton onClick={() => exec("undo")} title="Desfazer">
        <Undo2 className="h-3.5 w-3.5" />
      </ToolbarButton>
      <ToolbarButton onClick={() => exec("redo")} title="Refazer">
        <Redo2 className="h-3.5 w-3.5" />
      </ToolbarButton>

      <Separator orientation="vertical" className="mx-1 h-5" />

      {/* Font family */}
      <Select onValueChange={(v) => exec("fontName", v)}>
        <SelectTrigger className="h-7 w-[110px] text-xs border-none bg-transparent">
          <SelectValue placeholder="Fonte" />
        </SelectTrigger>
        <SelectContent>
          {FONT_FAMILIES.map((f) => (
            <SelectItem key={f.value} value={f.value} className="text-xs">
              <span style={{ fontFamily: f.value }}>{f.label}</span>
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {/* Font size */}
      <Select onValueChange={(v) => exec("fontSize", v)}>
        <SelectTrigger className="h-7 w-[70px] text-xs border-none bg-transparent">
          <SelectValue placeholder="Tam." />
        </SelectTrigger>
        <SelectContent>
          {FONT_SIZES.map((s) => (
            <SelectItem key={s.value} value={s.value} className="text-xs">
              {s.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Separator orientation="vertical" className="mx-1 h-5" />

      {/* Text formatting */}
      <ToolbarButton onClick={() => exec("bold")} title="Negrito">
        <Bold className="h-3.5 w-3.5" />
      </ToolbarButton>
      <ToolbarButton onClick={() => exec("italic")} title="Itálico">
        <Italic className="h-3.5 w-3.5" />
      </ToolbarButton>
      <ToolbarButton onClick={() => exec("underline")} title="Sublinhado">
        <Underline className="h-3.5 w-3.5" />
      </ToolbarButton>
      <ToolbarButton onClick={() => exec("strikeThrough")} title="Riscado">
        <Strikethrough className="h-3.5 w-3.5" />
      </ToolbarButton>

      <Separator orientation="vertical" className="mx-1 h-5" />

      {/* Text color */}
      <Popover>
        <PopoverTrigger asChild>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            title="Cor do texto"
          >
            <Type className="h-3.5 w-3.5" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-2" align="start">
          <p className="text-xs font-medium text-muted-foreground mb-1.5">Cor do texto</p>
          <div className="grid grid-cols-4 gap-1">
            {COLORS.map((c) => (
              <button
                key={c}
                className="h-6 w-6 rounded border border-border hover:scale-110 transition-transform"
                style={{ backgroundColor: c }}
                onClick={() => exec("foreColor", c)}
                title={c}
              />
            ))}
          </div>
        </PopoverContent>
      </Popover>

      {/* Background color */}
      <Popover>
        <PopoverTrigger asChild>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            title="Cor de fundo"
          >
            <Paintbrush className="h-3.5 w-3.5" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-2" align="start">
          <p className="text-xs font-medium text-muted-foreground mb-1.5">Cor de fundo</p>
          <div className="grid grid-cols-4 gap-1">
            {["transparent", ...COLORS].map((c) => (
              <button
                key={c}
                className={`h-6 w-6 rounded border border-border hover:scale-110 transition-transform ${c === "transparent" ? "bg-background" : ""}`}
                style={c !== "transparent" ? { backgroundColor: c } : undefined}
                onClick={() => exec("hiliteColor", c)}
                title={c === "transparent" ? "Sem cor" : c}
              >
                {c === "transparent" && <RemoveFormatting className="h-3 w-3 mx-auto text-muted-foreground" />}
              </button>
            ))}
          </div>
        </PopoverContent>
      </Popover>

      <Separator orientation="vertical" className="mx-1 h-5" />

      {/* Alignment */}
      <ToolbarButton onClick={() => exec("justifyLeft")} title="Alinhar à esquerda">
        <AlignLeft className="h-3.5 w-3.5" />
      </ToolbarButton>
      <ToolbarButton onClick={() => exec("justifyCenter")} title="Centralizar">
        <AlignCenter className="h-3.5 w-3.5" />
      </ToolbarButton>
      <ToolbarButton onClick={() => exec("justifyRight")} title="Alinhar à direita">
        <AlignRight className="h-3.5 w-3.5" />
      </ToolbarButton>
      <ToolbarButton onClick={() => exec("justifyFull")} title="Justificar">
        <AlignJustify className="h-3.5 w-3.5" />
      </ToolbarButton>

      <Separator orientation="vertical" className="mx-1 h-5" />

      {/* Lists */}
      <ToolbarButton onClick={() => exec("insertUnorderedList")} title="Lista">
        <List className="h-3.5 w-3.5" />
      </ToolbarButton>
      <ToolbarButton onClick={() => exec("insertOrderedList")} title="Lista numerada">
        <ListOrdered className="h-3.5 w-3.5" />
      </ToolbarButton>

      <Separator orientation="vertical" className="mx-1 h-5" />

      {/* Remove formatting */}
      <ToolbarButton onClick={() => exec("removeFormat")} title="Limpar formatação">
        <RemoveFormatting className="h-3.5 w-3.5" />
      </ToolbarButton>
    </div>
  );
}
