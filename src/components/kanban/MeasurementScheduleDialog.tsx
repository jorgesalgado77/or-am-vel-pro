import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { CalendarIcon, Clock, Loader2, History, MapPin, RefreshCw, Navigation, Home } from "lucide-react";
import { cn } from "@/lib/utils";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { supabase } from "@/lib/supabaseClient";
import { useGoogleMapsKey, calculateRoundTripKm } from "@/hooks/useGoogleMapsKey";

export interface MeasurementScheduleData {
  date: string; // YYYY-MM-DD
  time: string; // HH:mm
  observations: string;
  rescheduleReason?: string;
  roundTripKm?: number | null;
}

export interface ScheduleHistoryEntry {
  id: string;
  date: string;
  time: string;
  observations: string;
  reason: string | null;
  created_by: string;
  created_at: string;
}

interface Props {
  open: boolean;
  clientName: string;
  clientId?: string;
  tenantId?: string;
  isReschedule?: boolean;
  clientAddress?: string | null;
  technicianAddress?: string | null;
  onConfirm: (data: MeasurementScheduleData) => Promise<void>;
  onCancel: () => void;
}

export function MeasurementScheduleDialog({ open, clientName, clientId, tenantId, isReschedule, clientAddress, technicianAddress, onConfirm, onCancel }: Props) {
  const [date, setDate] = useState<Date | undefined>(undefined);
  const [time, setTime] = useState("09:00");
  const [observations, setObservations] = useState("");
  const [rescheduleReason, setRescheduleReason] = useState("");
  const [saving, setSaving] = useState(false);
  const [history, setHistory] = useState<ScheduleHistoryEntry[]>([]);
  const [showHistory, setShowHistory] = useState(false);
  const [kmResult, setKmResult] = useState<{ km: number; duration: string } | null>(null);
  const [kmLoading, setKmLoading] = useState(false);
  const [kmError, setKmError] = useState<string | null>(null);

  const { googleMapsKey } = useGoogleMapsKey(tenantId || null);

  // Fetch schedule history
  useEffect(() => {
    if (!open || !clientId || !tenantId) { setHistory([]); return; }
    (async () => {
      const { data } = await supabase
        .from("measurement_schedule_history" as any)
        .select("*")
        .eq("client_id", clientId)
        .eq("tenant_id", tenantId)
        .order("created_at", { ascending: false });
      setHistory((data as any[] || []) as ScheduleHistoryEntry[]);
    })();
  }, [open, clientId, tenantId]);

  // Reset on open
  useEffect(() => {
    if (open) {
      setDate(undefined);
      setTime("09:00");
      setObservations("");
      setRescheduleReason("");
      setShowHistory(false);
      setKmResult(null);
      setKmError(null);
    }
  }, [open]);

  // Calculate KM when dialog opens
  useEffect(() => {
    if (!open || !googleMapsKey || !clientAddress || !technicianAddress) {
      if (open && (!clientAddress || !technicianAddress)) {
        setKmError("Endereço do cliente ou técnico não cadastrado");
      }
      return;
    }
    setKmLoading(true);
    setKmError(null);
    calculateRoundTripKm(googleMapsKey, technicianAddress, clientAddress)
      .then(result => {
        if (result) {
          setKmResult(result);
        } else {
          setKmError("Não foi possível calcular a distância");
        }
      })
      .finally(() => setKmLoading(false));
  }, [open, googleMapsKey, clientAddress, technicianAddress]);

  const hasHistory = history.length > 0;
  const effectiveIsReschedule = isReschedule || hasHistory;

  const handleConfirm = async () => {
    if (!date) return;
    if (effectiveIsReschedule && !rescheduleReason.trim()) return;
    setSaving(true);
    try {
      await onConfirm({
        date: format(date, "yyyy-MM-dd"),
        time,
        observations,
        rescheduleReason: effectiveIsReschedule ? rescheduleReason.trim() : undefined,
        roundTripKm: kmResult?.km || null,
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onCancel(); }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {effectiveIsReschedule ? <><RefreshCw className="h-5 w-5" /> Reagendar Medição</> : <>📐 Agendar Medição</>}
          </DialogTitle>
          <p className="text-sm text-muted-foreground">
            Cliente: <span className="font-semibold text-foreground">{clientName}</span>
          </p>
        </DialogHeader>

        {/* KM Distance Section */}
        <div className="rounded-lg border p-3 space-y-1.5">
          <div className="flex items-center gap-2">
            <MapPin className="h-4 w-4 text-primary" />
            <span className="text-sm font-semibold">Distância (ida e volta)</span>
          </div>
          {kmLoading ? (
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Loader2 className="h-3.5 w-3.5 animate-spin" /> Calculando distância...
            </div>
          ) : kmResult ? (
            <div className="flex items-center gap-3">
              <Badge className="text-sm font-bold bg-primary/15 text-primary border-primary/30" variant="outline">
                🚗 {kmResult.km} km
              </Badge>
              <span className="text-xs text-muted-foreground">Tempo estimado (ida): {kmResult.duration}</span>
            </div>
          ) : (
            <p className="text-xs text-muted-foreground">
              {kmError || (!googleMapsKey ? "Google Maps API não configurada. Configure em Configurações > APIs." : "Aguardando...")}
            </p>
          )}
        </div>

        <div className="space-y-4 py-2">
          {effectiveIsReschedule && (
            <div className="space-y-2">
              <Label className="text-destructive">Motivo do Reagendamento *</Label>
              <Textarea
                placeholder="Descreva o motivo do reagendamento..."
                value={rescheduleReason}
                onChange={(e) => setRescheduleReason(e.target.value)}
                rows={2}
                className="border-destructive/30 focus-visible:ring-destructive/30"
              />
            </div>
          )}

          <div className="space-y-2">
            <Label>Data da Medição *</Label>
            <Popover>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  className={cn(
                    "w-full justify-start text-left font-normal",
                    !date && "text-muted-foreground"
                  )}
                >
                  <CalendarIcon className="mr-2 h-4 w-4" />
                  {date ? format(date, "PPP", { locale: ptBR }) : "Selecione a data"}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar
                  mode="single"
                  selected={date}
                  onSelect={setDate}
                  disabled={(d) => d < new Date(new Date().setHours(0, 0, 0, 0))}
                  initialFocus
                  className={cn("p-3 pointer-events-auto")}
                />
              </PopoverContent>
            </Popover>
          </div>

          <div className="space-y-2">
            <Label>Horário *</Label>
            <div className="relative">
              <Clock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                type="time"
                value={time}
                onChange={(e) => setTime(e.target.value)}
                className="pl-10"
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label>Observações</Label>
            <Textarea
              placeholder="Informações adicionais sobre a medição..."
              value={observations}
              onChange={(e) => setObservations(e.target.value)}
              rows={3}
            />
          </div>

          {/* Schedule history */}
          {hasHistory && (
            <div className="space-y-2">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="text-xs gap-1.5 px-0 text-muted-foreground hover:text-foreground"
                onClick={() => setShowHistory(!showHistory)}
              >
                <History className="h-3.5 w-3.5" />
                Histórico ({history.length} agendamento{history.length > 1 ? "s" : ""})
              </Button>
              {showHistory && (
                <ScrollArea className="max-h-40">
                  <div className="space-y-2">
                    {history.map((h, i) => (
                      <div key={h.id || i} className="text-xs border rounded-md p-2 space-y-1 bg-muted/30">
                        <div className="flex items-center justify-between">
                          <span className="font-medium">
                            {h.date} às {h.time}
                          </span>
                          {i === 0 && <Badge variant="outline" className="text-[10px] px-1.5 py-0">Último</Badge>}
                        </div>
                        {h.reason && (
                          <p className="text-destructive/80">
                            <span className="font-medium">Motivo:</span> {h.reason}
                          </p>
                        )}
                        {h.observations && <p className="text-muted-foreground">{h.observations}</p>}
                        <p className="text-muted-foreground/60">
                          por {h.created_by} em {h.created_at ? format(new Date(h.created_at), "dd/MM/yy HH:mm") : "—"}
                        </p>
                      </div>
                    ))}
                  </div>
                </ScrollArea>
              )}
            </div>
          )}
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={onCancel} disabled={saving}>
            Cancelar
          </Button>
          <Button
            onClick={handleConfirm}
            disabled={!date || saving || (effectiveIsReschedule && !rescheduleReason.trim())}
          >
            {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {effectiveIsReschedule ? "Confirmar Reagendamento" : "Confirmar Agendamento"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
