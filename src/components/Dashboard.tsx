import { useMemo, useState, useEffect, useCallback, lazy, Suspense } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Progress } from "@/components/ui/progress";
import {
  Users, Calculator, TrendingUp, UserCheck, AlertTriangle, Eye, EyeOff,
  FileCheck, DollarSign, Megaphone, Share2, UserPlus, Store,
} from "lucide-react";
import { KpiCard } from "@/components/dashboard/DashboardKpiCard";
import { DashboardDateFilter } from "@/components/dashboard/DashboardDateFilter";
import { formatCurrency } from "@/lib/financing";
import { useCompanySettings } from "@/hooks/useCompanySettings";
import { useIndicadores } from "@/hooks/useIndicadores";
import { useCargos } from "@/hooks/useCargos";
import { supabase } from "@/lib/supabaseClient";
import { getResolvedTenantId } from "@/contexts/TenantContext";
import { useComissaoPolicy } from "@/hooks/useComissaoPolicy";
import { addDays, isPast, format, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";
import type { Database } from "@/integrations/supabase/types";
import { type DateFilterPreset, getDateRange, isInRange } from "@/lib/dateFilterUtils";
import { useMetasTetos } from "@/hooks/useMetasTetos";
import { useCurrentUser } from "@/hooks/useCurrentUser";
import { AIWidgetsSkeleton, ChartsSkeleton, TablesSkeleton } from "@/components/dashboard/DashboardSkeletons";

// Lazy-loaded heavy sub-components
const EvolutionChart = lazy(() => import("@/components/dashboard/DashboardCharts").then(m => ({ default: m.EvolutionChart })));
const ContractsEvolutionChart = lazy(() => import("@/components/dashboard/DashboardCharts").then(m => ({ default: m.ContractsEvolutionChart })));
const ProjetistaBarChart = lazy(() => import("@/components/dashboard/DashboardCharts").then(m => ({ default: m.ProjetistaBarChart })));
const IndicadorPieChart = lazy(() => import("@/components/dashboard/DashboardCharts").then(m => ({ default: m.IndicadorPieChart })));
const LeadsPieChart = lazy(() => import("@/components/dashboard/DashboardCharts").then(m => ({ default: m.LeadsPieChart })));
const DashboardProjetistaTable = lazy(() => import("@/components/dashboard/DashboardProjetistaTable").then(m => ({ default: m.DashboardProjetistaTable })));
const DashboardIndicadorTable = lazy(() => import("@/components/dashboard/DashboardIndicadorTable").then(m => ({ default: m.DashboardIndicadorTable })));
const TopSellingProductsChart = lazy(() => import("@/components/dashboard/TopSellingProductsChart").then(m => ({ default: m.TopSellingProductsChart })));
const LowStockAlerts = lazy(() => import("@/components/dashboard/LowStockAlerts").then(m => ({ default: m.LowStockAlerts })));
const ContractTrackingList = lazy(() => import("@/components/dashboard/ContractTrackingList").then(m => ({ default: m.ContractTrackingList })));
const ProfileCompletenessCard = lazy(() => import("@/components/ProfileCompletenessCard").then(m => ({ default: m.ProfileCompletenessCard })));
const DealInsightsWidget = lazy(() => import("@/components/dashboard/DealInsightsWidget").then(m => ({ default: m.DealInsightsWidget })));
const HighResistanceAlerts = lazy(() => import("@/components/dashboard/HighResistanceAlerts").then(m => ({ default: m.HighResistanceAlerts })));
const CDEUrgencyWidget = lazy(() => import("@/components/dashboard/CDEUrgencyWidget").then(m => ({ default: m.CDEUrgencyWidget })));
const AIInsightsWidget = lazy(() => import("@/components/dashboard/AIInsightsWidget").then(m => ({ default: m.AIInsightsWidget })));
const MeasurementCalendarWidget = lazy(() => import("@/components/dashboard/MeasurementCalendarWidget").then(m => ({ default: m.MeasurementCalendarWidget })));

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

type ChartKey = "evolucao" | "projetista" | "indicador" | "contratos" | "leads_origem" | "vendedor_leads";

export function Dashboard({ clients, lastSims, allSimulations = [], onOpenProfile, onOpenSettings }: DashboardProps) {
  const { settings } = useCompanySettings();
  const { indicadores } = useIndicadores();
  const { cargos } = useCargos();
  const { policy: comissaoPolicyDash } = useComissaoPolicy();
  const { metaLoja } = useMetasTetos();
  const { currentUser } = useCurrentUser();
  const isAdminOrGerente = ["administrador", "gerente"].includes(currentUser?.cargo_nome?.toLowerCase() || "");

  const [visibleCharts, setVisibleCharts] = useState<Record<ChartKey, boolean>>({
    evolucao: false, projetista: false, indicador: false, contratos: false, leads_origem: false, vendedor_leads: false,
  });

  const [leadProjetistaFilter, setLeadProjetistaFilter] = useState<string>("todos");
  const [datePreset, setDatePreset] = useState<DateFilterPreset>("mes_atual");
  const [customStart, setCustomStart] = useState("");
  const [customEnd, setCustomEnd] = useState("");

  const dateRange = useMemo(() => getDateRange(datePreset, customStart, customEnd), [datePreset, customStart, customEnd]);

  // Contract tracking data
  const [trackingData, setTrackingData] = useState<{ count: number; total: number }>({ count: 0, total: 0 });
  const [trackingRaw, setTrackingRaw] = useState<{ valor_contrato: number; dateRef: string }[]>([]);
  const [contractClientIds, setContractClientIds] = useState<Set<string>>(new Set());

  const fetchTrackingStats = useCallback(async () => {
    const tenantId = await getResolvedTenantId();
    let contractQuery = supabase.from("client_contracts").select("client_id, created_at");
    if (tenantId) contractQuery = contractQuery.eq("tenant_id", tenantId);
    const { data: contracts } = await contractQuery;

    if (!contracts || contracts.length === 0) {
      setTrackingRaw([]); setTrackingData({ count: 0, total: 0 }); setContractClientIds(new Set()); return;
    }

    const cIds = new Set((contracts as any[]).map(c => c.client_id));
    setContractClientIds(cIds);

    let trackQuery = supabase.from("client_tracking").select("client_id, valor_contrato, data_fechamento, created_at");
    if (tenantId) trackQuery = trackQuery.eq("tenant_id", tenantId);
    const { data: trackData } = await trackQuery;

    const trackMap = new Map<string, { valor_contrato: number; dateRef: string }>();
    if (trackData) {
      (trackData as any[]).forEach(t => {
        if (cIds.has(t.client_id)) {
          trackMap.set(t.client_id, { valor_contrato: Number(t.valor_contrato) || 0, dateRef: t.data_fechamento || t.created_at });
        }
      });
    }

    const all: { valor_contrato: number; dateRef: string }[] = [];
    cIds.forEach(clientId => {
      const tracked = trackMap.get(clientId);
      if (tracked) { all.push(tracked); }
      else {
        const contract = (contracts as any[]).find(c => c.client_id === clientId);
        all.push({ valor_contrato: 0, dateRef: contract?.created_at || new Date().toISOString() });
      }
    });

    const filtered = all.filter(t => isInRange(t.dateRef, dateRange.start, dateRange.end));
    setTrackingRaw(filtered);
    setTrackingData({ count: filtered.length, total: filtered.reduce((sum, t) => sum + t.valor_contrato, 0) });
  }, [dateRange]);

  useEffect(() => { fetchTrackingStats(); }, [fetchTrackingStats]);

  const toggleChart = useCallback((key: ChartKey) => {
    setVisibleCharts(prev => ({ ...prev, [key]: !prev[key] }));
  }, []);

  const budgetValidityDays = settings.budget_validity_days;

  // Filtered data by date range
  const filteredClients = useMemo(() => clients.filter(c => isInRange(c.created_at, dateRange.start, dateRange.end)), [clients, dateRange]);
  const filteredSimulations = useMemo(() => allSimulations.filter(s => isInRange(s.created_at, dateRange.start, dateRange.end)), [allSimulations, dateRange]);
  const filteredLastSims = useMemo(() => {
    const filteredIds = new Set(filteredClients.map(c => c.id));
    const result: Record<string, LastSimInfo> = {};
    for (const [id, sim] of Object.entries(lastSims)) {
      if (filteredIds.has(id) && isInRange(sim.created_at, dateRange.start, dateRange.end)) result[id] = sim;
    }
    return result;
  }, [filteredClients, lastSims, dateRange]);

  // Stats computation
  const stats = useMemo(() => {
    const totalClients = filteredClients.length;
    const clientsWithSim = filteredClients.filter(c => filteredLastSims[c.id]).length;
    const clientsWithoutSim = totalClients - clientsWithSim;
    const expired = filteredClients.filter(c => {
      const sim = filteredLastSims[c.id];
      if (!sim) return false;
      return isPast(addDays(new Date(sim.created_at), budgetValidityDays));
    }).length;

    const closedClients = filteredClients.filter(c => contractClientIds.has(c.id));
    const openClientsWithSim = filteredClients.filter(c => !contractClientIds.has(c.id) && filteredLastSims[c.id]);
    const totalValueOrcamentos = openClientsWithSim.reduce((sum, c) => {
      const s = filteredLastSims[c.id];
      return sum + (s ? (s.valor_com_desconto || s.valor_final) : 0);
    }, 0);

    const faturamentoContratos = Array.from(contractClientIds).reduce((sum, clientId) => {
      const s = lastSims[clientId] || filteredLastSims[clientId];
      return sum + (s ? (s.valor_com_desconto || s.valor_final) : 0);
    }, 0);

    const taxaConversao = totalClients > 0 ? (closedClients.length / totalClients) * 100 : 0;
    const ticketMedio = openClientsWithSim.length > 0 ? totalValueOrcamentos / openClientsWithSim.length : 0;

    const byProjetista: Record<string, { count: number; total: number; expired: number; closed: number; closedTotal: number }> = {};
    filteredClients.forEach(c => {
      const name = c.vendedor || "Sem projetista";
      if (!byProjetista[name]) byProjetista[name] = { count: 0, total: 0, expired: 0, closed: 0, closedTotal: 0 };
      byProjetista[name].count++;
      if (contractClientIds.has(c.id)) {
        byProjetista[name].closed++;
        const sim = filteredLastSims[c.id];
        if (sim) byProjetista[name].closedTotal += sim.valor_com_desconto || sim.valor_final;
      }
      const sim = filteredLastSims[c.id];
      if (sim) {
        byProjetista[name].total += sim.valor_com_desconto || sim.valor_final;
        if (isPast(addDays(new Date(sim.created_at), budgetValidityDays))) byProjetista[name].expired++;
      }
    });

    const byIndicador: Record<string, { nome: string; comissao: number; count: number; total: number; comissaoTotal: number; clientes: { nome: string; orcamento: string }[] }> = {};
    filteredClients.forEach(c => {
      if (!c.indicador_id || !contractClientIds.has(c.id)) return;
      const ind = indicadores.find(i => i.id === c.indicador_id);
      if (!ind) return;
      if (!byIndicador[c.indicador_id]) byIndicador[c.indicador_id] = { nome: ind.nome, comissao: ind.comissao_percentual, count: 0, total: 0, comissaoTotal: 0, clientes: [] };
      byIndicador[c.indicador_id].count++;
      const sim = filteredLastSims[c.id];
      if (sim) {
        const val = sim.valor_com_desconto || sim.valor_final;
        byIndicador[c.indicador_id].total += val;
        byIndicador[c.indicador_id].comissaoTotal += val * (ind.comissao_percentual / 100);
      }
      byIndicador[c.indicador_id].clientes.push({ nome: c.nome || "—", orcamento: (c as any).numero_orcamento || "—" });
    });

    return {
      totalClients, clientsWithSim, clientsWithoutSim, expired, totalValue: totalValueOrcamentos,
      ticketMedio, taxaConversao, closedClients: closedClients.length, faturamentoContratos,
      byProjetista: Object.entries(byProjetista).sort((a, b) => b[1].total - a[1].total),
      byIndicador: Object.entries(byIndicador).sort((a, b) => b[1].total - a[1].total),
    };
  }, [filteredClients, filteredLastSims, lastSims, budgetValidityDays, indicadores, contractClientIds]);

  // Chart data
  const lineData = useMemo(() => {
    if (filteredSimulations.length === 0) return [];
    const byMonth: Record<string, { count: number; total: number }> = {};
    filteredSimulations.forEach(s => {
      const key = format(parseISO(s.created_at), "yyyy-MM");
      if (!byMonth[key]) byMonth[key] = { count: 0, total: 0 };
      byMonth[key].count++;
      byMonth[key].total += s.valor_com_desconto || s.valor_final;
    });
    return Object.entries(byMonth).sort(([a], [b]) => a.localeCompare(b)).map(([month, data]) => ({
      month: format(parseISO(month + "-01"), "MMM/yy", { locale: ptBR }), orcamentos: data.count, valor: data.total,
    }));
  }, [filteredSimulations]);

  const barData = useMemo(() => stats.byProjetista.map(([name, data]) => ({ name, valor: data.total, clientes: data.count })), [stats.byProjetista]);

  const pieData = useMemo(() => {
    if (stats.byIndicador.length > 0) return stats.byIndicador.map(([, data]) => ({ name: data.nome, value: data.count }));
    return [
      { name: "Com Orçamento", value: stats.clientsWithSim },
      { name: "Sem Orçamento", value: stats.clientsWithoutSim },
      ...(stats.expired > 0 ? [{ name: "Expirados", value: stats.expired }] : []),
    ].filter(d => d.value > 0);
  }, [stats]);

  const contractsLineData = useMemo(() => {
    if (trackingRaw.length === 0) return [];
    const byMonth: Record<string, { count: number; total: number }> = {};
    trackingRaw.forEach(t => {
      const key = format(new Date(t.dateRef), "yyyy-MM");
      if (!byMonth[key]) byMonth[key] = { count: 0, total: 0 };
      byMonth[key].count++;
      byMonth[key].total += t.valor_contrato;
    });
    return Object.entries(byMonth).sort(([a], [b]) => a.localeCompare(b)).map(([month, data]) => ({
      month: format(parseISO(month + "-01"), "MMM/yy", { locale: ptBR }), contratos: data.count, valor: data.total,
    }));
  }, [trackingRaw]);

  // Lead source data
  const projetistaNames = useMemo(() => {
    const names = new Set(filteredClients.map(c => c.vendedor || "Sem projetista"));
    return Array.from(names).sort();
  }, [filteredClients]);

  const filteredLeadsBySource = useMemo(() => {
    const src = { landing_page: 0, afiliado: 0, indicacao: 0, link: 0, manual: 0, total: 0 };
    const clientsToCount = leadProjetistaFilter === "todos" ? filteredClients : filteredClients.filter(c => (c.vendedor || "Sem projetista") === leadProjetistaFilter);
    clientsToCount.forEach(c => {
      const origem = (c as any).origem_lead;
      if (!origem || origem === "manual") src.manual++;
      else if (origem === "landing_page" || origem === "site" || origem === "funil_loja") src.landing_page++;
      else if (origem === "afiliado" || origem === "affiliate") src.afiliado++;
      else if (origem === "indicacao" || origem === "referral") src.indicacao++;
      else if (origem === "link" || origem === "compartilhado") src.link++;
      else src.manual++;
      if (origem && origem !== "manual") src.total++;
    });
    return src;
  }, [filteredClients, leadProjetistaFilter]);

  const leadsPieData = useMemo(() => [
    { name: "Landing Page", value: filteredLeadsBySource.landing_page },
    { name: "Afiliados", value: filteredLeadsBySource.afiliado },
    { name: "Indicação", value: filteredLeadsBySource.indicacao },
    { name: "Link Compartilhado", value: filteredLeadsBySource.link },
    { name: "Manual / Loja", value: filteredLeadsBySource.manual },
  ].filter(d => d.value > 0), [filteredLeadsBySource]);

  const vendedorLeadsPieData = useMemo(() => {
    const byVendedor: Record<string, number> = {};
    filteredClients.forEach(c => { const name = c.vendedor || "Sem vendedor"; byVendedor[name] = (byVendedor[name] || 0) + 1; });
    return Object.entries(byVendedor).map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value).filter(d => d.value > 0);
  }, [filteredClients]);

  const chartToggles: { key: ChartKey; label: string }[] = useMemo(() => [
    { key: "evolucao", label: "Evolução" }, { key: "contratos", label: "Contratos" },
    { key: "projetista", label: "Projetista" }, { key: "indicador", label: "Indicador" },
    { key: "leads_origem", label: "Leads por Origem" }, { key: "vendedor_leads", label: "Leads por Vendedor" },
  ], []);

  // Skeleton fallbacks are now imported from DashboardSkeletons

  return (
    <div className="space-y-6">
      <Suspense fallback={<AIWidgetsSkeleton />}>
        <ProfileCompletenessCard onOpenProfile={onOpenProfile} onOpenSettings={onOpenSettings} />
        <DealInsightsWidget />
        <HighResistanceAlerts />
        <CDEUrgencyWidget />
        <AIInsightsWidget />
      </Suspense>

      {/* Date Filter */}
      <DashboardDateFilter
        datePreset={datePreset} onPresetChange={setDatePreset}
        customStart={customStart} customEnd={customEnd}
        onCustomStartChange={setCustomStart} onCustomEndChange={setCustomEnd}
        dateRange={dateRange}
      />

      {/* Primary KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 xl:grid-cols-5 gap-4">
        <KpiCard icon={Users} label="Total de Clientes" value={String(stats.totalClients)} />
        <KpiCard icon={Calculator} label="Com Orçamento" value={String(stats.clientsWithSim)} accent />
        <KpiCard icon={TrendingUp} label="Valor Total Orçamentos" value={formatCurrency(stats.totalValue)} accent />
        <KpiCard icon={FileCheck} label="Contratos Fechados" value={String(stats.closedClients)} success />
        <KpiCard icon={DollarSign} label="Faturamento Contratos" value={formatCurrency(stats.faturamentoContratos)} success />
      </div>

      {/* Secondary KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard icon={DollarSign} label="Ticket Médio" value={formatCurrency(stats.ticketMedio)} accent />
        <KpiCard icon={TrendingUp} label="Taxa de Conversão" value={`${stats.taxaConversao.toFixed(1)}%`} accent={stats.taxaConversao > 0} />
        <KpiCard icon={AlertTriangle} label="Orç. Expirados" value={String(stats.expired)} destructive={stats.expired > 0} />
        <KpiCard icon={UserCheck} label="Sem Orçamento" value={String(stats.clientsWithoutSim)} />
      </div>

      {/* Meta Loja */}
      {isAdminOrGerente && metaLoja && (
        <Card className="border-primary/30 bg-primary/5">
          <CardContent className="pt-4">
            <div className="flex items-center gap-3 mb-3">
              <div className="p-2 rounded-lg bg-primary/10"><Store className="h-5 w-5 text-primary" /></div>
              <div className="flex-1">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-semibold text-foreground">Meta Loja — Mês Atual</h3>
                  <Badge variant={stats.faturamentoContratos >= metaLoja.valor ? "default" : "secondary"} className="text-xs">
                    {stats.faturamentoContratos >= metaLoja.valor ? "✓ Atingida" : "Em andamento"}
                  </Badge>
                </div>
                <p className="text-xs text-muted-foreground">Meta: {formatCurrency(metaLoja.valor)}</p>
              </div>
            </div>
            <div className="grid grid-cols-3 gap-4 mb-3">
              <div className="text-center">
                <p className="text-lg font-bold text-primary">{formatCurrency(stats.faturamentoContratos)}</p>
                <p className="text-[10px] text-muted-foreground">Faturado</p>
              </div>
              <div className="text-center">
                <p className="text-lg font-bold text-foreground">{metaLoja.valor > 0 ? ((stats.faturamentoContratos / metaLoja.valor) * 100).toFixed(1) : "0"}%</p>
                <p className="text-[10px] text-muted-foreground">Atingido</p>
              </div>
              <div className="text-center">
                <p className="text-lg font-bold text-destructive">{metaLoja.valor > 0 ? Math.max(0, 100 - (stats.faturamentoContratos / metaLoja.valor) * 100).toFixed(1) : "100"}%</p>
                <p className="text-[10px] text-muted-foreground">Faltante</p>
              </div>
            </div>
            <Progress value={metaLoja.valor > 0 ? Math.min(100, (stats.faturamentoContratos / metaLoja.valor) * 100) : 0} className="h-3" />
          </CardContent>
        </Card>
      )}

      {/* Lead Sources */}
      <Card>
        <CardContent className="p-4 space-y-3">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
              <Megaphone className="h-4 w-4 text-primary" /> Leads por Origem
            </h3>
            <Select value={leadProjetistaFilter} onValueChange={setLeadProjetistaFilter}>
              <SelectTrigger className="w-[180px] h-8 text-sm"><SelectValue placeholder="Todos os projetistas" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Todos os projetistas</SelectItem>
                {projetistaNames.map(name => (<SelectItem key={name} value={name}>{name}</SelectItem>))}
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

      {/* Chart Toggles */}
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-xs text-muted-foreground font-medium">Gráficos:</span>
        {chartToggles.map(({ key, label }) => (
          <Button key={key} variant={visibleCharts[key] ? "default" : "outline"} size="sm" className="gap-1.5 h-7 text-xs" onClick={() => toggleChart(key)}>
            {visibleCharts[key] ? <Eye className="h-3 w-3" /> : <EyeOff className="h-3 w-3" />}
            {label}
          </Button>
        ))}
      </div>

      {/* Lazy-loaded charts */}
      <Suspense fallback={<ChartsSkeleton />}>
        {visibleCharts.evolucao && <EvolutionChart data={lineData} />}
        {visibleCharts.contratos && <ContractsEvolutionChart data={contractsLineData} />}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {visibleCharts.projetista && <ProjetistaBarChart data={barData} />}
          {visibleCharts.indicador && (
            <IndicadorPieChart
              data={pieData}
              title={stats.byIndicador.length > 0 ? "Clientes por Indicador" : "Status dos Clientes"}
              fullWidth={!visibleCharts.projetista}
            />
          )}
        </div>
        {visibleCharts.leads_origem && <LeadsPieChart data={leadsPieData} title="Distribuição de Leads por Origem" />}
        {visibleCharts.vendedor_leads && <LeadsPieChart data={vendedorLeadsPieData} title="Distribuição de Leads por Vendedor" legendLabel="Leads" />}
      </Suspense>

      {/* Lazy-loaded tables */}
      <Suspense fallback={<TablesSkeleton />}>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <DashboardProjetistaTable byProjetista={stats.byProjetista} cargos={cargos} comissaoPolicy={comissaoPolicyDash} />
          <DashboardIndicadorTable byIndicador={stats.byIndicador} />
        </div>
      </Suspense>

      {/* Lazy-loaded bottom sections */}
      <Suspense fallback={<ChartsSkeleton />}>
        <TopSellingProductsChart />
        <LowStockAlerts />
        <ContractTrackingList clients={clients} lastSims={lastSims} />
      </Suspense>
    </div>
  );
}
