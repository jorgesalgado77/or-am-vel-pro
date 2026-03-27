/**
 * Kanban board for measurement requests, visible to "gerente técnico" role.
 * Shows requests in columns: Novo, Em Andamento, Concluído.
 * Alerts when a request stays in "Novo" for more than 3 days.
 */
import { useState, useEffect, useMemo, useCallback } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { MeasurementReport } from "./MeasurementReport";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Ruler, AlertTriangle, CheckCircle2, Clock, RefreshCw, Search,
  User, FileText, ChevronRight, Loader2, BarChart3,
} from "lucide-react";
import { supabase } from "@/lib/supabaseClient";
import { getTenantId } from "@/lib/tenantState";
import { useUsuarios } from "@/hooks/useUsuarios";
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
  status: string;
  created_by: string | null;
  assigned_to: string | null;
  created_at: string;
  updated_at: string;
}

const COLUMNS = [
  { id: "novo", label: "Novo", icon: "🆕", color: "hsl(var(--primary))" },
  { id: "em_andamento", label: "Em Andamento", icon: "🔧", color: "hsl(270 70% 55%)" },
  { id: "concluido", label: "Concluído", icon: "✅", color: "hsl(142 71% 45%)" },
];

export function MeasurementKanban() {
  const [requests, setRequests] = useState<MeasurementRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const { usuarios } = useUsuarios();

  const fetchRequests = useCallback(async () => {
    const tenantId = getTenantId();
    if (!tenantId) return;
    setLoading(true);
    const { data, error } = await supabase
      .from("measurement_requests" as any)
      .select("*")
      .eq("tenant_id", tenantId)
      .order("created_at", { ascending: false });
    if (!error && data) setRequests(data as any[]);
    setLoading(false);
  }, []);

  useEffect(() => { fetchRequests(); }, [fetchRequests]);

  // Realtime subscription
  useEffect(() => {
    const tenantId = getTenantId();
    if (!tenantId) return;
    const channel = supabase
      .channel("measurement-requests-realtime")
      .on("postgres_changes" as any, {
        event: "*", schema: "public", table: "measurement_requests",
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
    const q = search.toLowerCase();
    return requests.filter(r =>
      r.nome_cliente.toLowerCase().includes(q) ||
      (r.assigned_to || "").toLowerCase().includes(q) ||
      (r.created_by || "").toLowerCase().includes(q)
    );
  }, [requests, search]);

  const columnData = useMemo(() => {
    const map: Record<string, MeasurementRequest[]> = {};
    COLUMNS.forEach(c => { map[c.id] = []; });
    filtered.forEach(r => {
      if (map[r.status]) map[r.status].push(r);
      else map["novo"].push(r);
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
      setRequests(prev => prev.map(r => r.id === id ? { ...r, status: newStatus } : r));
    }
  };

  const handleAssign = async (id: string, assignedTo: string) => {
    const val = assignedTo === "__none__" ? null : assignedTo;
    const { error } = await supabase
      .from("measurement_requests" as any)
      .update({
        assigned_to: val,
        status: val ? "em_andamento" : "novo",
        updated_at: new Date().toISOString(),
      } as any)
      .eq("id", id);
    if (error) toast.error("Erro ao atribuir");
    else {
      toast.success(val ? `Atribuído a ${val}!` : "Desvinculado");
      setRequests(prev => prev.map(r => r.id === id ? {
        ...r, assigned_to: val, status: val ? "em_andamento" : "novo",
      } : r));

      // Send notification
      if (val) {
        const tenantId = getTenantId();
        supabase.from("tracking_messages").insert({
          tenant_id: tenantId, tipo: "sistema", canal: "interno",
          remetente: "Sistema",
          conteudo: `📐 Solicitação de medida do cliente "${requests.find(r => r.id === id)?.nome_cliente}" foi atribuída a você.`,
          destinatario: val,
        } as any).then(() => {});
      }
    }
  };

  // Count stalled (>3 days in novo)
  const stalledCount = useMemo(() => {
    return (columnData["novo"] || []).filter(r => differenceInDays(new Date(), new Date(r.created_at)) > 3).length;
  }, [columnData]);

  const tecnicosEProjetistas = useMemo(() =>
    usuarios.filter(u => u.ativo && u.cargo_nome && (
      u.cargo_nome.toLowerCase().includes("projetista") ||
      u.cargo_nome.toLowerCase().includes("tecnico") ||
      u.cargo_nome.toLowerCase().includes("técnico") ||
      u.cargo_nome.toLowerCase().includes("medidor")
    )), [usuarios]
  );

  return (
    <div className="space-y-4">
      {/* Stalled alert */}
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

      {/* Search + refresh */}
      <div className="flex items-center gap-3">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar cliente..." className="pl-9" />
        </div>
        <Button variant="outline" size="sm" onClick={fetchRequests} className="gap-1.5">
          <RefreshCw className="h-3.5 w-3.5" />Atualizar
        </Button>
      </div>

      {/* Kanban columns */}
      {loading ? (
        <div className="flex items-center justify-center py-16 text-muted-foreground gap-2">
          <Loader2 className="h-5 w-5 animate-spin" />Carregando...
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {COLUMNS.map(col => (
            <div key={col.id} className="flex flex-col">
              {/* Column header */}
              <div className="flex items-center gap-2 mb-3 px-1">
                <span className="text-base">{col.icon}</span>
                <span className="text-sm font-semibold text-foreground">{col.label}</span>
                <Badge variant="outline" className="ml-auto text-[10px] h-5 px-1.5">
                  {columnData[col.id]?.length || 0}
                </Badge>
              </div>

              {/* Cards */}
              <ScrollArea className="flex-1" style={{ maxHeight: "calc(100vh - 320px)" }}>
                <div className="space-y-2 pr-2">
                  {(columnData[col.id] || []).length === 0 ? (
                    <div className="text-center text-xs text-muted-foreground py-8 bg-muted/20 rounded-lg border border-dashed">
                      Nenhuma solicitação
                    </div>
                  ) : (
                    (columnData[col.id] || []).map(req => {
                      const daysOld = differenceInDays(new Date(), new Date(req.created_at));
                      const isStalled = req.status === "novo" && daysOld > 3;

                      return (
                        <Card key={req.id} className={cn(
                          "transition-all",
                          isStalled && "border-destructive/50 bg-destructive/5 animate-pulse-slow",
                          req.status === "concluido" && "border-emerald-500/30 bg-emerald-500/5",
                        )}>
                          <CardContent className="p-3 space-y-2">
                            {/* Stalled warning */}
                            {isStalled && (
                              <div className="flex items-center gap-1.5 text-destructive">
                                <AlertTriangle className="h-3.5 w-3.5" />
                                <span className="text-[10px] font-semibold">
                                  ⚠️ Parada há {daysOld} dias sem distribuição!
                                </span>
                              </div>
                            )}

                            {/* Client name + value */}
                            <div className="flex items-start justify-between gap-2">
                              <div className="min-w-0">
                                <p className="text-sm font-semibold text-foreground truncate">{req.nome_cliente}</p>
                                <p className="text-[11px] text-muted-foreground">
                                  {req.ambientes?.length || 0} ambiente(s) • {format(new Date(req.created_at), "dd/MM/yy", { locale: ptBR })}
                                </p>
                              </div>
                              <span className="text-sm font-bold text-emerald-600 whitespace-nowrap">
                                {formatCurrency(Number(req.valor_venda_avista) || 0)}
                              </span>
                            </div>

                            {/* Time in column */}
                            <div className="flex items-center gap-1.5">
                              <Clock className="h-3 w-3 text-muted-foreground" />
                              <span className={cn(
                                "text-[10px] font-medium",
                                daysOld <= 1 ? "text-emerald-600" :
                                daysOld <= 3 ? "text-amber-600" :
                                "text-destructive"
                              )}>
                                {daysOld === 0 ? "Hoje" : `${daysOld} dia(s)`}
                              </span>
                              {req.created_by && (
                                <>
                                  <span className="text-muted-foreground text-[10px]">•</span>
                                  <span className="text-[10px] text-muted-foreground">por {req.created_by}</span>
                                </>
                              )}
                            </div>

                            {/* Environments preview */}
                            {req.ambientes && req.ambientes.length > 0 && (
                              <div className="space-y-1">
                                {req.ambientes.slice(0, 3).map((amb: any, i: number) => (
                                  <div key={i} className="flex items-center justify-between text-[10px] bg-muted/30 rounded px-2 py-1">
                                    <span className="truncate flex-1">{amb.name || `Ambiente ${i + 1}`}</span>
                                    <span className="text-muted-foreground ml-2">{formatCurrency(amb.value || 0)}</span>
                                  </div>
                                ))}
                                {req.ambientes.length > 3 && (
                                  <span className="text-[10px] text-muted-foreground">+{req.ambientes.length - 3} mais...</span>
                                )}
                              </div>
                            )}

                            <Separator />

                            {/* Assign + status controls */}
                            <div className="space-y-1.5">
                              <div className="flex items-center gap-2">
                                <User className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                                <Select
                                  value={req.assigned_to || "__none__"}
                                  onValueChange={(v) => handleAssign(req.id, v)}
                                >
                                  <SelectTrigger className="h-7 text-[11px] flex-1">
                                    <SelectValue>{req.assigned_to || "Atribuir técnico"}</SelectValue>
                                  </SelectTrigger>
                                  <SelectContent>
                                    <SelectItem value="__none__">Sem responsável</SelectItem>
                                    {tecnicosEProjetistas.map(u => (
                                      <SelectItem key={u.id} value={u.nome_completo}>
                                        {u.nome_completo} ({u.cargo_nome})
                                      </SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                              </div>

                              {req.status !== "novo" && (
                                <div className="flex items-center gap-2">
                                  <ChevronRight className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                                  <Select value={req.status} onValueChange={(v) => handleStatusChange(req.id, v)}>
                                    <SelectTrigger className="h-7 text-[11px] flex-1">
                                      <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                      {COLUMNS.map(c => (
                                        <SelectItem key={c.id} value={c.id}>{c.icon} {c.label}</SelectItem>
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

      {/* Summary */}
      <div className="flex items-center gap-6 px-2 py-3 bg-muted/30 rounded-lg border">
        <div className="flex items-center gap-2">
          <Ruler className="h-4 w-4 text-primary" />
          <span className="text-sm font-medium">Total: {requests.length}</span>
        </div>
        <Separator orientation="vertical" className="h-6" />
        <div className="flex items-center gap-2">
          <span className="text-sm text-muted-foreground">Pendentes: {(columnData["novo"]?.length || 0) + (columnData["em_andamento"]?.length || 0)}</span>
        </div>
        <Separator orientation="vertical" className="h-6" />
        <div className="flex items-center gap-2">
          <CheckCircle2 className="h-4 w-4 text-emerald-500" />
          <span className="text-sm text-muted-foreground">Concluídas: {columnData["concluido"]?.length || 0}</span>
        </div>
      </div>
    </div>
  );
}
