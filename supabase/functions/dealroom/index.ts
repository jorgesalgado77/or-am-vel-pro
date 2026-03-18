import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

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
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceKey);

    const { action, tenant_id, usuario_id, transaction_data } = await req.json();

    // ACTION: validate - Check if tenant can use Deal Room
    if (action === "validate") {
      const { data, error } = await supabase.rpc("validate_dealroom_access", {
        p_tenant_id: tenant_id,
        p_usuario_id: usuario_id || null,
      });

      if (error) {
        return new Response(JSON.stringify({ allowed: false, reason: error.message }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      return new Response(JSON.stringify(data), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ACTION: record_sale - Record a Deal Room transaction with platform fee
    if (action === "record_sale") {
      if (!transaction_data?.valor_venda || !tenant_id) {
        return new Response(JSON.stringify({ error: "Missing required fields" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const taxaPercentual = 2;
      const taxaValor = (transaction_data.valor_venda * taxaPercentual) / 100;

      const { data, error } = await supabase.from("dealroom_transactions").insert({
        tenant_id,
        client_id: transaction_data.client_id || null,
        usuario_id: transaction_data.usuario_id || null,
        simulation_id: transaction_data.simulation_id || null,
        valor_venda: transaction_data.valor_venda,
        taxa_plataforma_percentual: taxaPercentual,
        taxa_plataforma_valor: taxaValor,
        forma_pagamento: transaction_data.forma_pagamento || null,
        numero_contrato: transaction_data.numero_contrato || null,
        nome_cliente: transaction_data.nome_cliente || null,
        nome_vendedor: transaction_data.nome_vendedor || null,
      }).select().single();

      if (error) {
        return new Response(JSON.stringify({ error: error.message }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      return new Response(JSON.stringify({ success: true, transaction: data, taxa_plataforma: taxaValor }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ACTION: daily_usage - Get current daily usage for tenant
    if (action === "daily_usage") {
      const { data, error } = await supabase.rpc("get_dealroom_daily_usage", {
        p_tenant_id: tenant_id,
      });

      if (error) {
        return new Response(JSON.stringify({ error: error.message }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      return new Response(JSON.stringify({ usage: data }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ACTION: metrics - Get metrics for admin dashboard
    if (action === "metrics") {
      const filters = transaction_data || {};
      let query = supabase.from("dealroom_transactions").select("*");

      if (filters.tenant_id) query = query.eq("tenant_id", filters.tenant_id);
      if (filters.date_from) query = query.gte("created_at", filters.date_from);
      if (filters.date_to) query = query.lte("created_at", filters.date_to);

      const { data: transactions, error } = await query.order("created_at", { ascending: false });

      if (error) {
        return new Response(JSON.stringify({ error: error.message }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Get usage counts
      let usageQuery = supabase.from("dealroom_usage").select("*", { count: "exact", head: false });
      if (filters.tenant_id) usageQuery = usageQuery.eq("tenant_id", filters.tenant_id);
      if (filters.date_from) usageQuery = usageQuery.gte("created_at", filters.date_from);
      if (filters.date_to) usageQuery = usageQuery.lte("created_at", filters.date_to);

      const { count: totalUsage } = await usageQuery;

      const totalVendas = transactions?.length || 0;
      const totalTransacionado = transactions?.reduce((s, t) => s + Number(t.valor_venda), 0) || 0;
      const totalTaxas = transactions?.reduce((s, t) => s + Number(t.taxa_plataforma_valor), 0) || 0;
      const ticketMedio = totalVendas > 0 ? totalTransacionado / totalVendas : 0;
      const totalReunioes = totalUsage || 0;
      const taxaConversao = totalReunioes > 0 ? (totalVendas / totalReunioes) * 100 : 0;

      // Vendor ranking
      const vendorMap: Record<string, { nome: string; usuario_id: string; total_vendido: number; vendas: number; reunioes: number }> = {};
      transactions?.forEach((t) => {
        const key = t.usuario_id || "unknown";
        if (!vendorMap[key]) {
          vendorMap[key] = { nome: t.nome_vendedor || "Desconhecido", usuario_id: key, total_vendido: 0, vendas: 0, reunioes: 0 };
        }
        vendorMap[key].total_vendido += Number(t.valor_venda);
        vendorMap[key].vendas += 1;
      });

      const ranking = Object.values(vendorMap)
        .sort((a, b) => b.total_vendido - a.total_vendido)
        .map((v, i) => ({ ...v, posicao: i + 1, taxa_conversao: v.reunioes > 0 ? (v.vendas / v.reunioes) * 100 : 0 }));

      return new Response(JSON.stringify({
        metrics: { totalVendas, totalTransacionado, totalTaxas, ticketMedio, totalReunioes, taxaConversao },
        ranking,
        transactions: transactions?.slice(0, 50),
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ error: "Invalid action" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
