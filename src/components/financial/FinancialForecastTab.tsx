import React, { useState, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { formatCurrency } from "@/lib/financing";
import {
  TrendingUp, TrendingDown, AlertTriangle, ArrowUpRight, ArrowDownRight,
  Bell, Brain, Sparkles, Loader2,
} from "lucide-react";
import {
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  Line, Area, AreaChart, ReferenceLine, Legend,
} from "recharts";
import { miaInvoke } from "@/services/mia/MIAInvoke";
import { toast } from "sonner";
import type { useFinancialData } from "@/hooks/useFinancialData";

type FinData = ReturnType<typeof useFinancialData>;

interface Props {
  fin: FinData;
}

export const FinancialForecastTab = React.memo(function FinancialForecastTab({ fin }: Props) {
  const [aiAnalysis, setAiAnalysis] = useState("");
  const [aiLoading, setAiLoading] = useState(false);

  const handleAIAnalysis = useCallback(async () => {
    setAiLoading(true);
    try {
      const resumo = `Faturamento: ${formatCurrency(fin.faturamento)}\nCustos fixos: ${formatCurrency(fin.contasFixas)}\nFolha: ${formatCurrency(fin.totalFolha)}\nPonto equilíbrio: ${formatCurrency(fin.breakEven)}\nResultado: ${formatCurrency(fin.lucroEstimado)}\nVencidas: ${fin.contasVencidas.length}\nA vencer 7d: ${fin.contasAVencer7d.length}\nSaldo 30d: ${formatCurrency(fin.saldoFinal30d)}\nDias negativo: ${fin.diasNegativo}`;
      const { data, error } = await miaInvoke("cashflow-ai", { resumo_financeiro: resumo }, { tenantId: "system", userId: "system", origin: "system", context: "cashflow" });
      if (error) throw error;
      setAiAnalysis(data.analise || "Sem análise disponível.");
    } catch { toast.error("Erro ao gerar análise de IA"); } finally { setAiLoading(false); }
  }, [fin]);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Card className="p-4">
          <div className="flex items-center gap-3">
            <div className={`h-10 w-10 rounded-xl flex items-center justify-center ${fin.saldoFinal30d >= 0 ? "bg-primary/10" : "bg-destructive/10"}`}>
              {fin.saldoFinal30d >= 0 ? <TrendingUp className="h-5 w-5 text-primary" /> : <TrendingDown className="h-5 w-5 text-destructive" />}
            </div>
            <div>
              <p className={`text-lg font-bold ${fin.saldoFinal30d >= 0 ? "text-primary" : "text-destructive"}`}>{formatCurrency(fin.saldoFinal30d)}</p>
              <p className="text-xs text-muted-foreground">Saldo em 30 dias</p>
            </div>
          </div>
        </Card>
        <Card className="p-4">
          <div className="flex items-center gap-3">
            <div className={`h-10 w-10 rounded-xl flex items-center justify-center ${fin.diasNegativo > 0 ? "bg-destructive/10" : "bg-primary/10"}`}>
              <AlertTriangle className={`h-5 w-5 ${fin.diasNegativo > 0 ? "text-destructive" : "text-primary"}`} />
            </div>
            <div>
              <p className={`text-lg font-bold ${fin.diasNegativo > 0 ? "text-destructive" : "text-primary"}`}>{fin.diasNegativo}</p>
              <p className="text-xs text-muted-foreground">Dias no Vermelho</p>
            </div>
          </div>
        </Card>
        <Card className="p-4">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl bg-primary/10 flex items-center justify-center">
              <ArrowUpRight className="h-5 w-5 text-primary" />
            </div>
            <div>
              <p className="text-lg font-bold">{formatCurrency(fin.faturamento / 30)}</p>
              <p className="text-xs text-muted-foreground">Entrada Diária Média</p>
            </div>
          </div>
        </Card>
        <Card className="p-4">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl bg-accent flex items-center justify-center">
              <ArrowDownRight className="h-5 w-5 text-accent-foreground" />
            </div>
            <div>
              <p className="text-lg font-bold">{formatCurrency((fin.contasFixas + fin.totalFolha) / 30)}</p>
              <p className="text-xs text-muted-foreground">Saída Diária Média</p>
            </div>
          </div>
        </Card>
      </div>

      {fin.diasNegativo > 0 && (
        <Card className="border-destructive/30 bg-destructive/5">
          <CardContent className="p-4 flex items-center gap-3">
            <Bell className="h-5 w-5 text-destructive animate-pulse" />
            <div>
              <p className="font-semibold text-destructive text-sm">⚠️ Alerta de Caixa Negativo</p>
              <p className="text-xs text-muted-foreground">Seu saldo ficará negativo em {fin.diasNegativo} dos próximos 30 dias.</p>
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">Previsão de Saldo — Próximos 30 Dias</CardTitle>
          <CardDescription className="text-xs">Baseado em receitas e despesas projetadas</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={fin.forecastData}>
                <defs>
                  <linearGradient id="saldoGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" />
                <XAxis dataKey="dia" tick={{ fontSize: 10 }} stroke="hsl(var(--muted-foreground))" />
                <YAxis tickFormatter={(v) => formatCurrency(v)} tick={{ fontSize: 10 }} stroke="hsl(var(--muted-foreground))" />
                <Tooltip formatter={(v: number) => formatCurrency(v)} />
                <Legend />
                <ReferenceLine y={0} stroke="hsl(var(--destructive))" strokeDasharray="3 3" label="Zero" />
                <Area type="monotone" dataKey="saldo" name="Saldo Projetado" stroke="hsl(var(--primary))" fill="url(#saldoGrad)" strokeWidth={2} />
                <Line type="monotone" dataKey="entradas" name="Entradas" stroke="hsl(var(--chart-2))" strokeWidth={1.5} dot={false} />
                <Line type="monotone" dataKey="saidas" name="Saídas" stroke="hsl(var(--destructive))" strokeWidth={1.5} dot={false} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Brain className="h-5 w-5 text-primary" />
              <CardTitle className="text-sm">Análise Inteligente (IA)</CardTitle>
            </div>
            <Button size="sm" onClick={handleAIAnalysis} disabled={aiLoading} className="gap-1.5">
              {aiLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
              {aiLoading ? "Analisando..." : "Gerar Análise"}
            </Button>
          </div>
          <CardDescription className="text-xs">Diagnóstico, alertas e sugestões com inteligência artificial</CardDescription>
        </CardHeader>
        <CardContent>
          {aiAnalysis ? (
            <div className="prose prose-sm max-w-none dark:prose-invert text-sm whitespace-pre-wrap leading-relaxed">{aiAnalysis}</div>
          ) : (
            <div className="text-center py-8 text-muted-foreground">
              <Brain className="h-10 w-10 mx-auto mb-3 opacity-20" />
              <p className="text-sm">Clique em "Gerar Análise" para obter um diagnóstico financeiro completo com IA</p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
});
