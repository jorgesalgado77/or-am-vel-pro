/**
 * WhatsApp Gateway — Full Evolution API integration
 * 
 * Actions:
 *   - send: Send text/media message
 *   - status: Check connection status
 *   - createInstance: Create a new Evolution API instance
 *   - connectInstance: Connect instance (returns QR code)
 *   - fetchQR: Fetch current QR code for an instance
 *   - disconnectInstance: Disconnect/logout instance
 *   - deleteInstance: Delete an instance
 *   - instanceStatus: Get instance connection status
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
  const sbUrl = Deno.env.get("SUPABASE_URL")!;
  const sbKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  return createClient(sbUrl, sbKey);
}

// Resolve Evolution API credentials (tenant-specific or global)
async function resolveEvolutionConfig(tenantId: string | null): Promise<{ apiUrl: string; apiKey: string } | null> {
  const sb = getSupabaseAdmin();

  if (tenantId) {
    try {
      const { data } = await sb.rpc("get_api_config", { p_tenant_id: tenantId, p_provider: "evolution" });
      if (data && data.length > 0 && data[0].api_key) {
        return {
          apiUrl: data[0].api_url || Deno.env.get("WHATSAPP_API_URL") || "",
          apiKey: data[0].api_key,
        };
      }
    } catch (e) {
      console.warn("[resolveEvolutionConfig] RPC fallback:", e);
    }
  }

  try {
    let settingsQuery = sb
      .from("whatsapp_settings")
      .select("evolution_api_url, evolution_api_key");

    if (tenantId) {
      settingsQuery = settingsQuery.eq("tenant_id", tenantId);
    }

    let { data: ws, error } = await settingsQuery.maybeSingle();

    if (error?.code === "42703" || error?.code === "PGRST204" || error?.message?.includes("tenant_id")) {
      const fallback = await sb
        .from("whatsapp_settings")
        .select("evolution_api_url, evolution_api_key")
        .limit(1)
        .maybeSingle();
      ws = fallback.data;
      error = fallback.error;
    }

    if (!error && ws?.evolution_api_key) {
      return {
        apiUrl: ws.evolution_api_url || Deno.env.get("WHATSAPP_API_URL") || "",
        apiKey: ws.evolution_api_key,
      };
    }
  } catch (e) {
    console.warn("[resolveEvolutionConfig] Settings fallback:", e);
  }

  const apiUrl = Deno.env.get("WHATSAPP_API_URL");
  const apiKey = Deno.env.get("WHATSAPP_API_KEY");
  if (!apiUrl || !apiKey) return null;
  return { apiUrl, apiKey };
}

// Resolve Z-API credentials from whatsapp_settings
async function resolveZapiConfig(tenantId: string | null): Promise<{ instanceId: string; token: string; clientToken: string; securityToken?: string } | null> {
  const sb = getSupabaseAdmin();

  try {
    let query = sb.from("whatsapp_settings").select("*");
    if (tenantId) query = query.eq("tenant_id", tenantId);
    let { data: ws, error } = await query.maybeSingle();

    if (error?.code === "42703" || error?.code === "PGRST204" || error?.message?.includes("tenant_id")) {
      const fallback = await sb.from("whatsapp_settings").select("*").limit(1).maybeSingle();
      ws = fallback.data;
    }

    if (ws?.zapi_instance_id && ws?.zapi_token && ws?.zapi_client_token) {
      return {
        instanceId: ws.zapi_instance_id,
        token: ws.zapi_token,
        clientToken: ws.zapi_client_token,
        securityToken: ws.zapi_security_token || undefined,
      };
    }
  } catch (e) {
    console.warn("[resolveZapiConfig] Error:", e);
  }

  return null;
}

// Detect which provider is configured for a tenant
async function detectProvider(tenantId: string | null): Promise<"zapi" | "evolution" | "twilio" | "simulation"> {
  const sb = getSupabaseAdmin();

  try {
    let query = sb.from("whatsapp_settings").select("api_provider, ativo");
    if (tenantId) query = query.eq("tenant_id", tenantId);
    let { data: ws, error } = await query.maybeSingle();

    if (error?.code === "42703" || error?.code === "PGRST204" || error?.message?.includes("tenant_id")) {
      const fallback = await sb.from("whatsapp_settings").select("api_provider, ativo").limit(1).maybeSingle();
      ws = fallback.data;
    }

    if (ws?.ativo && ws?.api_provider) {
      return ws.api_provider as "zapi" | "evolution";
    }
  } catch (e) {
    console.warn("[detectProvider] Error:", e);
  }

  const envProvider = Deno.env.get("WHATSAPP_PROVIDER");
  if (envProvider === "evolution" || envProvider === "twilio") return envProvider;
  return "simulation";
}

// ── Instance Management ──

async function createInstance(config: { apiUrl: string; apiKey: string }, instanceName: string, tenantId: string) {
  const url = `${config.apiUrl.replace(/\/$/, "")}/instance/create`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", apikey: config.apiKey },
    body: JSON.stringify({
      instanceName,
      qrcode: true,
      integration: "WHATSAPP-BAILEYS",
    }),
  });

  if (!res.ok) {
    const errText = await res.text();
    return { success: false, error: `Evolution API [${res.status}]: ${errText}` };
  }

  const data = await res.json();

  // Save instance to DB
  const sb = getSupabaseAdmin();
  await sb.from("whatsapp_instances").upsert({
    tenant_id: tenantId,
    instance_name: instanceName,
    status: "disconnected",
    connected: false,
    qr_code: data.qrcode?.base64 || null,
  }, { onConflict: "tenant_id,instance_name", ignoreDuplicates: false });

  return { success: true, data, qr_code: data.qrcode?.base64 || null };
}

async function connectInstance(config: { apiUrl: string; apiKey: string }, instanceName: string, tenantId: string) {
  const url = `${config.apiUrl.replace(/\/$/, "")}/instance/connect/${instanceName}`;
  const res = await fetch(url, {
    method: "GET",
    headers: { apikey: config.apiKey },
  });

  if (!res.ok) {
    const errText = await res.text();
    return { success: false, error: `Evolution API [${res.status}]: ${errText}` };
  }

  const data = await res.json();
  const qrCode = data.base64 || data.qrcode?.base64 || null;

  // Update DB
  const sb = getSupabaseAdmin();
  await sb.from("whatsapp_instances")
    .update({ status: "connecting", qr_code: qrCode })
    .eq("tenant_id", tenantId)
    .eq("instance_name", instanceName);

  return { success: true, qr_code: qrCode };
}

async function fetchInstanceQR(config: { apiUrl: string; apiKey: string }, instanceName: string) {
  const url = `${config.apiUrl.replace(/\/$/, "")}/instance/connect/${instanceName}`;
  const res = await fetch(url, {
    method: "GET",
    headers: { apikey: config.apiKey },
  });

  if (!res.ok) {
    return { success: false, error: `[${res.status}]` };
  }

  const data = await res.json();
  return { success: true, qr_code: data.base64 || data.qrcode?.base64 || null };
}

async function getInstanceStatus(config: { apiUrl: string; apiKey: string }, instanceName: string, tenantId: string) {
  const url = `${config.apiUrl.replace(/\/$/, "")}/instance/connectionState/${instanceName}`;
  const res = await fetch(url, {
    method: "GET",
    headers: { apikey: config.apiKey },
  });

  if (!res.ok) {
    return { success: false, error: `[${res.status}]` };
  }

  const data = await res.json();
  const state = data.instance?.state || data.state || "unknown";
  const connected = state === "open" || state === "connected";

  // Sync DB
  const sb = getSupabaseAdmin();
  await sb.from("whatsapp_instances")
    .update({ status: connected ? "connected" : "disconnected", connected })
    .eq("tenant_id", tenantId)
    .eq("instance_name", instanceName);

  return { success: true, state, connected, data };
}

async function disconnectInstance(config: { apiUrl: string; apiKey: string }, instanceName: string, tenantId: string) {
  const url = `${config.apiUrl.replace(/\/$/, "")}/instance/logout/${instanceName}`;
  const res = await fetch(url, {
    method: "DELETE",
    headers: { apikey: config.apiKey },
  });

  const sb = getSupabaseAdmin();
  await sb.from("whatsapp_instances")
    .update({ status: "disconnected", connected: false, qr_code: null })
    .eq("tenant_id", tenantId)
    .eq("instance_name", instanceName);

  return { success: res.ok };
}

async function deleteInstance(config: { apiUrl: string; apiKey: string }, instanceName: string, tenantId: string) {
  const url = `${config.apiUrl.replace(/\/$/, "")}/instance/delete/${instanceName}`;
  const res = await fetch(url, {
    method: "DELETE",
    headers: { apikey: config.apiKey },
  });

  const sb = getSupabaseAdmin();
  await sb.from("whatsapp_instances")
    .delete()
    .eq("tenant_id", tenantId)
    .eq("instance_name", instanceName);

  return { success: res.ok };
}

// ── Send Messages ──

async function sendViaEvolution(phone: string, message: string, instanceName: string, config: { apiUrl: string; apiKey: string }, mediaUrl?: string) {
  const endpoint = mediaUrl
    ? `${config.apiUrl.replace(/\/$/, "")}/message/sendMedia/${instanceName}`
    : `${config.apiUrl.replace(/\/$/, "")}/message/sendText/${instanceName}`;

  const body = mediaUrl
    ? { number: phone, mediatype: "image", mimetype: "image/jpeg", caption: message, media: mediaUrl }
    : { number: phone, text: message };

  const res = await fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json", apikey: config.apiKey },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const errText = await res.text();
    return { success: false, error: `Evolution API [${res.status}]: ${errText}` };
  }

  return { success: true };
}

async function sendViaTwilio(phone: string, message: string, mediaUrl?: string) {
  const accountSid = Deno.env.get("TWILIO_ACCOUNT_SID");
  const authToken = Deno.env.get("TWILIO_AUTH_TOKEN");
  const fromNumber = Deno.env.get("TWILIO_FROM_NUMBER");

  if (!accountSid || !authToken || !fromNumber) {
    return { success: false, error: "Credenciais Twilio não configuradas" };
  }

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
}

async function sendViaZapi(phone: string, message: string, config: { instanceId: string; token: string; clientToken: string; securityToken?: string }, mediaUrl?: string) {
  const baseUrl = `https://api.z-api.io/instances/${config.instanceId}/token/${config.token}`;
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "Client-Token": config.clientToken,
  };
  if (config.securityToken) headers["Security-Token"] = config.securityToken;

  // Normalize phone number (remove +, spaces, dashes)
  const normalizedPhone = phone.replace(/[\s\-\+]/g, "");

  if (mediaUrl) {
    const res = await fetch(`${baseUrl}/send-image`, {
      method: "POST",
      headers,
      body: JSON.stringify({ phone: normalizedPhone, image: mediaUrl, caption: message }),
    });
    if (!res.ok) {
      const errText = await res.text();
      return { success: false, error: `Z-API [${res.status}]: ${errText}` };
    }
    return { success: true };
  }

  const res = await fetch(`${baseUrl}/send-text`, {
    method: "POST",
    headers,
    body: JSON.stringify({ phone: normalizedPhone, message }),
  });

  if (!res.ok) {
    const errText = await res.text();
    return { success: false, error: `Z-API [${res.status}]: ${errText}` };
  }

  return { success: true };
}

// ── Inbound Webhook Handler ──

function normalizePhone(raw: string): string {
  return String(raw || "").replace(/\D/g, "").replace(/^55(\d{10,11})$/, "$1");
}

async function handleInboundWebhook(body: any, isEvolution: boolean) {
  const sb = getSupabaseAdmin();

  let senderPhone = "";
  let messageText = "";
  let instanceId = "";

  if (isEvolution) {
    // Evolution API webhook format
    const data = body.data || {};
    senderPhone = data.key?.remoteJid?.replace(/@.*/, "") || "";
    messageText = data.message?.conversation || data.message?.extendedTextMessage?.text || "";
    instanceId = body.instance || "";
  } else {
    // Z-API webhook format
    senderPhone = body.phone || body.sender || "";
    messageText = body.text?.message || body.text || body.message || "";
    instanceId = body.instanceId || "";
  }

  const cleanPhone = normalizePhone(senderPhone);
  if (!cleanPhone || !messageText) {
    console.log("[Webhook] Ignored: no phone or text", { cleanPhone, messageText: messageText?.substring(0, 30) });
    return respond({ status: "ignored" });
  }

  console.log(`[Webhook Inbound] Phone: ${cleanPhone}, Text: ${messageText.substring(0, 60)}`);

  // Find client by phone (try multiple formats)
  const { data: client } = await sb
    .from("clients")
    .select("id, nome, tenant_id")
    .or(`telefone.like.%${cleanPhone},celular.like.%${cleanPhone},whatsapp.like.%${cleanPhone}`)
    .limit(1)
    .maybeSingle();

  if (!client) {
    console.log(`[Webhook] No client found for phone ${cleanPhone}`);
    // Still save the message to a general tracking if possible
    return respond({ status: "no_client_match", phone: cleanPhone });
  }

  // Find or create a tracking record for this client
  let trackingId: string | null = null;

  const { data: existingTracking } = await sb
    .from("client_tracking")
    .select("id")
    .eq("client_id", client.id)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (existingTracking) {
    trackingId = existingTracking.id;
  } else {
    // Create a tracking entry for this client
    const { data: newTracking } = await sb
      .from("client_tracking")
      .insert({
        client_id: client.id,
        tenant_id: client.tenant_id,
        nome_cliente: client.nome || "Cliente",
        numero_contrato: `WA-${cleanPhone.slice(-4)}`,
        status: "em_andamento",
      })
      .select("id")
      .single();
    trackingId = newTracking?.id || null;
  }

  if (!trackingId) {
    console.error("[Webhook] Could not find/create tracking for client", client.id);
    return respond({ status: "tracking_error" }, 500);
  }

  // Insert inbound message into tracking_messages
  const { error: insertError } = await sb.from("tracking_messages").insert({
    tracking_id: trackingId,
    mensagem: messageText,
    remetente_tipo: "cliente",
    remetente_nome: client.nome || "Cliente",
    lida: false,
    tenant_id: client.tenant_id,
  });

  if (insertError) {
    console.error("[Webhook] Insert error:", insertError);
    return respond({ status: "insert_error", error: insertError.message }, 500);
  }

  console.log(`[Webhook] Message saved to tracking ${trackingId} from ${client.nome}`);
  return respond({ status: "ok", tracking_id: trackingId, client_id: client.id });
}

