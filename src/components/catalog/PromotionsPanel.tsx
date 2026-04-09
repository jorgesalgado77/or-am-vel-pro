/**
 * PromotionsPanel — Overview of all product promotions with status, validity & expiration alerts
 */
import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/lib/supabaseClient";
import { getTenantId } from "@/lib/tenantState";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Tag, Clock, AlertTriangle, CheckCircle, XCircle, Search,
  RefreshCw, Trash2, TrendingDown, Calendar, Flame,
} from "lucide-react";
import { toast } from "sonner";
import { differenceInDays, differenceInHours, format } from "date-fns";
import { ptBR } from "date-fns/locale";

function formatBRL(v: number) {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

interface PromoRow {
  id: string;
  product_id: string;
  desconto_percentual: number;
  valor_original: number;
  valor_promocional: number;
  validade: string;
  condicoes_pagamento: string[];
  ativo: boolean;
  created_at: string;
  product_name?: string;
  product_code?: string;
}

type StatusFilter = "all" | "active" | "expiring" | "expired" | "inactive";

export function PromotionsPanel() {
  const [promos, setPromos] = useState<PromoRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");

  const loadPromos = useCallback(async () => {
    const tenantId = getTenantId();
    if (!tenantId) return;
    setLoading(true);

    const { data, error } = await supabase
      .from("product_promotions" as any)
      .select("*")
      .eq("tenant_id", tenantId)
      .order("created_at", { ascending: false });

    if (error) {
      toast.error("Erro ao carregar promoções");
      setLoading(false);
      return;
    }

    // Load product names
    const ids = [...new Set((data as any[]).map((p: any) => p.product_id))];
    let productMap: Record<string, { name: string; code: string }> = {};
    if (ids.length > 0) {
      const { data: prods } = await supabase
        .from("products" as any)
        .select("id, name, internal_code")
        .in("id", ids);
      if (prods) {
        (prods as any[]).forEach((p: any) => {
          productMap[p.id] = { name: p.name, code: p.internal_code };
        });
      }
    }

    setPromos(
      (data as any[]).map((p: any) => ({
        ...p,
        desconto_percentual: Number(p.desconto_percentual),
        valor_original: Number(p.valor_original),
        valor_promocional: Number(p.valor_promocional),
        product_name: productMap[p.product_id]?.name || "Produto removido",
        product_code: productMap[p.product_id]?.code || "—",
      }))
    );
    setLoading(false);
  }, []);

  useEffect(() => { loadPromos(); }, [loadPromos]);

  const getStatus = (p: PromoRow) => {
    const now = new Date();
    const validade = new Date(p.validade);
    if (!p.ativo) return "inactive";
    if (validade < now) return "expired";
    const days = differenceInDays(validade, now);
    if (days <= 2) return "expiring";
    return "active";
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "active":
        return <Badge className="bg-green-500/15 text-green-700 border-green-300 gap-1"><CheckCircle className="h-3 w-3" /> Ativa</Badge>;
      case "expiring":
        return <Badge className="bg-amber-500/15 text-amber-700 border-amber-300 gap-1 animate-pulse"><AlertTriangle className="h-3 w-3" /> Expirando</Badge>;
      case "expired":
        return <Badge className="bg-red-500/15 text-red-700 border-red-300 gap-1"><XCircle className="h-3 w-3" /> Expirada</Badge>;
      case "inactive":
        return <Badge variant="outline" className="gap-1 text-muted-foreground"><XCircle className="h-3 w-3" /> Inativa</Badge>;
      default:
        return null;
    }
  };

  const getRemainingText = (p: PromoRow) => {
    const now = new Date();
    const validade = new Date(p.validade);
    if (!p.ativo || validade < now) return "—";
    const days = differenceInDays(validade, now);
    if (days === 0) {
      const hours = differenceInHours(validade, now);
      return `${hours}h restantes`;
    }
    return `${days} dia${days !== 1 ? "s" : ""} restante${days !== 1 ? "s" : ""}`;
  };

  const handleDeactivate = async (id: string) => {
    if (!confirm("Desativar esta promoção?")) return;
    const { error } = await supabase
      .from("product_promotions" as any)
      .update({ ativo: false } as any)
      .eq("id", id);
    if (error) toast.error("Erro ao desativar");
    else {
      toast.success("Promoção desativada");
      loadPromos();
    }
  };

  const handleReactivate = async (id: string) => {
    const { error } = await supabase
      .from("product_promotions" as any)
      .update({ ativo: true } as any)
      .eq("id", id);
    if (error) toast.error("Erro ao reativar");
    else {
      toast.success("Promoção reativada");
      loadPromos();
    }
  };

  // Filter
  const filtered = promos.filter(p => {
    const status = getStatus(p);
    if (statusFilter !== "all" && status !== statusFilter) return false;
    if (search) {
      const q = search.toLowerCase();
      return (
        (p.product_name || "").toLowerCase().includes(q) ||
        (p.product_code || "").toLowerCase().includes(q)
      );
    }
    return true;
  });

  // KPIs
  const activeCount = promos.filter(p => getStatus(p) === "active").length;
  const expiringCount = promos.filter(p => getStatus(p) === "expiring").length;
  const expiredCount = promos.filter(p => getStatus(p) === "expired").length;
  const avgDiscount = promos.length > 0
    ? promos.filter(p => p.ativo).reduce((s, p) => s + p.desconto_percentual, 0) / Math.max(promos.filter(p => p.ativo).length, 1)
    : 0;

  return (
    <div className="space-y-4">
      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card className="cursor-pointer hover:shadow-md transition-shadow" onClick={() => setStatusFilter("active")}>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="p-2 rounded-lg bg-green-500/10">
              <CheckCircle className="h-5 w-5 text-green-600" />
            </div>
            <div>
              <p className="text-2xl font-bold">{activeCount}</p>
              <p className="text-xs text-muted-foreground">Ativas</p>
            </div>
          </CardContent>
        </Card>
        <Card className="cursor-pointer hover:shadow-md transition-shadow" onClick={() => setStatusFilter("expiring")}>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="p-2 rounded-lg bg-amber-500/10">
              <AlertTriangle className="h-5 w-5 text-amber-600" />
            </div>
            <div>
              <p className="text-2xl font-bold">{expiringCount}</p>
              <p className="text-xs text-muted-foreground">Expirando</p>
            </div>
          </CardContent>
        </Card>
        <Card className="cursor-pointer hover:shadow-md transition-shadow" onClick={() => setStatusFilter("expired")}>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="p-2 rounded-lg bg-red-500/10">
              <XCircle className="h-5 w-5 text-red-600" />
            </div>
            <div>
              <p className="text-2xl font-bold">{expiredCount}</p>
              <p className="text-xs text-muted-foreground">Expiradas</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="p-2 rounded-lg bg-primary/10">
              <TrendingDown className="h-5 w-5 text-primary" />
            </div>
            <div>
              <p className="text-2xl font-bold">{avgDiscount.toFixed(1)}%</p>
              <p className="text-xs text-muted-foreground">Desconto Médio</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
            <CardTitle className="text-lg flex items-center gap-2">
              <Flame className="h-5 w-5 text-orange-500" />
              Gestão de Promoções
            </CardTitle>
            <div className="flex items-center gap-2 flex-wrap">
              <div className="relative">
                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Buscar produto..."
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  className="pl-8 w-48"
                />
              </div>
              <Select value={statusFilter} onValueChange={v => setStatusFilter(v as StatusFilter)}>
                <SelectTrigger className="w-36">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos</SelectItem>
                  <SelectItem value="active">Ativas</SelectItem>
                  <SelectItem value="expiring">Expirando</SelectItem>
                  <SelectItem value="expired">Expiradas</SelectItem>
                  <SelectItem value="inactive">Inativas</SelectItem>
                </SelectContent>
              </Select>
              <Button variant="outline" size="sm" onClick={loadPromos} className="gap-1.5">
                <RefreshCw className="h-3.5 w-3.5" /> Atualizar
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <RefreshCw className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : filtered.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <Tag className="h-10 w-10 mx-auto mb-2 opacity-30" />
              <p>Nenhuma promoção encontrada</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Produto</TableHead>
                  <TableHead className="text-center">Desconto</TableHead>
                  <TableHead className="text-right">Original</TableHead>
                  <TableHead className="text-right">Promocional</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Validade</TableHead>
                  <TableHead>Restante</TableHead>
                  <TableHead className="text-center">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map(p => {
                  const status = getStatus(p);
                  return (
                    <TableRow key={p.id} className={status === "expiring" ? "bg-amber-500/5" : status === "expired" ? "bg-red-500/5 opacity-70" : ""}>
                      <TableCell>
                        <div>
                          <p className="font-medium text-sm">{p.product_name}</p>
                          <p className="text-xs text-muted-foreground">{p.product_code}</p>
                        </div>
                      </TableCell>
                      <TableCell className="text-center">
                        <Badge className="bg-red-500/15 text-red-700 border-red-300">
                          -{p.desconto_percentual}%
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right text-sm line-through text-muted-foreground">
                        {formatBRL(p.valor_original)}
                      </TableCell>
                      <TableCell className="text-right text-sm font-semibold text-green-700">
                        {formatBRL(p.valor_promocional)}
                      </TableCell>
                      <TableCell>{getStatusBadge(status)}</TableCell>
                      <TableCell className="text-sm">
                        <div className="flex items-center gap-1.5">
                          <Calendar className="h-3.5 w-3.5 text-muted-foreground" />
                          {format(new Date(p.validade), "dd/MM/yyyy HH:mm", { locale: ptBR })}
                        </div>
                      </TableCell>
                      <TableCell>
                        <span className={`text-sm font-medium ${
                          status === "expiring" ? "text-amber-600" : status === "expired" ? "text-red-500" : ""
                        }`}>
                          {getRemainingText(p)}
                        </span>
                      </TableCell>
                      <TableCell className="text-center">
                        {status === "active" || status === "expiring" ? (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleDeactivate(p.id)}
                            className="text-destructive hover:text-destructive gap-1"
                          >
                            <Trash2 className="h-3.5 w-3.5" /> Desativar
                          </Button>
                        ) : status === "inactive" ? (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleReactivate(p.id)}
                            className="text-green-600 hover:text-green-700 gap-1"
                          >
                            <RefreshCw className="h-3.5 w-3.5" /> Reativar
                          </Button>
                        ) : (
                          <span className="text-xs text-muted-foreground">Expirada</span>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
