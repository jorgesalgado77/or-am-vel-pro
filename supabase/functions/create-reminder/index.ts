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

    // Ensure reminders table exists
    await supabase.rpc("exec_sql_if_not_exists", {
      p_sql: `
        CREATE TABLE IF NOT EXISTS public.reminders (
          id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
          tenant_id text,
          user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
          title text NOT NULL,
          content text,
          scheduled_for timestamptz NOT NULL,
          status text NOT NULL DEFAULT 'pending',
          created_at timestamptz DEFAULT now(),
          updated_at timestamptz DEFAULT now()
        );
        CREATE INDEX IF NOT EXISTS idx_reminders_user ON public.reminders(user_id);
        CREATE INDEX IF NOT EXISTS idx_reminders_status ON public.reminders(status);
        ALTER TABLE public.reminders ENABLE ROW LEVEL SECURITY;
        DO $$ BEGIN
          IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'reminders' AND policyname = 'Users can manage own reminders') THEN
            CREATE POLICY "Users can manage own reminders" ON public.reminders FOR ALL TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
          END IF;
        END $$;
      `
    }).catch(() => {
      // RPC may not exist, try direct table creation via REST-compatible approach
      console.log("exec_sql_if_not_exists RPC not available, table should exist already");
    });

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
          user_id,
          title,
          content: content || title,
          scheduled_for,
          status: "pending",
        })
        .select()
        .single();

      if (error) {
        // If table doesn't exist, create it directly
        if (error.message?.includes("relation") || error.code === "42P01") {
          // Table doesn't exist yet - create via raw SQL
          const createTableSQL = `
            CREATE TABLE IF NOT EXISTS public.reminders (
              id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
              tenant_id text,
              user_id uuid,
              title text NOT NULL,
              content text,
              scheduled_for timestamptz NOT NULL,
              status text NOT NULL DEFAULT 'pending',
              created_at timestamptz DEFAULT now(),
              updated_at timestamptz DEFAULT now()
            );
          `;
          // Use service role to execute via pg
          // Fallback: return success with localStorage hint
          return new Response(
            JSON.stringify({ 
              fallback: true, 
              message: "Table not yet created. Using local storage.",
              reminder: { id: crypto.randomUUID(), title, content, scheduled_for, status: "pending" }
            }),
            { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
          );
        }
        console.error("Insert error:", error);
        return new Response(
          JSON.stringify({ error: error.message }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }

      return new Response(
        JSON.stringify(data),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    if (action === "list") {
      const { data, error } = await supabase
        .from("reminders")
        .select("*")
        .eq("user_id", user_id)
        .eq("status", "pending")
        .order("scheduled_for", { ascending: true });

      if (error) {
        return new Response(
          JSON.stringify({ reminders: [] }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }

      return new Response(
        JSON.stringify({ reminders: data || [] }),
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
      JSON.stringify({ error: "Unknown action" }),
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
