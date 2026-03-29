import { useState, useEffect, useMemo, useCallback } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { MeasurementReport } from "./MeasurementReport";
import { MeasurementDetailModal } from "./MeasurementDetailModal";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Progress } from "@/components/ui/progress";
import {
  Ruler, AlertTriangle, CheckCircle2, Clock, RefreshCw, Search,
  User, ChevronRight, Loader2, BarChart3, Pencil, Eye, Users, Phone, Mail, Shield, Save,
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
}

const COLUMNS = [
  { id: "novo", label: "Novo", icon: "🆕", color: "hsl(var(--primary))" },
  { id: "em_andamento", label: "Em Andamento", icon: "🔧", color: "hsl(270 70% 55%)" },
  { id: "concluido", label: "Concluído", icon: "✅", color: "hsl(142 71% 45%)" },
];

function normalizeValue(value: string | null | undefined) {
  return String(value || "").trim().toLowerCase();
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

  const findUserByReference = useCallback((reference: string | null | undefined) => {
    if (!reference) return null;
    const normalized = normalizeValue(reference);

    return usuarios.find((user: any) => {
      const authId = normalizeValue(user.auth_user_id);
      const id = normalizeValue(user.id);
      const nome = normalizeValue(user.nome_completo);
      const apelido = normalizeValue(user.apelido);
      const email = normalizeValue(user.email);
      return [id, authId, nome, apelido, email].includes(normalized);
    }) || null;
  }, [usuarios]);

  const fetchRequests = useCallback(async () => {
    const tenantId = getTenantId();
    if (!tenantId) return;

    setLoading(true);

    const [requestsRes, clientsRes, settingsRes, tenantRes] = await Promise.all([
      supabase
        .from("measurement_requests" as any)
        .select("*")
        .eq("tenant_id", tenantId)
        .order("created_at", { ascending: false }),
      supabase
        .from("clients" as any)
        .select("id, vendedor, responsavel_id")
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
    ]);

    if (requestsRes.error) {
      setLoading(false);
      return;
    }

    const clientsById = new Map((clientsRes.data || []).map((client: any) => [client.id, client]));
    const tenantStoreCode = (settingsRes.data as any)?.codigo_loja || (tenantRes.data as any)?.codigo_loja || "";

    const enrichedRequests = ((requestsRes.data as any[]) || []).map((request) => {
      const client = clientsById.get(request.client_id);
      const snapshot = request.client_snapshot || {};

      const sellerUser = findUserByReference(client?.responsavel_id)
        || findUserByReference(client?.vendedor)
        || findUserByReference(request.seller_name)
        || null;

      const createdByIsSystem = ["sistema", "system"].includes(normalizeValue(request.created_by));
      const createdUser = createdByIsSystem
        ? (sellerUser || findUserByReference(client?.vendedor))
        : (findUserByReference(request.created_by) || sellerUser || findUserByReference(client?.vendedor));

      const editedUser = findUserByReference(request.last_edited_by);
      const technicianUser = findUserByReference(request.assigned_to) || findUserByReference(request.technician_name);

      return {
        ...request,
        seller_name: sellerUser?.nome_completo || client?.vendedor || request.seller_name || "—",
        seller_cargo: sellerUser?.cargo_nome || request.seller_cargo || "",
        client_seller_name: sellerUser?.nome_completo || client?.vendedor || request.seller_name || "—",
        client_seller_cargo: sellerUser?.cargo_nome || "",
        technician_name: technicianUser?.nome_completo || request.technician_name || request.assigned_to || "",
        store_code: request.store_code || snapshot.store_code || snapshot.codigo_loja || tenantStoreCode || "—",
        contract_number: request.contract_number || snapshot.contract_number || snapshot.numero_contrato || "",
        contract_url: request.contract_url || snapshot.contract_url || "",
        briefing_url: request.briefing_url || snapshot.briefing_url || "",
        created_by_resolved: createdUser?.nome_completo || client?.vendedor || request.created_by || "—",
        created_by_cargo: createdUser?.cargo_nome || sellerUser?.cargo_nome || request.created_by_cargo || "",
        last_edited_by_resolved: editedUser?.nome_completo || request.last_edited_by || "",
        last_edited_by_cargo: editedUser?.cargo_nome || request.last_edited_by_cargo || "",
      } satisfies MeasurementRequest;
    });

    setRequests(enrichedRequests);
    setLoading(false);
  }, [findUserByReference]);

  useEffect(() => { fetchRequests(); }, [fetchRequests]);

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
    const { error } = await supabase
      .from("measurement_requests" as any)
      .update({
        assigned_to: value,
        status: value ? "em_andamento" : "novo",
        updated_at: new Date().toISOString(),
      } as any)
      .eq("id", id);

    if (error) {
      toast.error("Erro ao atribuir");
      return;
    }

    toast.success(value ? `Atribuído a ${value}!` : "Desvinculado");
    setRequests((prev) => prev.map((request) => request.id === id ? {
      ...request,
      assigned_to: value,
      technician_name: value || "",
      status: value ? "em_andamento" : "novo",
    } : request));

    if (value) {
      const tenantId = getTenantId();
      supabase.from("tracking_messages").insert({
        tenant_id: tenantId,
        tipo: "sistema",
        canal: "interno",
        remetente: "Sistema",
        conteudo: `📐 Solicitação de medida do cliente "${requests.find((request) => request.id === id)?.nome_cliente}" foi atribuída a você.`,
        destinatario: value,
      } as any).then(() => {});
    }
  };

  const stalledCount = useMemo(() => {
    return (columnData.novo || []).filter((request) => differenceInDays(new Date(), new Date(request.created_at)) > 3).length;
  }, [columnData]);

  const tecnicosEProjetistas = useMemo(() =>
    usuarios.filter((user) => user.ativo && user.cargo_nome && (
      user.cargo_nome.toLowerCase().includes("liberador") ||
      user.cargo_nome.toLowerCase().includes("tecnico") ||
      user.cargo_nome.toLowerCase().includes("técnico") ||
      user.cargo_nome.toLowerCase().includes("conferente") ||
      user.cargo_nome.toLowerCase().includes("medidor")
    )),
  [usuarios]);

  return (
    <Tabs defaultValue="kanban" className="space-y-4">
      <TabsList>
        <TabsTrigger value="kanban" className="gap-1.5"><Ruler className="h-3.5 w-3.5" />Kanban</TabsTrigger>
        <TabsTrigger value="report" className="gap-1.5"><BarChart3 className="h-3.5 w-3.5" />Relatório</TabsTrigger>
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
                            <Card
                              key={request.id}
                              className={cn(
                                "transition-all",
                                isStalled && "border-destructive/50 bg-destructive/5 animate-pulse-slow",
                                request.status === "concluido" && "border-emerald-500/30 bg-emerald-500/5",
                              )}
                            >
                              <CardContent className="p-3 space-y-2">
                                {isStalled && (
                                  <div className="flex items-center gap-1.5 text-destructive">
                                    <AlertTriangle className="h-3.5 w-3.5" />
                                    <span className="text-[10px] font-semibold">
                                      ⚠️ Parada há {daysOld} dias sem distribuição!
                                    </span>
                                  </div>
                                )}

                                <div className="flex items-start justify-between gap-2">
                                  <div className="min-w-0">
                                    <p className="text-sm font-semibold text-foreground truncate">{request.nome_cliente}</p>
                                    <p className="text-[11px] text-muted-foreground">
                                      {request.ambientes?.length || 0} ambiente(s) • {format(new Date(request.created_at), "dd/MM/yy", { locale: ptBR })}
                                    </p>
                                  </div>
                                  <span className="text-sm font-bold text-emerald-600 whitespace-nowrap">
                                    {formatCurrency(Number(request.valor_venda_avista) || 0)}
                                  </span>
                                </div>

                                <div className="flex items-center gap-1.5">
                                  <Clock className="h-3 w-3 text-muted-foreground" />
                                  <span className={cn(
                                    "text-[10px] font-medium",
                                    daysOld <= 1 ? "text-emerald-600" :
                                    daysOld <= 3 ? "text-amber-600" :
                                    "text-destructive",
                                  )}>
                                    {daysOld === 0 ? "Hoje" : `${daysOld} dia(s)`}
                                  </span>
                                  {request.created_by_resolved && (
                                    <>
                                      <span className="text-muted-foreground text-[10px]">•</span>
                                      <span className="text-[10px] text-muted-foreground">por {request.created_by_resolved}</span>
                                    </>
                                  )}
                                </div>

                                {request.last_edited_by_resolved && (
                                  <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground bg-muted/30 rounded px-2 py-0.5">
                                    <Pencil className="h-2.5 w-2.5" />
                                    <span>
                                      Editado por <span className="font-semibold text-foreground">{request.last_edited_by_resolved}</span>
                                      {request.last_edited_by_cargo && <span className="text-primary"> ({request.last_edited_by_cargo})</span>}
                                      {request.last_edited_at && (
                                        <span> • {format(new Date(request.last_edited_at), "dd/MM HH:mm", { locale: ptBR })}</span>
                                      )}
                                    </span>
                                  </div>
                                )}

                                {request.ambientes && request.ambientes.length > 0 && (
                                  <div className="space-y-1">
                                    {request.ambientes.slice(0, 3).map((environment: any, index: number) => (
                                      <div key={index} className="flex items-center justify-between text-[10px] bg-muted/30 rounded px-2 py-1">
                                        <span className="truncate flex-1">{environment.name || `Ambiente ${index + 1}`}</span>
                                        <span className="text-muted-foreground ml-2">{formatCurrency(environment.value || 0)}</span>
                                      </div>
                                    ))}
                                    {request.ambientes.length > 3 && (
                                      <span className="text-[10px] text-muted-foreground">+{request.ambientes.length - 3} mais...</span>
                                    )}
                                  </div>
                                )}

                                <Button
                                  variant="outline"
                                  size="sm"
                                  className="w-full h-7 text-[11px] gap-1.5"
                                  onClick={() => setDetailRequest(request)}
                                >
                                  <Eye className="h-3 w-3" /> Ver Detalhes
                                </Button>

                                <Separator />

                                <div className="space-y-1.5">
                                  <div className="flex items-center gap-2">
                                    <User className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                                    <Select
                                      value={request.assigned_to || "__none__"}
                                      onValueChange={(value) => handleAssign(request.id, value)}
                                    >
                                      <SelectTrigger className="h-7 text-[11px] flex-1">
                                        <SelectValue>{request.technician_name || request.assigned_to || "Atribuir técnico"}</SelectValue>
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
                                  </div>

                                  {request.status !== "novo" && (
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
                                  )}
                                </div>
                              </CardContent>
                            </Card>
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

      <MeasurementDetailModal
        open={!!detailRequest}
        onOpenChange={(open) => !open && setDetailRequest(null)}
        request={detailRequest}
      />
    </Tabs>
  );
}
