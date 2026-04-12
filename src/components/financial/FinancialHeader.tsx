import React from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { formatCurrency } from "@/lib/financing";
import {
  DollarSign, TrendingUp, TrendingDown, AlertTriangle, CalendarDays,
  Bell, FileDown, Loader2, Target,
} from "lucide-react";
import { KpiCard } from "@/components/dashboard/DashboardKpiCard";
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
  const unreadCount = fin.notifications.filter(n => !n.read).length;

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
            {showNotifications && (
              <div className="absolute right-0 top-full mt-1 w-80 bg-card border rounded-lg shadow-lg z-50 max-h-64 overflow-y-auto">
                <div className="p-3 border-b font-semibold text-sm">Notificações Financeiras</div>
                {fin.notifications.length === 0 ? (
                  <div className="p-4 text-center text-sm text-muted-foreground">Nenhum alerta no momento ✅</div>
                ) : fin.notifications.map(n => (
                  <div key={n.id} className={`p-3 border-b text-sm ${n.type === "atrasado" ? "bg-destructive/5" : "bg-accent/30"}`}>
                    {n.message}
                  </div>
                ))}
              </div>
            )}
          </div>
          <Button variant="outline" size="sm" className="gap-1.5" onClick={onExportPdf} disabled={pdfLoading}>
            {pdfLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <FileDown className="h-3.5 w-3.5" />}
            Exportar PDF
          </Button>
        </div>
      </div>

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
