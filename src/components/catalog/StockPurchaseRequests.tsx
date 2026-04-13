/**
 * StockPurchaseRequests — Internal notifications page for stock purchase requests
 * Shows auto-generated purchase requests with filters by date, status, and product
 */
import { useState, useEffect, useCallback, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  ShoppingCart, Search, CalendarIcon, Package, User, FileText,
  CheckCircle2, Clock, XCircle, RefreshCw, AlertTriangle, Filter,
} from "lucide-react";
import { supabase } from "@/lib/supabaseClient";
import { getResolvedTenantId } from "@/contexts/TenantContext";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

interface PurchaseRequest {
  id: string;
  title: string;
  message: string;
  type: string;
  created_at: string;
  metadata: {
    client_name?: string;
    contract_number?: string;
    seller_name?: string;
    date?: string;
    status?: string;
    items?: Array<{
      product_id: string;
      internal_code: string;
      name: string;
      quantity_needed: number;
    }>;
  } | null;
}

type StatusFilter = "all" | "pendente" | "em_andamento" | "concluido" | "cancelado";

const STATUS_CONFIG: Record<string, { label: string; icon: typeof Clock; className: string }> = {
  pendente: { label: "Pendente", icon: Clock, className: "text-amber-600 bg-amber-100 dark:bg-amber-900/30 dark:text-amber-400" },
  em_andamento: { label: "Em Andamento", icon: RefreshCw, className: "text-blue-600 bg-blue-100 dark:bg-blue-900/30 dark:text-blue-400" },
  concluido: { label: "Concluído", icon: CheckCircle2, className: "text-emerald-600 bg-emerald-100 dark:bg-emerald-900/30 dark:text-emerald-400" },
  cancelado: { label: "Cancelado", icon: XCircle, className: "text-destructive bg-destructive/10" },
};

