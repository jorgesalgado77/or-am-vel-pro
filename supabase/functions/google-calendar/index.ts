/**
 * Google Calendar Edge Function — Sync tasks with Google Calendar
 * 
 * Now supports OAuth 2.0 tokens (preferred) with fallback to API Key.
 * Actions: createEvent, updateEvent, deleteEvent, listEvents
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

const GCAL_BASE = "https://www.googleapis.com/calendar/v3";
const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";

interface AuthConfig {
  type: "oauth" | "apikey";
  accessToken?: string;
  apiKey?: string;
  calendarId: string;
}

/**
 * Resolve auth: prefer OAuth tokens, fallback to API key
 */
async function resolveAuthConfig(
  tenantId: string | null,
  userId: string | null
): Promise<AuthConfig | null> {
  const sb = getSupabaseAdmin();

  // 1. Try OAuth tokens for this user
  if (tenantId && userId) {
    const { data: tokenRow } = await sb
      .from("google_calendar_tokens" as any)
      .select("*")
      .eq("tenant_id", tenantId)
      .eq("user_id", userId)
      .eq("is_active", true)
      .single();

    if (tokenRow) {
      const row = tokenRow as any;
      let accessToken = row.access_token;

      // Check if token is expired (with 5min buffer)
      const expiry = new Date(row.token_expiry).getTime();
      if (Date.now() > expiry - 5 * 60 * 1000 && row.refresh_token) {
        // Refresh the token
        const refreshed = await refreshAccessToken(row.refresh_token, tenantId);
        if (refreshed) {
          accessToken = refreshed.access_token;
          await sb.from("google_calendar_tokens" as any)
            .update({
              access_token: refreshed.access_token,
              token_expiry: new Date(Date.now() + (refreshed.expires_in || 3600) * 1000).toISOString(),
              updated_at: new Date().toISOString(),
            })
            .eq("tenant_id", tenantId)
            .eq("user_id", userId);
        } else {
          // Token refresh failed, mark inactive
          await sb.from("google_calendar_tokens" as any)
            .update({ is_active: false })
            .eq("tenant_id", tenantId)
            .eq("user_id", userId);
          // Fall through to API key
        }
      }

      if (accessToken) {
        return {
          type: "oauth",
          accessToken,
          calendarId: row.calendar_id || "primary",
        };
      }
    }
  }

  // 2. Fallback: tenant API key
  if (tenantId) {
    try {
      const { data } = await sb.rpc("get_api_config", {
        p_tenant_id: tenantId,
        p_provider: "google_calendar",
      });
      if (data?.[0]?.api_key) {
        return {
          type: "apikey",
          apiKey: data[0].api_key,
          calendarId: data[0].api_url || "primary",
        };
      }
    } catch (_e) { /* fallback */ }
  }

  // 3. Fallback: env var
  const envKey = Deno.env.get("GOOGLE_CALENDAR_API_KEY");
  if (envKey) {
    return { type: "apikey", apiKey: envKey, calendarId: "primary" };
  }

  return null;
}

async function refreshAccessToken(refreshToken: string, tenantId: string) {
  const sb = getSupabaseAdmin();

  // Get OAuth credentials
  let clientId = Deno.env.get("GOOGLE_CLIENT_ID") || "";
  let clientSecret = Deno.env.get("GOOGLE_CLIENT_SECRET") || "";

  try {
    const { data } = await sb.rpc("get_api_config", {
      p_tenant_id: tenantId,
      p_provider: "google_calendar_oauth",
    });
    if (data?.[0]?.api_key) {
      clientId = data[0].api_key;
      clientSecret = data[0].api_url || clientSecret;
    }
  } catch (_e) { /* use env */ }

  if (!clientId || !clientSecret) return null;

  const res = await fetch(GOOGLE_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      refresh_token: refreshToken,
      client_id: clientId,
      client_secret: clientSecret,
      grant_type: "refresh_token",
    }),
  });

  const data = await res.json();
  if (!res.ok || !data.access_token) return null;
  return data;
}

