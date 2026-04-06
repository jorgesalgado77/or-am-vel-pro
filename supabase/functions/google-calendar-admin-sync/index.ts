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

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const { tasks } = await req.json();
    if (!tasks || !Array.isArray(tasks)) {
      return respond({ error: "tasks array required" }, 400);
    }

    // Get Google credentials - use admin-level token storage
    // Look for admin google_calendar_tokens
    const { data: tokenRow } = await supabaseAdmin
      .from("api_keys")
      .select("api_key, api_url")
      .eq("provider", "google_calendar_oauth")
      .limit(1)
      .maybeSingle();

    if (!tokenRow) {
      return respond({ error: "Google Calendar não conectado. Configure em Configurações > Google Agenda." }, 400);
    }

    // The token might be stored as JSON with refresh_token
    let accessToken = "";
    try {
      const tokenData = JSON.parse(tokenRow.api_key);
      if (tokenData.refresh_token) {
        // Refresh the access token
        const clientId = Deno.env.get("GOOGLE_CLIENT_ID") || "";
        const clientSecret = Deno.env.get("GOOGLE_CLIENT_SECRET") || "";
        const refreshRes = await fetch("https://oauth2.googleapis.com/token", {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body: new URLSearchParams({
            client_id: clientId,
            client_secret: clientSecret,
            refresh_token: tokenData.refresh_token,
            grant_type: "refresh_token",
          }),
        });
        const refreshData = await refreshRes.json();
        if (refreshData.access_token) {
          accessToken = refreshData.access_token;
        }
      } else if (tokenData.access_token) {
        accessToken = tokenData.access_token;
      }
    } catch {
      accessToken = tokenRow.api_key;
    }

    if (!accessToken) {
      return respond({ error: "Não foi possível obter token de acesso do Google Calendar" }, 400);
    }

    let synced = 0;

    for (const task of tasks) {
      const eventBody = {
        summary: `[Admin] ${task.titulo}`,
        description: task.descricao || `Tarefa admin - Status: ${task.coluna}`,
        start: {
          dateTime: new Date(task.created_at).toISOString(),
          timeZone: "America/Sao_Paulo",
        },
        end: {
          dateTime: new Date(new Date(task.created_at).getTime() + 3600000).toISOString(),
          timeZone: "America/Sao_Paulo",
        },
      };

      try {
        if (task.google_event_id) {
          // Update existing event
          const res = await fetch(
            `https://www.googleapis.com/calendar/v3/calendars/primary/events/${task.google_event_id}`,
            {
              method: "PATCH",
              headers: {
                Authorization: `Bearer ${accessToken}`,
                "Content-Type": "application/json",
              },
              body: JSON.stringify(eventBody),
            }
          );
          if (res.ok) synced++;
        } else {
          // Create new event
          const res = await fetch(
            "https://www.googleapis.com/calendar/v3/calendars/primary/events",
            {
              method: "POST",
              headers: {
                Authorization: `Bearer ${accessToken}`,
                "Content-Type": "application/json",
              },
              body: JSON.stringify(eventBody),
            }
          );
          if (res.ok) {
            const eventData = await res.json();
            // Save event ID back to task
            await supabaseAdmin
              .from("admin_tasks")
              .update({ google_event_id: eventData.id })
              .eq("id", task.id);
            synced++;
          }
        }
      } catch (err) {
        console.error(`Error syncing task ${task.id}:`, err);
      }
    }

    return respond({ success: true, synced });
  } catch (err) {
    console.error("Google Calendar Admin Sync error:", err);
    return respond({ error: err.message || "Internal error" }, 500);
  }
});
