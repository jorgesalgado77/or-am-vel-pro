/**
 * AIInsightsWidget — Dashboard panel showing AI learning insights:
 * - Best strategy
 * - Discount sweet-spot
 * - Vendor performance
 * - Conversion rate by lead temperature
 */

import { useState, useEffect, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Brain, TrendingUp, Percent, Users, Thermometer,
  RefreshCw, Trophy, Target, Lightbulb, AlertTriangle,
} from "lucide-react";
import { getLearningEngine } from "@/services/ai/LearningEngine";
import { getResolvedTenantId } from "@/contexts/TenantContext";
import { supabase } from "@/lib/supabaseClient";
import type { StrategyConversion, VendorPerformance, DiscountSweetSpot } from "@/services/ai/types";
import { TEMPERATURE_CONFIG, type LeadTemperature } from "@/lib/leadTemperature";

const STRATEGY_LABELS: Record<string, string> = {
  urgencia: "Urgência",
  valor: "Valor Percebido",
  prova_social: "Prova Social",
  escassez: "Escassez",
  reciprocidade: "Reciprocidade",
  autoridade: "Autoridade",
  empatia: "Empatia",
  desconto: "Desconto",
  parcelamento: "Parcelamento",
  dealroom: "Deal Room",
  reativacao: "Reativação",
  consultiva: "Consultiva",
  outro: "Outro",
};

interface VendorDisplay extends VendorPerformance {
  nome: string;
}

interface TempConversion {
  temperature: LeadTemperature;
  total: number;
  won: number;
  rate: number;
}

