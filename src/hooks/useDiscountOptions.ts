import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabaseClient";
import { getResolvedTenantId } from "@/contexts/TenantContext";

export interface DiscountOption {
  id: string;
  field_name: string;
  percentages: number[];
}

const FIELD_LABELS: Record<string, string> = {
  desconto1: "Desconto 1",
  desconto2: "Desconto 2",
  desconto3: "Desconto 3",
  plus: "Plus",
};

export function useDiscountOptions() {
  const [options, setOptions] = useState<DiscountOption[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchOptions = async () => {
    setLoading(true);
    const { data } = await supabase
      .from("discount_options")
      .select("*")
      .order("field_name");
    setOptions((data as DiscountOption[]) || []);
    setLoading(false);
  };

  useEffect(() => {
    fetchOptions();

    const channel = supabase
      .channel("discount_options_changes")
      .on("postgres_changes", { event: "*", schema: "public", table: "discount_options" }, () => {
        fetchOptions();
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, []);

  const getOptionsForField = (fieldName: string): number[] => {
    const opt = options.find((o) => o.field_name === fieldName);
    return opt ? opt.percentages.map(Number).sort((a, b) => a - b) : [0];
  };

  const updateOptions = async (fieldName: string, percentages: number[]) => {
    const sorted = [...percentages].sort((a, b) => a - b);
    const existing = options.find((o) => o.field_name === fieldName);
    
    let error;
    if (existing) {
      ({ error } = await supabase
        .from("discount_options")
        .update({ percentages: sorted } as any)
        .eq("id", existing.id));
    } else {
      const tenantId = await getResolvedTenantId();
      ({ error } = await supabase
        .from("discount_options")
        .insert({ field_name: fieldName, percentages: sorted, tenant_id: tenantId } as any));
    }
    if (error) console.error("[DiscountOptions] Save error:", error.message, error);
    if (!error) fetchOptions();
    return error;
  };

  return { options, loading, getOptionsForField, updateOptions, refresh: fetchOptions, FIELD_LABELS };
}
