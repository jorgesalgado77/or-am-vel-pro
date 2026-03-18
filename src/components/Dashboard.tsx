import { useMemo, useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Users, Calculator, TrendingUp, UserCheck, AlertTriangle, Eye, EyeOff, ClipboardList, Search, RefreshCw, Plus } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { formatCurrency } from "@/lib/financing";
import { useCompanySettings } from "@/hooks/useCompanySettings";
import { useIndicadores } from "@/hooks/useIndicadores";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { addDays, isPast, format, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, LineChart, Line,
} from "recharts";
import type { Database } from "@/integrations/supabase/types";

type Client = Database["public"]["Tables"]["clients"]["Row"];

interface LastSimInfo {
  valor_final: number;
  created_at: string;
}

interface DashboardProps {
  clients: Client[];
  lastSims: Record<string, LastSimInfo>;
  allSimulations?: { created_at: string; valor_final: number }[];
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

type ChartKey = "evolucao" | "projetista" | "indicador";

export function Dashboard({ clients, lastSims, allSimulations = [] }: DashboardProps) {
  const { settings } = useCompanySettings();
  const { indicadores } = useIndicadores();
  const [visibleCharts, setVisibleCharts] = useState<Record<ChartKey, boolean>>({
    evolucao: false,
    projetista: false,
    indicador: false,
  });

  const toggleChart = (key: ChartKey) => {
    setVisibleCharts(prev => ({ ...prev, [key]: !prev[key] }));
  };

  const stats = useMemo(() => {
    const totalClients = clients.length;
    const clientsWithSim = clients.filter(c => lastSims[c.id]).length;
    const clientsWithoutSim = totalClients - clientsWithSim;

    const expired = clients.filter(c => {
      const sim = lastSims[c.id];
      if (!sim) return false;
      return isPast(addDays(new Date(sim.created_at), settings.budget_validity_days));
    }).length;

    const totalValue = Object.values(lastSims).reduce((sum, s) => sum + s.valor_final, 0);

    const byProjetista: Record<string, { count: number; total: number; expired: number }> = {};
    clients.forEach(c => {
      const name = c.vendedor || "Sem projetista";
      if (!byProjetista[name]) byProjetista[name] = { count: 0, total: 0, expired: 0 };
      byProjetista[name].count++;
      const sim = lastSims[c.id];
      if (sim) {
        byProjetista[name].total += sim.valor_final;
        if (isPast(addDays(new Date(sim.created_at), settings.budget_validity_days))) {
          byProjetista[name].expired++;
        }
      }
    });

    const byIndicador: Record<string, { nome: string; comissao: number; count: number; total: number; comissaoTotal: number }> = {};
    clients.forEach(c => {
      if (!c.indicador_id) return;
      const ind = indicadores.find(i => i.id === c.indicador_id);
      if (!ind) return;
      if (!byIndicador[c.indicador_id]) {
        byIndicador[c.indicador_id] = { nome: ind.nome, comissao: ind.comissao_percentual, count: 0, total: 0, comissaoTotal: 0 };
      }
      byIndicador[c.indicador_id].count++;
      const sim = lastSims[c.id];
      if (sim) {
        byIndicador[c.indicador_id].total += sim.valor_final;
        byIndicador[c.indicador_id].comissaoTotal += sim.valor_final * (ind.comissao_percentual / 100);
      }
    });

    return {
      totalClients, clientsWithSim, clientsWithoutSim, expired, totalValue,
      byProjetista: Object.entries(byProjetista).sort((a, b) => b[1].total - a[1].total),
      byIndicador: Object.entries(byIndicador).sort((a, b) => b[1].total - a[1].total),
    };
  }, [clients, lastSims, settings.budget_validity_days, indicadores]);

  // Line chart data: aggregate simulations by month
  const lineData = useMemo(() => {
    if (allSimulations.length === 0) return [];
    const byMonth: Record<string, { count: number; total: number }> = {};
    allSimulations.forEach(s => {
      const key = format(parseISO(s.created_at), "yyyy-MM");
      if (!byMonth[key]) byMonth[key] = { count: 0, total: 0 };
      byMonth[key].count++;
      byMonth[key].total += s.valor_final;
    });
    return Object.entries(byMonth)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([month, data]) => ({
        month: format(parseISO(month + "-01"), "MMM/yy", { locale: ptBR }),
        orcamentos: data.count,
        valor: data.total,
      }));
  }, [allSimulations]);

