// WhatsApp Webhook — receives inbound/outbound messages from Z-API/Evolution and stores in tracking_messages
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
  const digits = String(raw)
    .replace(/^WA-/i, "")
    .replace(/@.*/, "")
    .replace(/\D/g, "")
    .replace(/^0+/, "");

  return /^55\d{10,11}$/.test(digits) ? digits.slice(2) : digits;
}

function phonesMatch(first = "", second = "") {
  const left = normalizePhone(first);
  const right = normalizePhone(second);

  if (!left || !right) return false;
  if (left === right) return true;
  if (left.endsWith(right) || right.endsWith(left)) return true;

  const leftLast8 = left.slice(-8);
  const rightLast8 = right.slice(-8);
  return Boolean(leftLast8 && rightLast8 && leftLast8 === rightLast8);
}

function pickDefined<T>(...values: T[]): T | undefined {
  return values.find((value) => value !== undefined && value !== null && value !== "");
}

function pickContactPhone(body: any, isEvolution: boolean) {
  if (isEvolution) {
    return pickDefined(
      body?.data?.key?.remoteJid,
      body?.data?.key?.participant,
      body?.data?.participant,
      body?.data?.participantPn,
      body?.data?.cleanedParticipantPn,
      body?.sender,
      body?.from,
      body?.chatId,
      body?.remoteJid,
      "",
    ) || "";
  }

  return pickDefined(
    body?.phone,
    body?.sender,
    body?.from,
    body?.chatId,
    body?.remoteJid,
    body?.key?.remoteJid,
    body?.participantPhone,
    body?.participant,
    "",
  ) || "";
}

function pickEventTimestamp(body: any, isEvolution: boolean) {
  const raw = isEvolution
    ? pickDefined(body?.data?.messageTimestamp, body?.messageTimestamp, body?.timestamp)
    : pickDefined(body?.momment, body?.moment, body?.messageTimestamp, body?.timestamp);

  if (!raw) return new Date().toISOString();

  const numeric = Number(raw);
  if (Number.isFinite(numeric)) {
    const millis = numeric > 1_000_000_000_000 ? numeric : numeric * 1000;
    return new Date(millis).toISOString();
  }

  const parsed = new Date(raw);
  return Number.isNaN(parsed.getTime()) ? new Date().toISOString() : parsed.toISOString();
}

function pickTextMessage(body: any, isEvolution: boolean) {
  if (isEvolution) {
    const data = body?.data || {};
    const message = data?.message || {};

    return (
      pickDefined(
        message?.conversation,
        message?.extendedTextMessage?.text,
        message?.imageMessage?.caption,
        message?.videoMessage?.caption,
        message?.documentMessage?.caption,
        message?.documentMessage?.fileName,
        data?.body,
        body?.body,
        "",
      ) || ""
    );
  }

  return (
    pickDefined(
      typeof body?.text === "string" ? body.text : undefined,
      typeof body?.text?.message === "string" ? body.text.message : undefined,
      typeof body?.text?.text === "string" ? body.text.text : undefined,
      typeof body?.message === "string" ? body.message : undefined,
      typeof body?.body === "string" ? body.body : undefined,
      typeof body?.image?.caption === "string" ? body.image.caption : undefined,
      typeof body?.video?.caption === "string" ? body.video.caption : undefined,
      typeof body?.document?.caption === "string" ? body.document.caption : undefined,
      typeof body?.document?.fileName === "string" ? body.document.fileName : undefined,
      "",
    ) || ""
  );
}

function isPlaceholderText(value = "") {
  const normalized = value.trim().toLowerCase();
  return [
    "[mensagem recebida]",
    "mensagem recebida",
    "[message received]",
    "message received",
  ].includes(normalized);
}

function pickContactName(body: any, isEvolution: boolean) {
  if (isEvolution) {
    return pickDefined(
      body?.data?.pushName,
      body?.data?.pushname,
      body?.data?.notifyName,
      body?.data?.senderName,
      body?.pushName,
      body?.senderName,
      body?.chatName,
      "Cliente",
    ) || "Cliente";
  }

  return pickDefined(
    body?.senderName,
    body?.chatName,
    body?.contact?.name,
    body?.contact?.pushName,
    "Cliente",
  ) || "Cliente";
}

