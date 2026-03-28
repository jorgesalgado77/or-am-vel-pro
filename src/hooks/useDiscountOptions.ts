import { useState, useEffect, useRef } from "react";
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
  const skipNextSync = useRef(false);

  const fetchOptions = async () => {
    const tenantId = await getResolvedTenantId();
    let query = supabase
      .from("discount_options")
      .select("*")
      .order("field_name");
    if (tenantId) query = query.eq("tenant_id", tenantId);
    const { data } = await query;
    if (!skipNextSync.current) {
      setOptions((data as DiscountOption[]) || []);
    }
    skipNextSync.current = false;
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

    // Optimistically update local state so tags don't disappear
    skipNextSync.current = true;
    if (existing) {
      setOptions(prev => prev.map(o => o.field_name === fieldName ? { ...o, percentages: sorted } : o));
    } else {
      setOptions(prev => [...prev, { id: `temp-${Date.now()}`, field_name: fieldName, percentages: sorted }]);
    }

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
    if (error) {
      console.error("[DiscountOptions] Save error:", error.message, error);
      skipNextSync.current = false;
      // Revert on error
      fetchOptions();
    }
    return error;
  };

  return { options, loading, getOptionsForField, updateOptions, refresh: fetchOptions, FIELD_LABELS };
}
