import { useState, useEffect, useMemo, useCallback } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { MeasurementReport } from "./MeasurementReport";
import { MeasurementRequestModal } from "./MeasurementRequestModal";
import { MeasurementKanbanCard } from "./MeasurementKanbanCard";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Progress } from "@/components/ui/progress";
import {
  Ruler, AlertTriangle, CheckCircle2, Clock, RefreshCw, Search,
  User, ChevronRight, Loader2, BarChart3, Pencil, Users, Phone, Mail, Shield, Save,
} from "lucide-react";
import { supabase } from "@/lib/supabaseClient";
import { getTenantId } from "@/lib/tenantState";
import { useUsuarios } from "@/hooks/useUsuarios";
import { useMetasTetos } from "@/hooks/useMetasTetos";
import { formatCurrency } from "@/lib/financing";
import { format, differenceInDays } from "date-fns";
import { ptBR } from "date-fns/locale";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { playNotificationSound } from "@/lib/notificationSound";
import { sendWhatsAppText } from "@/lib/whatsappSender";
import { sendPushIfEnabled } from "@/lib/pushHelper";
import type { Client, LastSimInfo } from "./kanbanTypes";
import type { ClientTrackingRecord } from "@/hooks/useClientTracking";

interface MeasurementRequest {
  id: string;
  client_id: string;
  tracking_id: string;
  tenant_id: string;
  nome_cliente: string;
  valor_venda_avista: number;
  ambientes: any[];
  imported_files: any[];
  observacoes: string;
  client_snapshot: any;
  delivery_address: any;
  status: string;
  created_by: string | null;
  assigned_to: string | null;
  last_edited_by: string | null;
  last_edited_by_cargo: string | null;
  last_edited_at: string | null;
  created_at: string;
  updated_at: string;
  seller_name?: string;
  seller_cargo?: string;
  client_seller_name?: string;
  client_seller_cargo?: string;
  technician_name?: string;
  store_code?: string;
  contract_number?: string;
  contract_url?: string;
  briefing_url?: string;
  created_by_resolved?: string;
  created_by_cargo?: string;
  last_edited_by_resolved?: string;
  client_phone?: string | null;
  client_record?: Client | null;
  tracking_record?: ClientTrackingRecord | null;
  last_sim?: LastSimInfo;
}

const COLUMNS = [
  { id: "novo", label: "Novo", icon: "🆕", color: "hsl(var(--primary))" },
  { id: "em_andamento", label: "Em Andamento", icon: "🔧", color: "hsl(270 70% 55%)" },
  { id: "concluido", label: "Concluído", icon: "✅", color: "hsl(142 71% 45%)" },
];

const GENERIC_USER_LABELS = new Set([
  "",
  "sistema",
  "system",
  "admin",
  "administrador",
  "administrator",
  "usuario",
  "usuário",
  "user",
  "sem nome",
]);

function normalizeValue(value: string | null | undefined) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s*\([^)]*\)\s*$/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function isGenericUserLabel(value: string | null | undefined) {
  return GENERIC_USER_LABELS.has(normalizeValue(value));
}

