import { useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Users, Calculator, TrendingUp, UserCheck, AlertTriangle } from "lucide-react";
import { formatCurrency } from "@/lib/financing";
import { useCompanySettings } from "@/hooks/useCompanySettings";
import { useIndicadores } from "@/hooks/useIndicadores";
import { addDays, isPast } from "date-fns";
import type { Database } from "@/integrations/supabase/types";

type Client = Database["public"]["Tables"]["clients"]["Row"];

interface LastSimInfo {
  valor_final: number;
  created_at: string;
}

interface DashboardProps {
  clients: Client[];
  lastSims: Record<string, LastSimInfo>;
}

export function Dashboard({ clients, lastSims }: DashboardProps) {
  const { settings } = useCompanySettings();
  const { indicadores } = useIndicadores();

  const stats = useMemo(() => {
    const totalClients = clients.length;
    const clientsWithSim = clients.filter(c => lastSims[c.id]).length;
    const clientsWithoutSim = totalClients - clientsWithSim;

    const expired = clients.filter(c => {
      const sim = lastSims[c.id];
      if (!sim) return false;
      return isPast(addDays(new Date(sim.created_at), settings.budget_validity_days));
    }).length;

    const totalValue = Object.values(lastSims).reduce((sum, s) => sum + s.valor_final, 0);

    // Stats by projetista
    const byProjetista: Record<string, { count: number; total: number; expired: number }> = {};
    clients.forEach(c => {
      const name = c.vendedor || "Sem projetista";
      if (!byProjetista[name]) byProjetista[name] = { count: 0, total: 0, expired: 0 };
      byProjetista[name].count++;
      const sim = lastSims[c.id];
      if (sim) {
        byProjetista[name].total += sim.valor_final;
        if (isPast(addDays(new Date(sim.created_at), settings.budget_validity_days))) {
          byProjetista[name].expired++;
        }
      }
    });

    // Stats by indicador
    const byIndicador: Record<string, { nome: string; comissao: number; count: number; total: number; comissaoTotal: number }> = {};
    clients.forEach(c => {
      if (!c.indicador_id) return;
      const ind = indicadores.find(i => i.id === c.indicador_id);
      if (!ind) return;
      if (!byIndicador[c.indicador_id]) {
        byIndicador[c.indicador_id] = { nome: ind.nome, comissao: ind.comissao_percentual, count: 0, total: 0, comissaoTotal: 0 };
      }
      byIndicador[c.indicador_id].count++;
      const sim = lastSims[c.id];
      if (sim) {
        byIndicador[c.indicador_id].total += sim.valor_final;
        byIndicador[c.indicador_id].comissaoTotal += sim.valor_final * (ind.comissao_percentual / 100);
      }
    });

    return {
      totalClients, clientsWithSim, clientsWithoutSim, expired, totalValue,
      byProjetista: Object.entries(byProjetista).sort((a, b) => b[1].total - a[1].total),
      byIndicador: Object.entries(byIndicador).sort((a, b) => b[1].total - a[1].total),
    };
  }, [clients, lastSims, settings.budget_validity_days, indicadores]);

  return (
    <div className="space-y-6">
      {/* KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
        <KpiCard icon={Users} label="Total de Clientes" value={String(stats.totalClients)} />
        <KpiCard icon={Calculator} label="Com Orçamento" value={String(stats.clientsWithSim)} accent />
        <KpiCard icon={UserCheck} label="Sem Orçamento" value={String(stats.clientsWithoutSim)} />
        <KpiCard icon={AlertTriangle} label="Expirados" value={String(stats.expired)} destructive={stats.expired > 0} />
        <KpiCard icon={TrendingUp} label="Valor Total" value={formatCurrency(stats.totalValue)} accent />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* By Projetista */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Clientes por Projetista</CardTitle>
          </CardHeader>
          <CardContent>
            {stats.byProjetista.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-4">Nenhum dado</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow className="bg-secondary/50">
                    <TableHead className="font-medium">Projetista</TableHead>
                    <TableHead className="font-medium text-center">Clientes</TableHead>
                    <TableHead className="font-medium text-center">Expirados</TableHead>
                    <TableHead className="font-medium text-right">Valor Total</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {stats.byProjetista.map(([name, data]) => (
                    <TableRow key={name}>
                      <TableCell className="font-medium text-foreground">{name}</TableCell>
                      <TableCell className="text-center">
                        <Badge variant="secondary">{data.count}</Badge>
                      </TableCell>
                      <TableCell className="text-center">
                        {data.expired > 0 ? (
                          <Badge variant="destructive" className="text-xs">{data.expired}</Badge>
                        ) : <span className="text-muted-foreground">0</span>}
                      </TableCell>
                      <TableCell className="text-right tabular-nums font-medium">{formatCurrency(data.total)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        {/* By Indicador */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Clientes por Indicador</CardTitle>
          </CardHeader>
          <CardContent>
            {stats.byIndicador.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-4">Nenhum indicador vinculado</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow className="bg-secondary/50">
                    <TableHead className="font-medium">Indicador</TableHead>
                    <TableHead className="font-medium text-center">Clientes</TableHead>
                    <TableHead className="font-medium text-right">Valor Total</TableHead>
                    <TableHead className="font-medium text-right">Comissão</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {stats.byIndicador.map(([id, data]) => (
                    <TableRow key={id}>
                      <TableCell className="font-medium text-foreground">
                        {data.nome} <span className="text-muted-foreground text-xs">({data.comissao}%)</span>
                      </TableCell>
                      <TableCell className="text-center">
                        <Badge variant="secondary">{data.count}</Badge>
                      </TableCell>
                      <TableCell className="text-right tabular-nums font-medium">{formatCurrency(data.total)}</TableCell>
                      <TableCell className="text-right tabular-nums font-medium text-primary">{formatCurrency(data.comissaoTotal)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function KpiCard({ icon: Icon, label, value, accent, destructive }: {
  icon: React.ElementType; label: string; value: string; accent?: boolean; destructive?: boolean;
}) {
  return (
    <Card className={destructive ? "border-destructive/30" : ""}>
      <CardContent className="p-4 flex items-center gap-3">
        <div className={`p-2 rounded-lg ${destructive ? "bg-destructive/10" : accent ? "bg-primary/10" : "bg-secondary"}`}>
          <Icon className={`h-5 w-5 ${destructive ? "text-destructive" : accent ? "text-primary" : "text-muted-foreground"}`} />
        </div>
        <div>
          <p className="text-xs text-muted-foreground">{label}</p>
          <p className={`text-lg font-bold ${destructive ? "text-destructive" : "text-foreground"}`}>{value}</p>
        </div>
      </CardContent>
    </Card>
  );
}
