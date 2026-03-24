import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

const sanitizeString = (value: unknown, max = 500) =>
  typeof value === "string" ? value.trim().slice(0, max) : "";

const getPhoneDigits = (value: string) => value.replace(/\D/g, "");

type AttachmentInput = {
  file_name: string;
  file_path: string;
  file_url: string | null;
  file_size: number;
  file_type: string | null;
};

const sanitizeAttachments = (value: unknown): AttachmentInput[] => {
  if (!Array.isArray(value)) return [];

  return value
    .slice(0, 10)
    .map((item) => {
      const file_name = sanitizeString((item as Record<string, unknown>)?.file_name, 255);
      const file_path = sanitizeString((item as Record<string, unknown>)?.file_path, 500);
      const file_url = sanitizeString((item as Record<string, unknown>)?.file_url, 1000) || null;
      const file_type = sanitizeString((item as Record<string, unknown>)?.file_type, 120) || null;
      const rawSize = Number((item as Record<string, unknown>)?.file_size ?? 0);
      const file_size = Number.isFinite(rawSize) && rawSize > 0 ? Math.round(rawSize) : 0;

      return { file_name, file_path, file_url, file_size, file_type };
    })
    .filter((item) => item.file_name && item.file_path && item.file_size > 0);
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const body = await req.json().catch(() => ({}));

    const nome = sanitizeString(body?.nome, 120);
    const telefoneRaw = sanitizeString(body?.telefone, 30);
    const telefone = getPhoneDigits(telefoneRaw);
    const email = sanitizeString(body?.email, 255);
    const area_atuacao = sanitizeString(body?.area_atuacao, 80) || "outro";
    const cargo = sanitizeString(body?.cargo, 80) || "outro";
    const interesse = sanitizeString(body?.interesse, 2000);
    const origem = sanitizeString(body?.origem, 80) || "site";
    const tenant_id = sanitizeString(body?.tenant_id, 80) || null;
    const attachments = sanitizeAttachments(body?.attachments);

    if (nome.length < 2) {
      return json({ error: "Nome inválido (mín. 2 caracteres)" }, 400);
    }

    if (telefone.length < 10) {
      return json({ error: "Telefone inválido" }, 400);
    }

    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    let clientId: string | null = null;
    let leadId: string | null = null;
    let duplicado = false;
    let leadTemperature: string | null = null;

    if (tenant_id) {
      // REGRA: Cada lead/cliente é SEMPRE único — NUNCA reutilizar ou sobrescrever
      // Mesmo com telefone ou email igual, criar um novo registro
      {
        const { data: tenantData, error: tenantError } = await supabaseAdmin
          .from("tenants")
          .select("codigo_loja")
          .eq("id", tenant_id)
          .single();

        if (tenantError) {
          console.error("Tenant lookup error:", tenantError);
        }

        const codigoLoja = tenantData?.codigo_loja || "000";
        const cleanCode = codigoLoja.replace(/\D/g, "");

        const { count } = await supabaseAdmin
          .from("clients")
          .select("id", { count: "exact", head: true })
          .eq("tenant_id", tenant_id);

        const seq = (count || 0) + 1;
        const seqStr = String(seq).padStart(3, "0");
        const yearSuffix = String(new Date().getFullYear()).slice(-2);
        const numero_orcamento = `${codigoLoja}.${seqStr}.${yearSuffix}`;
        const numero_orcamento_seq = parseInt(`${cleanCode}${seqStr}${yearSuffix}`, 10) || 0;

        const { data: createdClient, error: clientInsertError } = await supabaseAdmin
          .from("clients")
          .insert({
            nome,
            telefone1: telefone,
            email: email || "",
            tenant_id,
            status: "novo",
            origem_lead: origem,
            descricao_ambientes: interesse || "Projeto 3D gratuito",
            quantidade_ambientes: 1,
            numero_orcamento,
            numero_orcamento_seq,
          })
          .select("id")
          .single();

        if (clientInsertError) {
          console.error("Client insert error:", clientInsertError);
        } else {
          clientId = createdClient.id;
        }
      }
    }

    try {
      const { data: existingLead, error: existingLeadError } = await supabaseAdmin
        .from("leads")
        .select("id")
        .eq("telefone", telefone)
        .maybeSingle();

      if (existingLeadError) {
        console.error("Lead lookup error:", existingLeadError);
      }

      // REGRA: Leads na tabela leads também são sempre únicos — nunca sobrescrever
      if (existingLead?.id) {
        leadId = existingLead.id;
        duplicado = true;
        console.log(`[lead-capture] Existing lead found: ${existingLead.id}, NOT overwriting data`);
      } else {
        const { data: newLead, error: leadInsertError } = await supabaseAdmin
          .from("leads")
          .insert({
            nome,
            telefone,
            email: email || "",
            area_atuacao,
            cargo,
            notas: interesse || null,
            status: "novo",
          })
          .select("id, lead_temperature")
          .single();

        if (leadInsertError) {
          console.error("Lead insert error:", leadInsertError);
        } else {
          leadId = newLead.id;
          leadTemperature = (newLead as { lead_temperature?: string | null }).lead_temperature ?? null;
        }
      }
    } catch (leadError) {
      console.error("Lead persistence error:", leadError);
    }

    if (leadId) {
      try {
        const { error: originLogError } = await supabaseAdmin.from("lead_origin_logs").insert({
          lead_id: leadId,
          tenant_id: tenant_id || null,
          origem,
          user_agent: req.headers.get("user-agent") || null,
          referrer: req.headers.get("referer") || null,
        });

        if (originLogError) {
          console.error("Lead origin log error:", originLogError);
        }
      } catch (originError) {
        console.error("Lead origin logging error:", originError);
      }
    }

    if (leadTemperature && leadTemperature !== "frio" && tenant_id) {
      try {
        const { data: addon } = await supabaseAdmin
          .from("vendazap_addon")
          .select("ativo, prompt_sistema, api_provider, openai_model, max_tokens_mensagem")
          .eq("tenant_id", tenant_id)
          .eq("ativo", true)
          .maybeSingle();

        if (addon) {
          await supabaseAdmin.functions.invoke("vendazap-ai", {
            body: {
              nome_cliente: nome,
              tipo_copy: "boas_vindas",
              tom: "amigavel",
              status_negociacao: "novo",
              prompt_sistema: addon.prompt_sistema,
              api_provider: addon.api_provider,
              openai_model: addon.openai_model,
              max_tokens: addon.max_tokens_mensagem,
            },
          });

          if (leadId) {
            await supabaseAdmin
              .from("leads")
              .update({ whatsapp_enviado: true })
              .eq("id", leadId);
          }
        }
      } catch (vendaErr) {
        console.error("VendaZap auto-trigger error:", vendaErr);
      }
    }

    if (!clientId && !leadId) {
      return json({ error: "Erro ao salvar lead" }, 500);
    }

    let attachmentsRegistered = 0;

    if (attachments.length > 0) {
      try {
        const attachmentRows = attachments.map((attachment) => ({
          tenant_id,
          lead_id: leadId,
          client_id: clientId,
          client_name: nome,
          file_name: attachment.file_name,
          file_path: attachment.file_path,
          file_url: attachment.file_url,
          file_size: attachment.file_size,
          file_type: attachment.file_type,
        }));

        const { error: attachmentsError } = await supabaseAdmin
          .from("lead_attachments")
          .insert(attachmentRows);

        if (attachmentsError) {
          console.error("Lead attachments insert error:", attachmentsError);
        } else {
          attachmentsRegistered = attachmentRows.length;
        }
      } catch (attachmentsInsertError) {
        console.error("Lead attachments persistence error:", attachmentsInsertError);
      }
    }

    return json(
      {
        success: true,
        client_id: clientId,
        lead_id: leadId,
        temperature: leadTemperature,
        attachments_received: attachments.length,
        attachments_registered: attachmentsRegistered,
        duplicado,
        message: duplicado ? "Cadastro atualizado com sucesso" : "Cadastro realizado com sucesso",
      },
      duplicado ? 200 : 201,
    );
  } catch (err) {
    console.error("Lead capture error:", err);
    return json({ error: "Erro interno" }, 500);
  }
});
