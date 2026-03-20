import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabaseClient";

interface ConversionStats {
  totalSimulations: number;
  totalClosed: number;
  conversionRate: number;
  avgDiscountClosed: number;
  avgValueClosed: number;
  loading: boolean;
}

export function useConversionHistory(tenantId: string | null): ConversionStats {
  const [stats, setStats] = useState<ConversionStats>({
    totalSimulations: 0,
    totalClosed: 0,
    conversionRate: 0,
    avgDiscountClosed: 0,
    avgValueClosed: 0,
    loading: true,
  });

  useEffect(() => {
    if (!tenantId) {
      setStats(s => ({ ...s, loading: false }));
      return;
    }

    async function fetch() {
      try {
        // Total simulations
        const { count: simCount } = await supabase
          .from("simulations")
          .select("*", { count: "exact", head: true });

        // Closed deals (clients with status 'ganho' or 'fechado')
        const { data: closedClients } = await supabase
          .from("clients")
          .select("id, valor_final")
          .or("status.eq.ganho,status.eq.fechado");

        // Get simulations for closed clients to find avg discount
        const closedIds = (closedClients || []).map(c => c.id);
        let avgDiscount = 0;
        let avgValue = 0;

        if (closedIds.length > 0) {
          const { data: closedSims } = await supabase
            .from("simulations")
            .select("desconto1, desconto2, desconto3, valor_final")
            .in("client_id", closedIds.slice(0, 50));

          if (closedSims && closedSims.length > 0) {
            const totalDiscount = closedSims.reduce((sum, s) => {
              const d1 = Number(s.desconto1) || 0;
              const d2 = Number(s.desconto2) || 0;
              const d3 = Number(s.desconto3) || 0;
              const combined = 1 - (1 - d1/100) * (1 - d2/100) * (1 - d3/100);
              return sum + combined * 100;
            }, 0);
            avgDiscount = totalDiscount / closedSims.length;

            const totalValue = closedSims.reduce((sum, s) => sum + (Number(s.valor_final) || 0), 0);
            avgValue = totalValue / closedSims.length;
          }
        }

        const total = simCount || 0;
        const closed = closedIds.length;
        const rate = total > 0 ? (closed / total) * 100 : 0;

        setStats({
          totalSimulations: total,
          totalClosed: closed,
          conversionRate: Math.round(rate * 10) / 10,
          avgDiscountClosed: Math.round(avgDiscount * 10) / 10,
          avgValueClosed: avgValue,
          loading: false,
        });
      } catch {
        setStats(s => ({ ...s, loading: false }));
      }
    }

    fetch();
  }, [tenantId]);

  return stats;
}