  const barData = stats.byProjetista.map(([name, data]) => ({
    name,
    valor: data.total,
    clientes: data.count,
  }));

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

  const chartToggles: { key: ChartKey; label: string }[] = [
    { key: "evolucao", label: "Evolução" },
    { key: "projetista", label: "Projetista" },
    { key: "indicador", label: "Indicador" },
  ];

  return (
    <div className="space-y-6">
      {/* KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
        <KpiCard icon={Users} label="Total de Clientes" value={String(stats.totalClients)} />
        <KpiCard icon={Calculator} label="Com Orçamento" value={String(stats.clientsWithSim)} accent />
        <KpiCard icon={UserCheck} label="Sem Orçamento" value={String(stats.clientsWithoutSim)} />
        <KpiCard icon={AlertTriangle} label="Expirados" value={String(stats.expired)} destructive={stats.expired > 0} />
        <KpiCard icon={TrendingUp} label="Valor Total" value={formatCurrency(stats.totalValue)} accent />
      </div>

      {/* Chart visibility toggles */}
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
              <p className="text-sm text-muted-foreground text-center py-8">Nenhuma simulação registrada</p>
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

      {/* Bar + Pie Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {visibleCharts.projetista && (
          <Card className="lg:col-span-2">
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Valor por Projetista</CardTitle>
            </CardHeader>
            <CardContent>
              {barData.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-8">Nenhum dado</p>
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
                <p className="text-sm text-muted-foreground text-center py-8">Nenhum dado</p>
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

      {/* Tables Row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Detalhes por Projetista</CardTitle>
          </CardHeader>
          <CardContent>
            {stats.byProjetista.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-4">Nenhum dado</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow className="bg-secondary/50">
                    <TableHead className="font-medium">Projetista</TableHead>
                    <TableHead className="font-medium text-center">Clientes</TableHead>
                    <TableHead className="font-medium text-center">Expirados</TableHead>
                    <TableHead className="font-medium text-right">Valor Total</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {stats.byProjetista.map(([name, data]) => (
                    <TableRow key={name}>
                      <TableCell className="font-medium text-foreground">{name}</TableCell>
                      <TableCell className="text-center"><Badge variant="secondary">{data.count}</Badge></TableCell>
                      <TableCell className="text-center">
                        {data.expired > 0 ? <Badge variant="destructive" className="text-xs">{data.expired}</Badge> : <span className="text-muted-foreground">0</span>}
                      </TableCell>
                      <TableCell className="text-right tabular-nums font-medium">{formatCurrency(data.total)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Detalhes por Indicador</CardTitle>
          </CardHeader>
          <CardContent>
            {stats.byIndicador.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-4">Nenhum indicador vinculado</p>
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
                  {stats.byIndicador.map(([id, data]) => (
                    <TableRow key={id}>
                      <TableCell className="font-medium text-foreground">
                        {data.nome} <span className="text-muted-foreground text-xs">({data.comissao}%)</span>
                      </TableCell>
                      <TableCell className="text-center"><Badge variant="secondary">{data.count}</Badge></TableCell>
                      <TableCell className="text-right tabular-nums font-medium">{formatCurrency(data.total)}</TableCell>
                      <TableCell className="text-right tabular-nums font-medium text-primary">{formatCurrency(data.comissaoTotal)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Contratos Fechados - Acompanhamento */}
      <ContractTrackingList />
    </div>
  );
}