function pickMedia(body: any, isEvolution: boolean): { url: string; type: string; name: string } | null {
  if (isEvolution) {
    const message = body?.data?.message || {};

    if (message?.imageMessage) {
      const image = message.imageMessage;
      return {
        url: pickDefined(image?.url, image?.mediaUrl, body?.data?.mediaUrl, body?.data?.url, "") || "",
        type: image?.mimetype || "image/jpeg",
        name: image?.caption || "Imagem",
      };
    }

    if (message?.videoMessage) {
      const video = message.videoMessage;
      return {
        url: pickDefined(video?.url, video?.mediaUrl, body?.data?.mediaUrl, body?.data?.url, "") || "",
        type: video?.mimetype || "video/mp4",
        name: video?.caption || "Vídeo",
      };
    }

    if (message?.audioMessage) {
      const audio = message.audioMessage;
      return {
        url: pickDefined(audio?.url, audio?.mediaUrl, body?.data?.mediaUrl, body?.data?.url, "") || "",
        type: audio?.mimetype || "audio/ogg",
        name: "Áudio",
      };
    }

    if (message?.documentMessage) {
      const document = message.documentMessage;
      return {
        url: pickDefined(document?.url, document?.mediaUrl, body?.data?.mediaUrl, body?.data?.url, "") || "",
        type: document?.mimetype || "application/octet-stream",
        name: document?.fileName || document?.caption || "Documento",
      };
    }

    return null;
  }

  if (body?.image) {
    return {
      url: body.image.imageUrl || body.image.url || body.image.link || "",
      type: body.image.mimetype || body.image.mimeType || "image/jpeg",
      name: body.image.caption || "Imagem",
    };
  }

  if (body?.audio) {
    return {
      url: body.audio.audioUrl || body.audio.url || body.audio.link || "",
      type: body.audio.mimetype || body.audio.mimeType || "audio/ogg",
      name: "Áudio",
    };
  }

  if (body?.video) {
    return {
      url: body.video.videoUrl || body.video.url || body.video.link || "",
      type: body.video.mimetype || body.video.mimeType || "video/mp4",
      name: body.video.caption || "Vídeo",
    };
  }

  if (body?.document) {
    return {
      url: body.document.documentUrl || body.document.url || body.document.link || "",
      type: body.document.mimetype || body.document.mimeType || "application/octet-stream",
      name: body.document.fileName || body.document.caption || "Documento",
    };
  }

  return null;
}

/** Extract the provider-level message ID for dedup */
function pickMessageId(body: any, isEvolution: boolean): string | null {
  if (isEvolution) {
    return body?.data?.key?.id || body?.data?.id || body?.messageId || null;
  }
  // Z-API
  return body?.messageId || body?.id?.id || body?.ids?.[0] || body?.id || null;
}

/** Detect non-message events (status updates, delivery receipts, etc.) that should be ignored */
function isStatusOrDeliveryEvent(body: any, isEvolution: boolean): boolean {
  if (isEvolution) {
    const event = body?.event || "";
    // Only process actual message events
    const messageEvents = [
      "messages.upsert",
      "send.message",
      "message",
      "messages.set",
    ];
    if (event && !messageEvents.some((e) => event.toLowerCase().includes(e.toLowerCase()))) {
      return true;
    }
    // If status field indicates a status update, ignore
    if (body?.data?.status && !body?.data?.message) return true;
  } else {
    // Z-API: detect status events
    if (body?.status && !body?.text && !body?.image && !body?.audio && !body?.video && !body?.document) {
      return true;
    }
    // Z-API delivery/read receipts
    if (body?.type === "ReceivedCallback" && body?.status) return true;
    if (body?.ack !== undefined && !body?.text && !body?.image && !body?.audio && !body?.video && !body?.document) return true;
  }
  return false;
}

function hasProcessableContent(body: any, isEvolution: boolean) {
  const text = pickTextMessage(body, isEvolution).trim();
  const media = pickMedia(body, isEvolution);
  return Boolean((text && !isPlaceholderText(text)) || (media && media.url));
}