export function AIInsightsWidget() {
  const [loading, setLoading] = useState(true);
  const [strategies, setStrategies] = useState<StrategyConversion[]>([]);
  const [discountSpot, setDiscountSpot] = useState<DiscountSweetSpot | null>(null);
  const [vendors, setVendors] = useState<VendorDisplay[]>([]);
  const [tempConversions, setTempConversions] = useState<TempConversion[]>([]);
  const [hasData, setHasData] = useState(false);

  const loadInsights = useCallback(async () => {
    setLoading(true);
    try {
      const tenantId = await getResolvedTenantId();
      if (!tenantId) { setLoading(false); return; }

      const engine = getLearningEngine(tenantId);
      const result = await engine.analyzePatterns();

      setStrategies(result.strategies);
      setDiscountSpot(result.discountSpot);

      // Enrich vendor names
      const vendorIds = result.vendorPerformances.map((v) => v.user_id);
      let vendorNames: Record<string, string> = {};
      if (vendorIds.length > 0) {
        const { data: users } = await supabase
          .from("usuarios")
          .select("id, nome_completo, apelido")
          .in("id", vendorIds);
        if (users) {
          users.forEach((u) => {
            vendorNames[u.id] = u.apelido || u.nome_completo || "Vendedor";
          });
        }
      }

      setVendors(
        result.vendorPerformances.map((v) => ({
          ...v,
          nome: vendorNames[v.user_id] || "Vendedor",
        }))
      );

      // Compute temperature conversions from raw events
      const tempEvents = await fetchTempData(tenantId);
      setTempConversions(tempEvents);

      setHasData(
        result.strategies.length > 0 ||
        result.vendorPerformances.length > 0 ||
        result.discountSpot.sample_size > 0
      );
    } catch (err) {
      console.error("[AIInsights] load error:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadInsights();
  }, [loadInsights]);

  if (loading) {
    return (
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <Brain className="h-5 w-5 text-primary" />
            IA Auto-Aprendizado
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <Skeleton className="h-20 w-full" />
          <Skeleton className="h-20 w-full" />
        </CardContent>
      </Card>
    );
  }

  if (!hasData) {
    return (
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <Brain className="h-5 w-5 text-primary" />
            IA Auto-Aprendizado
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col items-center gap-2 py-6 text-center">
            <Lightbulb className="h-8 w-8 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">
              Ainda não há dados suficientes para gerar insights.
              Continue usando o VendaZap, Simulador e Chat para alimentar a IA.
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }

  const bestStrategy = strategies[0];
  const worstStrategy = strategies.length > 1 ? strategies[strategies.length - 1] : null;

  return (
    <Card className="border-primary/20">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2 text-base">
            <Brain className="h-5 w-5 text-primary" />
            🧠 IA Auto-Aprendizado — Insights
          </CardTitle>
          <Button variant="ghost" size="sm" onClick={loadInsights}>
            <RefreshCw className="h-4 w-4" />
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Best Strategy */}
        {bestStrategy && (
          <div className="rounded-lg border bg-accent/30 p-3 space-y-2">
            <div className="flex items-center gap-2">
              <Trophy className="h-4 w-4 text-yellow-500" />
              <span className="text-sm font-semibold text-foreground">Melhor Estratégia</span>
            </div>
            <div className="flex items-center justify-between">
              <Badge variant="default" className="text-xs">
                {STRATEGY_LABELS[bestStrategy.strategy] || bestStrategy.strategy}
              </Badge>
              <span className="text-sm font-bold text-primary">
                {(bestStrategy.conversion_rate * 100).toFixed(1)}% conversão
              </span>
            </div>
            <div className="text-xs text-muted-foreground">
              {bestStrategy.total_events} eventos · {bestStrategy.deals_won} vendas fechadas ·
              Desconto médio: {bestStrategy.avg_discount.toFixed(1)}%
            </div>
          </div>
        )}

        {/* Low conversion alert */}
        {worstStrategy && worstStrategy.total_events >= 5 && worstStrategy.conversion_rate < 0.1 && (
          <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 space-y-1">
            <div className="flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-destructive" />
              <span className="text-sm font-semibold text-destructive">Estratégia com Baixa Conversão</span>
            </div>
            <p className="text-xs text-muted-foreground">
              "{STRATEGY_LABELS[worstStrategy.strategy] || worstStrategy.strategy}" tem apenas{" "}
              {(worstStrategy.conversion_rate * 100).toFixed(1)}% de conversão em{" "}
              {worstStrategy.total_events} tentativas. Considere mudar de abordagem.
            </p>
          </div>
        )}

        {/* Strategy Rankings */}
        {strategies.length > 1 && (
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <Target className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm font-medium text-foreground">Ranking de Estratégias</span>
            </div>
            <div className="space-y-1.5">
              {strategies.slice(0, 5).map((s, i) => (
                <div key={s.strategy} className="flex items-center gap-2">
                  <span className="text-xs font-mono w-4 text-muted-foreground">{i + 1}.</span>
                  <span className="text-xs flex-1 truncate">
                    {STRATEGY_LABELS[s.strategy] || s.strategy}
                  </span>
                  <Progress
                    value={s.conversion_rate * 100}
                    className="h-1.5 w-16"
                  />
                  <span className="text-xs font-mono w-12 text-right">
                    {(s.conversion_rate * 100).toFixed(0)}%
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Discount Sweet Spot */}
        {discountSpot && discountSpot.sample_size > 0 && (
          <div className="rounded-lg border p-3 space-y-2">
            <div className="flex items-center gap-2">
              <Percent className="h-4 w-4 text-primary" />
              <span className="text-sm font-semibold text-foreground">Sweet-Spot de Desconto</span>
            </div>
            <div className="flex items-center gap-4">
              <div className="text-center">
                <div className="text-lg font-bold text-primary">{discountSpot.optimal.toFixed(1)}%</div>
                <div className="text-xs text-muted-foreground">Ideal</div>
              </div>
              <div className="flex-1 relative h-6 bg-muted rounded-full overflow-hidden">
                <div
                  className="absolute h-full bg-primary/20 rounded-full"
                  style={{
                    left: `${discountSpot.min_effective * 3}%`,
                    width: `${(discountSpot.max_effective - discountSpot.min_effective) * 3}%`,
                  }}
                />
                <div
                  className="absolute h-full w-1 bg-primary rounded-full"
                  style={{ left: `${discountSpot.optimal * 3}%` }}
                />
              </div>
              <div className="text-xs text-muted-foreground whitespace-nowrap">
                {discountSpot.min_effective.toFixed(0)}% — {discountSpot.max_effective.toFixed(0)}%
              </div>
            </div>
            <div className="text-xs text-muted-foreground">
              Baseado em {discountSpot.sample_size} vendas fechadas
            </div>
          </div>
        )}

        {/* Vendor Performance */}
        {vendors.length > 0 && (
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <Users className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm font-medium text-foreground">Performance por Vendedor</span>
            </div>
            <div className="space-y-2">
              {vendors.slice(0, 5).map((v) => (
                <div
                  key={v.user_id}
                  className="flex items-center gap-3 rounded-md border p-2"
                >
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium truncate">{v.nome}</div>
                    <div className="text-xs text-muted-foreground">
                      {v.won_deals}/{v.total_deals} vendas ·
                      {v.best_strategy
                        ? ` Melhor: ${STRATEGY_LABELS[v.best_strategy] || v.best_strategy}`
                        : " Sem estratégia definida"}
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-sm font-bold text-primary">
                      {(v.conversion_rate * 100).toFixed(0)}%
                    </div>
                    <div className="text-xs text-muted-foreground">conversão</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Temperature Conversion */}
        {tempConversions.length > 0 && (
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <Thermometer className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm font-medium text-foreground">Conversão por Temperatura</span>
            </div>
            <div className="grid grid-cols-3 gap-2">
              {tempConversions.map((tc) => {
                const cfg = TEMPERATURE_CONFIG[tc.temperature];
                return (
                  <div key={tc.temperature} className={`rounded-lg p-2 text-center ${cfg?.bgColor || "bg-muted"}`}>
                    <div className="text-lg">{cfg?.emoji || "📊"}</div>
                    <div className="text-sm font-bold">{tc.rate.toFixed(0)}%</div>
                    <div className="text-xs text-muted-foreground">
                      {cfg?.label || tc.temperature} ({tc.won}/{tc.total})
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// Fetch temperature-based conversion data
async function fetchTempData(tenantId: string): Promise<TempConversion[]> {
  try {
    const table = supabase.from("ai_learning_events" as unknown as "clients");
    const { data } = await (table as unknown as {
      select: (cols: string) => {
        eq: (col: string, val: string) => {
          not: (col: string, op: string, val: string) => {
            in: (col: string, vals: string[]) => Promise<{ data: Array<{
              lead_temperature: string;
              deal_result: string | null;
            }> | null }>;
          };
        };
      };
    }).select("lead_temperature, deal_result")
      .eq("tenant_id", tenantId)
      .not("lead_temperature", "is", "null")
      .in("event_type", ["deal_closed", "deal_lost", "proposal_sent"]);

    if (!data || data.length === 0) return [];

    const groups: Record<string, { total: number; won: number }> = {};
    data.forEach((e) => {
      const temp = e.lead_temperature;
      if (!temp) return;
      if (!groups[temp]) groups[temp] = { total: 0, won: 0 };
      groups[temp].total++;
      if (e.deal_result === "ganho") groups[temp].won++;
    });

    const temps: LeadTemperature[] = ["quente", "morno", "frio"];
    return temps
      .filter((t) => groups[t])
      .map((t) => ({
        temperature: t,
        total: groups[t].total,
        won: groups[t].won,
        rate: groups[t].total > 0 ? (groups[t].won / groups[t].total) * 100 : 0,
      }));
  } catch {
    return [];
  }
}
