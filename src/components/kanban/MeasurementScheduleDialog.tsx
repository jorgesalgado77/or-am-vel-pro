import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { CalendarIcon, Clock, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

export interface MeasurementScheduleData {
  date: string; // YYYY-MM-DD
  time: string; // HH:mm
  observations: string;
}

interface Props {
  open: boolean;
  clientName: string;
  onConfirm: (data: MeasurementScheduleData) => Promise<void>;
  onCancel: () => void;
}

export function MeasurementScheduleDialog({ open, clientName, onConfirm, onCancel }: Props) {
  const [date, setDate] = useState<Date | undefined>(undefined);
  const [time, setTime] = useState("09:00");
  const [observations, setObservations] = useState("");
  const [saving, setSaving] = useState(false);

  const handleConfirm = async () => {
    if (!date) return;
    setSaving(true);
    try {
      await onConfirm({
        date: format(date, "yyyy-MM-dd"),
        time,
        observations,
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
            📐 Agendar Medição
          </DialogTitle>
          <p className="text-sm text-muted-foreground">
            Cliente: <span className="font-semibold text-foreground">{clientName}</span>
          </p>
        </DialogHeader>

        <div className="space-y-4 py-2">
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
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={onCancel} disabled={saving}>
            Cancelar
          </Button>
          <Button onClick={handleConfirm} disabled={!date || saving}>
            {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Confirmar Agendamento
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
