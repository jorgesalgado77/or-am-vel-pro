import React from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { formatCurrency } from "@/lib/financing";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell,
} from "recharts";
import { CHART_COLORS } from "@/hooks/useFinancialData";
import type { useFinancialData } from "@/hooks/useFinancialData";

type FinData = ReturnType<typeof useFinancialData>;

interface Props {
  fin: FinData;
}

export const FinancialAnalysisTab = React.memo(function FinancialAnalysisTab({ fin }: Props) {
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm">Despesas por Categoria</CardTitle></CardHeader>
          <CardContent>
            <div className="h-56">
              {fin.categoryData.length === 0 ? (
                <div className="flex items-center justify-center h-full text-muted-foreground text-sm">Sem dados</div>
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={fin.categoryData} cx="50%" cy="50%" outerRadius={80} dataKey="value"
                      label={({ name, value }) => `${name}: ${formatCurrency(value)}`}>
                      {fin.categoryData.map((_, i) => <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />)}
                    </Pie>
                    <Tooltip formatter={(v: number) => formatCurrency(v)} />
                  </PieChart>
                </ResponsiveContainer>
              )}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm">Composição dos Custos</CardTitle></CardHeader>
          <CardContent>
            <div className="space-y-3 pt-2">
              {[
                { label: "Contas Fixas", value: fin.contasFixas, color: "bg-primary" },
                { label: "Salários", value: fin.totalSalarios, color: "bg-chart-2" },
                { label: "Comissões", value: fin.totalComissoes, color: "bg-chart-3" },
              ].map(item => {
                const pct = fin.breakEven > 0 ? (item.value / fin.breakEven) * 100 : 0;
                return (
                  <div key={item.label}>
                    <div className="flex justify-between text-sm mb-1">
                      <span>{item.label}</span>
                      <span className="font-medium tabular-nums">{formatCurrency(item.value)} ({pct.toFixed(0)}%)</span>
                    </div>
                    <div className="h-2 bg-muted rounded-full overflow-hidden">
                      <div className={`h-full rounded-full ${item.color}`} style={{ width: `${pct}%` }} />
                    </div>
                  </div>
                );
              })}
              <Separator className="my-3" />
              <div className="flex justify-between font-bold text-sm">
                <span>Total (Ponto de Equilíbrio)</span>
                <span className="text-primary">{formatCurrency(fin.breakEven)}</span>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">Faturamento vs Custos</CardTitle>
          <CardDescription className="text-xs">Comparativo do mês atual</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="h-48">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={[
                { name: "Faturamento", valor: fin.faturamento },
                { name: "Custos Fixos", valor: fin.contasFixas },
                { name: "Folha", valor: fin.totalFolha },
                { name: "Ponto Equilíbrio", valor: fin.breakEven },
              ]}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" />
                <XAxis dataKey="name" tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" />
                <YAxis tickFormatter={(v) => formatCurrency(v)} tick={{ fontSize: 10 }} stroke="hsl(var(--muted-foreground))" />
                <Tooltip formatter={(v: number) => formatCurrency(v)} />
                <Bar dataKey="valor" radius={[4, 4, 0, 0]}>
                  {[0, 1, 2, 3].map(i => <Cell key={i} fill={CHART_COLORS[i]} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>
    </div>
  );
});
