import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

function respond(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function normalizeString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function extractRequestApiKey(body: Record<string, unknown>) {
  const candidates = [
    body.test_api_key,
    body._temp_key,
    body.api_key,
    body.apiKey,
    body.resend_api_key,
    body.resendApiKey,
  ];

  for (const candidate of candidates) {
    const apiKey = normalizeString(candidate);
    if (apiKey) return apiKey;
  }

  return "";
}

function getUserClient(authHeader: string) {
  return createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY")!,
    { global: { headers: { Authorization: authHeader } } }
  );
}

function getAdminClient() {
  return createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );
}

async function requireAdminMaster(authHeader: string | null) {
  if (!authHeader?.startsWith("Bearer ")) {
    return { error: respond({ error: "Não autorizado" }, 401) };
  }

  const userClient = getUserClient(authHeader);
  const {
    data: { user },
    error: authError,
  } = await userClient.auth.getUser();

  if (authError || !user?.email) {
    return { error: respond({ error: "Não autorizado" }, 401) };
  }

  const adminClient = getAdminClient();
  const { data: adminCheck, error: adminError } = await adminClient
    .from("admin_master")
    .select("id")
    .eq("email", user.email)
    .maybeSingle();

  if (adminError || !adminCheck) {
    return { error: respond({ error: "Acesso negado" }, 403) };
  }

  return { adminClient, user };
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authResult = await requireAdminMaster(req.headers.get("authorization"));
    if ("error" in authResult) {
      return authResult.error;
    }

    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    const action = normalizeString(body.action);
    const apiKey = extractRequestApiKey(body);

    if (!apiKey) {
      return respond({ success: false, error: "API Key do Resend não configurada. Adicione em Configurações > APIs." });
    }

    if (action === "verify") {
      const res = await fetch("https://api.resend.com/domains", {
        headers: { Authorization: `Bearer ${apiKey}` },
      });

      if (!res.ok) {
        return respond({ success: false, error: `Resend [${res.status}]` });
      }

      const data = await res.json();
      return respond({ success: true, domains: data.data || [] });
    }

    if (action === "send" || action === "send_test") {
      const to = body.to;
      const subject = normalizeString(body.subject);
      const html = normalizeString(body.html);
      const text = normalizeString(body.text);
      const from = normalizeString(body.from) || "OrçaMóvel PRO <onboarding@resend.dev>";
      const replyTo = normalizeString(body.reply_to);
      const cc = body.cc;
      const bcc = body.bcc;

      if (!to || !subject || (!html && !text)) {
        return respond({ success: false, error: "to, subject e html/text são obrigatórios" });
      }

      const payload: Record<string, unknown> = {
        from,
        to: Array.isArray(to) ? to : [to],
        subject,
      };

      if (html) payload.html = html;
      if (text) payload.text = text;
      if (replyTo) payload.reply_to = replyTo;
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
        return respond({ success: false, error: `Resend [${res.status}]: ${errText}` });
      }

      const data = await res.json();
      return respond({ success: true, email_id: data.id || null });
    }

    return respond({ error: "Ação inválida" }, 400);
  } catch (error) {
    console.error("resend-admin-test error:", error);
    return respond({ error: "Erro interno" }, 500);
  }
});