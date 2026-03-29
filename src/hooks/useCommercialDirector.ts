/**
 * useCommercialDirector — Hook for the IA Diretora Comercial dashboard
 */

import { useState, useEffect, useCallback } from "react";
import {
  getDirectorEngine,
  type BusinessAnalysis,
  type RevenueForecast,
  type VendorAnalysis,
  type StrategyDefinition,
} from "@/services/commercial/CommercialDirectorEngine";

export function useCommercialDirector(tenantId: string | null) {
  const [analysis, setAnalysis] = useState<BusinessAnalysis | null>(null);
  const [forecast, setForecast] = useState<RevenueForecast | null>(null);
  const [team, setTeam] = useState<VendorAnalysis[]>([]);
  const [strategy, setStrategy] = useState<StrategyDefinition | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    if (!tenantId) return;
    setLoading(true);
    try {
      const engine = getDirectorEngine(tenantId);
      const [a, f, t, s] = await Promise.all([
        engine.analyzeBusiness(),
        engine.forecastRevenue(),
        engine.manageTeam(),
        engine.defineStrategy(),
      ]);
      setAnalysis(a);
      setForecast(f);
      setTeam(t);
      setStrategy(s);
    } catch (e) {
      console.error("useCommercialDirector error:", e);
    } finally {
      setLoading(false);
    }
  }, [tenantId]);

  useEffect(() => { refresh(); }, [refresh]);

  return { analysis, forecast, team, strategy, loading, refresh };
}
