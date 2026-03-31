import React, { useState, useMemo, useCallback, lazy, Suspense } from "react";
import { DragDropContext, type DropResult } from "@hello-pangea/dnd";
import { ChevronRight } from "lucide-react";
import { addDays, isPast, format, endOfDay, startOfDay, startOfMonth, subMonths, subDays, isAfter, isBefore } from "date-fns";
import { supabase } from "@/lib/supabaseClient";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import {
  KANBAN_COLUMNS, KANBAN_ALL_COLUMNS, KANBAN_COLUMNS_COMERCIAL, KANBAN_COLUMNS_OPERACIONAL, KANBAN_COLUMNS_TECNICO,
  type Client, type ClientsKanbanProps,
} from "./kanban/kanbanTypes";
import { KanbanFilters } from "./kanban/KanbanFilters";
import { KanbanColumn } from "./kanban/KanbanColumn";
const KanbanClientDialog = lazy(() => import("./kanban/KanbanClientDialog").then(m => ({ default: m.KanbanClientDialog })));
import { KanbanLiberadorPanel } from "./kanban/KanbanLiberadorPanel";
import { KanbanSkeleton } from "./kanban/KanbanSkeleton";
import { MeasurementScheduleDialog, type MeasurementScheduleData } from "./kanban/MeasurementScheduleDialog";
import { useKanbanData } from "@/hooks/useKanbanData";

