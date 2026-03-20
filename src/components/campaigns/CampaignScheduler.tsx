import { useState, useEffect, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { supabase } from "@/lib/supabaseClient";
import { getTenantId } from "@/lib/tenantState";
import { toast } from "sonner";
import { format, addDays, startOfMonth, endOfMonth, eachDayOfInterval, isSameDay, isSameMonth, isToday, isPast } from "date-fns";
import { ptBR } from "date-fns/locale";
import {
  Calendar as CalendarIcon, Plus, Edit, Trash2, Bell, CheckCircle2, Clock,
  ChevronLeft, ChevronRight, Megaphone, AlertTriangle
} from "lucide-react";

interface ScheduledCampaign {
  id: string;
  titulo: string;
  descricao: string;
  data_inicio: string;
  data_fim: string | null;
  plataforma: string;
  status: "agendada" | "ativa" | "concluida" | "cancelada";
  lembrete_dias_antes: number;
  lembrete_enviado: boolean;
  categoria: string;
  created_at: string;
}

const COMMEMORATIVE_DATES = [
  { mes: 1, dia: 1, nome: "Ano Novo", emoji: "🎆" },
  { mes: 3, dia: 8, nome: "Dia da Mulher", emoji: "👩" },
  { mes: 3, dia: 15, nome: "Dia do Consumidor", emoji: "🛒" },
  { mes: 5, dia: 11, nome: "Dia das Mães", emoji: "💝" },
  { mes: 6, dia: 12, nome: "Dia dos Namorados", emoji: "❤️" },
  { mes: 6, dia: 24, nome: "São João", emoji: "🔥" },
  { mes: 8, dia: 10, nome: "Dia dos Pais", emoji: "👨" },
  { mes: 9, dia: 15, nome: "Dia do Cliente", emoji: "🤝" },
  { mes: 10, dia: 12, nome: "Dia das Crianças", emoji: "🧒" },
  { mes: 11, dia: 25, nome: "Black Friday", emoji: "🖤" },
  { mes: 12, dia: 25, nome: "Natal", emoji: "🎄" },
];

const STATUS_MAP: Record<string, { label: string; color: string }> = {
  agendada: { label: "Agendada", color: "bg-blue-500/10 text-blue-700" },
  ativa: { label: "Ativa", color: "bg-green-500/10 text-green-700" },
  concluida: { label: "Concluída", color: "bg-muted text-muted-foreground" },
  cancelada: { label: "Cancelada", color: "bg-red-500/10 text-red-700" },
};

export function CampaignScheduler() {
  const tenantId = getTenantId();
  const [campaigns, setCampaigns] = useState<ScheduledCampaign[]>([]);
  const [loading, setLoading] = useState(true);
  const [showDialog, setShowDialog] = useState(false);
  const [editing, setEditing] = useState<ScheduledCampaign | null>(null);
  const [currentMonth, setCurrentMonth] = useState(new Date());

  // Form
  const [titulo, setTitulo] = useState("");
  const [descricao, setDescricao] = useState("");
  const [dataInicio, setDataInicio] = useState("");
  const [dataFim, setDataFim] = useState("");
  const [plataforma, setPlataforma] = useState("instagram");
  const [status, setStatus] = useState<string>("agendada");
  const [lembreteDias, setLembreteDias] = useState(3);
  const [categoria, setCategoria] = useState("promocao");

  const fetchCampaigns = async () => {
    if (!tenantId) return;
    setLoading(true);
    const { data } = await supabase
      .from("campaign_schedules" as any)
      .select("*")
      .eq("tenant_id", tenantId)
      .order("data_inicio", { ascending: true });
    if (data) setCampaigns(data as unknown as ScheduledCampaign[]);
    setLoading(false);
  };

  useEffect(() => { fetchCampaigns(); }, [tenantId]);

  const openNew = (presetDate?: string, presetName?: string) => {
    setEditing(null);
    setTitulo(presetName || "");
    setDescricao("");
    setDataInicio(presetDate || format(new Date(), "yyyy-MM-dd"));
    setDataFim("");
    setPlataforma("instagram");
    setStatus("agendada");
    setLembreteDias(3);
    setCategoria("promocao");
    setShowDialog(true);
  };

  const openEdit = (c: ScheduledCampaign) => {
    setEditing(c);
    setTitulo(c.titulo);
    setDescricao(c.descricao);
    setDataInicio(c.data_inicio.split("T")[0]);
    setDataFim(c.data_fim?.split("T")[0] || "");
    setPlataforma(c.plataforma);
    setStatus(c.status);
    setLembreteDias(c.lembrete_dias_antes);
    setCategoria(c.categoria);
    setShowDialog(true);
  };

  const saveCampaign = async () => {
    if (!titulo.trim() || !dataInicio) {
      toast.error("Título e data de início são obrigatórios");
      return;
    }
    const payload = {
      tenant_id: tenantId,
      titulo: titulo.trim(),
      descricao: descricao.trim(),
      data_inicio: dataInicio,
      data_fim: dataFim || null,
      plataforma,
      status,
      lembrete_dias_antes: lembreteDias,
      categoria,
      lembrete_enviado: false,
    };

    if (editing) {
      const { error } = await supabase.from("campaign_schedules" as any).update(payload as any).eq("id", editing.id);
      if (error) toast.error("Erro ao atualizar"); else toast.success("Campanha atualizada!");
    } else {
      const { error } = await supabase.from("campaign_schedules" as any).insert(payload as any);
      if (error) toast.error("Erro ao criar campanha"); else toast.success("Campanha agendada!");
    }
    setShowDialog(false);
    fetchCampaigns();
  };

  const deleteCampaign = async (id: string) => {
    if (!confirm("Excluir esta campanha agendada?")) return;
    await supabase.from("campaign_schedules" as any).delete().eq("id", id);
    toast.success("Campanha excluída");
    fetchCampaigns();
  };

  // Calendar logic
  const monthStart = startOfMonth(currentMonth);
  const monthEnd = endOfMonth(currentMonth);
  const daysInMonth = eachDayOfInterval({ start: monthStart, end: monthEnd });
  const startPadding = monthStart.getDay();

  const getCampaignsForDay = (day: Date) => campaigns.filter(c => {
    const start = new Date(c.data_inicio);
    const end = c.data_fim ? new Date(c.data_fim) : start;
    return day >= new Date(start.toDateString()) && day <= new Date(end.toDateString());
  });

  const getCommemorativeForDay = (day: Date) =>
    COMMEMORATIVE_DATES.find(d => d.dia === day.getDate() && d.mes === day.getMonth() + 1);

  // Upcoming reminders
  const upcomingReminders = useMemo(() => {
    const now = new Date();
    return campaigns
      .filter(c => c.status === "agendada" && !c.lembrete_enviado)
      .filter(c => {
        const reminderDate = addDays(new Date(c.data_inicio), -c.lembrete_dias_antes);
        return reminderDate <= addDays(now, 7) && new Date(c.data_inicio) >= now;
      })
      .slice(0, 5);
  }, [campaigns]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <div className="h-6 w-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Reminders */}
      {upcomingReminders.length > 0 && (
        <Card className="border-amber-200 bg-amber-50/50">
          <CardContent className="py-3 px-4">
            <div className="flex items-center gap-2 mb-2">
              <Bell className="h-4 w-4 text-amber-600" />
              <span className="text-sm font-medium text-amber-800">Lembretes Próximos</span>
            </div>
            <div className="space-y-1.5">
              {upcomingReminders.map(c => (
                <div key={c.id} className="flex items-center gap-2 text-xs text-amber-700">
                  <AlertTriangle className="h-3 w-3" />
                  <span><strong>{c.titulo}</strong> — inicia em {format(new Date(c.data_inicio), "dd/MM", { locale: ptBR })}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">Agende campanhas e receba lembretes para datas comemorativas.</p>
        <Button size="sm" onClick={() => openNew()} className="gap-1.5">
          <Plus className="h-3.5 w-3.5" /> Agendar Campanha
        </Button>
      </div>

      {/* Calendar */}
      <Card>
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base flex items-center gap-2">
              <CalendarIcon className="h-5 w-5 text-primary" /> Calendário de Campanhas
            </CardTitle>
            <div className="flex items-center gap-2">
              <Button variant="ghost" size="icon" className="h-8 w-8"
                onClick={() => setCurrentMonth(prev => new Date(prev.getFullYear(), prev.getMonth() - 1))}>
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <span className="text-sm font-medium min-w-[120px] text-center capitalize">
                {format(currentMonth, "MMMM yyyy", { locale: ptBR })}
              </span>
              <Button variant="ghost" size="icon" className="h-8 w-8"
                onClick={() => setCurrentMonth(prev => new Date(prev.getFullYear(), prev.getMonth() + 1))}>
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-7 gap-px bg-border rounded-lg overflow-hidden">
            {["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"].map(d => (
              <div key={d} className="bg-muted/50 py-2 text-center text-[10px] font-medium text-muted-foreground">{d}</div>
            ))}
            {Array.from({ length: startPadding }).map((_, i) => (
              <div key={`pad-${i}`} className="bg-background p-1 min-h-[70px]" />
            ))}
            {daysInMonth.map(day => {
              const dayCampaigns = getCampaignsForDay(day);
              const commemorative = getCommemorativeForDay(day);
              const today = isToday(day);

              return (
                <div key={day.toISOString()}
                  className={`bg-background p-1 min-h-[70px] cursor-pointer hover:bg-muted/30 transition-colors relative ${today ? "ring-2 ring-primary ring-inset" : ""}`}
                  onClick={() => {
                    if (commemorative) openNew(format(day, "yyyy-MM-dd"), `Campanha ${commemorative.nome}`);
                    else openNew(format(day, "yyyy-MM-dd"));
                  }}>
                  <span className={`text-xs font-medium ${today ? "text-primary" : isPast(day) && !today ? "text-muted-foreground/50" : "text-foreground"}`}>
                    {day.getDate()}
                  </span>
                  {commemorative && (
                    <div className="mt-0.5">
                      <span className="text-[9px] bg-amber-100 text-amber-800 rounded px-1 py-px block truncate" title={commemorative.nome}>
                        {commemorative.emoji} {commemorative.nome}
                      </span>
                    </div>
                  )}
                  {dayCampaigns.slice(0, 2).map(c => {
                    const st = STATUS_MAP[c.status];
                    return (
                      <div key={c.id} className={`mt-0.5 text-[8px] rounded px-1 py-px truncate ${st.color}`}
                        onClick={e => { e.stopPropagation(); openEdit(c); }} title={c.titulo}>
                        {c.titulo}
                      </div>
                    );
                  })}
                  {dayCampaigns.length > 2 && (
                    <span className="text-[8px] text-muted-foreground">+{dayCampaigns.length - 2} mais</span>
                  )}
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* Commemorative dates suggestions */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">📅 Datas Comemorativas — Planeje com Antecedência</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2">
            {COMMEMORATIVE_DATES.map(d => {
              const dateThisYear = new Date(new Date().getFullYear(), d.mes - 1, d.dia);
              if (isPast(dateThisYear)) dateThisYear.setFullYear(dateThisYear.getFullYear() + 1);
              const hasScheduled = campaigns.some(c => {
                const cDate = new Date(c.data_inicio);
                return cDate.getDate() === d.dia && cDate.getMonth() + 1 === d.mes;
              });

              return (
                <button key={`${d.mes}-${d.dia}`}
                  onClick={() => openNew(format(dateThisYear, "yyyy-MM-dd"), `Campanha ${d.nome}`)}
                  className={`p-3 rounded-lg border text-left transition-all hover:border-primary/50 hover:bg-primary/5 ${hasScheduled ? "border-green-300 bg-green-50/50" : "border-border"}`}>
                  <div className="flex items-center justify-between">
                    <span className="text-lg">{d.emoji}</span>
                    {hasScheduled && <CheckCircle2 className="h-3.5 w-3.5 text-green-600" />}
                  </div>
                  <p className="text-xs font-medium mt-1">{d.nome}</p>
                  <p className="text-[10px] text-muted-foreground">{format(dateThisYear, "dd/MM", { locale: ptBR })}</p>
                </button>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* Campaigns list */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">Campanhas Agendadas</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Campanha</TableHead>
                <TableHead>Plataforma</TableHead>
                <TableHead>Início</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Lembrete</TableHead>
                <TableHead className="w-24">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {campaigns.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center text-muted-foreground py-8">
                    Nenhuma campanha agendada. Clique em uma data no calendário ou use o botão acima.
                  </TableCell>
                </TableRow>
              ) : campaigns.map(c => {
                const st = STATUS_MAP[c.status] || STATUS_MAP.agendada;
                return (
                  <TableRow key={c.id}>
                    <TableCell>
                      <p className="font-medium text-sm">{c.titulo}</p>
                      {c.descricao && <p className="text-xs text-muted-foreground truncate max-w-[200px]">{c.descricao}</p>}
                    </TableCell>
                    <TableCell><Badge variant="outline" className="text-xs capitalize">{c.plataforma}</Badge></TableCell>
                    <TableCell className="text-xs">{format(new Date(c.data_inicio), "dd/MM/yyyy", { locale: ptBR })}</TableCell>
                    <TableCell><Badge variant="outline" className={st.color}>{st.label}</Badge></TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      <Clock className="h-3 w-3 inline mr-1" />{c.lembrete_dias_antes}d antes
                    </TableCell>
                    <TableCell>
                      <div className="flex gap-1">
                        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEdit(c)}>
                          <Edit className="h-3 w-3" />
                        </Button>
                        <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => deleteCampaign(c.id)}>
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Campaign Dialog */}
      <Dialog open={showDialog} onOpenChange={setShowDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Megaphone className="h-5 w-5" /> {editing ? "Editar Campanha" : "Agendar Campanha"}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Título da Campanha</Label>
              <Input value={titulo} onChange={e => setTitulo(e.target.value)} placeholder="Ex: Black Friday 2025" className="mt-1" />
            </div>
            <div>
              <Label>Descrição (opcional)</Label>
              <Textarea value={descricao} onChange={e => setDescricao(e.target.value)} placeholder="Notas sobre a campanha..." className="mt-1 min-h-[60px]" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Data Início</Label>
                <Input type="date" value={dataInicio} onChange={e => setDataInicio(e.target.value)} className="mt-1" />
              </div>
              <div>
                <Label>Data Fim (opcional)</Label>
                <Input type="date" value={dataFim} onChange={e => setDataFim(e.target.value)} className="mt-1" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Plataforma</Label>
                <Select value={plataforma} onValueChange={setPlataforma}>
                  <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="instagram">Instagram</SelectItem>
                    <SelectItem value="facebook">Facebook</SelectItem>
                    <SelectItem value="google">Google Ads</SelectItem>
                    <SelectItem value="whatsapp">WhatsApp</SelectItem>
                    <SelectItem value="todas">Todas</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Categoria</Label>
                <Select value={categoria} onValueChange={setCategoria}>
                  <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="promocao">Promoção</SelectItem>
                    <SelectItem value="data_comemorativa">Data Comemorativa</SelectItem>
                    <SelectItem value="lancamento">Lançamento</SelectItem>
                    <SelectItem value="remarketing">Remarketing</SelectItem>
                    <SelectItem value="institucional">Institucional</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div>
              <Label>Lembrete (dias antes)</Label>
              <Input type="number" value={lembreteDias} onChange={e => setLembreteDias(Number(e.target.value))} min={1} max={30} className="mt-1" />
              <p className="text-xs text-muted-foreground mt-1">Você será notificado {lembreteDias} dia(s) antes do início</p>
            </div>
            {editing && (
              <div>
                <Label>Status</Label>
                <Select value={status} onValueChange={setStatus}>
                  <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="agendada">Agendada</SelectItem>
                    <SelectItem value="ativa">Ativa</SelectItem>
                    <SelectItem value="concluida">Concluída</SelectItem>
                    <SelectItem value="cancelada">Cancelada</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowDialog(false)}>Cancelar</Button>
            <Button onClick={saveCampaign}>{editing ? "Salvar" : "Agendar"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
