import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS")
    return new Response(null, { headers: corsHeaders });

  try {
    const { tenant_id, plan_slug, periodo, return_url } = await req.json();

    const STRIPE_SECRET_KEY = Deno.env.get("STRIPE_SECRET_KEY");
    if (!STRIPE_SECRET_KEY) {
      return new Response(
        JSON.stringify({ error: "Stripe não configurado" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Get tenant info
    const { data: tenant } = await supabase
      .from("tenants")
      .select("*")
      .eq("id", tenant_id)
      .single();

    if (!tenant) {
      return new Response(
        JSON.stringify({ error: "Tenant não encontrado" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Get plan pricing
    const { data: plan } = await supabase
      .from("subscription_plans")
      .select("*")
      .eq("slug", plan_slug)
      .single();

    if (!plan) {
      return new Response(
        JSON.stringify({ error: "Plano não encontrado" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const priceAmount = periodo === "anual"
      ? Math.round(plan.preco_anual_mensal * 12 * 100) // Annual total in cents
      : Math.round(plan.preco_mensal * 100); // Monthly in cents

    // Create Stripe Checkout Session
    const params = new URLSearchParams();
    params.append("mode", "subscription");
    params.append("success_url", return_url || `${req.headers.get("origin")}/app`);
    params.append("cancel_url", return_url || `${req.headers.get("origin")}/app`);
    params.append("line_items[0][price_data][currency]", "brl");
    params.append("line_items[0][price_data][product_data][name]", `${plan.nome} - ${periodo === "anual" ? "Anual" : "Mensal"}`);
    params.append("line_items[0][price_data][unit_amount]", String(priceAmount));
    params.append("line_items[0][price_data][recurring][interval]", periodo === "anual" ? "year" : "month");
    params.append("line_items[0][quantity]", "1");
    params.append("metadata[tenant_id]", tenant_id);
    params.append("metadata[plan_slug]", plan_slug);
    params.append("metadata[periodo]", periodo || "mensal");

    if (tenant.stripe_customer_id) {
      params.append("customer", tenant.stripe_customer_id);
    } else if (tenant.email_contato) {
      params.append("customer_email", tenant.email_contato);
    }

    const stripeRes = await fetch("https://api.stripe.com/v1/checkout/sessions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${STRIPE_SECRET_KEY}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: params.toString(),
    });

    if (!stripeRes.ok) {
      const errText = await stripeRes.text();
      console.error("Stripe error:", stripeRes.status, errText);
      return new Response(
        JSON.stringify({ error: "Erro ao criar sessão de pagamento" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const session = await stripeRes.json();
    return new Response(
      JSON.stringify({ url: session.url, session_id: session.id }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (e) {
    console.error("stripe-checkout error:", e);
    return new Response(
      JSON.stringify({ error: "Erro interno" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