export function ClientsKanban({
  clients: externalClients, loading, onEdit, onDelete, onAdd, onSimulate, onHistory, onContracts,
}: ClientsKanbanProps) {
  const {
    localClients, setLocalClients,
    lastSims, followUpStatus, contractClientIds, measurementStatus, setMeasurementStatus, scheduledMeasurements,
    expandedClient, setExpandedClient,
    settings, projetistas, usuarios, indicadores, currentUser,
    tenantId, cargoNome, handleClientUpdate,
  } = useKanbanData(externalClients);

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
  const [comercialExpanded, setComercialExpanded] = useState(true);
  const [operacionalExpanded, setOperacionalExpanded] = useState(true);
  const [pendingSchedule, setPendingSchedule] = useState<{ clientId: string; clientName: string } | null>(null);
  const [savingCardId, setSavingCardId] = useState<string | null>(null);

  const canEdit = !currentUser || cargoNome === "administrador" || cargoNome === "gerente";
  const canDelete = !currentUser || cargoNome === "administrador";
  const isAdmin = cargoNome.includes("administrador");
  const isGerenteTecnico = cargoNome.includes("gerente") && (cargoNome.includes("tecnico") || cargoNome.includes("técnico"));
  const isBasicTechnical = !isGerenteTecnico && (cargoNome.includes("tecnico") || cargoNome.includes("técnico") || cargoNome.includes("liberador") || cargoNome.includes("conferente"));
  const isTechnicalRole = isGerenteTecnico || isBasicTechnical;

  const indicadorMap = useMemo(() => {
    const map: Record<string, { nome: string; comissao: number }> = {};
    indicadores.forEach(i => { map[i.id] = { nome: i.nome, comissao: i.comissao_percentual }; });
    return map;
  }, [indicadores]);

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
      const isAdm = cargoNome.includes("administrador");
      const isGerente = cargoNome.includes("gerente");
      const isLiberador = cargoNome.includes("liberador");
      const isTecnico = cargoNome.includes("tecnico") || cargoNome.includes("técnico");
      const isConferente = cargoNome.includes("conferente");
      
      const isGerTecnico = isGerente && (cargoNome.includes("tecnico") || cargoNome.includes("técnico"));
      
      if (isGerTecnico) {
        // Gerente Técnico: see ALL clients that have measurement requests (any)
        baseClients = baseClients.filter(c => measurementStatus[c.id]);
      } else if (isLiberador || isTecnico || isConferente) {
        // Basic technical roles: show only clients with measurement requests assigned to them
        const userName = (currentUser.nome_completo || "").toLowerCase().trim();
        const userId = currentUser.id;
        baseClients = baseClients.filter(c => {
          const mr = measurementStatus[c.id];
          if (!mr) return false;
          const assignedTo = (mr.assigned_to || "").toLowerCase().trim();
          return assignedTo === userName || assignedTo === userId;
        });
      } else if (!isAdm && !isGerente) {
        const userName = currentUser.nome_completo || currentUser.apelido || "";
        if (userName) baseClients = baseClients.filter(c => c.vendedor?.toLowerCase() === userName.toLowerCase());
      }
    }
    return baseClients.filter((c) => {
      const q = search.toLowerCase().trim();
      if (q) {
        const matchesText =
          c.nome.toLowerCase().includes(q) || (c.cpf || "").toLowerCase().includes(q) ||
          (c.vendedor || "").toLowerCase().includes(q) || (c.email || "").toLowerCase().includes(q) ||
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
  }, [localClients, search, filterProjetista, filterIndicador, filterTemperature, filterTipoCliente, effectiveDates, currentUser, cargoNome, liberadorMonth, measurementStatus]);

  const isGerente = cargoNome.includes("gerente") && !isGerenteTecnico;
  const activeColumns = isTechnicalRole ? KANBAN_COLUMNS_TECNICO : (isAdmin || isGerente) ? KANBAN_ALL_COLUMNS : KANBAN_COLUMNS;

  const resolveTechnicalColumn = useCallback((measurementRequestStatus?: string | null) => {
    const normalized = String(measurementRequestStatus || "novo")
      .toLowerCase()
      .trim()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/\s+/g, "_");

    switch (normalized) {
      case "em_andamento":
      case "em_medicao":
        return "em_medicao";
      case "em_liberacao":
      case "liberado":
      case "em_liberado":
        return "em_liberado";
      case "negative":
      case "negativo":
      case "negativos":
        return "negativos";
      case "enviado_compras":
        return "enviado_compras";
      default:
        return "nova_solicitacao";
    }
  }, []);

  // Column data
  const columnData = useMemo(() => {
    const map: Record<string, Client[]> = {};
    activeColumns.forEach(col => { map[col.id] = []; });
    
    filtered.forEach(client => {
      let status = String((client as any).status || "novo").toLowerCase().trim().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/\s+/g, "_");
      
      if (isTechnicalRole) {
        const mr = measurementStatus[client.id];
        if (mr) {
          status = resolveTechnicalColumn(mr.status);
        } else {
          status = "nova_solicitacao";
        }
      } else {
        // Standard flow for non-technical roles
        if (status === "proposta_enviada") status = "em_negociacao";
        if (status === "novo" && client.vendedor) status = "em_negociacao";
        if (contractClientIds.has(client.id)) {
          const operationalIds = KANBAN_COLUMNS_OPERACIONAL.map(c => c.id);
          if (!operationalIds.includes(status)) status = "fechado";
        }
        const mr = measurementStatus[client.id];
        if (mr) {
          if (status === "fechado") status = "em_medicao";
          else if (status === "em_medicao" && mr.assigned_to) status = "em_liberado";
        }
        const sim = lastSims[client.id];
        if (sim && status !== "fechado" && status !== "perdido" && status !== "expirado" && !KANBAN_COLUMNS_OPERACIONAL.some(c => c.id === status)) {
          if (isPast(addDays(new Date(sim.created_at), settings.budget_validity_days))) status = "expirado";
        }
      }
      
      const resolved = {
        ...client,
        status,
        contrato_fechado_visual: contractClientIds.has(client.id) || !!(client as any).data_contrato,
      } as Client;
      if (map[status]) map[status].push(resolved);
      else {
        const fallbackCol = isTechnicalRole ? "nova_solicitacao" : "novo";
        if (map[fallbackCol]) map[fallbackCol].push({ ...resolved, status: fallbackCol } as Client);
      }
    });
    Object.keys(map).forEach(key => {
      map[key].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
    });
    return map;
  }, [filtered, lastSims, settings.budget_validity_days, contractClientIds, measurementStatus, activeColumns, isTechnicalRole, resolveTechnicalColumn]);

  // Map technical column IDs to measurement_requests status values
  const technicalStatusMap: Record<string, string> = {
    nova_solicitacao: "novo",
    em_medicao: "em_andamento",
    em_liberado: "em_liberacao",
    negativos: "negative",
    enviado_compras: "enviado_compras",
  };

  // Drag and drop
  const handleDragEnd = useCallback(async (result: DropResult) => {
    const { draggableId, destination, source } = result;
    if (!destination || source.droppableId === destination.droppableId) return;
    const newStatus = destination.droppableId;
    const client = localClients.find(c => c.id === draggableId);
    if (!client) return;
    const oldStatus = (client as any).status || "novo";

    setSavingCardId(draggableId);

    if (isTechnicalRole) {
      // Technical roles: update measurement_requests, not clients
      const mrStatus = technicalStatusMap[newStatus] || newStatus;
      const previousMeasurement = measurementStatus[draggableId];
      setLocalClients(prev => prev.map(c => c.id === draggableId ? { ...c, status: newStatus } as any : c));
      setMeasurementStatus(prev => ({
        ...prev,
        [draggableId]: {
          status: mrStatus,
          assigned_to: prev[draggableId]?.assigned_to ?? previousMeasurement?.assigned_to ?? null,
        },
      }));

      const { error } = await supabase
        .from("measurement_requests" as any)
        .update({ status: mrStatus, updated_at: new Date().toISOString() } as any)
        .eq("client_id", draggableId)
        .eq("tenant_id", tenantId);

      if (error) {
        setLocalClients(prev => prev.map(c => c.id === draggableId ? { ...c, status: oldStatus } as any : c));
        setMeasurementStatus(prev => {
          if (!previousMeasurement) {
            const next = { ...prev };
            delete next[draggableId];
            return next;
          }
          return {
            ...prev,
            [draggableId]: previousMeasurement,
          };
        });
        toast.error("Erro ao mover solicitação");
      } else {
        const colLabel = [...KANBAN_COLUMNS_TECNICO, ...KANBAN_ALL_COLUMNS].find(c => c.id === newStatus)?.label || newStatus;
        toast.success(`${client.nome} movido para "${colLabel}"`);
      }
      setSavingCardId(null);
    } else {
      // Standard flow: update clients table
      setLocalClients(prev => prev.map(c => c.id === draggableId ? { ...c, status: newStatus, ...(newStatus === "fechado" ? { data_contrato: new Date().toISOString() } : {}) } as any : c));
      const updatePayload: any = { status: newStatus };
      if (newStatus === "fechado") {
        updatePayload.data_contrato = new Date().toISOString();
      }
      const { error } = await supabase.from("clients").update(updatePayload).eq("id", draggableId);
      if (error) {
        setLocalClients(prev => prev.map(c => c.id === draggableId ? { ...c, status: oldStatus } as any : c));
        toast.error("Erro ao mover cliente");
      } else {
        const colLabel = KANBAN_ALL_COLUMNS.find(c => c.id === newStatus)?.label;
        toast.success(`${client.nome} movido para "${colLabel}"`);
        supabase.from("client_movements" as any).insert({
          tenant_id: tenantId, client_id: draggableId,
          from_column: source.droppableId, to_column: newStatus,
          moved_by: currentUser?.nome_completo || "Sistema",
        }).then(() => {});
      }
      setSavingCardId(null);
    }
  }, [localClients, currentUser, tenantId, setLocalClients, setMeasurementStatus, measurementStatus, isTechnicalRole]);

  // Open scheduling dialog from card action button
  const handleOpenSchedule = useCallback((clientId: string, clientName: string) => {
    setPendingSchedule({ clientId, clientName });
  }, []);

  // Handle measurement scheduling confirmation
  const handleScheduleConfirm = useCallback(async (data: MeasurementScheduleData) => {
    if (!pendingSchedule) return;
    const { clientId, clientName } = pendingSchedule;
    const client = localClients.find(c => c.id === clientId);

    // 1. Save schedule history
    await supabase.from("measurement_schedule_history" as any).insert({
      tenant_id: tenantId,
      client_id: clientId,
      date: data.date,
      time: data.time,
      observations: data.observations || "",
      reason: data.rescheduleReason || null,
      round_trip_km: data.roundTripKm || null,
      created_by: currentUser?.nome_completo || "Sistema",
    } as any).then(() => {});

    // 3. Create task automatically
    const formattedDate = data.date.split("-").reverse().join("/");
    const { error: taskError } = await supabase
      .from("tasks" as any)
      .insert({
        tenant_id: tenantId,
        titulo: `Medição - ${clientName}`,
        descricao: `${data.rescheduleReason ? `[REAGENDAMENTO] ${data.rescheduleReason}\n\n` : ""}Agendamento: ${formattedDate} às ${data.time}\n${data.observations || "Sem observações"}`,
        data_tarefa: data.date,
        horario: data.time,
        tipo: "medicao",
        status: "pendente",
        responsavel_id: currentUser?.id || null,
        responsavel_nome: currentUser?.nome_completo || null,
        criado_por: currentUser?.nome_completo || "Sistema",
      } as any);

    if (taskError) {
      console.error("Erro ao criar tarefa:", taskError);
      toast.warning("Medição movida, mas erro ao criar tarefa automática");
    } else {
      toast.success(`Medição ${data.rescheduleReason ? "reagendada" : "agendada"} para ${formattedDate} às ${data.time} — Tarefa criada!`);
    }

    // 4. Push notification
    try {
      const { sendPushIfEnabled } = await import("@/lib/pushHelper");
      if (currentUser?.id) {
        sendPushIfEnabled(
          "medidas",
          currentUser.id,
          `📐 Medição ${data.rescheduleReason ? "Reagendada" : "Agendada"}`,
          `Cliente: ${clientName} — ${formattedDate} às ${data.time}`,
          "medicao"
        );
      }
    } catch { /* silent */ }

    // 5. WhatsApp notification to client
    try {
      const clientPhone = (client as any)?.telefone1 || (client as any)?.telefone2;
      if (clientPhone) {
        const { sendWhatsAppText } = await import("@/lib/whatsappSender");
        const msg = `📐 *${data.rescheduleReason ? "Reagendamento" : "Agendamento"} de Medição*\n\nOlá! ${data.rescheduleReason ? `Sua medição foi reagendada.\nMotivo: ${data.rescheduleReason}\n\n` : ""}Sua medição foi agendada para:\n📅 *${formattedDate}* às 🕐 *${data.time}*\n${data.observations ? `\n📝 ${data.observations}` : ""}\n\nQualquer dúvida, entre em contato conosco!`;
        sendWhatsAppText(clientPhone, msg).catch(() => {});
      }
    } catch { /* silent */ }

    setPendingSchedule(null);
  }, [pendingSchedule, tenantId, currentUser, setLocalClients, localClients]);

  const handleScheduleCancel = useCallback(() => {
    setPendingSchedule(null);
  }, []);

  const hasActiveFilters = filterProjetista || filterIndicador || filterTemperature || filterTipoCliente || periodFilter !== "mes_atual";

  const clearFilters = () => {
    setFilterProjetista(""); setFilterIndicador(""); setFilterTemperature("");
    setFilterTipoCliente(""); setPeriodFilter("mes_atual");
    setDateStart(undefined); setDateEnd(undefined); setSearch("");
  };

  return (
    <div className="flex flex-col h-full min-w-0">
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

      {cargoNome.includes("liberador") && (
        <KanbanLiberadorPanel
          liberadorMonth={liberadorMonth}
          setLiberadorMonth={setLiberadorMonth}
          filtered={filtered}
          lastSims={lastSims}
        />
      )}

      {loading ? (
        <KanbanSkeleton />
      ) : (
        <DragDropContext onDragEnd={handleDragEnd}>
          <div className="flex-1 min-h-0 min-w-0">
            <div
              className="w-full max-w-full min-w-0 overflow-x-scroll overflow-y-hidden [&::-webkit-scrollbar]:h-3 [&::-webkit-scrollbar-track]:bg-muted/40 [&::-webkit-scrollbar-track]:rounded-full [&::-webkit-scrollbar-thumb]:bg-primary/30 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:hover:bg-primary/50"
              style={{
                WebkitOverflowScrolling: "touch",
                scrollbarWidth: "auto",
                scrollbarColor: "hsl(var(--primary) / 0.3) hsl(var(--muted) / 0.4)",
                transform: "scaleY(-1)",
              }}
            >
              <div className="inline-flex min-w-max gap-2 sm:gap-3 px-1 pb-1" style={{ transform: "scaleY(-1)" }}>
                {isTechnicalRole ? (
                  /* Technical roles see flat columns without sections */
                  KANBAN_COLUMNS_TECNICO.map(col => (
                    <KanbanColumn
                      key={col.id}
                      col={col}
                      clients={columnData[col.id] || []}
                      lastSims={lastSims}
                      budgetValidityDays={settings.budget_validity_days}
                      cargoNome={cargoNome}
                      tenantId={tenantId || ""}
                      followUpStatus={followUpStatus}
                      measurementStatus={measurementStatus}
                      scheduledMeasurements={scheduledMeasurements}
                      savingCardId={savingCardId}
                      canDelete={canDelete}
                      onClientClick={setExpandedClient}
                      onDelete={onDelete}
                      onScheduleMeasurement={handleOpenSchedule}
                    />
                  ))
                ) : (
                  <>
                    {(isAdmin || isGerente) && (
                      <button
                        onClick={() => setComercialExpanded(prev => !prev)}
                        className="flex items-center self-start gap-1 cursor-pointer hover:bg-muted/50 rounded-md px-1 py-2 transition-colors group"
                      >
                        <ChevronRight className={cn("h-3.5 w-3.5 text-primary/70 transition-transform duration-200", comercialExpanded && "rotate-90")} />
                        <span className="text-[10px] font-bold text-primary/70 uppercase tracking-wider [writing-mode:vertical-lr] rotate-180">Comercial</span>
                      </button>
                    )}
                    {(!(isAdmin || isGerente) || comercialExpanded) && KANBAN_COLUMNS_COMERCIAL.map(col => (
                      <KanbanColumn
                        key={col.id}
                        col={col}
                        clients={columnData[col.id] || []}
                        lastSims={lastSims}
                        budgetValidityDays={settings.budget_validity_days}
                        cargoNome={cargoNome}
                        tenantId={tenantId || ""}
                        followUpStatus={followUpStatus}
                        measurementStatus={measurementStatus}
                        scheduledMeasurements={scheduledMeasurements}
                        savingCardId={savingCardId}
                      <>
                        <button
                          onClick={() => setOperacionalExpanded(prev => !prev)}
                          className="flex items-center self-start gap-1 cursor-pointer hover:bg-muted/50 rounded-md px-1 py-2 transition-colors group border-l border-border/60 ml-1"
                        >
                          <ChevronRight className={cn("h-3.5 w-3.5 text-accent-foreground/70 transition-transform duration-200", operacionalExpanded && "rotate-90")} />
                          <span className="text-[10px] font-bold text-accent-foreground/70 uppercase tracking-wider [writing-mode:vertical-lr] rotate-180">Operacional</span>
                        </button>
                        {operacionalExpanded && KANBAN_COLUMNS_OPERACIONAL.map(col => (
                          <KanbanColumn
                            key={col.id}
                            col={col}
                            clients={columnData[col.id] || []}
                            lastSims={lastSims}
                            budgetValidityDays={settings.budget_validity_days}
                            cargoNome={cargoNome}
                            tenantId={tenantId || ""}
                            followUpStatus={followUpStatus}
                            measurementStatus={measurementStatus}
                            scheduledMeasurements={scheduledMeasurements}
                            savingCardId={savingCardId}
                            canDelete={canDelete}
                            onClientClick={setExpandedClient}
                            onDelete={onDelete}
                          />
                        ))}
                      </>
                    )}
                  </>
                )}
              </div>
            </div>
          </div>
        </DragDropContext>
      )}

      {expandedClient && (
        <Suspense fallback={null}>
          <KanbanClientDialog
            client={expandedClient}
            onClose={() => setExpandedClient(null)}
            lastSim={lastSims[expandedClient.id]}
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
        </Suspense>
      )}

      <MeasurementScheduleDialog
        open={!!pendingSchedule}
        clientName={pendingSchedule?.clientName || ""}
        clientId={pendingSchedule?.clientId}
        tenantId={tenantId}
        clientAddress={(() => {
          if (!pendingSchedule) return null;
          const c = localClients.find(cl => cl.id === pendingSchedule.clientId) as any;
          if (!c?.endereco && !c?.cidade) return null;
          return [c.endereco, c.bairro, c.cidade, c.estado || c.uf, c.cep].filter(Boolean).join(", ");
        })()}
        technicianAddress={(() => {
          if (!currentUser) return null;
          const u = currentUser as any;
          if (!u.endereco && !u.cidade) return null;
          return [u.endereco, u.numero, u.bairro, u.cidade, u.uf, u.cep].filter(Boolean).join(", ");
        })()}
        onConfirm={handleScheduleConfirm}
        onCancel={handleScheduleCancel}
      />
    </div>
  );
}
