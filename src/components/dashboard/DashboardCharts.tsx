import { memo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Users } from "lucide-react";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, LineChart, Line,
} from "recharts";

const CHART_COLORS = [
  "hsl(200, 70%, 50%)", "hsl(160, 60%, 45%)", "hsl(30, 80%, 55%)",
  "hsl(340, 65%, 50%)", "hsl(260, 60%, 55%)", "hsl(80, 55%, 45%)",
  "hsl(10, 70%, 50%)", "hsl(190, 65%, 48%)",
];

const currencyFormatter = (v: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(v);

const chartTooltipStyle = {
  backgroundColor: "hsl(var(--card))",
  border: "1px solid hsl(var(--border))",
  borderRadius: "8px",
  fontSize: 13,
};

// ─── Evolution Line Chart ───
export const EvolutionChart = memo(function EvolutionChart({ data }: { data: { month: string; orcamentos: number; valor: number }[] }) {
  if (data.length === 0) return null;
  return (
    <Card>
      <CardHeader className="pb-2"><CardTitle className="text-base">Evolução dos Orçamentos</CardTitle></CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={280}>
          <LineChart data={data} margin={{ top: 8, right: 20, left: 8, bottom: 4 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
            <XAxis dataKey="month" tick={{ fontSize: 12, fill: "hsl(var(--muted-foreground))" }} />
            <YAxis yAxisId="valor" orientation="left" tickFormatter={currencyFormatter} tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} width={95} />
            <YAxis yAxisId="count" orientation="right" tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} width={40} />
            <Tooltip
              formatter={(value: number, name: string) => [name === "valor" ? currencyFormatter(value) : value, name === "valor" ? "Valor Total" : "Qtd. Orçamentos"]}
              contentStyle={chartTooltipStyle} labelStyle={{ color: "hsl(var(--foreground))", fontWeight: 600 }}
            />
            <Line yAxisId="valor" type="monotone" dataKey="valor" stroke="hsl(200, 70%, 50%)" strokeWidth={2.5} dot={{ r: 4, fill: "hsl(200, 70%, 50%)" }} name="valor" />
            <Line yAxisId="count" type="monotone" dataKey="orcamentos" stroke="hsl(160, 60%, 45%)" strokeWidth={2} strokeDasharray="5 5" dot={{ r: 3, fill: "hsl(160, 60%, 45%)" }} name="orcamentos" />
          </LineChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
});

// ─── Contracts Evolution Chart ───
export const ContractsEvolutionChart = memo(function ContractsEvolutionChart({ data }: { data: { month: string; contratos: number; valor: number }[] }) {
  if (data.length === 0) return null;
  return (
    <Card>
      <CardHeader className="pb-2"><CardTitle className="text-base">Evolução Mensal de Contratos Fechados</CardTitle></CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={280}>
          <LineChart data={data} margin={{ top: 8, right: 20, left: 8, bottom: 4 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
            <XAxis dataKey="month" tick={{ fontSize: 12, fill: "hsl(var(--muted-foreground))" }} />
            <YAxis yAxisId="valor" orientation="left" tickFormatter={currencyFormatter} tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} width={95} />
            <YAxis yAxisId="count" orientation="right" tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} width={40} />
            <Tooltip
              formatter={(value: number, name: string) => [name === "valor" ? currencyFormatter(value) : value, name === "valor" ? "Valor Total" : "Qtd. Contratos"]}
              contentStyle={chartTooltipStyle} labelStyle={{ color: "hsl(var(--foreground))", fontWeight: 600 }}
            />
            <Line yAxisId="valor" type="monotone" dataKey="valor" stroke="hsl(140, 60%, 40%)" strokeWidth={2.5} dot={{ r: 4, fill: "hsl(140, 60%, 40%)" }} name="valor" />
            <Line yAxisId="count" type="monotone" dataKey="contratos" stroke="hsl(200, 70%, 50%)" strokeWidth={2} strokeDasharray="5 5" dot={{ r: 3, fill: "hsl(200, 70%, 50%)" }} name="contratos" />
          </LineChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
});

// ─── Projetista Bar Chart ───
export const ProjetistaBarChart = memo(function ProjetistaBarChart({ data }: { data: { name: string; valor: number; clientes: number }[] }) {
  if (data.length === 0) return null;
  return (
    <Card className="lg:col-span-2">
      <CardHeader className="pb-2"><CardTitle className="text-base">Valor por Projetista</CardTitle></CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={260}>
          <BarChart data={data} margin={{ top: 8, right: 12, left: 8, bottom: 4 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
            <XAxis dataKey="name" tick={{ fontSize: 12, fill: "hsl(var(--muted-foreground))" }} />
            <YAxis tickFormatter={currencyFormatter} tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} width={90} />
            <Tooltip formatter={(value: number) => [currencyFormatter(value), "Valor"]} contentStyle={chartTooltipStyle} labelStyle={{ color: "hsl(var(--foreground))", fontWeight: 600 }} />
            <Bar dataKey="valor" radius={[6, 6, 0, 0]} maxBarSize={56}>
              {data.map((_, i) => (<Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
});

// ─── Indicador / Status Pie Chart ───
export const IndicadorPieChart = memo(function IndicadorPieChart({ data, title, fullWidth }: { data: { name: string; value: number }[]; title: string; fullWidth?: boolean }) {
  if (data.length === 0) return null;
  return (
    <Card className={fullWidth ? "lg:col-span-3" : ""}>
      <CardHeader className="pb-2"><CardTitle className="text-base">{title}</CardTitle></CardHeader>
      <CardContent className="flex items-center justify-center">
        <ResponsiveContainer width="100%" height={260}>
          <PieChart>
            <Pie data={data} cx="50%" cy="50%" innerRadius={50} outerRadius={85} paddingAngle={3} dataKey="value"
              label={({ name, percent }) => `${name} (${(percent * 100).toFixed(0)}%)`} labelLine={false} style={{ fontSize: 11 }}>
              {data.map((_, i) => (<Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />))}
            </Pie>
            <Tooltip formatter={(value: number) => [value, "Clientes"]} contentStyle={chartTooltipStyle} />
          </PieChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
});

// ─── Leads Pie Chart (with legend) ───
export const LeadsPieChart = memo(function LeadsPieChart({ data, title, legendLabel }: { data: { name: string; value: number }[]; title: string; legendLabel?: string }) {
  if (data.length === 0) return null;
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base flex items-center gap-2">
          {legendLabel && <Users className="h-4 w-4 text-primary" />}
          {title}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="flex flex-col md:flex-row items-center gap-6">
          <div className="w-[280px] h-[280px] flex-shrink-0">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={data} cx="50%" cy="50%" innerRadius={55} outerRadius={100} paddingAngle={3} dataKey="value"
                  label={({ name, percent }) => `${name} (${(percent * 100).toFixed(0)}%)`} labelLine={false} style={{ fontSize: 11 }}>
                  {data.map((_, i) => (<Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />))}
                </Pie>
                <Tooltip formatter={(value: number) => [value, legendLabel || "Leads"]} contentStyle={chartTooltipStyle} />
              </PieChart>
            </ResponsiveContainer>
          </div>
          <div className="space-y-3 flex-1">
            {data.map((d, i) => (
              <div key={d.name} className="flex items-center gap-3">
                <div className="h-4 w-4 rounded-full flex-shrink-0" style={{ backgroundColor: CHART_COLORS[i % CHART_COLORS.length] }} />
                <span className="text-sm text-foreground font-medium flex-1">{d.name}</span>
                <Badge variant="secondary" className="text-sm font-bold">{d.value}</Badge>
              </div>
            ))}
          </div>
        </div>
      </CardContent>
    </Card>
  );
});
