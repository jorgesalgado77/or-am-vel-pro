import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const STRIPE_SECRET_KEY = Deno.env.get("STRIPE_SECRET_KEY");
    if (!STRIPE_SECRET_KEY) {
      return new Response(JSON.stringify({ error: "Stripe não configurado. Configure a chave secreta no painel admin." }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { tenant_id, plan_slug, periodo, success_url, cancel_url } = await req.json();

    if (!tenant_id || !plan_slug || !periodo) {
      return new Response(JSON.stringify({ error: "Parâmetros obrigatórios: tenant_id, plan_slug, periodo" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Get plan details
    const { data: plan } = await supabase
      .from("subscription_plans")
      .select("*")
      .eq("slug", plan_slug)
      .eq("ativo", true)
      .single();

    if (!plan) {
      return new Response(JSON.stringify({ error: "Plano não encontrado" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Get tenant info
    const { data: tenant } = await supabase
      .from("tenants")
      .select("*")
      .eq("id", tenant_id)
      .single();

    if (!tenant) {
      return new Response(JSON.stringify({ error: "Loja não encontrada" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const priceAmount = periodo === "anual"
      ? Math.round(plan.preco_anual_mensal * 12 * 100)
      : Math.round(plan.preco_mensal * 100);

    const interval = periodo === "anual" ? "year" : "month";

    // Create or get Stripe customer
    let customerId = tenant.stripe_customer_id;

    if (!customerId) {
      const customerRes = await fetch("https://api.stripe.com/v1/customers", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${STRIPE_SECRET_KEY}`,
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: new URLSearchParams({
          name: tenant.nome_loja,
          email: tenant.email_contato || "",
          "metadata[tenant_id]": tenant_id,
        }),
      });
      const customer = await customerRes.json();
      customerId = customer.id;

      await supabase.from("tenants").update({ stripe_customer_id: customerId }).eq("id", tenant_id);
    }

    // Create Stripe price inline
    const priceRes = await fetch("https://api.stripe.com/v1/prices", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${STRIPE_SECRET_KEY}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        currency: "brl",
        unit_amount: priceAmount.toString(),
        "recurring[interval]": interval,
        "product_data[name]": `OrçaMóvel PRO - ${plan.nome} (${periodo})`,
        "product_data[metadata][plan_slug]": plan_slug,
      }),
    });
    const price = await priceRes.json();

    // Create checkout session
    const sessionRes = await fetch("https://api.stripe.com/v1/checkout/sessions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${STRIPE_SECRET_KEY}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        customer: customerId,
        mode: "subscription",
        "line_items[0][price]": price.id,
        "line_items[0][quantity]": "1",
        success_url: success_url || `${req.headers.get("origin")}/app?checkout=success`,
        cancel_url: cancel_url || `${req.headers.get("origin")}/app?checkout=cancel`,
        "metadata[tenant_id]": tenant_id,
        "metadata[plan_slug]": plan_slug,
        "metadata[periodo]": periodo,
        "subscription_data[metadata][tenant_id]": tenant_id,
        "subscription_data[metadata][plan_slug]": plan_slug,
        "subscription_data[metadata][periodo]": periodo,
      }),
    });
    const session = await sessionRes.json();

    if (session.error) {
      return new Response(JSON.stringify({ error: session.error.message }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ url: session.url, session_id: session.id }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Stripe checkout error:", error);
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : "Erro interno" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
