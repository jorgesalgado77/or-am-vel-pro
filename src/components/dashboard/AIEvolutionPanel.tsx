/**
 * AIEvolutionPanel — Shows AI learning evolution over time
 * Charts: confidence trend, events/week, accuracy rate
 */

import { useState, useEffect, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, Area, AreaChart,
} from "recharts";
import { Brain, TrendingUp, Activity, Target, Loader2 } from "lucide-react";
import { supabase } from "@/lib/supabaseClient";
import { getResolvedTenantId } from "@/contexts/TenantContext";
import { format, startOfWeek, parseISO, subWeeks } from "date-fns";
import { ptBR } from "date-fns/locale";

interface WeeklyData {
  week: string;
  events: number;
  deals_won: number;
  deals_lost: number;
  accuracy: number;
}

interface ConfidencePoint {
  date: string;
  confidence: number;
  sample_size: number;
}

export function AIEvolutionPanel() {
  const [weeklyData, setWeeklyData] = useState<WeeklyData[]>([]);
  const [confidenceData, setConfidenceData] = useState<ConfidencePoint[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const tenantId = await getResolvedTenantId();
        if (!tenantId) { setLoading(false); return; }

        // Fetch events from last 12 weeks
        const twelveWeeksAgo = subWeeks(new Date(), 12).toISOString();

        const [eventsRes, patternsRes] = await Promise.all([
          supabase
            .from("ai_learning_events" as any)
            .select("event_type, deal_result, created_at")
            .eq("tenant_id", tenantId)
            .gte("created_at", twelveWeeksAgo)
            .order("created_at", { ascending: true }),
          supabase
            .from("ai_learned_patterns" as any)
            .select("confidence, sample_size, updated_at")
            .eq("tenant_id", tenantId)
            .order("updated_at", { ascending: true }),
        ]);

        // Group events by week
        const byWeek: Record<string, { events: number; won: number; lost: number }> = {};
        const events = (eventsRes.data || []) as any[];
        
        events.forEach((e: any) => {
          const wk = format(startOfWeek(parseISO(e.created_at), { weekStartsOn: 1 }), "dd/MM", { locale: ptBR });
          if (!byWeek[wk]) byWeek[wk] = { events: 0, won: 0, lost: 0 };
          byWeek[wk].events++;
          if (e.deal_result === "ganho") byWeek[wk].won++;
          if (e.deal_result === "perdido") byWeek[wk].lost++;
        });

        const weekly: WeeklyData[] = Object.entries(byWeek).map(([week, d]) => ({
          week,
          events: d.events,
          deals_won: d.won,
          deals_lost: d.lost,
          accuracy: d.won + d.lost > 0 ? Math.round((d.won / (d.won + d.lost)) * 100) : 0,
        }));
        setWeeklyData(weekly);

        // Confidence trend from learned patterns
        const patterns = (patternsRes.data || []) as any[];
        const confPoints: ConfidencePoint[] = patterns
          .filter((p: any) => p.confidence > 0)
          .map((p: any) => ({
            date: format(parseISO(p.updated_at), "dd/MM", { locale: ptBR }),
            confidence: Math.round(Number(p.confidence)),
            sample_size: p.sample_size || 0,
          }));
        setConfidenceData(confPoints);
      } catch (err) {
        console.error("AIEvolutionPanel error:", err);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const summary = useMemo(() => {
    const totalEvents = weeklyData.reduce((s, w) => s + w.events, 0);
    const totalWon = weeklyData.reduce((s, w) => s + w.deals_won, 0);
    const totalLost = weeklyData.reduce((s, w) => s + w.deals_lost, 0);
    const avgAccuracy = totalWon + totalLost > 0 ? Math.round((totalWon / (totalWon + totalLost)) * 100) : 0;
    const avgConfidence = confidenceData.length > 0
      ? Math.round(confidenceData.reduce((s, c) => s + c.confidence, 0) / confidenceData.length)
      : 0;
    return { totalEvents, totalWon, totalLost, avgAccuracy, avgConfidence };
  }, [weeklyData, confidenceData]);

  if (loading) {
    return (
      <Card>
        <CardContent className="py-8 flex items-center justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-primary" />
        </CardContent>
      </Card>
    );
  }

  if (weeklyData.length === 0 && confidenceData.length === 0) {
    return (
      <Card>
        <CardContent className="py-8 text-center text-muted-foreground">
          <Brain className="h-10 w-10 mx-auto mb-2 opacity-30" />
          <p className="text-sm">A IA ainda está aprendendo</p>
          <p className="text-xs">Os gráficos aparecerão conforme os dados forem registrados</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Brain className="h-5 w-5 text-primary" />
        <h3 className="font-semibold text-sm">Evolução da IA</h3>
        <Badge variant="outline" className="text-[10px] gap-1">
          <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
          {summary.totalEvents} eventos registrados
        </Badge>
      </div>

      {/* Summary KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card>
          <CardContent className="pt-3 pb-3">
            <Activity className="h-4 w-4 text-muted-foreground" />
            <p className="text-xl font-bold mt-1">{summary.totalEvents}</p>
            <p className="text-[10px] text-muted-foreground">Total Eventos</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-3 pb-3">
            <Target className="h-4 w-4 text-muted-foreground" />
            <p className="text-xl font-bold mt-1">{summary.avgAccuracy}%</p>
            <p className="text-[10px] text-muted-foreground">Taxa de Acerto</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-3 pb-3">
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
            <p className="text-xl font-bold mt-1">{summary.avgConfidence}%</p>
            <p className="text-[10px] text-muted-foreground">Confiança Média</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-3 pb-3">
            <Brain className="h-4 w-4 text-muted-foreground" />
            <p className="text-xl font-bold mt-1">{summary.totalWon}/{summary.totalWon + summary.totalLost}</p>
            <p className="text-[10px] text-muted-foreground">Ganhos/Total</p>
          </CardContent>
        </Card>
      </div>

      {/* Events per Week */}
      {weeklyData.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <Activity className="h-4 w-4 text-primary" /> Eventos por Semana
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={weeklyData} margin={{ left: 0, right: 10, top: 5, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" opacity={0.1} />
                <XAxis dataKey="week" fontSize={10} />
                <YAxis fontSize={10} />
                <Tooltip />
                <Bar dataKey="events" name="Eventos" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} opacity={0.8} />
                <Bar dataKey="deals_won" name="Ganhos" fill="hsl(160, 60%, 45%)" radius={[4, 4, 0, 0]} opacity={0.8} />
                <Bar dataKey="deals_lost" name="Perdidos" fill="hsl(var(--destructive))" radius={[4, 4, 0, 0]} opacity={0.6} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      )}

      {/* Accuracy Trend */}
      {weeklyData.filter(w => w.accuracy > 0).length > 1 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <Target className="h-4 w-4 text-primary" /> Taxa de Acerto Semanal
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={180}>
              <AreaChart data={weeklyData.filter(w => w.accuracy > 0)} margin={{ left: 0, right: 10, top: 5, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" opacity={0.1} />
                <XAxis dataKey="week" fontSize={10} />
                <YAxis domain={[0, 100]} fontSize={10} tickFormatter={v => `${v}%`} />
                <Tooltip formatter={(v: number) => `${v}%`} />
                <Area type="monotone" dataKey="accuracy" name="Acerto" stroke="hsl(160, 60%, 45%)" fill="hsl(160, 60%, 45%)" fillOpacity={0.15} strokeWidth={2} />
              </AreaChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      )}

      {/* Confidence Trend */}
      {confidenceData.length > 1 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <Brain className="h-4 w-4 text-primary" /> Confiança das Recomendações
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={180}>
              <LineChart data={confidenceData} margin={{ left: 0, right: 10, top: 5, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" opacity={0.1} />
                <XAxis dataKey="date" fontSize={10} />
                <YAxis domain={[0, 100]} fontSize={10} tickFormatter={v => `${v}%`} />
                <Tooltip formatter={(v: number) => `${v}%`} />
                <Line type="monotone" dataKey="confidence" name="Confiança" stroke="hsl(var(--primary))" strokeWidth={2} dot={{ r: 3 }} />
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
