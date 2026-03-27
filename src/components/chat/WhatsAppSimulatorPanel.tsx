/**
 * WhatsApp Simulator Panel — toggle simulation mode and configure persona.
 * Displayed in the chat interface for testing without a real WhatsApp API.
 */
import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import { Textarea } from "@/components/ui/textarea";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import {
  Smartphone, Bot, ChevronDown, ChevronRight, Send,
  Zap, AlertTriangle, Settings2,
} from "lucide-react";
import { toast } from "sonner";
import type { SimulationPersona } from "@/hooks/useWhatsAppSimulator";

const PERSONA_META: Record<SimulationPersona, { label: string; emoji: string; desc: string }> = {
  interessado: { label: "Interessado", emoji: "😊", desc: "Cliente animado, faz perguntas, quer comprar" },
  indeciso: { label: "Indeciso", emoji: "🤔", desc: "Cliente que precisa pensar, consulta marido/esposa" },
  apressado: { label: "Apressado", emoji: "⚡", desc: "Cliente urgente, quer fechar rápido e direto" },
  resistente: { label: "Resistente", emoji: "🚫", desc: "Cliente que desistiu ou não tem interesse" },
  curioso: { label: "Curioso", emoji: "🔍", desc: "Cliente analítico, quer dados e comparativos" },
};

interface Props {
  config: {
    enabled: boolean;
    persona: SimulationPersona;
    delayMin: number;
    delayMax: number;
    autoReply: boolean;
  };
  onUpdateConfig: (updates: Partial<Props["config"]>) => void;
  onSendManual: (message?: string) => Promise<boolean>;
  hasSelectedConversation: boolean;
}

export function WhatsAppSimulatorPanel({ config, onUpdateConfig, onSendManual, hasSelectedConversation }: Props) {
  const [open, setOpen] = useState(false);
  const [manualMsg, setManualMsg] = useState("");
  const [sending, setSending] = useState(false);

  const handleSendManual = async () => {
    setSending(true);
    const success = await onSendManual(manualMsg.trim() || undefined);
    if (success) {
      setManualMsg("");
      toast.success("📱 Mensagem simulada enviada!");
    }
    setSending(false);
  };

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <CollapsibleTrigger asChild>
        <button className="w-full flex items-center justify-between px-3 py-2 border-b border-border bg-amber-50/50 dark:bg-amber-950/20 hover:bg-amber-50 dark:hover:bg-amber-950/30 transition-colors">
          <div className="flex items-center gap-2">
            <Smartphone className="h-3.5 w-3.5 text-amber-600" />
            <span className="text-xs font-semibold text-amber-700 dark:text-amber-400">
              Simulador WhatsApp
            </span>
            <Badge
              variant="outline"
              className={`text-[10px] h-4 ${config.enabled
                ? "border-green-500 text-green-700 dark:text-green-400 bg-green-50 dark:bg-green-950/30"
                : "border-muted-foreground/30 text-muted-foreground"
              }`}
            >
              {config.enabled ? "🟢 Ativo" : "⚪ Inativo"}
            </Badge>
          </div>
          <div className="flex items-center gap-1.5">
            {config.enabled && (
              <Badge variant="secondary" className="text-[10px] h-4">
                {PERSONA_META[config.persona].emoji} {PERSONA_META[config.persona].label}
              </Badge>
            )}
            {open ? <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" /> : <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />}
          </div>
        </button>
      </CollapsibleTrigger>

      <CollapsibleContent>
        <div className="border-b border-border bg-card px-3 py-3 space-y-4 animate-in fade-in slide-in-from-top-1 duration-200">
          {/* Enable/Disable */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Zap className="h-4 w-4 text-amber-500" />
              <div>
                <p className="text-xs font-medium text-foreground">Modo Simulação</p>
                <p className="text-[10px] text-muted-foreground">Respostas automáticas do cliente fictício</p>
              </div>
            </div>
            <Switch
              checked={config.enabled}
              onCheckedChange={(v) => onUpdateConfig({ enabled: v })}
            />
          </div>

          {config.enabled && (
            <>
              {/* Info banner */}
              <div className="flex items-start gap-2 p-2 rounded-lg bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800">
                <AlertTriangle className="h-3.5 w-3.5 text-amber-600 shrink-0 mt-0.5" />
                <p className="text-[10px] text-amber-700 dark:text-amber-400 leading-relaxed">
                  Modo de teste ativo. As mensagens do cliente são simuladas. 
                  Para conectar o WhatsApp real, basta adicionar a API (Evolution/Twilio) e desativar a simulação.
                </p>
              </div>

              {/* Persona */}
              <div className="space-y-1.5">
                <label className="text-[11px] font-medium text-foreground flex items-center gap-1.5">
                  <Bot className="h-3 w-3" />
                  Persona do Cliente
                </label>
                <Select value={config.persona} onValueChange={(v) => onUpdateConfig({ persona: v as SimulationPersona })}>
                  <SelectTrigger className="h-8 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(PERSONA_META).map(([key, meta]) => (
                      <SelectItem key={key} value={key} className="text-xs">
                        <span className="flex items-center gap-2">
                          <span>{meta.emoji}</span>
                          <span>{meta.label}</span>
                          <span className="text-muted-foreground ml-1">— {meta.desc}</span>
                        </span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Auto-reply toggle */}
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-[11px] font-medium text-foreground">Resposta automática</p>
                  <p className="text-[10px] text-muted-foreground">Cliente responde automaticamente quando a loja envia</p>
                </div>
                <Switch
                  checked={config.autoReply}
                  onCheckedChange={(v) => onUpdateConfig({ autoReply: v })}
                />
              </div>

              {/* Delay config */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <label className="text-[11px] font-medium text-foreground flex items-center gap-1.5">
                    <Settings2 className="h-3 w-3" />
                    Delay da resposta
                  </label>
                  <span className="text-[10px] text-muted-foreground">
                    {config.delayMin}s — {config.delayMax}s
                  </span>
                </div>
                <Slider
                  min={1}
                  max={30}
                  step={1}
                  value={[config.delayMin, config.delayMax]}
                  onValueChange={([min, max]) => onUpdateConfig({ delayMin: min, delayMax: Math.max(min, max) })}
                  className="w-full"
                />
              </div>

              {/* Manual send */}
              {hasSelectedConversation && (
                <div className="space-y-1.5">
                  <label className="text-[11px] font-medium text-foreground">
                    Enviar mensagem manual como cliente
                  </label>
                  <div className="flex gap-1.5">
                    <Textarea
                      value={manualMsg}
                      onChange={(e) => setManualMsg(e.target.value)}
                      placeholder="Digite uma mensagem como se fosse o cliente..."
                      className="min-h-[32px] max-h-[80px] text-xs flex-1 resize-none"
                      rows={1}
                    />
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-8 px-2 shrink-0 gap-1 text-[11px]"
                      onClick={handleSendManual}
                      disabled={sending}
                    >
                      <Send className="h-3 w-3" />
                      Simular
                    </Button>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}
