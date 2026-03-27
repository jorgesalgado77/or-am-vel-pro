/**
 * Google Calendar Edge Function — Sync tasks with Google Calendar
 * 
 * Uses tenant-specific API key from api_keys table (provider: google_calendar).
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

async function resolveGoogleConfig(tenantId: string | null): Promise<{ apiKey: string; calendarId: string } | null> {
  if (tenantId) {
    try {
      const sb = getSupabaseAdmin();
      const { data } = await sb.rpc("get_api_config", { p_tenant_id: tenantId, p_provider: "google_calendar" });
      if (data && data.length > 0 && data[0].api_key) {
        return {
          apiKey: data[0].api_key,
          calendarId: data[0].api_url || "primary",
        };
      }
    } catch (e) {
      console.warn("[resolveGoogleConfig] Fallback:", e);
    }
  }
  const apiKey = Deno.env.get("GOOGLE_CALENDAR_API_KEY");
  if (!apiKey) return null;
  return { apiKey, calendarId: "primary" };
}

const GCAL_BASE = "https://www.googleapis.com/calendar/v3";

async function gcalFetch(apiKey: string, path: string, method = "GET", body?: unknown) {
  const separator = path.includes("?") ? "&" : "?";
  const url = `${GCAL_BASE}${path}${separator}key=${apiKey}`;
  
  const opts: RequestInit = {
    method,
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
  };
  if (body) opts.body = JSON.stringify(body);

  const res = await fetch(url, opts);
  const data = await res.json();
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
    const { action, tenant_id } = body;

    const authHeader = req.headers.get("authorization");
    if (!authHeader?.startsWith("Bearer ") || authHeader.replace("Bearer ", "").length < 20) {
      return respond({ error: "Não autorizado" }, 401);
    }

    const config = await resolveGoogleConfig(tenant_id || null);
    if (!config) {
      return respond({ error: "Google Calendar API Key não configurada. Adicione em Configurações > APIs." }, 400);
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

      const result = await gcalFetch(config.apiKey, `/calendars/${config.calendarId}/events`, "POST", event);

      // If success, update task with calendar event ID
      if (result.success && task_id) {
        const sb = getSupabaseAdmin();
        await sb.from("tasks").update({ 
          google_event_id: result.data.id,
          google_calendar_url: result.data.htmlLink,
        }).eq("id", task_id);
      }

      return respond(result, result.success ? 200 : 502);
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

      const result = await gcalFetch(config.apiKey, `/calendars/${config.calendarId}/events/${event_id}`, "PATCH", updates);
      return respond(result, result.success ? 200 : 502);
    }

    // ── Delete Event ──
    if (action === "deleteEvent") {
      const { event_id } = body;
      if (!event_id) return respond({ error: "event_id obrigatório" }, 400);

      const res = await fetch(
        `${GCAL_BASE}/calendars/${config.calendarId}/events/${event_id}`,
        { method: "DELETE", headers: { Authorization: `Bearer ${config.apiKey}` } }
      );
      
      if (res.status === 204 || res.status === 200) {
        return respond({ success: true });
      }
      const data = await res.json().catch(() => ({}));
      return respond({ success: false, error: data.error?.message || `Google [${res.status}]` }, 502);
    }

    // ── List Events ──
    if (action === "listEvents") {
      const { time_min, time_max, max_results } = body;
      let path = `/calendars/${config.calendarId}/events?orderBy=startTime&singleEvents=true`;
      if (time_min) path += `&timeMin=${time_min}`;
      if (time_max) path += `&timeMax=${time_max}`;
      path += `&maxResults=${max_results || 50}`;

      const result = await gcalFetch(config.apiKey, path);
      return respond(result, result.success ? 200 : 502);
    }

    return respond({ error: "Ação inválida. Use: createEvent, updateEvent, deleteEvent, listEvents" }, 400);
  } catch (e) {
    console.error("google-calendar error:", e);
    return respond({ error: "Erro interno" }, 500);
  }
});
