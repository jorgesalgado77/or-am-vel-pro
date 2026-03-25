import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabaseClient";
import { getResolvedTenantId } from "@/lib/tenantState";

export interface FinancingRate {
  id: string;
  provider_name: string;
  provider_type: "boleto" | "credito";
  installments: number;
  coefficient: number;
  taxa_fixa: number;
  coeficiente_60: number;
  coeficiente_90: number;
  is_active?: boolean;
}

export function useFinancingRates(providerType?: "boleto" | "credito") {
  const [rates, setRates] = useState<FinancingRate[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchRates = async () => {
    setLoading(true);
    const tenantId = await getResolvedTenantId();
    let query = supabase.from("financing_rates").select("*").order("provider_name").order("installments");
    if (tenantId) query = query.eq("tenant_id", tenantId);
    if (providerType) query = query.eq("provider_type", providerType);
    const { data } = await query;
    setRates((data as FinancingRate[]) || []);
    setLoading(false);
  };

  useEffect(() => {
    fetchRates();
  }, [providerType]);

  const providers = [...new Set(rates.map((r) => r.provider_name))];

  const activeProviders = [...new Set(
    rates.filter((r) => r.is_active !== false).map((r) => r.provider_name)
  )];

  const getRatesForProvider = (name: string) => rates.filter((r) => r.provider_name === name);

  const isProviderActive = (name: string): boolean => {
    const providerRates = rates.filter((r) => r.provider_name === name);
    return providerRates.length === 0 || providerRates[0]?.is_active !== false;
  };

  const toggleProviderActive = async (name: string) => {
    const currentlyActive = isProviderActive(name);
    const providerRates = rates.filter((r) => r.provider_name === name);
    const ids = providerRates.map((r) => r.id);
    if (ids.length === 0) return;
    const { error } = await supabase
      .from("financing_rates")
      .update({ is_active: !currentlyActive } as any)
      .in("id", ids);
    if (!error) fetchRates();
    return error;
  };

  return { rates, loading, providers, activeProviders, getRatesForProvider, isProviderActive, toggleProviderActive, refresh: fetchRates };
}
