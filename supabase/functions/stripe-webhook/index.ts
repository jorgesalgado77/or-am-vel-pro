import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, stripe-signature, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const respond = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  try {
    const STRIPE_WEBHOOK_SECRET = Deno.env.get("STRIPE_WEBHOOK_SECRET");
    const STRIPE_SECRET_KEY = Deno.env.get("STRIPE_SECRET_KEY");

    if (!STRIPE_SECRET_KEY) {
      console.error("STRIPE_SECRET_KEY not configured");
      return respond({ error: "Stripe not configured" }, 500);
    }

    const rawBody = await req.text();
    const signature = req.headers.get("stripe-signature");

    // If webhook secret is configured, verify signature
    if (STRIPE_WEBHOOK_SECRET && signature) {
      // Simple HMAC verification for Stripe webhook signatures
      const elements = signature.split(",");
      const timestampEl = elements.find((e) => e.startsWith("t="));
      const sigEl = elements.find((e) => e.startsWith("v1="));

      if (!timestampEl || !sigEl) {
        console.error("Invalid stripe-signature format");
        return respond({ error: "Invalid signature" }, 400);
      }

      const timestamp = timestampEl.split("=")[1];
      const expectedSig = sigEl.split("=")[1];

      const encoder = new TextEncoder();
      const key = await crypto.subtle.importKey(
        "raw",
        encoder.encode(STRIPE_WEBHOOK_SECRET),
        { name: "HMAC", hash: "SHA-256" },
        false,
        ["sign"]
      );

      const signed = await crypto.subtle.sign(
        "HMAC",
        key,
        encoder.encode(`${timestamp}.${rawBody}`)
      );

      const computedSig = Array.from(new Uint8Array(signed))
        .map((b) => b.toString(16).padStart(2, "0"))
        .join("");

      if (computedSig !== expectedSig) {
        console.error("Webhook signature mismatch");
        return respond({ error: "Signature verification failed" }, 400);
      }
    } else {
      console.warn("STRIPE_WEBHOOK_SECRET not set — skipping signature verification");
    }

    let event: Record<string, unknown>;
    try {
      event = JSON.parse(rawBody);
    } catch {
      return respond({ error: "Invalid JSON body" }, 400);
    }

    const eventType = event.type as string;
    const eventData = (event.data as Record<string, unknown>)?.object as Record<string, unknown> | undefined;

    if (!eventType || !eventData) {
      return respond({ error: "Invalid event structure" }, 400);
    }

    console.log(`Stripe webhook received: ${eventType}`);

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Handle different event types
    switch (eventType) {
      case "checkout.session.completed": {
        const metadata = (eventData.metadata || {}) as Record<string, string>;
        const tenantId = metadata.tenant_id;
        const planSlug = metadata.plan_slug;
        const periodo = metadata.periodo || "mensal";
        const customerId = eventData.customer as string;
        const subscriptionId = eventData.subscription as string;

        if (tenantId && planSlug) {
          // Update tenant with stripe info and plan
          const updateData: Record<string, unknown> = {
            plano_slug: planSlug,
            stripe_customer_id: customerId,
            stripe_subscription_id: subscriptionId,
            plano_periodo: periodo,
            plano_status: "ativo",
            updated_at: new Date().toISOString(),
          };

          const { error } = await supabase
            .from("tenants")
            .update(updateData)
            .eq("id", tenantId);

          if (error) {
            console.error("Error updating tenant after checkout:", error);
          } else {
            console.log(`Tenant ${tenantId} upgraded to ${planSlug} (${periodo})`);
          }
        }
        break;
      }

      case "customer.subscription.updated": {
        const status = eventData.status as string;
        const customerId = eventData.customer as string;

        if (customerId) {
          const mappedStatus = ["active", "trialing"].includes(status)
            ? "ativo"
            : status === "past_due"
            ? "pendente"
            : "inativo";

          const { error } = await supabase
            .from("tenants")
            .update({
              plano_status: mappedStatus,
              updated_at: new Date().toISOString(),
            })
            .eq("stripe_customer_id", customerId);

          if (error) {
            console.error("Error updating subscription status:", error);
          } else {
            console.log(`Subscription for customer ${customerId} → ${mappedStatus}`);
          }
        }
        break;
      }

      case "customer.subscription.deleted": {
        const customerId = eventData.customer as string;
        if (customerId) {
          const { error } = await supabase
            .from("tenants")
            .update({
              plano_status: "cancelado",
              stripe_subscription_id: null,
              updated_at: new Date().toISOString(),
            })
            .eq("stripe_customer_id", customerId);

          if (error) {
            console.error("Error canceling subscription:", error);
          } else {
            console.log(`Subscription canceled for customer ${customerId}`);
          }
        }
        break;
      }

      case "invoice.payment_failed": {
        const customerId = eventData.customer as string;
        if (customerId) {
          const { error } = await supabase
            .from("tenants")
            .update({
              plano_status: "pendente",
              updated_at: new Date().toISOString(),
            })
            .eq("stripe_customer_id", customerId);

          if (error) {
            console.error("Error updating payment failed status:", error);
          }
          console.log(`Payment failed for customer ${customerId}`);
        }
        break;
      }

      case "invoice.paid": {
        const customerId = eventData.customer as string;
        if (customerId) {
          const { error } = await supabase
            .from("tenants")
            .update({
              plano_status: "ativo",
              updated_at: new Date().toISOString(),
            })
            .eq("stripe_customer_id", customerId);

          if (error) {
            console.error("Error updating invoice paid status:", error);
          }
          console.log(`Invoice paid for customer ${customerId}`);
        }
        break;
      }

      default:
        console.log(`Unhandled event type: ${eventType}`);
    }

    // Log the event for audit
    try {
      await supabase.from("system_logs").insert({
        level: "info",
        module: "stripe-webhook",
        message: `Stripe event: ${eventType}`,
        details: { event_id: event.id, type: eventType },
      });
    } catch {
      // silent - don't fail webhook because of logging
    }

    return respond({ received: true });
  } catch (e) {
    console.error("stripe-webhook error:", e);
    return respond({ error: "Internal error" }, 500);
  }
});
