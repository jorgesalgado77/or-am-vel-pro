/**
 * Resend Email Gateway — Send transactional emails via Resend API
 *
 * Uses tenant-specific API key from api_keys table.
 * Actions: send, send_test, verify, get_settings, save_settings
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

function normalizeApiKey(value: unknown): string {
  if (typeof value !== "string") return "";
  const normalized = value.trim();
  return normalized || "";
}

function extractRequestApiKey(body: Record<string, unknown>): string {
  const candidates = [
    body.test_api_key,
    body._temp_key,
    body.api_key,
    body.apiKey,
    body.resend_api_key,
    body.resendApiKey,
  ];

  for (const candidate of candidates) {
    const apiKey = normalizeApiKey(candidate);
    if (apiKey) return apiKey;
  }

  return "";
}

async function resolveStoredResendKey(tenantId: string | null): Promise<string | null> {
  if (tenantId) {
    try {
      const sb = getSupabaseAdmin();
      const { data } = await sb.rpc("get_api_config", { p_tenant_id: tenantId, p_provider: "resend" });
      if (data && data.length > 0 && data[0].api_key) {
        return data[0].api_key;
      }
    } catch (e) {
      console.warn("[resolveStoredResendKey] Tenant RPC lookup failed:", e);
    }

    try {
      const sb = getSupabaseAdmin();
      const { data } = await sb
        .from("tenant_resend_settings")
        .select("api_key")
        .eq("tenant_id", tenantId)
        .limit(1)
        .maybeSingle();

      if (data?.api_key) {
        return data.api_key;
      }
    } catch (e) {
      console.warn("[resolveStoredResendKey] tenant_resend_settings lookup failed:", e);
    }
  }

  const envKey = normalizeApiKey(Deno.env.get("RESEND_API_KEY"));
  if (envKey) return envKey;

  try {
    const sb = getSupabaseAdmin();
    const { data } = await sb
      .from("dealroom_api_configs")
      .select("credenciais")
      .eq("provider", "resend_master")
      .limit(1)
      .maybeSingle();

    const adminKey = normalizeApiKey(data?.credenciais?.api_key);
    if (adminKey) {
      return adminKey;
    }
  } catch (e) {
    console.warn("[resolveStoredResendKey] Admin master lookup failed:", e);
  }

  return null;
}

async function resolveResendKey(body: Record<string, unknown>, tenantId: string | null) {
  const requestKey = extractRequestApiKey(body);
  if (requestKey) {
    return { apiKey: requestKey, source: "request" as const };
  }

  const storedKey = await resolveStoredResendKey(tenantId);
  if (storedKey) {
    return { apiKey: storedKey, source: "stored" as const };
  }

  return { apiKey: null, source: "missing" as const };
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Validate auth via JWT claims
    const authHeader = req.headers.get("authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return respond({ error: "Não autorizado" }, 401);
    }
    const token = authHeader.replace("Bearer ", "");
    const userClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );
    const { data: claimsData, error: claimsError } = await userClient.auth.getClaims(token);
    if (claimsError || !claimsData?.claims?.sub) {
      return respond({ error: "Não autorizado" }, 401);
    }

    const body = await req.json();
    const requestBody = body as Record<string, unknown>;
    const { action, tenant_id } = body;

    if (action === "get_settings") {
      const sb = getSupabaseAdmin();
      const { data, error } = await sb
        .from("admin_resend_settings")
        .select("*")
        .limit(1)
        .maybeSingle();

      if (error) {
        return respond({ success: false, error: error.message }, 500);
      }
      return respond({ success: true, settings: data || null });
    }

    if (action === "save_settings") {
      const { api_key, from_email, from_name, ativo, id } = body;
      const sb = getSupabaseAdmin();

      if (id) {
        const { data, error } = await sb
          .from("admin_resend_settings")
          .update({
            api_key: api_key ?? null,
            from_email: from_email ?? null,
            from_name: from_name ?? null,
            ativo: ativo ?? false,
          })
          .eq("id", id)
          .select("*")
          .single();

        if (error) {
          return respond({ success: false, error: error.message }, 500);
        }
        return respond({ success: true, settings: data });
      }

      const { data, error } = await sb
        .from("admin_resend_settings")
        .insert({
          api_key: api_key ?? null,
          from_email: from_email ?? null,
          from_name: from_name ?? null,
          ativo: ativo ?? false,
        })
        .select("*")
        .single();

      if (error) {
        return respond({ success: false, error: error.message }, 500);
      }
      return respond({ success: true, settings: data });
    }

    if (action === "send" || action === "send_test") {
      const { to, subject, html, text, from, reply_to, cc, bcc } = body;
      if (!to || !subject || (!html && !text)) {
        return respond({ error: "to, subject e html/text são obrigatórios" }, 400);
      }

      const { apiKey, source } = await resolveResendKey(requestBody, tenant_id || null);
      console.log("[resend-email/send] resolving api key", {
        action,
        source,
        hasTenantId: !!tenant_id,
        hasRequestKey: !!extractRequestApiKey(requestBody),
      });

      if (!apiKey) {
        return respond({ error: "API Key do Resend não configurada. Adicione em Configurações > APIs." }, 400);
      }

      const payload: Record<string, unknown> = {
        from: from || "Loja <noreply@resend.dev>",
        to: Array.isArray(to) ? to : [to],
        subject,
      };
      if (html) payload.html = html;
      if (text) payload.text = text;
      if (reply_to) payload.reply_to = reply_to;
      if (cc) payload.cc = Array.isArray(cc) ? cc : [cc];
      if (bcc) payload.bcc = Array.isArray(bcc) ? bcc : [bcc];

      const res = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const errText = await res.text();
        console.error("[resend-email/send] resend api error", { status: res.status, source, errText });
        return respond({ success: false, error: `Resend [${res.status}]: ${errText}` }, 502);
      }

      const data = await res.json();

      try {
        const sb = getSupabaseAdmin();
        const { error: historyError } = await sb.from("mia_email_history").insert({
          tenant_id: tenant_id,
          to_email: Array.isArray(to) ? to.join(", ") : to,
          cc_email: cc ? (Array.isArray(cc) ? cc.join(", ") : cc) : null,
          subject,
          body_html: html || null,
          body_text: text || null,
          resend_id: data.id || null,
          status: "sent",
          sent_by: body.sent_by || null,
          created_at: new Date().toISOString(),
        });

        if (historyError) {
          console.error("Failed to save email history:", historyError);
        }
      } catch (e) {
        console.error("Failed to save email history:", e);
      }

      return respond({ success: true, email_id: data.id, source });
    }

    if (action === "verify") {
      const { apiKey, source } = await resolveResendKey(requestBody, tenant_id || null);
      console.log("[resend-email/verify] resolving api key", {
        source,
        hasTenantId: !!tenant_id,
        hasRequestKey: !!extractRequestApiKey(requestBody),
      });

      if (!apiKey) {
        return respond({ success: false, error: "API Key não encontrada" });
      }

      const res = await fetch("https://api.resend.com/domains", {
        headers: { Authorization: `Bearer ${apiKey}` },
      });

      if (res.ok) {
        const data = await res.json();
        return respond({ success: true, domains: data.data || [], source });
      }
      return respond({ success: false, error: `Resend [${res.status}]`, source });
    }

    return respond({ error: "Ação inválida. Use 'send', 'send_test', 'verify', 'get_settings' ou 'save_settings'" }, 400);
  } catch (e) {
    console.error("resend-email error:", e);
    return respond({ error: "Erro interno" }, 500);
  }
});