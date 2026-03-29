/**
 * AdminSystemDiagnostics — System health & diagnostics panel.
 * Shows failure rates, top issues, and AI-powered suggestions.
 */
import { useState, useEffect, useMemo, useCallback } from "react";
import { supabase } from "@/lib/supabaseClient";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import {
  Activity, AlertTriangle, CheckCircle2, RefreshCw, TrendingDown,
  Shield, Brain, Zap, Server,
} from "lucide-react";
import { analyzeDiagnosticPatterns } from "@/services/system/SystemDiagnosticsService";
import { toast } from "sonner";

interface DiagnosticLog {
  id: string;
  resultado: string;
  email: string | null;
  codigo_loja: string | null;
  tenant_id: string | null;
  created_at: string;
  detalhes: Record<string, unknown>;
}

interface SystemLog {
  id: string;
  event_type: string;
  source: string;
  message: string;
  metadata: Record<string, unknown>;
  created_at: string;
}

export function AdminSystemDiagnostics() {
  const [loginLogs, setLoginLogs] = useState<DiagnosticLog[]>([]);
  const [systemLogs, setSystemLogs] = useState<SystemLog[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchData = useCallback(async () => {
    setLoading(true);
    const [loginRes, sysRes] = await Promise.all([
      (supabase as any)
        .from("login_diagnostics")
        .select("id, resultado, email, codigo_loja, tenant_id, created_at, detalhes")
        .order("created_at", { ascending: false })
        .limit(200),
      (supabase as any)
        .from("system_logs")
        .select("id, event_type, source, message, metadata, created_at")
        .order("created_at", { ascending: false })
        .limit(100),
    ]);

    if (loginRes.data) setLoginLogs(loginRes.data);
    if (sysRes.data) setSystemLogs(sysRes.data);
    else if (sysRes.error?.code === "42P01") {
      // Table doesn't exist yet — silent
    }
    setLoading(false);
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  const analysis = useMemo(
    () => analyzeDiagnosticPatterns(loginLogs as Record<string, unknown>[]),
    [loginLogs],
  );

  // System logs breakdown
  const sysBreakdown = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const log of systemLogs) {
      counts[log.event_type] = (counts[log.event_type] ?? 0) + 1;
    }
    return Object.entries(counts).sort((a, b) => b[1] - a[1]);
  }, [systemLogs]);

  const successRate = 100 - analysis.failureRate;

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="h-5 w-5 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Activity className="h-5 w-5 text-primary" />
          <h2 className="text-lg font-bold text-foreground">Diagnósticos do Sistema</h2>
        </div>
        <Button variant="outline" size="sm" onClick={() => { fetchData(); toast.success("Dados atualizados!"); }} className="gap-1.5">
          <RefreshCw className="h-3.5 w-3.5" />
          Atualizar
        </Button>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Success Rate */}
        <Card>
          <CardContent className="pt-4 pb-3">
            <div className="flex items-center gap-2 mb-2">
              <CheckCircle2 className={`h-4 w-4 ${successRate >= 70 ? "text-green-500" : successRate >= 40 ? "text-yellow-500" : "text-destructive"}`} />
              <span className="text-sm font-medium text-muted-foreground">Taxa de Sucesso</span>
            </div>
            <p className="text-2xl font-bold text-foreground">{successRate}%</p>
            <Progress value={successRate} className="mt-2 h-1.5" />
          </CardContent>
        </Card>

        {/* Total Logins */}
        <Card>
          <CardContent className="pt-4 pb-3">
            <div className="flex items-center gap-2 mb-2">
              <Shield className="h-4 w-4 text-primary" />
              <span className="text-sm font-medium text-muted-foreground">Total de Logins</span>
            </div>
            <p className="text-2xl font-bold text-foreground">{loginLogs.length}</p>
            <p className="text-xs text-muted-foreground mt-1">Últimos registros</p>
          </CardContent>
        </Card>

        {/* Failures */}
        <Card>
          <CardContent className="pt-4 pb-3">
            <div className="flex items-center gap-2 mb-2">
              <AlertTriangle className="h-4 w-4 text-destructive" />
              <span className="text-sm font-medium text-muted-foreground">Falhas</span>
            </div>
            <p className="text-2xl font-bold text-foreground">
              {loginLogs.filter(l => l.resultado.startsWith("falha")).length}
            </p>
            <p className="text-xs text-muted-foreground mt-1">{analysis.failureRate}% do total</p>
          </CardContent>
        </Card>

        {/* System Events */}
        <Card>
          <CardContent className="pt-4 pb-3">
            <div className="flex items-center gap-2 mb-2">
              <Server className="h-4 w-4 text-blue-500" />
              <span className="text-sm font-medium text-muted-foreground">Eventos de Sistema</span>
            </div>
            <p className="text-2xl font-bold text-foreground">{systemLogs.length}</p>
            <p className="text-xs text-muted-foreground mt-1">{sysBreakdown.length} tipos</p>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Top Issues */}
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center gap-2">
              <TrendingDown className="h-4 w-4 text-destructive" />
              <CardTitle className="text-sm">Top Problemas</CardTitle>
            </div>
            <CardDescription className="text-xs">Falhas mais frequentes nos logins</CardDescription>
          </CardHeader>
          <CardContent>
            {analysis.topIssues.length === 0 ? (
              <div className="flex items-center gap-2 text-sm text-muted-foreground py-4">
                <CheckCircle2 className="h-4 w-4 text-green-500" />
                Nenhuma falha registrada. Sistema saudável!
              </div>
            ) : (
              <div className="space-y-2">
                {analysis.topIssues.map((issue, idx) => {
                  const [type, count] = issue.split(": ");
                  return (
                    <div key={idx} className="flex items-center justify-between p-2 rounded-md bg-muted/50">
                      <span className="text-sm text-foreground font-mono">{type}</span>
                      <Badge variant="outline" className="text-xs">{count}</Badge>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>

        {/* AI Suggestions */}
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center gap-2">
              <Brain className="h-4 w-4 text-primary" />
              <CardTitle className="text-sm">Sugestões da IA</CardTitle>
            </div>
            <CardDescription className="text-xs">Análise inteligente baseada nos padrões detectados</CardDescription>
          </CardHeader>
          <CardContent>
            {analysis.suggestions.length === 0 ? (
              <div className="flex items-center gap-2 text-sm text-muted-foreground py-4">
                <Zap className="h-4 w-4 text-green-500" />
                Sem sugestões — tudo operando normalmente!
              </div>
            ) : (
              <div className="space-y-2">
                {analysis.suggestions.map((suggestion, idx) => (
                  <div key={idx} className="flex items-start gap-2 p-2.5 rounded-md border border-primary/20 bg-primary/5">
                    <AlertTriangle className="h-3.5 w-3.5 text-primary mt-0.5 shrink-0" />
                    <span className="text-sm text-foreground">{suggestion}</span>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* System Logs Breakdown */}
      {systemLogs.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center gap-2">
              <Server className="h-4 w-4 text-blue-500" />
              <CardTitle className="text-sm">Eventos de Sistema por Tipo</CardTitle>
            </div>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
              {sysBreakdown.map(([type, count]) => (
                <div key={type} className="flex items-center justify-between p-2 rounded-md bg-muted/50">
                  <span className="text-sm text-foreground capitalize">{type.replace(/_/g, " ")}</span>
                  <Badge variant="secondary" className="text-xs">{count}</Badge>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Recent System Logs */}
      {systemLogs.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm">Últimos Eventos de Sistema</CardTitle>
          </CardHeader>
          <CardContent>
            <ScrollArea className="h-[250px]">
              <div className="space-y-1.5">
                {systemLogs.slice(0, 30).map(log => (
                  <div key={log.id} className="flex items-start gap-2 p-2 rounded-md text-xs hover:bg-muted/50">
                    <Badge variant="outline" className="text-[10px] shrink-0 mt-0.5">{log.event_type}</Badge>
                    <div className="flex-1 min-w-0">
                      <p className="text-foreground truncate">{log.message}</p>
                      <p className="text-muted-foreground">{log.source} · {new Date(log.created_at).toLocaleString("pt-BR")}</p>
                    </div>
                  </div>
                ))}
              </div>
            </ScrollArea>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

export default AdminSystemDiagnostics;
