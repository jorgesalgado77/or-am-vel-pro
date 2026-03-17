import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";

export interface FinancingRate {
  id: string;
  provider_name: string;
  provider_type: "boleto" | "credito";
  installments: number;
  coefficient: number;
}

export function useFinancingRates(providerType?: "boleto" | "credito") {
  const [rates, setRates] = useState<FinancingRate[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchRates = async () => {
    setLoading(true);
    let query = supabase.from("financing_rates").select("*").order("provider_name").order("installments");
    if (providerType) query = query.eq("provider_type", providerType);
    const { data } = await query;
    setRates((data as FinancingRate[]) || []);
    setLoading(false);
  };

  useEffect(() => {
    fetchRates();
  }, [providerType]);

  const providers = [...new Set(rates.map((r) => r.provider_name))];

  const getRatesForProvider = (name: string) => rates.filter((r) => r.provider_name === name);

  return { rates, loading, providers, getRatesForProvider, refresh: fetchRates };
}
