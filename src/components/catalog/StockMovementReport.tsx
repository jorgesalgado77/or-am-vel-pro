/**
 * StockMovementReport — Shows stock movement history with filters
 */
import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/lib/supabaseClient";
import { getResolvedTenantId } from "@/contexts/TenantContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ArrowDownCircle, ArrowUpCircle, RefreshCw, Search, Loader2, SlidersHorizontal, PackagePlus, PackageMinus, ArrowRightLeft } from "lucide-react";
import { format, subDays } from "date-fns";
import { ptBR } from "date-fns/locale";
import { cn } from "@/lib/utils";

interface StockMovement {
  id: string;
  product_id: string;
  product_name: string;
  product_code: string;
  user_name: string;
  type: "entrada" | "saida" | "ajuste";
  quantity: number;
  previous_quantity: number;
  new_quantity: number;
  reason: string | null;
  reference_id: string | null;
  created_at: string;
}

const TYPE_CONFIG = {
  entrada: { label: "Entrada", icon: PackagePlus, color: "text-emerald-600", bg: "bg-emerald-500/10", badge: "border-emerald-500/30 text-emerald-600" },
  saida: { label: "Saída", icon: PackageMinus, color: "text-destructive", bg: "bg-destructive/10", badge: "border-destructive/30 text-destructive" },
  ajuste: { label: "Ajuste", icon: ArrowRightLeft, color: "text-primary", bg: "bg-primary/10", badge: "border-primary/30 text-primary" },
};

