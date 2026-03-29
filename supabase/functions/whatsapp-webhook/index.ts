// WhatsApp Webhook — receives inbound messages from Z-API/Evolution and stores in tracking_messages
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const respond = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

const supabaseAdmin = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

function normalizePhone(raw = "") {
  return String(raw).replace(/\D/g, "").replace(/^55(\d{10,11})$/, "$1");
}

function pickTextMessage(body: any, isEvolution: boolean) {
  if (isEvolution) {
    const data = body?.data || {};
    return (
      data.message?.conversation
      || data.message?.extendedTextMessage?.text
      || data.message?.imageMessage?.caption
      || data.message?.videoMessage?.caption
      || data.message?.documentMessage?.caption
      || ""
    );
  }

  if (typeof body?.text === "string") return body.text;
  if (typeof body?.text?.message === "string") return body.text.message;
  if (typeof body?.text?.text === "string") return body.text.text;
  if (typeof body?.message === "string") return body.message;
  if (typeof body?.body === "string") return body.body;
  if (typeof body?.image?.caption === "string") return body.image.caption;
  if (typeof body?.video?.caption === "string") return body.video.caption;
  if (typeof body?.document?.caption === "string") return body.document.caption;
  if (typeof body?.document?.fileName === "string") return body.document.fileName;
  return "";
}

function pickMedia(body: any, isEvolution: boolean): { url: string; type: string; name: string } | null {
  if (isEvolution) return null;

  if (body?.image) {
    return {
      url: body.image.imageUrl || body.image.url || body.image.link || "",
      type: body.image.mimetype || body.image.mimeType || "image",
      name: body.image.caption || "Imagem",
    };
  }

  if (body?.audio) {
    return {
      url: body.audio.audioUrl || body.audio.url || body.audio.link || "",
      type: body.audio.mimetype || body.audio.mimeType || "audio",
      name: "Áudio",
    };
  }

  if (body?.video) {
    return {
      url: body.video.videoUrl || body.video.url || body.video.link || "",
      type: body.video.mimetype || body.video.mimeType || "video",
      name: body.video.caption || "Vídeo",
    };
  }

  if (body?.document) {
    return {
      url: body.document.documentUrl || body.document.url || body.document.link || "",
      type: body.document.mimetype || body.document.mimeType || "document",
      name: body.document.fileName || body.document.caption || "Documento",
    };
  }

  return null;
}

async function findClientByPhone(cleanPhone: string) {
  // Use last 4 digits for broad LIKE match, then filter in code by stripped digits
  const last4 = cleanPhone.slice(-4);
  const last8 = cleanPhone.slice(-8);

  const { data: candidates } = await supabaseAdmin
    .from("clients")
    .select("id, nome, tenant_id, numero_orcamento, telefone1, telefone2")
    .or(`telefone1.like.%${last4},telefone2.like.%${last4}`)
    .limit(50);

  if (!candidates || candidates.length === 0) return null;

  // Strip formatting and compare digit suffixes
  for (const c of candidates) {
    const t1 = (c.telefone1 || "").replace(/\D/g, "");
    const t2 = (c.telefone2 || "").replace(/\D/g, "");
    if (t1.endsWith(last8) || t2.endsWith(last8)) return c;
  }

  // Fallback: try last 4 digits match
  for (const c of candidates) {
    const t1 = (c.telefone1 || "").replace(/\D/g, "");
    const t2 = (c.telefone2 || "").replace(/\D/g, "");
    if (t1.endsWith(last4) || t2.endsWith(last4)) return c;
  }

  return null;
}

async function getTrackingId(client: { id: string; nome: string | null; tenant_id: string | null; numero_orcamento?: string | null }, cleanPhone: string) {
  const { data: tracking } = await supabaseAdmin
    .from("client_tracking")
    .select("id")
    .eq("client_id", client.id)
    .order("updated_at", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (tracking?.id) return tracking.id;

  const { data: created, error } = await supabaseAdmin
    .from("client_tracking")
    .insert({
      client_id: client.id,
      tenant_id: client.tenant_id,
      nome_cliente: client.nome || "Cliente",
      numero_contrato: client.numero_orcamento || `WA-${cleanPhone}`,
      status: "em_negociacao",
      updated_at: new Date().toISOString(),
    } as any)
    .select("id")
    .single();

  if (error) throw error;
  return created.id;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const body = await req.json();
    const isEvolution = Boolean(body?.event && (body?.data || body?.instance));
    const isFromMe = isEvolution
      ? Boolean(body?.data?.key?.fromMe)
      : body?.isFromMe === true || body?.fromMe === true;

    const senderPhone = isEvolution
      ? body?.data?.key?.remoteJid?.replace(/@.*/, "") || ""
      : body?.phone || body?.sender || body?.from || "";

    const cleanPhone = normalizePhone(senderPhone);
    const media = pickMedia(body, isEvolution);
    const messageText = pickTextMessage(body, isEvolution).trim() || media?.name || "[Mensagem recebida]";

    if (!cleanPhone) {
      return respond({ status: "ignored_missing_phone" });
    }

    const client = await findClientByPhone(cleanPhone);
    if (!client) {
      return respond({ status: "no_client_match", phone: cleanPhone });
    }

    const trackingId = await getTrackingId(client, cleanPhone);
    const now = new Date().toISOString();

    const { error: insertError } = await supabaseAdmin
      .from("tracking_messages")
      .insert({
        tracking_id: trackingId,
        tenant_id: client.tenant_id,
        mensagem: messageText,
        remetente_tipo: "cliente",
        remetente_nome: client.nome || "Cliente",
        lida: false,
        created_at: now,
        ...(media?.url
          ? {
              anexo_url: media.url,
              tipo_anexo: media.type,
              anexo_nome: media.name,
            }
          : {}),
      } as any);

    if (insertError) {
      return respond({ status: "insert_error", error: insertError.message }, 500);
    }

    await supabaseAdmin
      .from("client_tracking")
      .update({ updated_at: now } as any)
      .eq("id", trackingId);

    return respond({ status: "ok", tracking_id: trackingId, client_id: client.id });
  } catch (error: any) {
    console.error("whatsapp-webhook error:", error);
    return respond({ error: error?.message || "Erro interno" }, 500);
  }
});