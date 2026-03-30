import { useState, useEffect, useCallback, useRef } from "react";
import { supabase } from "@/lib/supabaseClient";
import { getTenantId } from "@/lib/tenantState";
import { playNotificationSound } from "@/lib/notificationSound";
import { useCompanySettings } from "@/hooks/useCompanySettings";
import { useUsuarios } from "@/hooks/useUsuarios";
import { useIndicadores } from "@/hooks/useIndicadores";
import { useCurrentUser } from "@/hooks/useCurrentUser";
import { generateOrcamentoNumber, formatOrcamentoFromSeq, parseOrcamentoInitial } from "@/services/financialService";
import { KANBAN_ALL_COLUMNS } from "@/components/kanban/kanbanTypes";
import { toast } from "sonner";
import type { Client, LastSimInfo } from "@/components/kanban/kanbanTypes";

export function useKanbanData(externalClients: Client[]) {
  const [localClients, setLocalClients] = useState<Client[]>(externalClients);
  useEffect(() => { setLocalClients(externalClients); }, [externalClients]);
  const localClientsRef = useRef<Client[]>(externalClients);
  useEffect(() => { localClientsRef.current = localClients; }, [localClients]);

  const [lastSims, setLastSims] = useState<Record<string, LastSimInfo>>({});
  const [followUpStatus, setFollowUpStatus] = useState<Record<string, "active" | "paused" | "completed">>({});
  const [contractClientIds, setContractClientIds] = useState<Set<string>>(new Set());
  const [measurementStatus, setMeasurementStatus] = useState<Record<string, { status: string; assigned_to: string | null }>>({});
  const [expandedClient, setExpandedClient] = useState<Client | null>(null);

  const { settings } = useCompanySettings();
  const { projetistas, usuarios } = useUsuarios();
  const { indicadores } = useIndicadores();
  const { currentUser } = useCurrentUser();
  const tenantId = getTenantId();

  const cargoNome = currentUser?.cargo_nome?.toLowerCase() || "";

  const upsertLocalClient = useCallback((nextClient: Client) => {
    setLocalClients(prev => {
      const idx = prev.findIndex(c => c.id === nextClient.id);
      if (idx === -1) return [nextClient, ...prev];
      const next = [...prev];
      next[idx] = { ...next[idx], ...nextClient } as Client;
      return next;
    });
    setExpandedClient(prev => prev?.id === nextClient.id ? ({ ...prev, ...nextClient } as Client) : prev);
  }, []);

  // Realtime client sync
  useEffect(() => {
    if (!tenantId) return;
    const channel = supabase
      .channel(`kanban-clients-sync-${tenantId}`)
      .on("postgres_changes" as any, {
        event: "*", schema: "public", table: "clients",
        filter: `tenant_id=eq.${tenantId}`,
      }, (payload: any) => {
        if (payload.eventType === "DELETE") {
          const deletedId = payload.old?.id;
          if (!deletedId) return;
          setLocalClients(prev => prev.filter(c => c.id !== deletedId));
          setExpandedClient(prev => prev?.id === deletedId ? null : prev);
          return;
        }
        if (payload.new) upsertLocalClient(payload.new as Client);
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [tenantId, upsertLocalClient]);

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

  // Auto-move expired → perdidos (2+ days)
  useEffect(() => {
    if (!tenantId || localClients.length === 0) return;
    const twoDaysAgo = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000);
    const staleExpired = localClients.filter(c => {
      if ((c as any).status !== "expirado") return false;
      return new Date(c.updated_at) < twoDaysAgo;
    });
    if (staleExpired.length === 0) return;
    const moveToLost = async () => {
      const ids = staleExpired.map(c => c.id);
      const { error } = await supabase.from("clients").update({ status: "perdido" } as any).in("id", ids);
      if (!error) {
        setLocalClients(prev => prev.map(c => ids.includes(c.id) ? { ...c, status: "perdido" } as any : c));
      }
    };
    moveToLost();
  }, [localClients.length, tenantId]);

  // Fetch contracts + auto-sync to "fechado"
  useEffect(() => {
    if (!tenantId || localClients.length === 0) return;
    const fetchContractClients = async () => {
      const currentClients = localClientsRef.current;
      const { data } = await supabase.from("client_contracts").select("client_id, created_at").eq("tenant_id", tenantId);
      if (data) {
        const ids = new Set((data as any[]).map((d: any) => d.client_id));
        const contractDateByClientId = new Map<string, string>();
        (data as any[]).forEach((d: any) => {
          if (d.client_id && d.created_at && !contractDateByClientId.has(d.client_id)) {
            contractDateByClientId.set(d.client_id, d.created_at);
          }
        });

        setContractClientIds(ids);

        const needsStatusUpdate = currentClients.filter(c => ids.has(c.id) && (c as any).status !== "fechado");
        const missingContractDate = currentClients.filter(c => ids.has(c.id) && !(c as any).data_contrato);

        if (needsStatusUpdate.length > 0 || missingContractDate.length > 0) {
          const patchById = new Map<string, { status?: string; data_contrato?: string }>();

          needsStatusUpdate.forEach((c) => {
            const existing = patchById.get(c.id) || {};
            patchById.set(c.id, { ...existing, status: "fechado" });
          });

          missingContractDate.forEach((c) => {
            const existing = patchById.get(c.id) || {};
            patchById.set(c.id, {
              ...existing,
              data_contrato: contractDateByClientId.get(c.id) || new Date().toISOString(),
            });
          });

          await Promise.all(
            Array.from(patchById.entries()).map(([id, payload]) =>
              supabase.from("clients").update(payload as any).eq("id", id)
            )
          );

          setLocalClients(prev => prev.map(c => {
            const patch = patchById.get(c.id);
            return patch ? ({ ...c, ...patch } as any) : c;
          }));
        }
      }
    };
    fetchContractClients();
    const channel = supabase
      .channel(`kanban-contract-sync-${tenantId}`)
      .on("postgres_changes" as any, { event: "*", schema: "public", table: "client_contracts", filter: `tenant_id=eq.${tenantId}` }, () => { fetchContractClients(); })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [tenantId, localClients.length]);

  // Fetch measurements + auto-move
  useEffect(() => {
    if (!tenantId || localClients.length === 0) return;
    const isGerenteTecnico = cargoNome.includes("gerente") && (cargoNome.includes("tecnico") || cargoNome.includes("técnico"));
    const isBasicTechnical = !isGerenteTecnico && (cargoNome.includes("tecnico") || cargoNome.includes("técnico") || cargoNome.includes("liberador") || cargoNome.includes("conferente"));
    const isTechnical = isGerenteTecnico || isBasicTechnical;
    const fetchMeasurements = async () => {
      const currentClients = localClientsRef.current;
      let query = supabase.from("measurement_requests" as any).select("client_id, status, assigned_to").eq("tenant_id", tenantId);
      // For basic technical roles, only fetch requests assigned to them
      // Gerente Técnico sees ALL requests to manage assignments
      if (isBasicTechnical && currentUser) {
        const userName = currentUser.nome_completo;
        query = query.or(`assigned_to.eq.${userName},assigned_to.eq.${currentUser.id}`);
      }
      const { data } = await query;
      if (!data) return;
      const statusMap: Record<string, { status: string; assigned_to: string | null }> = {};
      (data as any[]).forEach((r: any) => { statusMap[r.client_id] = { status: r.status || "pending", assigned_to: r.assigned_to || null }; });
      setMeasurementStatus(statusMap);
      if (!isTechnical) {
        const updates: Array<{ id: string; status: string }> = [];
        currentClients.filter(c => (c as any).status === "fechado" && statusMap[c.id]).forEach(c => updates.push({ id: c.id, status: "em_medicao" }));
        currentClients.filter(c => (c as any).status === "em_medicao" && statusMap[c.id]?.assigned_to).forEach(c => updates.push({ id: c.id, status: "em_liberado" }));
        if (updates.length > 0) {
          await Promise.all(updates.map(u => supabase.from("clients").update({ status: u.status } as any).eq("id", u.id)));
          setLocalClients(prev => prev.map(c => { const u = updates.find(x => x.id === c.id); return u ? { ...c, status: u.status } as any : c; }));
        }
      }
    };
    fetchMeasurements();
    const channel = supabase
      .channel("kanban-measurement-sync")
      .on("postgres_changes" as any, { event: "*", schema: "public", table: "measurement_requests", filter: `tenant_id=eq.${tenantId}` }, (payload: any) => {
        if (isTechnical && currentUser && (payload.eventType === "INSERT" || payload.eventType === "UPDATE")) {
          const newData = payload.new;
          const oldData = payload.old;

          // Gerente Técnico: alert on ALL new measurement requests (INSERT)
          if (isGerenteTecnico && payload.eventType === "INSERT") {
            playNotificationSound();
            toast.info("📐 Nova solicitação de medida recebida!", { description: "Uma nova solicitação chegou para atribuição.", duration: 8000 });
          }

          // Basic technical roles: alert when assigned to them
          if (isBasicTechnical) {
            const userName = currentUser.nome_completo;
            const isAssignedToMe = newData?.assigned_to === userName || newData?.assigned_to === currentUser.id;
            const wasAssignedToMe = oldData?.assigned_to === userName || oldData?.assigned_to === currentUser.id;
            if (isAssignedToMe && !wasAssignedToMe) {
              playNotificationSound();
              toast.info("📐 Nova solicitação de medida recebida!", { description: "Uma nova solicitação foi atribuída a você.", duration: 8000 });
            }
          }
        }
        fetchMeasurements();
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [tenantId, localClients.length, cargoNome, currentUser]);

  // One-time orcamento fix (admin only)
  const fixedRef = useRef(false);
  useEffect(() => {
    if (!tenantId || localClients.length === 0 || fixedRef.current) return;
    if (!cargoNome.includes("administrador")) return;
    const orcSet = new Set<string>();
    let hasProblem = false;
    for (const c of localClients) {
      const orc = (c as any).numero_orcamento;
      if (!orc || /^(WA-?|55|\+?\d{10,})/i.test(orc) || orcSet.has(orc)) { hasProblem = true; break; }
      orcSet.add(orc);
    }
    if (!hasProblem) return;
    fixedRef.current = true;
    const reassignAll = async () => {
      const { data: s } = await (supabase as any).from("company_settings").select("codigo_loja, orcamento_numero_inicial").eq("tenant_id", tenantId).maybeSingle();
      let storeCode = "000000";
      if (s?.codigo_loja) storeCode = String(s.codigo_loja).replace(/\D/g, "").padStart(6, "0").slice(0, 6);
      const initialSeq = parseOrcamentoInitial(s?.orcamento_numero_inicial);
      const sorted = [...localClients].sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
      let currentSeq = initialSeq;
      const updates: Array<{ id: string; numero_orcamento: string; numero_orcamento_seq: number }> = [];
      for (const client of sorted) {
        updates.push({ id: client.id, numero_orcamento: formatOrcamentoFromSeq(storeCode, currentSeq), numero_orcamento_seq: currentSeq });
        currentSeq++;
      }
      for (const u of updates) {
        await supabase.from("clients").update({ numero_orcamento: u.numero_orcamento, numero_orcamento_seq: u.numero_orcamento_seq } as any).eq("id", u.id);
      }
      setLocalClients(prev => prev.map(c => { const u = updates.find(x => x.id === c.id); return u ? { ...c, numero_orcamento: u.numero_orcamento, numero_orcamento_seq: u.numero_orcamento_seq } as any : c; }));
    };
    reassignAll();
  }, [localClients.length, cargoNome, tenantId]);

  // Realtime: new lead notifications for current user
  useEffect(() => {
    const userName = currentUser?.nome_completo;
    if (!userName) return;
    const channel = supabase
      .channel("kanban-lead-notifications")
      .on("postgres_changes" as any, { event: "INSERT", schema: "public", table: "tracking_messages" }, (payload: any) => {
        const msg = payload.new;
        if (msg?.destinatario === userName && msg?.tipo === "sistema" && typeof msg?.conteudo === "string" && msg.conteudo.includes("enviado para seu atendimento")) {
          playNotificationSound();
          toast.success("🚀 Novo lead recebido!", { description: msg.conteudo.replace(/[🚀✅⚠️]/g, "").trim(), duration: 8000 });
        }
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [currentUser?.nome_completo]);

  // Realtime: admin/manager notifications
  useEffect(() => {
    if (!tenantId) return;
    const isAdminOrManager = cargoNome.includes("administrador") || cargoNome.includes("gerente");
    if (!isAdminOrManager) return;
    const channel = supabase
      .channel("kanban-admin-notifications")
      .on("postgres_changes" as any, { event: "INSERT", schema: "public", table: "clients", filter: `tenant_id=eq.${tenantId}` }, (payload: any) => {
        const c = payload.new;
        playNotificationSound();
        toast.info(`🆕 Novo cliente: ${c.nome || "Sem nome"}`, { description: `Origem: ${c.origem_lead || "manual"} — Vendedor: ${c.vendedor || "não atribuído"}`, duration: 8000 });
      })
      .on("postgres_changes" as any, { event: "UPDATE", schema: "public", table: "clients", filter: `tenant_id=eq.${tenantId}` }, (payload: any) => {
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
  }, [cargoNome, tenantId]);

  const handleClientUpdate = useCallback((updatedClient: Client) => {
    setLocalClients(prev => prev.map(c => c.id === updatedClient.id ? updatedClient : c));
    setExpandedClient(updatedClient);
  }, []);

  return {
    localClients, setLocalClients,
    lastSims, followUpStatus, contractClientIds, measurementStatus,
    expandedClient, setExpandedClient,
    settings, projetistas, usuarios, indicadores, currentUser,
    tenantId, cargoNome,
    handleClientUpdate,
  };
}
