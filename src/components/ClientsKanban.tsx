import React, { useState, useEffect, useMemo, useCallback } from "react";
import { DragDropContext, Droppable, type DropResult } from "@hello-pangea/dnd";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { ArrowRight, UserPlus, CalendarIcon, FileText, Calculator, ChevronRight } from "lucide-react";
import { generateOrcamentoNumber, formatOrcamentoFromSeq, parseOrcamentoInitial } from "@/services/financialService";
import { addDays, isPast } from "date-fns";
import { supabase } from "@/lib/supabaseClient";
import { getTenantId } from "@/lib/tenantState";
import { playNotificationSound } from "@/lib/notificationSound";
import { formatCurrency } from "@/lib/financing";
import { useCompanySettings } from "@/hooks/useCompanySettings";
import { useUsuarios } from "@/hooks/useUsuarios";
import { useIndicadores } from "@/hooks/useIndicadores";
import { useCurrentUser } from "@/hooks/useCurrentUser";
import { format, endOfDay, startOfDay, startOfMonth, subMonths, subDays, isAfter, isBefore } from "date-fns";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { KANBAN_COLUMNS, KANBAN_ALL_COLUMNS, KANBAN_COLUMNS_COMERCIAL, KANBAN_COLUMNS_OPERACIONAL, type Client, type LastSimInfo, type ClientsKanbanProps } from "./kanban/kanbanTypes";
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
  const [contractClientIds, setContractClientIds] = useState<Set<string>>(new Set());
  const [measurementStatus, setMeasurementStatus] = useState<Record<string, { status: string; assigned_to: string | null }>>({});
  const [comercialExpanded, setComercialExpanded] = useState(true);
  const [operacionalExpanded, setOperacionalExpanded] = useState(true);

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

  // Auto-move: expired clients without updates in 2+ days → perdidos
  useEffect(() => {
    const tenantId = getTenantId();
    if (!tenantId || localClients.length === 0) return;

    const twoDaysAgo = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000);
    const staleExpired = localClients.filter(c => {
      const status = (c as any).status;
      if (status !== "expirado") return false;
      const updatedAt = new Date(c.updated_at);
      return updatedAt < twoDaysAgo;
    });

    if (staleExpired.length === 0) return;

    const moveToLost = async () => {
      const ids = staleExpired.map(c => c.id);
      const { error } = await supabase
        .from("clients")
        .update({ status: "perdido" } as any)
        .in("id", ids);
      if (!error) {
        setLocalClients(prev =>
          prev.map(c => ids.includes(c.id) ? { ...c, status: "perdido" } as any : c)
        );
        if (ids.length > 0) {
          console.log(`[Kanban] Auto-moved ${ids.length} expired client(s) to 'perdido' (no update in 2+ days)`);
        }
      }
    };
    moveToLost();
  }, [localClients.length]);

  // Fetch client_contracts to detect clients with actual issued contracts
  // and auto-sync their status to "fechado" in the database
  useEffect(() => {
    const tenantId = getTenantId();
    if (!tenantId || localClients.length === 0) return;
    const fetchContractClients = async () => {
      const { data } = await supabase
        .from("client_contracts")
        .select("client_id")
        .eq("tenant_id", tenantId);
      if (data) {
        const ids = new Set((data as any[]).map((d: any) => d.client_id));
        setContractClientIds(ids);

        // Auto-sync: update status to "fechado" for clients with contracts that aren't already
        const needsUpdate = localClients.filter(
          c => ids.has(c.id) && (c as any).status !== "fechado"
        );
        if (needsUpdate.length > 0) {
          const updateIds = needsUpdate.map(c => c.id);
          await supabase
            .from("clients")
            .update({ status: "fechado" } as any)
            .in("id", updateIds);
          // Update local state immediately
          setLocalClients(prev =>
            prev.map(c => updateIds.includes(c.id) ? { ...c, status: "fechado" } as any : c)
          );
        }
      }
    };
    fetchContractClients();
  }, [localClients.length]);

  // Fetch measurement_requests to auto-move Fechado → Em Medição, Em Medição → Em Liberação
  useEffect(() => {
    const tenantId = getTenantId();
    if (!tenantId || localClients.length === 0) return;

    const fetchMeasurements = async () => {
      const { data } = await supabase
        .from("measurement_requests" as any)
        .select("client_id, status, assigned_to")
        .eq("tenant_id", tenantId);

      if (!data) return;

      const statusMap: Record<string, { status: string; assigned_to: string | null }> = {};
      (data as any[]).forEach((r: any) => {
        statusMap[r.client_id] = { status: r.status || "pending", assigned_to: r.assigned_to || null };
      });
      setMeasurementStatus(statusMap);

      // Auto-move clients with measurement requests
      const needsMedicao = localClients.filter(c => {
        const st = (c as any).status;
        return st === "fechado" && statusMap[c.id];
      });

      const needsLiberacao = localClients.filter(c => {
        const st = (c as any).status;
        const mr = statusMap[c.id];
        return st === "em_medicao" && mr?.assigned_to;
      });

      const updates: Array<{ id: string; status: string }> = [];
      needsMedicao.forEach(c => updates.push({ id: c.id, status: "em_medicao" }));
      needsLiberacao.forEach(c => updates.push({ id: c.id, status: "em_liberado" }));

      if (updates.length > 0) {
        await Promise.all(
          updates.map(u =>
            supabase.from("clients").update({ status: u.status } as any).eq("id", u.id)
          )
        );
        setLocalClients(prev =>
          prev.map(c => {
            const u = updates.find(x => x.id === c.id);
            return u ? { ...c, status: u.status } as any : c;
          })
        );
      }
    };

    fetchMeasurements();

    // Realtime: listen for measurement_requests changes
    const channel = supabase
      .channel("kanban-measurement-sync")
      .on("postgres_changes" as any, {
        event: "*",
        schema: "public",
        table: "measurement_requests",
        filter: `tenant_id=eq.${tenantId}`,
      }, () => {
        fetchMeasurements();
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [localClients.length]);
  // One-time fix: reassign ALL orçamento numbers sequentially by creation order
  const fixedRef = React.useRef(false);
  useEffect(() => {
    const tenantId = getTenantId();
    if (!tenantId || localClients.length === 0 || fixedRef.current) return;
    if (!cargoNome.includes("administrador")) return; // only admin triggers fix

    // Check if any duplicates or invalid numbers exist
    const orcSet = new Set<string>();
    let hasProblem = false;
    for (const c of localClients) {
      const orc = (c as any).numero_orcamento;
      if (!orc || /^(WA-?|55|\+?\d{10,})/i.test(orc) || orcSet.has(orc)) {
        hasProblem = true;
        break;
      }
      orcSet.add(orc);
    }
    if (!hasProblem) return;
    fixedRef.current = true;

    const reassignAll = async () => {
      // Get store code and initial seq
      const { data: settings } = await (supabase as any)
        .from("company_settings")
        .select("codigo_loja, orcamento_numero_inicial")
        .eq("tenant_id", tenantId)
        .maybeSingle();

      let storeCode = "000000";
      if (settings?.codigo_loja) {
        storeCode = String(settings.codigo_loja).replace(/\D/g, "").padStart(6, "0").slice(0, 6);
      }
      const initialSeq = parseOrcamentoInitial(settings?.orcamento_numero_inicial);

      // Sort clients by creation date (oldest first) to assign in order
      const sorted = [...localClients].sort(
        (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
      );

      let currentSeq = initialSeq;
      const updates: Array<{ id: string; numero_orcamento: string; numero_orcamento_seq: number }> = [];

      for (const client of sorted) {
        const formatted = formatOrcamentoFromSeq(storeCode, currentSeq);
        updates.push({ id: client.id, numero_orcamento: formatted, numero_orcamento_seq: currentSeq });
        currentSeq++;
      }

      // Apply updates
      for (const u of updates) {
        await supabase.from("clients").update({
          numero_orcamento: u.numero_orcamento,
          numero_orcamento_seq: u.numero_orcamento_seq,
        } as any).eq("id", u.id);
      }

      // Update local state
      setLocalClients(prev => prev.map(c => {
        const u = updates.find(x => x.id === c.id);
        return u ? { ...c, numero_orcamento: u.numero_orcamento, numero_orcamento_seq: u.numero_orcamento_seq } as any : c;
      }));

      console.log(`[Kanban] Reassigned ${updates.length} orçamento numbers starting from seq ${initialSeq}`);
    };
    reassignAll();
  }, [localClients.length, cargoNome]);

  // Realtime: listen for new leads sent to the current user
  useEffect(() => {
    const userName = currentUser?.nome_completo;
    if (!userName) return;

    const channel = supabase
      .channel("kanban-lead-notifications")
      .on(
        "postgres_changes" as any,
        { event: "INSERT", schema: "public", table: "tracking_messages" },
        (payload: any) => {
          const msg = payload.new;
          if (
            msg?.destinatario === userName &&
            msg?.tipo === "sistema" &&
            typeof msg?.conteudo === "string" &&
            msg.conteudo.includes("enviado para seu atendimento")
          ) {
            playNotificationSound();
            toast.success("🚀 Novo lead recebido!", {
              description: msg.conteudo.replace(/[🚀✅⚠️]/g, "").trim(),
              duration: 8000,
            });
          }
        }
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [currentUser?.nome_completo]);

  // Realtime: notify admin/manager on new clients and status changes
  useEffect(() => {
    const tenantId = getTenantId();
    if (!tenantId) return;
    const isAdminOrManager = cargoNome.includes("administrador") || cargoNome.includes("gerente");
    if (!isAdminOrManager) return;

    const channel = supabase
      .channel("kanban-admin-notifications")
      .on("postgres_changes" as any, {
        event: "INSERT",
        schema: "public",
        table: "clients",
        filter: `tenant_id=eq.${tenantId}`,
      }, (payload: any) => {
        const c = payload.new;
        playNotificationSound();
        toast.info(`🆕 Novo cliente: ${c.nome || "Sem nome"}`, {
          description: `Origem: ${c.origem_lead || "manual"} — Vendedor: ${c.vendedor || "não atribuído"}`,
          duration: 8000,
        });
      })
      .on("postgres_changes" as any, {
        event: "UPDATE",
        schema: "public",
        table: "clients",
        filter: `tenant_id=eq.${tenantId}`,
      }, (payload: any) => {
        const oldStatus = (payload.old as any)?.status;
        const newStatus = (payload.new as any)?.status;
        const nome = (payload.new as any)?.nome || "Cliente";
        if (oldStatus && newStatus && oldStatus !== newStatus) {
          const colLabel = KANBAN_ALL_COLUMNS.find(c => c.id === newStatus)?.label || newStatus;
          toast.info(`📋 ${nome} movido para "${colLabel}"`, { duration: 5000 });
        }
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [cargoNome]);

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

  const isAdmin = cargoNome.includes("administrador");
  const activeColumns = isAdmin ? KANBAN_ALL_COLUMNS : KANBAN_COLUMNS;

  // Column data — sorted by created_at descending (most recent first)
  const columnData = useMemo(() => {
    const map: Record<string, Client[]> = {};
    activeColumns.forEach(col => { map[col.id] = []; });
    filtered.forEach(client => {
      let status = (client as any).status || "novo";
      // Legacy: map proposta_enviada to em_negociacao
      if (status === "proposta_enviada") status = "em_negociacao";
      if (status === "novo" && client.vendedor) status = "em_negociacao";
      
      // Auto-move clients with closed contracts to "fechado"
      if (contractClientIds.has(client.id)) {
        // Only auto-set to fechado if not already in an operational column
        const operationalIds = KANBAN_COLUMNS_OPERACIONAL.map(c => c.id);
        if (!operationalIds.includes(status)) {
          status = "fechado";
        }
      }

      // Auto-move: Fechado with measurement → Em Medição; Em Medição with assigned → Em Liberação
      const mr = measurementStatus[client.id];
      if (mr) {
        if (status === "fechado") {
          status = "em_medicao";
        } else if (status === "em_medicao" && mr.assigned_to) {
          status = "em_liberado";
        }
      }
      
      // Auto-expire: if client has a simulation and it's past validity, move to expirado
      const sim = lastSims[client.id];
      if (sim && status !== "fechado" && status !== "perdido" && status !== "expirado" && !KANBAN_COLUMNS_OPERACIONAL.some(c => c.id === status)) {
        const isExpired = isPast(addDays(new Date(sim.created_at), settings.budget_validity_days));
        if (isExpired) status = "expirado";
      }
      
      if (map[status]) map[status].push(client);
      else map["novo"].push(client);
    });
    // Sort each column: most recent first
    Object.keys(map).forEach(key => {
      map[key].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
    });
    return map;
  }, [filtered, lastSims, settings.budget_validity_days, contractClientIds, measurementStatus, activeColumns]);

  // Drag and drop handler
  const handleDragEnd = useCallback(async (result: DropResult) => {
    const { draggableId, destination, source } = result;
    if (!destination) return;
    const newStatus = destination.droppableId;
    // If dropped in same column, no-op
    if (source.droppableId === newStatus) return;
    
    const client = localClients.find(c => c.id === draggableId);
    if (!client) return;

    const oldStatus = (client as any).status || "novo";
    setLocalClients(prev => prev.map(c => c.id === draggableId ? { ...c, status: newStatus } as any : c));

    const { error } = await supabase.from("clients").update({ status: newStatus } as any).eq("id", draggableId);
    if (error) {
      setLocalClients(prev => prev.map(c => c.id === draggableId ? { ...c, status: oldStatus } as any : c));
      toast.error("Erro ao mover cliente");
    } else {
      const colLabel = KANBAN_ALL_COLUMNS.find(c => c.id === newStatus)?.label;
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

  const renderColumn = (col: typeof KANBAN_COLUMNS_COMERCIAL[0]) => (
    <div key={col.id} className="flex flex-col min-w-[170px] w-[170px] sm:min-w-[200px] sm:w-[200px] md:min-w-[220px] md:w-[220px] lg:min-w-[240px] lg:w-[240px] shrink-0">
      <div className="flex flex-col gap-1 mb-2 px-1">
        <div className="flex items-center gap-1.5 sm:gap-2">
          <span className="text-sm sm:text-base">{col.icon}</span>
          <span className="text-xs sm:text-sm font-semibold text-foreground truncate">{col.label}</span>
          <Badge variant="outline" className="ml-auto text-[9px] sm:text-[10px] h-4 sm:h-5 px-1 sm:px-1.5">
            {columnData[col.id]?.length || 0}
          </Badge>
        </div>
        {col.id === "novo" && (columnData["novo"]?.length || 0) > 0 && (
          <div className="flex items-center gap-1.5 pl-6 sm:pl-7">
            {(() => {
              const novos = columnData["novo"] || [];
              const recentes = novos.filter(c => !(c as any).origem_lead || (c as any).origem_lead === "manual").length;
              const leads = novos.length - recentes;
              return (
                <>
                  <Badge variant="outline" className="text-[8px] sm:text-[9px] h-3.5 sm:h-4 px-1 sm:px-1.5 border-emerald-500/30 text-emerald-600 gap-0.5">
                    <UserPlus className="h-2 w-2 sm:h-2.5 sm:w-2.5" />{recentes}
                  </Badge>
                  <Badge variant="outline" className="text-[8px] sm:text-[9px] h-3.5 sm:h-4 px-1 sm:px-1.5 border-primary/30 text-primary gap-0.5">
                    <ArrowRight className="h-2 w-2 sm:h-2.5 sm:w-2.5" />{leads}
                  </Badge>
                </>
              );
            })()}
          </div>
        )}
      </div>
      <div
        className="rounded-lg border border-border/60 bg-muted/20 p-1 sm:p-1.5 flex-1 min-h-[150px] sm:min-h-[200px]"
        style={{ borderTopColor: col.color, borderTopWidth: 3 }}
      >
        <Droppable droppableId={col.id}>
          {(provided, snapshot) => (
            <div
              ref={provided.innerRef}
              {...provided.droppableProps}
              className={cn(
                "space-y-1.5 sm:space-y-2 min-h-[130px] sm:min-h-[180px] rounded-md transition-colors duration-200 p-0.5 sm:p-1",
                snapshot.isDraggingOver && "bg-primary/5 ring-2 ring-primary/20"
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
                  tenantId={getTenantId() || ""}
                  followUpStatus={followUpStatus[client.id]}
                  assignedTechnician={measurementStatus[client.id]?.assigned_to || null}
                  onClick={setExpandedClient}
                  onQuickDelete={canDelete ? (c) => {
                    if (window.confirm(`Excluir o lead "${c.nome}"? Esta ação não pode ser desfeita.`)) {
                      onDelete(c.id);
                    }
                  } : undefined}
                />
              ))}
              {provided.placeholder}
            </div>
          )}
        </Droppable>
      </div>
    </div>
  );

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
            const valorAcumulado = filtered.reduce((sum, c) => sum + (lastSims[c.id]?.valor_com_desconto || lastSims[c.id]?.valor_final || 0), 0);
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
                {/* Comercial section */}
                {isAdmin && (
                  <button
                    onClick={() => setComercialExpanded(prev => !prev)}
                    className="flex items-center self-start gap-1 cursor-pointer hover:bg-muted/50 rounded-md px-1 py-2 transition-colors group"
                  >
                    <ChevronRight className={cn("h-3.5 w-3.5 text-primary/70 transition-transform duration-200", comercialExpanded && "rotate-90")} />
                    <span className="text-[10px] font-bold text-primary/70 uppercase tracking-wider [writing-mode:vertical-lr] rotate-180">Comercial</span>
                  </button>
                )}
                {(!isAdmin || comercialExpanded) && KANBAN_COLUMNS_COMERCIAL.map(col => renderColumn(col))}

                {/* Operacional section — admin only */}
                {isAdmin && (
                  <>
                    <button
                      onClick={() => setOperacionalExpanded(prev => !prev)}
                      className="flex items-center self-start gap-1 cursor-pointer hover:bg-muted/50 rounded-md px-1 py-2 transition-colors group border-l border-border/60 ml-1"
                    >
                      <ChevronRight className={cn("h-3.5 w-3.5 text-accent-foreground/70 transition-transform duration-200", operacionalExpanded && "rotate-90")} />
                      <span className="text-[10px] font-bold text-accent-foreground/70 uppercase tracking-wider [writing-mode:vertical-lr] rotate-180">Operacional</span>
                    </button>
                    {operacionalExpanded && KANBAN_COLUMNS_OPERACIONAL.map(col => renderColumn(col))}
                  </>
                )}
              </div>
            </div>
          </div>
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
