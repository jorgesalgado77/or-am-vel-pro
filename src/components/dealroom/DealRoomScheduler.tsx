import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Calendar, Clock, Plus, Trash2, Video, User,
} from "lucide-react";
import { supabase } from "@/lib/supabaseClient";
import { toast } from "sonner";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

interface ScheduledMeeting {
  id: string;
  tenant_id: string;
  client_id: string | null;
  client_name: string | null;
  scheduled_at: string;
  duration_minutes: number;
  status: string;
  session_id: string;
  notes: string | null;
  created_at: string;
}

interface DealRoomSchedulerProps {
  tenantId: string;
  clients: { id: string; nome: string }[];
  onStartMeeting: (sessionId: string, clientName: string, clientId?: string) => void;
}

export function DealRoomScheduler({ tenantId, clients, onStartMeeting }: DealRoomSchedulerProps) {
  const [meetings, setMeetings] = useState<ScheduledMeeting[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({
    client_id: "",
    date: "",
    time: "",
    duration: "30",
    notes: "",
  });

  useEffect(() => {
    loadMeetings();
  }, [tenantId]);

  const loadMeetings = async () => {
    const { data } = await supabase
      .from("dealroom_scheduled_meetings" as any)
      .select("*")
      .eq("tenant_id", tenantId)
      .gte("scheduled_at", new Date().toISOString())
      .order("scheduled_at", { ascending: true })
      .limit(20);
    if (data) setMeetings(data as unknown as ScheduledMeeting[]);
  };

  const handleCreate = async () => {
    if (!form.date || !form.time) {
      toast.error("Informe data e hora");
      return;
    }
    const scheduledAt = new Date(`${form.date}T${form.time}`).toISOString();
    const sessionId = crypto.randomUUID();
    const selectedClient = clients.find(c => c.id === form.client_id);

    const { error } = await supabase.from("dealroom_scheduled_meetings" as any).insert({
      tenant_id: tenantId,
      client_id: form.client_id || null,
      client_name: selectedClient?.nome || null,
      scheduled_at: scheduledAt,
      duration_minutes: Number(form.duration),
      status: "agendada",
      session_id: sessionId,
      notes: form.notes || null,
    });

    if (error) {
      toast.error("Erro ao agendar reunião");
      return;
    }

    toast.success("Reunião agendada!");
    setShowForm(false);
    setForm({ client_id: "", date: "", time: "", duration: "30", notes: "" });
    loadMeetings();
  };

  const handleDelete = async (id: string) => {
    await supabase.from("dealroom_scheduled_meetings" as any).delete().eq("id", id);
    toast.success("Reunião removida");
    loadMeetings();
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h4 className="text-sm font-semibold text-foreground flex items-center gap-2">
          <Calendar className="h-4 w-4 text-primary" /> Reuniões Agendadas
        </h4>
        <Button size="sm" variant="outline" className="gap-1 text-xs" onClick={() => setShowForm(!showForm)}>
          <Plus className="h-3.5 w-3.5" /> Agendar
        </Button>
      </div>

      {showForm && (
        <Card>
          <CardContent className="p-3 space-y-3">
            <div>
              <Label className="text-xs">Cliente</Label>
              <Select value={form.client_id} onValueChange={v => setForm(p => ({ ...p, client_id: v }))}>
                <SelectTrigger className="h-8 text-sm">
                  <SelectValue placeholder="Selecione..." />
                </SelectTrigger>
                <SelectContent>
                  {clients.map(c => (
                    <SelectItem key={c.id} value={c.id}>{c.nome}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label className="text-xs">Data</Label>
                <Input type="date" className="h-8 text-sm"
                  value={form.date} onChange={e => setForm(p => ({ ...p, date: e.target.value }))} />
              </div>
              <div>
                <Label className="text-xs">Hora</Label>
                <Input type="time" className="h-8 text-sm"
                  value={form.time} onChange={e => setForm(p => ({ ...p, time: e.target.value }))} />
              </div>
            </div>
            <div>
              <Label className="text-xs">Duração</Label>
              <Select value={form.duration} onValueChange={v => setForm(p => ({ ...p, duration: v }))}>
                <SelectTrigger className="h-8 text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="15">15 min</SelectItem>
                  <SelectItem value="30">30 min</SelectItem>
                  <SelectItem value="45">45 min</SelectItem>
                  <SelectItem value="60">1 hora</SelectItem>
                  <SelectItem value="90">1h30</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <Input placeholder="Observações..." className="h-8 text-sm"
              value={form.notes} onChange={e => setForm(p => ({ ...p, notes: e.target.value }))} />
            <Button size="sm" className="w-full" onClick={handleCreate}>Agendar Reunião</Button>
          </CardContent>
        </Card>
      )}

      <ScrollArea className="max-h-[300px]">
        {meetings.length === 0 ? (
          <p className="text-xs text-muted-foreground text-center py-6">Nenhuma reunião agendada.</p>
        ) : (
          <div className="space-y-2">
            {meetings.map(m => (
              <Card key={m.id}>
                <CardContent className="p-3">
                  <div className="flex items-center justify-between">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <User className="h-3.5 w-3.5 text-muted-foreground" />
                        <span className="text-sm font-medium text-foreground">{m.client_name || "Sem cliente"}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <Clock className="h-3 w-3 text-muted-foreground" />
                        <span className="text-xs text-muted-foreground">
                          {format(new Date(m.scheduled_at), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}
                        </span>
                        <Badge variant="outline" className="text-[9px] h-4">{m.duration_minutes} min</Badge>
                      </div>
                    </div>
                    <div className="flex gap-1">
                      <Button size="sm" variant="default" className="h-7 text-xs gap-1"
                        onClick={() => onStartMeeting(m.session_id, m.client_name || "", m.client_id || undefined)}>
                        <Video className="h-3 w-3" /> Iniciar
                      </Button>
                      <Button size="sm" variant="ghost" className="h-7 text-xs text-destructive"
                        onClick={() => handleDelete(m.id)}>
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </ScrollArea>
    </div>
  );
}
