import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { supabase } from "@/lib/supabaseClient";
import { format, subMonths, startOfMonth, endOfMonth } from "date-fns";
import { ptBR } from "date-fns/locale";
import {
  BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Area, AreaChart,
} from "recharts";
import { Users, DollarSign, TrendingUp, Store, BarChart3, TrendingUp as LineIcon } from "lucide-react";

interface MonthData {
  month: string;
  label: string;
  clientes: number;
  contratos: number;
  receita: number;
  lojas: number;
}

type ChartMode = "bar" | "line";

const CustomTooltip = ({ active, payload, label, valueLabel, prefix }: any) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-popover border border-border rounded-lg shadow-lg px-3 py-2 text-sm">
      <p className="font-medium text-foreground mb-1">{label}</p>
      {payload.map((entry: any, i: number) => (
        <p key={i} className="text-muted-foreground flex items-center gap-2">
          <span className="w-2.5 h-2.5 rounded-full inline-block" style={{ backgroundColor: entry.color }} />
          {valueLabel || entry.name}: <span className="font-semibold text-foreground">{prefix}{typeof entry.value === "number" ? entry.value.toLocaleString("pt-BR") : entry.value}</span>
        </p>
      ))}
    </div>
  );
};

function ChartToggle({ mode, onChange }: { mode: ChartMode; onChange: (m: ChartMode) => void }) {
  return (
    <div className="flex gap-0.5 bg-muted rounded-md p-0.5">
      <Button
        variant={mode === "bar" ? "secondary" : "ghost"}
        size="icon"
        className="h-6 w-6"
        onClick={() => onChange("bar")}
        title="Barras"
      >
        <BarChart3 className="h-3 w-3" />
      </Button>
      <Button
        variant={mode === "line" ? "secondary" : "ghost"}
        size="icon"
        className="h-6 w-6"
        onClick={() => onChange("line")}
        title="Linha"
      >
        <TrendingUp className="h-3 w-3" />
      </Button>
    </div>
  );
}

