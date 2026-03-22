/* eslint-disable */
import { useState, useEffect, useMemo, useCallback } from "react";
import { differenceInDays } from "date-fns";
import { DragDropContext, Droppable, Draggable, type DropResult } from "@hello-pangea/dnd";
import { ScrollableContainer } from "@/components/ui/scrollable-container";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Plus, Search, Filter, X, CalendarIcon, Handshake, Pencil, Trash2,
   History, FileText, Phone, Mail, User, Hash, Clock, AlertTriangle,
   Calculator, ChevronRight, GripVertical, Repeat, ArrowRight, UserPlus,
} from "lucide-react";
import { supabase } from "@/lib/supabaseClient";
import { logAudit, getAuditUserInfo } from "@/services/auditService";
import { getResolvedTenantId } from "@/contexts/TenantContext";
import { formatCurrency } from "@/lib/financing";
import { useCompanySettings } from "@/hooks/useCompanySettings";
import { useUsuarios } from "@/hooks/useUsuarios";
import { useIndicadores } from "@/hooks/useIndicadores";
import { useCurrentUser } from "@/hooks/useCurrentUser";
import { format, addDays, isPast, startOfDay, endOfDay, startOfMonth, subMonths, subDays, isAfter, isBefore } from "date-fns";
import { ptBR } from "date-fns/locale";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import type { Database } from "@/integrations/supabase/types";
import { TEMPERATURE_CONFIG, type LeadTemperature } from "@/lib/leadTemperature";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

type Client = Database["public"]["Tables"]["clients"]["Row"];

interface LastSimInfo {
  valor_final: number;
  created_at: string;
}

interface ClientsKanbanProps {
  clients: Client[];
  loading: boolean;
  onEdit: (client: Client) => void;
  onDelete: (id: string) => void;
  onAdd: () => void;
  onSimulate: (client: Client) => void;
  onHistory: (client: Client) => void;
  onContracts: (client: Client) => void;
}

const KANBAN_COLUMNS = [
  { id: "novo", label: "Novo", color: "hsl(var(--primary))", icon: "🆕" },
  { id: "em_negociacao", label: "Em Negociação", color: "hsl(270 70% 55%)", icon: "🤝" },
  { id: "proposta_enviada", label: "Proposta Enviada", color: "hsl(45 93% 47%)", icon: "📨" },
  { id: "fechado", label: "Fechado", color: "hsl(142 71% 45%)", icon: "✅" },
  { id: "perdido", label: "Perdido", color: "hsl(0 72% 51%)", icon: "❌" },
];

