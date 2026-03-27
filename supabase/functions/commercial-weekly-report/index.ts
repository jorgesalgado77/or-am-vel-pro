import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceKey);

    // Get all active tenants
    const { data: tenants } = await supabase
      .from("tenants")
      .select("id, nome");

    if (!tenants || tenants.length === 0) {
      return new Response(
        JSON.stringify({ message: "No tenants found" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const reports: Record<string, unknown> = {};

    for (const tenant of tenants) {
      const tenantId = tenant.id;

      // 1. Stale leads — no activity > 7 days, not closed
      const sevenDaysAgo = new Date(
        Date.now() - 7 * 24 * 60 * 60 * 1000
      ).toISOString();

      const { data: staleLeads } = await supabase
        .from("client_tracking")
        .select("id, nome_cliente, status, vendedor, updated_at, valor_orcamento")
        .eq("tenant_id", tenantId)
        .not("status", "in", "(fechado,perdido)")
        .lt("updated_at", sevenDaysAgo)
        .order("updated_at", { ascending: true })
        .limit(20);

      // 2. Hot leads not contacted recently
      const threeDaysAgo = new Date(
        Date.now() - 3 * 24 * 60 * 60 * 1000
      ).toISOString();

      const { data: hotLeads } = await supabase
        .from("client_tracking")
        .select("id, nome_cliente, vendedor, lead_temperature, updated_at, valor_orcamento")
        .eq("tenant_id", tenantId)
        .eq("lead_temperature", "quente")
        .not("status", "in", "(fechado,perdido)")
        .lt("updated_at", threeDaysAgo)
        .limit(10);

      // 3. Conversion rate by seller
      const { data: allTracking } = await supabase
        .from("client_tracking")
        .select("vendedor, status")
        .eq("tenant_id", tenantId);

      const bySeller: Record<
        string,
        { total: number; closed: number }
      > = {};

      for (const t of allTracking || []) {
        const seller = (t as any).vendedor || "Sem vendedor";
        if (!bySeller[seller]) bySeller[seller] = { total: 0, closed: 0 };
        bySeller[seller].total++;
        if ((t as any).status === "fechado") bySeller[seller].closed++;
      }

      const conversionBySeller = Object.entries(bySeller).map(
        ([name, data]) => ({
          vendedor: name,
          total: data.total,
          fechados: data.closed,
          taxa_conversao:
            data.total > 0
              ? Math.round((data.closed / data.total) * 1000) / 10
              : 0,
        })
      );

      // 4. Summary
      const totalActive = (allTracking || []).filter(
        (t: any) => !["fechado", "perdido"].includes(t.status)
      ).length;
      const totalClosed = (allTracking || []).filter(
        (t: any) => t.status === "fechado"
      ).length;

      reports[tenantId] = {
        tenant_name: tenant.nome,
        generated_at: new Date().toISOString(),
        summary: {
          total_active_leads: totalActive,
          total_closed: totalClosed,
          conversion_rate:
            totalActive + totalClosed > 0
              ? Math.round(
                  (totalClosed / (totalActive + totalClosed)) * 1000
                ) / 10
              : 0,
          stale_leads_count: staleLeads?.length || 0,
          hot_leads_uncontacted: hotLeads?.length || 0,
        },
        stale_leads: (staleLeads || []).map((l: any) => ({
          nome: l.nome_cliente,
          vendedor: l.vendedor || "—",
          dias_parado: Math.floor(
            (Date.now() - new Date(l.updated_at).getTime()) / 86400000
          ),
          valor: Number(l.valor_orcamento) || 0,
        })),
        hot_leads_not_contacted: (hotLeads || []).map((l: any) => ({
          nome: l.nome_cliente,
          vendedor: l.vendedor || "—",
          dias_sem_contato: Math.floor(
            (Date.now() - new Date(l.updated_at).getTime()) / 86400000
          ),
          valor: Number(l.valor_orcamento) || 0,
        })),
        conversion_by_seller: conversionBySeller.sort(
          (a, b) => b.taxa_conversao - a.taxa_conversao
        ),
      };

      // Save report to audit_logs for persistence
      await supabase.from("audit_logs").insert({
        tenant_id: tenantId,
        acao: "relatorio_semanal_comercial",
        entidade: "commercial_report",
        entidade_id: tenantId,
        detalhes: reports[tenantId],
        usuario_nome: "Sistema",
        usuario_email: "sistema@orcamovelpro.app",
      } as any);
    }

    return new Response(
      JSON.stringify({
        success: true,
        tenants_processed: Object.keys(reports).length,
        reports,
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (error) {
    return new Response(
      JSON.stringify({ error: (error as Error).message }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
