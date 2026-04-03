/**
 * FornecedorAutocomplete — Input with dropdown suggestions from registered suppliers.
 */
import { useState, useRef, useEffect, useCallback } from "react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { Factory } from "lucide-react";

export interface FornecedorOption {
  nome: string;
  prazo_entrega?: string;
}

interface Props {
  value: string;
  onChange: (value: string) => void;
  fornecedores: FornecedorOption[];
  placeholder?: string;
  className?: string;
  compact?: boolean;
  readOnly?: boolean;
}

export function FornecedorAutocomplete({
  value,
  onChange,
  fornecedores,
  placeholder = "Fornecedor",
  className,
  compact = false,
  readOnly = false,
}: Props) {
  const [open, setOpen] = useState(false);
  const [inputValue, setInputValue] = useState(value);
  const [highlightIndex, setHighlightIndex] = useState(-1);
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Sync external value
  useEffect(() => {
    setInputValue(value);
  }, [value]);

  const filtered = fornecedores.filter(
    (f) =>
      !inputValue.trim() ||
      f.nome.toLowerCase().includes(inputValue.toLowerCase().trim())
  );

  const handleInputChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const v = e.target.value;
      setInputValue(v);
      onChange(v);
      setOpen(true);
      setHighlightIndex(-1);
    },
    [onChange]
  );

  const handleSelect = useCallback(
    (nome: string) => {
      setInputValue(nome);
      onChange(nome);
      setOpen(false);
      setHighlightIndex(-1);
    },
    [onChange]
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (!open || filtered.length === 0) return;
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setHighlightIndex((prev) => (prev + 1) % filtered.length);
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setHighlightIndex((prev) => (prev <= 0 ? filtered.length - 1 : prev - 1));
      } else if (e.key === "Enter" && highlightIndex >= 0) {
        e.preventDefault();
        handleSelect(filtered[highlightIndex].nome);
      } else if (e.key === "Escape") {
        setOpen(false);
      }
    },
    [open, filtered, highlightIndex, handleSelect]
  );

  // Close on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const inputClass = compact
    ? "h-6 text-[11px] bg-transparent border-none p-0 focus-visible:ring-1 focus-visible:ring-primary/50"
    : "h-6 text-[11px] bg-background";

  return (
    <div ref={containerRef} className="relative">
      <Input
        ref={inputRef}
        value={inputValue}
        onChange={handleInputChange}
        onFocus={() => !readOnly && setOpen(true)}
        onKeyDown={handleKeyDown}
        className={cn(inputClass, className)}
        placeholder={placeholder}
        readOnly={readOnly}
        autoComplete="off"
      />
      {open && filtered.length > 0 && !readOnly && (
        <div className="absolute z-50 top-full left-0 mt-1 w-full min-w-[180px] max-h-[200px] overflow-y-auto rounded-md border bg-popover shadow-md">
          {filtered.map((f, i) => (
            <button
              key={f.nome}
              type="button"
              className={cn(
                "flex items-center gap-2 w-full text-left px-2 py-1.5 text-[11px] hover:bg-accent/50 transition-colors",
                i === highlightIndex && "bg-accent"
              )}
              onMouseDown={(e) => {
                e.preventDefault();
                handleSelect(f.nome);
              }}
            >
              <Factory className="h-3 w-3 text-muted-foreground shrink-0" />
              <div className="flex flex-col min-w-0 flex-1">
                <span className="font-medium truncate">{f.nome}</span>
                {f.prazo_entrega && (
                  <span className="text-[9px] text-muted-foreground">
                    Prazo: {f.prazo_entrega}
                  </span>
                )}
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
