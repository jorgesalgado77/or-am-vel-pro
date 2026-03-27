/**
 * Simulator Metrics Panel — tracks response times, conversion rates, and test history.
 */
import { useState, useEffect, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { BarChart3, Clock, Target, MessageSquare, Trash2, TrendingUp } from "lucide-react";
import type { SimulationPersona } from "@/hooks/useWhatsAppSimulator";

const STORAGE_KEY = "whatsapp-sim-metrics";

interface SimTestRecord {
  id: string;
  persona: SimulationPersona;
  messagesSent: number;
  messagesReceived: number;
  avgResponseTime: number; // ms
  startedAt: string;
  endedAt: string;
  converted: boolean; // did the conversation lead to deal room / proposal?
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

  // Recalculate globals
  metrics.totalMessagesSent = metrics.records.reduce((s, r) => s + r.messagesSent, 0);
  metrics.totalMessagesReceived = metrics.records.reduce((s, r) => s + r.messagesReceived, 0);
  const allTimes = metrics.records.filter(r => r.avgResponseTime > 0);
  metrics.avgResponseTimeGlobal = allTimes.length > 0
    ? allTimes.reduce((s, r) => s + r.avgResponseTime, 0) / allTimes.length
    : 0;

  saveMetrics(metrics);
}

const PERSONA_LABELS: Record<SimulationPersona, string> = {
  interessado: "😊 Interessado",
  indeciso: "🤔 Indeciso",
  apressado: "⚡ Apressado",
  resistente: "🚫 Resistente",
  curioso: "🔍 Curioso",
};

export function SimulatorMetricsPanel() {
  const [metrics, setMetrics] = useState<SimMetrics>(loadMetrics);

  const refresh = useCallback(() => setMetrics(loadMetrics()), []);

  useEffect(() => {
    const interval = setInterval(refresh, 5000);
    return () => clearInterval(interval);
  }, [refresh]);

  const clearAll = () => {
    localStorage.removeItem(STORAGE_KEY);
    setMetrics({ records: [], totalMessagesSent: 0, totalMessagesReceived: 0, avgResponseTimeGlobal: 0 });
  };

  const conversionRate = metrics.records.length > 0
    ? (metrics.records.filter(r => r.converted).length / metrics.records.length * 100).toFixed(1)
    : "0";

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
        {/* Summary KPIs */}
        <div className="grid grid-cols-4 gap-2">
          <div className="text-center p-2 rounded-lg bg-muted/50">
            <Clock className="h-3.5 w-3.5 mx-auto mb-1 text-muted-foreground" />
            <p className="text-xs font-bold text-foreground">{formatTime(metrics.avgResponseTimeGlobal)}</p>
            <p className="text-[9px] text-muted-foreground">Tempo Médio</p>
          </div>
          <div className="text-center p-2 rounded-lg bg-muted/50">
            <Target className="h-3.5 w-3.5 mx-auto mb-1 text-muted-foreground" />
            <p className="text-xs font-bold text-foreground">{conversionRate}%</p>
            <p className="text-[9px] text-muted-foreground">Conversão</p>
          </div>
          <div className="text-center p-2 rounded-lg bg-muted/50">
            <MessageSquare className="h-3.5 w-3.5 mx-auto mb-1 text-muted-foreground" />
            <p className="text-xs font-bold text-foreground">{metrics.totalMessagesSent}</p>
            <p className="text-[9px] text-muted-foreground">Enviadas</p>
          </div>
          <div className="text-center p-2 rounded-lg bg-muted/50">
            <TrendingUp className="h-3.5 w-3.5 mx-auto mb-1 text-muted-foreground" />
            <p className="text-xs font-bold text-foreground">{metrics.records.length}</p>
            <p className="text-[9px] text-muted-foreground">Testes</p>
          </div>
        </div>

        {/* Test History */}
        {metrics.records.length > 0 && (
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
                {metrics.records.slice(0, 10).map(r => (
                  <TableRow key={r.id}>
                    <TableCell className="text-[10px] py-1">{PERSONA_LABELS[r.persona]}</TableCell>
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

        {metrics.records.length === 0 && (
          <p className="text-[11px] text-muted-foreground text-center py-3">
            Nenhum teste registrado. Ative o simulador e envie mensagens para gerar métricas.
          </p>
        )}
      </CardContent>
    </Card>
  );
}