async function gcalFetch(config: AuthConfig, path: string, method = "GET", body?: unknown) {
  const url = `${GCAL_BASE}${path}`;
  const headers: Record<string, string> = { "Content-Type": "application/json" };

  if (config.type === "oauth") {
    headers["Authorization"] = `Bearer ${config.accessToken}`;
  }

  let finalUrl = url;
  if (config.type === "apikey") {
    const sep = url.includes("?") ? "&" : "?";
    finalUrl = `${url}${sep}key=${config.apiKey}`;
    headers["Authorization"] = `Bearer ${config.apiKey}`;
  }

  const opts: RequestInit = { method, headers };
  if (body) opts.body = JSON.stringify(body);

  const res = await fetch(finalUrl, opts);

  if (method === "DELETE" && (res.status === 204 || res.status === 200)) {
    return { success: true, data: null };
  }

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    return { success: false, error: data.error?.message || `Google [${res.status}]`, data };
  }
  return { success: true, data };
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const body = await req.json();
    const { action, tenant_id, user_id } = body;

    const authHeader = req.headers.get("authorization");
    if (!authHeader?.startsWith("Bearer ") || authHeader.replace("Bearer ", "").length < 20) {
      return respond({ error: "Não autorizado" }, 401);
    }

    const config = await resolveAuthConfig(tenant_id || null, user_id || null);
    if (!config) {
      return respond({
        error: "Google Calendar não configurado. Conecte sua conta Google ou adicione uma API Key em Configurações > APIs.",
        needs_oauth: true,
      }, 400);
    }

    // ── Create Event ──
    if (action === "createEvent") {
      const { summary, description, start_date, start_time, end_time, attendees, task_id } = body;
      if (!summary || !start_date) {
        return respond({ error: "summary e start_date são obrigatórios" }, 400);
      }

      const startDateTime = start_time
        ? `${start_date}T${start_time}:00`
        : `${start_date}T09:00:00`;
      const endDateTime = end_time
        ? `${start_date}T${end_time}:00`
        : start_time
          ? `${start_date}T${String(Number(start_time.split(":")[0]) + 1).padStart(2, "0")}:${start_time.split(":")[1]}:00`
          : `${start_date}T10:00:00`;

      const event: Record<string, unknown> = {
        summary,
        description: description || "",
        start: { dateTime: startDateTime, timeZone: "America/Sao_Paulo" },
        end: { dateTime: endDateTime, timeZone: "America/Sao_Paulo" },
        reminders: {
          useDefault: false,
          overrides: [
            { method: "popup", minutes: 30 },
            { method: "popup", minutes: 10 },
          ],
        },
      };

      if (attendees && Array.isArray(attendees) && attendees.length > 0) {
        event.attendees = attendees.map((email: string) => ({ email }));
      }

      const result = await gcalFetch(config, `/calendars/${config.calendarId}/events`, "POST", event);

      if (result.success && task_id) {
        const sb = getSupabaseAdmin();
        await sb.from("tasks").update({
          google_event_id: result.data.id,
          google_calendar_url: result.data.htmlLink,
        }).eq("id", task_id);
      }

      return respond({
        ...result,
        auth_type: config.type,
      }, result.success ? 200 : 502);
    }

    // ── Update Event ──
    if (action === "updateEvent") {
      const { event_id, summary, description, start_date, start_time } = body;
      if (!event_id) return respond({ error: "event_id obrigatório" }, 400);

      const updates: Record<string, unknown> = {};
      if (summary) updates.summary = summary;
      if (description) updates.description = description;
      if (start_date) {
        const startDateTime = start_time ? `${start_date}T${start_time}:00` : `${start_date}T09:00:00`;
        updates.start = { dateTime: startDateTime, timeZone: "America/Sao_Paulo" };
        const endH = start_time ? String(Number(start_time.split(":")[0]) + 1).padStart(2, "0") : "10";
        const endM = start_time ? start_time.split(":")[1] : "00";
        updates.end = { dateTime: `${start_date}T${endH}:${endM}:00`, timeZone: "America/Sao_Paulo" };
      }

      const result = await gcalFetch(config, `/calendars/${config.calendarId}/events/${event_id}`, "PATCH", updates);
      return respond(result, result.success ? 200 : 502);
    }

    // ── Delete Event ──
    if (action === "deleteEvent") {
      const { event_id } = body;
      if (!event_id) return respond({ error: "event_id obrigatório" }, 400);

      const result = await gcalFetch(config, `/calendars/${config.calendarId}/events/${event_id}`, "DELETE");
      return respond(result, result.success ? 200 : 502);
    }

    // ── List Events ──
    if (action === "listEvents") {
      const { time_min, time_max, max_results } = body;
      let path = `/calendars/${config.calendarId}/events?orderBy=startTime&singleEvents=true`;
      if (time_min) path += `&timeMin=${time_min}`;
      if (time_max) path += `&timeMax=${time_max}`;
      path += `&maxResults=${max_results || 50}`;

      const result = await gcalFetch(config, path);
      return respond(result, result.success ? 200 : 502);
    }

    return respond({ error: "Ação inválida. Use: createEvent, updateEvent, deleteEvent, listEvents" }, 400);
  } catch (e) {
    console.error("google-calendar error:", e);
    return respond({ error: "Erro interno" }, 500);
  }
});