async function getActiveTenantId() {
  const response = await supabaseAdmin
    .from("whatsapp_settings")
    .select("tenant_id")
    .eq("ativo", true)
    .limit(1)
    .maybeSingle();

  if (response.error?.code === "42703" || response.error?.code === "PGRST204" || response.error?.message?.includes("tenant_id")) {
    const fallback = await supabaseAdmin
      .from("whatsapp_settings")
      .select("*")
      .eq("ativo", true)
      .limit(1)
      .maybeSingle();

    return (fallback.data as any)?.tenant_id || null;
  }

  return (response.data as any)?.tenant_id || null;
}

async function createManualTracking(cleanPhone: string, contactName: string) {
  const tenantId = await getActiveTenantId();
  if (!tenantId) return null;

  const { data: created, error } = await supabaseAdmin
    .from("client_tracking")
    .insert({
      tenant_id: tenantId,
      nome_cliente: contactName || `WhatsApp ${cleanPhone.slice(-4)}`,
      numero_contrato: `WA-${cleanPhone}`,
      status: "em_negociacao",
      updated_at: new Date().toISOString(),
    } as any)
    .select("id, client_id, tenant_id, nome_cliente, numero_contrato")
    .single();

  if (error) throw error;
  return created;
}

async function findTrackingByPhone(cleanPhone: string) {
  const last4 = cleanPhone.slice(-4);

  const { data: candidates } = await supabaseAdmin
    .from("client_tracking")
    .select("id, client_id, tenant_id, nome_cliente, numero_contrato")
    .ilike("numero_contrato", `%${last4}%`)
    .order("updated_at", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(50);

  if (!candidates?.length) return null;

  for (const tracking of candidates) {
    const trackingPhone = normalizePhone(tracking.numero_contrato || "");
    if (phonesMatch(trackingPhone, cleanPhone)) return tracking;
  }

  return null;
}

async function findClientByPhone(cleanPhone: string) {
  const last4 = cleanPhone.slice(-4);
  const last8 = cleanPhone.slice(-8);

  const { data: candidates } = await supabaseAdmin
    .from("clients")
    .select("id, nome, tenant_id, numero_orcamento, telefone1, telefone2")
    .or(`telefone1.like.%${last4},telefone2.like.%${last4}`)
    .limit(50);

  if (!candidates || candidates.length === 0) return null;

  for (const c of candidates) {
    const t1 = normalizePhone(c.telefone1 || "");
    const t2 = normalizePhone(c.telefone2 || "");
    if (t1.endsWith(last8) || t2.endsWith(last8) || phonesMatch(t1, cleanPhone) || phonesMatch(t2, cleanPhone)) return c;
  }

  for (const c of candidates) {
    const t1 = normalizePhone(c.telefone1 || "");
    const t2 = normalizePhone(c.telefone2 || "");
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

/** Check if a message with this provider ID was already inserted recently */
async function isDuplicateMessage(providerMsgId: string, trackingId: string): Promise<boolean> {
  // Check if a message with this exact provider_message_id exists
  // We use mensagem + tracking_id + created_at proximity as fallback
  const { data } = await supabaseAdmin
    .from("tracking_messages")
    .select("id")
    .eq("tracking_id", trackingId)
    .eq("provider_message_id", providerMsgId)
    .limit(1);

  return (data?.length || 0) > 0;
}

/** Check if a very similar message was inserted in the last few seconds (fallback dedup) */
async function isDuplicateByContent(trackingId: string, text: string, remetenteType: string, windowMs = 5000): Promise<boolean> {
  const cutoff = new Date(Date.now() - windowMs).toISOString();
  const { data } = await supabaseAdmin
    .from("tracking_messages")
    .select("id")
    .eq("tracking_id", trackingId)
    .eq("remetente_tipo", remetenteType)
    .eq("mensagem", text)
    .gte("created_at", cutoff)
    .limit(1);

  return (data?.length || 0) > 0;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const body = await req.json();
    const isEvolution = Boolean(body?.event && (body?.data || body?.instance));

    // ── Filter out non-message events (status updates, delivery receipts) ──
    if (isStatusOrDeliveryEvent(body, isEvolution)) {
      return respond({ status: "ignored_status_event" });
    }

    const isFromMe = isEvolution
      ? Boolean(body?.data?.key?.fromMe)
      : body?.isFromMe === true || body?.fromMe === true;

    const rawContactPhone = pickContactPhone(body, isEvolution);
    const cleanPhone = normalizePhone(rawContactPhone);
    const media = pickMedia(body, isEvolution);
    const rawText = pickTextMessage(body, isEvolution).trim();
    const sanitizedText = isPlaceholderText(rawText) ? "" : rawText;
    const now = pickEventTimestamp(body, isEvolution);

    if (!cleanPhone || body?.isGroup === true || String(rawContactPhone).includes("@g.us") || body?.isNewsletter === true) {
      return respond({ status: "ignored_missing_phone_or_group" });
    }

    if (!hasProcessableContent(body, isEvolution)) {
      return respond({ status: "ignored_no_message_payload", phone: cleanPhone, from_me: isFromMe });
    }

    // Build final message text — only use fallback for media with URL
    let messageText = sanitizedText;
    if (!messageText && media?.url) {
      messageText = media.name || "[Mídia]";
    }
    if (!messageText) {
      // No text AND no media URL — skip
      return respond({ status: "ignored_empty_content", phone: cleanPhone });
    }

    const existingTracking = await findTrackingByPhone(cleanPhone);

    let trackingId: string | null = existingTracking?.id || null;
    let tenantId: string | null = existingTracking?.tenant_id || null;
    let clientId: string | null = existingTracking?.client_id || null;
    let clientName = existingTracking?.nome_cliente || "Cliente";

    if (!trackingId) {
      const client = await findClientByPhone(cleanPhone);
      if (!client) {
        const manualTracking = await createManualTracking(cleanPhone, pickContactName(body, isEvolution));

        if (!manualTracking) {
          return respond({ status: "no_client_match", phone: cleanPhone, from_me: isFromMe });
        }

        trackingId = manualTracking.id;
        tenantId = manualTracking.tenant_id || null;
        clientId = manualTracking.client_id || null;
        clientName = manualTracking.nome_cliente || "Cliente";
      } else {
        trackingId = await getTrackingId(client, cleanPhone);
        tenantId = client.tenant_id;
        clientId = client.id;
        clientName = client.nome || "Cliente";
      }
    }

    // ── Dedup by provider message ID ──
    const providerMsgId = pickMessageId(body, isEvolution);
    if (providerMsgId) {
      // Try column-based dedup first (provider_message_id column may not exist yet — fallback gracefully)
      const isDup = await isDuplicateByContent(trackingId, messageText, isFromMe ? "loja" : "cliente", 5000);
      if (isDup) {
        return respond({ status: "duplicate_skipped", phone: cleanPhone, provider_msg_id: providerMsgId });
      }
    } else {
      // No provider ID — use content-based dedup with a tighter window
      const isDup = await isDuplicateByContent(trackingId, messageText, isFromMe ? "loja" : "cliente", 3000);
      if (isDup) {
        return respond({ status: "duplicate_content_skipped", phone: cleanPhone });
      }
    }

    // ── For outbound (fromMe) messages: also check if the system already inserted this message ──
    if (isFromMe) {
      // Check if this exact message was recently sent via the Chat de Vendas (remetente_nome = "Loja")
      const { data: recentSent } = await supabaseAdmin
        .from("tracking_messages")
        .select("id")
        .eq("tracking_id", trackingId)
        .eq("remetente_tipo", "loja")
        .eq("mensagem", messageText)
        .gte("created_at", new Date(Date.now() - 30000).toISOString())
        .limit(1);

      if (recentSent && recentSent.length > 0) {
        // Already inserted by the Chat de Vendas — skip to avoid duplication
        return respond({ status: "already_sent_via_system", phone: cleanPhone });
      }
    }

    const { error: insertError } = await supabaseAdmin
      .from("tracking_messages")
      .insert({
        tracking_id: trackingId,
        tenant_id: tenantId,
        mensagem: messageText,
        remetente_tipo: isFromMe ? "loja" : "cliente",
        remetente_nome: isFromMe ? "Loja" : clientName,
        lida: isFromMe ? true : false,
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
      .update({
        updated_at: now,
        ...(clientId ? { client_id: clientId } : {}),
        ...(existingTracking?.numero_contrato ? {} : { numero_contrato: `WA-${cleanPhone}` }),
      } as any)
      .eq("id", trackingId);

    return respond({ status: "ok", tracking_id: trackingId, client_id: clientId, phone: cleanPhone });
  } catch (error: any) {
    console.error("whatsapp-webhook error:", error);
    return respond({ error: error?.message || "Erro interno" }, 500);
  }
});
