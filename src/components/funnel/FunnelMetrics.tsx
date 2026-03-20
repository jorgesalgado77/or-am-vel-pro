import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Loader2, Users, TrendingUp, Globe, Calendar } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from "recharts";
import { format, subDays, startOfDay } from "date-fns";
import { ptBR } from "date-fns/locale";

interface LeadMetric {
  total: number;
  hoje: number;
  semana: number;
  convertidos: number;
  porDia: { dia: string; leads: number }[];
  porOrigem: { origem: string; total: number }[];
}

const COLORS = [
  "hsl(var(--primary))",
  "hsl(var(--chart-2))",
  "hsl(var(--chart-3))",
  "hsl(var(--chart-4))",
  "hsl(var(--chart-5))",
];

const ORIGIN_LABELS: Record<string, string> = {
  site: "Landing Page",
  whatsapp: "WhatsApp",
  api: "API",
  manual: "Manual",
  indicacao: "Indicação",
};

export function FunnelMetrics() {
  const { user } = useAuth();
  const [metrics, setMetrics] = useState<LeadMetric | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user?.tenant_id) return;

    const load = async () => {
      const now = new Date();
      const sevenDaysAgo = subDays(now, 6);

      // Buscar todos os clients do tenant
      const { data: clients } = await supabase
        .from("clients")
        .select("id, created_at, origem, status")
        .eq("tenant_id", user.tenant_id)
        .gte("created_at", subDays(now, 30).toISOString())
        .order("created_at", { ascending: true });

      if (!clients) {
        setMetrics({ total: 0, hoje: 0, semana: 0, convertidos: 0, porDia: [], porOrigem: [] });
        setLoading(false);
        return;
      }

      const todayStr = format(now, "yyyy-MM-dd");
      const weekAgoStr = format(sevenDaysAgo, "yyyy-MM-dd");

      const hoje = clients.filter(
        (c) => format(new Date(c.created_at), "yyyy-MM-dd") === todayStr
      ).length;

      const semana = clients.filter(
        (c) => format(new Date(c.created_at), "yyyy-MM-dd") >= weekAgoStr
      ).length;

      const convertidos = clients.filter(
        (c) => c.status === "venda_fechada" || c.status === "contrato_assinado"
      ).length;

      // Agrupar por dia (últimos 7 dias)
      const porDiaMap: Record<string, number> = {};
      for (let i = 6; i >= 0; i--) {
        const d = format(subDays(now, i), "yyyy-MM-dd");
        porDiaMap[d] = 0;
      }
      clients.forEach((c) => {
        const d = format(new Date(c.created_at), "yyyy-MM-dd");
        if (d in porDiaMap) porDiaMap[d]++;
      });
      const porDia = Object.entries(porDiaMap).map(([dia, leads]) => ({
        dia: format(new Date(dia + "T12:00:00"), "dd/MM", { locale: ptBR }),
        leads,
      }));

      // Agrupar por origem
      const origemMap: Record<string, number> = {};
      clients.forEach((c) => {
        const o = (c as any).origem || "manual";
        origemMap[o] = (origemMap[o] || 0) + 1;
      });
      const porOrigem = Object.entries(origemMap)
        .map(([origem, total]) => ({ origem, total }))
        .sort((a, b) => b.total - a.total);

      setMetrics({
        total: clients.length,
        hoje,
        semana,
        convertidos,
        porDia,
        porOrigem,
      });
      setLoading(false);
    };

    load();
  }, [user?.tenant_id]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!metrics) return null;

  const taxaConversao =
    metrics.total > 0 ? ((metrics.convertidos / metrics.total) * 100).toFixed(1) : "0";

  return (
    <div className="space-y-4">
      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card className="border-none shadow-md bg-gradient-to-br from-primary/5 to-primary/10">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 text-muted-foreground text-xs font-medium mb-1">
              <Users className="h-3.5 w-3.5" /> Total (30d)
            </div>
            <p className="text-2xl font-bold tabular-nums">{metrics.total}</p>
          </CardContent>
        </Card>
        <Card className="border-none shadow-md bg-gradient-to-br from-chart-2/5 to-chart-2/10">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 text-muted-foreground text-xs font-medium mb-1">
              <Calendar className="h-3.5 w-3.5" /> Hoje
            </div>
            <p className="text-2xl font-bold tabular-nums">{metrics.hoje}</p>
          </CardContent>
        </Card>
        <Card className="border-none shadow-md bg-gradient-to-br from-chart-3/5 to-chart-3/10">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 text-muted-foreground text-xs font-medium mb-1">
              <TrendingUp className="h-3.5 w-3.5" /> Conversão
            </div>
            <p className="text-2xl font-bold tabular-nums">{taxaConversao}%</p>
          </CardContent>
        </Card>
        <Card className="border-none shadow-md bg-gradient-to-br from-chart-4/5 to-chart-4/10">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 text-muted-foreground text-xs font-medium mb-1">
              <Globe className="h-3.5 w-3.5" /> Semana
            </div>
            <p className="text-2xl font-bold tabular-nums">{metrics.semana}</p>
          </CardContent>
        </Card>
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Leads por dia */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Leads Captados (Últimos 7 dias)
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-[200px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={metrics.porDia}>
                  <XAxis dataKey="dia" fontSize={11} tickLine={false} axisLine={false} />
                  <YAxis fontSize={11} tickLine={false} axisLine={false} allowDecimals={false} />
                  <Tooltip
                    contentStyle={{
                      borderRadius: "8px",
                      border: "1px solid hsl(var(--border))",
                      background: "hsl(var(--popover))",
                      fontSize: "12px",
                    }}
                  />
                  <Bar dataKey="leads" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        {/* Leads por origem */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Leads por Origem
            </CardTitle>
          </CardHeader>
          <CardContent>
            {metrics.porOrigem.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-8">
                Nenhum lead captado ainda
              </p>
            ) : (
              <div className="flex items-center gap-4">
                <div className="h-[200px] w-[200px] flex-shrink-0">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={metrics.porOrigem}
                        dataKey="total"
                        nameKey="origem"
                        cx="50%"
                        cy="50%"
                        outerRadius={80}
                        innerRadius={40}
                      >
                        {metrics.porOrigem.map((_, i) => (
                          <Cell key={i} fill={COLORS[i % COLORS.length]} />
                        ))}
                      </Pie>
                      <Tooltip
                        formatter={(value: number, name: string) => [
                          value,
                          ORIGIN_LABELS[name] || name,
                        ]}
                        contentStyle={{
                          borderRadius: "8px",
                          border: "1px solid hsl(var(--border))",
                          background: "hsl(var(--popover))",
                          fontSize: "12px",
                        }}
                      />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
                <div className="space-y-2 flex-1">
                  {metrics.porOrigem.map((o, i) => (
                    <div key={o.origem} className="flex items-center gap-2 text-sm">
                      <div
                        className="h-3 w-3 rounded-full flex-shrink-0"
                        style={{ backgroundColor: COLORS[i % COLORS.length] }}
                      />
                      <span className="text-muted-foreground truncate">
                        {ORIGIN_LABELS[o.origem] || o.origem}
                      </span>
                      <Badge variant="secondary" className="ml-auto text-xs">
                        {o.total}
                      </Badge>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
