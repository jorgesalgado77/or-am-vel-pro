/**
 * Resend Email Gateway — Send transactional emails via Resend API
 * 
 * Uses tenant-specific API key from api_keys table.
 * Actions: send, verify
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

async function resolveResendKey(tenantId: string | null): Promise<string | null> {
  if (tenantId) {
    try {
      const sb = getSupabaseAdmin();
      const { data } = await sb.rpc("get_api_config", { p_tenant_id: tenantId, p_provider: "resend" });
      if (data && data.length > 0 && data[0].api_key) {
        return data[0].api_key;
      }
    } catch (e) {
      console.warn("[resolveResendKey] Fallback:", e);
    }
  }
  return Deno.env.get("RESEND_API_KEY") || null;
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
    const { action, tenant_id } = body;

    if (action === "send") {
      const { to, subject, html, text, from, reply_to, cc, bcc } = body;
      if (!to || !subject || (!html && !text)) {
        return respond({ error: "to, subject e html/text são obrigatórios" }, 400);
      }

      const apiKey = await resolveResendKey(tenant_id || null);
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
        return respond({ success: false, error: `Resend [${res.status}]: ${errText}` }, 502);
      }

      const data = await res.json();

      // Save to email history
      try {
        const sb = getSupabaseAdmin();
        await sb.from("mia_email_history").insert({
          tenant_id: tenant_id,
          to_email: Array.isArray(to) ? to.join(", ") : to,
          cc_email: cc ? (Array.isArray(cc) ? cc.join(", ") : cc) : null,
          subject,
          body_html: html || null,
          body_text: text || null,
          resend_id: data.id || null,
          status: "sent",
          sent_by: body.sent_by || null,
        });
      } catch (e) {
        console.warn("Failed to save email history:", e);
      }

      return respond({ success: true, email_id: data.id });
    }

    if (action === "verify") {
      // Allow validating a temporary key passed from the client (before saving)
      const tempKey = body._temp_key;
      const apiKey = tempKey || await resolveResendKey(tenant_id || null);
      if (!apiKey) {
        return respond({ success: false, error: "API Key não encontrada" });
      }

      const res = await fetch("https://api.resend.com/domains", {
        headers: { Authorization: `Bearer ${apiKey}` },
      });

      if (res.ok) {
        const data = await res.json();
        return respond({ success: true, domains: data.data || [] });
      }
      return respond({ success: false, error: `Resend [${res.status}]` });
    }

    return respond({ error: "Ação inválida. Use 'send' ou 'verify'" }, 400);
  } catch (e) {
    console.error("resend-email error:", e);
    return respond({ error: "Erro interno" }, 500);
  }
});
