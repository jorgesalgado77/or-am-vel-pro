/* eslint-disable */
import { useState, useEffect, useMemo, useCallback } from "react";
import { DragDropContext, Droppable, type DropResult } from "@hello-pangea/dnd";
import { ScrollableContainer } from "@/components/ui/scrollable-container";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { ArrowRight, UserPlus, CalendarIcon, FileText, Calculator } from "lucide-react";
import { supabase } from "@/lib/supabaseClient";
import { formatCurrency } from "@/lib/financing";
import { useCompanySettings } from "@/hooks/useCompanySettings";
import { useUsuarios } from "@/hooks/useUsuarios";
import { useIndicadores } from "@/hooks/useIndicadores";
import { useCurrentUser } from "@/hooks/useCurrentUser";
import { format, endOfDay, startOfDay, startOfMonth, subMonths, subDays, isAfter, isBefore } from "date-fns";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { KANBAN_COLUMNS, type Client, type LastSimInfo, type ClientsKanbanProps } from "./kanban/kanbanTypes";
import { KanbanCard } from "./kanban/KanbanCard";
import { KanbanClientDialog } from "./kanban/KanbanClientDialog";
import { KanbanFilters } from "./kanban/KanbanFilters";

export function ClientsKanban({
  clients: externalClients, loading, onEdit, onDelete, onAdd, onSimulate, onHistory, onContracts,
}: ClientsKanbanProps) {
  const [localClients, setLocalClients] = useState<Client[]>(externalClients);
  useEffect(() => { setLocalClients(externalClients); }, [externalClients]);

  const [search, setSearch] = useState("");
  const [filterProjetista, setFilterProjetista] = useState("");
  const [filterIndicador, setFilterIndicador] = useState("");
  const [filterTemperature, setFilterTemperature] = useState("");
  const [filterTipoCliente, setFilterTipoCliente] = useState("");
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

  // Fetch last simulations
  useEffect(() => {
    if (localClients.length === 0) return;
    const fetchLastSims = async () => {
      const { data } = await supabase
        .from("simulations")
        .select("client_id, valor_final, valor_tela, desconto1, desconto2, desconto3, created_at")
        .order("created_at", { ascending: false });
      if (!data) return;
      const map: Record<string, LastSimInfo> = {};
      const counts: Record<string, number> = {};
      data.forEach((s) => {
        counts[s.client_id] = (counts[s.client_id] || 0) + 1;
        if (!map[s.client_id]) {
          const vt = Number(s.valor_tela) || 0;
          const d1 = Number(s.desconto1) || 0;
          const d2 = Number(s.desconto2) || 0;
          const d3 = Number(s.desconto3) || 0;
          const after1 = vt * (1 - d1 / 100);
          const after2 = after1 * (1 - d2 / 100);
          const valorComDesconto = after2 * (1 - d3 / 100);
          map[s.client_id] = {
            valor_final: Number(s.valor_final) || 0,
            valor_com_desconto: valorComDesconto,
            created_at: s.created_at,
            sim_count: 0,
          };
        }
      });
      Object.keys(map).forEach((id) => { map[id].sim_count = counts[id] || 0; });
      setLastSims(map);
    };
    fetchLastSims();
  }, [localClients]);

  // Fetch follow-up statuses
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

  // Date filter computation
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

  // Filtered clients
  const filtered = useMemo(() => {
    let baseClients = localClients;

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
        const userName = currentUser.nome_completo || currentUser.apelido || "";
        if (userName) {
          baseClients = baseClients.filter(c => c.vendedor?.toLowerCase() === userName.toLowerCase());
        }
      }
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
      if (filterTipoCliente) {
        const isManual = !(c as any).origem_lead || (c as any).origem_lead === "manual";
        if (filterTipoCliente === "recente" && !isManual) return false;
        if (filterTipoCliente === "lead" && isManual) return false;
      }
      const { start, end } = effectiveDates;
      if (start || end) {
        const clientDate = new Date(c.created_at);
        if (start && isBefore(clientDate, startOfDay(start))) return false;
        if (end && isAfter(clientDate, endOfDay(end))) return false;
      }
      return true;
    });
  }, [localClients, search, filterProjetista, filterIndicador, filterTemperature, filterTipoCliente, effectiveDates, currentUser, cargoNome]);

  // Column data
  const columnData = useMemo(() => {
    const map: Record<string, Client[]> = {};
    KANBAN_COLUMNS.forEach(col => { map[col.id] = []; });
    filtered.forEach(client => {
      let status = (client as any).status || "novo";
      if (status === "novo" && client.vendedor) status = "em_negociacao";
      if (map[status]) map[status].push(client);
      else map["novo"].push(client);
    });
    return map;
  }, [filtered]);

  // Drag and drop handler
  const handleDragEnd = useCallback(async (result: DropResult) => {
    const { draggableId, destination } = result;
    if (!destination) return;
    const newStatus = destination.droppableId;
    const client = localClients.find(c => c.id === draggableId);
    if (!client || (client as any).status === newStatus) return;

    const oldStatus = (client as any).status;
    setLocalClients(prev => prev.map(c => c.id === draggableId ? { ...c, status: newStatus } as any : c));

    const { error } = await supabase.from("clients").update({ status: newStatus } as any).eq("id", draggableId);
    if (error) {
      setLocalClients(prev => prev.map(c => c.id === draggableId ? { ...c, status: oldStatus } as any : c));
      toast.error("Erro ao mover cliente");
    } else {
      const colLabel = KANBAN_COLUMNS.find(c => c.id === newStatus)?.label;
      toast.success(`${client.nome} movido para "${colLabel}"`);
    }
  }, [localClients]);

  const hasActiveFilters = filterProjetista || filterIndicador || filterTemperature || filterTipoCliente || periodFilter !== "mes_atual";

  const clearFilters = () => {
    setFilterProjetista(""); setFilterIndicador(""); setFilterTemperature("");
    setFilterTipoCliente(""); setPeriodFilter("mes_atual");
    setDateStart(undefined); setDateEnd(undefined); setSearch("");
  };

  const handleClientUpdate = useCallback((updatedClient: Client, shouldMove: boolean) => {
    setLocalClients(prev => prev.map(c => c.id === updatedClient.id ? updatedClient : c));
    setExpandedClient(updatedClient);
  }, []);

  return (
    <div className="flex flex-col h-full">
      <KanbanFilters
        search={search} setSearch={setSearch}
        showFilters={showFilters} setShowFilters={setShowFilters}
        hasActiveFilters={!!hasActiveFilters}
        filterProjetista={filterProjetista} setFilterProjetista={setFilterProjetista}
        filterIndicador={filterIndicador} setFilterIndicador={setFilterIndicador}
        filterTemperature={filterTemperature} setFilterTemperature={setFilterTemperature}
        filterTipoCliente={filterTipoCliente} setFilterTipoCliente={setFilterTipoCliente}
        periodFilter={periodFilter} setPeriodFilter={setPeriodFilter}
        dateStart={dateStart} setDateStart={setDateStart}
        dateEnd={dateEnd} setDateEnd={setDateEnd}
        projetistas={projetistas} indicadores={indicadores}
        filteredCount={filtered.length}
        onClear={clearFilters} onAdd={onAdd}
      />

      {/* Liberador month selector */}
      {cargoNome.includes("liberador") && (
        <div className="flex flex-col gap-3 mb-3 p-4 bg-muted/30 rounded-lg border border-border">
          <div className="flex items-center gap-3 flex-wrap">
            <CalendarIcon className="h-4 w-4 text-primary" />
            <Label className="text-sm font-medium whitespace-nowrap">Mês de referência:</Label>
            <Input type="month" value={liberadorMonth} onChange={(e) => setLiberadorMonth(e.target.value)} className="max-w-[200px]" />
            <span className="text-xs text-muted-foreground">Contratos fechados no período selecionado</span>
          </div>
          {(() => {
            const totalContratos = filtered.length;
            const valorAcumulado = filtered.reduce((sum, c) => sum + (lastSims[c.id]?.valor_final || 0), 0);
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
                  <div className="flex flex-col gap-1 mb-2 px-1">
                    <div className="flex items-center gap-2">
                      <span className="text-base">{col.icon}</span>
                      <span className="text-sm font-semibold text-foreground">{col.label}</span>
                      <Badge variant="outline" className="ml-auto text-[10px] h-5 px-1.5">
                        {columnData[col.id]?.length || 0}
                      </Badge>
                    </div>
                    {col.id === "novo" && (columnData["novo"]?.length || 0) > 0 && (
                      <div className="flex items-center gap-1.5 pl-7">
                        {(() => {
                          const novos = columnData["novo"] || [];
                          const recentes = novos.filter(c => !(c as any).origem_lead || (c as any).origem_lead === "manual").length;
                          const leads = novos.length - recentes;
                          return (
                            <>
                              <Badge variant="outline" className="text-[9px] h-4 px-1.5 border-emerald-500/30 text-emerald-600 gap-0.5">
                                <UserPlus className="h-2.5 w-2.5" />{recentes}
                              </Badge>
                              <Badge variant="outline" className="text-[9px] h-4 px-1.5 border-primary/30 text-primary gap-0.5">
                                <ArrowRight className="h-2.5 w-2.5" />{leads}
                              </Badge>
                            </>
                          );
                        })()}
                      </div>
                    )}
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
                          {(columnData[col.id] || []).map((client, index) => (
                            <KanbanCard
                              key={client.id}
                              client={client}
                              index={index}
                              sim={lastSims[client.id]}
                              budgetValidityDays={settings.budget_validity_days}
                              cargoNome={cargoNome}
                              followUpStatus={followUpStatus[client.id]}
                              onClick={setExpandedClient}
                            />
                          ))}
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

      {/* Client detail dialog */}
      <KanbanClientDialog
        client={expandedClient}
        onClose={() => setExpandedClient(null)}
        lastSim={expandedClient ? lastSims[expandedClient.id] : undefined}
        budgetValidityDays={settings.budget_validity_days}
        cargoNome={cargoNome}
        canEdit={canEdit}
        canDelete={canDelete}
        indicadorMap={indicadorMap}
        usuarios={usuarios}
        onEdit={onEdit}
        onDelete={onDelete}
        onSimulate={onSimulate}
        onHistory={onHistory}
        onContracts={onContracts}
        onClientUpdate={handleClientUpdate}
      />
    </div>
  );
}
