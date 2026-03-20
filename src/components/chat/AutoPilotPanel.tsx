import { memo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Bot, Settings, X, Zap, Shield, Clock } from "lucide-react";
import type { AutoPilotSettings } from "@/hooks/useAutoPilot";

interface Props {
  settings: AutoPilotSettings | null;
  isActive: boolean;
  onToggle: (v: boolean) => void;
  onUpdateSettings: (updates: Partial<AutoPilotSettings>) => void;
}

export const AutoPilotPanel = memo(function AutoPilotPanel({ settings, isActive, onToggle, onUpdateSettings }: Props) {
  const [showConfig, setShowConfig] = useState(false);

  const tokensPercent = settings ? Math.min(100, Math.round((settings.tokens_usados_hoje / (settings.max_tokens_dia || 1)) * 100)) : 0;
  const respostasPercent = settings ? Math.min(100, Math.round((settings.respostas_hoje / (settings.max_respostas_dia || 1)) * 100)) : 0;

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
        </div>
        <div className="flex items-center gap-2">
          {isActive && settings && (
            <span className="text-[10px] text-muted-foreground">
              {settings.respostas_hoje}/{settings.max_respostas_dia} respostas
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
