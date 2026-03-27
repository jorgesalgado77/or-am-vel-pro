import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/lib/supabaseClient";

export interface TenantOnboarding {
  id: string;
  tenant_id: string;
  onboarding_completed: boolean;
  setup_fee_paid: boolean;
  setup_fee_amount: number;
  setup_fee_paid_at: string | null;
}

export function useTenantOnboarding(tenantId: string | null) {
  const [onboarding, setOnboarding] = useState<TenantOnboarding | null>(null);
  const [loading, setLoading] = useState(true);
  const [setupFeePaid, setSetupFeePaid] = useState(true);

  const fetchOnboarding = useCallback(async () => {
    if (!tenantId) { setLoading(false); return; }
    const { data } = await (supabase as any)
      .from("tenant_onboarding")
      .select("*")
      .eq("tenant_id", tenantId)
      .maybeSingle();

    if (data) {
      const record = data as TenantOnboarding;
      setOnboarding(record);
      setSetupFeePaid(record.setup_fee_paid);
    } else {
      setSetupFeePaid(true);
    }
    setLoading(false);
  }, [tenantId]);

  useEffect(() => { fetchOnboarding(); }, [fetchOnboarding]);

  return { onboarding, loading, setupFeePaid, refetch: fetchOnboarding };
}
