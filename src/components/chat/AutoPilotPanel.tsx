import { memo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Bot, Settings, X, Zap, Shield, Clock, User, Sparkles, Hand } from "lucide-react";
import type { AutoPilotSettings } from "@/hooks/useAutoPilot";

export type InterventionMode = "automatico" | "assistido" | "manual";

const MODE_CONFIG: Record<InterventionMode, { label: string; icon: typeof Bot; emoji: string; desc: string; color: string }> = {
  automatico: {
    label: "Automático",
    icon: Bot,
    emoji: "🤖",
    desc: "IA responde automaticamente sem intervenção",
    color: "bg-emerald-500/15 text-emerald-700 border-emerald-500/30 dark:text-emerald-400",
  },
  assistido: {
    label: "Assistido",
    icon: Sparkles,
    emoji: "💡",
    desc: "IA sugere respostas, vendedor aprova e envia",
    color: "bg-blue-500/15 text-blue-700 border-blue-500/30 dark:text-blue-400",
  },
  manual: {
    label: "Manual",
    icon: Hand,
    emoji: "✋",
    desc: "Vendedor controla 100%, IA apenas analisa",
    color: "bg-amber-500/15 text-amber-700 border-amber-500/30 dark:text-amber-400",
  },
};

interface Props {
  settings: AutoPilotSettings | null;
  isActive: boolean;
  onToggle: (v: boolean) => void;
  onUpdateSettings: (updates: Partial<AutoPilotSettings>) => void;
  interventionMode?: InterventionMode;
  onModeChange?: (mode: InterventionMode) => void;
}

