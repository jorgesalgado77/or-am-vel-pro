import React, { useState, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { formatCurrency } from "@/lib/financing";
import {
  DollarSign, TrendingUp, TrendingDown, AlertTriangle, CalendarDays,
  Bell, FileDown, Loader2, Target, Brain, X, Clock, BellRing,
} from "lucide-react";
import { KpiCard } from "@/components/dashboard/DashboardKpiCard";
import { miaInvoke } from "@/services/mia/MIAInvoke";
import { toast } from "sonner";
import type { useFinancialData } from "@/hooks/useFinancialData";

type FinData = ReturnType<typeof useFinancialData>;

interface Props {
  fin: FinData;
  showNotifications: boolean;
  setShowNotifications: (v: boolean) => void;
  pdfLoading: boolean;
  onExportPdf: () => void;
}

export const FinancialHeader = React.memo(function FinancialHeader({
  fin, showNotifications, setShowNotifications, pdfLoading, onExportPdf,
}: Props) {
  const [miaAnalysis, setMiaAnalysis] = useState("");
  const [miaLoading, setMiaLoading] = useState(false);

  const unreadCount = fin.notifications.filter(n => !n.read).length;
  const atrasadas = fin.notifications.filter(n => n.type === "atrasado");
  const aVencer = fin.notifications.filter(n => n.type === "vencer");

  const handleMIAAnalysis = useCallback(async () => {
    setMiaLoading(true);
    try {
      const alertas = fin.notifications.map(n => n.message).join("\n");
      const resumo = `Alertas financeiros:\n${alertas}\n\nResumo:\n- Total a pagar: ${formatCurrency(fin.totalContasPagar)}\n- Contas vencidas: ${fin.contasVencidas.length}\n- Vencem em 7 dias: ${fin.contasAVencer7d.length}\n- Lucro estimado: ${formatCurrency(fin.lucroEstimado)}\n- Faturamento: ${formatCurrency(fin.faturamento)}\n- Custos fixos: ${formatCurrency(fin.contasFixas)}\n- Folha: ${formatCurrency(fin.totalFolha)}`;
      const { data, error } = await miaInvoke("cashflow-ai", { resumo_financeiro: resumo }, { tenantId: "system", userId: "system", origin: "system", context: "financial-alerts" });
      if (error) throw error;
      setMiaAnalysis(data.analise || "Sem análise disponível.");
    } catch {
      toast.error("Erro ao gerar análise da MIA");
    } finally {
      setMiaLoading(false);
    }
  }, [fin]);

  return (
    <>
      {/* Action bar */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h2 className="text-lg font-bold">Módulo Financeiro</h2>
        <div className="flex items-center gap-2">
          <div className="relative">
            <Button variant="outline" size="sm" className="gap-1.5" onClick={() => setShowNotifications(!showNotifications)}>
              <Bell className="h-3.5 w-3.5" /> Alertas
              {unreadCount > 0 && (
                <span className="absolute -top-1 -right-1 h-4 w-4 rounded-full bg-destructive text-[10px] text-destructive-foreground flex items-center justify-center">
                  {unreadCount}
                </span>
              )}
            </Button>
          </div>
          <Button variant="outline" size="sm" className="gap-1.5" onClick={onExportPdf} disabled={pdfLoading}>
            {pdfLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <FileDown className="h-3.5 w-3.5" />}
            Exportar PDF
          </Button>
        </div>
      </div>

      {/* Notifications Panel — full width, below header */}
      {showNotifications && (
        <Card className="border-border animate-fade-in">
          <CardHeader className="pb-2 flex flex-row items-center justify-between">
            <CardTitle className="text-sm flex items-center gap-2">
              <BellRing className="h-4 w-4 text-primary" /> Painel de Alertas Financeiros
              {fin.notifications.length > 0 && (
                <Badge variant="destructive" className="text-[10px] h-5">{fin.notifications.length}</Badge>
              )}
            </CardTitle>
            <div className="flex items-center gap-2">
              <Button size="sm" variant="outline" className="gap-1 h-7 text-xs" onClick={handleMIAAnalysis} disabled={miaLoading || fin.notifications.length === 0}>
                {miaLoading ? <Loader2 className="h-3 w-3 animate-spin" /> : <Brain className="h-3 w-3" />}
                Análise MIA
              </Button>
              <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => setShowNotifications(false)}>
                <X className="h-3.5 w-3.5" />
              </Button>
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            {fin.notifications.length === 0 ? (
              <div className="text-center py-6 text-sm text-muted-foreground">
                ✅ Nenhum alerta financeiro no momento. Suas contas estão em dia!
              </div>
            ) : (
              <div className="space-y-3">
                {/* Contas Vencidas */}
                {atrasadas.length > 0 && (
                  <div className="space-y-1.5">
                    <div className="flex items-center gap-2">
                      <AlertTriangle className="h-3.5 w-3.5 text-destructive" />
                      <span className="text-xs font-semibold text-destructive">Contas Vencidas ({atrasadas.length})</span>
                    </div>
                    <div className="grid gap-1.5">
                      {atrasadas.map(n => (
                        <div key={n.id} className="flex items-start gap-2 p-2.5 rounded-lg bg-destructive/5 border border-destructive/20 text-xs">
                          <AlertTriangle className="h-3.5 w-3.5 text-destructive shrink-0 mt-0.5" />
                          <span className="text-foreground">{n.message}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Contas a Vencer */}
                {aVencer.length > 0 && (
                  <div className="space-y-1.5">
                    <div className="flex items-center gap-2">
                      <Clock className="h-3.5 w-3.5 text-amber-600" />
                      <span className="text-xs font-semibold text-amber-600">Vencem em Breve ({aVencer.length})</span>
                    </div>
                    <div className="grid gap-1.5">
                      {aVencer.map(n => (
                        <div key={n.id} className="flex items-start gap-2 p-2.5 rounded-lg bg-amber-500/5 border border-amber-500/20 text-xs">
                          <Clock className="h-3.5 w-3.5 text-amber-600 shrink-0 mt-0.5" />
                          <span className="text-foreground">{n.message}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* MIA Analysis */}
            {miaAnalysis && (
              <div className="p-3 rounded-lg bg-primary/5 border border-primary/20 space-y-1.5 animate-fade-in">
                <div className="flex items-center gap-2">
                  <Brain className="h-3.5 w-3.5 text-primary" />
                  <span className="text-xs font-semibold text-primary">Análise da MIA</span>
                </div>
                <p className="text-xs text-foreground whitespace-pre-line leading-relaxed">{miaAnalysis}</p>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <KpiCard icon={DollarSign} label="Total a Pagar" value={formatCurrency(fin.totalContasPagar)} colorVariant="rose" tooltip="Soma de todas as contas a pagar pendentes" />
        <KpiCard icon={AlertTriangle} label="Contas Vencidas" value={String(fin.contasVencidas.length)} destructive={fin.contasVencidas.length > 0} colorVariant={fin.contasVencidas.length > 0 ? undefined : "orange"} tooltip="Contas que já passaram da data de vencimento" />
        <KpiCard icon={CalendarDays} label="Vencem em 7 dias" value={String(fin.contasAVencer7d.length)} colorVariant="amber" tooltip="Contas com vencimento nos próximos 7 dias" />
        <KpiCard
          icon={fin.lucroEstimado >= 0 ? TrendingUp : TrendingDown}
          label={fin.lucroEstimado >= 0 ? "Lucro Estimado" : "Prejuízo Estimado"}
          value={formatCurrency(Math.abs(fin.lucroEstimado))}
          colorVariant={fin.lucroEstimado >= 0 ? "emerald" : undefined}
          destructive={fin.lucroEstimado < 0}
          tooltip="Diferença entre faturamento e custos totais"
        />
      </div>

      {/* Break-even card */}
      <Card>
        <CardContent className="p-4">
          <div className="grid grid-cols-2 lg:grid-cols-5 gap-4 items-center">
            <div className="text-center">
              <p className="text-xs text-muted-foreground mb-1">Custos Fixos</p>
              <p className="font-bold text-sm">{formatCurrency(fin.contasFixas)}</p>
            </div>
            <div className="text-center">
              <p className="text-xs text-muted-foreground mb-1">Folha Total</p>
              <p className="font-bold text-sm">{formatCurrency(fin.totalFolha)}</p>
            </div>
            <div className="text-center">
              <Target className="h-5 w-5 mx-auto text-primary mb-1" />
              <p className="text-xs text-muted-foreground mb-1">Ponto de Equilíbrio</p>
              <p className="font-bold text-primary">{formatCurrency(fin.breakEven)}</p>
            </div>
            <div className="text-center">
              <p className="text-xs text-muted-foreground mb-1">Faturamento Atual</p>
              <p className="font-bold text-sm">{formatCurrency(fin.faturamento)}</p>
            </div>
            <div className="text-center">
              <p className="text-xs text-muted-foreground mb-1">Resultado</p>
              <p className={`font-bold text-sm ${fin.lucroEstimado >= 0 ? "text-primary" : "text-destructive"}`}>
                {fin.lucroEstimado >= 0 ? "+" : ""}{formatCurrency(fin.lucroEstimado)}
              </p>
              {fin.faturamento > 0 && (
                <div className="mt-1 h-2 bg-muted rounded-full overflow-hidden">
                  <div className={`h-full rounded-full transition-all ${fin.lucroEstimado >= 0 ? "bg-primary" : "bg-destructive"}`}
                    style={{ width: `${Math.min((fin.faturamento / (fin.breakEven || 1)) * 100, 100)}%` }} />
                </div>
              )}
            </div>
          </div>
        </CardContent>
      </Card>
    </>
  );
});