export function StockMovementReport() {
  const [movements, setMovements] = useState<StockMovement[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState("_all");
  const [periodFilter, setPeriodFilter] = useState("30");
  const [tableExists, setTableExists] = useState(true);

  // Summary stats
  const totalEntradas = movements.filter(m => m.type === "entrada").reduce((s, m) => s + m.quantity, 0);
  const totalSaidas = movements.filter(m => m.type === "saida").reduce((s, m) => s + m.quantity, 0);
  const totalAjustes = movements.filter(m => m.type === "ajuste").length;

  const fetchMovements = useCallback(async () => {
    const tenantId = await getResolvedTenantId();
    if (!tenantId) { setLoading(false); return; }

    setLoading(true);
    try {
      const since = subDays(new Date(), Number(periodFilter)).toISOString();

      const { data, error } = await supabase
        .from("stock_movements" as any)
        .select("id, product_id, user_id, type, quantity, previous_quantity, new_quantity, reason, reference_id, created_at")
        .eq("tenant_id", tenantId)
        .gte("created_at", since)
        .order("created_at", { ascending: false })
        .limit(200);

      if (error) {
        if (error.message?.includes("does not exist") || error.code === "42P01") {
          setTableExists(false);
          setMovements([]);
          setLoading(false);
          return;
        }
        console.warn("[StockMovementReport] Error:", error);
        setMovements([]);
        setLoading(false);
        return;
      }

      const movs = (data as any[]) || [];
      if (movs.length === 0) {
        setMovements([]);
        setLoading(false);
        return;
      }

      // Fetch product and user names
      const productIds = [...new Set(movs.map(m => m.product_id))];
      const userIds = [...new Set(movs.map(m => m.user_id).filter(Boolean))];

      const [productsRes, usersRes] = await Promise.all([
        supabase.from("products" as any).select("id, name, internal_code").in("id", productIds),
        userIds.length > 0
          ? supabase.from("usuarios" as any).select("id, nome_completo, apelido").in("id", userIds)
          : Promise.resolve({ data: [] }),
      ]);

      const productMap: Record<string, { name: string; code: string }> = {};
      ((productsRes.data as any[]) || []).forEach(p => {
        productMap[p.id] = { name: p.name, code: p.internal_code };
      });

      const userMap: Record<string, string> = {};
      ((usersRes.data as any[]) || []).forEach(u => {
        userMap[u.id] = u.apelido || u.nome_completo || "—";
      });

      const enriched: StockMovement[] = movs.map(m => ({
        ...m,
        product_name: productMap[m.product_id]?.name || "Produto removido",
        product_code: productMap[m.product_id]?.code || "—",
        user_name: m.user_id ? (userMap[m.user_id] || "—") : "Sistema",
      }));

      setMovements(enriched);
    } catch (err) {
      console.warn("[StockMovementReport] Error:", err);
      setMovements([]);
    } finally {
      setLoading(false);
    }
  }, [periodFilter]);

  useEffect(() => {
    fetchMovements();
  }, [fetchMovements]);

  const filtered = movements.filter(m => {
    if (typeFilter !== "_all" && m.type !== typeFilter) return false;
    if (search) {
      const s = search.toLowerCase();
      return m.product_name.toLowerCase().includes(s) || m.product_code.toLowerCase().includes(s) || m.user_name.toLowerCase().includes(s);
    }
    return true;
  });

  if (!tableExists) {
    return (
      <Card>
        <CardContent className="py-12 text-center">
          <SlidersHorizontal className="h-10 w-10 mx-auto text-muted-foreground/40 mb-3" />
          <p className="text-sm font-medium text-foreground mb-1">Tabela de movimentações não encontrada</p>
          <p className="text-xs text-muted-foreground max-w-md mx-auto">
            Execute o script SQL de criação da tabela <code className="px-1 py-0.5 bg-muted rounded text-[10px]">stock_movements</code> no Supabase para ativar este relatório.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {/* Summary cards */}
      <div className="grid grid-cols-3 gap-3">
        <Card>
          <CardContent className="p-3 text-center">
            <ArrowDownCircle className="h-5 w-5 mx-auto text-emerald-600 mb-1" />
            <p className="text-xs text-muted-foreground">Entradas</p>
            <p className="text-lg font-bold text-emerald-600">+{totalEntradas}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3 text-center">
            <ArrowUpCircle className="h-5 w-5 mx-auto text-destructive mb-1" />
            <p className="text-xs text-muted-foreground">Saídas</p>
            <p className="text-lg font-bold text-destructive">-{totalSaidas}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3 text-center">
            <ArrowRightLeft className="h-5 w-5 mx-auto text-primary mb-1" />
            <p className="text-xs text-muted-foreground">Ajustes</p>
            <p className="text-lg font-bold text-primary">{totalAjustes}</p>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[180px]">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            placeholder="Buscar produto ou usuário..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="pl-8 h-9 text-xs"
          />
        </div>
        <Select value={typeFilter} onValueChange={setTypeFilter}>
          <SelectTrigger className="h-9 w-[130px] text-xs"><SelectValue placeholder="Tipo" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="_all">Todos</SelectItem>
            <SelectItem value="entrada">Entradas</SelectItem>
            <SelectItem value="saida">Saídas</SelectItem>
            <SelectItem value="ajuste">Ajustes</SelectItem>
          </SelectContent>
        </Select>
        <Select value={periodFilter} onValueChange={setPeriodFilter}>
          <SelectTrigger className="h-9 w-[130px] text-xs"><SelectValue placeholder="Período" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="7">7 dias</SelectItem>
            <SelectItem value="30">30 dias</SelectItem>
            <SelectItem value="90">90 dias</SelectItem>
            <SelectItem value="365">1 ano</SelectItem>
          </SelectContent>
        </Select>
        <Button variant="outline" size="sm" className="h-9 gap-1.5" onClick={() => fetchMovements()} disabled={loading}>
          <RefreshCw className={cn("h-3.5 w-3.5", loading && "animate-spin")} />
        </Button>
      </div>

      {/* Table */}
      <Card>
        <CardContent className="p-0">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : filtered.length === 0 ? (
            <div className="text-center py-12 text-sm text-muted-foreground">
              Nenhuma movimentação encontrada no período selecionado.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-xs">Data</TableHead>
                    <TableHead className="text-xs">Tipo</TableHead>
                    <TableHead className="text-xs">Produto</TableHead>
                    <TableHead className="text-xs text-right">Qtd</TableHead>
                    <TableHead className="text-xs text-right">Anterior</TableHead>
                    <TableHead className="text-xs text-right">Novo</TableHead>
                    <TableHead className="text-xs">Motivo</TableHead>
                    <TableHead className="text-xs">Usuário</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map(m => {
                    const cfg = TYPE_CONFIG[m.type];
                    const Icon = cfg.icon;
                    return (
                      <TableRow key={m.id}>
                        <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                          {format(new Date(m.created_at), "dd/MM/yy HH:mm", { locale: ptBR })}
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" className={cn("text-[10px] gap-1", cfg.badge)}>
                            <Icon className="h-3 w-3" />
                            {cfg.label}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-xs">
                          <div className="font-medium">{m.product_name}</div>
                          <div className="text-[10px] text-muted-foreground font-mono">{m.product_code}</div>
                        </TableCell>
                        <TableCell className={cn("text-xs text-right font-semibold", cfg.color)}>
                          {m.type === "saida" ? `-${m.quantity}` : `+${m.quantity}`}
                        </TableCell>
                        <TableCell className="text-xs text-right text-muted-foreground">{m.previous_quantity}</TableCell>
                        <TableCell className="text-xs text-right font-medium">{m.new_quantity}</TableCell>
                        <TableCell className="text-xs text-muted-foreground max-w-[150px] truncate">{m.reason || "—"}</TableCell>
                        <TableCell className="text-xs text-muted-foreground">{m.user_name}</TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <p className="text-[10px] text-muted-foreground text-center">
        Exibindo {filtered.length} de {movements.length} movimentação(ões) nos últimos {periodFilter} dias
      </p>
    </div>
  );
}
