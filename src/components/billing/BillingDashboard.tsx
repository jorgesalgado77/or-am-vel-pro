/**
 * Usage Billing Dashboard — shows consumption, limits, overage costs
 */
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ScrollArea } from "@/components/ui/scroll-area";
import { RefreshCw, AlertTriangle, TrendingUp, DollarSign, BarChart3, Zap } from "lucide-react";
import { useUsageBilling } from "@/hooks/useUsageBilling";
import type { UsageFeature } from "@/services/billing/UsageTracker";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

export function BillingDashboard() {
  const {
    usage,
    overage,
    history,
    loading,
    totalOverageCost,
    refresh,
    FEATURE_LABELS,
    FEATURE_COLORS,
  } = useUsageBilling();

  const alertFeatures = usage.filter((u) => u.percent_used >= 80);
  const exceededFeatures = usage.filter((u) => u.is_exceeded);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-foreground flex items-center gap-2">
            <BarChart3 className="h-6 w-6 text-primary" />
            Consumo & Billing
          </h2>
          <p className="text-sm text-muted-foreground mt-1">
            Controle de uso por funcionalidade no período atual
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={refresh} disabled={loading}>
          <RefreshCw className={`h-4 w-4 mr-2 ${loading ? "animate-spin" : ""}`} />
          Atualizar
        </Button>
      </div>

      {/* Alerts */}
      {alertFeatures.length > 0 && (
        <Card className="border-amber-200 bg-amber-50 dark:bg-amber-950/20 dark:border-amber-800">
          <CardContent className="py-4">
            <div className="flex items-start gap-3">
              <AlertTriangle className="h-5 w-5 text-amber-500 shrink-0 mt-0.5" />
              <div>
                <p className="font-medium text-amber-800 dark:text-amber-200">
                  {exceededFeatures.length > 0
                    ? `${exceededFeatures.length} recurso(s) excederam o limite!`
                    : `${alertFeatures.length} recurso(s) próximos do limite`}
                </p>
                <p className="text-sm text-amber-600 dark:text-amber-400 mt-1">
                  {exceededFeatures.length > 0
                    ? "O uso excedente será cobrado automaticamente no próximo ciclo."
                    : "Considere fazer upgrade do plano para evitar interrupções."}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Summary Cards */}
      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center">
                <Zap className="h-5 w-5 text-primary" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Recursos Ativos</p>
                <p className="text-2xl font-bold text-foreground">{usage.length}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-full bg-amber-500/10 flex items-center justify-center">
                <TrendingUp className="h-5 w-5 text-amber-500" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Excedentes</p>
                <p className="text-2xl font-bold text-foreground">{exceededFeatures.length}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-full bg-destructive/10 flex items-center justify-center">
                <DollarSign className="h-5 w-5 text-destructive" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Custo Excedente</p>
                <p className="text-2xl font-bold text-foreground">
                  R$ {totalOverageCost.toFixed(2).replace(".", ",")}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Usage Meters */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Consumo por Recurso</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-5">
            {usage.map((u) => {
              const label = FEATURE_LABELS[u.feature as UsageFeature] || u.feature;
              const color = FEATURE_COLORS[u.feature as UsageFeature] || "hsl(var(--primary))";
              const isWarning = u.percent_used >= 80;
              const isExceeded = u.is_exceeded;

              return (
                <div key={u.feature} className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium text-foreground">{label}</span>
                    <div className="flex items-center gap-2">
                      <span className="text-sm text-muted-foreground">
                        {u.total_used.toLocaleString("pt-BR")} / {u.limit_value.toLocaleString("pt-BR")}
                      </span>
                      {isExceeded && (
                        <Badge variant="destructive" className="text-xs">Excedido</Badge>
                      )}
                      {isWarning && !isExceeded && (
                        <Badge variant="secondary" className="text-xs bg-amber-100 text-amber-700">Atenção</Badge>
                      )}
                    </div>
                  </div>
                  <Progress
                    value={Math.min(100, u.percent_used)}
                    className="h-2.5"
                    style={{
                      ["--progress-color" as string]: isExceeded
                        ? "hsl(0, 60%, 50%)"
                        : isWarning
                          ? "hsl(30, 80%, 50%)"
                          : color,
                    }}
                  />
                </div>
              );
            })}

            {usage.length === 0 && !loading && (
              <p className="text-center text-muted-foreground py-8">
                Nenhum consumo registrado neste período.
              </p>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Overage Details */}
      {overage.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg text-destructive flex items-center gap-2">
              <AlertTriangle className="h-5 w-5" />
              Detalhes do Excedente
            </CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Recurso</TableHead>
                  <TableHead className="text-right">Qtd. Extra</TableHead>
                  <TableHead className="text-right">Preço Unit.</TableHead>
                  <TableHead className="text-right">Total</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {overage.map((o) => (
                  <TableRow key={o.feature}>
                    <TableCell className="font-medium">
                      {FEATURE_LABELS[o.feature] || o.feature}
                    </TableCell>
                    <TableCell className="text-right">{o.extra.toLocaleString("pt-BR")}</TableCell>
                    <TableCell className="text-right">
                      R$ {o.unit_price.toFixed(2).replace(".", ",")}
                    </TableCell>
                    <TableCell className="text-right font-medium">
                      R$ {o.total.toFixed(2).replace(".", ",")}
                    </TableCell>
                  </TableRow>
                ))}
                <TableRow className="bg-muted/50">
                  <TableCell colSpan={3} className="font-bold">Total Excedente</TableCell>
                  <TableCell className="text-right font-bold text-destructive">
                    R$ {totalOverageCost.toFixed(2).replace(".", ",")}
                  </TableCell>
                </TableRow>
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {/* Billing History */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Histórico de Cobranças</CardTitle>
        </CardHeader>
        <CardContent>
          <ScrollArea className="max-h-[300px]">
            {history.length > 0 ? (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Período</TableHead>
                    <TableHead>Recurso</TableHead>
                    <TableHead className="text-right">Uso Total</TableHead>
                    <TableHead className="text-right">Excedente</TableHead>
                    <TableHead className="text-right">Valor</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {history.map((h) => (
                    <TableRow key={h.id}>
                      <TableCell className="text-sm">{h.period}</TableCell>
                      <TableCell>
                        {FEATURE_LABELS[h.feature as UsageFeature] || h.feature}
                      </TableCell>
                      <TableCell className="text-right">{h.total_usage}</TableCell>
                      <TableCell className="text-right">
                        {h.extra_usage > 0 ? (
                          <span className="text-destructive">{h.extra_usage}</span>
                        ) : (
                          "—"
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        R$ {h.amount.toFixed(2).replace(".", ",")}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            ) : (
              <p className="text-center text-muted-foreground py-8">
                Nenhum histórico de cobrança encontrado.
              </p>
            )}
          </ScrollArea>
        </CardContent>
      </Card>
    </div>
  );
}