function KpiCard({ icon: Icon, label, value, accent, destructive }: {
  icon: React.ElementType; label: string; value: string; accent?: boolean; destructive?: boolean;
}) {
  return (
    <Card className={destructive ? "border-destructive/30" : ""}>
      <CardContent className="p-4 flex items-center gap-3">
        <div className={`p-2 rounded-lg ${destructive ? "bg-destructive/10" : accent ? "bg-primary/10" : "bg-secondary"}`}>
          <Icon className={`h-5 w-5 ${destructive ? "text-destructive" : accent ? "text-primary" : "text-muted-foreground"}`} />
        </div>
        <div>
          <p className="text-xs text-muted-foreground">{label}</p>
          <p className={`text-lg font-bold ${destructive ? "text-destructive" : "text-foreground"}`}>{value}</p>
        </div>
      </CardContent>
    </Card>
  );
}

const STATUS_OPTIONS = [
  { value: "medicao", label: "Medição" },
  { value: "liberacao", label: "Liberação" },
  { value: "entrega", label: "Entrega" },
  { value: "montagem", label: "Montagem" },
  { value: "assistencia", label: "Ass.Técnica" },
  { value: "finalizado", label: "Finalizado" },
];

const STATUS_COLORS: Record<string, string> = {
  medicao: "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200",
  liberacao: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200",
  entrega: "bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200",
  montagem: "bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200",
  assistencia: "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200",
  finalizado: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200",
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
  const [trackings, setTrackings] = useState<TrackingRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState({
    numero_contrato: "", nome_cliente: "", cpf_cnpj: "",
    quantidade_ambientes: 0, valor_contrato: 0, data_fechamento: "", projetista: "",
  });
  const [saving, setSaving] = useState(false);

  const fetchTrackings = async () => {
    setLoading(true);
    const { data } = await supabase
      .from("client_tracking")
      .select("*")
      .order("created_at", { ascending: false });
    if (data) setTrackings(data as any);
    setLoading(false);
  };

  useEffect(() => { fetchTrackings(); }, []);

  const handleStatusChange = async (id: string, newStatus: string) => {
    const { error } = await supabase
      .from("client_tracking")
      .update({ status: newStatus, updated_at: new Date().toISOString() } as any)
      .eq("id", id);
    if (error) toast.error("Erro ao atualizar status");
    else {
      toast.success("Status atualizado!");
      setTrackings((prev) => prev.map((t) => t.id === id ? { ...t, status: newStatus } : t));
    }
  };

  const handleAdd = async () => {
    if (!form.numero_contrato.trim() || !form.nome_cliente.trim()) {
      toast.error("Preencha número do contrato e nome do cliente"); return;
    }
    setSaving(true);
    const { data: clientData } = await supabase
      .from("clients").select("id").ilike("nome", `%${form.nome_cliente.trim()}%`).limit(1).single();

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
    } as any);
    setSaving(false);
    if (error) toast.error("Erro ao adicionar");
    else {
      toast.success("Contrato adicionado!");
      setShowAdd(false);
      setForm({ numero_contrato: "", nome_cliente: "", cpf_cnpj: "", quantidade_ambientes: 0, valor_contrato: 0, data_fechamento: "", projetista: "" });
      fetchTrackings();
    }
  };

  const filtered = trackings.filter((t) =>
    t.numero_contrato.toLowerCase().includes(search.toLowerCase()) ||
    t.nome_cliente.toLowerCase().includes(search.toLowerCase()) ||
    (t.projetista || "").toLowerCase().includes(search.toLowerCase())
  );

  const getStatusLabel = (val: string) => STATUS_OPTIONS.find((s) => s.value === val)?.label || val;

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
            <div className="grid grid-cols-2 gap-3">
              <div><Label>Nº Contrato *</Label><Input value={form.numero_contrato} onChange={(e) => setForm({ ...form, numero_contrato: e.target.value })} className="mt-1" /></div>
              <div><Label>CPF/CNPJ</Label><Input value={form.cpf_cnpj} onChange={(e) => setForm({ ...form, cpf_cnpj: e.target.value })} className="mt-1" /></div>
            </div>
            <div><Label>Nome do Cliente *</Label><Input value={form.nome_cliente} onChange={(e) => setForm({ ...form, nome_cliente: e.target.value })} className="mt-1" /></div>
            <div className="grid grid-cols-3 gap-3">
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