export const AutoPilotPanel = memo(function AutoPilotPanel({
  settings, isActive, onToggle, onUpdateSettings,
  interventionMode = "assistido", onModeChange,
}: Props) {
  const [showConfig, setShowConfig] = useState(false);

  const respostasPercent = settings && settings.max_respostas_dia > 0
    ? Math.min(100, Math.round((settings.respostas_hoje / settings.max_respostas_dia) * 100))
    : 0;
  const tokensPercent = settings && settings.max_tokens_dia > 0
    ? Math.min(100, Math.round((settings.tokens_usados_hoje / settings.max_tokens_dia) * 100))
    : 0;

  const currentMode = MODE_CONFIG[interventionMode];
  const ModeIcon = currentMode.icon;

  return (
    <div className="border-b border-border bg-card">
      {/* Toggle bar */}
      <div className="flex items-center justify-between px-3 py-1.5">
        <div className="flex items-center gap-2">
          <Bot className={`h-4 w-4 ${isActive ? "text-emerald-500" : "text-muted-foreground"}`} />
          <span className="text-xs font-semibold">Auto-Pilot</span>
          {isActive && (
            <span className="flex items-center gap-1 text-[10px] text-emerald-600 bg-emerald-500/10 px-1.5 py-0.5 rounded-full font-medium animate-pulse">
              <Zap className="h-2.5 w-2.5" /> ATIVO
            </span>
          )}
          <Tooltip>
            <TooltipTrigger asChild>
              <Badge variant="outline" className={`text-[9px] px-1.5 py-0 h-4 gap-0.5 cursor-help ${currentMode.color}`}>
                <ModeIcon className="h-2.5 w-2.5" />
                {currentMode.label}
              </Badge>
            </TooltipTrigger>
            <TooltipContent side="bottom" className="text-xs max-w-[220px]">
              <p className="font-semibold">{currentMode.emoji} Modo {currentMode.label}</p>
              <p className="text-muted-foreground">{currentMode.desc}</p>
            </TooltipContent>
          </Tooltip>
        </div>
        <div className="flex items-center gap-2">
          {isActive && settings && (
            <span className="text-[10px] text-muted-foreground">
              {settings.respostas_hoje}/{settings.max_respostas_dia} · {(settings.tokens_usados_hoje || 0).toLocaleString()} tk
            </span>
          )}
          <Switch
            checked={isActive}
            onCheckedChange={onToggle}
            className="scale-75"
          />
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6"
            onClick={() => setShowConfig(!showConfig)}
          >
            {showConfig ? <X className="h-3 w-3" /> : <Settings className="h-3 w-3" />}
          </Button>
        </div>
      </div>

      {/* Usage bars */}
      {isActive && settings && (
        <div className="px-3 pb-1.5 flex gap-3">
          <div className="flex-1">
            <div className="flex justify-between text-[9px] text-muted-foreground mb-0.5">
              <span>Respostas</span>
              <span>{respostasPercent}%</span>
            </div>
            <div className="h-1 bg-muted rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full transition-all ${respostasPercent > 80 ? "bg-destructive" : "bg-emerald-500"}`}
                style={{ width: `${respostasPercent}%` }}
              />
            </div>
          </div>
          <div className="flex-1">
            <div className="flex justify-between text-[9px] text-muted-foreground mb-0.5">
              <span>Tokens</span>
              <span>{tokensPercent}%</span>
            </div>
            <div className="h-1 bg-muted rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full transition-all ${tokensPercent > 80 ? "bg-destructive" : "bg-primary"}`}
                style={{ width: `${tokensPercent}%` }}
              />
            </div>
          </div>
        </div>
      )}

      {/* Config panel */}
      {showConfig && (
        <div className="px-3 pb-3 pt-1 border-t border-border space-y-3 animate-in fade-in slide-in-from-top-2 duration-200">
          {/* Intervention Mode Selector */}
          <div className="space-y-1.5">
            <Label className="text-[10px] text-muted-foreground font-semibold flex items-center gap-1">
              <User className="h-2.5 w-2.5" /> Modo de Intervenção
            </Label>
            <div className="grid grid-cols-3 gap-1.5">
              {(Object.entries(MODE_CONFIG) as [InterventionMode, typeof MODE_CONFIG[InterventionMode]][]).map(([key, cfg]) => {
                const Icon = cfg.icon;
                const isSelected = interventionMode === key;
                return (
                  <button
                    key={key}
                    type="button"
                    onClick={() => onModeChange?.(key)}
                    className={`flex flex-col items-center gap-1 p-2 rounded-lg border text-[10px] transition-all ${
                      isSelected
                        ? `${cfg.color} border-current font-semibold`
                        : "border-border bg-card hover:bg-muted/50 text-muted-foreground"
                    }`}
                  >
                    <Icon className="h-3.5 w-3.5" />
                    <span>{cfg.label}</span>
                  </button>
                );
              })}
            </div>
            <p className="text-[9px] text-muted-foreground">{currentMode.desc}</p>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-[10px] text-muted-foreground">Máx respostas/dia</Label>
              <Input
                type="number"
                value={settings?.max_respostas_dia || 50}
                onChange={(e) => onUpdateSettings({ max_respostas_dia: parseInt(e.target.value) || 50 })}
                className="h-7 text-xs mt-0.5"
                min={1}
                max={500}
              />
            </div>
            <div>
              <Label className="text-[10px] text-muted-foreground">Máx tokens/dia</Label>
              <Input
                type="number"
                value={settings?.max_tokens_dia || 5000}
                onChange={(e) => onUpdateSettings({ max_tokens_dia: parseInt(e.target.value) || 5000 })}
                className="h-7 text-xs mt-0.5"
                min={100}
                max={100000}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-[10px] text-muted-foreground">Tom padrão</Label>
              <Select
                value={settings?.tom_padrao || "amigavel"}
                onValueChange={(v) => onUpdateSettings({ tom_padrao: v })}
              >
                <SelectTrigger className="h-7 text-xs mt-0.5"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="amigavel">Amigável</SelectItem>
                  <SelectItem value="persuasivo">Persuasivo</SelectItem>
                  <SelectItem value="profissional">Profissional</SelectItem>
                  <SelectItem value="urgente">Urgente</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-[10px] text-muted-foreground flex items-center gap-1">
                <Clock className="h-2.5 w-2.5" /> Delay (seg)
              </Label>
              <Input
                type="number"
                value={settings?.delay_segundos || 5}
                onChange={(e) => onUpdateSettings({ delay_segundos: parseInt(e.target.value) || 5 })}
                className="h-7 text-xs mt-0.5"
                min={2}
                max={60}
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label className="text-[10px] text-muted-foreground flex items-center gap-1">
              <Shield className="h-2.5 w-2.5" /> Responder por temperatura
            </Label>
            <div className="flex gap-4">
              <label className="flex items-center gap-1.5 text-[10px]">
                <Switch
                  checked={settings?.responder_quente ?? true}
                  onCheckedChange={(v) => onUpdateSettings({ responder_quente: v })}
                  className="scale-[0.6]"
                />
                🔥 Quente
              </label>
              <label className="flex items-center gap-1.5 text-[10px]">
                <Switch
                  checked={settings?.responder_morno ?? true}
                  onCheckedChange={(v) => onUpdateSettings({ responder_morno: v })}
                  className="scale-[0.6]"
                />
                🟡 Morno
              </label>
              <label className="flex items-center gap-1.5 text-[10px]">
                <Switch
                  checked={settings?.responder_frio ?? false}
                  onCheckedChange={(v) => onUpdateSettings({ responder_frio: v })}
                  className="scale-[0.6]"
                />
                ❄️ Frio
              </label>
            </div>
          </div>
        </div>
      )}
    </div>
  );
});
