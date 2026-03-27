/**
 * WhatsApp Gateway — Abstraction layer for sending WhatsApp messages.
 * 
 * In SIMULATION mode: returns success immediately (message is inserted client-side).
 * In PRODUCTION mode: routes to Evolution API or Twilio.
 * 
 * To switch from simulation to real:
 * 1. Set WHATSAPP_PROVIDER secret to "evolution" or "twilio"
 * 2. Set WHATSAPP_API_URL and WHATSAPP_API_KEY secrets
 * 3. Disable simulation mode in the UI
 */
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

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

// Evolution API sender
async function sendViaEvolution(phone: string, message: string, mediaUrl?: string): Promise<{ success: boolean; error?: string }> {
  const apiUrl = Deno.env.get("WHATSAPP_API_URL");
  const apiKey = Deno.env.get("WHATSAPP_API_KEY");
  const instanceName = Deno.env.get("WHATSAPP_INSTANCE") || "default";

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
    const { action, phone, message, media_url, tracking_id } = body;

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
        // In simulation mode, message is handled client-side
        return respond({
          success: true,
          provider: "simulation",
          message: "Modo simulação: mensagem tratada no frontend",
        });
      }

      let result;
      if (provider === "evolution") {
        result = await sendViaEvolution(phone, message, media_url);
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
