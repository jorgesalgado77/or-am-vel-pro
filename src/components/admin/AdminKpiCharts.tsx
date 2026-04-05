import { useState, useEffect, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { supabase } from "@/lib/supabaseClient";
import { format, subMonths, startOfMonth, endOfMonth } from "date-fns";
import { ptBR } from "date-fns/locale";
import {
  BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Legend, Area, AreaChart,
} from "recharts";
import { Users, DollarSign, TrendingUp } from "lucide-react";

interface MonthData {
  month: string;
  label: string;
  clientes: number;
  contratos: number;
  receita: number;
}

export function AdminKpiCharts() {
  const [data, setData] = useState<MonthData[]>([]);
  const [loading, setLoading] = useState(true);

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

    // Fetch all clients and closed sales for the 6-month range
    const rangeStart = months[0].start.toISOString();
    const rangeEnd = months[months.length - 1].end.toISOString();

    const [clientsRes, closedRes] = await Promise.all([
      supabase
        .from("clients")
        .select("id, created_at")
        .gte("created_at", rangeStart)
        .lte("created_at", rangeEnd),
      supabase
        .from("clients")
        .select("id, created_at")
        .eq("status", "venda_fechada")
        .gte("created_at", rangeStart)
        .lte("created_at", rangeEnd),
    ]);

    const clients = clientsRes.data || [];
    const closedClients = closedRes.data || [];

    // Fetch simulations for closed clients to get revenue
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

    // Group by month
    const result: MonthData[] = months.map(m => {
      const monthClients = clients.filter(c => {
        const d = new Date(c.created_at);
        return d >= m.start && d <= m.end;
      });

      const monthClosed = closedClients.filter(c => {
        const d = new Date(c.created_at);
        return d >= m.start && d <= m.end;
      });

      const monthRevenue = monthClosed.reduce((sum, c) => sum + (simMap[c.id] || 0), 0);

      return {
        month: m.key,
        label: m.label,
        clientes: monthClients.length,
        contratos: monthClosed.length,
        receita: Math.round(monthRevenue * 100) / 100,
      };
    });

    setData(result);
    setLoading(false);
  };

  const formatCurrency = (value: number) =>
    `R$ ${value.toLocaleString("pt-BR", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;

  if (loading) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {[1, 2, 3].map(i => (
          <Card key={i}>
            <CardContent className="py-12 flex items-center justify-center">
              <div className="h-5 w-5 border-2 border-primary border-t-transparent rounded-full animate-spin" />
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
      {/* Clientes */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2">
            <Users className="h-4 w-4 text-accent" />
            Novos Clientes / Mês
          </CardTitle>
        </CardHeader>
        <CardContent className="pt-0">
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={data}>
              <CartesianGrid strokeDasharray="3 3" className="opacity-30" />
              <XAxis dataKey="label" tick={{ fontSize: 11 }} />
              <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
              <Tooltip
                formatter={(value: number) => [value, "Clientes"]}
                contentStyle={{ fontSize: 12, borderRadius: 8 }}
              />
              <Bar dataKey="clientes" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      {/* Contratos */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2">
            <TrendingUp className="h-4 w-4 text-green-600" />
            Contratos Fechados / Mês
          </CardTitle>
        </CardHeader>
        <CardContent className="pt-0">
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={data}>
              <CartesianGrid strokeDasharray="3 3" className="opacity-30" />
              <XAxis dataKey="label" tick={{ fontSize: 11 }} />
              <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
              <Tooltip
                formatter={(value: number) => [value, "Contratos"]}
                contentStyle={{ fontSize: 12, borderRadius: 8 }}
              />
              <Bar dataKey="contratos" fill="hsl(142, 70%, 40%)" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      {/* Receita */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2">
            <DollarSign className="h-4 w-4 text-accent" />
            Receita Mensal (Contratos)
          </CardTitle>
        </CardHeader>
        <CardContent className="pt-0">
          <ResponsiveContainer width="100%" height={200}>
            <AreaChart data={data}>
              <defs>
                <linearGradient id="revenueGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" className="opacity-30" />
              <XAxis dataKey="label" tick={{ fontSize: 11 }} />
              <YAxis tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} tick={{ fontSize: 11 }} />
              <Tooltip
                formatter={(value: number) => [formatCurrency(value), "Receita"]}
                contentStyle={{ fontSize: 12, borderRadius: 8 }}
              />
              <Area
                type="monotone"
                dataKey="receita"
                stroke="hsl(var(--primary))"
                strokeWidth={2}
                fill="url(#revenueGrad)"
              />
            </AreaChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>
    </div>
  );
}