export function MeasurementKanban() {
  const [requests, setRequests] = useState<MeasurementRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [detailRequest, setDetailRequest] = useState<MeasurementRequest | null>(null);
  const { usuarios } = useUsuarios();
  const { metas } = useMetasTetos();
  const [tetoOverrides, setTetoOverrides] = useState<Record<string, number>>({});
  const [editingTeto, setEditingTeto] = useState<string | null>(null);
  const [tetoEditValue, setTetoEditValue] = useState("");

  const getUserDisplayName = useCallback((user: any) => {
    if (!user) return "";

    const candidates = [
      user.nome_completo,
      user.name,
      user.full_name,
      user.profile?.nome_completo,
      user.profile?.full_name,
      user.profile?.name,
      user.apelido,
      typeof user.email === "string" ? user.email.split("@")[0] : "",
    ];

    return candidates.find((value) => typeof value === "string" && value.trim() && !isGenericUserLabel(value)) || "";
  }, []);

  const findUserByReference = useCallback((reference: string | null | undefined, cargoHint?: string | null) => {
    if (!reference) return null;
    const normalized = normalizeValue(reference);

    const exactMatch = usuarios.find((user: any) => {
      const authId = normalizeValue(user.auth_user_id);
      const id = normalizeValue(user.id);
      const nome = normalizeValue(user.nome_completo);
      const apelido = normalizeValue(user.apelido);
      const email = normalizeValue(user.email);
      return [id, authId, nome, apelido, email].includes(normalized);
    }) || null;

    if (exactMatch) return exactMatch;
    if (!isGenericUserLabel(reference)) return null;

    const normalizedCargoHint = normalizeValue(cargoHint);
    if (!normalizedCargoHint) return null;

    const candidates = usuarios.filter((user: any) => {
      const cargo = normalizeValue(user.cargo_nome);
      if (!cargo) return false;
      return cargo.includes(normalizedCargoHint) || normalizedCargoHint.includes(cargo);
    });

    return candidates.length === 1 ? candidates[0] : null;
  }, [usuarios]);

  const pickBestHumanLabel = useCallback((...values: Array<string | null | undefined>) => {
    return values.find((value) => typeof value === "string" && value.trim() && !isGenericUserLabel(value)) || "";
  }, []);

  const fetchRequests = useCallback(async () => {
    const tenantId = getTenantId();
    if (!tenantId) return;

    setLoading(true);

    const [requestsRes, clientsRes, settingsRes, tenantRes, trackingRes] = await Promise.all([
      supabase
        .from("measurement_requests" as any)
        .select("*")
        .eq("tenant_id", tenantId)
        .order("created_at", { ascending: false }),
      supabase
        .from("clients" as any)
        .select("*")
        .eq("tenant_id", tenantId),
      supabase
        .from("company_settings" as any)
        .select("codigo_loja")
        .eq("tenant_id", tenantId)
        .maybeSingle(),
      supabase
        .from("tenants" as any)
        .select("codigo_loja")
        .eq("id", tenantId)
        .maybeSingle(),
      supabase
        .from("client_tracking" as any)
        .select("*")
        .eq("tenant_id", tenantId),
    ]);

    if (requestsRes.error) {
      setLoading(false);
      return;
    }

    const clientsById = new Map((clientsRes.data || []).map((client: any) => [client.id, client]));
    const trackingByClientId = new Map<string, any>();
    (trackingRes.data || []).forEach((tracking: any) => {
      if (!trackingByClientId.has(tracking.client_id)) {
        trackingByClientId.set(tracking.client_id, tracking);
      }
    });
    const tenantStoreCode = (settingsRes.data as any)?.codigo_loja || (tenantRes.data as any)?.codigo_loja || "";

    const enrichedRequests = ((requestsRes.data as any[]) || []).map((request) => {
      const client = clientsById.get(request.client_id);
      const tracking = trackingByClientId.get(request.client_id);
      const snapshot = request.client_snapshot || {};
      const clientPhone = snapshot.telefone1 || snapshot.telefone || client?.telefone1 || client?.telefone || client?.celular || "";

      const snapshotSellerRef = snapshot.responsavel_id
        || snapshot.seller_id
        || snapshot.vendedor
        || snapshot.seller_name
        || snapshot.projetista;

      const sellerUser = findUserByReference(client?.responsavel_id)
        || findUserByReference(snapshotSellerRef, snapshot.seller_cargo)
        || findUserByReference(client?.vendedor)
        || findUserByReference(tracking?.projetista)
        || findUserByReference(request.seller_name, request.seller_cargo)
        || findUserByReference(request.created_by, request.created_by_cargo)
        || null;

      const createdByIsSystem = ["sistema", "system"].includes(normalizeValue(request.created_by));
      const createdUser = createdByIsSystem
        ? (
            findUserByReference(snapshot.created_by_user_id, snapshot.created_by_user_cargo)
            || findUserByReference(snapshot.created_by_user_name, snapshot.created_by_user_cargo)
            || sellerUser
            || findUserByReference(client?.vendedor)
            || findUserByReference(tracking?.projetista)
          )
        : (
            findUserByReference(snapshot.created_by_user_id, snapshot.created_by_user_cargo)
            || findUserByReference(snapshot.created_by_user_name, snapshot.created_by_user_cargo)
            || findUserByReference(request.created_by, request.created_by_cargo)
            || sellerUser
          );

      const editedUser = findUserByReference(snapshot.last_edited_by_user_id, snapshot.last_edited_by_user_cargo || request.last_edited_by_cargo)
        || findUserByReference(snapshot.last_edited_by_user_name, snapshot.last_edited_by_user_cargo || request.last_edited_by_cargo)
        || findUserByReference(request.last_edited_by, snapshot.last_edited_by_user_cargo || request.last_edited_by_cargo);
      const technicianUser = findUserByReference(request.assigned_to) || findUserByReference(request.technician_name);

      const resolvedContractNumber = request.contract_number
        || tracking?.numero_contrato
        || snapshot.contract_number
        || snapshot.numero_contrato
        || client?.numero_orcamento
        || "";

      const sellerName = pickBestHumanLabel(
        getUserDisplayName(sellerUser),
        snapshot.vendedor,
        snapshot.projetista,
        snapshot.seller_name,
        client?.vendedor,
        tracking?.projetista,
        request.seller_name,
      ) || "—";

      const createdByName = pickBestHumanLabel(
        getUserDisplayName(createdUser),
        snapshot.created_by_user_name,
        sellerName,
        client?.vendedor,
        tracking?.projetista,
        request.created_by,
      ) || "—";

      const editedByName = pickBestHumanLabel(
        getUserDisplayName(editedUser),
        snapshot.last_edited_by_user_name,
        request.last_edited_by,
      ) || "—";

      return {
        ...request,
        seller_name: sellerName,
        seller_cargo: sellerUser?.cargo_nome || snapshot.seller_cargo || request.seller_cargo || "",
        client_seller_name: sellerName,
        client_seller_cargo: sellerUser?.cargo_nome || snapshot.seller_cargo || "",
        technician_name: technicianUser?.nome_completo || request.technician_name || request.assigned_to || "",
        store_code: request.store_code || snapshot.store_code || snapshot.codigo_loja || tenantStoreCode || "—",
        contract_number: resolvedContractNumber,
        contract_url: request.contract_url || snapshot.contract_url || "",
        briefing_url: request.briefing_url || snapshot.briefing_url || "",
        created_by_resolved: createdByName,
        created_by_cargo: createdUser?.cargo_nome || snapshot.created_by_user_cargo || sellerUser?.cargo_nome || snapshot.seller_cargo || request.created_by_cargo || "",
        last_edited_by_resolved: editedByName,
        last_edited_by_cargo: editedUser?.cargo_nome || snapshot.last_edited_by_user_cargo || request.last_edited_by_cargo || "",
        client_phone: clientPhone,
        client_record: client || null,
        tracking_record: tracking || null,
        last_sim: undefined,
      } satisfies MeasurementRequest;
    });

    setRequests(enrichedRequests);
    setLoading(false);
  }, [findUserByReference, getUserDisplayName, pickBestHumanLabel]);

  useEffect(() => { fetchRequests(); }, [fetchRequests]);

  useEffect(() => {
    if (!detailRequest) return;

    const liveRequest = requests.find((request) => request.id === detailRequest.id);
    if (!liveRequest) {
      setDetailRequest(null);
      return;
    }

    if (liveRequest !== detailRequest) {
      setDetailRequest(liveRequest);
    }
  }, [requests, detailRequest]);

  useEffect(() => {
    const tenantId = getTenantId();
    if (!tenantId) return;

    const channel = supabase
      .channel("measurement-requests-realtime")
      .on("postgres_changes" as any, {
        event: "*",
        schema: "public",
        table: "measurement_requests",
        filter: `tenant_id=eq.${tenantId}`,
      }, (payload: any) => {
        fetchRequests();
        if (payload.eventType === "INSERT") {
          playNotificationSound();
          toast.info("📐 Nova solicitação de medida recebida!", {
            description: payload.new?.nome_cliente || "Novo pedido",
            duration: 5000,
          });
        }
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [fetchRequests]);

  const filtered = useMemo(() => {
    if (!search.trim()) return requests;
    const query = search.toLowerCase();
    return requests.filter((request) =>
      request.nome_cliente.toLowerCase().includes(query) ||
      (request.assigned_to || "").toLowerCase().includes(query) ||
      (request.created_by_resolved || request.created_by || "").toLowerCase().includes(query) ||
      (request.client_seller_name || "").toLowerCase().includes(query)
    );
  }, [requests, search]);

  const columnData = useMemo(() => {
    const map: Record<string, MeasurementRequest[]> = {};
    COLUMNS.forEach((column) => { map[column.id] = []; });
    filtered.forEach((request) => {
      if (map[request.status]) map[request.status].push(request);
      else map.novo.push(request);
    });
    return map;
  }, [filtered]);

  const handleStatusChange = async (id: string, newStatus: string) => {
    const { error } = await supabase
      .from("measurement_requests" as any)
      .update({ status: newStatus, updated_at: new Date().toISOString() } as any)
      .eq("id", id);

    if (error) toast.error("Erro ao atualizar status");
    else {
      toast.success("Status atualizado!");
      setRequests((prev) => prev.map((request) => request.id === id ? { ...request, status: newStatus } : request));
    }
  };

  const handleAssign = async (id: string, assignedTo: string) => {
    const value = assignedTo === "__none__" ? null : assignedTo;
    const assignedUser = value
      ? tecnicosEProjetistas.find((user) => user.nome_completo === value || user.id === value)
      : null;
    const assignedName = assignedUser?.nome_completo || value;
    const requestTarget = requests.find((request) => request.id === id);

    const { error } = await supabase
      .from("measurement_requests" as any)
      .update({
        assigned_to: assignedName,
        status: assignedName ? "em_andamento" : "novo",
        updated_at: new Date().toISOString(),
      } as any)
      .eq("id", id);

    if (error) {
      toast.error("Erro ao atribuir");
      return;
    }

    toast.success(assignedName ? `Atribuído a ${assignedName}!` : "Desvinculado");
    setRequests((prev) => prev.map((request) => request.id === id ? {
      ...request,
      assigned_to: assignedName,
      technician_name: assignedName || "",
      status: assignedName ? "em_andamento" : "novo",
    } : request));

    if (assignedName) {
      const tenantId = getTenantId();
      const content = `📐 Solicitação de medida do cliente "${requestTarget?.nome_cliente || "Cliente"}" foi atribuída a você.`;
      supabase.from("tracking_messages").insert({
        tenant_id: tenantId,
        tipo: "sistema",
        canal: "interno",
        remetente: "Sistema",
        conteudo: content,
        destinatario: assignedName,
      } as any).then(() => {});

      // Play sound notification
      playNotificationSound();

      // Send push notification
      if (assignedUser?.id) {
        sendPushIfEnabled(
          "medidas",
          assignedUser.id,
          "📐 Nova Solicitação de Medida",
          `Cliente: ${requestTarget?.nome_cliente || "Cliente"} — Valor: ${formatCurrency(Number(requestTarget?.valor_venda_avista) || 0)}`,
          `measurement-${id}`,
        );
      }

      // Send WhatsApp notification
      if (assignedUser?.telefone) {
        const whatsappMessage = `📐 *Nova Solicitação de Medida*\n\n👤 Cliente: ${requestTarget?.nome_cliente || "Cliente"}\n💰 Valor à vista: ${formatCurrency(Number(requestTarget?.valor_venda_avista) || 0)}\n🏠 Ambientes: ${requestTarget?.ambientes?.length || 0}\n\nVocê foi colocado(a) na fila de atendimento desta solicitação.`;
        sendWhatsAppText(assignedUser.telefone, whatsappMessage).catch(() => {});
      }
    }
  };

  const stalledCount = useMemo(() => {
    return (columnData.novo || []).filter((request) => differenceInDays(new Date(), new Date(request.created_at)) > 3).length;
  }, [columnData]);

  const tecnicosEProjetistas = useMemo(() =>
    usuarios.filter((user) => {
      if (!user.ativo || !user.cargo_nome) return false;
      const cargo = user.cargo_nome.toLowerCase();
      if (cargo.includes("gerente")) return false;
      return (
        cargo.includes("liberador") ||
        cargo.includes("tecnico") ||
        cargo.includes("técnico") ||
        cargo.includes("conferente")
      );
    }),
  [usuarios]);

  const defaultTetoLiberacao = useMemo(() => {
    const tetoMeta = metas.find(m => m.tipo === "teto_liberacao");
    return tetoMeta?.valor || 0;
  }, [metas]);

  const queueOrder = useMemo(() => {
    return tecnicosEProjetistas.map((user) => {
      const teto = tetoOverrides[user.id] ?? defaultTetoLiberacao;
      const assigned = requests.filter((request) =>
        (request.assigned_to === user.nome_completo || request.assigned_to === user.id) && request.status !== "concluido"
      );
      const totalValor = assigned.reduce((sum, request) => sum + (Number(request.valor_venda_avista) || 0), 0);
      const remaining = Math.max(0, teto - totalValor);
      const lastAssignment = assigned.length > 0
        ? assigned.reduce((latest, request) => Math.max(latest, new Date(request.updated_at || request.created_at).getTime()), 0)
        : 0;

      return {
        id: user.id,
        nome: user.nome_completo,
        telefone: user.telefone,
        email: user.email,
        cargo: user.cargo_nome,
        remaining,
        teto,
        lastAssignment,
      };
    }).sort((a, b) => {
      if (a.lastAssignment !== b.lastAssignment) return a.lastAssignment - b.lastAssignment;
      return b.remaining - a.remaining;
    });
  }, [tecnicosEProjetistas, requests, tetoOverrides, defaultTetoLiberacao]);

  const nextQueueAssignee = queueOrder.find((item) => item.remaining > 0)?.nome || queueOrder[0]?.nome || null;

  const selectedClient = useMemo(() => {
    if (!detailRequest) return null;
    if (detailRequest.client_record) return detailRequest.client_record;

    const snapshot = detailRequest.client_snapshot || {};
    const address = detailRequest.delivery_address || {};

    return {
      id: detailRequest.client_id,
      tenant_id: detailRequest.tenant_id,
      nome: detailRequest.nome_cliente,
      telefone1: detailRequest.client_phone || snapshot.telefone1 || snapshot.telefone || "",
      email: snapshot.email || "",
      cpf: snapshot.cpf || "",
      vendedor: detailRequest.client_seller_name || detailRequest.seller_name || snapshot.vendedor || snapshot.seller_name || "",
      responsavel_id: snapshot.responsavel_id || null,
      numero_orcamento: detailRequest.contract_number || snapshot.numero_orcamento || snapshot.numero_contrato || "",
      delivery_address_zip: address.cep || snapshot.delivery_address_zip || snapshot.cep_entrega || "",
      delivery_address_street: address.street || snapshot.delivery_address_street || snapshot.endereco_entrega || "",
      delivery_address_number: address.number || snapshot.delivery_address_number || snapshot.numero_entrega || "",
      delivery_address_complement: address.complement || snapshot.delivery_address_complement || snapshot.complemento_entrega || "",
      delivery_address_district: address.district || snapshot.delivery_address_district || snapshot.bairro_entrega || "",
      delivery_address_city: address.city || snapshot.delivery_address_city || snapshot.cidade_entrega || "",
      delivery_address_state: address.state || snapshot.delivery_address_state || snapshot.uf_entrega || "",
      created_at: detailRequest.created_at,
      updated_at: detailRequest.updated_at,
    } as Client;
  }, [detailRequest]);

  const selectedTracking = useMemo(() => {
    if (!detailRequest) return null;
    if (detailRequest.tracking_record) return detailRequest.tracking_record;

    const snapshot = detailRequest.client_snapshot || {};

    return {
      id: detailRequest.tracking_id || "",
      client_id: detailRequest.client_id,
      numero_contrato: detailRequest.contract_number || snapshot.numero_contrato || snapshot.numero_orcamento || "",
      nome_cliente: detailRequest.nome_cliente,
      cpf_cnpj: snapshot.cpf || null,
      quantidade_ambientes: detailRequest.ambientes?.length || 0,
      valor_contrato: Number(detailRequest.valor_venda_avista) || 0,
      data_fechamento: detailRequest.created_at,
      projetista: detailRequest.client_seller_name || detailRequest.seller_name || snapshot.projetista || snapshot.vendedor || null,
      status: detailRequest.status,
      comissao_percentual: null,
      comissao_valor: null,
      comissao_status: null,
      created_at: detailRequest.created_at,
    } as ClientTrackingRecord;
  }, [detailRequest]);

  return (
    <Tabs defaultValue="kanban" className="space-y-4">
      <TabsList>
        <TabsTrigger value="kanban" className="gap-1.5"><Ruler className="h-3.5 w-3.5" />Kanban</TabsTrigger>
        <TabsTrigger value="report" className="gap-1.5"><BarChart3 className="h-3.5 w-3.5" />Relatório</TabsTrigger>
        <TabsTrigger value="fila" className="gap-1.5"><Users className="h-3.5 w-3.5" />Fila Liberação</TabsTrigger>
      </TabsList>

      <TabsContent value="kanban" className="space-y-4">
        <div className="space-y-4">
          {stalledCount > 0 && (
            <div className="bg-destructive/10 border border-destructive/30 rounded-lg p-3 flex items-center gap-3">
              <AlertTriangle className="h-5 w-5 text-destructive shrink-0" />
              <div>
                <p className="text-sm font-semibold text-destructive">
                  ⚠️ {stalledCount} solicitação(ões) parada(s) há mais de 3 dias!
                </p>
                <p className="text-xs text-muted-foreground">
                  Distribua as solicitações abaixo para os técnicos responsáveis.
                </p>
              </div>
            </div>
          )}

          <div className="flex items-center gap-3">
            <div className="relative flex-1 max-w-sm">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Buscar cliente..." className="pl-9" />
            </div>
            <Button variant="outline" size="sm" onClick={fetchRequests} className="gap-1.5">
              <RefreshCw className="h-3.5 w-3.5" />Atualizar
            </Button>
          </div>

          {loading ? (
            <div className="flex items-center justify-center py-16 text-muted-foreground gap-2">
              <Loader2 className="h-5 w-5 animate-spin" />Carregando...
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {COLUMNS.map((column) => (
                <div key={column.id} className="flex flex-col">
                  <div className="flex items-center gap-2 mb-3 px-1">
                    <span className="text-base">{column.icon}</span>
                    <span className="text-sm font-semibold text-foreground">{column.label}</span>
                    <Badge variant="outline" className="ml-auto text-[10px] h-5 px-1.5">
                      {columnData[column.id]?.length || 0}
                    </Badge>
                  </div>

                  <ScrollArea className="flex-1" style={{ maxHeight: "calc(100vh - 320px)" }}>
                    <div className="space-y-2 pr-2">
                      {(columnData[column.id] || []).length === 0 ? (
                        <div className="text-center text-xs text-muted-foreground py-8 bg-muted/20 rounded-lg border border-dashed">
                          Nenhuma solicitação
                        </div>
                      ) : (
                        (columnData[column.id] || []).map((request) => {
                          const daysOld = differenceInDays(new Date(), new Date(request.created_at));
                          const isStalled = request.status === "novo" && daysOld > 3;

                          return (
                            <MeasurementKanbanCard
                              key={request.id}
                              request={request}
                              daysOld={daysOld}
                              isStalled={isStalled}
                              columnColor={column.color}
                              onViewDetails={() => setDetailRequest(request)}
                              assignmentControl={(
                                <div className="flex items-center gap-1">
                                  <User className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                                  {!request.assigned_to && nextQueueAssignee ? (
                                    <>
                                      <Button
                                        variant="default"
                                        size="sm"
                                        className="h-7 text-[10px] flex-1 gap-1"
                                        onClick={() => handleAssign(request.id, nextQueueAssignee)}
                                      >
                                        ⚡ Atribuir · {nextQueueAssignee.split(" ")[0]}
                                      </Button>
                                      <Select
                                        value="__none__"
                                        onValueChange={(value) => handleAssign(request.id, value)}
                                      >
                                        <SelectTrigger className="h-7 w-7 p-0 flex items-center justify-center">
                                          <ChevronRight className="h-3 w-3" />
                                        </SelectTrigger>
                                        <SelectContent>
                                          <SelectItem value="__none__">Sem responsável</SelectItem>
                                          {tecnicosEProjetistas.map((user) => (
                                            <SelectItem key={user.id} value={user.nome_completo}>
                                              {user.nome_completo} ({user.cargo_nome})
                                            </SelectItem>
                                          ))}
                                        </SelectContent>
                                      </Select>
                                    </>
                                  ) : (
                                    <Select
                                      value={request.assigned_to || "__none__"}
                                      onValueChange={(value) => handleAssign(request.id, value)}
                                    >
                                      <SelectTrigger className="h-7 text-[11px] flex-1">
                                        <SelectValue>{request.technician_name || request.assigned_to || "Atribuir técnico"}</SelectValue>
                                      </SelectTrigger>
                                      <SelectContent>
                                        <SelectItem value="__none__">Sem responsável</SelectItem>
                                        {nextQueueAssignee && (
                                          <SelectItem value={nextQueueAssignee}>1º da fila · {nextQueueAssignee}</SelectItem>
                                        )}
                                        {tecnicosEProjetistas.filter((user) => user.nome_completo !== nextQueueAssignee).map((user) => (
                                          <SelectItem key={user.id} value={user.nome_completo}>
                                            {user.nome_completo} ({user.cargo_nome})
                                          </SelectItem>
                                        ))}
                                      </SelectContent>
                                    </Select>
                                  )}
                                </div>
                              )}
                              statusControl={request.status !== "novo" ? (
                                <div className="flex items-center gap-2">
                                  <ChevronRight className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                                  <Select value={request.status} onValueChange={(value) => handleStatusChange(request.id, value)}>
                                    <SelectTrigger className="h-7 text-[11px] flex-1">
                                      <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                      {COLUMNS.map((columnOption) => (
                                        <SelectItem key={columnOption.id} value={columnOption.id}>{columnOption.icon} {columnOption.label}</SelectItem>
                                      ))}
                                    </SelectContent>
                                  </Select>
                                </div>
                              ) : null}
                            />
                          );
                        })
                      )}
                    </div>
                  </ScrollArea>
                </div>
              ))}
            </div>
          )}

          <div className="flex items-center gap-6 px-2 py-3 bg-muted/30 rounded-lg border">
            <div className="flex items-center gap-2">
              <Ruler className="h-4 w-4 text-primary" />
              <span className="text-sm font-medium">Total: {requests.length}</span>
            </div>
            <Separator orientation="vertical" className="h-6" />
            <div className="flex items-center gap-2">
              <span className="text-sm text-muted-foreground">Pendentes: {(columnData.novo?.length || 0) + (columnData.em_andamento?.length || 0)}</span>
            </div>
            <Separator orientation="vertical" className="h-6" />
            <div className="flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4 text-emerald-500" />
              <span className="text-sm text-muted-foreground">Concluídas: {columnData.concluido?.length || 0}</span>
            </div>
          </div>
        </div>
      </TabsContent>

      <TabsContent value="report">
        <MeasurementReport />
      </TabsContent>

      <TabsContent value="fila" className="space-y-4">
        <FilaLiberacaoTab
          requests={requests}
          liberadores={tecnicosEProjetistas}
          metas={metas}
          tetoOverrides={tetoOverrides}
          setTetoOverrides={setTetoOverrides}
          editingTeto={editingTeto}
          setEditingTeto={setEditingTeto}
          tetoEditValue={tetoEditValue}
          setTetoEditValue={setTetoEditValue}
        />
      </TabsContent>

      {detailRequest && selectedClient && selectedTracking && (
        <MeasurementRequestModal
          open={!!detailRequest}
          onOpenChange={(open) => !open && setDetailRequest(null)}
          client={selectedClient}
          tracking={selectedTracking}
          lastSim={detailRequest.last_sim}
        />
      )}
    </Tabs>
  );
}

/* ───────────── Fila Liberação Tab ───────────── */

interface FilaLiberacaoProps {
  requests: MeasurementRequest[];
  liberadores: any[];
  metas: any[];
  tetoOverrides: Record<string, number>;
  setTetoOverrides: React.Dispatch<React.SetStateAction<Record<string, number>>>;
  editingTeto: string | null;
  setEditingTeto: (id: string | null) => void;
  tetoEditValue: string;
  setTetoEditValue: (v: string) => void;
}

function FilaLiberacaoTab({
  requests, liberadores, metas, tetoOverrides,
  setTetoOverrides, editingTeto, setEditingTeto, tetoEditValue, setTetoEditValue,
}: FilaLiberacaoProps) {
  // Check if current user is admin - uses useCurrentUser from auth context
  const isAdmin = useMemo(() => {
    try {
      // Check from Supabase session metadata first, fallback to localStorage for display name
      const sessionUser = JSON.parse(localStorage.getItem("usuario_atual") || "{}");
      const cargoNome = (sessionUser.cargo_nome || "").toLowerCase();
      return cargoNome.includes("administrador") || cargoNome.includes("gerente");
    } catch { return false; }
  }, []);

  // Get default teto from metas_tetos config
  const defaultTeto = useMemo(() => {
    const tetoMeta = metas.find(m => m.tipo === "teto_liberacao");
    return tetoMeta?.valor || 0;
  }, [metas]);

  const currentMonth = useMemo(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  }, []);

  // Build queue data for each liberador
  const queueData = useMemo(() => {
    return liberadores.map(lib => {
      const teto = tetoOverrides[lib.id] ?? defaultTeto;
      const assignedRequests = requests.filter(r =>
        (r.assigned_to === lib.nome_completo || r.assigned_to === lib.id) &&
        r.status !== "concluido" &&
        (r.created_at || "").substring(0, 7) === currentMonth
      );
      const totalValor = assignedRequests.reduce((sum, r) => sum + (Number(r.valor_venda_avista) || 0), 0);
      const remaining = Math.max(0, teto - totalValor);
      const lastAssignment = assignedRequests.length > 0
        ? assignedRequests.reduce((latest, r) => {
            const d = new Date(r.updated_at || r.created_at).getTime();
            return d > latest ? d : latest;
          }, 0)
        : 0;
      const pct = teto > 0 ? Math.min(100, (totalValor / teto) * 100) : 0;

      return {
        id: lib.id,
        nome: lib.nome_completo,
        cargo: lib.cargo_nome || "",
        telefone: lib.telefone || lib.whatsapp || "",
        email: lib.email || "",
        teto,
        totalSolicitacoes: assignedRequests.length,
        totalValor,
        remaining,
        lastAssignment,
        pct,
      };
    }).sort((a, b) => {
      // Queue priority: least recently assigned first, then most remaining capacity
      if (a.lastAssignment !== b.lastAssignment) return a.lastAssignment - b.lastAssignment;
      return b.remaining - a.remaining;
    });
  }, [liberadores, requests, tetoOverrides, defaultTeto, currentMonth]);

  const handleSaveTeto = (libId: string) => {
    const val = parseFloat(tetoEditValue.replace(/\D/g, "")) / 100;
    if (val > 0) {
      setTetoOverrides(prev => ({ ...prev, [libId]: val }));
      toast.success("Teto atualizado!");
    }
    setEditingTeto(null);
  };

  if (liberadores.length === 0) {
    return (
      <Card>
        <CardContent className="py-8 text-center text-muted-foreground">
          <Users className="h-10 w-10 mx-auto mb-2 opacity-30" />
          <p>Nenhum liberador/técnico/conferente cadastrado e ativo</p>
        </CardContent>
      </Card>
    );
  }

  // Build assignment history from all requests that have been assigned
  const assignmentHistory = useMemo(() => {
    return requests
      .filter(r => r.assigned_to)
      .map(r => ({
        id: r.id,
        cliente: r.nome_cliente,
        tecnico: r.technician_name || r.assigned_to || "",
        valor: Number(r.valor_venda_avista) || 0,
        data: r.updated_at || r.created_at,
        status: r.status,
      }))
      .sort((a, b) => new Date(b.data).getTime() - new Date(a.data).getTime());
  }, [requests]);

  const [showHistory, setShowHistory] = useState(false);

  return (
    <div className="space-y-4">
      {/* Queue order indicator */}
      <div className="bg-muted/30 rounded-lg border p-3">
        <h4 className="text-sm font-semibold flex items-center gap-2 mb-2">
          <Shield className="h-4 w-4 text-primary" />
          Ordem da Fila de Distribuição
        </h4>
        <div className="flex items-center gap-2 flex-wrap">
          {queueData.map((lib, idx) => (
            <Badge
              key={lib.id}
              variant={idx === 0 ? "default" : "outline"}
              className={cn(
                "text-xs gap-1 transition-all duration-500",
                idx === 0 && "bg-primary text-primary-foreground animate-pulse shadow-md shadow-primary/30 scale-110"
              )}
            >
              {idx === 0 && "⚡ "}{idx + 1}º {lib.nome.split(" ")[0]}
              {lib.remaining > 0 && <span className="opacity-70">({formatCurrency(lib.remaining)})</span>}
            </Badge>
          ))}
        </div>
        <p className="text-[10px] text-muted-foreground mt-2">
          Próximo na fila: <strong className="text-primary">{queueData[0]?.nome || "—"}</strong> — baseado na última atribuição e capacidade restante.
        </p>
      </div>

      {/* Liberador cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {queueData.map((lib, idx) => (
          <Card
            key={lib.id}
            className={cn(
              "transition-all duration-500",
              idx === 0 && "border-primary ring-2 ring-primary/30 shadow-lg shadow-primary/10 relative overflow-hidden"
            )}
          >
            {idx === 0 && (
              <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-primary via-primary/60 to-primary animate-pulse" />
            )}
            <CardContent className="pt-4 space-y-3">
              <div className="flex items-start justify-between">
                <div>
                  <div className="flex items-center gap-2">
                    <Badge
                      variant={idx === 0 ? "default" : "secondary"}
                      className={cn(
                        "text-[10px] h-5 w-5 p-0 flex items-center justify-center rounded-full",
                        idx === 0 && "animate-bounce"
                      )}
                    >
                      {idx + 1}
                    </Badge>
                    <p className={cn("text-sm font-semibold", idx === 0 && "text-primary")}>{lib.nome}</p>
                  </div>
                  <p className="text-[11px] text-muted-foreground">{lib.cargo}</p>
                </div>
                {idx === 0 && (
                  <Badge className="bg-primary text-primary-foreground text-[9px] border-primary/30 shadow-sm">
                    ⚡ 1º da Fila
                  </Badge>
                )}
              </div>

              {/* Contact info */}
              <div className="flex items-center gap-3 text-[11px] text-muted-foreground">
                {lib.telefone && (
                  <a href={`https://wa.me/55${lib.telefone.replace(/\D/g, "")}`} target="_blank" rel="noopener noreferrer"
                    className="flex items-center gap-1 hover:text-primary transition-colors">
                    <Phone className="h-3 w-3" />{lib.telefone}
                  </a>
                )}
                {lib.email && (
                  <span className="flex items-center gap-1 truncate">
                    <Mail className="h-3 w-3" />{lib.email}
                  </span>
                )}
              </div>

              {/* Teto */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-muted-foreground">Teto de Liberação</span>
                  {editingTeto === lib.id ? (
                    <div className="flex items-center gap-1">
                      <Input
                        value={tetoEditValue}
                        onChange={e => {
                          const digits = e.target.value.replace(/\D/g, "");
                          setTetoEditValue(digits ? (parseInt(digits) / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" }) : "");
                        }}
                        className="h-6 w-28 text-[10px]"
                        autoFocus
                        onKeyDown={e => e.key === "Enter" && handleSaveTeto(lib.id)}
                      />
                      <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => handleSaveTeto(lib.id)}>
                        <Save className="h-3 w-3" />
                      </Button>
                    </div>
                  ) : (
                    <div className="flex items-center gap-1">
                      <span className="font-semibold text-foreground">{formatCurrency(lib.teto)}</span>
                      {isAdmin && (
                        <Button variant="ghost" size="icon" className="h-5 w-5" onClick={() => {
                          setEditingTeto(lib.id);
                          setTetoEditValue(lib.teto > 0 ? lib.teto.toLocaleString("pt-BR", { style: "currency", currency: "BRL" }) : "");
                        }}>
                          <Pencil className="h-2.5 w-2.5" />
                        </Button>
                      )}
                    </div>
                  )}
                </div>

                {/* Progress */}
                <Progress
                  value={lib.pct}
                  className={cn("h-2", lib.pct >= 100 ? "[&>div]:bg-destructive" : lib.pct >= 80 ? "[&>div]:bg-amber-500" : "")}
                />
                <div className="flex items-center justify-between text-[10px] text-muted-foreground">
                  <span>{formatCurrency(lib.totalValor)} utilizado</span>
                  <span className={cn(lib.remaining === 0 ? "text-destructive font-semibold" : "text-emerald-600")}>
                    {lib.remaining > 0 ? `${formatCurrency(lib.remaining)} restante` : "Teto atingido"}
                  </span>
                </div>
              </div>

              {/* Stats */}
              <div className="grid grid-cols-2 gap-2">
                <div className="bg-muted/30 rounded-lg p-2 text-center">
                  <p className="text-lg font-bold text-foreground">{lib.totalSolicitacoes}</p>
                  <p className="text-[9px] text-muted-foreground">Solicitações</p>
                </div>
                <div className="bg-muted/30 rounded-lg p-2 text-center">
                  <p className="text-lg font-bold text-foreground">{lib.pct.toFixed(0)}%</p>
                  <p className="text-[9px] text-muted-foreground">Capacidade</p>
                </div>
              </div>

              {lib.lastAssignment > 0 && (
                <p className="text-[10px] text-muted-foreground">
                  Última atribuição: {format(new Date(lib.lastAssignment), "dd/MM/yy HH:mm", { locale: ptBR })}
                </p>
              )}
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Assignment History */}
      <div className="space-y-2">
        <Button
          variant="outline"
          size="sm"
          className="gap-1.5"
          onClick={() => setShowHistory(!showHistory)}
        >
          <Clock className="h-3.5 w-3.5" />
          Histórico de Atribuições ({assignmentHistory.length})
          <ChevronRight className={cn("h-3.5 w-3.5 transition-transform", showHistory && "rotate-90")} />
        </Button>

        {showHistory && (
          <Card>
            <CardContent className="p-0">
              <ScrollArea className="max-h-[400px]">
                <div className="divide-y">
                  {assignmentHistory.length === 0 ? (
                    <div className="text-center text-sm text-muted-foreground py-8">
                      Nenhuma atribuição registrada
                    </div>
                  ) : (
                    assignmentHistory.map((item) => (
                      <div key={item.id} className="flex items-center gap-3 px-4 py-2.5 hover:bg-muted/30 transition-colors">
                        <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                          <User className="h-4 w-4 text-primary" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-medium truncate">{item.cliente}</p>
                          <p className="text-[11px] text-muted-foreground">
                            Atribuído a <span className="font-semibold text-foreground">{item.tecnico}</span>
                          </p>
                        </div>
                        <div className="text-right shrink-0">
                          <p className="text-sm font-semibold text-emerald-600">{formatCurrency(item.valor)}</p>
                          <p className="text-[10px] text-muted-foreground">
                            {format(new Date(item.data), "dd/MM/yy HH:mm", { locale: ptBR })}
                          </p>
                        </div>
                        <Badge
                          variant={item.status === "concluido" ? "default" : "outline"}
                          className={cn("text-[9px] shrink-0", item.status === "concluido" && "bg-emerald-500")}
                        >
                          {item.status === "concluido" ? "✅" : item.status === "em_andamento" ? "🔧" : "🆕"}
                        </Badge>
                      </div>
                    ))
                  )}
                </div>
              </ScrollArea>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
