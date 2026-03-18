import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { DollarSign, TrendingUp, Target, Percent, Trophy } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useDealRoom } from "@/hooks/useDealRoom";
import { OnboardingDialog, useOnboarding } from "@/components/OnboardingDialog";

function formatCurrency(val: number) {
  return `R$ ${val.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

interface DealRoomStoreWidgetProps {
  tenantId: string;
}

export function DealRoomStoreWidget({ tenantId }: DealRoomStoreWidgetProps) {
  const { getMetrics } = useDealRoom();
  const { showOnboarding, setShowOnboarding } = useOnboarding("dealroom");
  const [metrics, setMetrics] = useState<{
    totalVendas: number;
    totalTransacionado: number;
    totalTaxas: number;
    ticketMedio: number;
    totalReunioes: number;
    taxaConversao: number;
  } | null>(null);
  const [ranking, setRanking] = useState<{ posicao: number; nome: string; total_vendido: number; vendas: number }[]>([]);

  useEffect(() => {
    if (!tenantId) return;
    const fetch = async () => {
      const result = await getMetrics({ tenant_id: tenantId });
      if (result) {
        setMetrics(result.metrics);
        setRanking(result.ranking.slice(0, 5));
      }
    };
    fetch();
  }, [tenantId, getMetrics]);

  if (!metrics) return null;
  if (metrics.totalVendas === 0 && metrics.totalReunioes === 0) return null;

  return (
    <div className="space-y-4">
      <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
        <TrendingUp className="h-4 w-4 text-primary" />
        Deal Room — Resumo
      </h3>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: "Vendas via DR", value: metrics.totalVendas, icon: TrendingUp },
          { label: "Valor Vendido", value: formatCurrency(metrics.totalTransacionado), icon: DollarSign },
          { label: "Taxa Plataforma", value: formatCurrency(metrics.totalTaxas), icon: Percent },
          { label: "Conversão", value: `${metrics.taxaConversao.toFixed(1)}%`, icon: Target },
        ].map(kpi => (
          <Card key={kpi.label}>
            <CardContent className="p-3">
              <div className="flex items-center gap-1.5 mb-1">
                <kpi.icon className="h-3.5 w-3.5 text-primary" />
                <span className="text-[11px] text-muted-foreground">{kpi.label}</span>
              </div>
              <p className="text-sm font-bold text-foreground">{kpi.value}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {ranking.length > 0 && (
        <Card>
          <CardHeader className="py-3 px-4">
            <CardTitle className="text-xs flex items-center gap-2">
              <Trophy className="h-3.5 w-3.5 text-amber-500" /> Top Vendedores
            </CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-3 space-y-2">
            {ranking.map((v) => (
              <div key={v.posicao} className="flex items-center justify-between text-sm">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold w-5">
                    {v.posicao === 1 ? "🥇" : v.posicao === 2 ? "🥈" : v.posicao === 3 ? "🥉" : `${v.posicao}º`}
                  </span>
                  <span className="text-foreground">{v.nome}</span>
                </div>
                <div className="flex items-center gap-3">
                  <Badge variant="secondary" className="text-[10px]">{v.vendas} vendas</Badge>
                  <span className="font-semibold text-foreground text-xs">{formatCurrency(v.total_vendido)}</span>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}
      <OnboardingDialog featureKey="dealroom" open={showOnboarding} onClose={() => setShowOnboarding(false)} />
    </div>
  );
}
