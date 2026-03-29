/**
 * Director Weekly Report — Generates and sends a weekly report
 * from the IA Diretora Comercial via email (Resend).
 * 
 * Includes: revenue forecast, team performance, recommended actions.
 */
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

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

function fmt(val: number) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(val);
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceKey);

    const { data: tenants } = await supabase.from("tenants").select("id, nome");
    if (!tenants?.length) return respond({ message: "No tenants" });

    const results: Record<string, { sent: boolean; error?: string }> = {};

    for (const tenant of tenants) {
      const tid = tenant.id;

      try {
        // 1. Get pipeline data
        const sevenDaysAgo = new Date(Date.now() - 7 * 86400000).toISOString();

        const [trackingRes, contractsRes, eventsRes, forecastRes] = await Promise.all([
          supabase.from("client_tracking")
            .select("id, nome_cliente, vendedor, status, lead_temperature, valor_orcamento, updated_at")
            .eq("tenant_id", tid)
            .not("status", "in", "(fechado,perdido)"),
          supabase.from("client_contracts")
            .select("id, valor_total, created_at")
            .eq("tenant_id", tid)
            .gte("created_at", new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString()),
          supabase.from("ai_learning_events" as any)
            .select("event_type, deal_result, strategy_used, created_at")
            .eq("tenant_id", tid)
            .gte("created_at", sevenDaysAgo),
          supabase.from("revenue_forecast" as any)
            .select("*")
            .eq("tenant_id", tid)
            .order("created_at", { ascending: false })
            .limit(1),
        ]);

        const tracking = (trackingRes.data || []) as any[];
        const contracts = (contractsRes.data || []) as any[];
        const events = (eventsRes.data || []) as any[];
        const forecast = (forecastRes.data?.[0]) as any;

        // Pipeline analysis
        const hotLeads = tracking.filter(t => t.lead_temperature === "quente").length;
        const stalledLeads = tracking.filter(t => {
          const daysSince = (Date.now() - new Date(t.updated_at).getTime()) / 86400000;
          return daysSince > 7;
        }).length;
        const pipelineValue = tracking.reduce((s, t) => s + (Number(t.valor_orcamento) || 0), 0);

        // Contracts this month
        const monthRevenue = contracts.reduce((s, c) => s + (Number(c.valor_total) || 0), 0);

        // Events summary
        const weekEvents = events.length;
        const weekWon = events.filter(e => e.deal_result === "ganho").length;
        const weekLost = events.filter(e => e.deal_result === "perdido").length;

        // Team performance
        const byVendedor: Record<string, { leads: number; stalled: number; hot: number }> = {};
        tracking.forEach(t => {
          const v = t.vendedor || "Sem vendedor";
          if (!byVendedor[v]) byVendedor[v] = { leads: 0, stalled: 0, hot: 0 };
          byVendedor[v].leads++;
          if (t.lead_temperature === "quente") byVendedor[v].hot++;
          const days = (Date.now() - new Date(t.updated_at).getTime()) / 86400000;
          if (days > 7) byVendedor[v].stalled++;
        });

        // Build actions
        const actions: string[] = [];
        if (stalledLeads > 3) actions.push(`⚠️ ${stalledLeads} leads parados há mais de 7 dias — priorizar reativação`);
        if (hotLeads > 0) actions.push(`🔥 ${hotLeads} leads quentes no pipeline — focar no fechamento`);
        if (weekLost > weekWon) actions.push(`📉 Mais perdas que ganhos esta semana — revisar abordagem de vendas`);
        Object.entries(byVendedor).forEach(([name, d]) => {
          if (d.stalled > 2) actions.push(`👤 ${name}: ${d.stalled} leads parados — intervir`);
        });
        if (forecast && forecast.risco === "critico") actions.push("🚨 Risco CRÍTICO de não bater a meta — ação imediata necessária");

        // Build HTML email
        const teamRows = Object.entries(byVendedor)
          .sort((a, b) => b[1].leads - a[1].leads)
          .map(([name, d]) =>
            `<tr><td style="padding:8px;border-bottom:1px solid #eee">${name}</td>
             <td style="padding:8px;border-bottom:1px solid #eee;text-align:center">${d.leads}</td>
             <td style="padding:8px;border-bottom:1px solid #eee;text-align:center">${d.hot}</td>
             <td style="padding:8px;border-bottom:1px solid #eee;text-align:center;color:${d.stalled > 2 ? '#dc2626' : '#666'}">${d.stalled}</td></tr>`
          ).join("");

        const actionsHtml = actions.map(a => `<li style="margin-bottom:8px;font-size:14px">${a}</li>`).join("");

        const html = `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="font-family:Arial,sans-serif;background:#f9fafb;padding:20px">
<div style="max-width:600px;margin:0 auto;background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.08)">
  <div style="background:linear-gradient(135deg,#1e3a5f,#2563eb);padding:24px;color:#fff">
    <h1 style="margin:0;font-size:20px">📊 Relatório Semanal — Diretora Comercial</h1>
    <p style="margin:4px 0 0;opacity:0.85;font-size:13px">${tenant.nome} • ${new Date().toLocaleDateString("pt-BR")}</p>
  </div>
  
  <div style="padding:24px">
    <h2 style="font-size:16px;color:#1e3a5f;margin:0 0 16px">📈 Resumo do Pipeline</h2>
    <table style="width:100%;border-collapse:collapse;margin-bottom:24px">
      <tr>
        <td style="padding:12px;background:#f0f9ff;border-radius:8px;text-align:center;width:25%">
          <div style="font-size:22px;font-weight:bold;color:#1e3a5f">${tracking.length}</div>
          <div style="font-size:11px;color:#666">Leads Ativos</div>
        </td>
        <td style="width:4%"></td>
        <td style="padding:12px;background:#f0fdf4;border-radius:8px;text-align:center;width:25%">
          <div style="font-size:22px;font-weight:bold;color:#166534">${contracts.length}</div>
          <div style="font-size:11px;color:#666">Contratos Mês</div>
        </td>
        <td style="width:4%"></td>
        <td style="padding:12px;background:#fefce8;border-radius:8px;text-align:center;width:25%">
          <div style="font-size:22px;font-weight:bold;color:#854d0e">${hotLeads}</div>
          <div style="font-size:11px;color:#666">Leads Quentes</div>
        </td>
        <td style="width:4%"></td>
        <td style="padding:12px;background:#fef2f2;border-radius:8px;text-align:center;width:25%">
          <div style="font-size:22px;font-weight:bold;color:#dc2626">${stalledLeads}</div>
          <div style="font-size:11px;color:#666">Parados 7d+</div>
        </td>
      </tr>
    </table>

    ${forecast ? `
    <h2 style="font-size:16px;color:#1e3a5f;margin:0 0 12px">💰 Previsão de Faturamento</h2>
    <table style="width:100%;border-collapse:collapse;margin-bottom:24px">
      <tr>
        <td style="padding:10px;text-align:center;background:#f0fdf4;border-radius:8px">
          <div style="font-size:11px;color:#666">Otimista</div>
          <div style="font-size:16px;font-weight:bold;color:#166534">${fmt(forecast.previsao_otimista || 0)}</div>
        </td>
        <td style="width:4%"></td>
        <td style="padding:10px;text-align:center;background:#f0f9ff;border-radius:8px">
          <div style="font-size:11px;color:#666">Realista</div>
          <div style="font-size:16px;font-weight:bold;color:#1e3a5f">${fmt(forecast.previsao_realista || 0)}</div>
        </td>
        <td style="width:4%"></td>
        <td style="padding:10px;text-align:center;background:#fef2f2;border-radius:8px">
          <div style="font-size:11px;color:#666">Pessimista</div>
          <div style="font-size:16px;font-weight:bold;color:#dc2626">${fmt(forecast.previsao_pessimista || 0)}</div>
        </td>
      </tr>
    </table>
    <p style="font-size:12px;color:#666;margin-bottom:24px">Confiança: ${forecast.confianca || 0}% | Risco: <strong style="color:${forecast.risco === 'critico' ? '#dc2626' : forecast.risco === 'alto' ? '#ea580c' : '#666'}">${(forecast.risco || 'N/A').toUpperCase()}</strong></p>
    ` : ""}

    <h2 style="font-size:16px;color:#1e3a5f;margin:0 0 12px">👥 Performance da Equipe</h2>
    <table style="width:100%;border-collapse:collapse;margin-bottom:24px;font-size:13px">
      <tr style="background:#f8fafc">
        <th style="padding:8px;text-align:left;border-bottom:2px solid #e2e8f0">Vendedor</th>
        <th style="padding:8px;text-align:center;border-bottom:2px solid #e2e8f0">Leads</th>
        <th style="padding:8px;text-align:center;border-bottom:2px solid #e2e8f0">Quentes</th>
        <th style="padding:8px;text-align:center;border-bottom:2px solid #e2e8f0">Parados</th>
      </tr>
      ${teamRows}
    </table>

    <h2 style="font-size:16px;color:#1e3a5f;margin:0 0 12px">🎯 IA da Semana</h2>
    <table style="width:100%;border-collapse:collapse;margin-bottom:24px">
      <tr>
        <td style="padding:8px;background:#f8fafc;border-radius:6px;text-align:center">
          <div style="font-size:18px;font-weight:bold">${weekEvents}</div>
          <div style="font-size:11px;color:#666">Eventos</div>
        </td>
        <td style="width:4%"></td>
        <td style="padding:8px;background:#f0fdf4;border-radius:6px;text-align:center">
          <div style="font-size:18px;font-weight:bold;color:#166534">${weekWon}</div>
          <div style="font-size:11px;color:#666">Ganhos</div>
        </td>
        <td style="width:4%"></td>
        <td style="padding:8px;background:#fef2f2;border-radius:6px;text-align:center">
          <div style="font-size:18px;font-weight:bold;color:#dc2626">${weekLost}</div>
          <div style="font-size:11px;color:#666">Perdidos</div>
        </td>
      </tr>
    </table>

    ${actions.length > 0 ? `
    <h2 style="font-size:16px;color:#1e3a5f;margin:0 0 12px">🚀 Ações Recomendadas</h2>
    <ul style="padding-left:20px;margin:0 0 16px">${actionsHtml}</ul>
    ` : ""}
  </div>
  
  <div style="padding:16px 24px;background:#f8fafc;border-top:1px solid #e2e8f0;text-align:center">
    <p style="margin:0;font-size:11px;color:#999">Relatório gerado automaticamente pela IA Diretora Comercial • OrçaMóvel PRO</p>
  </div>
</div>
</body>
</html>`;

        // Get admin emails for this tenant
        const { data: admins } = await supabase
          .from("usuarios")
          .select("email")
          .eq("tenant_id", tid)
          .in("cargo_nome", ["administrador", "gerente"]);

        const recipientEmails = (admins || []).map((a: any) => a.email).filter(Boolean);

        if (recipientEmails.length === 0) {
          results[tid] = { sent: false, error: "No admin emails found" };
          continue;
        }

        // Send via resend-email edge function
        const { error: sendError } = await supabase.functions.invoke("resend-email", {
          body: {
            action: "send",
            tenant_id: tid,
            to: recipientEmails,
            subject: `📊 Relatório Semanal — Diretora Comercial | ${tenant.nome}`,
            html,
            sent_by: "IA Diretora Comercial",
          },
        });

        if (sendError) {
          results[tid] = { sent: false, error: sendError.message };
        } else {
          results[tid] = { sent: true };
        }

        // Log to audit
        await supabase.from("audit_logs").insert({
          tenant_id: tid,
          acao: "relatorio_semanal_diretora",
          entidade: "director_report",
          entidade_id: tid,
          detalhes: { pipeline: tracking.length, contracts: contracts.length, forecast: forecast?.previsao_realista, actions },
          usuario_nome: "IA Diretora",
          usuario_email: "sistema@orcamovelpro.app",
        } as any);

      } catch (tenantErr) {
        results[tid] = { sent: false, error: (tenantErr as Error).message };
      }
    }

    return respond({ success: true, results });
  } catch (error) {
    return respond({ error: (error as Error).message }, 500);
  }
});
