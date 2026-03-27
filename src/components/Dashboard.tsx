import { useMemo, useState, useEffect, useCallback, memo } from "react";
import { ProfileCompletenessCard } from "@/components/ProfileCompletenessCard";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Users, Calculator, TrendingUp, UserCheck, AlertTriangle, Eye, EyeOff, ClipboardList, Search, RefreshCw, Plus, FileCheck, DollarSign, CalendarDays, Megaphone, Share2, UserPlus } from "lucide-react";
import { TopSellingProductsChart } from "@/components/dashboard/TopSellingProductsChart";
import { DealInsightsWidget } from "@/components/dashboard/DealInsightsWidget";
import { LowStockAlerts } from "@/components/dashboard/LowStockAlerts";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { formatCurrency } from "@/lib/financing";
import { useCompanySettings } from "@/hooks/useCompanySettings";
import { useIndicadores } from "@/hooks/useIndicadores";
import { useCargos } from "@/hooks/useCargos";
import { supabase } from "@/lib/supabaseClient";
import { getResolvedTenantId } from "@/contexts/TenantContext";
import { DealRoomStoreWidget } from "@/components/DealRoomStoreWidget";
import { toast } from "sonner";
import { logAudit, getAuditUserInfo } from "@/services/auditService";
import { useComissaoPolicy, calcularComissao } from "@/hooks/useComissaoPolicy";
import { addDays, isPast, format, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, LineChart, Line,
} from "recharts";
import type { Database } from "@/integrations/supabase/types";
import { type DateFilterPreset, DATE_FILTER_OPTIONS, getDateRange, isInRange } from "@/lib/dateFilterUtils";
type Client = Database["public"]["Tables"]["clients"]["Row"];

interface LastSimInfo {
  valor_final: number;
  valor_com_desconto: number;
  created_at: string;
}

interface DashboardProps {
  clients: Client[];
  lastSims: Record<string, LastSimInfo>;
  allSimulations?: { created_at: string; valor_final: number; valor_com_desconto?: number }[];
  onOpenProfile?: () => void;
  onOpenSettings?: () => void;
}

const CHART_COLORS = [
  "hsl(200, 70%, 50%)",
  "hsl(160, 60%, 45%)",
  "hsl(30, 80%, 55%)",
  "hsl(340, 65%, 50%)",
  "hsl(260, 60%, 55%)",
  "hsl(80, 55%, 45%)",
  "hsl(10, 70%, 50%)",
  "hsl(190, 65%, 48%)",
];

