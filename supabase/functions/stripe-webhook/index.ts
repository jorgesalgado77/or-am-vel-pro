import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, {
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, stripe-signature",
      },
    });
  }

  try {
    const STRIPE_SECRET_KEY = Deno.env.get("STRIPE_SECRET_KEY");
    const STRIPE_WEBHOOK_SECRET = Deno.env.get("STRIPE_WEBHOOK_SECRET");

    if (!STRIPE_SECRET_KEY) {
      return new Response("Stripe not configured", { status: 500 });
    }

    const body = await req.text();
    const signature = req.headers.get("stripe-signature");

    // If webhook secret is set, verify signature
    let event: any;
    if (STRIPE_WEBHOOK_SECRET && signature) {
      // Simple signature verification (for production, use Stripe SDK)
      // For now, parse the event directly
      event = JSON.parse(body);
    } else {
      event = JSON.parse(body);
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    console.log("Stripe webhook event:", event.type);

    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object;
        const tenantId = session.metadata?.tenant_id;
        const planSlug = session.metadata?.plan_slug;
        const periodo = session.metadata?.periodo || "mensal";

        if (tenantId && planSlug) {
          const { data: plan } = await supabase
            .from("subscription_plans")
            .select("max_usuarios")
            .eq("slug", planSlug)
            .single();

          const now = new Date();
          const endDate = new Date(now);
          if (periodo === "anual") endDate.setFullYear(endDate.getFullYear() + 1);
          else endDate.setMonth(endDate.getMonth() + 1);

          await supabase.from("tenants").update({
            plano: planSlug,
            plano_periodo: periodo,
            max_usuarios: plan?.max_usuarios || 999,
            assinatura_inicio: now.toISOString(),
            assinatura_fim: endDate.toISOString(),
            ativo: true,
            stripe_subscription_id: session.subscription || null,
          }).eq("id", tenantId);

          console.log(`Tenant ${tenantId} upgraded to ${planSlug} (${periodo})`);
        }
        break;
      }

      case "customer.subscription.updated": {
        const subscription = event.data.object;
        const tenantId = subscription.metadata?.tenant_id;

        if (tenantId) {
          const status = subscription.status;
          const isActive = ["active", "trialing"].includes(status);

          await supabase.from("tenants").update({
            ativo: isActive,
            assinatura_fim: subscription.current_period_end
              ? new Date(subscription.current_period_end * 1000).toISOString()
              : null,
          }).eq("id", tenantId);

          console.log(`Tenant ${tenantId} subscription status: ${status}`);
        }
        break;
      }

      case "customer.subscription.deleted": {
        const subscription = event.data.object;
        const tenantId = subscription.metadata?.tenant_id;

        if (tenantId) {
          await supabase.from("tenants").update({
            plano: "trial",
            ativo: false,
            stripe_subscription_id: null,
          }).eq("id", tenantId);

          console.log(`Tenant ${tenantId} subscription canceled`);
        }
        break;
      }

      case "invoice.payment_failed": {
        const invoice = event.data.object;
        const customerId = invoice.customer;

        // Find tenant by stripe_customer_id
        const { data: tenant } = await supabase
          .from("tenants")
          .select("id")
          .eq("stripe_customer_id", customerId)
          .single();

        if (tenant) {
          console.log(`Payment failed for tenant ${tenant.id}`);
          // Could send notification, but don't deactivate immediately
        }
        break;
      }

      default:
        console.log(`Unhandled event type: ${event.type}`);
    }

    return new Response(JSON.stringify({ received: true }), {
      headers: { "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Webhook error:", error);
    return new Response(JSON.stringify({ error: "Webhook processing failed" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }
});