// ── Main Handler ──

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const body = await req.json();

    // ── Inbound Webhook Handler (Z-API / Evolution) ──
    // Z-API sends webhooks without auth headers, detect by payload shape
    const isZapiWebhook = body.phone && !body.action && (body.text || body.image || body.audio || body.video || body.document);
    const isEvolutionWebhook = body.event && (body.data || body.instance);

    if (isZapiWebhook || isEvolutionWebhook) {
      return await handleInboundWebhook(body, isEvolutionWebhook);
    }

    // For action-based requests, require auth
    const authHeader = req.headers.get("authorization");
    if (!authHeader?.startsWith("Bearer ") || authHeader.replace("Bearer ", "").length < 20) {
      return respond({ error: "Não autorizado" }, 401);
    }

    const { action, phone, message, media_url, tenant_id, instance_name } = body;

    // Resolve Evolution config
    const config = await resolveEvolutionConfig(tenant_id || null);

    // ── Instance Management Actions ──

    if (action === "createInstance") {
      if (!config) return respond({ error: "Evolution API não configurada. Adicione a API Key em Configurações > APIs." }, 400);
      if (!instance_name || !tenant_id) return respond({ error: "instance_name e tenant_id são obrigatórios" }, 400);
      const result = await createInstance(config, instance_name, tenant_id);
      return respond(result, result.success ? 200 : 502);
    }

    if (action === "connectInstance") {
      if (!config) return respond({ error: "Evolution API não configurada" }, 400);
      if (!instance_name || !tenant_id) return respond({ error: "instance_name e tenant_id são obrigatórios" }, 400);
      const result = await connectInstance(config, instance_name, tenant_id);
      return respond(result, result.success ? 200 : 502);
    }

    if (action === "fetchQR") {
      if (!config) return respond({ error: "Evolution API não configurada" }, 400);
      if (!instance_name) return respond({ error: "instance_name é obrigatório" }, 400);
      const result = await fetchInstanceQR(config, instance_name);
      return respond(result, result.success ? 200 : 502);
    }

    if (action === "instanceStatus") {
      if (!config) return respond({ error: "Evolution API não configurada" }, 400);
      if (!instance_name || !tenant_id) return respond({ error: "instance_name e tenant_id são obrigatórios" }, 400);
      const result = await getInstanceStatus(config, instance_name, tenant_id);
      return respond(result, result.success ? 200 : 502);
    }

    if (action === "disconnectInstance") {
      if (!config) return respond({ error: "Evolution API não configurada" }, 400);
      if (!instance_name || !tenant_id) return respond({ error: "instance_name e tenant_id são obrigatórios" }, 400);
      const result = await disconnectInstance(config, instance_name, tenant_id);
      return respond(result);
    }

    if (action === "deleteInstance") {
      if (!config) return respond({ error: "Evolution API não configurada" }, 400);
      if (!instance_name || !tenant_id) return respond({ error: "instance_name e tenant_id são obrigatórios" }, 400);
      const result = await deleteInstance(config, instance_name, tenant_id);
      return respond(result);
    }

    // ── Status ──

    if (action === "status") {
      const provider = await detectProvider(tenant_id || null);
      return respond({
        provider,
        connected: provider !== "simulation",
        simulation: provider === "simulation",
        hasConfig: !!config,
      });
    }

    // ── Send Message ──

    if (action === "send") {
      if (!phone || !message) {
        return respond({ error: "phone e message são obrigatórios" }, 400);
      }

      const provider = await detectProvider(tenant_id || null);

      if (provider === "simulation") {
        return respond({
          success: true,
          provider: "simulation",
          message: "Modo simulação: mensagem tratada no frontend",
        });
      }

      if (provider === "zapi") {
        const zapiConfig = await resolveZapiConfig(tenant_id || null);
        if (!zapiConfig) return respond({ error: "Z-API não configurada. Adicione as credenciais em Configurações > WhatsApp." }, 400);
        const result = await sendViaZapi(phone, message, zapiConfig, media_url);
        if (!result.success) return respond({ error: result.error }, 502);
        return respond({ success: true, provider: "zapi" });
      }

      if (provider === "evolution") {
        if (!config) return respond({ error: "Evolution API não configurada" }, 400);
        let instName = instance_name || Deno.env.get("WHATSAPP_INSTANCE") || "default";
        if (tenant_id && !instance_name) {
          const sb = getSupabaseAdmin();
          const { data: inst } = await sb
            .from("whatsapp_instances")
            .select("instance_name")
            .eq("tenant_id", tenant_id)
            .eq("connected", true)
            .limit(1)
            .maybeSingle();
          if (inst) instName = inst.instance_name;
        }
        const result = await sendViaEvolution(phone, message, instName, config, media_url);
        if (!result.success) return respond({ error: result.error }, 502);
        return respond({ success: true, provider });
      }

      if (provider === "twilio") {
        const result = await sendViaTwilio(phone, message, media_url);
        if (!result.success) return respond({ error: result.error }, 502);
        return respond({ success: true, provider });
      }

      return respond({ error: `Provedor desconhecido: ${provider}` }, 400);
    }

    return respond({ error: "Ação inválida. Use: send, status, createInstance, connectInstance, fetchQR, instanceStatus, disconnectInstance, deleteInstance" }, 400);
  } catch (e) {
    console.error("whatsapp-gateway error:", e);
    return respond({ error: "Erro interno" }, 500);
  }
});