export function AdminKpiCharts() {
  const [data, setData] = useState<MonthData[]>([]);
  const [loading, setLoading] = useState(true);
  const [clientMode, setClientMode] = useState<ChartMode>("bar");
  const [contractMode, setContractMode] = useState<ChartMode>("bar");
  const [revenueMode, setRevenueMode] = useState<ChartMode>("line");
  const [storeMode, setStoreMode] = useState<ChartMode>("bar");

  useEffect(() => {
    fetchMonthlyData();
  }, []);

  const fetchMonthlyData = async () => {
    setLoading(true);
    const now = new Date();
    const months: { start: Date; end: Date; label: string; key: string }[] = [];

    for (let i = 5; i >= 0; i--) {
      const ref = subMonths(now, i);
      months.push({
        start: startOfMonth(ref),
        end: endOfMonth(ref),
        label: format(ref, "MMM/yy", { locale: ptBR }),
        key: format(ref, "yyyy-MM"),
      });
    }

    const rangeStart = months[0].start.toISOString();
    const rangeEnd = months[months.length - 1].end.toISOString();

    const [clientsRes, closedRes, tenantsRes] = await Promise.all([
      supabase.from("clients").select("id, created_at").gte("created_at", rangeStart).lte("created_at", rangeEnd),
      supabase.from("clients").select("id, created_at").eq("status", "venda_fechada").gte("created_at", rangeStart).lte("created_at", rangeEnd),
      supabase.from("tenants").select("id, created_at").gte("created_at", rangeStart).lte("created_at", rangeEnd),
    ]);

    const clients = clientsRes.data || [];
    const closedClients = closedRes.data || [];
    const tenantsList = tenantsRes.data || [];

    let simMap: Record<string, number> = {};
    if (closedClients.length > 0) {
      const closedIds = closedClients.map(c => c.id);
      const { data: sims } = await supabase
        .from("simulations")
        .select("client_id, valor_tela, desconto1, desconto2, desconto3, created_at")
        .in("client_id", closedIds)
        .order("created_at", { ascending: false });

      if (sims) {
        sims.forEach((s: any) => {
          if (!simMap[s.client_id]) {
            const vt = Number(s.valor_tela) || 0;
            const d1 = Number(s.desconto1) || 0;
            const d2 = Number(s.desconto2) || 0;
            const d3 = Number(s.desconto3) || 0;
            simMap[s.client_id] = vt * (1 - d1 / 100) * (1 - d2 / 100) * (1 - d3 / 100);
          }
        });
      }
    }

    const inRange = (created: string, start: Date, end: Date) => {
      const d = new Date(created);
      return d >= start && d <= end;
    };

    const result: MonthData[] = months.map(m => {
      const mc = clients.filter(c => inRange(c.created_at, m.start, m.end));
      const mClosed = closedClients.filter(c => inRange(c.created_at, m.start, m.end));
      const mTenants = tenantsList.filter(t => inRange(t.created_at, m.start, m.end));
      const monthRevenue = mClosed.reduce((sum, c) => sum + (simMap[c.id] || 0), 0);

      return {
        month: m.key,
        label: m.label,
        clientes: mc.length,
        contratos: mClosed.length,
        receita: Math.round(monthRevenue * 100) / 100,
        lojas: mTenants.length,
      };
    });

    setData(result);
    setLoading(false);
  };

  if (loading) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {[1, 2, 3, 4].map(i => (
          <Card key={i}>
            <CardContent className="py-12 flex items-center justify-center">
              <div className="h-5 w-5 border-2 border-primary border-t-transparent rounded-full animate-spin" />
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  const renderChart = (
    dataKey: string,
    mode: ChartMode,
    color: string,
    tooltipLabel: string,
    prefix = "",
    yFormatter?: (v: number) => string,
  ) => {
    const commonProps = { data, margin: { top: 4, right: 8, left: 0, bottom: 0 } };
    const xAxis = <XAxis dataKey="label" tick={{ fontSize: 11 }} />;
    const yAxis = <YAxis allowDecimals={false} tick={{ fontSize: 11 }} tickFormatter={yFormatter} />;
    const grid = <CartesianGrid strokeDasharray="3 3" className="opacity-30" />;
    const tooltip = <Tooltip content={<CustomTooltip valueLabel={tooltipLabel} prefix={prefix} />} />;

    if (mode === "line") {
      return (
        <ResponsiveContainer width="100%" height={200}>
          <AreaChart {...commonProps}>
            <defs>
              <linearGradient id={`grad-${dataKey}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor={color} stopOpacity={0.25} />
                <stop offset="95%" stopColor={color} stopOpacity={0} />
              </linearGradient>
            </defs>
            {grid}{xAxis}{yAxis}{tooltip}
            <Area type="monotone" dataKey={dataKey} stroke={color} strokeWidth={2} fill={`url(#grad-${dataKey})`} dot={{ r: 3, fill: color }} activeDot={{ r: 5, strokeWidth: 2 }} />
          </AreaChart>
        </ResponsiveContainer>
      );
    }

    return (
      <ResponsiveContainer width="100%" height={200}>
        <BarChart {...commonProps}>
          {grid}{xAxis}{yAxis}{tooltip}
          <Bar dataKey={dataKey} fill={color} radius={[4, 4, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    );
  };

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      {/* Clientes */}
      <Card>
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm flex items-center gap-2">
              <Users className="h-4 w-4 text-accent" />
              Novos Clientes / Mês
            </CardTitle>
            <ChartToggle mode={clientMode} onChange={setClientMode} />
          </div>
        </CardHeader>
        <CardContent className="pt-0">
          {renderChart("clientes", clientMode, "hsl(var(--primary))", "Clientes")}
        </CardContent>
      </Card>

      {/* Contratos */}
      <Card>
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm flex items-center gap-2">
              <TrendingUp className="h-4 w-4 text-green-600" />
              Contratos Fechados / Mês
            </CardTitle>
            <ChartToggle mode={contractMode} onChange={setContractMode} />
          </div>
        </CardHeader>
        <CardContent className="pt-0">
          {renderChart("contratos", contractMode, "hsl(142, 70%, 40%)", "Contratos")}
        </CardContent>
      </Card>

      {/* Receita */}
      <Card>
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm flex items-center gap-2">
              <DollarSign className="h-4 w-4 text-accent" />
              Receita Mensal (Contratos)
            </CardTitle>
            <ChartToggle mode={revenueMode} onChange={setRevenueMode} />
          </div>
        </CardHeader>
        <CardContent className="pt-0">
          {renderChart("receita", revenueMode, "hsl(var(--primary))", "Receita", "R$ ", (v) => `${(v / 1000).toFixed(0)}k`)}
        </CardContent>
      </Card>

      {/* Lojas */}
      <Card>
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm flex items-center gap-2">
              <Store className="h-4 w-4 text-primary" />
              Novas Lojas / Mês
            </CardTitle>
            <ChartToggle mode={storeMode} onChange={setStoreMode} />
          </div>
        </CardHeader>
        <CardContent className="pt-0">
          {renderChart("lojas", storeMode, "hsl(var(--chart-2))", "Lojas")}
        </CardContent>
      </Card>
    </div>
  );
}
