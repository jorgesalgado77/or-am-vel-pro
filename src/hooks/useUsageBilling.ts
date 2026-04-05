/**
 * Hook for usage billing dashboard
 */
import { useState, useEffect, useCallback } from "react";
import { useTenant } from "@/contexts/TenantContext";
import {
  getTenantUsageSummary,
  calculateOverage,
  type UsageFeature,
} from "@/services/billing/UsageTracker";
import { supabase } from "@/lib/supabaseClient";

interface UsageSummary {
  feature: UsageFeature;
  total_used: number;
  limit_value: number;
  remaining: number;
  percent_used: number;
  is_exceeded: boolean;
}

interface OverageItem {
  feature: UsageFeature;
  extra: number;
  unit_price: number;
  total: number;
}

interface UsageHistory {
  id: string;
  feature: string;
  total_usage: number;
  extra_usage: number;
  amount: number;
  period: string;
  created_at: string;
}

const FEATURE_LABELS: Record<UsageFeature, string> = {
  ia_interactions: "Interações IA",
  whatsapp_messages: "Mensagens WhatsApp",
  email_sends: "Envios de Email",
  pdf_generation: "Geração de PDF",
  proposal_generation: "Propostas Geradas",
  smart_import: "Smart Import 3D",
};

const FEATURE_COLORS: Record<UsageFeature, string> = {
  ia_interactions: "hsl(260, 60%, 55%)",
  whatsapp_messages: "hsl(142, 70%, 40%)",
  email_sends: "hsl(220, 70%, 50%)",
  pdf_generation: "hsl(0, 60%, 50%)",
  proposal_generation: "hsl(30, 80%, 50%)",
  smart_import: "hsl(200, 70%, 45%)",
};

export function useUsageBilling() {
  const { tenantId } = useTenant();
  const [usage, setUsage] = useState<UsageSummary[]>([]);
  const [overage, setOverage] = useState<OverageItem[]>([]);
  const [history, setHistory] = useState<UsageHistory[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    if (!tenantId) return;
    setLoading(true);

    const [usageData, overageData] = await Promise.all([
      getTenantUsageSummary(tenantId),
      calculateOverage(tenantId),
    ]);

    setUsage(usageData);
    setOverage(overageData);

    // Fetch billing history
    const { data: historyData } = await supabase
      .from("usage_billing" as never)
      .select("*")
      .eq("tenant_id" as never, tenantId as never)
      .order("created_at" as never, { ascending: false } as never);

    if (historyData) setHistory(historyData as unknown as UsageHistory[]);

    setLoading(false);
  }, [tenantId]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const totalOverageCost = overage.reduce((sum, o) => sum + o.total, 0);

  return {
    usage,
    overage,
    history,
    loading,
    totalOverageCost,
    refresh,
    FEATURE_LABELS,
    FEATURE_COLORS,
  };
}
