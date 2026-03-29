import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

/**
 * consolidate-trackings — Auto-merges duplicate client_tracking records
 * that share the same phone number (last 8 digits) within a tenant.
 *
 * For each group of duplicates:
 * 1. Keeps the most recently updated tracking as "primary"
 * 2. Reassigns all whatsapp_messages from duplicates to the primary
 * 3. Deletes the duplicate tracking records
 *
 * Returns a summary of consolidated groups.
 */
serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { tenant_id, dry_run } = await req.json();
    if (!tenant_id) {
      return new Response(JSON.stringify({ error: "tenant_id obrigatório" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const sbUrl = Deno.env.get("SUPABASE_URL")!;
    const sbKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || Deno.env.get("SUPABASE_ANON_KEY")!;
    const admin = createClient(sbUrl, sbKey);

    // Fetch all trackings for this tenant
    const { data: trackings, error: fetchErr } = await admin
      .from("client_tracking")
      .select("id, tenant_id, client_id, nome_cliente, numero_contrato, status, updated_at, created_at")
      .eq("tenant_id", tenant_id)
      .not("numero_contrato", "is", null);

    if (fetchErr) {
      return new Response(JSON.stringify({ error: fetchErr.message }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!trackings || trackings.length === 0) {
      return new Response(JSON.stringify({ consolidated: 0, groups: [] }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Group by normalized phone tail (last 8 digits)
    const normalize = (phone: string) => phone.replace(/\D/g, "").slice(-8);
    const groups = new Map<string, typeof trackings>();

    for (const t of trackings) {
      const digits = (t.numero_contrato || "").replace(/\D/g, "");
      if (digits.length < 8) continue;
      const tail = normalize(digits);
      const key = `${tenant_id}:${tail}`;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push(t);
    }

    // Filter only groups with duplicates
    const duplicateGroups = Array.from(groups.entries())
      .filter(([, items]) => items.length > 1);

    if (duplicateGroups.length === 0) {
      return new Response(JSON.stringify({ consolidated: 0, groups: [], message: "Nenhuma duplicata encontrada" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const results: Array<{
      phone_tail: string;
      primary_id: string;
      primary_name: string;
      removed_ids: string[];
      removed_names: string[];
      messages_moved: number;
    }> = [];

    for (const [key, items] of duplicateGroups) {
      // Sort: most recently updated first; prefer entries with client_id
      const sorted = items.sort((a, b) => {
        // Prefer entries with client_id
        if (a.client_id && !b.client_id) return -1;
        if (!a.client_id && b.client_id) return 1;
        // Then by most recent update
        return new Date(b.updated_at || b.created_at).getTime() - new Date(a.updated_at || a.created_at).getTime();
      });

      const primary = sorted[0];
      const duplicates = sorted.slice(1);
      const duplicateIds = duplicates.map((d) => d.id);

      if (dry_run) {
        results.push({
          phone_tail: key.split(":")[1],
          primary_id: primary.id,
          primary_name: primary.nome_cliente || "—",
          removed_ids: duplicateIds,
          removed_names: duplicates.map((d) => d.nome_cliente || "—"),
          messages_moved: 0,
        });
        continue;
      }

      // Move messages from duplicates to primary
      let messagesMoved = 0;
      for (const dupId of duplicateIds) {
        const { data: msgs } = await admin
          .from("whatsapp_messages")
          .select("id")
          .eq("tracking_id", dupId);

        if (msgs && msgs.length > 0) {
          const { error: moveErr } = await admin
            .from("whatsapp_messages")
            .update({ tracking_id: primary.id })
            .eq("tracking_id", dupId);

          if (!moveErr) messagesMoved += msgs.length;
          else console.error(`Failed to move messages from ${dupId}:`, moveErr);
        }
      }

      // Delete duplicate trackings
      const { error: delErr } = await admin
        .from("client_tracking")
        .delete()
        .in("id", duplicateIds);

      if (delErr) {
        console.error("Failed to delete duplicates:", delErr);
      }

      results.push({
        phone_tail: key.split(":")[1],
        primary_id: primary.id,
        primary_name: primary.nome_cliente || "—",
        removed_ids: duplicateIds,
        removed_names: duplicates.map((d) => d.nome_cliente || "—"),
        messages_moved: messagesMoved,
      });
    }

    return new Response(JSON.stringify({
      consolidated: results.length,
      total_removed: results.reduce((sum, r) => sum + r.removed_ids.length, 0),
      total_messages_moved: results.reduce((sum, r) => sum + r.messages_moved, 0),
      dry_run: !!dry_run,
      groups: results,
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("consolidate-trackings error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Erro interno" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
