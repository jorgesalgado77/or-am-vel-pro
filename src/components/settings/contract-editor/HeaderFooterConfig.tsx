import { useState, forwardRef } from "react";
import { Button } from "@/components/ui/button";
import { ChevronDown, ChevronUp, Eye, EyeOff } from "lucide-react";

export interface HeaderFooterSettings {
  enabled: boolean;
  height: number;
  leftText: string;
  centerText: string;
  rightText: string;
  fontSize: number;
  fontFamily: string;
  color: string;
  backgroundColor: string;
  showLine: boolean;
  lineColor: string;
}

export const defaultHeaderSettings: HeaderFooterSettings = {
  enabled: true,
  height: 50,
  leftText: "",
  centerText: "",
  rightText: "",
  fontSize: 10,
  fontFamily: "Arial",
  color: "#333333",
  backgroundColor: "transparent",
  showLine: true,
  lineColor: "#cccccc",
};

export const defaultFooterSettings: HeaderFooterSettings = {
  enabled: true,
  height: 40,
  leftText: "{{nome_cliente}}",
  centerText: "",
  rightText: "Página {{pagina}}/{{total_paginas}}",
  fontSize: 10,
  fontFamily: "Arial",
  color: "#666666",
  backgroundColor: "transparent",
  showLine: true,
  lineColor: "#cccccc",
};

interface Props {
  label: string;
  settings: HeaderFooterSettings;
  onChange: (s: HeaderFooterSettings) => void;
}

export const HeaderFooterConfig = forwardRef<HTMLDivElement, Props>(function HeaderFooterConfig({ label, settings, onChange }, ref) {
  const [expanded, setExpanded] = useState(false);

  const update = (partial: Partial<HeaderFooterSettings>) =>
    onChange({ ...settings, ...partial });

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between">
        <button
          onClick={() => setExpanded(!expanded)}
          className="flex items-center gap-1 text-xs font-semibold text-foreground hover:text-primary transition-colors"
        >
          {expanded ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
          {label}
        </button>
        <button
          onClick={() => update({ enabled: !settings.enabled })}
          className={`flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded border transition-colors ${
            settings.enabled
              ? "border-primary/40 bg-primary/10 text-primary"
              : "border-border text-muted-foreground"
          }`}
          title={settings.enabled ? "Desativar" : "Ativar"}
        >
          {settings.enabled ? <Eye className="h-3 w-3" /> : <EyeOff className="h-3 w-3" />}
          {settings.enabled ? "Ativo" : "Oculto"}
        </button>
      </div>

      {expanded && settings.enabled && (
        <div className="space-y-2 pl-1 border-l-2 border-primary/20 ml-1">
          {/* Height */}
          <div>
            <label className="text-muted-foreground text-[10px]">Altura (px)</label>
            <input
              type="number"
              min={20}
              max={150}
              value={settings.height}
              onChange={e => update({ height: Number(e.target.value) })}
              className="w-full rounded border border-border bg-muted/30 px-1.5 py-1 text-xs"
            />
          </div>

          {/* Text fields */}
          <div>
            <label className="text-muted-foreground text-[10px]">Texto esquerdo</label>
            <input
              type="text"
              value={settings.leftText}
              onChange={e => update({ leftText: e.target.value })}
              placeholder="Ex: {{nome_cliente}}"
              className="w-full rounded border border-border bg-muted/30 px-1.5 py-1 text-xs"
            />
          </div>
          <div>
            <label className="text-muted-foreground text-[10px]">Texto central</label>
            <input
              type="text"
              value={settings.centerText}
              onChange={e => update({ centerText: e.target.value })}
              placeholder="Ex: Título do contrato"
              className="w-full rounded border border-border bg-muted/30 px-1.5 py-1 text-xs"
            />
          </div>
          <div>
            <label className="text-muted-foreground text-[10px]">Texto direito</label>
            <input
              type="text"
              value={settings.rightText}
              onChange={e => update({ rightText: e.target.value })}
              placeholder="Ex: Página {{pagina}}/{{total_paginas}}"
              className="w-full rounded border border-border bg-muted/30 px-1.5 py-1 text-xs"
            />
          </div>

          {/* Font settings */}
          <div className="grid grid-cols-2 gap-1">
            <div>
              <label className="text-muted-foreground text-[10px]">Tamanho</label>
              <input
                type="number"
                min={6}
                max={24}
                value={settings.fontSize}
                onChange={e => update({ fontSize: Number(e.target.value) })}
                className="w-full rounded border border-border bg-muted/30 px-1.5 py-1 text-xs"
              />
            </div>
            <div>
              <label className="text-muted-foreground text-[10px]">Fonte</label>
              <select
                value={settings.fontFamily}
                onChange={e => update({ fontFamily: e.target.value })}
                className="w-full rounded border border-border bg-muted/30 px-1.5 py-1 text-xs"
              >
                <option value="Arial">Arial</option>
                <option value="Times New Roman">Times New Roman</option>
                <option value="Courier New">Courier New</option>
                <option value="Georgia">Georgia</option>
                <option value="Verdana">Verdana</option>
              </select>
            </div>
          </div>

          {/* Colors */}
          <div className="grid grid-cols-2 gap-1">
            <div>
              <label className="text-muted-foreground text-[10px]">Cor do texto</label>
              <input
                type="color"
                value={settings.color}
                onChange={e => update({ color: e.target.value })}
                className="h-6 w-full cursor-pointer rounded border border-border"
              />
            </div>
            <div>
              <label className="text-muted-foreground text-[10px]">Fundo</label>
              <div className="flex gap-1">
                <input
                  type="color"
                  value={settings.backgroundColor === "transparent" ? "#ffffff" : settings.backgroundColor}
                  onChange={e => update({ backgroundColor: e.target.value })}
                  className="h-6 flex-1 cursor-pointer rounded border border-border"
                  disabled={settings.backgroundColor === "transparent"}
                />
                <button
                  onClick={() => update({ backgroundColor: settings.backgroundColor === "transparent" ? "#ffffff" : "transparent" })}
                  className={`text-[9px] px-1 rounded border ${settings.backgroundColor === "transparent" ? "border-primary text-primary" : "border-border text-muted-foreground"}`}
                >
                  ∅
                </button>
              </div>
            </div>
          </div>

          {/* Separator line */}
          <div className="flex items-center gap-2">
            <label className="flex items-center gap-1 text-[10px] text-muted-foreground cursor-pointer">
              <input
                type="checkbox"
                checked={settings.showLine}
                onChange={e => update({ showLine: e.target.checked })}
                className="rounded"
              />
              Linha separadora
            </label>
            {settings.showLine && (
              <input
                type="color"
                value={settings.lineColor}
                onChange={e => update({ lineColor: e.target.value })}
                className="h-5 w-8 cursor-pointer rounded border border-border"
              />
            )}
          </div>
        </div>
      )}
    </div>
  );
}