const currencyFormatter = (v: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(v);

type ChartKey = "evolucao" | "projetista" | "indicador" | "contratos" | "leads_origem" | "vendedor_leads";

// Date filter types and utilities now imported from @/lib/dateFilterUtils

export function Dashboard({ clients, lastSims, allSimulations = [], onOpenProfile, onOpenSettings }: DashboardProps) {
  const { settings } = useCompanySettings();
  const { indicadores } = useIndicadores();
  const { cargos } = useCargos();
  const { policy: comissaoPolicyDash } = useComissaoPolicy();
  const [visibleCharts, setVisibleCharts] = useState<Record<ChartKey, boolean>>({
    evolucao: false,
    projetista: false,
    indicador: false,
    contratos: false,
    leads_origem: false,
    vendedor_leads: false,
  });

  // Lead filter by projetista
  const [leadProjetistaFilter, setLeadProjetistaFilter] = useState<string>("todos");

  // Table filters
  const [projetistaSearch, setProjetistaSearch] = useState("");
  const [projetistaSort, setProjetistaSort] = useState<"nome" | "clientes" | "valor" | "conversao">("nome");
  const [indicadorSearch, setIndicadorSearch] = useState("");
  const [indicadorSort, setIndicadorSort] = useState<"nome" | "clientes" | "valor" | "comissao">("nome");

  // Date filter state
  const [datePreset, setDatePreset] = useState<DateFilterPreset>("mes_atual");
  const [customStart, setCustomStart] = useState("");
  const [customEnd, setCustomEnd] = useState("");

  const dateRange = useMemo(() => getDateRange(datePreset, customStart, customEnd), [datePreset, customStart, customEnd]);

  // Contract tracking data
  const [trackingData, setTrackingData] = useState<{ count: number; total: number }>({ count: 0, total: 0 });
  const [trackingRaw, setTrackingRaw] = useState<{ valor_contrato: number; dateRef: string }[]>([]);

  const fetchTrackingStats = useCallback(async () => {
    const tenantId = await getResolvedTenantId();
    let query = supabase
      .from("client_tracking")
      .select("valor_contrato, data_fechamento, created_at");

    if (tenantId) {
      query = query.eq("tenant_id", tenantId);
    }

    // Only fetch records that represent actual closed contracts (status != em_negociacao, novo, etc.)
    query = query.not("status", "in", "(em_negociacao,novo,perdido)");

    const { data } = await query;

    if (data) {
      const all = (data as any[]).map((t) => ({
        valor_contrato: Number(t.valor_contrato) || 0,
        dateRef: t.data_fechamento || t.created_at,
      }));
      const filtered = all.filter((t) => isInRange(t.dateRef, dateRange.start, dateRange.end));
      setTrackingRaw(filtered);
      setTrackingData({
        count: filtered.length,
        total: filtered.reduce((sum, t) => sum + t.valor_contrato, 0),
      });
    }
  }, [dateRange]);

  useEffect(() => { fetchTrackingStats(); }, [fetchTrackingStats]);

  const toggleChart = useCallback((key: ChartKey) => {
    setVisibleCharts(prev => ({ ...prev, [key]: !prev[key] }));
  }, []);

  const budgetValidityDays = settings.budget_validity_days;

  // Filter clients by date range
  const filteredClients = useMemo(() =>
    clients.filter(c => isInRange(c.created_at, dateRange.start, dateRange.end)),
    [clients, dateRange]
  );

  // Filter simulations by date range
  const filteredSimulations = useMemo(() =>
    allSimulations.filter(s => isInRange(s.created_at, dateRange.start, dateRange.end)),
    [allSimulations, dateRange]
  );

  // Filter lastSims to only include filtered clients
  const filteredLastSims = useMemo(() => {
    const filteredIds = new Set(filteredClients.map(c => c.id));
    const result: Record<string, LastSimInfo> = {};
    for (const [id, sim] of Object.entries(lastSims)) {
      if (filteredIds.has(id) && isInRange(sim.created_at, dateRange.start, dateRange.end)) {
        result[id] = sim;
      }
    }
    return result;
  }, [filteredClients, lastSims, dateRange]);

  const stats = useMemo(() => {
    const totalClients = filteredClients.length;
    const clientsWithSim = filteredClients.filter(c => filteredLastSims[c.id]).length;
    const clientsWithoutSim = totalClients - clientsWithSim;

    const expired = filteredClients.filter(c => {
      const sim = filteredLastSims[c.id];
      if (!sim) return false;
      return isPast(addDays(new Date(sim.created_at), budgetValidityDays));
    }).length;

    // Valor Total Orçamentos = only clients WITHOUT closed contract (status != "fechado")
    const closedClients = filteredClients.filter(c => (c as any).status === "fechado").length;
    const nonClosedClientsWithSim = filteredClients.filter(c => (c as any).status !== "fechado" && filteredLastSims[c.id]);
    const totalValueOrcamentos = nonClosedClientsWithSim.reduce((sum, c) => {
      const s = filteredLastSims[c.id];
      return sum + (s ? (s.valor_com_desconto || s.valor_final) : 0);
    }, 0);

    // Faturamento Contratos = from trackingData (already filtered to actual contracts)
    const faturamentoContratos = trackingData.total;

    // Taxa de Conversão = contratos fechados / total com orçamento
    const taxaConversao = clientsWithSim > 0 ? (closedClients / clientsWithSim) * 100 : 0;

    // Ticket Médio = based on non-closed budgets
    const ticketMedio = nonClosedClientsWithSim.length > 0 ? totalValueOrcamentos / nonClosedClientsWithSim.length : 0;

    const byProjetista: Record<string, { count: number; total: number; expired: number; closed: number; closedTotal: number }> = {};
    filteredClients.forEach(c => {
      const name = c.vendedor || "Sem projetista";
      if (!byProjetista[name]) byProjetista[name] = { count: 0, total: 0, expired: 0, closed: 0, closedTotal: 0 };
      byProjetista[name].count++;
      if ((c as any).status === "fechado") {
        byProjetista[name].closed++;
        const sim = filteredLastSims[c.id];
        if (sim) byProjetista[name].closedTotal += sim.valor_com_desconto || sim.valor_final;
      }
      const sim = filteredLastSims[c.id];
      if (sim) {
        byProjetista[name].total += sim.valor_com_desconto || sim.valor_final;
        if (isPast(addDays(new Date(sim.created_at), budgetValidityDays))) {
          byProjetista[name].expired++;
        }
      }
    });

    const byIndicador: Record<string, { nome: string; comissao: number; count: number; total: number; comissaoTotal: number }> = {};
    filteredClients.forEach(c => {
      if (!c.indicador_id) return;
      const ind = indicadores.find(i => i.id === c.indicador_id);
      if (!ind) return;
      if (!byIndicador[c.indicador_id]) {
        byIndicador[c.indicador_id] = { nome: ind.nome, comissao: ind.comissao_percentual, count: 0, total: 0, comissaoTotal: 0 };
      }
      byIndicador[c.indicador_id].count++;
      const sim = filteredLastSims[c.id];
      if (sim) {
        byIndicador[c.indicador_id].total += sim.valor_com_desconto || sim.valor_final;
        byIndicador[c.indicador_id].comissaoTotal += (sim.valor_com_desconto || sim.valor_final) * (ind.comissao_percentual / 100);
      }
    });

    // Pipeline by status
    const byStatus: Record<string, number> = {};
    filteredClients.forEach(c => {
      const status = (c as any).status || "novo";
      byStatus[status] = (byStatus[status] || 0) + 1;
    });

    // Leads by source
    const leadsBySource = { landing_page: 0, afiliado: 0, indicacao: 0, link: 0, manual: 0, total: 0 };
    filteredClients.forEach(c => {
      const origem = (c as any).origem_lead;
      if (!origem || origem === "manual") {
        leadsBySource.manual++;
      } else if (origem === "landing_page" || origem === "site") {
        leadsBySource.landing_page++;
      } else if (origem === "afiliado" || origem === "affiliate") {
        leadsBySource.afiliado++;
      } else if (origem === "indicacao" || origem === "referral") {
        leadsBySource.indicacao++;
      } else if (origem === "link" || origem === "compartilhado") {
        leadsBySource.link++;
      } else {
        leadsBySource.manual++;
      }
      if (origem && origem !== "manual") leadsBySource.total++;
    });

    return {
      totalClients, clientsWithSim, clientsWithoutSim, expired, totalValue: totalValueOrcamentos,
      ticketMedio, taxaConversao, closedClients, faturamentoContratos,
      byProjetista: Object.entries(byProjetista).sort((a, b) => b[1].total - a[1].total),
      byIndicador: Object.entries(byIndicador).sort((a, b) => b[1].total - a[1].total),
      byStatus,
      leadsBySource,
    };
  }, [filteredClients, filteredLastSims, budgetValidityDays, indicadores, trackingData]);

  // Line chart data: aggregate filtered simulations by month
  const lineData = useMemo(() => {
    if (filteredSimulations.length === 0) return [];
    const byMonth: Record<string, { count: number; total: number }> = {};
    filteredSimulations.forEach(s => {
      const key = format(parseISO(s.created_at), "yyyy-MM");
      if (!byMonth[key]) byMonth[key] = { count: 0, total: 0 };
      byMonth[key].count++;
      byMonth[key].total += s.valor_com_desconto || s.valor_final;
    });
    return Object.entries(byMonth)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([month, data]) => ({
        month: format(parseISO(month + "-01"), "MMM/yy", { locale: ptBR }),
        orcamentos: data.count,
        valor: data.total,
      }));
  }, [filteredSimulations]);

  const barData = useMemo(() =>
    stats.byProjetista.map(([name, data]) => ({
      name,
      valor: data.total,
      clientes: data.count,
    })),
    [stats.byProjetista]
  );

  const pieData = useMemo(() => {
    if (stats.byIndicador.length > 0) {
      return stats.byIndicador.map(([, data]) => ({
        name: data.nome,
        value: data.count,
      }));
    }
    return [
      { name: "Com Orçamento", value: stats.clientsWithSim },
      { name: "Sem Orçamento", value: stats.clientsWithoutSim },
      ...(stats.expired > 0 ? [{ name: "Expirados", value: stats.expired }] : []),
    ].filter(d => d.value > 0);
  }, [stats]);

  // Contracts monthly evolution data
  const contractsLineData = useMemo(() => {
    if (trackingRaw.length === 0) return [];
    const byMonth: Record<string, { count: number; total: number }> = {};
    trackingRaw.forEach(t => {
      const key = format(new Date(t.dateRef), "yyyy-MM");
      if (!byMonth[key]) byMonth[key] = { count: 0, total: 0 };
      byMonth[key].count++;
      byMonth[key].total += t.valor_contrato;
    });
    return Object.entries(byMonth)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([month, data]) => ({
        month: format(parseISO(month + "-01"), "MMM/yy", { locale: ptBR }),
        contratos: data.count,
        valor: data.total,
      }));
  }, [trackingRaw]);

  const chartToggles: { key: ChartKey; label: string }[] = useMemo(() => [
    { key: "evolucao", label: "Evolução" },
    { key: "contratos", label: "Contratos" },
    { key: "projetista", label: "Projetista" },
    { key: "indicador", label: "Indicador" },
    { key: "leads_origem", label: "Leads por Origem" },
    { key: "vendedor_leads", label: "Leads por Vendedor" },
  ], []);

  // Unique projetistas for filter
  const projetistaNames = useMemo(() => {
    const names = new Set(filteredClients.map(c => c.vendedor || "Sem projetista"));
    return Array.from(names).sort();
  }, [filteredClients]);

  // Filtered lead source data by projetista
  const filteredLeadsBySource = useMemo(() => {
    const src = { landing_page: 0, afiliado: 0, indicacao: 0, link: 0, manual: 0, total: 0 };
    const clientsToCount = leadProjetistaFilter === "todos" 
      ? filteredClients 
      : filteredClients.filter(c => (c.vendedor || "Sem projetista") === leadProjetistaFilter);
    
    clientsToCount.forEach(c => {
      const origem = (c as any).origem_lead;
      if (!origem || origem === "manual") {
        src.manual++;
      } else if (origem === "landing_page" || origem === "site" || origem === "funil_loja") {
        src.landing_page++;
      } else if (origem === "afiliado" || origem === "affiliate") {
        src.afiliado++;
      } else if (origem === "indicacao" || origem === "referral") {
        src.indicacao++;
      } else if (origem === "link" || origem === "compartilhado") {
        src.link++;
      } else {
        src.manual++;
      }
      if (origem && origem !== "manual") src.total++;
    });
    return src;
  }, [filteredClients, leadProjetistaFilter]);

  // Pie data for leads by origin
  const leadsPieData = useMemo(() => {
    const data = [
      { name: "Landing Page", value: filteredLeadsBySource.landing_page },
      { name: "Afiliados", value: filteredLeadsBySource.afiliado },
      { name: "Indicação", value: filteredLeadsBySource.indicacao },
      { name: "Link Compartilhado", value: filteredLeadsBySource.link },
      { name: "Manual / Loja", value: filteredLeadsBySource.manual },
    ].filter(d => d.value > 0);
    return data;
  }, [filteredLeadsBySource]);

  // Vendedor leads distribution data
  const vendedorLeadsPieData = useMemo(() => {
    const byVendedor: Record<string, number> = {};
    filteredClients.forEach(c => {
      const name = c.vendedor || "Sem vendedor";
      byVendedor[name] = (byVendedor[name] || 0) + 1;
    });
    return Object.entries(byVendedor)
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value)
      .filter(d => d.value > 0);
  }, [filteredClients]);

  return (
    <div className="space-y-6">
      <ProfileCompletenessCard onOpenProfile={onOpenProfile} onOpenSettings={onOpenSettings} />
      <DealInsightsWidget />
      {/* Date Filter Bar */}
      <Card>
        <CardContent className="p-4">
          <div className="flex items-center gap-3 flex-wrap">
            <div className="flex items-center gap-2">
              <CalendarDays className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm font-medium text-foreground">Período:</span>
            </div>
            <Select value={datePreset} onValueChange={(v) => setDatePreset(v as DateFilterPreset)}>
              <SelectTrigger className="w-[180px] h-8 text-sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {DATE_FILTER_OPTIONS.map(opt => (
                  <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            {datePreset === "personalizado" && (
              <>
                <Input
                  type="date"
                  value={customStart}
                  onChange={(e) => setCustomStart(e.target.value)}
                  className="w-[150px] h-8 text-sm"
                />
                <span className="text-xs text-muted-foreground">até</span>
                <Input
                  type="date"
                  value={customEnd}
                  onChange={(e) => setCustomEnd(e.target.value)}
                  className="w-[150px] h-8 text-sm"
                />
              </>
            )}
            <span className="text-xs text-muted-foreground ml-auto">
              {format(dateRange.start, "dd/MM/yyyy")} — {format(dateRange.end, "dd/MM/yyyy")}
            </span>
          </div>
        </CardContent>
      </Card>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 xl:grid-cols-5 gap-4">
        <KpiCard icon={Users} label="Total de Clientes" value={String(stats.totalClients)} />
        <KpiCard icon={Calculator} label="Com Orçamento" value={String(stats.clientsWithSim)} accent />
        <KpiCard icon={TrendingUp} label="Valor Total Orçamentos" value={formatCurrency(stats.totalValue)} accent />
        <KpiCard icon={FileCheck} label="Contratos Fechados" value={String(trackingData.count)} success />
        <KpiCard icon={DollarSign} label="Faturamento Contratos" value={formatCurrency(trackingData.total)} success />
      </div>

      {/* Secondary KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard icon={DollarSign} label="Ticket Médio" value={formatCurrency(stats.ticketMedio)} accent />
        <KpiCard icon={TrendingUp} label="Taxa de Conversão" value={`${stats.taxaConversao.toFixed(1)}%`} accent={stats.taxaConversao > 0} />
        <KpiCard icon={AlertTriangle} label="Orç. Expirados" value={String(stats.expired)} destructive={stats.expired > 0} />
        <KpiCard icon={UserCheck} label="Sem Orçamento" value={String(stats.clientsWithoutSim)} />
      </div>

      {/* Lead Source Cards with Projetista filter */}
      <Card>
        <CardContent className="p-4 space-y-3">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
              <Megaphone className="h-4 w-4 text-primary" />
              Leads por Origem
            </h3>
            <Select value={leadProjetistaFilter} onValueChange={setLeadProjetistaFilter}>
              <SelectTrigger className="w-[180px] h-8 text-sm">
                <SelectValue placeholder="Todos os projetistas" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Todos os projetistas</SelectItem>
                {projetistaNames.map(name => (
                  <SelectItem key={name} value={name}>{name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
            <KpiCard icon={Megaphone} label="Landing Page" value={String(filteredLeadsBySource.landing_page)} accent={filteredLeadsBySource.landing_page > 0} />
            <KpiCard icon={UserPlus} label="Afiliados" value={String(filteredLeadsBySource.afiliado)} accent={filteredLeadsBySource.afiliado > 0} />
            <KpiCard icon={Users} label="Indicação" value={String(filteredLeadsBySource.indicacao)} accent={filteredLeadsBySource.indicacao > 0} />
            <KpiCard icon={Share2} label="Link Compartilhado" value={String(filteredLeadsBySource.link)} accent={filteredLeadsBySource.link > 0} />
            <KpiCard icon={UserCheck} label="Manual / Loja" value={String(filteredLeadsBySource.manual)} />
          </div>
        </CardContent>
      </Card>
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-xs text-muted-foreground font-medium">Gráficos:</span>
        {chartToggles.map(({ key, label }) => (
          <Button
            key={key}
            variant={visibleCharts[key] ? "default" : "outline"}
            size="sm"
            className="gap-1.5 h-7 text-xs"
            onClick={() => toggleChart(key)}
          >
            {visibleCharts[key] ? <Eye className="h-3 w-3" /> : <EyeOff className="h-3 w-3" />}
            {label}
          </Button>
        ))}
      </div>

      {/* Line Chart - Evolução dos Orçamentos */}
      {visibleCharts.evolucao && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Evolução dos Orçamentos</CardTitle>
          </CardHeader>
          <CardContent>
            {lineData.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-8">Nenhuma simulação registrada no período</p>
            ) : (
              <ResponsiveContainer width="100%" height={280}>
                <LineChart data={lineData} margin={{ top: 8, right: 20, left: 8, bottom: 4 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis dataKey="month" tick={{ fontSize: 12, fill: "hsl(var(--muted-foreground))" }} />
                  <YAxis yAxisId="valor" orientation="left" tickFormatter={currencyFormatter} tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} width={95} />
                  <YAxis yAxisId="count" orientation="right" tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} width={40} />
                  <Tooltip
                    formatter={(value: number, name: string) => [
                      name === "valor" ? currencyFormatter(value) : value,
                      name === "valor" ? "Valor Total" : "Qtd. Orçamentos",
                    ]}
                    contentStyle={{
                      backgroundColor: "hsl(var(--card))",
                      border: "1px solid hsl(var(--border))",
                      borderRadius: "8px",
                      fontSize: 13,
                    }}
                    labelStyle={{ color: "hsl(var(--foreground))", fontWeight: 600 }}
                  />
                  <Line yAxisId="valor" type="monotone" dataKey="valor" stroke="hsl(200, 70%, 50%)" strokeWidth={2.5} dot={{ r: 4, fill: "hsl(200, 70%, 50%)" }} name="valor" />
                  <Line yAxisId="count" type="monotone" dataKey="orcamentos" stroke="hsl(160, 60%, 45%)" strokeWidth={2} strokeDasharray="5 5" dot={{ r: 3, fill: "hsl(160, 60%, 45%)" }} name="orcamentos" />
                </LineChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>
      )}

      {/* Contracts Evolution Chart */}
      {visibleCharts.contratos && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Evolução Mensal de Contratos Fechados</CardTitle>
          </CardHeader>
          <CardContent>
            {contractsLineData.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-8">Nenhum contrato registrado no período</p>
            ) : (
              <ResponsiveContainer width="100%" height={280}>
                <LineChart data={contractsLineData} margin={{ top: 8, right: 20, left: 8, bottom: 4 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis dataKey="month" tick={{ fontSize: 12, fill: "hsl(var(--muted-foreground))" }} />
                  <YAxis yAxisId="valor" orientation="left" tickFormatter={currencyFormatter} tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} width={95} />
                  <YAxis yAxisId="count" orientation="right" tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} width={40} />
                  <Tooltip
                    formatter={(value: number, name: string) => [
                      name === "valor" ? currencyFormatter(value) : value,
                      name === "valor" ? "Valor Total" : "Qtd. Contratos",
                    ]}
                    contentStyle={{
                      backgroundColor: "hsl(var(--card))",
                      border: "1px solid hsl(var(--border))",
                      borderRadius: "8px",
                      fontSize: 13,
                    }}
                    labelStyle={{ color: "hsl(var(--foreground))", fontWeight: 600 }}
                  />
                  <Line yAxisId="valor" type="monotone" dataKey="valor" stroke="hsl(140, 60%, 40%)" strokeWidth={2.5} dot={{ r: 4, fill: "hsl(140, 60%, 40%)" }} name="valor" />
                  <Line yAxisId="count" type="monotone" dataKey="contratos" stroke="hsl(200, 70%, 50%)" strokeWidth={2} strokeDasharray="5 5" dot={{ r: 3, fill: "hsl(200, 70%, 50%)" }} name="contratos" />
                </LineChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>
      )}

      {/* Bar + Pie Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {visibleCharts.projetista && (
          <Card className="lg:col-span-2">
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Valor por Projetista</CardTitle>
            </CardHeader>
            <CardContent>
              {barData.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-8">Nenhum dado no período</p>
              ) : (
                <ResponsiveContainer width="100%" height={260}>
                  <BarChart data={barData} margin={{ top: 8, right: 12, left: 8, bottom: 4 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                    <XAxis dataKey="name" tick={{ fontSize: 12, fill: "hsl(var(--muted-foreground))" }} />
                    <YAxis tickFormatter={currencyFormatter} tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} width={90} />
                    <Tooltip
                      formatter={(value: number) => [currencyFormatter(value), "Valor"]}
                      contentStyle={{
                        backgroundColor: "hsl(var(--card))",
                        border: "1px solid hsl(var(--border))",
                        borderRadius: "8px",
                        fontSize: 13,
                      }}
                      labelStyle={{ color: "hsl(var(--foreground))", fontWeight: 600 }}
                    />
                    <Bar dataKey="valor" radius={[6, 6, 0, 0]} maxBarSize={56}>
                      {barData.map((_, i) => (
                        <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              )}
            </CardContent>
          </Card>
        )}

        {visibleCharts.indicador && (
          <Card className={!visibleCharts.projetista ? "lg:col-span-3" : ""}>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">
                {stats.byIndicador.length > 0 ? "Clientes por Indicador" : "Status dos Clientes"}
              </CardTitle>
            </CardHeader>
            <CardContent className="flex items-center justify-center">
              {pieData.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-8">Nenhum dado no período</p>
              ) : (
                <ResponsiveContainer width="100%" height={260}>
                  <PieChart>
                    <Pie
                      data={pieData}
                      cx="50%"
                      cy="50%"
                      innerRadius={50}
                      outerRadius={85}
                      paddingAngle={3}
                      dataKey="value"
                      label={({ name, percent }) => `${name} (${(percent * 100).toFixed(0)}%)`}
                      labelLine={false}
                      style={{ fontSize: 11 }}
                    >
                      {pieData.map((_, i) => (
                        <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip
                      formatter={(value: number) => [value, "Clientes"]}
                      contentStyle={{
                        backgroundColor: "hsl(var(--card))",
                        border: "1px solid hsl(var(--border))",
                        borderRadius: "8px",
                        fontSize: 13,
                      }}
                    />
                  </PieChart>
                </ResponsiveContainer>
              )}
            </CardContent>
          </Card>
        )}
      </div>

      {/* Leads by Origin Pie Chart */}
      {visibleCharts.leads_origem && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Distribuição de Leads por Origem</CardTitle>
          </CardHeader>
          <CardContent>
            {leadsPieData.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-8">Nenhum lead no período</p>
            ) : (
              <div className="flex flex-col md:flex-row items-center gap-6">
                <div className="w-[280px] h-[280px] flex-shrink-0">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={leadsPieData}
                        cx="50%"
                        cy="50%"
                        innerRadius={55}
                        outerRadius={100}
                        paddingAngle={3}
                        dataKey="value"
                        label={({ name, percent }) => `${name} (${(percent * 100).toFixed(0)}%)`}
                        labelLine={false}
                        style={{ fontSize: 11 }}
                      >
                        {leadsPieData.map((_, i) => (
                          <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                        ))}
                      </Pie>
                      <Tooltip
                        formatter={(value: number) => [value, "Leads"]}
                        contentStyle={{
                          backgroundColor: "hsl(var(--card))",
                          border: "1px solid hsl(var(--border))",
                          borderRadius: "8px",
                          fontSize: 13,
                        }}
                      />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
                <div className="space-y-3 flex-1">
                  {leadsPieData.map((d, i) => (
                    <div key={d.name} className="flex items-center gap-3">
                      <div className="h-4 w-4 rounded-full flex-shrink-0" style={{ backgroundColor: CHART_COLORS[i % CHART_COLORS.length] }} />
                      <span className="text-sm text-foreground font-medium flex-1">{d.name}</span>
                      <Badge variant="secondary" className="text-sm font-bold">{d.value}</Badge>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Vendedor Leads Distribution Chart */}
      {visibleCharts.vendedor_leads && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <Users className="h-4 w-4 text-primary" />
              Distribuição de Leads por Vendedor
            </CardTitle>
          </CardHeader>
          <CardContent>
            {vendedorLeadsPieData.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-8">Nenhum lead no período</p>
            ) : (
              <div className="flex flex-col md:flex-row items-center gap-6">
                <div className="w-[280px] h-[280px] flex-shrink-0">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={vendedorLeadsPieData}
                        cx="50%"
                        cy="50%"
                        innerRadius={55}
                        outerRadius={100}
                        paddingAngle={3}
                        dataKey="value"
                        label={({ name, percent }) => `${name} (${(percent * 100).toFixed(0)}%)`}
                        labelLine={false}
                        style={{ fontSize: 11 }}
                      >
                        {vendedorLeadsPieData.map((_, i) => (
                          <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                        ))}
                      </Pie>
                      <Tooltip
                        formatter={(value: number) => [value, "Leads"]}
                        contentStyle={{
                          backgroundColor: "hsl(var(--card))",
                          border: "1px solid hsl(var(--border))",
                          borderRadius: "8px",
                          fontSize: 13,
                        }}
                      />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
                <div className="space-y-3 flex-1">
                  {vendedorLeadsPieData.map((d, i) => (
                    <div key={d.name} className="flex items-center gap-3">
                      <div className="h-4 w-4 rounded-full flex-shrink-0" style={{ backgroundColor: CHART_COLORS[i % CHART_COLORS.length] }} />
                      <span className="text-sm text-foreground font-medium flex-1">{d.name}</span>
                      <Badge variant="secondary" className="text-sm font-bold">{d.value}</Badge>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader className="pb-3">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <CardTitle className="text-base">Detalhes por Projetista</CardTitle>
              <div className="flex items-center gap-2">
                <div className="relative">
                  <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                  <Input
                    placeholder="Buscar..."
                    value={projetistaSearch}
                    onChange={e => setProjetistaSearch(e.target.value)}
                    className="h-8 w-[140px] pl-7 text-xs"
                  />
                </div>
                <Select value={projetistaSort} onValueChange={(v: any) => setProjetistaSort(v)}>
                  <SelectTrigger className="h-8 w-[120px] text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="nome">Nome</SelectItem>
                    <SelectItem value="clientes">Clientes</SelectItem>
                    <SelectItem value="valor">Valor</SelectItem>
                    <SelectItem value="conversao">Conversão</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {stats.byProjetista.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-4">Nenhum dado no período</p>
            ) : (() => {
              const filtered = stats.byProjetista
                .filter(([name]) => name.toLowerCase().includes(projetistaSearch.toLowerCase()))
                .sort((a, b) => {
                  if (projetistaSort === "clientes") return b[1].count - a[1].count;
                  if (projetistaSort === "valor") return b[1].total - a[1].total;
                  if (projetistaSort === "conversao") {
                    const convA = a[1].count > 0 ? a[1].closed / a[1].count : 0;
                    const convB = b[1].count > 0 ? b[1].closed / b[1].count : 0;
                    return convB - convA;
                  }
                  return a[0].localeCompare(b[0]);
                });
              return filtered.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-4">Nenhum resultado para "{projetistaSearch}"</p>
              ) : (
              <Table>
                <TableHeader>
                  <TableRow className="bg-secondary/50">
                    <TableHead className="font-medium">Projetista</TableHead>
                    <TableHead className="font-medium text-center">Clientes</TableHead>
                    <TableHead className="font-medium text-center">Fechados</TableHead>
                    <TableHead className="font-medium text-center">Conversão</TableHead>
                    <TableHead className="font-medium text-right">Valor Total</TableHead>
                    <TableHead className="font-medium text-right">Comissão</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map(([name, data]) => {
                    const conv = data.count > 0 ? ((data.closed / data.count) * 100).toFixed(0) : "0";
                    const matchedCargo = cargos.find(c => 
                      name.toLowerCase().includes(c.nome.toLowerCase()) || c.nome.toLowerCase() === "projetista"
                    );
                    const comPercent = matchedCargo ? matchedCargo.comissao_percentual : 0;
                    const comResult = calcularComissao(
                      data.closedTotal, comPercent, comissaoPolicyDash,
                      matchedCargo?.id || null, matchedCargo?.nome || null
                    );
                    const comissaoValor = (data.closedTotal * comResult.percentual) / 100;
                    return (
                    <TableRow key={name}>
                      <TableCell className="font-medium text-foreground">{name}</TableCell>
                      <TableCell className="text-center"><Badge variant="secondary">{data.count}</Badge></TableCell>
                      <TableCell className="text-center"><Badge variant="default" className="bg-emerald-600">{data.closed}</Badge></TableCell>
                      <TableCell className="text-center">
                        <Badge variant="outline" className={Number(conv) >= 30 ? "border-emerald-500 text-emerald-600" : ""}>{conv}%</Badge>
                      </TableCell>
                      <TableCell className="text-right tabular-nums font-medium">{formatCurrency(data.total)}</TableCell>
                      <TableCell className="text-right tabular-nums font-medium text-primary">
                        {comissaoValor > 0 ? formatCurrency(comissaoValor) : "—"}
                        {comResult.percentual > 0 && <span className="text-xs text-muted-foreground ml-1">({comResult.percentual}%)</span>}
                      </TableCell>
                    </TableRow>
                    );
                  })}
                  {(() => {
                    const totClientes = filtered.reduce((s, [, d]) => s + d.count, 0);
                    const totFechados = filtered.reduce((s, [, d]) => s + d.closed, 0);
                    const totValor = filtered.reduce((s, [, d]) => s + d.total, 0);
                    const totComissao = filtered.reduce((s, [name, data]) => {
                      const mc = cargos.find(c => name.toLowerCase().includes(c.nome.toLowerCase()) || c.nome.toLowerCase() === "projetista");
                      const cp = mc ? mc.comissao_percentual : 0;
                      const cr = calcularComissao(data.closedTotal, cp, comissaoPolicyDash, mc?.id || null, mc?.nome || null);
                      return s + (data.closedTotal * cr.percentual) / 100;
                    }, 0);
                    const totConv = totClientes > 0 ? ((totFechados / totClientes) * 100).toFixed(0) : "0";
                    return (
                      <TableRow className="bg-muted/50 border-t-2 border-border font-semibold">
                        <TableCell className="text-foreground">Total</TableCell>
                        <TableCell className="text-center"><Badge variant="secondary">{totClientes}</Badge></TableCell>
                        <TableCell className="text-center"><Badge variant="default" className="bg-emerald-600">{totFechados}</Badge></TableCell>
                        <TableCell className="text-center"><Badge variant="outline">{totConv}%</Badge></TableCell>
                        <TableCell className="text-right tabular-nums">{formatCurrency(totValor)}</TableCell>
                        <TableCell className="text-right tabular-nums text-primary">{totComissao > 0 ? formatCurrency(totComissao) : "—"}</TableCell>
                      </TableRow>
                    );
                  })()}
                </TableBody>
              </Table>
              );
            })()}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <CardTitle className="text-base">Detalhes por Indicador</CardTitle>
              <div className="flex items-center gap-2">
                <div className="relative">
                  <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                  <Input
                    placeholder="Buscar..."
                    value={indicadorSearch}
                    onChange={e => setIndicadorSearch(e.target.value)}
                    className="h-8 w-[140px] pl-7 text-xs"
                  />
                </div>
                <Select value={indicadorSort} onValueChange={(v: any) => setIndicadorSort(v)}>
                  <SelectTrigger className="h-8 w-[120px] text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="nome">Nome</SelectItem>
                    <SelectItem value="clientes">Clientes</SelectItem>
                    <SelectItem value="valor">Valor</SelectItem>
                    <SelectItem value="comissao">Comissão</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {stats.byIndicador.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-4">Nenhum indicador vinculado no período</p>
            ) : (() => {
              const filtered = stats.byIndicador
                .filter(([, data]) => data.nome.toLowerCase().includes(indicadorSearch.toLowerCase()))
                .sort((a, b) => {
                  if (indicadorSort === "clientes") return b[1].count - a[1].count;
                  if (indicadorSort === "valor") return b[1].total - a[1].total;
                  if (indicadorSort === "comissao") return b[1].comissaoTotal - a[1].comissaoTotal;
                  return a[1].nome.localeCompare(b[1].nome);
                });
              return filtered.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-4">Nenhum resultado para "{indicadorSearch}"</p>
              ) : (
              <Table>
                <TableHeader>
                  <TableRow className="bg-secondary/50">
                    <TableHead className="font-medium">Indicador</TableHead>
                    <TableHead className="font-medium text-center">Clientes</TableHead>
                    <TableHead className="font-medium text-right">Valor Total</TableHead>
                    <TableHead className="font-medium text-right">Comissão</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map(([id, data]) => (
                    <TableRow key={id}>
                      <TableCell className="font-medium text-foreground">
                        {data.nome} <span className="text-muted-foreground text-xs">({data.comissao}%)</span>
                      </TableCell>
                      <TableCell className="text-center"><Badge variant="secondary">{data.count}</Badge></TableCell>
                      <TableCell className="text-right tabular-nums font-medium">{formatCurrency(data.total)}</TableCell>
                      <TableCell className="text-right tabular-nums font-medium text-primary">{formatCurrency(data.comissaoTotal)}</TableCell>
                    </TableRow>
                  ))}
                  {(() => {
                    const totClientes = filtered.reduce((s, [, d]) => s + d.count, 0);
                    const totValor = filtered.reduce((s, [, d]) => s + d.total, 0);
                    const totComissao = filtered.reduce((s, [, d]) => s + d.comissaoTotal, 0);
                    return (
                      <TableRow className="bg-muted/50 border-t-2 border-border font-semibold">
                        <TableCell className="text-foreground">Total</TableCell>
                        <TableCell className="text-center"><Badge variant="secondary">{totClientes}</Badge></TableCell>
                        <TableCell className="text-right tabular-nums">{formatCurrency(totValor)}</TableCell>
                        <TableCell className="text-right tabular-nums text-primary">{formatCurrency(totComissao)}</TableCell>
                      </TableRow>
                    );
                  })()}
                </TableBody>
              </Table>
              );
            })()}
          </CardContent>
        </Card>
      </div>

      {/* Deal Room Widget removed — it's a standalone add-on with its own screen */}

      {/* Produtos Mais Vendidos */}
      <TopSellingProductsChart />

      {/* Alertas de Estoque Baixo */}
      <LowStockAlerts />

      {/* Contratos Fechados - Acompanhamento */}
      <ContractTrackingList />
    </div>
  );
}

function DealRoomStoreWidgetWrapper() {
  const [tenantId, setTenantId] = useState<string | null>(null);
  useEffect(() => {
    getResolvedTenantId().then((resolved) => {
      if (resolved) {
        setTenantId(resolved);
        return;
      }

      supabase.from("company_settings").select("tenant_id").limit(1).maybeSingle().then(({ data }) => {
        if (data) setTenantId((data as any).tenant_id);
      });
    });
  }, []);
  if (!tenantId) return null;
  return <DealRoomStoreWidget tenantId={tenantId} />;
}

const KpiCard = memo(function KpiCard({ icon: Icon, label, value, accent, destructive, success }: {
  icon: React.ElementType; label: string; value: string; accent?: boolean; destructive?: boolean; success?: boolean;
}) {
  return (
    <Card className={destructive ? "border-destructive/30" : success ? "border-emerald-500/30" : ""}>
      <CardContent className="p-4 flex items-center gap-3">
        <div className={`p-2 rounded-lg ${
          destructive ? "bg-destructive/10" : 
          success ? "bg-emerald-500/10" : 
          accent ? "bg-primary/10" : "bg-secondary"
        }`}>
          <Icon className={`h-5 w-5 ${
            destructive ? "text-destructive" : 
            success ? "text-emerald-600" : 
            accent ? "text-primary" : "text-muted-foreground"
          }`} />
        </div>
        <div>
          <p className="text-xs text-muted-foreground">{label}</p>
          <p className={`text-lg font-bold ${destructive ? "text-destructive" : "text-foreground"}`}>{value}</p>
        </div>
      </CardContent>
    </Card>
  );
});

const STATUS_OPTIONS = [
  { value: "fechado", label: "Fechado" },
  { value: "medicao", label: "Medição" },
  { value: "liberacao", label: "Liberação" },
  { value: "entrega", label: "Entrega" },
  { value: "montagem", label: "Montagem" },
  { value: "assistencia", label: "Ass.Técnica" },
  { value: "finalizado", label: "Finalizado" },
];

const STATUS_COLORS: Record<string, string> = {
  fechado: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900 dark:text-emerald-200",
  medicao: "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200",
  liberacao: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200",
  entrega: "bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200",
  montagem: "bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200",
  assistencia: "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200",
  finalizado: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200",
  em_negociacao: "bg-cyan-100 text-cyan-800 dark:bg-cyan-900 dark:text-cyan-200",
};

interface TrackingRow {
  id: string;
  numero_contrato: string;
  nome_cliente: string;
  cpf_cnpj: string | null;
  quantidade_ambientes: number;
  valor_contrato: number;
  data_fechamento: string | null;
  projetista: string | null;
  status: string;
}

function ContractTrackingList() {
  const { policy: comissaoPolicy } = useComissaoPolicy();
  const [trackings, setTrackings] = useState<TrackingRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState({
    numero_contrato: "", nome_cliente: "", cpf_cnpj: "",
    quantidade_ambientes: 0, valor_contrato: 0, data_fechamento: "", projetista: "",
  });
  const [saving, setSaving] = useState(false);

  const fetchTrackings = useCallback(async () => {
    setLoading(true);
    const tenantId = await getResolvedTenantId();
    let query = supabase
      .from("client_tracking")
      .select("id, numero_contrato, nome_cliente, cpf_cnpj, quantidade_ambientes, valor_contrato, data_fechamento, projetista, status, vendedor")
      .order("created_at", { ascending: false });
    if (tenantId) query = query.eq("tenant_id", tenantId);
    const { data } = await query;
    if (data) setTrackings(data as any);
    setLoading(false);
  }, []);

  useEffect(() => { fetchTrackings(); }, [fetchTrackings]);

  const handleStatusChange = useCallback(async (id: string, newStatus: string) => {
    const { error } = await supabase
      .from("client_tracking")
      .update({ status: newStatus, updated_at: new Date().toISOString() } as any)
      .eq("id", id);
    if (error) toast.error("Erro ao atualizar status");
    else {
      toast.success("Status atualizado!");
      setTrackings((prev) => prev.map((t) => t.id === id ? { ...t, status: newStatus } : t));

      const userInfo = getAuditUserInfo();
      logAudit({
        acao: "status_tracking_alterado",
        entidade: "tracking",
        entidade_id: id,
        detalhes: { novo_status: newStatus },
        ...userInfo,
      });
    }
  }, []);

  const handleAdd = useCallback(async () => {
    if (!form.numero_contrato.trim() || !form.nome_cliente.trim()) {
      toast.error("Preencha número do contrato e nome do cliente"); return;
    }
    setSaving(true);
    const tenantId = await getResolvedTenantId();
    let clientQuery = supabase.from("clients").select("id").ilike("nome", `%${form.nome_cliente.trim()}%`).limit(1);
    if (tenantId) clientQuery = clientQuery.eq("tenant_id", tenantId);
    const { data: clientData } = await clientQuery.single();

    const comissaoResult = calcularComissao(form.valor_contrato, 0, comissaoPolicy, null);

    
    const { error } = await supabase.from("client_tracking").insert({
      client_id: clientData?.id || "00000000-0000-0000-0000-000000000000",
      numero_contrato: form.numero_contrato.trim(),
      nome_cliente: form.nome_cliente.trim(),
      cpf_cnpj: form.cpf_cnpj.trim() || null,
      quantidade_ambientes: form.quantidade_ambientes,
      valor_contrato: form.valor_contrato,
      data_fechamento: form.data_fechamento || null,
      projetista: form.projetista.trim() || null,
      status: "medicao",
      comissao_percentual: comissaoResult.percentual,
      comissao_valor: Math.round((form.valor_contrato * comissaoResult.percentual / 100) * 100) / 100,
      comissao_status: "pendente",
      ...(tenantId ? { tenant_id: tenantId } : {}),
    } as any);
    setSaving(false);
    if (error) toast.error("Erro ao adicionar");
    else {
      toast.success("Contrato adicionado!");
      setShowAdd(false);
      setForm({ numero_contrato: "", nome_cliente: "", cpf_cnpj: "", quantidade_ambientes: 0, valor_contrato: 0, data_fechamento: "", projetista: "" });
      fetchTrackings();
    }
  }, [form, fetchTrackings]);

  const filtered = useMemo(() =>
    trackings.filter((t) =>
      t.numero_contrato.toLowerCase().includes(search.toLowerCase()) ||
      t.nome_cliente.toLowerCase().includes(search.toLowerCase()) ||
      (t.projetista || "").toLowerCase().includes(search.toLowerCase())
    ),
    [trackings, search]
  );

  const getStatusLabel = useCallback((val: string) =>
    STATUS_OPTIONS.find((s) => s.value === val)?.label || val,
    []
  );

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between flex-wrap gap-2">
          <CardTitle className="text-base flex items-center gap-2">
            <ClipboardList className="h-4 w-4" />
            Contratos Fechados — Acompanhamento
          </CardTitle>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={fetchTrackings} className="gap-1">
              <RefreshCw className="h-3 w-3" />Atualizar
            </Button>
            <Button size="sm" onClick={() => setShowAdd(true)} className="gap-1">
              <Plus className="h-3 w-3" />Novo
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div className="mb-4">
          <div className="relative max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar contrato, cliente ou projetista..." className="pl-9" />
          </div>
        </div>
        <div className="rounded-md border overflow-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[150px]">Status</TableHead>
                <TableHead>Nº Contrato</TableHead>
                <TableHead>Cliente</TableHead>
                <TableHead className="text-center">Ambientes</TableHead>
                <TableHead className="text-right">Valor</TableHead>
                <TableHead>Fechamento</TableHead>
                <TableHead>Projetista</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground py-8">Carregando...</TableCell></TableRow>
              ) : filtered.length === 0 ? (
                <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground py-8">Nenhum contrato fechado</TableCell></TableRow>
              ) : (
                filtered.map((t) => (
                  <TableRow key={t.id}>
                    <TableCell>
                      <Select value={t.status} onValueChange={(val) => handleStatusChange(t.id, val)}>
                        <SelectTrigger className="h-8 text-xs w-[130px]">
                          <Badge className={`${STATUS_COLORS[t.status] || ""} text-xs font-medium border-0`}>
                            {getStatusLabel(t.status)}
                          </Badge>
                        </SelectTrigger>
                        <SelectContent>
                          {STATUS_OPTIONS.map((opt) => (
                            <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </TableCell>
                    <TableCell className="font-mono text-sm">{t.numero_contrato}</TableCell>
                    <TableCell>{t.nome_cliente}</TableCell>
                    <TableCell className="text-center">{t.quantidade_ambientes}</TableCell>
                    <TableCell className="text-right">
                      {Number(t.valor_contrato).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}
                    </TableCell>
                    <TableCell>{t.data_fechamento ? format(new Date(t.data_fechamento), "dd/MM/yyyy") : "—"}</TableCell>
                    <TableCell>{t.projetista || "—"}</TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </CardContent>

      <Dialog open={showAdd} onOpenChange={setShowAdd}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>Novo Contrato Fechado</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div><Label>Nº Contrato *</Label><Input value={form.numero_contrato} onChange={(e) => setForm({ ...form, numero_contrato: e.target.value })} className="mt-1" /></div>
              <div><Label>CPF/CNPJ</Label><Input value={form.cpf_cnpj} onChange={(e) => setForm({ ...form, cpf_cnpj: e.target.value })} className="mt-1" /></div>
            </div>
            <div><Label>Nome do Cliente *</Label><Input value={form.nome_cliente} onChange={(e) => setForm({ ...form, nome_cliente: e.target.value })} className="mt-1" /></div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div><Label>Ambientes</Label><Input type="number" value={form.quantidade_ambientes} onChange={(e) => setForm({ ...form, quantidade_ambientes: Number(e.target.value) })} className="mt-1" /></div>
              <div><Label>Valor do Contrato</Label><Input type="number" value={form.valor_contrato} onChange={(e) => setForm({ ...form, valor_contrato: Number(e.target.value) })} className="mt-1" /></div>
              <div><Label>Data Fechamento</Label><Input type="date" value={form.data_fechamento} onChange={(e) => setForm({ ...form, data_fechamento: e.target.value })} className="mt-1" /></div>
            </div>
            <div><Label>Projetista</Label><Input value={form.projetista} onChange={(e) => setForm({ ...form, projetista: e.target.value })} className="mt-1" /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAdd(false)}>Cancelar</Button>
            <Button onClick={handleAdd} disabled={saving}>{saving ? "Salvando..." : "Adicionar"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
