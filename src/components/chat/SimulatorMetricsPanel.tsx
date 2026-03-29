/**
 * Simulator Metrics Panel — tracks response times, conversion rates, and test history.
 * Includes persona filter for comparing conversion rates across profiles.
 */
import { useState, useEffect, useCallback, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { BarChart3, Clock, Target, MessageSquare, Trash2, TrendingUp, Filter } from "lucide-react";
import type { SimulationPersona } from "@/hooks/useWhatsAppSimulator";

const STORAGE_KEY = "whatsapp-sim-metrics";

interface SimTestRecord {
  id: string;
  persona: SimulationPersona;
  messagesSent: number;
  messagesReceived: number;
  avgResponseTime: number;
  startedAt: string;
  endedAt: string;
  converted: boolean;
}

interface SimMetrics {
  records: SimTestRecord[];
  totalMessagesSent: number;
  totalMessagesReceived: number;
  avgResponseTimeGlobal: number;
}

function loadMetrics(): SimMetrics {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) return JSON.parse(saved);
  } catch {}
  return { records: [], totalMessagesSent: 0, totalMessagesReceived: 0, avgResponseTimeGlobal: 0 };
}

function saveMetrics(m: SimMetrics) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(m));
}

export function addSimTestRecord(record: Omit<SimTestRecord, "id">) {
  const metrics = loadMetrics();
  const newRecord: SimTestRecord = { ...record, id: crypto.randomUUID() };
  metrics.records.unshift(newRecord);
  if (metrics.records.length > 50) metrics.records = metrics.records.slice(0, 50);

  metrics.totalMessagesSent = metrics.records.reduce((s, r) => s + r.messagesSent, 0);
  metrics.totalMessagesReceived = metrics.records.reduce((s, r) => s + r.messagesReceived, 0);
  const allTimes = metrics.records.filter(r => r.avgResponseTime > 0);
  metrics.avgResponseTimeGlobal = allTimes.length > 0
    ? allTimes.reduce((s, r) => s + r.avgResponseTime, 0) / allTimes.length
    : 0;

  saveMetrics(metrics);
}

const PERSONA_LABELS: Record<SimulationPersona, { label: string; emoji: string }> = {
  interessado: { label: "Interessado", emoji: "😊" },
  indeciso: { label: "Indeciso", emoji: "🤔" },
  apressado: { label: "Apressado", emoji: "⚡" },
  resistente: { label: "Resistente", emoji: "🚫" },
  curioso: { label: "Curioso", emoji: "🔍" },
};

const ALL_PERSONAS: SimulationPersona[] = ["interessado", "indeciso", "apressado", "resistente", "curioso"];

