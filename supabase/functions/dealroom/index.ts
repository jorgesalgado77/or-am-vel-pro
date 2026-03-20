import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS")
    return new Response(null, { headers: corsHeaders });

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !supabaseKey) {
    return respond({ error: "Configuração do servidor incompleta" }, 500);
  }

  const authHeader = req.headers.get("authorization");
  if (!authHeader?.startsWith("Bearer ") || authHeader.replace("Bearer ", "").length < 20) {
    return respond({ error: "Não autorizado" }, 401);
  }

  const supabase = createClient(supabaseUrl, supabaseKey);

  try {
    let body: Record<string, unknown>;
    try {
      body = await req.json();
    } catch {
      return respond({ error: "Body inválido" }, 400);
    }

    const action = typeof body.action === "string" ? body.action : "";
    const tenant_id = typeof body.tenant_id === "string" ? body.tenant_id : "";
    const usuario_id = typeof body.usuario_id === "string" ? body.usuario_id : "";
    const transaction_data = (body.transaction_data as Record<string, unknown>) || {};

    if (!action) return respond({ error: "Ação é obrigatória" }, 400);

    // ========== VALIDATE ==========
    if (action === "validate") {
      if (!tenant_id) return respond({ error: "tenant_id é obrigatório" }, 400);
      const { data: tenant } = await supabase
        .from("tenants").select("*").eq("id", tenant_id).single();

      if (!tenant || !tenant.ativo) {
        return respond({ allowed: false, reason: "Tenant inativo" });
      }

      const recursos = (tenant.recursos_vip as Record<string, boolean>) || {};
      if (!recursos.deal_room) {
        return respond({ allowed: false, reason: "Deal Room não habilitada no seu plano" });
      }

      const today = new Date().toISOString().split("T")[0];
      const { count } = await supabase
        .from("dealroom_usage")
        .select("*", { count: "exact", head: true })
        .eq("tenant_id", tenant_id).eq("usage_date", today);

      const limit = recursos.deal_room_limit || 999;
      return respond({ allowed: true, usage: count || 0, limit, plano: tenant.plano });
    }

    // ========== RECORD SALE ==========
    if (action === "record_sale") {
      const td = transaction_data;
      const taxa_percentual = 2.5;
      const taxa_valor = (Number(td.valor_venda) || 0) * (taxa_percentual / 100);

      const { data, error } = await supabase.from("dealroom_transactions").insert({
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
      }).select().single();

      if (error) {
        console.error("Record sale error:", error);
        return respond({ error: "Erro ao registrar venda" }, 500);
      }

      const today = new Date().toISOString().split("T")[0];
      await supabase.from("dealroom_usage").insert({
        tenant_id, usuario_id: td.usuario_id || null, usage_date: today,
      });

      return respond({ success: true, transaction: data });
    }

    // ========== CREATE PROPOSAL ==========
    if (action === "create_proposal") {
      if (!tenant_id) return respond({ error: "tenant_id é obrigatório" }, 400);

      const pd = transaction_data;
      const { data: proposal, error } = await supabase.from("dealroom_proposals").insert({
        tenant_id,
        tracking_id: pd.tracking_id || null,
        client_id: pd.client_id || null,
        usuario_id: pd.usuario_id || null,
        valor_proposta: pd.valor_proposta || 0,
        descricao: pd.descricao || null,
        forma_pagamento: pd.forma_pagamento || null,
        status: "enviada",
      }).select().single();

      if (error) {
        console.error("Create proposal error:", error);
        return respond({ error: "Erro ao criar proposta" }, 500);
      }

      // Try to create Stripe checkout if key is available
      const STRIPE_SECRET_KEY = Deno.env.get("STRIPE_SECRET_KEY");
      let checkoutUrl = null;

      if (STRIPE_SECRET_KEY && pd.valor_proposta && Number(pd.valor_proposta) > 0) {
        try {
          const stripeRes = await fetch("https://api.stripe.com/v1/checkout/sessions", {
            method: "POST",
            headers: {
              "Authorization": `Bearer ${STRIPE_SECRET_KEY}`,
              "Content-Type": "application/x-www-form-urlencoded",
            },
            body: new URLSearchParams({
              "payment_method_types[0]": "card",
              "line_items[0][price_data][currency]": "brl",
              "line_items[0][price_data][product_data][name]": `Proposta ${pd.numero_contrato || proposal.id.slice(0, 8)}`,
              "line_items[0][price_data][product_data][description]": (pd.descricao as string || "Proposta comercial").slice(0, 200),
              "line_items[0][price_data][unit_amount]": String(Math.round(Number(pd.valor_proposta) * 100)),
              "line_items[0][quantity]": "1",
              "mode": "payment",
              "success_url": `${supabaseUrl}/functions/v1/dealroom?action=payment_success&proposal_id=${proposal.id}`,
              "cancel_url": `${supabaseUrl}/functions/v1/dealroom?action=payment_cancel&proposal_id=${proposal.id}`,
              "metadata[proposal_id]": proposal.id,
              "metadata[tenant_id]": tenant_id,
            }),
          });

          if (stripeRes.ok) {
            const session = await stripeRes.json();
            checkoutUrl = session.url;

            await supabase.from("dealroom_proposals")
              .update({
                stripe_checkout_url: checkoutUrl,
                stripe_payment_intent_id: session.payment_intent || session.id,
              })
              .eq("id", proposal.id);
          }
        } catch (stripeErr) {
          console.error("Stripe checkout error:", stripeErr);
          // Don't fail proposal creation if Stripe fails
        }
      }

      return respond({
        success: true,
        proposal: { ...proposal, stripe_checkout_url: checkoutUrl },
      });
    }

    // ========== TRACK PROPOSAL VIEW ==========
    if (action === "track_proposal") {
      const proposalId = typeof body.proposal_id === "string" ? body.proposal_id : "";
      const event = typeof body.event === "string" ? body.event : "";

      if (!proposalId || !event) return respond({ error: "proposal_id e event são obrigatórios" }, 400);

      const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };

      if (event === "visualizada") {
        updates.visualizada_em = new Date().toISOString();
        updates.status = "visualizada";
      } else if (event === "clicou") {
        updates.clicou_em = new Date().toISOString();
      } else if (event === "aceita") {
        updates.aceita_em = new Date().toISOString();
        updates.status = "aceita";
      } else if (event === "recusada") {
        updates.recusada_em = new Date().toISOString();
        updates.status = "recusada";
        updates.motivo_recusa = typeof body.motivo === "string" ? body.motivo : null;
      } else if (event === "paga") {
        updates.pago_em = new Date().toISOString();
        updates.status = "paga";
      }

      const { error } = await supabase.from("dealroom_proposals")
        .update(updates).eq("id", proposalId);

      if (error) {
        console.error("Track proposal error:", error);
        return respond({ error: "Erro ao atualizar proposta" }, 500);
      }

      // If paid, auto-update client tracking status
      if (event === "paga" || event === "aceita") {
        const { data: proposal } = await supabase.from("dealroom_proposals")
          .select("tracking_id, client_id, tenant_id, valor_proposta, usuario_id")
          .eq("id", proposalId).single();

        if (proposal?.tracking_id) {
          await supabase.from("client_tracking")
            .update({ status: "fechado" } as any)
            .eq("id", proposal.tracking_id);
        }

        if (proposal?.client_id) {
          await supabase.from("clients")
            .update({ status: "fechado" } as any)
            .eq("id", proposal.client_id);
        }

        // Record DealRoom transaction
        if (proposal) {
          await supabase.from("dealroom_transactions").insert({
            tenant_id: proposal.tenant_id,
            valor_venda: proposal.valor_proposta,
            taxa_plataforma_percentual: 2.5,
            taxa_plataforma_valor: Number(proposal.valor_proposta) * 0.025,
            client_id: proposal.client_id || null,
            usuario_id: proposal.usuario_id || null,
            forma_pagamento: "stripe",
          });
        }
      }

      return respond({ success: true, event });
    }

    // ========== PAYMENT SUCCESS (Stripe redirect) ==========
    if (action === "payment_success") {
      const proposalId = typeof body.proposal_id === "string"
        ? body.proposal_id
        : new URL(req.url).searchParams.get("proposal_id") || "";

      if (proposalId) {
        await supabase.from("dealroom_proposals").update({
          pago_em: new Date().toISOString(),
          status: "paga",
          updated_at: new Date().toISOString(),
        }).eq("id", proposalId);
      }

      return new Response("<html><body><h1>Pagamento confirmado! ✅</h1><p>Você pode fechar esta janela.</p></body></html>", {
        headers: { ...corsHeaders, "Content-Type": "text/html" },
      });
    }

    // ========== DAILY USAGE ==========
    if (action === "daily_usage") {
      const today = new Date().toISOString().split("T")[0];
      const { count } = await supabase.from("dealroom_usage")
        .select("*", { count: "exact", head: true })
        .eq("tenant_id", tenant_id).eq("usage_date", today);
      return respond({ usage: count || 0 });
    }

    // ========== METRICS ==========
    if (action === "metrics") {
      const { data: transactions } = await supabase.from("dealroom_transactions")
        .select("*")
        .eq("tenant_id", tenant_id || transaction_data?.tenant_id)
        .order("created_at", { ascending: false });

      const txns = transactions || [];
      const totalVendas = txns.length;
      const totalTransacionado = txns.reduce((s: number, t: any) => s + (t.valor_venda || 0), 0);
      const totalTaxas = txns.reduce((s: number, t: any) => s + (t.taxa_plataforma_valor || 0), 0);
      const ticketMedio = totalVendas > 0 ? totalTransacionado / totalVendas : 0;

      const vendorMap: Record<string, { nome: string; total: number; vendas: number }> = {};
      txns.forEach((t: any) => {
        const key = t.usuario_id || "desconhecido";
        if (!vendorMap[key]) vendorMap[key] = { nome: t.nome_vendedor || "Desconhecido", total: 0, vendas: 0 };
        vendorMap[key].total += t.valor_venda || 0;
        vendorMap[key].vendas += 1;
      });

      const ranking = Object.entries(vendorMap)
        .map(([usuario_id, v]) => ({
          posicao: 0, nome: v.nome, usuario_id, total_vendido: v.total, vendas: v.vendas, taxa_conversao: 0,
        }))
        .sort((a, b) => b.total_vendido - a.total_vendido)
        .map((r, i) => ({ ...r, posicao: i + 1 }));

      // Get proposals metrics
      const { data: proposals } = await supabase.from("dealroom_proposals")
        .select("status, valor_proposta")
        .eq("tenant_id", tenant_id || transaction_data?.tenant_id);

      const proposalStats = {
        total: (proposals || []).length,
        enviadas: (proposals || []).filter((p: any) => p.status === "enviada").length,
        visualizadas: (proposals || []).filter((p: any) => p.status === "visualizada").length,
        aceitas: (proposals || []).filter((p: any) => p.status === "aceita").length,
        pagas: (proposals || []).filter((p: any) => p.status === "paga").length,
        recusadas: (proposals || []).filter((p: any) => p.status === "recusada").length,
      };

      return respond({
        metrics: { totalVendas, totalTransacionado, totalTaxas, ticketMedio, totalReunioes: 0, taxaConversao: 0 },
        ranking,
        transactions: txns,
        proposalStats,
      });
    }

    // ========== LIST PROPOSALS ==========
    if (action === "list_proposals") {
      const { data } = await supabase.from("dealroom_proposals")
        .select("*")
        .eq("tenant_id", tenant_id)
        .order("created_at", { ascending: false })
        .limit(50);
      return respond({ proposals: data || [] });
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
