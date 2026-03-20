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
    const body = await req.json();
    const { nome, telefone, email, area_atuacao, cargo, interesse, origem, tenant_id } = body;

    // Validação básica
    if (!nome || typeof nome !== "string" || nome.trim().length < 2) {
      return new Response(JSON.stringify({ error: "Nome inválido (mín 2 caracteres)" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!telefone || typeof telefone !== "string" || telefone.replace(/\D/g, "").length < 10) {
      return new Response(JSON.stringify({ error: "Telefone inválido" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const cleanPhone = telefone.replace(/\D/g, "");

    // Verificar duplicidade por telefone + tenant
    const { data: existing } = await supabaseAdmin
      .from("leads")
      .select("id, lead_temperature, status")
      .eq("telefone", cleanPhone)
      .eq("tenant_id", tenant_id || null)
      .maybeSingle();

    if (existing) {
      // Atualizar lead existente em vez de duplicar
      await supabaseAdmin
        .from("leads")
        .update({ 
          nome: nome.trim(),
          email: email?.trim() || undefined,
          interesse: interesse || undefined,
          updated_at: new Date().toISOString(),
        })
        .eq("id", existing.id);

      // Registrar log de origem
      await supabaseAdmin.from("lead_origin_logs").insert({
        lead_id: existing.id,
        tenant_id: tenant_id || null,
        origem: origem || "site",
        user_agent: req.headers.get("user-agent") || null,
        referrer: req.headers.get("referer") || null,
      });

      return new Response(
        JSON.stringify({ 
          success: true, 
          lead_id: existing.id, 
          duplicado: true,
          message: "Lead já existente, dados atualizados" 
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Inserir novo lead (trigger faz classificação automática)
    const { data: newLead, error: insertError } = await supabaseAdmin
      .from("leads")
      .insert({
        nome: nome.trim(),
        telefone: cleanPhone,
        email: email?.trim() || "",
        area_atuacao: area_atuacao || "outro",
        cargo: cargo || "outro",
        interesse: interesse || null,
        origem: origem || "site",
        tenant_id: tenant_id || null,
        status: "novo",
      })
      .select("id, lead_temperature")
      .single();

    if (insertError) {
      console.error("Insert error:", insertError);
      return new Response(JSON.stringify({ error: "Erro ao salvar lead" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Log de origem
    await supabaseAdmin.from("lead_origin_logs").insert({
      lead_id: newLead.id,
      tenant_id: tenant_id || null,
      origem: origem || "site",
      user_agent: req.headers.get("user-agent") || null,
      referrer: req.headers.get("referer") || null,
    });

    // Acionar VendaZap AI automaticamente para leads quentes/mornos
    if (newLead.lead_temperature !== "frio" && tenant_id) {
      try {
        const { data: addon } = await supabaseAdmin
          .from("vendazap_addon")
          .select("ativo, prompt_sistema, api_provider, openai_model, max_tokens_mensagem")
          .eq("tenant_id", tenant_id)
          .eq("ativo", true)
          .maybeSingle();

        if (addon) {
          // Gerar mensagem de boas-vindas automática via VendaZap
          await supabaseAdmin.functions.invoke("vendazap-ai", {
            body: {
              nome_cliente: nome.trim(),
              tipo_copy: "boas_vindas",
              tom: "amigavel",
              status_negociacao: "novo",
              prompt_sistema: addon.prompt_sistema,
              api_provider: addon.api_provider,
              openai_model: addon.openai_model,
              max_tokens: addon.max_tokens_mensagem,
            },
          });

          // Marcar que whatsapp foi enviado
          await supabaseAdmin
            .from("leads")
            .update({ whatsapp_enviado: true })
            .eq("id", newLead.id);
        }
      } catch (vendaErr) {
        console.error("VendaZap auto-trigger error:", vendaErr);
        // Não falhar o lead capture por causa do VendaZap
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        lead_id: newLead.id,
        temperature: newLead.lead_temperature,
        duplicado: false,
      }),
      { status: 201, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("Lead capture error:", err);
    return new Response(JSON.stringify({ error: "Erro interno" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
