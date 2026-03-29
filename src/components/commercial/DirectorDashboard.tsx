/**
 * DirectorDashboard — IA Diretora Comercial visual panel
 */

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import {
  TrendingUp, TrendingDown, AlertTriangle, Users, Target,
  DollarSign, Brain, RefreshCw, Loader2, Zap, Shield, Eye,
  ArrowUpRight, ArrowDownRight,
} from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from "recharts";
import { useCommercialDirector } from "@/hooks/useCommercialDirector";
import { AIEvolutionPanel } from "@/components/dashboard/AIEvolutionPanel";
import { cn } from "@/lib/utils";

function fmt(val: number) {
  return val.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

const RISK_COLORS: Record<string, { bg: string; text: string; label: string }> = {
  baixo: { bg: "bg-emerald-500/10", text: "text-emerald-600", label: "Baixo" },
  medio: { bg: "bg-yellow-500/10", text: "text-yellow-600", label: "Médio" },
  alto: { bg: "bg-orange-500/10", text: "text-orange-600", label: "Alto" },
  critico: { bg: "bg-destructive/10", text: "text-destructive", label: "Crítico" },
};

const STATUS_CONFIG: Record<string, { color: string; label: string }> = {
  excellent: { color: "text-emerald-600", label: "Excelente" },
  good: { color: "text-blue-600", label: "Bom" },
  attention: { color: "text-yellow-600", label: "Atenção" },
  critical: { color: "text-destructive", label: "Crítico" },
};

interface DirectorDashboardProps {
  tenantId: string | null;
}

export function DirectorDashboard({ tenantId }: DirectorDashboardProps) {
  const { analysis, forecast, team, strategy, loading, refresh } = useCommercialDirector(tenantId);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
          <p className="text-muted-foreground text-sm">Diretora Comercial analisando dados...</p>
        </div>
      </div>
    );
  }

  if (!analysis || !forecast) {
    return (
      <Card>
        <CardContent className="py-8 text-center text-muted-foreground">
          <Brain className="h-10 w-10 mx-auto mb-2 opacity-30" />
          <p>Dados insuficientes para análise</p>
        </CardContent>
      </Card>
    );
  }

  const riskInfo = RISK_COLORS[forecast.risco] || RISK_COLORS.medio;

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Brain className="h-5 w-5 text-primary" />
          <h3 className="font-semibold text-sm">IA Diretora Comercial</h3>
          <Badge variant="outline" className="text-[10px] gap-1">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
            Ativa
          </Badge>
        </div>
        <Button size="sm" variant="outline" className="gap-1 h-7 text-xs" onClick={refresh}>
          <RefreshCw className="h-3 w-3" /> Atualizar
        </Button>
      </div>

      {/* Alerts */}
      {analysis.alerts.filter(a => a.severity === "critical" || a.severity === "high").map((alert, i) => (
        <Card key={i} className="border-destructive/50 bg-destructive/5">
          <CardContent className="pt-3 pb-3">
            <div className="flex items-start gap-2">
              <AlertTriangle className="h-4 w-4 text-destructive shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-medium text-foreground">{alert.title}</p>
                <p className="text-xs text-muted-foreground">{alert.message}</p>
                {alert.action && (
                  <p className="text-xs text-primary mt-1 font-medium">→ {alert.action}</p>
                )}
              </div>
            </div>
          </CardContent>
        </Card>
      ))}

      {/* KPI Row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card>
          <CardContent className="pt-3 pb-3">
            <div className="flex items-center justify-between">
              <Target className="h-4 w-4 text-muted-foreground" />
              {analysis.goals.pct_atingido >= 80 ? (
                <ArrowUpRight className="h-3.5 w-3.5 text-emerald-500" />
              ) : (
                <ArrowDownRight className="h-3.5 w-3.5 text-destructive" />
              )}
            </div>
            <p className="text-xl font-bold mt-1">{analysis.goals.pct_atingido}%</p>
            <p className="text-[10px] text-muted-foreground">Meta Atingida</p>
            <Progress value={Math.min(100, analysis.goals.pct_atingido)} className="h-1 mt-1" />
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-3 pb-3">
            <div className="flex items-center justify-between">
              <DollarSign className="h-4 w-4 text-muted-foreground" />
              <Badge className={cn("text-[9px] h-4", riskInfo.bg, riskInfo.text)} variant="outline">
                {riskInfo.label}
              </Badge>
            </div>
            <p className="text-xl font-bold mt-1">{fmt(forecast.previsao_realista)}</p>
            <p className="text-[10px] text-muted-foreground">Previsão Realista</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-3 pb-3">
            <div className="flex items-center justify-between">
              <TrendingUp className="h-4 w-4 text-muted-foreground" />
              <span className="text-[10px] text-muted-foreground">{analysis.conversion.avg_close_days}d</span>
            </div>
            <p className="text-xl font-bold mt-1">{analysis.conversion.rate}%</p>
            <p className="text-[10px] text-muted-foreground">Conversão</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-3 pb-3">
            <div className="flex items-center justify-between">
              <Users className="h-4 w-4 text-muted-foreground" />
              <span className="text-[10px] text-muted-foreground">{analysis.pipeline.stalled_leads} parados</span>
            </div>
            <p className="text-xl font-bold mt-1">{analysis.pipeline.total_leads}</p>
            <p className="text-[10px] text-muted-foreground">Pipeline ({analysis.pipeline.hot_leads} 🔥)</p>
          </CardContent>
        </Card>
      </div>

      {/* Forecast Card */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2">
            <Eye className="h-4 w-4 text-primary" /> Previsão de Faturamento
            <Badge variant="outline" className="text-[10px] ml-auto">
              Confiança: {forecast.confianca}%
            </Badge>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-3 gap-3 mb-3">
            <div className="text-center p-2 rounded-lg bg-emerald-500/5 border border-emerald-500/20">
              <p className="text-[10px] text-muted-foreground">Otimista</p>
              <p className="text-sm font-bold text-emerald-600">{fmt(forecast.previsao_otimista)}</p>
            </div>
            <div className="text-center p-2 rounded-lg bg-blue-500/5 border border-blue-500/20">
              <p className="text-[10px] text-muted-foreground">Realista</p>
              <p className="text-sm font-bold text-blue-600">{fmt(forecast.previsao_realista)}</p>
            </div>
            <div className="text-center p-2 rounded-lg bg-orange-500/5 border border-orange-500/20">
              <p className="text-[10px] text-muted-foreground">Pessimista</p>
              <p className="text-sm font-bold text-orange-600">{fmt(forecast.previsao_pessimista)}</p>
            </div>
          </div>
          {forecast.meta_loja > 0 && (
            <div className="space-y-1">
              <div className="flex justify-between text-xs">
                <span className="text-muted-foreground">Meta: {fmt(forecast.meta_loja)}</span>
                <span className="text-muted-foreground">Gap: {fmt(Math.max(0, forecast.meta_loja - analysis.goals.revenue_atual))}</span>
              </div>
              <Progress value={Math.min(100, analysis.goals.pct_atingido)} className="h-2" />
            </div>
          )}
          {forecast.insights.length > 0 && (
            <div className="mt-3 space-y-1">
              {forecast.insights.map((insight, i) => (
                <p key={i} className="text-[11px] text-muted-foreground">• {insight}</p>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Strategy */}
      {strategy && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <Zap className="h-4 w-4 text-primary" /> Estratégia Recomendada
              <Badge variant={strategy.approach === "aggressive" ? "destructive" : strategy.approach === "conservative" ? "outline" : "secondary"} className="text-[10px] ml-auto">
                {strategy.approach === "aggressive" ? "Agressiva" : strategy.approach === "conservative" ? "Conservadora" : "Equilibrada"}
              </Badge>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <p className="text-xs text-muted-foreground">{strategy.reasoning}</p>
            <div className="flex items-center gap-2 text-xs">
              <Shield className="h-3.5 w-3.5 text-muted-foreground" />
              <span>Desconto: {strategy.discount_guidance.min}% – {strategy.discount_guidance.max}% (ideal: {strategy.discount_guidance.sweet_spot}%)</span>
            </div>
            {strategy.priority_actions.length > 0 && (
              <div className="space-y-1 mt-2">
                <p className="text-[11px] font-medium text-foreground">Ações prioritárias:</p>
                {strategy.priority_actions.map((a, i) => (
                  <p key={i} className="text-[11px] text-muted-foreground flex items-start gap-1">
                    <span className="text-primary">→</span> {a}
                  </p>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* AI Evolution */}
      <AIEvolutionPanel />

      {/* Team Performance */}
      {team.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <Users className="h-4 w-4 text-primary" /> Desempenho da Equipe
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {/* Bar chart */}
            {team.filter(v => v.revenue > 0 || v.deals_closed > 0).length > 0 && (
              <ResponsiveContainer width="100%" height={Math.max(150, team.length * 45)}>
                <BarChart
                  data={team.map(v => ({
                    name: v.user_name.split(" ")[0],
                    vendas: v.deals_closed,
                    revenue: v.revenue,
                    conv: v.conversion_rate,
                  }))}
                  layout="vertical"
                  margin={{ left: 10, right: 30, top: 5, bottom: 5 }}
                >
                  <CartesianGrid strokeDasharray="3 3" opacity={0.1} />
                  <XAxis type="number" tickFormatter={v => `${v}`} fontSize={10} />
                  <YAxis type="category" dataKey="name" width={60} fontSize={11} />
                  <Tooltip formatter={(value: number, name: string) => name === "revenue" ? fmt(value) : value} />
                  <Bar dataKey="vendas" name="Vendas" radius={[0, 4, 4, 0]}>
                    {team.map((v, i) => (
                      <Cell key={i} fill={v.status === "excellent" ? "hsl(var(--primary))" : v.status === "critical" ? "hsl(var(--destructive))" : "hsl(var(--muted-foreground))"} fillOpacity={0.7} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            )}

            {/* Vendor cards */}
            {team.map(v => {
              const cfg = STATUS_CONFIG[v.status] || STATUS_CONFIG.good;
              return (
                <div key={v.user_id} className="flex items-center justify-between py-2 px-3 rounded-lg border border-border text-xs">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-foreground truncate">{v.user_name}</span>
                      <Badge variant="outline" className={cn("text-[9px]", cfg.color)}>{cfg.label}</Badge>
                    </div>
                    <div className="flex gap-3 mt-0.5 text-muted-foreground">
                      <span>{v.deals_closed} vendas</span>
                      <span>{fmt(v.revenue)}</span>
                      <span>{v.conversion_rate}% conv</span>
                      {v.stalled_count > 0 && <span className="text-destructive">{v.stalled_count} parados</span>}
                    </div>
                  </div>
                  {v.recommendations.length > 0 && (
                    <div className="text-right max-w-[40%]">
                      <p className="text-[10px] text-muted-foreground truncate">{v.recommendations[0]}</p>
                    </div>
                  )}
                </div>
              );
            })}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
