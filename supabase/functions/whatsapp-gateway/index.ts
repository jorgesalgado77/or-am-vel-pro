/**
 * WhatsApp Gateway — Abstraction layer for sending WhatsApp messages.
 * 
 * Supports tenant-specific API keys from the api_keys table.
 * Falls back to global env vars if no tenant key is found.
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

// Resolve Evolution API credentials (tenant-specific or global)
async function resolveEvolutionConfig(tenantId: string | null): Promise<{ apiUrl: string; apiKey: string; instanceName: string } | null> {
  if (tenantId) {
    try {
      const sbUrl = Deno.env.get("SUPABASE_URL");
      const sbKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
      if (sbUrl && sbKey) {
        const sb = createClient(sbUrl, sbKey);
        const { data } = await sb.rpc("get_api_config", { p_tenant_id: tenantId, p_provider: "evolution" });
        if (data && data.length > 0 && data[0].api_key) {
          return {
            apiUrl: data[0].api_url || Deno.env.get("WHATSAPP_API_URL") || "",
            apiKey: data[0].api_key,
            instanceName: Deno.env.get("WHATSAPP_INSTANCE") || "default",
          };
        }
      }
    } catch (e) {
      console.warn("[resolveEvolutionConfig] Fallback:", e);
    }
  }
  const apiUrl = Deno.env.get("WHATSAPP_API_URL");
  const apiKey = Deno.env.get("WHATSAPP_API_KEY");
  if (!apiUrl || !apiKey) return null;
  return { apiUrl, apiKey, instanceName: Deno.env.get("WHATSAPP_INSTANCE") || "default" };
}

// Evolution API sender
async function sendViaEvolution(phone: string, message: string, mediaUrl?: string, tenantId?: string | null): Promise<{ success: boolean; error?: string }> {
  const config = await resolveEvolutionConfig(tenantId || null);
  if (!config) return { success: false, error: "Evolution API não configurada. Configure nas Configurações > APIs." };

  const { apiUrl, apiKey, instanceName } = config;

  if (!apiUrl || !apiKey) {
    return { success: false, error: "WHATSAPP_API_URL ou WHATSAPP_API_KEY não configurados" };
  }

  try {
    const endpoint = mediaUrl
      ? `${apiUrl}/message/sendMedia/${instanceName}`
      : `${apiUrl}/message/sendText/${instanceName}`;

    const body = mediaUrl
      ? { number: phone, mediatype: "image", mimetype: "image/jpeg", caption: message, media: mediaUrl }
      : { number: phone, text: message };

    const res = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "apikey": apiKey,
      },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const errText = await res.text();
      return { success: false, error: `Evolution API [${res.status}]: ${errText}` };
    }

    const data = await res.json();
    return { success: true };
  } catch (e) {
    return { success: false, error: `Evolution API error: ${(e as Error).message}` };
  }
}

// Twilio sender
async function sendViaTwilio(phone: string, message: string, mediaUrl?: string): Promise<{ success: boolean; error?: string }> {
  const accountSid = Deno.env.get("TWILIO_ACCOUNT_SID");
  const authToken = Deno.env.get("TWILIO_AUTH_TOKEN");
  const fromNumber = Deno.env.get("TWILIO_FROM_NUMBER");

  if (!accountSid || !authToken || !fromNumber) {
    return { success: false, error: "Credenciais Twilio não configuradas" };
  }

  try {
    const params = new URLSearchParams({
      To: `whatsapp:${phone}`,
      From: `whatsapp:${fromNumber}`,
      Body: message,
    });

    if (mediaUrl) params.set("MediaUrl", mediaUrl);

    const res = await fetch(
      `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`,
      {
        method: "POST",
        headers: {
          Authorization: `Basic ${btoa(`${accountSid}:${authToken}`)}`,
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: params,
      }
    );

    if (!res.ok) {
      const errText = await res.text();
      return { success: false, error: `Twilio [${res.status}]: ${errText}` };
    }

    return { success: true };
  } catch (e) {
    return { success: false, error: `Twilio error: ${(e as Error).message}` };
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("authorization");
    if (!authHeader?.startsWith("Bearer ") || authHeader.replace("Bearer ", "").length < 20) {
      return respond({ error: "Não autorizado" }, 401);
    }

    const body = await req.json();
    const { action, phone, message, media_url, tracking_id, tenant_id } = body;

    // Check provider
    const provider = Deno.env.get("WHATSAPP_PROVIDER") || "simulation";

    if (action === "status") {
      return respond({
        provider,
        connected: provider !== "simulation",
        simulation: provider === "simulation",
      });
    }

    if (action === "send") {
      if (!phone || !message) {
        return respond({ error: "phone e message são obrigatórios" }, 400);
      }

      if (provider === "simulation") {
        return respond({
          success: true,
          provider: "simulation",
          message: "Modo simulação: mensagem tratada no frontend",
        });
      }

      let result;
      if (provider === "evolution") {
        result = await sendViaEvolution(phone, message, media_url, tenant_id);
      } else if (provider === "twilio") {
        result = await sendViaTwilio(phone, message, media_url);
      } else {
        return respond({ error: `Provedor desconhecido: ${provider}` }, 400);
      }

      if (!result.success) {
        return respond({ error: result.error }, 502);
      }

      return respond({ success: true, provider });
    }

    return respond({ error: "Ação inválida. Use 'send' ou 'status'" }, 400);
  } catch (e) {
    console.error("whatsapp-gateway error:", e);
    return respond({ error: "Erro interno" }, 500);
  }
});
