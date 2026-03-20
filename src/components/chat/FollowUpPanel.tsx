import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Calendar, Clock, Pause, Play, X, Settings2,
  ChevronDown, ChevronUp, Send, Copy, ExternalLink,
} from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { toast } from "sonner";
import {
  useFollowUp,
  STAGE_LABELS,
  type FollowUpSchedule,
} from "@/hooks/useFollowUp";

interface Props {
  tenantId: string | null;
  userId?: string;
}

export function FollowUpPanel({ tenantId, userId }: Props) {
  const {
    schedules, config, loading, pendingCount, pausedCount,
    updateConfig, pauseSchedule, resumeSchedule, cancelSchedule,
    pauseAllForClient, resumeAllForClient,
  } = useFollowUp(tenantId, userId);

  const [showSettings, setShowSettings] = useState(false);

  const handleCopy = (text: string) => {
    navigator.clipboard.writeText(text);
    toast.success("Mensagem copiada!");
  };

  // Group schedules by client
  const grouped = schedules.reduce<Record<string, FollowUpSchedule[]>>((acc, s) => {
    const key = s.client_id;
    if (!acc[key]) acc[key] = [];
    acc[key].push(s);
    return acc;
  }, {});

  return (
    <div className="space-y-4">
      {/* Header with config toggle */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm flex items-center gap-2">
              <Calendar className="h-4 w-4 text-primary" />
              Follow-Up Automático
            </CardTitle>
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-2">
                <Badge variant="outline" className="text-[10px]">
                  {pendingCount} pendentes
                </Badge>
                {pausedCount > 0 && (
                  <Badge variant="secondary" className="text-[10px]">
                    {pausedCount} pausados
                  </Badge>
                )}
              </div>
              <Button
                variant="ghost"
                size="sm"
                className="h-7 w-7 p-0"
                onClick={() => setShowSettings(!showSettings)}
              >
                {showSettings ? <ChevronUp className="h-4 w-4" /> : <Settings2 className="h-4 w-4" />}
              </Button>
            </div>
          </div>
        </CardHeader>

        {showSettings && (
          <CardContent className="border-t pt-4 space-y-4">
            <div className="flex items-center justify-between">
              <Label className="text-sm font-medium">Ativar Follow-Up Automático</Label>
              <Switch
                checked={config?.enabled ?? false}
                onCheckedChange={(v) => updateConfig({ enabled: v })}
              />
            </div>

            <div className="space-y-3">
              <p className="text-xs text-muted-foreground font-medium">Estágios ativos:</p>
              {(["1h", "24h", "3d"] as const).map((stage) => {
                const info = STAGE_LABELS[stage];
                const key = `stage_${stage.replace("d", "d")}` as "stage_1h" | "stage_24h" | "stage_3d";
                return (
                  <div key={stage} className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="text-sm">{info.emoji}</span>
                      <div>
                        <p className="text-xs font-medium">{info.label}</p>
                        <p className="text-[10px] text-muted-foreground">{info.description}</p>
                      </div>
                    </div>
                    <Switch
                      checked={config?.[key] ?? true}
                      onCheckedChange={(v) => updateConfig({ [key]: v })}
                    />
                  </div>
                );
              })}
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs">Máx. por cliente</Label>
                <Input
                  type="number"
                  min={1}
                  max={10}
                  value={config?.max_followups_per_client ?? 3}
                  onChange={(e) => updateConfig({ max_followups_per_client: Number(e.target.value) })}
                  className="h-8 text-sm"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Máx. diário total</Label>
                <Input
                  type="number"
                  min={1}
                  max={200}
                  value={config?.max_daily_total ?? 50}
                  onChange={(e) => updateConfig({ max_daily_total: Number(e.target.value) })}
                  className="h-8 text-sm"
                />
              </div>
            </div>

            {config && (
              <div className="bg-secondary/50 rounded-lg p-2">
                <p className="text-[10px] text-muted-foreground text-center">
                  Uso diário: {config.daily_count || 0} / {config.max_daily_total || 50} follow-ups enviados hoje
                </p>
              </div>
            )}
          </CardContent>
        )}
      </Card>

      {/* Schedules list */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm">Agenda de Follow-Ups</CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <p className="text-sm text-muted-foreground text-center py-8">Carregando...</p>
          ) : schedules.length === 0 ? (
            <div className="text-center py-8 space-y-2">
              <Calendar className="h-10 w-10 mx-auto text-muted-foreground/30" />
              <p className="text-sm text-muted-foreground">
                Nenhum follow-up agendado. A IA criará automaticamente quando detectar clientes sem resposta.
              </p>
            </div>
          ) : (
            <ScrollArea className="h-[500px]">
              <div className="space-y-4">
                {Object.entries(grouped).map(([clientId, items]) => {
                  const clientName = items[0]?.client_nome || "Cliente";
                  const allPaused = items.every((s) => s.status === "paused");
                  return (
                    <div key={clientId} className="border rounded-lg p-3 space-y-3">
                      <div className="flex items-center justify-between">
                        <p className="text-sm font-medium text-foreground">{clientName}</p>
                        <div className="flex gap-1">
                          {allPaused ? (
                            <Button
                              variant="outline"
                              size="sm"
                              className="h-6 text-[10px] gap-1"
                              onClick={() => resumeAllForClient(clientId)}
                            >
                              <Play className="h-3 w-3" /> Retomar todos
                            </Button>
                          ) : (
                            <Button
                              variant="outline"
                              size="sm"
                              className="h-6 text-[10px] gap-1"
                              onClick={() => pauseAllForClient(clientId)}
                            >
                              <Pause className="h-3 w-3" /> Pausar todos
                            </Button>
                          )}
                        </div>
                      </div>

                      {items.map((schedule) => {
                        const stageInfo = STAGE_LABELS[schedule.stage] || {
                          label: schedule.stage, emoji: "📌", description: "",
                        };
                        const isPaused = schedule.status === "paused";
                        return (
                          <div
                            key={schedule.id}
                            className={`rounded-md p-2.5 space-y-2 transition-colors ${
                              isPaused
                                ? "bg-muted/50 border border-dashed border-muted-foreground/20"
                                : "bg-secondary/50 border border-border"
                            }`}
                          >
                            <div className="flex items-center justify-between">
                              <div className="flex items-center gap-2">
                                <span className="text-xs">{stageInfo.emoji}</span>
                                <Badge
                                  variant={isPaused ? "secondary" : "default"}
                                  className="text-[10px]"
                                >
                                  {stageInfo.label}
                                </Badge>
                                {isPaused && (
                                  <Badge variant="outline" className="text-[10px] text-orange-500">
                                    ⏸ Pausado
                                  </Badge>
                                )}
                              </div>
                              <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
                                <Clock className="h-3 w-3" />
                                {format(new Date(schedule.scheduled_at), "dd/MM HH:mm", { locale: ptBR })}
                              </div>
                            </div>

                            {schedule.generated_message && (
                              <p className="text-xs text-foreground whitespace-pre-wrap leading-relaxed">
                                {schedule.generated_message}
                              </p>
                            )}

                            <div className="flex gap-1.5">
                              {isPaused ? (
                                <Button
                                  variant="outline"
                                  size="sm"
                                  className="h-6 text-[10px] gap-1"
                                  onClick={() => resumeSchedule(schedule.id)}
                                >
                                  <Play className="h-3 w-3" /> Retomar
                                </Button>
                              ) : (
                                <Button
                                  variant="outline"
                                  size="sm"
                                  className="h-6 text-[10px] gap-1"
                                  onClick={() => pauseSchedule(schedule.id)}
                                >
                                  <Pause className="h-3 w-3" /> Pausar
                                </Button>
                              )}
                              {schedule.generated_message && (
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="h-6 text-[10px] gap-1"
                                  onClick={() => handleCopy(schedule.generated_message!)}
                                >
                                  <Copy className="h-3 w-3" /> Copiar
                                </Button>
                              )}
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-6 text-[10px] gap-1 text-destructive"
                                onClick={() => cancelSchedule(schedule.id)}
                              >
                                <X className="h-3 w-3" /> Cancelar
                              </Button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  );
                })}
              </div>
            </ScrollArea>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
