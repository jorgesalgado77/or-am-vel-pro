/**
 * Asaas Billing Gateway — Create customers, charges (PIX/Boleto/Cartão)
 * 
 * Uses tenant-specific API key from api_keys table.
 * Actions: createCustomer, createPayment, getPayment, listPayments, getPixQR, webhook
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
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );
}

async function resolveAsaasConfig(tenantId: string | null): Promise<{ apiKey: string; apiUrl: string } | null> {
  if (tenantId) {
    try {
      const sb = getSupabaseAdmin();
      const { data } = await sb.rpc("get_api_config", { p_tenant_id: tenantId, p_provider: "asaas" });
      if (data && data.length > 0 && data[0].api_key) {
        return {
          apiKey: data[0].api_key,
          apiUrl: data[0].api_url || "https://api.asaas.com/v3",
        };
      }
    } catch (e) {
      console.warn("[resolveAsaasConfig] Fallback:", e);
    }
  }
  const apiKey = Deno.env.get("ASAAS_API_KEY");
  if (!apiKey) return null;
  return { apiKey, apiUrl: Deno.env.get("ASAAS_API_URL") || "https://api.asaas.com/v3" };
}

async function asaasFetch(config: { apiKey: string; apiUrl: string }, path: string, method = "GET", body?: unknown) {
  const res = await fetch(`${config.apiUrl}${path}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      access_token: config.apiKey,
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });

  const data = await res.json();
  if (!res.ok) {
    return { success: false, error: data.errors?.[0]?.description || `Asaas [${res.status}]`, data };
  }
  return { success: true, data };
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const body = await req.json();
    const { action, tenant_id } = body;

    // Webhook doesn't require auth header
    if (action === "webhook") {
      const sb = getSupabaseAdmin();
      const event = body.event;
      const payment = body.payment;

      if (payment?.id) {
        await sb.from("asaas_payments")
          .update({
            status: payment.status,
            updated_at: new Date().toISOString(),
          })
          .eq("payment_id", payment.id);
      }

      return respond({ received: true });
    }

    // All other actions require auth
    const authHeader = req.headers.get("authorization");
    if (!authHeader?.startsWith("Bearer ") || authHeader.replace("Bearer ", "").length < 20) {
      return respond({ error: "Não autorizado" }, 401);
    }

    const config = await resolveAsaasConfig(tenant_id || null);
    if (!config) {
      return respond({ error: "API Key do Asaas não configurada. Adicione em Configurações > APIs." }, 400);
    }

    // ── Create Customer ──
    if (action === "createCustomer") {
      const { name, email, cpfCnpj, phone } = body;
      if (!name || !cpfCnpj) {
        return respond({ error: "name e cpfCnpj são obrigatórios" }, 400);
      }

      const result = await asaasFetch(config, "/customers", "POST", {
        name,
        email: email || undefined,
        cpfCnpj: cpfCnpj.replace(/\D/g, ""),
        phone: phone || undefined,
      });

      return respond(result, result.success ? 200 : 502);
    }

    // ── Create Payment ──
    if (action === "createPayment") {
      const { customer_id, value, due_date, billing_type, description, client_name, client_email, client_cpf_cnpj } = body;
      if (!customer_id || !value || !billing_type) {
        return respond({ error: "customer_id, value e billing_type são obrigatórios" }, 400);
      }

      const result = await asaasFetch(config, "/payments", "POST", {
        customer: customer_id,
        billingType: billing_type, // PIX, BOLETO, CREDIT_CARD
        value: Number(value),
        dueDate: due_date || new Date(Date.now() + 3 * 86400000).toISOString().split("T")[0],
        description: description || "Pagamento",
      });

      if (result.success) {
        // Save to DB
        const sb = getSupabaseAdmin();
        const paymentData: Record<string, unknown> = {
          tenant_id,
          customer_id,
          payment_id: result.data.id,
          type: billing_type.toLowerCase(),
          status: result.data.status,
          value: Number(value),
          due_date: result.data.dueDate,
          invoice_url: result.data.invoiceUrl,
          description,
          client_name,
          client_email,
          client_cpf_cnpj,
        };

        // If PIX, get QR code
        if (billing_type === "PIX" && result.data.id) {
          const pixResult = await asaasFetch(config, `/payments/${result.data.id}/pixQrCode`);
          if (pixResult.success) {
            paymentData.pix_qr_code = pixResult.data.encodedImage;
            paymentData.pix_copy_paste = pixResult.data.payload;
            result.data.pixQrCode = pixResult.data.encodedImage;
            result.data.pixPayload = pixResult.data.payload;
          }
        }

        // If BOLETO, add URL
        if (billing_type === "BOLETO") {
          paymentData.boleto_url = result.data.bankSlipUrl;
        }

        await sb.from("asaas_payments").insert(paymentData);
      }

      return respond(result, result.success ? 200 : 502);
    }

    // ── Get Payment ──
    if (action === "getPayment") {
      const { payment_id } = body;
      if (!payment_id) return respond({ error: "payment_id obrigatório" }, 400);

      const result = await asaasFetch(config, `/payments/${payment_id}`);
      return respond(result, result.success ? 200 : 502);
    }

    // ── Get PIX QR Code ──
    if (action === "getPixQR") {
      const { payment_id } = body;
      if (!payment_id) return respond({ error: "payment_id obrigatório" }, 400);

      const result = await asaasFetch(config, `/payments/${payment_id}/pixQrCode`);
      return respond(result, result.success ? 200 : 502);
    }

    // ── List Payments ──
    if (action === "listPayments") {
      const { customer_id, status, limit, offset } = body;
      let path = "/payments?";
      if (customer_id) path += `customer=${customer_id}&`;
      if (status) path += `status=${status}&`;
      path += `limit=${limit || 20}&offset=${offset || 0}`;

      const result = await asaasFetch(config, path);
      return respond(result, result.success ? 200 : 502);
    }

    return respond({ error: "Ação inválida. Use: createCustomer, createPayment, getPayment, getPixQR, listPayments, webhook" }, 400);
  } catch (e) {
    console.error("asaas-billing error:", e);
    return respond({ error: "Erro interno" }, 500);
  }
});