export function SimulatorMetricsPanel() {
  const [metrics, setMetrics] = useState<SimMetrics>(loadMetrics);
  const [personaFilter, setPersonaFilter] = useState<string>("all");

  const refresh = useCallback(() => setMetrics(loadMetrics()), []);

  useEffect(() => {
    const interval = setInterval(refresh, 5000);
    return () => clearInterval(interval);
  }, [refresh]);

  const clearAll = () => {
    localStorage.removeItem(STORAGE_KEY);
    setMetrics({ records: [], totalMessagesSent: 0, totalMessagesReceived: 0, avgResponseTimeGlobal: 0 });
  };

  const filteredRecords = useMemo(() =>
    personaFilter === "all"
      ? metrics.records
      : metrics.records.filter(r => r.persona === personaFilter),
    [metrics.records, personaFilter]
  );

  const filteredStats = useMemo(() => {
    const recs = filteredRecords;
    const sent = recs.reduce((s, r) => s + r.messagesSent, 0);
    const received = recs.reduce((s, r) => s + r.messagesReceived, 0);
    const withTime = recs.filter(r => r.avgResponseTime > 0);
    const avgTime = withTime.length > 0
      ? withTime.reduce((s, r) => s + r.avgResponseTime, 0) / withTime.length
      : 0;
    const convRate = recs.length > 0
      ? (recs.filter(r => r.converted).length / recs.length * 100).toFixed(1)
      : "0";
    return { sent, received, avgTime, convRate, total: recs.length };
  }, [filteredRecords]);

  // Per-persona breakdown for comparison
  const personaBreakdown = useMemo(() =>
    ALL_PERSONAS.map(p => {
      const recs = metrics.records.filter(r => r.persona === p);
      const conv = recs.length > 0
        ? (recs.filter(r => r.converted).length / recs.length * 100)
        : 0;
      return { persona: p, count: recs.length, convRate: conv };
    }).filter(p => p.count > 0),
    [metrics.records]
  );

  const formatTime = (ms: number) => {
    if (ms < 1000) return `${Math.round(ms)}ms`;
    return `${(ms / 1000).toFixed(1)}s`;
  };

  return (
    <Card className="border-amber-200 dark:border-amber-800">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm flex items-center gap-2">
            <BarChart3 className="h-4 w-4 text-amber-600" />
            Métricas do Simulador
          </CardTitle>
          {metrics.records.length > 0 && (
            <Button variant="ghost" size="sm" className="h-6 text-[10px] gap-1 text-muted-foreground" onClick={clearAll}>
              <Trash2 className="h-3 w-3" /> Limpar
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {/* Persona Filter */}
        {metrics.records.length > 0 && (
          <div className="space-y-1.5">
            <span className="text-[10px] font-medium text-muted-foreground flex items-center gap-1">
              <Filter className="h-3 w-3" /> Filtrar por Persona
            </span>
            <ToggleGroup
              type="single"
              value={personaFilter}
              onValueChange={(v) => v && setPersonaFilter(v)}
              className="flex-wrap justify-start gap-1"
              size="sm"
            >
              <ToggleGroupItem value="all" className="text-[9px] h-6 px-2">
                Todas
              </ToggleGroupItem>
              {ALL_PERSONAS.map(p => (
                <ToggleGroupItem key={p} value={p} className="text-[9px] h-6 px-2">
                  {PERSONA_LABELS[p].emoji} {PERSONA_LABELS[p].label}
                </ToggleGroupItem>
              ))}
            </ToggleGroup>
          </div>
        )}

        {/* Summary KPIs */}
        <div className="grid grid-cols-4 gap-2">
          <div className="text-center p-2 rounded-lg bg-muted/50">
            <Clock className="h-3.5 w-3.5 mx-auto mb-1 text-muted-foreground" />
            <p className="text-xs font-bold text-foreground">{formatTime(filteredStats.avgTime)}</p>
            <p className="text-[9px] text-muted-foreground">Tempo Médio</p>
          </div>
          <div className="text-center p-2 rounded-lg bg-muted/50">
            <Target className="h-3.5 w-3.5 mx-auto mb-1 text-muted-foreground" />
            <p className="text-xs font-bold text-foreground">{filteredStats.convRate}%</p>
            <p className="text-[9px] text-muted-foreground">Conversão</p>
          </div>
          <div className="text-center p-2 rounded-lg bg-muted/50">
            <MessageSquare className="h-3.5 w-3.5 mx-auto mb-1 text-muted-foreground" />
            <p className="text-xs font-bold text-foreground">{filteredStats.sent}</p>
            <p className="text-[9px] text-muted-foreground">Enviadas</p>
          </div>
          <div className="text-center p-2 rounded-lg bg-muted/50">
            <TrendingUp className="h-3.5 w-3.5 mx-auto mb-1 text-muted-foreground" />
            <p className="text-xs font-bold text-foreground">{filteredStats.total}</p>
            <p className="text-[9px] text-muted-foreground">Testes</p>
          </div>
        </div>

        {/* Per-Persona Conversion Comparison */}
        {personaBreakdown.length > 1 && personaFilter === "all" && (
          <div className="space-y-1.5">
            <span className="text-[10px] font-semibold text-foreground">Conversão por Persona</span>
            <div className="space-y-1">
              {personaBreakdown.map(p => (
                <div key={p.persona} className="flex items-center gap-2">
                  <span className="text-[10px] w-24 truncate">
                    {PERSONA_LABELS[p.persona].emoji} {PERSONA_LABELS[p.persona].label}
                  </span>
                  <div className="flex-1 h-2 rounded-full bg-secondary overflow-hidden">
                    <div
                      className="h-full rounded-full bg-primary transition-all"
                      style={{ width: `${Math.min(p.convRate, 100)}%` }}
                    />
                  </div>
                  <span className="text-[9px] font-medium text-muted-foreground w-12 text-right">
                    {p.convRate.toFixed(0)}% ({p.count})
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Test History */}
        {filteredRecords.length > 0 && (
          <div className="max-h-[200px] overflow-y-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-[10px] py-1">Persona</TableHead>
                  <TableHead className="text-[10px] py-1">Msgs</TableHead>
                  <TableHead className="text-[10px] py-1">Tempo</TableHead>
                  <TableHead className="text-[10px] py-1">Resultado</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredRecords.slice(0, 10).map(r => (
                  <TableRow key={r.id}>
                    <TableCell className="text-[10px] py-1">
                      {PERSONA_LABELS[r.persona].emoji} {PERSONA_LABELS[r.persona].label}
                    </TableCell>
                    <TableCell className="text-[10px] py-1">{r.messagesSent}/{r.messagesReceived}</TableCell>
                    <TableCell className="text-[10px] py-1">{formatTime(r.avgResponseTime)}</TableCell>
                    <TableCell className="py-1">
                      <Badge variant="outline" className={`text-[9px] h-4 ${r.converted ? "border-green-500 text-green-700" : "border-muted-foreground/30 text-muted-foreground"}`}>
                        {r.converted ? "Converteu" : "Não conv."}
                      </Badge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}

        {filteredRecords.length === 0 && (
          <p className="text-[11px] text-muted-foreground text-center py-3">
            {personaFilter !== "all"
              ? `Nenhum teste com persona "${PERSONA_LABELS[personaFilter as SimulationPersona]?.label}" registrado.`
              : "Nenhum teste registrado. Ative o simulador e envie mensagens para gerar métricas."}
          </p>
        )}
      </CardContent>
    </Card>
  );
}
