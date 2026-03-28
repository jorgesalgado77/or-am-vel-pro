import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const body = await req.json();
    const { action, user_id, tenant_id, title, content, scheduled_for, reminder_id } = body;

    if (action === "create") {
      if (!title || !scheduled_for) {
        return new Response(
          JSON.stringify({ error: "Missing title or scheduled_for" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }

      const { data, error } = await supabase
        .from("reminders")
        .insert({
          tenant_id,
          user_id: user_id || null,
          title,
          content: content || title,
          scheduled_for,
          status: "pending",
        })
        .select()
        .single();

      if (error) {
        console.error("Insert error:", error);
        // Return a fallback response so client can still use localStorage
        return new Response(
          JSON.stringify({
            fallback: true,
            message: "DB insert failed, using local storage.",
            reminder: { id: crypto.randomUUID(), title, content: content || title, scheduled_for, status: "pending" },
          }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }

      return new Response(
        JSON.stringify(data),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    if (action === "list") {
      const query = supabase
        .from("reminders")
        .select("*")
        .eq("status", "pending")
        .order("scheduled_for", { ascending: true });

      if (user_id) query.eq("user_id", user_id);
      if (tenant_id) query.eq("tenant_id", tenant_id);

      const { data, error } = await query;

      return new Response(
        JSON.stringify({ reminders: error ? [] : (data || []) }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    if (action === "mark_fired") {
      if (!reminder_id) {
        return new Response(
          JSON.stringify({ error: "Missing reminder_id" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }

      await supabase
        .from("reminders")
        .update({ status: "fired", updated_at: new Date().toISOString() })
        .eq("id", reminder_id);

      return new Response(
        JSON.stringify({ success: true }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    return new Response(
      JSON.stringify({ error: "Unknown action. Use: create, list, mark_fired" }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e) {
    console.error("Reminder error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
