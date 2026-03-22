import {useMemo} from "react";
import {Card, CardContent, CardHeader, CardTitle} from "@/components/ui/card";
import {format, subMonths} from "date-fns";
import {ptBR} from "date-fns/locale";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, LineChart, Line, Legend, PieChart, Pie, Cell
} from "recharts";

interface Conversion {
  id: string;
  affiliate_id: string;
  affiliate_name?: string;
  amount: number;
  commission_amount: number;
  status: string;
  created_at: string;
}

interface Affiliate {
  id: string;
  name: string;
  status: string;
  created_at: string;
}

interface Props {
  conversions: Conversion[];
  affiliates: Affiliate[];
}

const COLORS = ["hsl(142, 71%, 45%)", "hsl(217, 91%, 60%)", "hsl(45, 93%, 47%)", "hsl(0, 84%, 60%)"];

export function AffiliateCharts({ conversions, affiliates }: Props) {
  const monthlyData = useMemo(() => {
    const months: Record<string, { month: string; conversoes: number; receita: number; comissao: number }> = {};

    // Last 6 months
    for (let i = 5; i >= 0; i--) {
      const d = subMonths(new Date(), i);
      const key = format(d, "yyyy-MM");
      const label = format(d, "MMM/yy", { locale: ptBR });
      months[key] = { month: label, conversoes: 0, receita: 0, comissao: 0 };
    }

    conversions.forEach(c => {
      if (c.status === "rejected") return;
      const key = format(new Date(c.created_at), "yyyy-MM");
      if (months[key]) {
        months[key].conversoes += 1;
        months[key].receita += c.amount || 0;
        months[key].comissao += c.commission_amount || 0;
      }
    });

    return Object.values(months);
  }, [conversions]);

  const statusData = useMemo(() => {
    const counts: Record<string, number> = { pending: 0, approved: 0, paid: 0, rejected: 0 };
    conversions.forEach(c => { counts[c.status] = (counts[c.status] || 0) + 1; });
    return [
      { name: "Pendente", value: counts.pending },
      { name: "Aprovada", value: counts.approved },
      { name: "Paga", value: counts.paid },
      { name: "Rejeitada", value: counts.rejected },
    ].filter(d => d.value > 0);
  }, [conversions]);

  const topAffiliates = useMemo(() => {
    const map: Record<string, { name: string; total: number; count: number }> = {};
    conversions.forEach(c => {
      if (c.status === "rejected") return;
      if (!map[c.affiliate_id]) {
        map[c.affiliate_id] = { name: c.affiliate_name || "—", total: 0, count: 0 };
      }
      map[c.affiliate_id].total += c.amount || 0;
      map[c.affiliate_id].count += 1;
    });
    return Object.values(map).sort((a, b) => b.total - a.total).slice(0, 5);
  }, [conversions]);

  const formatCurrency = (v: number) => `R$ ${v.toFixed(0)}`;

  const hasData = conversions.length > 0;

  if (!hasData) {
    return (
      <Card>
        <CardContent className="py-12 text-center text-muted-foreground">
          Nenhuma conversão registrada ainda. Os gráficos aparecerão quando houver dados.
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {/* Monthly Revenue & Commissions */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Receita e Comissão Mensal</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={monthlyData}>
                <CartesianGrid strokeDasharray="3 3" className="opacity-30" />
                <XAxis dataKey="month" tick={{ fontSize: 12 }} />
                <YAxis tickFormatter={formatCurrency} tick={{ fontSize: 11 }} />
                <Tooltip formatter={(v: number) => `R$ ${v.toFixed(2)}`} />
                <Legend />
                <Bar dataKey="receita" name="Receita" fill="hsl(217, 91%, 60%)" radius={[4, 4, 0, 0]} />
                <Bar dataKey="comissao" name="Comissão" fill="hsl(142, 71%, 45%)" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Conversões por Mês</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={280}>
              <LineChart data={monthlyData}>
                <CartesianGrid strokeDasharray="3 3" className="opacity-30" />
                <XAxis dataKey="month" tick={{ fontSize: 12 }} />
                <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
                <Tooltip />
                <Line type="monotone" dataKey="conversoes" name="Conversões" stroke="hsl(262, 83%, 58%)" strokeWidth={2} dot={{ r: 4 }} />
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      {/* Status Pie + Top Affiliates */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {statusData.length > 0 && (
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Status das Conversões</CardTitle>
            </CardHeader>
            <CardContent className="flex items-center justify-center">
              <ResponsiveContainer width="100%" height={250}>
                <PieChart>
                  <Pie data={statusData} cx="50%" cy="50%" innerRadius={50} outerRadius={90} paddingAngle={4} dataKey="value" label={({ name, value }) => `${name}: ${value}`}>
                    {statusData.map((_, i) => (
                      <Cell key={i} fill={COLORS[i % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        )}

        {topAffiliates.length > 0 && (
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Top Afiliados por Receita</CardTitle>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={250}>
                <BarChart data={topAffiliates} layout="vertical">
                  <CartesianGrid strokeDasharray="3 3" className="opacity-30" />
                  <XAxis type="number" tickFormatter={formatCurrency} tick={{ fontSize: 11 }} />
                  <YAxis type="category" dataKey="name" width={100} tick={{ fontSize: 11 }} />
                  <Tooltip formatter={(v: number) => `R$ ${v.toFixed(2)}`} />
                  <Bar dataKey="total" name="Receita" fill="hsl(45, 93%, 47%)" radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
