/**
 * Usage Tracker — records feature consumption per tenant
 */
import { supabase } from "@/lib/supabaseClient";

export type UsageFeature =
  | "ia_interactions"
  | "whatsapp_messages"
  | "email_sends"
  | "pdf_generation"
  | "proposal_generation"
  | "smart_import";

interface TrackUsageParams {
  tenant_id: string;
  user_id: string;
  feature: UsageFeature;
  quantity?: number;
  metadata?: Record<string, unknown>;
}

interface UsageSummary {
  feature: UsageFeature;
  total_used: number;
  limit_value: number;
  remaining: number;
  percent_used: number;
  is_exceeded: boolean;
}

/**
 * Record a usage event. Returns false if the tenant has exceeded the limit
 * and blocking is enabled for this feature.
 */
export async function trackUsage({
  tenant_id,
  user_id,
  feature,
  quantity = 1,
  metadata,
}: TrackUsageParams): Promise<{ allowed: boolean; usage: UsageSummary | null }> {
  // Check limit before recording
  const check = await checkUsageLimit(tenant_id, feature);
  if (!check) {
    return { allowed: true, usage: null };
  }

  // If exceeded, still record but flag
  const { error } = await supabase.from("usage_tracking" as never).insert({
    tenant_id,
    user_id,
    feature,
    quantity,
    metadata: metadata ?? {},
  } as never);

  if (error) {
    console.error("[UsageTracker] insert error:", error.message);
  }

  return { allowed: !check.is_exceeded, usage: check };
}

/**
 * Check current usage against plan limit for a feature
 */
export async function checkUsageLimit(
  tenant_id: string,
  feature: UsageFeature
): Promise<UsageSummary | null> {
  const now = new Date();
  const periodStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();

  // Get current usage for this month
  const { data: usageData } = await supabase
    .from("usage_tracking" as never)
    .select("quantity")
    .eq("tenant_id" as never, tenant_id as never)
    .eq("feature" as never, feature as never)
    .gte("created_at" as never, periodStart as never);

  const totalUsed = (usageData as Array<{ quantity: number }> | null)?.reduce(
    (sum, row) => sum + (row.quantity || 1),
    0
  ) ?? 0;

  // Get limit from tenant's plan
  const { data: tenantData } = await supabase
    .from("tenants")
    .select("plano")
    .eq("id", tenant_id)
    .single();

  if (!tenantData) return null;

  const planSlug = (tenantData as { plano: string }).plano;

  const { data: limitData } = await supabase
    .from("usage_limits" as never)
    .select("limit_value")
    .eq("plan_slug" as never, planSlug as never)
    .eq("feature" as never, feature as never)
    .maybeSingle();

  const limitValue = (limitData as { limit_value: number } | null)?.limit_value ?? 999999;

  const remaining = Math.max(0, limitValue - totalUsed);
  const percentUsed = limitValue > 0 ? Math.min(100, (totalUsed / limitValue) * 100) : 0;

  return {
    feature,
    total_used: totalUsed,
    limit_value: limitValue,
    remaining,
    percent_used: percentUsed,
    is_exceeded: totalUsed >= limitValue,
  };
}

/**
 * Get all usage summaries for a tenant (current billing period)
 */
export async function getTenantUsageSummary(
  tenant_id: string
): Promise<UsageSummary[]> {
  const features: UsageFeature[] = [
    "ia_interactions",
    "whatsapp_messages",
    "email_sends",
    "pdf_generation",
    "proposal_generation",
    "smart_import",
  ];

  const results = await Promise.all(
    features.map((f) => checkUsageLimit(tenant_id, f))
  );

  return results.filter((r): r is UsageSummary => r !== null);
}

/**
 * Calculate billing for overage usage
 */
export async function calculateOverage(
  tenant_id: string
): Promise<{ feature: UsageFeature; extra: number; unit_price: number; total: number }[]> {
  const summary = await getTenantUsageSummary(tenant_id);

  const OVERAGE_PRICES: Record<UsageFeature, number> = {
    ia_interactions: 0.15,
    whatsapp_messages: 0.08,
    email_sends: 0.05,
    pdf_generation: 0.20,
    proposal_generation: 0.25,
    smart_import: 0.30,
  };

  return summary
    .filter((s) => s.is_exceeded)
    .map((s) => ({
      feature: s.feature,
      extra: s.total_used - s.limit_value,
      unit_price: OVERAGE_PRICES[s.feature],
      total: (s.total_used - s.limit_value) * OVERAGE_PRICES[s.feature],
    }));
}
