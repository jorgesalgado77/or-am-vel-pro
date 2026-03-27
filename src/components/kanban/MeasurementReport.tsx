/**
 * Monthly measurement report with metrics for distribution and completion time.
 */
import { useState, useEffect, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import {
  BarChart3, Clock, CheckCircle2, AlertTriangle, TrendingUp,
  Users, Ruler, CalendarDays,
} from "lucide-react";
import { supabase } from "@/lib/supabaseClient";
import { getTenantId } from "@/lib/tenantState";
import { formatCurrency } from "@/lib/financing";
import { differenceInDays, differenceInHours, format, startOfMonth, endOfMonth, subMonths } from "date-fns";
import { ptBR } from "date-fns/locale";

interface MeasurementRequest {
  id: string;
  nome_cliente: string;
  valor_venda_avista: number;
  ambientes: any[];
  status: string;
  assigned_to: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

function getMonthOptions() {
  const options: { value: string; label: string }[] = [];
  for (let i = 0; i < 12; i++) {
    const d = subMonths(new Date(), i);
    options.push({
      value: format(d, "yyyy-MM"),
      label: format(d, "MMMM yyyy", { locale: ptBR }),
    });
  }
  return options;
}

export function MeasurementReport() {
  const [requests, setRequests] = useState<MeasurementRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedMonth, setSelectedMonth] = useState(format(new Date(), "yyyy-MM"));

  useEffect(() => {
    const fetchData = async () => {
      const tenantId = getTenantId();
      if (!tenantId) return;
      setLoading(true);

      const [year, month] = selectedMonth.split("-").map(Number);
      const start = startOfMonth(new Date(year, month - 1));
      const end = endOfMonth(new Date(year, month - 1));

      const { data } = await supabase
        .from("measurement_requests" as any)
        .select("*")
        .eq("tenant_id", tenantId)
        .gte("created_at", start.toISOString())
        .lte("created_at", end.toISOString())
        .order("created_at", { ascending: false });

      setRequests((data as any[]) || []);
      setLoading(false);
    };
    fetchData();
  }, [selectedMonth]);

  const metrics = useMemo(() => {
    const total = requests.length;
    const concluidas = requests.filter(r => r.status === "concluido");
    const emAndamento = requests.filter(r => r.status === "em_andamento");
    const novas = requests.filter(r => r.status === "novo");

    // Average distribution time (created_at → assigned/em_andamento)
    const distributed = requests.filter(r => r.assigned_to && r.status !== "novo");
    const avgDistHours = distributed.length > 0
      ? distributed.reduce((sum, r) => {
          const created = new Date(r.created_at);
          const updated = new Date(r.updated_at);
          return sum + differenceInHours(updated, created);
        }, 0) / distributed.length
      : 0;

    // Average completion time (created_at → concluido)
    const avgComplHours = concluidas.length > 0
      ? concluidas.reduce((sum, r) => {
          const created = new Date(r.created_at);
          const updated = new Date(r.updated_at);
          return sum + differenceInHours(updated, created);
        }, 0) / concluidas.length
      : 0;

    // Stalled (>3 days in novo)
    const stalled = novas.filter(r => differenceInDays(new Date(), new Date(r.created_at)) > 3).length;

    // Total value
    const totalValue = requests.reduce((sum, r) => sum + (Number(r.valor_venda_avista) || 0), 0);
    const completedValue = concluidas.reduce((sum, r) => sum + (Number(r.valor_venda_avista) || 0), 0);

    // By technician
    const byTech: Record<string, { total: number; concluidas: number; value: number }> = {};
    requests.forEach(r => {
      const tech = r.assigned_to || "Não atribuído";
      if (!byTech[tech]) byTech[tech] = { total: 0, concluidas: 0, value: 0 };
      byTech[tech].total++;
      if (r.status === "concluido") byTech[tech].concluidas++;
      byTech[tech].value += Number(r.valor_venda_avista) || 0;
    });

    // Total environments
    const totalAmbientes = requests.reduce((sum, r) => sum + (r.ambientes?.length || 0), 0);

    return {
      total, concluidas: concluidas.length, emAndamento: emAndamento.length,
      novas: novas.length, stalled, avgDistHours, avgComplHours,
      totalValue, completedValue, byTech, totalAmbientes,
      completionRate: total > 0 ? Math.round((concluidas.length / total) * 100) : 0,
    };
  }, [requests]);

  const formatHours = (h: number) => {
    if (h < 24) return `${Math.round(h)}h`;
    const days = Math.floor(h / 24);
    const hrs = Math.round(h % 24);
    return `${days}d ${hrs}h`;
  };

  const monthOptions = useMemo(getMonthOptions, []);

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <BarChart3 className="h-5 w-5 text-primary" />
          <h3 className="text-base font-semibold">Relatório Mensal de Medidas</h3>
        </div>
        <Select value={selectedMonth} onValueChange={setSelectedMonth}>
          <SelectTrigger className="w-48 h-8 text-sm">
            <CalendarDays className="h-3.5 w-3.5 mr-1.5" />
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {monthOptions.map(o => (
              <SelectItem key={o.value} value={o.value} className="capitalize">{o.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-12 text-muted-foreground">
          <div className="h-5 w-5 border-2 border-primary border-t-transparent rounded-full animate-spin mr-2" />
          Carregando...
        </div>
      ) : requests.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground text-sm">
          Nenhuma solicitação de medida neste período.
        </div>
      ) : (
        <>
          {/* KPI Cards */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <Card>
              <CardContent className="p-4 text-center">
                <Ruler className="h-5 w-5 mx-auto text-primary mb-1" />
                <p className="text-2xl font-bold">{metrics.total}</p>
                <p className="text-[11px] text-muted-foreground">Total Solicitações</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4 text-center">
                <CheckCircle2 className="h-5 w-5 mx-auto text-emerald-500 mb-1" />
                <p className="text-2xl font-bold text-emerald-600">{metrics.concluidas}</p>
                <p className="text-[11px] text-muted-foreground">Concluídas ({metrics.completionRate}%)</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4 text-center">
                <Clock className="h-5 w-5 mx-auto text-amber-500 mb-1" />
                <p className="text-2xl font-bold text-amber-600">{formatHours(metrics.avgDistHours)}</p>
                <p className="text-[11px] text-muted-foreground">Tempo Méd. Distribuição</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4 text-center">
                <TrendingUp className="h-5 w-5 mx-auto text-blue-500 mb-1" />
                <p className="text-2xl font-bold text-blue-600">{formatHours(metrics.avgComplHours)}</p>
                <p className="text-[11px] text-muted-foreground">Tempo Méd. Conclusão</p>
              </CardContent>
            </Card>
          </div>

          {/* Financial summary */}
          <Card>
            <CardContent className="p-4 grid grid-cols-2 md:grid-cols-4 gap-4">
              <div>
                <p className="text-xs text-muted-foreground">Valor Total</p>
                <p className="text-base font-bold">{formatCurrency(metrics.totalValue)}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Valor Concluído</p>
                <p className="text-base font-bold text-emerald-600">{formatCurrency(metrics.completedValue)}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Ambientes Totais</p>
                <p className="text-base font-bold">{metrics.totalAmbientes}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">
                  {metrics.stalled > 0 ? (
                    <span className="text-destructive flex items-center gap-1">
                      <AlertTriangle className="h-3 w-3" /> Paradas ({metrics.stalled})
                    </span>
                  ) : "Paradas (0)"}
                </p>
                <p className="text-base font-bold">
                  {metrics.novas} pendentes + {metrics.emAndamento} em andamento
                </p>
              </div>
            </CardContent>
          </Card>

          {/* By Technician */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2">
                <Users className="h-4 w-4" />
                Desempenho por Técnico
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {Object.entries(metrics.byTech)
                  .sort(([, a], [, b]) => b.concluidas - a.concluidas)
                  .map(([tech, data]) => {
                    const rate = data.total > 0 ? Math.round((data.concluidas / data.total) * 100) : 0;
                    return (
                      <div key={tech} className="flex items-center justify-between p-2 bg-muted/30 rounded-lg">
                        <div className="flex items-center gap-2 min-w-0">
                          <div className="h-7 w-7 rounded-full bg-primary/10 flex items-center justify-center text-xs font-bold text-primary">
                            {tech.charAt(0).toUpperCase()}
                          </div>
                          <div className="min-w-0">
                            <p className="text-sm font-medium truncate">{tech}</p>
                            <p className="text-[10px] text-muted-foreground">
                              {data.concluidas}/{data.total} concluídas • {formatCurrency(data.value)}
                            </p>
                          </div>
                        </div>
                        <Badge variant={rate >= 80 ? "default" : rate >= 50 ? "secondary" : "destructive"} className="text-[10px]">
                          {rate}%
                        </Badge>
                      </div>
                    );
                  })}
              </div>
            </CardContent>
          </Card>

          {/* Detailed list */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Detalhamento das Solicitações</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b text-left">
                      <th className="pb-2 font-medium text-muted-foreground">Cliente</th>
                      <th className="pb-2 font-medium text-muted-foreground">Amb.</th>
                      <th className="pb-2 font-medium text-muted-foreground">Valor</th>
                      <th className="pb-2 font-medium text-muted-foreground">Técnico</th>
                      <th className="pb-2 font-medium text-muted-foreground">Status</th>
                      <th className="pb-2 font-medium text-muted-foreground">Criado</th>
                      <th className="pb-2 font-medium text-muted-foreground">Tempo</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {requests.map(r => {
                      const days = differenceInDays(new Date(r.updated_at), new Date(r.created_at));
                      const statusLabel = r.status === "concluido" ? "Concluído" : r.status === "em_andamento" ? "Em Andamento" : "Novo";
                      const statusColor = r.status === "concluido" ? "text-emerald-600" : r.status === "em_andamento" ? "text-amber-600" : "text-muted-foreground";
                      return (
                        <tr key={r.id}>
                          <td className="py-2 font-medium truncate max-w-[140px]">{r.nome_cliente}</td>
                          <td className="py-2">{r.ambientes?.length || 0}</td>
                          <td className="py-2">{formatCurrency(Number(r.valor_venda_avista) || 0)}</td>
                          <td className="py-2 truncate max-w-[100px]">{r.assigned_to || "—"}</td>
                          <td className={`py-2 font-medium ${statusColor}`}>{statusLabel}</td>
                          <td className="py-2 text-muted-foreground">
                            {(() => { try { return format(new Date(r.created_at), "dd/MM"); } catch { return "—"; } })()}
                          </td>
                          <td className="py-2">{days}d</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
