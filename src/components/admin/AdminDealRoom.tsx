import { useState, useEffect, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  DollarSign, TrendingUp, Users, BarChart3, Trophy, Target,
  RefreshCw, Store, Percent, Calendar, ArrowUpRight, ArrowDownRight, LineChart as LineChartIcon,
  KeyRound, ExternalLink, Info, Video, Cpu, Signature, CreditCard,
} from "lucide-react";
import { Textarea } from "@/components/ui/textarea";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { supabase } from "@/lib/supabaseClient";
import { formatCurrency } from "@/lib/financing";
import { format, subMonths, startOfMonth, endOfMonth, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";
import { useDealRoom, type DealRoomMetrics, type VendorRank, type DealRoomTransaction } from "@/hooks/useDealRoom";
import {
  ChartContainer, ChartTooltip, ChartTooltipContent,
} from "@/components/ui/chart";
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, ResponsiveContainer,
  BarChart, Bar, Legend, Tooltip,
} from "recharts";

interface Tenant {
  id: string;
  nome_loja: string;
  plano: string;
  ativo: boolean;
}

export function AdminDealRoom() {
  const { getMetrics, loading } = useDealRoom();
  const [metrics, setMetrics] = useState<DealRoomMetrics | null>(null);
  const [ranking, setRanking] = useState<VendorRank[]>([]);
  const [transactions, setTransactions] = useState<DealRoomTransaction[]>([]);
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [filterTenant, setFilterTenant] = useState("all");
  const [filterPlan, setFilterPlan] = useState("all");
  const [filterDateFrom, setFilterDateFrom] = useState("");
  const [filterDateTo, setFilterDateTo] = useState("");

  // Usage monitoring
  const [usageData, setUsageData] = useState<{ tenant_id: string; nome_loja: string; plano: string; daily: number; total_reunioes: number; vendas: number; valor: number; receita_plataforma: number }[]>([]);

  const fetchAll = async () => {
    // Fetch tenants (with optional plan filter)
    const tenantQuery = supabase.from("tenants").select("id, nome_loja, plano, ativo").eq("ativo", true);
    if (filterPlan !== "all") tenantQuery.eq("plano", filterPlan);
    const { data: tData } = await tenantQuery;
    if (tData) setTenants(tData as any);

    // Fetch metrics
    const filters: any = {};
    if (filterTenant !== "all") filters.tenant_id = filterTenant;
    if (filterDateFrom) filters.date_from = filterDateFrom;
    if (filterDateTo) filters.date_to = filterDateTo;

    const result = await getMetrics(filters);
    if (result) {
      setMetrics(result.metrics);
      setRanking(result.ranking);
      setTransactions(result.transactions);
    }

    // Build usage monitoring data
    if (tData) {
      const usageRows = await Promise.all(
        (tData as Tenant[]).map(async (t) => {
          const today = new Date().toISOString().split("T")[0];
          const { count: dailyCount } = await supabase
            .from("dealroom_usage")
            .select("*", { count: "exact", head: true })
            .eq("tenant_id", t.id)
            .eq("usage_date", today);

          const { count: totalReunioes } = await supabase
            .from("dealroom_usage")
            .select("*", { count: "exact", head: true })
            .eq("tenant_id", t.id);

          const { data: txns } = await supabase
            .from("dealroom_transactions")
            .select("valor_venda, taxa_plataforma_valor")
            .eq("tenant_id", t.id);

          const vendas = txns?.length || 0;
          const valor = txns?.reduce((s, x) => s + Number((x as any).valor_venda), 0) || 0;
          const receita = txns?.reduce((s, x) => s + Number((x as any).taxa_plataforma_valor), 0) || 0;

          return {
            tenant_id: t.id,
            nome_loja: t.nome_loja,
            plano: t.plano,
            daily: dailyCount || 0,
            total_reunioes: totalReunioes || 0,
            vendas,
            valor,
            receita_plataforma: receita,
          };
        })
      );
      setUsageData(usageRows);
    }
  };

  // Build monthly chart data from transactions
  const monthlyData = useMemo(() => {
    if (!transactions.length) return [];
    const map = new Map<string, { vendas: number; receita: number; taxas: number }>();
    // Initialize last 6 months
    for (let i = 5; i >= 0; i--) {
      const d = subMonths(new Date(), i);
      const key = format(d, "yyyy-MM");
      map.set(key, { vendas: 0, receita: 0, taxas: 0 });
    }
    transactions.forEach(tx => {
      const key = tx.created_at.substring(0, 7); // yyyy-MM
      const entry = map.get(key);
      if (entry) {
        entry.vendas += 1;
        entry.receita += Number(tx.valor_venda);
        entry.taxas += Number(tx.taxa_plataforma_valor);
      }
    });
    return Array.from(map.entries()).map(([month, data]) => ({
      month: format(parseISO(`${month}-01`), "MMM/yy", { locale: ptBR }),
      ...data,
    }));
  }, [transactions]);

  // Period comparison: current month vs previous month
  const periodComparison = useMemo(() => {
    if (!transactions.length) return [];
    const now = new Date();
    const curStart = startOfMonth(now);
    const prevStart = startOfMonth(subMonths(now, 1));
    const prevEnd = endOfMonth(subMonths(now, 1));

    let curReceita = 0, curTaxas = 0, curVendas = 0;
    let prevReceita = 0, prevTaxas = 0, prevVendas = 0;

    transactions.forEach(tx => {
      const d = new Date(tx.created_at);
      if (d >= curStart) {
        curReceita += Number(tx.valor_venda);
        curTaxas += Number(tx.taxa_plataforma_valor);
        curVendas += 1;
      } else if (d >= prevStart && d <= prevEnd) {
        prevReceita += Number(tx.valor_venda);
        prevTaxas += Number(tx.taxa_plataforma_valor);
        prevVendas += 1;
      }
    });

    return [
      { periodo: format(prevStart, "MMM/yy", { locale: ptBR }), receita: prevReceita, taxas: prevTaxas, vendas: prevVendas },
      { periodo: format(curStart, "MMM/yy", { locale: ptBR }), receita: curReceita, taxas: curTaxas, vendas: curVendas },
    ];
  }, [transactions]);

  const chartConfig = {
    receita: { label: "Receita", color: "hsl(var(--primary))" },
    taxas: { label: "Taxas", color: "hsl(var(--accent))" },
    vendas: { label: "Vendas", color: "hsl(var(--secondary))" },
  };

  useEffect(() => { fetchAll(); }, [filterTenant, filterPlan, filterDateFrom, filterDateTo]);

  return (
    <div className="space-y-6">
      {/* Filters */}
      <div className="flex flex-wrap gap-4 items-end">
        <div>
          <Label className="text-xs">Loja</Label>
          <Select value={filterTenant} onValueChange={setFilterTenant}>
            <SelectTrigger className="w-48 mt-1"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todas as lojas</SelectItem>
              {tenants.map(t => (
                <SelectItem key={t.id} value={t.id}>{t.nome_loja}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label className="text-xs">Plano</Label>
          <Select value={filterPlan} onValueChange={setFilterPlan}>
            <SelectTrigger className="w-40 mt-1"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos os planos</SelectItem>
              <SelectItem value="trial">Trial</SelectItem>
              <SelectItem value="basico">Básico</SelectItem>
              <SelectItem value="premium">Premium</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label className="text-xs">De</Label>
          <Input type="date" value={filterDateFrom} onChange={e => setFilterDateFrom(e.target.value)} className="mt-1 w-40" />
        </div>
        <div>
          <Label className="text-xs">Até</Label>
          <Input type="date" value={filterDateTo} onChange={e => setFilterDateTo(e.target.value)} className="mt-1 w-40" />
        </div>
        <Button variant="outline" size="sm" onClick={fetchAll} className="gap-2">
          <RefreshCw className="h-3 w-3" /> Atualizar
        </Button>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
        {[
          { label: "Total Vendas", value: metrics?.totalVendas || 0, icon: TrendingUp, fmt: false },
          { label: "Valor Transacionado", value: metrics?.totalTransacionado || 0, icon: DollarSign, fmt: true },
          { label: "Receita Plataforma", value: metrics?.totalTaxas || 0, icon: Percent, fmt: true },
          { label: "Ticket Médio", value: metrics?.ticketMedio || 0, icon: BarChart3, fmt: true },
          { label: "Reuniões", value: metrics?.totalReunioes || 0, icon: Users, fmt: false },
          { label: "Conversão", value: `${(metrics?.taxaConversao || 0).toFixed(1)}%`, icon: Target, fmt: false },
        ].map((kpi) => (
          <Card key={kpi.label}>
            <CardContent className="p-4">
              <div className="flex items-center gap-2 mb-1">
                <kpi.icon className="h-4 w-4 text-primary shrink-0" />
                <span className="text-xs text-muted-foreground">{kpi.label}</span>
              </div>
              <p className="text-lg font-bold text-foreground">
                {kpi.fmt ? formatCurrency(kpi.value as number) : kpi.value}
              </p>
            </CardContent>
          </Card>
        ))}
      </div>

      <Tabs defaultValue="ranking" className="space-y-4">
        <TabsList>
          <TabsTrigger value="ranking" className="gap-2"><Trophy className="h-4 w-4" />Ranking Vendedores</TabsTrigger>
          <TabsTrigger value="monitoring" className="gap-2"><Store className="h-4 w-4" />Monitoramento Lojas</TabsTrigger>
          <TabsTrigger value="transactions" className="gap-2"><DollarSign className="h-4 w-4" />Transações</TabsTrigger>
          <TabsTrigger value="charts" className="gap-2"><LineChartIcon className="h-4 w-4" />Gráficos</TabsTrigger>
          <TabsTrigger value="apis" className="gap-2"><KeyRound className="h-4 w-4" />Configurar APIs</TabsTrigger>
        </TabsList>

        {/* Ranking */}
        <TabsContent value="ranking">
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <Trophy className="h-4 w-4 text-amber-500" /> Ranking de Vendedores
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-16">#</TableHead>
                    <TableHead>Vendedor</TableHead>
                    <TableHead className="text-right">Total Vendido</TableHead>
                    <TableHead className="text-right">Nº Vendas</TableHead>
                    <TableHead className="text-right">Conversão</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {ranking.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={5} className="text-center text-muted-foreground py-8">Nenhuma venda registrada</TableCell>
                    </TableRow>
                  ) : ranking.map((v) => (
                    <TableRow key={v.usuario_id}>
                      <TableCell>
                        <span className={`text-lg font-bold ${v.posicao === 1 ? "text-amber-500" : v.posicao === 2 ? "text-gray-400" : v.posicao === 3 ? "text-amber-700" : "text-muted-foreground"}`}>
                          {v.posicao === 1 ? "🥇" : v.posicao === 2 ? "🥈" : v.posicao === 3 ? "🥉" : `${v.posicao}º`}
                        </span>
                      </TableCell>
                      <TableCell className="font-medium">{v.nome}</TableCell>
                      <TableCell className="text-right font-semibold">{formatCurrency(v.total_vendido)}</TableCell>
                      <TableCell className="text-right">{v.vendas}</TableCell>
                      <TableCell className="text-right">
                        <Badge variant={v.taxa_conversao >= 50 ? "default" : "secondary"}>
                          {v.taxa_conversao.toFixed(1)}%
                        </Badge>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Monitoring */}
        <TabsContent value="monitoring">
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <Store className="h-4 w-4" /> Monitoramento de Uso por Loja
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Loja</TableHead>
                    <TableHead>Plano</TableHead>
                    <TableHead className="text-right">Uso Diário</TableHead>
                    <TableHead className="text-right">Total Reuniões</TableHead>
                    <TableHead className="text-right">Vendas</TableHead>
                    <TableHead className="text-right">Valor Gerado</TableHead>
                    <TableHead className="text-right">Receita Plataforma</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {usageData.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={7} className="text-center text-muted-foreground py-8">Carregando...</TableCell>
                    </TableRow>
                  ) : usageData.map((row) => (
                    <TableRow key={row.tenant_id}>
                      <TableCell className="font-medium">{row.nome_loja}</TableCell>
                      <TableCell>
                        <Badge variant={row.plano === "premium" ? "destructive" : row.plano === "basico" ? "default" : "secondary"}>
                          {row.plano === "premium" ? "Premium" : row.plano === "basico" ? "Básico" : "Trial"}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        {row.daily}
                        {row.plano === "basico" && row.daily >= 1 && (
                          <span className="ml-1 text-xs text-destructive">(limite)</span>
                        )}
                      </TableCell>
                      <TableCell className="text-right">{row.total_reunioes}</TableCell>
                      <TableCell className="text-right">{row.vendas}</TableCell>
                      <TableCell className="text-right">{formatCurrency(row.valor)}</TableCell>
                      <TableCell className="text-right font-semibold text-primary">{formatCurrency(row.receita_plataforma)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Transactions */}
        <TabsContent value="transactions">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Últimas Transações</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Data</TableHead>
                    <TableHead>Cliente</TableHead>
                    <TableHead>Vendedor</TableHead>
                    <TableHead>Pagamento</TableHead>
                    <TableHead className="text-right">Valor Venda</TableHead>
                    <TableHead className="text-right">Taxa (2%)</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {transactions.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={6} className="text-center text-muted-foreground py-8">Nenhuma transação</TableCell>
                    </TableRow>
                  ) : transactions.map((tx) => (
                    <TableRow key={tx.id}>
                      <TableCell className="text-sm">
                        {format(new Date(tx.created_at), "dd/MM/yyyy HH:mm", { locale: ptBR })}
                      </TableCell>
                      <TableCell>{tx.nome_cliente || "—"}</TableCell>
                      <TableCell>{tx.nome_vendedor || "—"}</TableCell>
                      <TableCell>{tx.forma_pagamento || "—"}</TableCell>
                      <TableCell className="text-right font-medium">{formatCurrency(tx.valor_venda)}</TableCell>
                      <TableCell className="text-right text-primary font-semibold">{formatCurrency(tx.taxa_plataforma_valor)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>
        {/* Charts */}
        <TabsContent value="charts" className="space-y-6">
          {/* Monthly Revenue Evolution */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <LineChartIcon className="h-4 w-4 text-primary" /> Evolução Mensal de Receita (últimos 6 meses)
              </CardTitle>
            </CardHeader>
            <CardContent>
              {monthlyData.length === 0 ? (
                <p className="text-center text-muted-foreground py-8">Nenhum dado disponível</p>
              ) : (
                <ChartContainer config={chartConfig} className="h-[300px] w-full">
                  <LineChart data={monthlyData}>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-border/50" />
                    <XAxis dataKey="month" className="text-xs" />
                    <YAxis tickFormatter={(v) => `R$${(v / 1000).toFixed(0)}k`} className="text-xs" />
                    <ChartTooltip content={<ChartTooltipContent formatter={(value, name) => {
                      const label = name === "receita" ? "Receita" : "Taxas";
                      return <span>{label}: {formatCurrency(Number(value))}</span>;
                    }} />} />
                    <Line type="monotone" dataKey="receita" stroke="hsl(var(--primary))" strokeWidth={2.5} dot={{ r: 4 }} name="receita" />
                    <Line type="monotone" dataKey="taxas" stroke="hsl(var(--accent))" strokeWidth={2} dot={{ r: 3 }} name="taxas" />
                  </LineChart>
                </ChartContainer>
              )}
            </CardContent>
          </Card>

          {/* Period Comparison */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <BarChart3 className="h-4 w-4 text-primary" /> Comparativo: Mês Atual vs Mês Anterior
              </CardTitle>
            </CardHeader>
            <CardContent>
              {periodComparison.length === 0 ? (
                <p className="text-center text-muted-foreground py-8">Nenhum dado disponível</p>
              ) : (
                <div className="space-y-4">
                  <ChartContainer config={chartConfig} className="h-[280px] w-full">
                    <BarChart data={periodComparison}>
                      <CartesianGrid strokeDasharray="3 3" className="stroke-border/50" />
                      <XAxis dataKey="periodo" className="text-xs" />
                      <YAxis tickFormatter={(v) => `R$${(v / 1000).toFixed(0)}k`} className="text-xs" />
                      <ChartTooltip content={<ChartTooltipContent formatter={(value, name) => {
                        const labels: Record<string, string> = { receita: "Receita", taxas: "Taxas", vendas: "Vendas" };
                        const isMonetary = name !== "vendas";
                        return <span>{labels[name as string] || name}: {isMonetary ? formatCurrency(Number(value)) : value}</span>;
                      }} />} />
                      <Bar dataKey="receita" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} name="receita" />
                      <Bar dataKey="taxas" fill="hsl(var(--accent))" radius={[4, 4, 0, 0]} name="taxas" />
                    </BarChart>
                  </ChartContainer>

                  {/* Delta summary */}
                  {periodComparison.length === 2 && (
                    <div className="grid grid-cols-3 gap-4">
                      {[
                        { label: "Receita", cur: periodComparison[1].receita, prev: periodComparison[0].receita, fmt: true },
                        { label: "Taxas", cur: periodComparison[1].taxas, prev: periodComparison[0].taxas, fmt: true },
                        { label: "Vendas", cur: periodComparison[1].vendas, prev: periodComparison[0].vendas, fmt: false },
                      ].map(d => {
                        const delta = d.prev > 0 ? ((d.cur - d.prev) / d.prev) * 100 : d.cur > 0 ? 100 : 0;
                        const up = delta >= 0;
                        return (
                          <div key={d.label} className="rounded-lg border p-3 text-center">
                            <p className="text-xs text-muted-foreground mb-1">{d.label}</p>
                            <p className="text-lg font-bold text-foreground">
                              {d.fmt ? formatCurrency(d.cur) : d.cur}
                            </p>
                            <div className={`flex items-center justify-center gap-1 text-xs mt-1 ${up ? "text-green-600" : "text-destructive"}`}>
                              {up ? <ArrowUpRight className="h-3 w-3" /> : <ArrowDownRight className="h-3 w-3" />}
                              {Math.abs(delta).toFixed(1)}% vs mês anterior
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* TAB: Configurar APIs */}
        <TabsContent value="apis" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <KeyRound className="h-4 w-4 text-primary" /> APIs Necessárias para o Deal Room
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground mb-4">
                O Deal Room utiliza serviços externos para videoconferência, pagamentos, assinatura digital e inteligência artificial.
                Configure as chaves de API abaixo nos <strong>Secrets do Supabase</strong> (Dashboard → Settings → Edge Function Secrets).
              </p>

              <Accordion type="multiple" className="space-y-2">
                {/* Jitsi Meet */}
                <AccordionItem value="jitsi" className="border rounded-lg px-4">
                  <AccordionTrigger className="py-3">
                    <div className="flex items-center gap-2">
                      <Video className="h-4 w-4 text-blue-500" />
                      <span className="font-medium">Jitsi Meet</span>
                      <Badge variant="secondary" className="ml-2 text-[10px]">Gratuito</Badge>
                    </div>
                  </AccordionTrigger>
                  <AccordionContent className="space-y-3 pb-4">
                    <div className="rounded-lg bg-muted/50 p-3 space-y-2">
                      <p className="text-sm font-medium text-foreground">Configuração</p>
                      <p className="text-xs text-muted-foreground">O Jitsi Meet público (<code>meet.jit.si</code>) funciona sem API key. Para usar um servidor próprio (JaaS):</p>
                      <ol className="text-xs text-muted-foreground list-decimal ml-4 space-y-1">
                        <li>Acesse <a href="https://jaas.8x8.vc" target="_blank" rel="noopener" className="text-primary underline">jaas.8x8.vc</a> e crie uma conta</li>
                        <li>Crie um novo App ID no painel</li>
                        <li>Copie o <strong>App ID</strong> e a <strong>API Key</strong></li>
                        <li>Adicione no Supabase Secrets: <code>JITSI_APP_ID</code> e <code>JITSI_API_KEY</code></li>
                      </ol>
                      <p className="text-xs text-muted-foreground mt-2">
                        <strong>Secret:</strong> <code>JITSI_APP_ID</code>, <code>JITSI_API_KEY</code> (opcional para servidor público)
                      </p>
                    </div>
                    <a href="https://jitsi.github.io/handbook/docs/dev-guide/dev-guide-iframe-api" target="_blank" rel="noopener" className="inline-flex items-center gap-1 text-xs text-primary hover:underline">
                      <ExternalLink className="h-3 w-3" /> Documentação do Jitsi IFrame API
                    </a>
                  </AccordionContent>
                </AccordionItem>

                {/* Daily.co */}
                <AccordionItem value="daily" className="border rounded-lg px-4">
                  <AccordionTrigger className="py-3">
                    <div className="flex items-center gap-2">
                      <Video className="h-4 w-4 text-green-500" />
                      <span className="font-medium">Daily.co</span>
                      <Badge variant="secondary" className="ml-2 text-[10px]">Freemium</Badge>
                    </div>
                  </AccordionTrigger>
                  <AccordionContent className="space-y-3 pb-4">
                    <div className="rounded-lg bg-muted/50 p-3 space-y-2">
                      <p className="text-sm font-medium text-foreground">Configuração</p>
                      <ol className="text-xs text-muted-foreground list-decimal ml-4 space-y-1">
                        <li>Acesse <a href="https://dashboard.daily.co" target="_blank" rel="noopener" className="text-primary underline">dashboard.daily.co</a> e crie uma conta gratuita</li>
                        <li>No painel, vá em <strong>Developers → API Keys</strong></li>
                        <li>Copie sua <strong>API Key</strong></li>
                        <li>Adicione no Supabase Secrets: <code>DAILY_API_KEY</code></li>
                      </ol>
                      <div className="rounded bg-amber-500/10 border border-amber-500/20 p-2 mt-2">
                        <p className="text-xs text-amber-700 dark:text-amber-400 flex items-center gap-1">
                          <Info className="h-3 w-3 shrink-0" /> Plano gratuito: até 100 participantes, 10.000 minutos/mês. Gravação requer plano pago.
                        </p>
                      </div>
                      <p className="text-xs text-muted-foreground mt-2">
                        <strong>Secret:</strong> <code>DAILY_API_KEY</code>
                      </p>
                    </div>
                    <a href="https://docs.daily.co/reference/rest-api" target="_blank" rel="noopener" className="inline-flex items-center gap-1 text-xs text-primary hover:underline">
                      <ExternalLink className="h-3 w-3" /> Documentação da API Daily.co
                    </a>
                  </AccordionContent>
                </AccordionItem>

                {/* Twilio Video */}
                <AccordionItem value="twilio" className="border rounded-lg px-4">
                  <AccordionTrigger className="py-3">
                    <div className="flex items-center gap-2">
                      <Video className="h-4 w-4 text-red-500" />
                      <span className="font-medium">Twilio Video</span>
                      <Badge variant="secondary" className="ml-2 text-[10px]">Pago</Badge>
                    </div>
                  </AccordionTrigger>
                  <AccordionContent className="space-y-3 pb-4">
                    <div className="rounded-lg bg-muted/50 p-3 space-y-2">
                      <p className="text-sm font-medium text-foreground">Configuração</p>
                      <ol className="text-xs text-muted-foreground list-decimal ml-4 space-y-1">
                        <li>Acesse <a href="https://console.twilio.com" target="_blank" rel="noopener" className="text-primary underline">console.twilio.com</a> e crie uma conta</li>
                        <li>No Dashboard, copie o <strong>Account SID</strong> e <strong>Auth Token</strong></li>
                        <li>Vá em <strong>Video → API Keys</strong> e crie uma nova key</li>
                        <li>Copie o <strong>API Key SID</strong> e o <strong>API Key Secret</strong></li>
                        <li>Adicione no Supabase Secrets:</li>
                      </ol>
                      <div className="bg-muted rounded p-2 font-mono text-[11px] space-y-0.5">
                        <p>TWILIO_ACCOUNT_SID</p>
                        <p>TWILIO_AUTH_TOKEN</p>
                        <p>TWILIO_API_KEY_SID</p>
                        <p>TWILIO_API_KEY_SECRET</p>
                      </div>
                      <div className="rounded bg-amber-500/10 border border-amber-500/20 p-2 mt-2">
                        <p className="text-xs text-amber-700 dark:text-amber-400 flex items-center gap-1">
                          <Info className="h-3 w-3 shrink-0" /> Twilio cobra por minuto de uso. Possui $15 de crédito grátis para testes.
                        </p>
                      </div>
                    </div>
                    <a href="https://www.twilio.com/docs/video" target="_blank" rel="noopener" className="inline-flex items-center gap-1 text-xs text-primary hover:underline">
                      <ExternalLink className="h-3 w-3" /> Documentação Twilio Video
                    </a>
                  </AccordionContent>
                </AccordionItem>

                {/* LiveKit */}
                <AccordionItem value="livekit" className="border rounded-lg px-4">
                  <AccordionTrigger className="py-3">
                    <div className="flex items-center gap-2">
                      <Video className="h-4 w-4 text-purple-500" />
                      <span className="font-medium">LiveKit</span>
                      <Badge variant="secondary" className="ml-2 text-[10px]">Open Source / Cloud</Badge>
                    </div>
                  </AccordionTrigger>
                  <AccordionContent className="space-y-3 pb-4">
                    <div className="rounded-lg bg-muted/50 p-3 space-y-2">
                      <p className="text-sm font-medium text-foreground">Configuração</p>
                      <ol className="text-xs text-muted-foreground list-decimal ml-4 space-y-1">
                        <li>Acesse <a href="https://cloud.livekit.io" target="_blank" rel="noopener" className="text-primary underline">cloud.livekit.io</a> e crie uma conta</li>
                        <li>Crie um novo projeto no painel</li>
                        <li>Vá em <strong>Settings → Keys</strong></li>
                        <li>Copie o <strong>API Key</strong> e <strong>API Secret</strong></li>
                        <li>Copie também a <strong>WebSocket URL</strong> (wss://...)</li>
                        <li>Adicione no Supabase Secrets:</li>
                      </ol>
                      <div className="bg-muted rounded p-2 font-mono text-[11px] space-y-0.5">
                        <p>LIVEKIT_API_KEY</p>
                        <p>LIVEKIT_API_SECRET</p>
                        <p>LIVEKIT_WS_URL</p>
                      </div>
                      <div className="rounded bg-green-500/10 border border-green-500/20 p-2 mt-2">
                        <p className="text-xs text-green-700 dark:text-green-400 flex items-center gap-1">
                          <Info className="h-3 w-3 shrink-0" /> LiveKit Cloud oferece 50 horas gratuitas/mês. Ideal para gravação e streaming de alta qualidade.
                        </p>
                      </div>
                    </div>
                    <a href="https://docs.livekit.io" target="_blank" rel="noopener" className="inline-flex items-center gap-1 text-xs text-primary hover:underline">
                      <ExternalLink className="h-3 w-3" /> Documentação LiveKit
                    </a>
                  </AccordionContent>
                </AccordionItem>

                {/* Stripe */}
                <AccordionItem value="stripe" className="border rounded-lg px-4">
                  <AccordionTrigger className="py-3">
                    <div className="flex items-center gap-2">
                      <CreditCard className="h-4 w-4 text-indigo-500" />
                      <span className="font-medium">Stripe (Pagamentos)</span>
                      <Badge variant="secondary" className="ml-2 text-[10px]">Obrigatório</Badge>
                    </div>
                  </AccordionTrigger>
                  <AccordionContent className="space-y-3 pb-4">
                    <div className="rounded-lg bg-muted/50 p-3 space-y-2">
                      <p className="text-sm font-medium text-foreground">Configuração</p>
                      <ol className="text-xs text-muted-foreground list-decimal ml-4 space-y-1">
                        <li>Acesse <a href="https://dashboard.stripe.com" target="_blank" rel="noopener" className="text-primary underline">dashboard.stripe.com</a></li>
                        <li>Vá em <strong>Developers → API Keys</strong></li>
                        <li>Copie a <strong>Secret Key</strong> (sk_live_... ou sk_test_...)</li>
                        <li>Adicione no Supabase Secrets: <code>STRIPE_SECRET_KEY</code></li>
                      </ol>
                      <p className="text-xs text-muted-foreground mt-2">
                        <strong>Secret:</strong> <code>STRIPE_SECRET_KEY</code>
                      </p>
                    </div>
                    <a href="https://docs.stripe.com/api" target="_blank" rel="noopener" className="inline-flex items-center gap-1 text-xs text-primary hover:underline">
                      <ExternalLink className="h-3 w-3" /> Documentação da API Stripe
                    </a>
                  </AccordionContent>
                </AccordionItem>

                {/* OpenAI */}
                <AccordionItem value="openai" className="border rounded-lg px-4">
                  <AccordionTrigger className="py-3">
                    <div className="flex items-center gap-2">
                      <Cpu className="h-4 w-4 text-emerald-500" />
                      <span className="font-medium">OpenAI (Agente IA)</span>
                      <Badge variant="secondary" className="ml-2 text-[10px]">Obrigatório</Badge>
                    </div>
                  </AccordionTrigger>
                  <AccordionContent className="space-y-3 pb-4">
                    <div className="rounded-lg bg-muted/50 p-3 space-y-2">
                      <p className="text-sm font-medium text-foreground">Configuração</p>
                      <ol className="text-xs text-muted-foreground list-decimal ml-4 space-y-1">
                        <li>Acesse <a href="https://platform.openai.com" target="_blank" rel="noopener" className="text-primary underline">platform.openai.com</a></li>
                        <li>Vá em <strong>API Keys</strong> e crie uma nova chave</li>
                        <li>Copie a chave gerada (sk-...)</li>
                        <li>Adicione no Supabase Secrets: <code>OPENAI_API_KEY</code></li>
                      </ol>
                      <p className="text-xs text-muted-foreground mt-2">
                        <strong>Secret:</strong> <code>OPENAI_API_KEY</code> — Usado pelo agente IA de negociação e pelo VendaZap AI.
                      </p>
                    </div>
                    <a href="https://platform.openai.com/docs/api-reference" target="_blank" rel="noopener" className="inline-flex items-center gap-1 text-xs text-primary hover:underline">
                      <ExternalLink className="h-3 w-3" /> Documentação da API OpenAI
                    </a>
                  </AccordionContent>
                </AccordionItem>

                {/* Gov.br / ICP-Brasil */}
                <AccordionItem value="govbr" className="border rounded-lg px-4">
                  <AccordionTrigger className="py-3">
                    <div className="flex items-center gap-2">
                      <Signature className="h-4 w-4 text-yellow-600" />
                      <span className="font-medium">Gov.br / ICP-Brasil (Assinatura Digital)</span>
                      <Badge variant="secondary" className="ml-2 text-[10px]">Opcional</Badge>
                    </div>
                  </AccordionTrigger>
                  <AccordionContent className="space-y-3 pb-4">
                    <div className="rounded-lg bg-muted/50 p-3 space-y-2">
                      <p className="text-sm font-medium text-foreground">Integração com Assinatura Gov.br</p>
                      <p className="text-xs text-muted-foreground">Para validar assinaturas digitais via Gov.br/ICP-Brasil, é necessário um provedor intermediário:</p>
                      <ol className="text-xs text-muted-foreground list-decimal ml-4 space-y-1">
                        <li>Contrate um serviço de assinatura digital compatível com ICP-Brasil (ex: <strong>D4Sign</strong>, <strong>DocuSign</strong>, <strong>Clicksign</strong>)</li>
                        <li>No painel do provedor, gere as credenciais de API</li>
                        <li>Adicione no Supabase Secrets conforme o provedor escolhido:</li>
                      </ol>
                      <div className="bg-muted rounded p-2 font-mono text-[11px] space-y-0.5">
                        <p>SIGNATURE_PROVIDER (d4sign | docusign | clicksign)</p>
                        <p>SIGNATURE_API_KEY</p>
                        <p>SIGNATURE_API_SECRET</p>
                      </div>
                    </div>
                    <div className="flex gap-3 flex-wrap">
                      <a href="https://d4sign.com.br/desenvolvedores" target="_blank" rel="noopener" className="inline-flex items-center gap-1 text-xs text-primary hover:underline">
                        <ExternalLink className="h-3 w-3" /> D4Sign API
                      </a>
                      <a href="https://developers.docusign.com" target="_blank" rel="noopener" className="inline-flex items-center gap-1 text-xs text-primary hover:underline">
                        <ExternalLink className="h-3 w-3" /> DocuSign API
                      </a>
                      <a href="https://developers.clicksign.com" target="_blank" rel="noopener" className="inline-flex items-center gap-1 text-xs text-primary hover:underline">
                        <ExternalLink className="h-3 w-3" /> Clicksign API
                      </a>
                    </div>
                  </AccordionContent>
                </AccordionItem>
              </Accordion>

              <div className="mt-6 rounded-lg border border-primary/20 bg-primary/5 p-4">
                <h4 className="text-sm font-semibold text-foreground flex items-center gap-2 mb-2">
                  <Info className="h-4 w-4 text-primary" /> Resumo de Secrets Necessários
                </h4>
                <div className="grid sm:grid-cols-2 gap-2 text-xs">
                  {[
                    { name: "OPENAI_API_KEY", label: "Agente IA", required: true },
                    { name: "STRIPE_SECRET_KEY", label: "Pagamentos", required: true },
                    { name: "JITSI_APP_ID", label: "Jitsi (JaaS)", required: false },
                    { name: "DAILY_API_KEY", label: "Daily.co", required: false },
                    { name: "TWILIO_ACCOUNT_SID", label: "Twilio", required: false },
                    { name: "TWILIO_API_KEY_SID", label: "Twilio Video", required: false },
                    { name: "LIVEKIT_API_KEY", label: "LiveKit", required: false },
                    { name: "LIVEKIT_WS_URL", label: "LiveKit WS", required: false },
                    { name: "SIGNATURE_API_KEY", label: "Assinatura Digital", required: false },
                  ].map((s) => (
                    <div key={s.name} className="flex items-center justify-between rounded bg-muted/50 px-2 py-1.5">
                      <code className="text-[11px]">{s.name}</code>
                      <Badge variant={s.required ? "default" : "outline"} className="text-[9px] h-4">
                        {s.required ? "Obrigatório" : "Opcional"}
                      </Badge>
                    </div>
                  ))}
                </div>
                <p className="text-[11px] text-muted-foreground mt-3">
                  Adicione os secrets em: <strong>Supabase Dashboard → Settings → Edge Function Secrets</strong>
                </p>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
