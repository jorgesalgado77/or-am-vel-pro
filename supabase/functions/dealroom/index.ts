import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

serve(async (req) => {
  if (req.method === "OPTIONS")
    return new Response(null, { headers: corsHeaders });

  const supabase = createClient(supabaseUrl, supabaseKey);

  try {
    const { action, tenant_id, usuario_id, transaction_data } = await req.json();

    if (action === "validate") {
      // Check tenant plan for Deal Room access
      const { data: tenant } = await supabase
        .from("tenants")
        .select("*")
        .eq("id", tenant_id)
        .single();

      if (!tenant || !tenant.ativo) {
        return respond({ allowed: false, reason: "Tenant inativo" });
      }

      const recursos = (tenant.recursos_vip as Record<string, boolean>) || {};
      if (!recursos.deal_room) {
        return respond({ allowed: false, reason: "Deal Room não habilitada no seu plano" });
      }

      // Check daily usage
      const today = new Date().toISOString().split("T")[0];
      const { count } = await supabase
        .from("dealroom_usage")
        .select("*", { count: "exact", head: true })
        .eq("tenant_id", tenant_id)
        .eq("usage_date", today);

      const limit = recursos.deal_room_limit || 999;
      return respond({ allowed: true, usage: count || 0, limit, plano: tenant.plano });
    }

    if (action === "record_sale") {
      const td = transaction_data;
      const taxa_percentual = 2.5;
      const taxa_valor = (td.valor_venda || 0) * (taxa_percentual / 100);

      const { data, error } = await supabase
        .from("dealroom_transactions")
        .insert({
          tenant_id,
          valor_venda: td.valor_venda,
          taxa_plataforma_percentual: taxa_percentual,
          taxa_plataforma_valor: taxa_valor,
          client_id: td.client_id || null,
          usuario_id: td.usuario_id || null,
          simulation_id: td.simulation_id || null,
          forma_pagamento: td.forma_pagamento || null,
          numero_contrato: td.numero_contrato || null,
          nome_cliente: td.nome_cliente || null,
          nome_vendedor: td.nome_vendedor || null,
        })
        .select()
        .single();

      if (error) {
        console.error("Record sale error:", error);
        return respond({ error: "Erro ao registrar venda" }, 500);
      }

      // Record usage
      const today = new Date().toISOString().split("T")[0];
      await supabase.from("dealroom_usage").insert({
        tenant_id,
        usuario_id: td.usuario_id || null,
        usage_date: today,
      });

      return respond({ success: true, transaction: data });
    }

    if (action === "daily_usage") {
      const today = new Date().toISOString().split("T")[0];
      const { count } = await supabase
        .from("dealroom_usage")
        .select("*", { count: "exact", head: true })
        .eq("tenant_id", tenant_id)
        .eq("usage_date", today);

      return respond({ usage: count || 0 });
    }

    if (action === "metrics") {
      const { data: transactions } = await supabase
        .from("dealroom_transactions")
        .select("*")
        .eq("tenant_id", tenant_id || transaction_data?.tenant_id)
        .order("created_at", { ascending: false });

      const txns = transactions || [];
      const totalVendas = txns.length;
      const totalTransacionado = txns.reduce((s: number, t: any) => s + (t.valor_venda || 0), 0);
      const totalTaxas = txns.reduce((s: number, t: any) => s + (t.taxa_plataforma_valor || 0), 0);
      const ticketMedio = totalVendas > 0 ? totalTransacionado / totalVendas : 0;

      // Ranking by vendor
      const vendorMap: Record<string, { nome: string; total: number; vendas: number }> = {};
      txns.forEach((t: any) => {
        const key = t.usuario_id || "desconhecido";
        if (!vendorMap[key]) vendorMap[key] = { nome: t.nome_vendedor || "Desconhecido", total: 0, vendas: 0 };
        vendorMap[key].total += t.valor_venda || 0;
        vendorMap[key].vendas += 1;
      });

      const ranking = Object.entries(vendorMap)
        .map(([usuario_id, v], i) => ({
          posicao: i + 1,
          nome: v.nome,
          usuario_id,
          total_vendido: v.total,
          vendas: v.vendas,
          taxa_conversao: 0,
        }))
        .sort((a, b) => b.total_vendido - a.total_vendido)
        .map((r, i) => ({ ...r, posicao: i + 1 }));

      return respond({
        metrics: { totalVendas, totalTransacionado, totalTaxas, ticketMedio, totalReunioes: 0, taxaConversao: 0 },
        ranking,
        transactions: txns,
      });
    }

    return respond({ error: "Ação não reconhecida" }, 400);
  } catch (e) {
    console.error("dealroom error:", e);
    return respond({ error: "Erro interno" }, 500);
  }

  function respond(body: unknown, status = 200) {
    return new Response(JSON.stringify(body), {
      status,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
