/**
 * AIInsightsWidget — Dashboard panel showing AI learning insights:
 * - Best strategy
 * - Discount sweet-spot
 * - Vendor performance
 * - Conversion rate by lead temperature
 */

import { useState, useEffect, useCallback } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Brain, TrendingUp, Percent, Users, Thermometer,
  RefreshCw, Trophy, Target, Lightbulb, AlertTriangle,
  ChevronDown, ChevronUp,
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

const COLLAPSE_KEY = "ai_insights_collapsed";

export function AIInsightsWidget() {
  const [loading, setLoading] = useState(true);
  const [strategies, setStrategies] = useState<StrategyConversion[]>([]);
  const [discountSpot, setDiscountSpot] = useState<DiscountSweetSpot | null>(null);
  const [vendors, setVendors] = useState<VendorDisplay[]>([]);
  const [tempConversions, setTempConversions] = useState<TempConversion[]>([]);
  const [hasData, setHasData] = useState(false);
  const [collapsed, setCollapsed] = useState(() => {
    try {
      const stored = localStorage.getItem(COLLAPSE_KEY);
      return stored === "true";
    } catch { return true; } // default collapsed when empty
  });

  const toggleCollapse = useCallback(() => {
    setCollapsed(prev => {
      const next = !prev;
      try { localStorage.setItem(COLLAPSE_KEY, String(next)); } catch {}
      return next;
    });
  }, []);

  // Auto-expand when data arrives, auto-collapse when empty (respecting user override)
  useEffect(() => {
    if (loading) return;
    const userExplicitlySet = localStorage.getItem(COLLAPSE_KEY) !== null;
    if (!userExplicitlySet) {
      setCollapsed(!hasData);
    }
  }, [loading, hasData]);

  const loadInsights = useCallback(async () => {
    setLoading(true);
    try {
      const tenantId = await getResolvedTenantId();
      if (!tenantId) { setLoading(false); return; }

      const engine = getLearningEngine(tenantId);
      const result = await engine.analyzePatterns();

      setStrategies(result.strategies);
      setDiscountSpot(result.discountSpot);

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

  const bestStrategy = strategies[0];
  const worstStrategy = strategies.length > 1 ? strategies[strategies.length - 1] : null;

  return (
    <Card className={hasData ? "border-primary/20" : ""}>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2 text-base cursor-pointer select-none" onClick={toggleCollapse}>
            <Brain className="h-5 w-5 text-primary" />
            {hasData ? "🧠 IA Auto-Aprendizado — Insights" : "IA Auto-Aprendizado"}
            <Button variant="ghost" size="icon" className="h-6 w-6 ml-1" asChild>
              <span>{collapsed ? <ChevronDown className="h-4 w-4" /> : <ChevronUp className="h-4 w-4" />}</span>
            </Button>
          </CardTitle>
          {!collapsed && hasData && (
            <Button variant="ghost" size="sm" onClick={loadInsights}>
              <RefreshCw className="h-4 w-4" />
            </Button>
          )}
        </div>
      </CardHeader>

      <AnimatePresence initial={false} mode="wait">
        {collapsed ? (
          <motion.div
            key="collapsed"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.25, ease: "easeInOut" }}
            style={{ overflow: "hidden" }}
          >
            <CardContent className="pt-0 pb-3">
              <p className="text-xs text-muted-foreground">
                {!hasData
                  ? "Ainda não há dados suficientes. Continue usando o VendaZap, Simulador e Chat."
                  : `${strategies.length} estratégia(s) · ${vendors.length} vendedor(es) analisado(s)`}
              </p>
            </CardContent>
          </motion.div>
        ) : (
          <motion.div
            key="expanded"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.25, ease: "easeInOut" }}
            style={{ overflow: "hidden" }}
          >
            {!hasData ? (
              <CardContent>
                <div className="flex flex-col items-center gap-2 py-6 text-center">
                  <Lightbulb className="h-8 w-8 text-muted-foreground" />
                  <p className="text-sm text-muted-foreground">
                    Ainda não há dados suficientes para gerar insights.
                    Continue usando o VendaZap, Simulador e Chat para alimentar a IA.
                  </p>
                </div>
              </CardContent>
            ) : (
      <CardContent className="space-y-4">
        {/* Best Strategy */}
        {bestStrategy && (
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.2, delay: 0.05 }} className="rounded-lg border bg-accent/30 p-3 space-y-2">
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
          </motion.div>
        )}

        {/* Low conversion alert */}
        {worstStrategy && worstStrategy.total_events >= 5 && worstStrategy.conversion_rate < 0.1 && (
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.2, delay: 0.1 }} className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 space-y-1">
            <div className="flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-destructive" />
              <span className="text-sm font-semibold text-destructive">Estratégia com Baixa Conversão</span>
            </div>
            <p className="text-xs text-muted-foreground">
              "{STRATEGY_LABELS[worstStrategy.strategy] || worstStrategy.strategy}" tem apenas{" "}
              {(worstStrategy.conversion_rate * 100).toFixed(1)}% de conversão em{" "}
              {worstStrategy.total_events} tentativas. Considere mudar de abordagem.
            </p>
          </motion.div>
        )}

        {/* Strategy Rankings */}
        {strategies.length > 1 && (
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.2, delay: 0.15 }} className="space-y-2">
            <div className="flex items-center gap-2">
              <Target className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm font-medium text-foreground">Ranking de Estratégias</span>
            </div>
            <div className="space-y-1.5">
              {strategies.slice(0, 5).map((s, i) => (
                <motion.div key={s.strategy} initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.15, delay: 0.2 + i * 0.04 }} className="flex items-center gap-2">
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
                </motion.div>
              ))}
            </div>
          </motion.div>
        )}

        {/* Discount Sweet Spot */}
        {discountSpot && discountSpot.sample_size > 0 && (
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.2, delay: 0.25 }} className="rounded-lg border p-3 space-y-2">
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
          </motion.div>
        )}

        {/* Vendor Performance */}
        {vendors.length > 0 && (
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.2, delay: 0.3 }} className="space-y-2">
            <div className="flex items-center gap-2">
              <Users className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm font-medium text-foreground">Performance por Vendedor</span>
            </div>
            <div className="space-y-2">
              {vendors.slice(0, 5).map((v, i) => (
                <motion.div
                  key={v.user_id}
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ duration: 0.15, delay: 0.35 + i * 0.04 }}
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
                </motion.div>
              ))}
            </div>
          </motion.div>
        )}

        {/* Temperature Conversion */}
        {tempConversions.length > 0 && (
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.2, delay: 0.35 }} className="space-y-2">
            <div className="flex items-center gap-2">
              <Thermometer className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm font-medium text-foreground">Conversão por Temperatura</span>
            </div>
            <div className="grid grid-cols-3 gap-2">
              {tempConversions.map((tc, i) => {
                const cfg = TEMPERATURE_CONFIG[tc.temperature];
                return (
                  <motion.div key={tc.temperature} initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: 0.15, delay: 0.4 + i * 0.05 }} className={`rounded-lg p-2 text-center ${cfg?.bgColor || "bg-muted"}`}>
                    <div className="text-lg">{cfg?.emoji || "📊"}</div>
                    <div className="text-sm font-bold">{tc.rate.toFixed(0)}%</div>
                    <div className="text-xs text-muted-foreground">
                      {cfg?.label || tc.temperature} ({tc.won}/{tc.total})
                    </div>
                  </motion.div>
                );
              })}
            </div>
          </motion.div>
        )}
      </CardContent>
            )}
          </motion.div>
        )}
      </AnimatePresence>
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