export function ClientsKanban({
  clients: externalClients, loading, onEdit, onDelete, onAdd, onSimulate, onHistory, onContracts,
}: ClientsKanbanProps) {
  // Local copy of clients so drag-and-drop can update status instantly
  const [localClients, setLocalClients] = useState<Client[]>(externalClients);
  useEffect(() => { setLocalClients(externalClients); }, [externalClients]);
  const [search, setSearch] = useState("");
  const [filterProjetista, setFilterProjetista] = useState("");
  const [filterIndicador, setFilterIndicador] = useState("");
  const [filterTemperature, setFilterTemperature] = useState("");
  const [periodFilter, setPeriodFilter] = useState("mes_atual");
  const [dateStart, setDateStart] = useState<Date | undefined>(undefined);
  const [dateEnd, setDateEnd] = useState<Date | undefined>(undefined);
  const [showFilters, setShowFilters] = useState(false);
  const [liberadorMonth, setLiberadorMonth] = useState(() => format(new Date(), "yyyy-MM"));
  const [lastSims, setLastSims] = useState<Record<string, LastSimInfo>>({});
  const [expandedClient, setExpandedClient] = useState<Client | null>(null);
  const [followUpStatus, setFollowUpStatus] = useState<Record<string, "active" | "paused" | "completed">>({});
  const { settings } = useCompanySettings();
  const { projetistas, usuarios } = useUsuarios();
  const { indicadores } = useIndicadores();
  const { currentUser } = useCurrentUser();

  const cargoNome = currentUser?.cargo_nome?.toLowerCase() || "";
  const canEdit = !currentUser || cargoNome === "administrador" || cargoNome === "gerente";
  const canDelete = !currentUser || cargoNome === "administrador";

  const indicadorMap = useMemo(() => {
    const map: Record<string, { nome: string; comissao: number }> = {};
    indicadores.forEach(i => { map[i.id] = { nome: i.nome, comissao: i.comissao_percentual }; });
    return map;
  }, [indicadores]);

  useEffect(() => {
    if (localClients.length === 0) return;
    const fetchLastSims = async () => {
      const { data } = await supabase
        .from("simulations")
        .select("client_id, valor_final, created_at")
        .order("created_at", { ascending: false });
      if (!data) return;
      const map: Record<string, LastSimInfo> = {};
      data.forEach((s) => {
        if (!map[s.client_id]) {
          map[s.client_id] = { valor_final: Number(s.valor_final) || 0, created_at: s.created_at };
        }
      });
      setLastSims(map);
    };
    fetchLastSims();
  }, [localClients]);

  // Fetch follow-up statuses for all clients
  useEffect(() => {
    if (localClients.length === 0) return;
    const fetchFollowUpStatuses = async () => {
      const clientIds = localClients.map(c => c.id);
      const { data } = await supabase
        .from("followup_schedules" as any)
        .select("client_id, status")
        .in("client_id", clientIds)
        .gte("created_at", new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString());
      if (!data) return;
      const statusMap: Record<string, "active" | "paused" | "completed"> = {};
      (data as any[]).forEach((s: any) => {
        const current = statusMap[s.client_id];
        if (s.status === "pending") statusMap[s.client_id] = "active";
        else if (s.status === "paused" && current !== "active") statusMap[s.client_id] = "paused";
        else if (s.status === "sent" && !current) statusMap[s.client_id] = "completed";
      });
      setFollowUpStatus(statusMap);
    };
    fetchFollowUpStatuses();
  }, [localClients]);

  const effectiveDates = useMemo(() => {
    const now = new Date();
    let start: Date | undefined;
    let end: Date | undefined;
    switch (periodFilter) {
      case "mes_atual": start = startOfMonth(now); end = now; break;
      case "mes_anterior": { const prev = subMonths(now, 1); start = startOfMonth(prev); end = endOfDay(new Date(prev.getFullYear(), prev.getMonth() + 1, 0)); break; }
      case "60_dias": start = subDays(now, 60); end = now; break;
      case "90_dias": start = subDays(now, 90); end = now; break;
      case "6_meses": start = subMonths(now, 6); end = now; break;
      case "personalizado": start = dateStart; end = dateEnd; break;
      default: break;
    }
    return { start, end };
  }, [periodFilter, dateStart, dateEnd]);

  const filtered = useMemo(() => {
    let baseClients = localClients;

    // Role-based visibility filtering
    if (currentUser && cargoNome) {
      const isAdmin = cargoNome.includes("administrador");
      const isGerente = cargoNome.includes("gerente");
      const isLiberador = cargoNome.includes("liberador");

      if (isLiberador) {
        const [lYear, lMonth] = liberadorMonth.split("-").map(Number);
        const lMonthStart = new Date(lYear, lMonth - 1, 1);
        const lMonthEnd = endOfDay(new Date(lYear, lMonth, 0));
        baseClients = baseClients.filter(c => {
          if ((c as any).status !== "fechado") return false;
          const updatedAt = new Date(c.updated_at);
          return !isBefore(updatedAt, lMonthStart) && !isAfter(updatedAt, lMonthEnd);
        });
      } else if (!isAdmin && !isGerente) {
        // Vendedor/Projetista: only sees their own clients
        const userName = currentUser.nome_completo || currentUser.apelido || "";
        if (userName) {
          baseClients = baseClients.filter(c => 
            c.vendedor?.toLowerCase() === userName.toLowerCase()
          );
        }
      }
      // Admin/Gerente: sees all clients (no filter)
    }

    return baseClients.filter((c) => {
      const q = search.toLowerCase().trim();
      if (q) {
        const matchesText =
          c.nome.toLowerCase().includes(q) ||
          (c.cpf || "").toLowerCase().includes(q) ||
          (c.vendedor || "").toLowerCase().includes(q) ||
          (c.email || "").toLowerCase().includes(q) ||
          ((c as any).numero_orcamento || "").toLowerCase().includes(q);
        if (!matchesText) return false;
      }
      if (filterProjetista && c.vendedor !== filterProjetista) return false;
      if (filterIndicador && c.indicador_id !== filterIndicador) return false;
      if (filterTemperature && (c as any).lead_temperature !== filterTemperature) return false;
      const { start, end } = effectiveDates;
      if (start || end) {
        const clientDate = new Date(c.created_at);
        if (start && isBefore(clientDate, startOfDay(start))) return false;
        if (end && isAfter(clientDate, endOfDay(end))) return false;
      }
      return true;
    });
  }, [localClients, search, filterProjetista, filterIndicador, filterTemperature, effectiveDates, currentUser, cargoNome]);

  const columnData = useMemo(() => {
    const map: Record<string, Client[]> = {};
    KANBAN_COLUMNS.forEach(col => { map[col.id] = []; });
    filtered.forEach(client => {
      const status = (client as any).status || "novo";
      if (map[status]) {
        map[status].push(client);
      } else {
        map["novo"].push(client);
      }
    });
    return map;
  }, [filtered]);

  const handleDragEnd = useCallback(async (result: DropResult) => {
    const { draggableId, destination } = result;
    if (!destination) return;
    const newStatus = destination.droppableId;
    const client = localClients.find(c => c.id === draggableId);
    if (!client || (client as any).status === newStatus) return;

    const oldStatus = (client as any).status;

    // Optimistic update via state (triggers re-render)
    setLocalClients(prev =>
      prev.map(c => c.id === draggableId ? { ...c, status: newStatus } as any : c)
    );

    const { error } = await supabase
      .from("clients")
      .update({ status: newStatus } as any)
      .eq("id", draggableId);

    if (error) {
      // Rollback
      setLocalClients(prev =>
        prev.map(c => c.id === draggableId ? { ...c, status: oldStatus } as any : c)
      );
      toast.error("Erro ao mover cliente");
    } else {
      const colLabel = KANBAN_COLUMNS.find(c => c.id === newStatus)?.label;
      toast.success(`${client.nome} movido para "${colLabel}"`);
    }
  }, [localClients]);

  const isExpired = (createdAt: string) => {
    const expiryDate = addDays(new Date(createdAt), settings.budget_validity_days);
    return isPast(expiryDate);
  };

  const hasActiveFilters = filterProjetista || filterIndicador || filterTemperature || periodFilter !== "mes_atual";

  const clearFilters = () => {
    setFilterProjetista("");
    setFilterIndicador("");
    setFilterTemperature("");
    setPeriodFilter("mes_atual");
    setDateStart(undefined);
    setDateEnd(undefined);
    setSearch("");
  };

  return (
    <div className="flex flex-col h-full">
      {/* Top bar */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2 sm:gap-4 mb-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Buscar por nome, CPF/CNPJ..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
        </div>
        <div className="flex gap-2">
          <Button variant={showFilters ? "secondary" : "outline"} size="sm" className="gap-2 flex-1 sm:flex-none" onClick={() => setShowFilters(!showFilters)}>
            <Filter className="h-4 w-4" /><span className="hidden sm:inline">Filtros</span>
            {hasActiveFilters && <Badge variant="default" className="h-5 px-1.5 text-xs ml-1">!</Badge>}
          </Button>
          <Button onClick={onAdd} className="gap-2 flex-1 sm:flex-none"><Plus className="h-4 w-4" /><span className="hidden sm:inline">Novo Cliente</span></Button>
        </div>
      </div>

      {/* Liberador month selector */}
      {cargoNome.includes("liberador") && (
        <div className="flex flex-col gap-3 mb-3 p-4 bg-muted/30 rounded-lg border border-border">
          <div className="flex items-center gap-3 flex-wrap">
            <CalendarIcon className="h-4 w-4 text-primary" />
            <Label className="text-sm font-medium whitespace-nowrap">Mês de referência:</Label>
            <Input
              type="month"
              value={liberadorMonth}
              onChange={(e) => setLiberadorMonth(e.target.value)}
              className="max-w-[200px]"
            />
            <span className="text-xs text-muted-foreground">Contratos fechados no período selecionado</span>
          </div>
          {(() => {
            const totalContratos = filtered.length;
            const valorAcumulado = filtered.reduce((sum, c) => {
              const sim = lastSims[c.id];
              return sum + (sim?.valor_final || 0);
            }, 0);
            return (
              <div className="flex items-center gap-6">
                <div className="flex items-center gap-2">
                  <div className="h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center">
                    <FileText className="h-4 w-4 text-primary" />
                  </div>
                  <div>
                    <p className="text-[11px] text-muted-foreground leading-none">Contratos</p>
                    <p className="text-lg font-bold text-foreground">{totalContratos}</p>
                  </div>
                </div>
                <Separator orientation="vertical" className="h-10" />
                <div className="flex items-center gap-2">
                  <div className="h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center">
                    <Calculator className="h-4 w-4 text-primary" />
                  </div>
                  <div>
                    <p className="text-[11px] text-muted-foreground leading-none">Valor Acumulado</p>
                    <p className="text-lg font-bold text-foreground">{formatCurrency(valorAcumulado)}</p>
                  </div>
                </div>
              </div>
            );
          })()}
        </div>
      )}

      {showFilters && (
        <div className="flex items-end gap-3 mb-4 p-3 bg-muted/30 rounded-lg border border-border flex-wrap">
          <div className="min-w-[160px]">
            <Label className="text-xs mb-1 block">Período</Label>
            <Select value={periodFilter} onValueChange={setPeriodFilter}>
              <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="mes_atual">Mês Atual</SelectItem>
                <SelectItem value="mes_anterior">Mês Anterior</SelectItem>
                <SelectItem value="60_dias">Últimos 60 dias</SelectItem>
                <SelectItem value="90_dias">Últimos 90 dias</SelectItem>
                <SelectItem value="6_meses">Últimos 6 meses</SelectItem>
                <SelectItem value="todos">Todos</SelectItem>
                <SelectItem value="personalizado">Personalizado</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {periodFilter === "personalizado" && (
            <>
              <div>
                <Label className="text-xs mb-1 block">De</Label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button variant="outline" size="sm" className={cn("w-[130px] justify-start text-left font-normal h-9", !dateStart && "text-muted-foreground")}>
                      <CalendarIcon className="mr-1 h-3 w-3" />
                      {dateStart ? format(dateStart, "dd/MM/yy") : "Início"}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <Calendar mode="single" selected={dateStart} onSelect={setDateStart} locale={ptBR} className="p-3 pointer-events-auto" />
                  </PopoverContent>
                </Popover>
              </div>
              <div>
                <Label className="text-xs mb-1 block">Até</Label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button variant="outline" size="sm" className={cn("w-[130px] justify-start text-left font-normal h-9", !dateEnd && "text-muted-foreground")}>
                      <CalendarIcon className="mr-1 h-3 w-3" />
                      {dateEnd ? format(dateEnd, "dd/MM/yy") : "Fim"}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <Calendar mode="single" selected={dateEnd} onSelect={setDateEnd} locale={ptBR} className="p-3 pointer-events-auto" />
                  </PopoverContent>
                </Popover>
              </div>
            </>
          )}
          <div className="min-w-[160px]">
            <Label className="text-xs mb-1 block">Projetista</Label>
            <Select value={filterProjetista || "_all"} onValueChange={(v) => setFilterProjetista(v === "_all" ? "" : v)}>
              <SelectTrigger className="h-9"><SelectValue placeholder="Todos" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="_all">Todos</SelectItem>
                {projetistas.map((p) => (
                  <SelectItem key={p.id} value={p.apelido || p.nome_completo}>
                    {p.apelido || p.nome_completo}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="min-w-[160px]">
            <Label className="text-xs mb-1 block">Indicador</Label>
            <Select value={filterIndicador || "_all"} onValueChange={(v) => setFilterIndicador(v === "_all" ? "" : v)}>
              <SelectTrigger className="h-9"><SelectValue placeholder="Todos" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="_all">Todos</SelectItem>
                {indicadores.filter(i => i.ativo).map((ind) => (
                  <SelectItem key={ind.id} value={ind.id}>
                    {ind.nome} ({ind.comissao_percentual}%)
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="min-w-[140px]">
            <Label className="text-xs mb-1 block">Temperatura</Label>
            <Select value={filterTemperature || "_all"} onValueChange={(v) => setFilterTemperature(v === "_all" ? "" : v)}>
              <SelectTrigger className="h-9"><SelectValue placeholder="Todas" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="_all">Todas</SelectItem>
                <SelectItem value="quente">🔥 Quente</SelectItem>
                <SelectItem value="morno">🟡 Morno</SelectItem>
                <SelectItem value="frio">❄️ Frio</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-center gap-2 ml-auto">
            <Badge variant="secondary" className="h-7 px-2.5 text-xs font-medium">
              {filtered.length} {filtered.length === 1 ? "cliente" : "clientes"}
            </Badge>
            {hasActiveFilters && (
              <Button variant="ghost" size="sm" className="gap-1 text-muted-foreground h-9" onClick={clearFilters}>
                <X className="h-3 w-3" />Limpar
              </Button>
            )}
          </div>
        </div>
      )}

      {/* Kanban Board */}
      {loading ? (
        <div className="flex items-center justify-center py-16 text-muted-foreground">Carregando...</div>
      ) : (
        <DragDropContext onDragEnd={handleDragEnd}>
          <ScrollableContainer direction="horizontal" className="flex-1 min-h-0 pb-4">
            <div className="flex gap-3 min-w-max">
            {KANBAN_COLUMNS.map(col => (
              <div key={col.id} className="flex flex-col min-w-[220px] w-[220px] md:min-w-[240px] md:w-[240px] shrink-0">
                {/* Column header */}
                <div className="flex items-center gap-2 mb-2 px-1">
                  <span className="text-base">{col.icon}</span>
                  <span className="text-sm font-semibold text-foreground">{col.label}</span>
                  <Badge variant="outline" className="ml-auto text-[10px] h-5 px-1.5">
                    {columnData[col.id]?.length || 0}
                  </Badge>
                </div>
                <div
                  className="rounded-lg border border-border/60 bg-muted/20 p-1.5 flex-1 min-h-[200px]"
                  style={{ borderTopColor: col.color, borderTopWidth: 3 }}
                >
                  <Droppable droppableId={col.id}>
                    {(provided, snapshot) => (
                      <div
                        ref={provided.innerRef}
                        {...provided.droppableProps}
                        className={cn(
                          "space-y-2 min-h-[180px] rounded-md transition-all duration-300 p-1",
                          snapshot.isDraggingOver && "bg-primary/5 ring-2 ring-primary/20 shadow-[0_0_15px_hsl(var(--primary)/0.15)]"
                        )}
                      >
                        {(columnData[col.id] || []).map((client, index) => {
                          const sim = lastSims[client.id];
                          const expired = sim ? isExpired(sim.created_at) : false;
                          return (
                            <Draggable key={client.id} draggableId={client.id} index={index}>
                              {(provided, snapshot) => {
                                const daysInColumn = differenceInDays(new Date(), new Date(client.updated_at));
                                const agingColor =
                                  daysInColumn <= 1 ? "hsl(142, 71%, 45%)" :   // green
                                  daysInColumn <= 3 ? "hsl(48, 96%, 53%)" :     // yellow
                                  daysInColumn <= 7 ? "hsl(25, 95%, 53%)" :     // orange
                                  "hsl(0, 84%, 60%)";                            // red
                                const agingGlow =
                                  daysInColumn > 7 ? "0 0 6px hsl(0 84% 60% / 0.3)" :
                                  daysInColumn > 3 ? "0 0 4px hsl(25 95% 53% / 0.2)" : "none";
                                return (
                                <div
                                  ref={provided.innerRef}
                                  {...provided.draggableProps}
                                    className={cn(
                                    "rounded-lg border bg-card shadow-sm transition-all cursor-pointer group border-l-[4px]",
                                    "hover:shadow-md hover:border-primary/30 hover:-translate-y-0.5",
                                    "dark:hover:shadow-[0_4px_20px_hsl(var(--primary)/0.2)] dark:hover:border-primary/50 dark:hover:bg-card/80",
                                    snapshot.isDragging && "shadow-[0_0_20px_hsl(var(--primary)/0.3)] ring-2 ring-primary/40 rotate-1 scale-105",
                                    expired && "border-destructive/30"
                                  )}
                                  style={{
                                    ...provided.draggableProps.style,
                                    borderLeftColor: agingColor,
                                    boxShadow: snapshot.isDragging ? undefined : agingGlow,
                                  }}
                                  onClick={() => setExpandedClient(client)}
                                >
                                    <div className="p-3">
                                      {/* Badge de tipo na coluna Novo */}
                                      {((client as any).status || "novo") === "novo" && (
                                        <div className="mb-1.5">
                                          {(client as any).origem_lead && (client as any).origem_lead !== "manual" ? (
                                            <Badge className="text-[9px] h-4 px-1.5 font-semibold bg-primary/15 text-primary border-primary/30 gap-0.5" variant="outline">
                                              <ArrowRight className="h-2.5 w-2.5" />
                                              Lead Recebido
                                            </Badge>
                                          ) : (
                                            <Badge className="text-[9px] h-4 px-1.5 font-semibold bg-emerald-500/15 text-emerald-600 border-emerald-500/30 gap-0.5" variant="outline">
                                              <UserPlus className="h-2.5 w-2.5" />
                                              Cliente Recente
                                            </Badge>
                                          )}
                                        </div>
                                      )}
                                      <div className="flex items-start justify-between gap-1">
                                        <div className="flex-1 min-w-0">
                                          <p className="text-sm font-semibold text-foreground truncate">{client.nome}</p>
                                          <div className="flex items-center gap-1 mt-0.5">
                                            <p className="text-[11px] text-muted-foreground font-mono">
                                              {(client as any).numero_orcamento || "Sem orçamento"}
                                          </p>
                                          {(() => {
                                            const temp = (client as any).lead_temperature as LeadTemperature | null;
                                            if (!temp || !TEMPERATURE_CONFIG[temp]) return null;
                                            const cfg = TEMPERATURE_CONFIG[temp];
                                            return (
                                              <Badge variant="outline" className={cn("text-[9px] h-4 px-1 font-medium", cfg.color)}>
                                                {cfg.emoji} {cfg.label}
                                              </Badge>
                                            );
                                          })()}
                                          {followUpStatus[client.id] && (
                                            <Tooltip>
                                              <TooltipTrigger asChild>
                                                <Badge
                                                  variant="outline"
                                                  className={cn(
                                                    "text-[9px] h-4 px-1 font-medium gap-0.5",
                                                    followUpStatus[client.id] === "active" && "border-emerald-400 text-emerald-600 bg-emerald-50",
                                                    followUpStatus[client.id] === "paused" && "border-amber-400 text-amber-600 bg-amber-50",
                                                    followUpStatus[client.id] === "completed" && "border-sky-400 text-sky-600 bg-sky-50",
                                                  )}
                                                >
                                                  <Repeat className="h-2.5 w-2.5" />
                                                  {followUpStatus[client.id] === "active" ? "FU" : followUpStatus[client.id] === "paused" ? "⏸" : "✓"}
                                                </Badge>
                                              </TooltipTrigger>
                                              <TooltipContent side="top" className="text-xs">
                                                {followUpStatus[client.id] === "active" && "Follow-up ativo"}
                                                {followUpStatus[client.id] === "paused" && "Follow-up pausado"}
                                                {followUpStatus[client.id] === "completed" && "Follow-up concluído"}
                                              </TooltipContent>
                                            </Tooltip>
                                          )}
                                        </div>
                                      </div>
                                      <div {...provided.dragHandleProps} className="opacity-0 group-hover:opacity-60 transition-opacity pt-0.5">
                                        <GripVertical className="h-4 w-4 text-muted-foreground" />
                                      </div>
                                    </div>
                                    <div className="flex items-center justify-between mt-2">
                                      <div className="flex items-center gap-1.5">
                                        <span className="text-[11px] text-muted-foreground">
                                          {format(new Date(client.created_at), "dd/MM/yy")}
                                        </span>
                                        <Badge
                                          variant="outline"
                                          className={cn(
                                            "text-[9px] h-4 px-1 font-medium",
                                            daysInColumn === 0 && "border-green-400 text-green-600",
                                            daysInColumn >= 1 && daysInColumn <= 3 && "border-yellow-400 text-yellow-600",
                                            daysInColumn >= 4 && daysInColumn <= 7 && "border-orange-400 text-orange-600",
                                            daysInColumn > 7 && "border-destructive text-destructive"
                                          )}
                                        >
                                          <Clock className="h-2.5 w-2.5 mr-0.5" />
                                          {daysInColumn === 0 ? "hoje" : `${daysInColumn}d`}
                                        </Badge>
                                      </div>
                                      {sim && (
                                        <span className={cn(
                                          "text-xs font-semibold",
                                          expired ? "text-destructive" : "text-foreground"
                                        )}>
                                          {formatCurrency(sim.valor_final)}
                                        </span>
                                      )}
                                    </div>
                                    {/* Show vendedor/projetista for Admin/Gerente */}
                                    {(cargoNome.includes("administrador") || cargoNome.includes("gerente")) && client.vendedor && (
                                      <div className="flex items-center gap-1 mt-1.5">
                                        <User className="h-3 w-3 text-primary/60" />
                                        <span className="text-[10px] text-primary/80 font-medium truncate">{client.vendedor}</span>
                                      </div>
                                    )}
                                    {expired && (
                                      <div className="flex items-center gap-1 mt-1.5">
                                        <AlertTriangle className="h-3 w-3 text-destructive" />
                                        <span className="text-[10px] text-destructive font-medium">Orçamento expirado</span>
                                      </div>
                                    )}
                                  </div>
                                </div>
                                );
                              }}
                            </Draggable>
                          );
                        })}
                        {provided.placeholder}
                      </div>
                    )}
                  </Droppable>
                </div>
              </div>
            ))}
          </div>
          </ScrollableContainer>
        </DragDropContext>
      )}

      {/* Expanded Client Dialog */}
      <Dialog open={!!expandedClient} onOpenChange={(open) => !open && setExpandedClient(null)}>
        <DialogContent className="max-w-lg w-[95vw] sm:w-full max-h-[90vh] sm:max-h-[85vh] overflow-hidden flex flex-col p-4 sm:p-6">
          {expandedClient && (
            <>
              <DialogHeader className="pb-0">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <DialogTitle className="text-lg">{expandedClient.nome}</DialogTitle>
                    <div className="flex items-center gap-3 mt-1.5">
                      <span className="text-xs text-muted-foreground font-mono flex items-center gap-1">
                        <Hash className="h-3 w-3" />
                        {(expandedClient as any).numero_orcamento || "—"}
                      </span>
                      <span className="text-xs text-muted-foreground flex items-center gap-1">
                        <Clock className="h-3 w-3" />
                        {format(new Date(expandedClient.created_at), "dd/MM/yyyy", { locale: ptBR })}
                      </span>
                    </div>
                  </div>
                  <Badge
                    variant="outline"
                    className="text-xs shrink-0"
                    style={{
                      borderColor: KANBAN_COLUMNS.find(c => c.id === ((expandedClient as any).status || "novo"))?.color,
                      color: KANBAN_COLUMNS.find(c => c.id === ((expandedClient as any).status || "novo"))?.color,
                    }}
                  >
                    {KANBAN_COLUMNS.find(c => c.id === ((expandedClient as any).status || "novo"))?.icon}{" "}
                    {KANBAN_COLUMNS.find(c => c.id === ((expandedClient as any).status || "novo"))?.label}
                  </Badge>
                </div>
              </DialogHeader>

              <Separator className="my-3" />

              <ScrollArea className="flex-1 pr-3">
                <div className="space-y-4">
                  {/* Client info */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 sm:gap-3">
                    {expandedClient.cpf && (
                      <div className="flex items-center gap-2 text-sm">
                        <User className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                        <span className="text-foreground truncate">{expandedClient.cpf}</span>
                      </div>
                    )}
                    {expandedClient.telefone1 && (
                      <div className="flex items-center gap-2 text-sm">
                        <Phone className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                        <span className="text-foreground truncate">{expandedClient.telefone1}</span>
                      </div>
                    )}
                    {expandedClient.telefone2 && (
                      <div className="flex items-center gap-2 text-sm">
                        <Phone className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                        <span className="text-foreground truncate">{expandedClient.telefone2}</span>
                      </div>
                    )}
                    {expandedClient.email && (
                      <div className="flex items-center gap-2 text-sm col-span-1 sm:col-span-2">
                        <Mail className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                        <span className="text-foreground truncate">{expandedClient.email}</span>
                      </div>
                    )}
                  </div>

                  {/* Details */}
                  <div className="space-y-2">
                    {/* Vendedor/Projetista assignment */}
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1 sm:gap-2 text-sm">
                      <span className="text-muted-foreground">Responsável</span>
                      {(cargoNome.includes("administrador") || cargoNome.includes("gerente")) ? (
                        <Select
                          value={expandedClient.vendedor || "__none__"}
                          onValueChange={async (val) => {
                            const newVendedor = val === "__none__" ? null : val;
                            const oldVendedor = expandedClient.vendedor;
                            const { error } = await supabase
                              .from("clients")
                              .update({ vendedor: newVendedor })
                              .eq("id", expandedClient.id);
                            if (error) {
                              toast.error("Erro ao atribuir responsável");
                              return;
                            }
                            // Audit log
                            const userInfo = getAuditUserInfo();
                            logAudit({
                              acao: "lead_atribuido",
                              entidade: "client",
                              entidade_id: expandedClient.id,
                              detalhes: {
                                cliente: expandedClient.nome,
                                de: oldVendedor || "Nenhum",
                                para: newVendedor || "Nenhum",
                              },
                              ...userInfo,
                            });
                            // In-app notification for assignee
                            if (newVendedor) {
                              const tenantId = await getResolvedTenantId();
                              supabase.from("tracking_messages").insert({
                                tenant_id: tenantId,
                                tipo: "sistema",
                                canal: "interno",
                                remetente: userInfo.usuario_nome || "Sistema",
                                conteudo: `📋 O lead "${expandedClient.nome}" foi atribuído a você por ${userInfo.usuario_nome || "um administrador"}.`,
                                destinatario: newVendedor,
                              } as any).then(() => {});
                            }
                            toast.success(
                              newVendedor
                                ? `✅ "${expandedClient.nome}" atribuído a ${newVendedor}. Notificação enviada!`
                                : `"${expandedClient.nome}" desvinculado.`,
                              { duration: 5000 }
                            );
                            // Auto-move to em_negociacao if currently "novo" and a vendedor was assigned
                            const currentStatus = (expandedClient as any).status || "novo";
                            const shouldMove = newVendedor && currentStatus === "novo";
                            const updateData: any = { vendedor: newVendedor };
                            if (shouldMove) updateData.status = "em_negociacao";

                            setLocalClients(prev =>
                              prev.map(c =>
                                c.id === expandedClient.id
                                  ? { ...c, vendedor: newVendedor, ...(shouldMove ? { status: "em_negociacao" } : {}) }
                                  : c
                              )
                            );
                            setExpandedClient({ ...expandedClient, vendedor: newVendedor, ...(shouldMove ? { status: "em_negociacao" } : {}) } as any);

                            if (shouldMove) {
                              await supabase.from("clients").update({ status: "em_negociacao" } as any).eq("id", expandedClient.id);
                              toast.success(`📋 "${expandedClient.nome}" movido para "Em Negociação"`, { duration: 3000 });
                            }
                          }}
                        >
                          <SelectTrigger className="w-full sm:w-[200px] h-8 text-xs">
                            <SelectValue>
                              {expandedClient.vendedor || "Atribuir responsável"}
                            </SelectValue>
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="__none__">Sem responsável</SelectItem>
                            {usuarios
                              .filter(u => u.ativo && u.cargo_nome && !u.cargo_nome.toLowerCase().includes("admin"))
                              .map(p => (
                                <SelectItem key={p.id} value={p.nome_completo}>{p.nome_completo} ({p.cargo_nome})</SelectItem>
                              ))}
                          </SelectContent>
                        </Select>
                      ) : (
                        <span className="text-foreground font-medium">{expandedClient.vendedor || "—"}</span>
                      )}
                    </div>
                    {expandedClient.indicador_id && indicadorMap[expandedClient.indicador_id] && (
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-muted-foreground">Indicador</span>
                        <span className="text-foreground font-medium">
                          {indicadorMap[expandedClient.indicador_id].nome}
                          <span className="text-muted-foreground ml-1">({indicadorMap[expandedClient.indicador_id].comissao}%)</span>
                        </span>
                      </div>
                    )}
                    {(expandedClient.quantidade_ambientes ?? 0) > 0 && (
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-muted-foreground">Ambientes</span>
                        <span className="text-foreground font-medium">{expandedClient.quantidade_ambientes}</span>
                      </div>
                    )}
                    {expandedClient.descricao_ambientes && (
                      <div className="text-sm">
                        <span className="text-muted-foreground block mb-1">Descrição dos ambientes</span>
                        <p className="text-foreground text-xs bg-muted/40 rounded-md p-2">{expandedClient.descricao_ambientes}</p>
                      </div>
                    )}
                  </div>

                  {/* Last simulation info */}
                  {lastSims[expandedClient.id] && (
                    <>
                      <Separator />
                      <div className="space-y-1.5">
                        <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Último Orçamento</h4>
                        <div className="flex items-center justify-between">
                          <span className="text-sm text-muted-foreground">Valor</span>
                          <span className="text-sm font-bold text-foreground">
                            {formatCurrency(lastSims[expandedClient.id].valor_final)}
                          </span>
                        </div>
                        <div className="flex items-center justify-between">
                          <span className="text-sm text-muted-foreground">Data</span>
                          <span className="text-sm text-foreground">
                            {format(new Date(lastSims[expandedClient.id].created_at), "dd/MM/yyyy HH:mm", { locale: ptBR })}
                          </span>
                        </div>
                        <div className="flex items-center justify-between">
                          <span className="text-sm text-muted-foreground">Validade</span>
                          {isExpired(lastSims[expandedClient.id].created_at) ? (
                            <Badge variant="destructive" className="text-xs gap-1">
                              <AlertTriangle className="h-3 w-3" />Expirado
                            </Badge>
                          ) : (
                            <span className="text-sm text-foreground">
                              Até {format(addDays(new Date(lastSims[expandedClient.id].created_at), settings.budget_validity_days), "dd/MM/yyyy")}
                            </span>
                          )}
                        </div>
                      </div>
                    </>
                  )}
                </div>
              </ScrollArea>

              <Separator className="my-3" />

              {/* Action buttons */}
              <div className="flex flex-wrap gap-2 justify-center sm:justify-start">
                <Button
                  className="gap-2 flex-1"
                  onClick={() => { setExpandedClient(null); onSimulate(expandedClient); }}
                >
                  <Handshake className="h-4 w-4" />
                  Negociar
                </Button>
                <Button
                  variant="outline"
                  size="icon"
                  onClick={() => { setExpandedClient(null); onHistory(expandedClient); }}
                  title="Histórico"
                >
                  <History className="h-4 w-4" />
                </Button>
                <Button
                  variant="outline"
                  size="icon"
                  onClick={() => { setExpandedClient(null); onContracts(expandedClient); }}
                  title="Contratos"
                >
                  <FileText className="h-4 w-4" />
                </Button>
                {canEdit && (
                  <Button
                    variant="outline"
                    size="icon"
                    onClick={() => { setExpandedClient(null); onEdit(expandedClient); }}
                    title="Editar"
                  >
                    <Pencil className="h-4 w-4" />
                  </Button>
                )}
                {canDelete && (
                  <Button
                    variant="outline"
                    size="icon"
                    className="text-destructive hover:text-destructive"
                    onClick={() => { setExpandedClient(null); onDelete(expandedClient.id); }}
                    title="Excluir"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                )}
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
