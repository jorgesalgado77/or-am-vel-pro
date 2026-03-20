import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS")
    return new Response(null, { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceRoleKey);

    const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

    // Get all tenants with follow-up enabled
    const { data: configs } = await supabase
      .from("followup_config")
      .select("*")
      .eq("enabled", true);

    const reports: any[] = [];

    for (const cfg of configs || []) {
      const tenantId = cfg.tenant_id;

      // Sent follow-ups this week
      const { data: sent } = await supabase
        .from("followup_schedules")
        .select("id, stage, client_id, sent_at")
        .eq("tenant_id", tenantId)
        .eq("status", "sent")
        .gte("sent_at", weekAgo);

      const sentCount = sent?.length || 0;

      // Cancelled (client responded) this week
      const { data: cancelled } = await supabase
        .from("followup_schedules")
        .select("id, client_id")
        .eq("tenant_id", tenantId)
        .eq("status", "cancelled")
        .gte("created_at", weekAgo);

      const respondedClientIds = new Set(
        (cancelled || []).map((c: any) => c.client_id)
      );

      // Check which sent follow-up clients later had activity (responded)
      const sentClientIds = [...new Set((sent || []).map((s: any) => s.client_id))];
      let responsesObtained = 0;

      if (sentClientIds.length > 0) {
        const { data: clients } = await supabase
          .from("clients")
          .select("id, updated_at, status")
          .in("id", sentClientIds);

        for (const client of clients || []) {
          const clientSent = (sent || []).find((s: any) => s.client_id === client.id);
          if (clientSent && new Date(client.updated_at) > new Date(clientSent.sent_at)) {
            responsesObtained++;
          }
          if (respondedClientIds.has(client.id)) {
            responsesObtained++;
          }
        }
        // Deduplicate
        responsesObtained = Math.min(responsesObtained, sentClientIds.length);
      }

      // Conversions (clients moved to "fechado" this week)
      const { data: closedClients } = await supabase
        .from("clients")
        .select("id")
        .eq("tenant_id", tenantId)
        .eq("status", "fechado")
        .gte("updated_at", weekAgo);

      const closedFromFollowUp = (closedClients || []).filter(
        (c: any) => sentClientIds.includes(c.id) || respondedClientIds.has(c.id)
      ).length;

      // Stage breakdown
      const stageBreakdown: Record<string, number> = { "1h": 0, "24h": 0, "3d": 0 };
      (sent || []).forEach((s: any) => {
        if (stageBreakdown[s.stage] !== undefined) stageBreakdown[s.stage]++;
      });

      const conversionRate = sentCount > 0
        ? ((closedFromFollowUp / sentCount) * 100).toFixed(1)
        : "0.0";

      const responseRate = sentCount > 0
        ? ((responsesObtained / sentCount) * 100).toFixed(1)
        : "0.0";

      // Get tenant name
      const { data: company } = await supabase
        .from("company_settings")
        .select("nome_empresa")
        .eq("tenant_id", tenantId)
        .maybeSingle();

      // Get admin emails for this tenant
      const { data: admins } = await supabase
        .from("usuarios")
        .select("email")
        .eq("tenant_id", tenantId)
        .eq("ativo", true)
        .in("cargo_nome", ["Administrador", "Gerente"]);

      const report = {
        tenant_id: tenantId,
        company_name: (company as any)?.nome_empresa || "Loja",
        sent: sentCount,
        responses: responsesObtained,
        response_rate: responseRate,
        conversions: closedFromFollowUp,
        conversion_rate: conversionRate,
        stage_breakdown: stageBreakdown,
        admin_emails: (admins || []).map((a: any) => a.email).filter(Boolean),
      };

      reports.push(report);

      // Save report to audit
      await supabase.from("audit_logs").insert({
        acao: "followup_weekly_report",
        entidade: "followup_config",
        entidade_id: tenantId,
        tenant_id: tenantId,
        detalhes: report,
      } as any);
    }

    return new Response(
      JSON.stringify({
        message: "Weekly reports generated",
        reports_count: reports.length,
        reports,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (e) {
    console.error("followup-weekly-report error:", e);
    return new Response(
      JSON.stringify({ error: "Erro interno" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
