import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

/**
 * WhatsApp Bot — Fluxo de Captação Automática
 * 
 * Webhook recebe mensagens do WhatsApp (Evolution API / Twilio)
 * e conduz um fluxo de qualificação:
 *   Etapa 1: Saudação + pedir nome
 *   Etapa 2: Pedir ambiente de interesse
 *   Etapa 3: Pedir orçamento estimado
 *   Etapa 4: Salvar lead qualificado + encaminhar para VendaZap AI
 */

interface ConversationState {
  step: "greeting" | "name" | "room" | "budget" | "done";
  nome?: string;
  ambiente?: string;
  orcamento?: string;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const body = await req.json();

    // Normalize payload (suporta Evolution API e Twilio)
    const phone = body.data?.key?.remoteJid?.replace("@s.whatsapp.net", "")
      || body.From?.replace("whatsapp:+", "")
      || body.phone
      || "";
    const message = (body.data?.message?.conversation
      || body.data?.message?.extendedTextMessage?.text
      || body.Body
      || body.message
      || "").trim();
    const tenantId = body.tenant_id
      || body.data?.tenant_id
      || null;

    if (!phone || !message) {
      return new Response(JSON.stringify({ error: "phone and message required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Buscar ou criar estado da conversa
    const { data: existing } = await supabaseAdmin
      .from("whatsapp_bot_sessions")
      .select("id, state, tenant_id")
      .eq("phone", phone)
      .eq("tenant_id", tenantId)
      .eq("active", true)
      .maybeSingle();

    let session = existing;
    let state: ConversationState = session?.state as any || { step: "greeting" };

    if (!session) {
      // Nova conversa — criar sessão
      const { data: newSession } = await supabaseAdmin
        .from("whatsapp_bot_sessions")
        .insert({
          phone,
          tenant_id: tenantId,
          state: { step: "greeting" },
          active: true,
        })
        .select("id, state, tenant_id")
        .single();
      session = newSession;
      state = { step: "greeting" };
    }

    let reply = "";
    let shouldSaveLead = false;

    switch (state.step) {
      case "greeting":
        reply = `Olá! 👋 Bem-vindo! Que bom ter você aqui.\n\nPara oferecer a melhor experiência, preciso de algumas informações rápidas.\n\n*Qual é o seu nome?*`;
        state = { step: "name" };
        break;

      case "name":
        state.nome = message;
        reply = `Prazer, *${state.nome}*! 😊\n\n*Qual ambiente você deseja mobiliar?*\n\nExemplos: Cozinha, Quarto, Sala, Escritório, Banheiro...`;
        state.step = "room";
        break;

      case "room":
        state.ambiente = message;
        reply = `Ótimo! *${state.ambiente}* é um projeto incrível! 🏠\n\n*Qual o orçamento aproximado que você tem em mente?*\n\nExemplos: R$ 5.000, R$ 15.000, Não sei ainda...`;
        state.step = "budget";
        break;

      case "budget":
        state.orcamento = message;
        shouldSaveLead = true;
        reply = `Perfeito, *${state.nome}*! ✅\n\nRecebi todas as informações:\n📋 Ambiente: *${state.ambiente}*\n💰 Orçamento: *${state.orcamento}*\n\nUm especialista entrará em contato em breve para agendar seu *Projeto 3D Gratuito*! 🎨\n\nObrigado pela confiança! 🙏`;
        state.step = "done";
        break;

      case "done":
        // Conversa já finalizada — repassar para VendaZap AI
        reply = "__FORWARD_TO_VENDAZAP__";
        break;
    }

    // Atualizar estado da sessão
    await supabaseAdmin
      .from("whatsapp_bot_sessions")
      .update({
        state,
        active: state.step !== "done" || !shouldSaveLead,
        updated_at: new Date().toISOString(),
      })
      .eq("id", session!.id);

    // Salvar lead qualificado
    if (shouldSaveLead && tenantId) {
      // Salvar via lead-capture (reutiliza deduplicação + VendaZap AI)
      try {
        await supabaseAdmin.functions.invoke("lead-capture", {
          body: {
            nome: state.nome,
            telefone: phone,
            interesse: `Ambiente: ${state.ambiente} | Orçamento: ${state.orcamento}`,
            origem: "whatsapp_bot",
            tenant_id: tenantId,
          },
        });
      } catch (leadErr) {
        console.error("Lead capture from bot error:", leadErr);
      }

      // Registrar no client_tracking
      try {
        await supabaseAdmin.from("client_tracking").insert({
          tenant_id: tenantId,
          phone,
          nome: state.nome,
          ambiente: state.ambiente,
          orcamento_estimado: state.orcamento,
          origem: "whatsapp_bot",
          status: "qualificado",
        });
      } catch (trackErr) {
        console.error("Client tracking error:", trackErr);
      }

      // Encerrar sessão de bot e marcar como concluída
      await supabaseAdmin
        .from("whatsapp_bot_sessions")
        .update({ active: false })
        .eq("id", session!.id);
    }

    // Se a conversa já foi concluída, encaminhar para VendaZap AI
    if (reply === "__FORWARD_TO_VENDAZAP__") {
      try {
        const { data: addon } = await supabaseAdmin
          .from("vendazap_addon")
          .select("ativo, prompt_sistema, api_provider, openai_model, max_tokens_mensagem")
          .eq("tenant_id", tenantId)
          .eq("ativo", true)
          .maybeSingle();

        if (addon) {
          const { data: aiReply } = await supabaseAdmin.functions.invoke("vendazap-ai", {
            body: {
              mensagem_cliente: message,
              nome_cliente: state.nome || "Cliente",
              tipo_copy: "resposta_livre",
              tom: "amigavel",
              status_negociacao: "qualificado",
              prompt_sistema: addon.prompt_sistema,
              api_provider: addon.api_provider,
              openai_model: addon.openai_model,
              max_tokens: addon.max_tokens_mensagem,
            },
          });

          reply = aiReply?.resposta || "Obrigado pela mensagem! Um especialista responderá em breve. 😊";
        } else {
          reply = "Obrigado pela mensagem! Um especialista da nossa equipe responderá em breve. 😊";
        }
      } catch {
        reply = "Obrigado! Nossa equipe entrará em contato em breve. 😊";
      }
    }

    // Registrar mensagens no tracking_messages para continuidade no chat interno
    await supabaseAdmin.from("tracking_messages").insert([
      {
        tenant_id: tenantId,
        telefone: phone,
        remetente_tipo: "cliente",
        conteudo: message,
        lida: false,
      },
      {
        tenant_id: tenantId,
        telefone: phone,
        remetente_tipo: "sistema",
        conteudo: reply,
        lida: true,
      },
    ]);

    return new Response(
      JSON.stringify({
        success: true,
        reply,
        session_id: session!.id,
        step: state.step,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("WhatsApp bot error:", err);
    return new Response(JSON.stringify({ error: "Erro interno do bot" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});