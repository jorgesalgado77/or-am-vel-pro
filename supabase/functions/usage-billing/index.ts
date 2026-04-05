/**
 * Usage Billing Edge Function — processes overage charges
 * 
 * Actions: processOverage, getUsageSummary
 * Integrates with Stripe and Asaas for automatic billing.
 */
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

function respond(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function getSupabaseAdmin() {
  return createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );
}

interface OveragePricing {
  [feature: string]: number;
}

const OVERAGE_PRICES: OveragePricing = {
  ia_interactions: 0.15,
  whatsapp_messages: 0.08,
  email_sends: 0.05,
  pdf_generation: 0.20,
  proposal_generation: 0.25,
  smart_import: 0.30,
};

const FEATURES = Object.keys(OVERAGE_PRICES);

async function calculateTenantOverage(
  sb: ReturnType<typeof getSupabaseAdmin>,
  tenantId: string,
  periodStart: string,
  periodEnd: string,
) {
  // Get tenant plan
  const { data: tenant } = await sb
    .from("tenants")
    .select("plano")
    .eq("id", tenantId)
    .single();

  if (!tenant) return [];

  const planSlug = tenant.plano;

  // Get limits for plan
  const { data: limits } = await sb
    .from("usage_limits")
    .select("feature, limit_value")
    .eq("plan_slug", planSlug);

  const limitMap: Record<string, number> = {};
  (limits || []).forEach((l: { feature: string; limit_value: number }) => {
    limitMap[l.feature] = l.limit_value;
  });

  // Get usage per feature
  const { data: usageRows } = await sb
    .from("usage_tracking")
    .select("feature, quantity")
    .eq("tenant_id", tenantId)
    .gte("created_at", periodStart)
    .lt("created_at", periodEnd);

  const usageMap: Record<string, number> = {};
  (usageRows || []).forEach((r: { feature: string; quantity: number }) => {
    usageMap[r.feature] = (usageMap[r.feature] || 0) + (r.quantity || 1);
  });

  const overages: Array<{
    feature: string;
    total_usage: number;
    limit_value: number;
    extra_usage: number;
    unit_price: number;
    amount: number;
  }> = [];

  for (const feature of FEATURES) {
    const total = usageMap[feature] || 0;
    const limit = limitMap[feature] ?? 999999;
    if (total > limit) {
      const extra = total - limit;
      const unitPrice = OVERAGE_PRICES[feature] || 0;
      overages.push({
        feature,
        total_usage: total,
        limit_value: limit,
        extra_usage: extra,
        unit_price: unitPrice,
        amount: extra * unitPrice,
      });
    }
  }

  return overages;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const body = await req.json();
    const { action, tenant_id } = body;

    const authHeader = req.headers.get("authorization");
    if (!authHeader?.startsWith("Bearer ") || authHeader.replace("Bearer ", "").length < 20) {
      return respond({ error: "Não autorizado" }, 401);
    }

    const sb = getSupabaseAdmin();

    // ── Get Usage Summary ──
    if (action === "getUsageSummary") {
      if (!tenant_id) return respond({ error: "tenant_id obrigatório" }, 400);

      const now = new Date();
      const periodStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
      const periodEnd = new Date(now.getFullYear(), now.getMonth() + 1, 1).toISOString();

      const overages = await calculateTenantOverage(sb, tenant_id, periodStart, periodEnd);
      const totalAmount = overages.reduce((s, o) => s + o.amount, 0);

      return respond({
        success: true,
        data: {
          tenant_id,
          period: `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`,
          overages,
          total_amount: totalAmount,
        },
      });
    }

    // ── Process Overage (end-of-period billing) ──
    if (action === "processOverage") {
      if (!tenant_id) return respond({ error: "tenant_id obrigatório" }, 400);

      const { period } = body; // e.g. "2026-03"
      if (!period) return respond({ error: "period obrigatório (YYYY-MM)" }, 400);

      const [year, month] = period.split("-").map(Number);
      const periodStart = new Date(year, month - 1, 1).toISOString();
      const periodEnd = new Date(year, month, 1).toISOString();

      const overages = await calculateTenantOverage(sb, tenant_id, periodStart, periodEnd);
      if (overages.length === 0) {
        return respond({ success: true, message: "Sem excedentes no período", data: { charged: 0 } });
      }

      const totalAmount = overages.reduce((s, o) => s + o.amount, 0);

      // Save billing records
      const billingRecords = overages.map((o) => ({
        tenant_id,
        feature: o.feature,
        total_usage: o.total_usage,
        extra_usage: o.extra_usage,
        amount: o.amount,
        period,
      }));

      await sb.from("usage_billing").insert(billingRecords);

      // Try Stripe first, then Asaas
      let chargeResult: { gateway: string; success: boolean; id?: string; error?: string } | null = null;

      const stripeKey = Deno.env.get("STRIPE_SECRET_KEY");
      if (stripeKey && totalAmount > 0) {
        try {
          // Find or create Stripe customer
          const { data: tenantData } = await sb
            .from("tenants")
            .select("email_contato, nome_loja")
            .eq("id", tenant_id)
            .single();

          if (tenantData?.email_contato) {
            // Create invoice item via Stripe API
            const stripeRes = await fetch("https://api.stripe.com/v1/invoices", {
              method: "POST",
              headers: {
                "Authorization": `Bearer ${stripeKey}`,
                "Content-Type": "application/x-www-form-urlencoded",
              },
              body: new URLSearchParams({
                "auto_advance": "true",
                "collection_method": "send_invoice",
                "days_until_due": "7",
                "description": `Excedente de uso — ${period} — ${tenantData.nome_loja}`,
                "metadata[tenant_id]": tenant_id,
                "metadata[period]": period,
              }),
            });

            const stripeData = await stripeRes.json();
            chargeResult = {
              gateway: "stripe",
              success: stripeRes.ok,
              id: stripeData.id,
              error: stripeData.error?.message,
            };
          }
        } catch (e) {
          console.error("[usage-billing] Stripe error:", e);
        }
      }

      // Fallback to Asaas
      if (!chargeResult?.success) {
        try {
          const { data: apiConfig } = await sb.rpc("get_api_config", {
            p_tenant_id: tenant_id,
            p_provider: "asaas",
          });

          if (apiConfig?.[0]?.api_key) {
            const asaasKey = apiConfig[0].api_key;
            const asaasUrl = apiConfig[0].api_url || "https://api.asaas.com/v3";

            // Create charge in Asaas
            const asaasRes = await fetch(`${asaasUrl}/payments`, {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                "access_token": asaasKey,
              },
              body: JSON.stringify({
                billingType: "PIX",
                value: totalAmount,
                dueDate: new Date(Date.now() + 7 * 86400000).toISOString().split("T")[0],
                description: `Excedente de uso — ${period}`,
              }),
            });

            const asaasData = await asaasRes.json();
            chargeResult = {
              gateway: "asaas",
              success: asaasRes.ok,
              id: asaasData.id,
              error: asaasData.errors?.[0]?.description,
            };
          }
        } catch (e) {
          console.error("[usage-billing] Asaas error:", e);
        }
      }

      return respond({
        success: true,
        data: {
          tenant_id,
          period,
          total_amount: totalAmount,
          overages,
          charge: chargeResult,
        },
      });
    }

    // ── Process All Tenants (cron job) ──
    if (action === "processAllTenants") {
      const { period } = body;
      if (!period) return respond({ error: "period obrigatório" }, 400);

      const { data: tenants } = await sb
        .from("tenants")
        .select("id")
        .eq("ativo", true);

      const results: Array<{ tenant_id: string; total: number; success: boolean }> = [];

      for (const t of tenants || []) {
        try {
          const [year, month] = period.split("-").map(Number);
          const periodStart = new Date(year, month - 1, 1).toISOString();
          const periodEnd = new Date(year, month, 1).toISOString();
          const overages = await calculateTenantOverage(sb, t.id, periodStart, periodEnd);
          const total = overages.reduce((s, o) => s + o.amount, 0);

          if (total > 0) {
            const billingRecords = overages.map((o) => ({
              tenant_id: t.id,
              feature: o.feature,
              total_usage: o.total_usage,
              extra_usage: o.extra_usage,
              amount: o.amount,
              period,
            }));
            await sb.from("usage_billing").insert(billingRecords);
          }

          results.push({ tenant_id: t.id, total, success: true });
        } catch (e) {
          console.error(`[usage-billing] Error for tenant ${t.id}:`, e);
          results.push({ tenant_id: t.id, total: 0, success: false });
        }
      }

      return respond({ success: true, data: { period, results } });
    }

    return respond({ error: "Ação inválida. Use: getUsageSummary, processOverage, processAllTenants" }, 400);
  } catch (e) {
    console.error("[usage-billing] error:", e);
    return respond({ error: "Erro interno" }, 500);
  }
});