export function StockPurchaseRequests() {
  const [requests, setRequests] = useState<PurchaseRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [dateFrom, setDateFrom] = useState<Date | undefined>(undefined);
  const [dateTo, setDateTo] = useState<Date | undefined>(undefined);

  const loadRequests = useCallback(async () => {
    setLoading(true);
    const tenantId = await getResolvedTenantId();
    if (!tenantId) { setLoading(false); return; }

    let query = supabase
      .from("notifications" as any)
      .select("*")
      .eq("tenant_id", tenantId)
      .eq("type", "stock_purchase_request")
      .order("created_at", { ascending: false })
      .limit(200);

    if (dateFrom) {
      query = query.gte("created_at", format(dateFrom, "yyyy-MM-dd") + "T00:00:00");
    }
    if (dateTo) {
      query = query.lte("created_at", format(dateTo, "yyyy-MM-dd") + "T23:59:59");
    }

    const { data, error } = await query;
    if (error) {
      console.warn("[StockPurchaseRequests] Error loading:", error.message);
      toast.error("Erro ao carregar solicitações de compra");
    }
    setRequests((data as any[] || []).map(r => ({
      ...r,
      metadata: r.metadata ? (typeof r.metadata === "string" ? JSON.parse(r.metadata) : r.metadata) : null,
    })));
    setLoading(false);
  }, [dateFrom, dateTo]);

  useEffect(() => { loadRequests(); }, [loadRequests]);

  const updateStatus = useCallback(async (id: string, newStatus: string) => {
    const { error } = await supabase
      .from("notifications" as any)
      .update({ metadata: supabase.rpc ? undefined : undefined } as any)
      .eq("id", id);

    // Update metadata.status in the notification
    const request = requests.find(r => r.id === id);
    if (request) {
      const updatedMetadata = { ...(request.metadata || {}), status: newStatus };
      await supabase
        .from("notifications" as any)
        .update({ metadata: updatedMetadata } as any)
        .eq("id", id);

      setRequests(prev => prev.map(r =>
        r.id === id ? { ...r, metadata: { ...r.metadata, status: newStatus } as any } : r
      ));
      toast.success(`Status atualizado para "${STATUS_CONFIG[newStatus]?.label || newStatus}"`);
    }
  }, [requests]);

  const filtered = useMemo(() => {
    return requests.filter(r => {
      // Status filter
      const status = r.metadata?.status || "pendente";
      if (statusFilter !== "all" && status !== statusFilter) return false;

      // Search filter
      if (search) {
        const s = search.toLowerCase();
        const matchesClient = r.metadata?.client_name?.toLowerCase().includes(s);
        const matchesContract = r.metadata?.contract_number?.toLowerCase().includes(s);
        const matchesSeller = r.metadata?.seller_name?.toLowerCase().includes(s);
        const matchesProduct = r.metadata?.items?.some(
          i => i.name.toLowerCase().includes(s) || i.internal_code.toLowerCase().includes(s)
        );
        if (!matchesClient && !matchesContract && !matchesSeller && !matchesProduct) return false;
      }

      return true;
    });
  }, [requests, statusFilter, search]);

  // Stats
  const stats = useMemo(() => {
    const counts = { pendente: 0, em_andamento: 0, concluido: 0, cancelado: 0, total: requests.length };
    requests.forEach(r => {
      const status = (r.metadata?.status || "pendente") as keyof typeof counts;
      if (status in counts) counts[status]++;
    });
    return counts;
  }, [requests]);

  const clearFilters = () => {
    setSearch("");
    setStatusFilter("all");
    setDateFrom(undefined);
    setDateTo(undefined);
  };

  const hasActiveFilters = search || statusFilter !== "all" || dateFrom || dateTo;

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h2 className="text-lg font-semibold flex items-center gap-2">
          <ShoppingCart className="h-5 w-5 text-primary" />
          Solicitações de Compra de Estoque
        </h2>
        <Button variant="outline" size="sm" className="gap-1.5" onClick={loadRequests}>
          <RefreshCw className="h-3.5 w-3.5" />
          Atualizar
        </Button>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { key: "pendente" as const, count: stats.pendente },
          { key: "em_andamento" as const, count: stats.em_andamento },
          { key: "concluido" as const, count: stats.concluido },
          { key: "cancelado" as const, count: stats.cancelado },
        ].map(({ key, count }) => {
          const cfg = STATUS_CONFIG[key];
          const Icon = cfg.icon;
          return (
            <Card
              key={key}
              className={cn(
                "cursor-pointer transition-all hover:shadow-md",
                statusFilter === key && "ring-2 ring-primary"
              )}
              onClick={() => setStatusFilter(statusFilter === key ? "all" : key)}
            >
              <CardContent className="p-3 flex items-center gap-3">
                <div className={cn("p-2 rounded-lg", cfg.className)}>
                  <Icon className="h-4 w-4" />
                </div>
                <div>
                  <p className="text-2xl font-bold">{count}</p>
                  <p className="text-xs text-muted-foreground">{cfg.label}</p>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="p-3">
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative flex-1 min-w-[200px]">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
              <Input
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Buscar por cliente, contrato, vendedor ou produto..."
                className="pl-8 h-8 text-xs"
              />
            </div>

            <Select value={statusFilter} onValueChange={v => setStatusFilter(v as StatusFilter)}>
              <SelectTrigger className="w-[140px] h-8 text-xs">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos</SelectItem>
                <SelectItem value="pendente">Pendente</SelectItem>
                <SelectItem value="em_andamento">Em Andamento</SelectItem>
                <SelectItem value="concluido">Concluído</SelectItem>
                <SelectItem value="cancelado">Cancelado</SelectItem>
              </SelectContent>
            </Select>

            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" size="sm" className={cn("h-8 text-xs gap-1.5", dateFrom && "text-primary")}>
                  <CalendarIcon className="h-3.5 w-3.5" />
                  {dateFrom ? format(dateFrom, "dd/MM/yy") : "De"}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar
                  mode="single"
                  selected={dateFrom}
                  onSelect={setDateFrom}
                  locale={ptBR}
                  className={cn("p-3 pointer-events-auto")}
                />
              </PopoverContent>
            </Popover>

            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" size="sm" className={cn("h-8 text-xs gap-1.5", dateTo && "text-primary")}>
                  <CalendarIcon className="h-3.5 w-3.5" />
                  {dateTo ? format(dateTo, "dd/MM/yy") : "Até"}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar
                  mode="single"
                  selected={dateTo}
                  onSelect={setDateTo}
                  locale={ptBR}
                  className={cn("p-3 pointer-events-auto")}
                />
              </PopoverContent>
            </Popover>

            {hasActiveFilters && (
              <Button variant="ghost" size="sm" className="h-8 text-xs gap-1" onClick={clearFilters}>
                <XCircle className="h-3.5 w-3.5" />
                Limpar
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Results */}
      <ScrollArea className="max-h-[calc(100vh-380px)]">
        {loading ? (
          <div className="text-center py-12 text-sm text-muted-foreground">Carregando solicitações...</div>
        ) : filtered.length === 0 ? (
          <Card>
            <CardContent className="flex flex-col items-center gap-3 py-12">
              <ShoppingCart className="h-10 w-10 text-muted-foreground" />
              <p className="text-sm text-muted-foreground text-center">
                {hasActiveFilters
                  ? "Nenhuma solicitação encontrada com os filtros aplicados."
                  : "Nenhuma solicitação de compra registrada. Elas serão geradas automaticamente quando uma venda for fechada com produtos acima do estoque disponível."}
              </p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-3">
            <p className="text-xs text-muted-foreground flex items-center gap-1">
              <Filter className="h-3 w-3" />
              {filtered.length} de {requests.length} solicitação(ões)
            </p>
            {filtered.map(req => {
              const status = req.metadata?.status || "pendente";
              const cfg = STATUS_CONFIG[status] || STATUS_CONFIG.pendente;
              const StatusIcon = cfg.icon;
              const createdDate = new Date(req.created_at);

              return (
                <Card key={req.id} className="hover:shadow-md transition-shadow">
                  <CardContent className="p-4 space-y-3">
                    {/* Header */}
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center gap-2 min-w-0">
                        <div className={cn("p-1.5 rounded-md shrink-0", cfg.className)}>
                          <StatusIcon className="h-3.5 w-3.5" />
                        </div>
                        <div className="min-w-0">
                          <p className="text-sm font-semibold truncate">{req.title}</p>
                          <p className="text-[10px] text-muted-foreground">
                            {format(createdDate, "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}
                          </p>
                        </div>
                      </div>
                      <Badge className={cn("text-[10px] shrink-0", cfg.className)}>
                        {cfg.label}
                      </Badge>
                    </div>

                    {/* Details */}
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-xs">
                      {req.metadata?.client_name && (
                        <div className="flex items-center gap-1.5">
                          <User className="h-3 w-3 text-muted-foreground shrink-0" />
                          <span className="text-muted-foreground">Cliente:</span>
                          <span className="font-medium truncate">{req.metadata.client_name}</span>
                        </div>
                      )}
                      {req.metadata?.contract_number && (
                        <div className="flex items-center gap-1.5">
                          <FileText className="h-3 w-3 text-muted-foreground shrink-0" />
                          <span className="text-muted-foreground">Contrato:</span>
                          <span className="font-medium">{req.metadata.contract_number}</span>
                        </div>
                      )}
                      {req.metadata?.seller_name && (
                        <div className="flex items-center gap-1.5">
                          <User className="h-3 w-3 text-muted-foreground shrink-0" />
                          <span className="text-muted-foreground">Vendedor:</span>
                          <span className="font-medium truncate">{req.metadata.seller_name}</span>
                        </div>
                      )}
                    </div>

                    {/* Product Items */}
                    {req.metadata?.items && req.metadata.items.length > 0 && (
                      <div className="rounded-md border bg-muted/30 p-2 space-y-1.5">
                        <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1">
                          <Package className="h-3 w-3" />
                          Produtos para Compra
                        </p>
                        {req.metadata.items.map((item, i) => (
                          <div key={i} className="flex items-center justify-between text-xs">
                            <div className="flex items-center gap-2 min-w-0">
                              <span className="font-mono text-[10px] text-muted-foreground">{item.internal_code}</span>
                              <span className="truncate">{item.name}</span>
                            </div>
                            <Badge variant="outline" className="text-[10px] shrink-0">
                              {item.quantity_needed} un.
                            </Badge>
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Actions */}
                    <div className="flex items-center gap-2 pt-1 border-t">
                      {status === "pendente" && (
                        <>
                          <Button size="sm" variant="outline" className="h-7 text-xs gap-1" onClick={() => updateStatus(req.id, "em_andamento")}>
                            <RefreshCw className="h-3 w-3" />
                            Iniciar Compra
                          </Button>
                          <Button size="sm" variant="ghost" className="h-7 text-xs gap-1 text-destructive" onClick={() => updateStatus(req.id, "cancelado")}>
                            <XCircle className="h-3 w-3" />
                            Cancelar
                          </Button>
                        </>
                      )}
                      {status === "em_andamento" && (
                        <Button size="sm" variant="default" className="h-7 text-xs gap-1" onClick={() => updateStatus(req.id, "concluido")}>
                          <CheckCircle2 className="h-3 w-3" />
                          Marcar Concluído
                        </Button>
                      )}
                      {(status === "concluido" || status === "cancelado") && (
                        <Button size="sm" variant="ghost" className="h-7 text-xs gap-1" onClick={() => updateStatus(req.id, "pendente")}>
                          <Clock className="h-3 w-3" />
                          Reabrir
                        </Button>
                      )}
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </ScrollArea>
    </div>
  );
}
