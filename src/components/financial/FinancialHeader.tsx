import React from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { formatCurrency } from "@/lib/financing";
import {
  DollarSign, TrendingUp, TrendingDown, AlertTriangle, CalendarDays,
  Bell, FileDown, Loader2, Target,
} from "lucide-react";
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
        <Card className="p-4">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl bg-destructive/10 flex items-center justify-center">
              <DollarSign className="h-5 w-5 text-destructive" />
            </div>
            <div>
              <p className="text-lg font-bold">{formatCurrency(fin.totalContasPagar)}</p>
              <p className="text-xs text-muted-foreground">Total a Pagar</p>
            </div>
          </div>
        </Card>
        <Card className="p-4">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl bg-accent flex items-center justify-center">
              <AlertTriangle className="h-5 w-5 text-accent-foreground" />
            </div>
            <div>
              <p className="text-lg font-bold text-destructive">{fin.contasVencidas.length}</p>
              <p className="text-xs text-muted-foreground">Contas Vencidas</p>
            </div>
          </div>
        </Card>
        <Card className="p-4">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl bg-primary/10 flex items-center justify-center">
              <CalendarDays className="h-5 w-5 text-primary" />
            </div>
            <div>
              <p className="text-lg font-bold">{fin.contasAVencer7d.length}</p>
              <p className="text-xs text-muted-foreground">Vencem em 7 dias</p>
            </div>
          </div>
        </Card>
        <Card className="p-4">
          <div className="flex items-center gap-3">
            <div className={`h-10 w-10 rounded-xl flex items-center justify-center ${fin.lucroEstimado >= 0 ? "bg-primary/10" : "bg-destructive/10"}`}>
              {fin.lucroEstimado >= 0 ? <TrendingUp className="h-5 w-5 text-primary" /> : <TrendingDown className="h-5 w-5 text-destructive" />}
            </div>
            <div>
              <p className={`text-lg font-bold ${fin.lucroEstimado >= 0 ? "text-primary" : "text-destructive"}`}>
                {formatCurrency(Math.abs(fin.lucroEstimado))}
              </p>
              <p className="text-xs text-muted-foreground">{fin.lucroEstimado >= 0 ? "Lucro Estimado" : "Prejuízo Estimado"}</p>
            </div>
          </div>
        </Card>
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
