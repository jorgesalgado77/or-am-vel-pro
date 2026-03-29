/**
 * WhatsApp message sender via Z-API or Evolution API.
 * Sends text/media through the connected WhatsApp instance.
 */
import { supabase } from "@/lib/supabaseClient";

interface WhatsAppSettings {
  provider: string;
  zapi_instance_id?: string;
  zapi_token?: string;
  zapi_client_token?: string;
  zapi_security_token?: string;
  evolution_api_url?: string;
  evolution_api_key?: string;
  evolution_instance_name?: string;
}

let cachedSettings: WhatsAppSettings | null = null;
let cacheTimestamp = 0;
const CACHE_TTL = 60_000; // 1 minute

async function getSettings(): Promise<WhatsAppSettings | null> {
  if (cachedSettings && Date.now() - cacheTimestamp < CACHE_TTL) return cachedSettings;

  const { data } = await supabase
    .from("whatsapp_settings")
    .select("*")
    .limit(1)
    .maybeSingle();

  if (!data || !(data as any).ativo) return null;
  cachedSettings = data as any;
  cacheTimestamp = Date.now();
  return cachedSettings;
}

function formatPhone(phone: string): string {
  // Remove non-digits
  const digits = phone.replace(/\D/g, "");
  // Z-API expects: countrycode + number (e.g. 5511999999999)
  return digits;
}

export async function sendWhatsAppText(phone: string, text: string): Promise<boolean> {
  const s = await getSettings();
  if (!s) return false;

  const formattedPhone = formatPhone(phone);
  const maxRetries = 2;

  try {
    if (s.provider === "zapi" && s.zapi_instance_id && s.zapi_token) {
      const url = `https://api.z-api.io/instances/${s.zapi_instance_id}/token/${s.zapi_token}/send-text`;
      const headers: Record<string, string> = {
        "Content-Type": "application/json",
        "Client-Token": s.zapi_client_token || "",
      };
      if (s.zapi_security_token) headers["Security-Token"] = s.zapi_security_token;

      for (let attempt = 0; attempt <= maxRetries; attempt++) {
        try {
          const res = await fetch(url, {
            method: "POST",
            headers,
            body: JSON.stringify({ phone: formattedPhone, message: text }),
          });
          const data = await res.json().catch(() => ({}));
          if (res.ok) return true;
          console.error(`[WA Send] Z-API error (attempt ${attempt + 1}):`, data);
          if (attempt < maxRetries) await new Promise(r => setTimeout(r, 1000 * (attempt + 1)));
        } catch (fetchErr) {
          console.error(`[WA Send] Z-API fetch error (attempt ${attempt + 1}):`, fetchErr);
          if (attempt < maxRetries) await new Promise(r => setTimeout(r, 1000 * (attempt + 1)));
        }
      }
      return false;
    }

    if (s.provider === "evolution" && s.evolution_api_url && s.evolution_api_key) {
      const instanceName = s.evolution_instance_name || "default";
      const url = `${s.evolution_api_url.replace(/\/$/, "")}/message/sendText/${instanceName}`;
      for (let attempt = 0; attempt <= maxRetries; attempt++) {
        try {
          const res = await fetch(url, {
            method: "POST",
            headers: { apikey: s.evolution_api_key, "Content-Type": "application/json" },
            body: JSON.stringify({ number: formattedPhone, text }),
          });
          const data = await res.json().catch(() => ({}));
          if (res.ok) return true;
          console.error(`[WA Send] Evolution error (attempt ${attempt + 1}):`, data);
          if (attempt < maxRetries) await new Promise(r => setTimeout(r, 1000 * (attempt + 1)));
        } catch (fetchErr) {
          console.error(`[WA Send] Evolution fetch error (attempt ${attempt + 1}):`, fetchErr);
          if (attempt < maxRetries) await new Promise(r => setTimeout(r, 1000 * (attempt + 1)));
        }
      }
      return false;
    }
  } catch (err) {
    console.error("[WA Send] Error:", err);
  }

  return false;
}

export async function sendWhatsAppMedia(
  phone: string,
  mediaUrl: string,
  caption?: string,
  mimeType?: string,
): Promise<boolean> {
  const s = await getSettings();
  if (!s) return false;

  const formattedPhone = formatPhone(phone);
  const isImage = mimeType?.startsWith("image/");
  const isAudio = mimeType?.startsWith("audio/");
  const isVideo = mimeType?.startsWith("video/");

  try {
    if (s.provider === "zapi" && s.zapi_instance_id && s.zapi_token) {
      const baseUrl = `https://api.z-api.io/instances/${s.zapi_instance_id}/token/${s.zapi_token}`;
      const headers: Record<string, string> = {
        "Content-Type": "application/json",
        "Client-Token": s.zapi_client_token || "",
      };
      if (s.zapi_security_token) headers["Security-Token"] = s.zapi_security_token;

      let endpoint = "send-document";
      if (isImage) endpoint = "send-image";
      else if (isAudio) endpoint = "send-audio";
      else if (isVideo) endpoint = "send-video";

      const body: any = { phone: formattedPhone };
      if (isImage) {
        body.image = mediaUrl;
        body.caption = caption || "";
      } else if (isAudio) {
        body.audio = mediaUrl;
      } else if (isVideo) {
        body.video = mediaUrl;
        body.caption = caption || "";
      } else {
        body.document = mediaUrl;
        body.fileName = caption || "arquivo";
      }

      const res = await fetch(`${baseUrl}/${endpoint}`, {
        method: "POST",
        headers,
        body: JSON.stringify(body),
      });
      return res.ok;
    }

    if (s.provider === "evolution" && s.evolution_api_url && s.evolution_api_key) {
      const instanceName = s.evolution_instance_name || "default";
      const endpoint = isAudio ? "sendWhatsAppAudio" : "sendMedia";
      const url = `${s.evolution_api_url.replace(/\/$/, "")}/message/${endpoint}/${instanceName}`;
      const body: any = {
        number: formattedPhone,
        mediatype: isImage ? "image" : isAudio ? "audio" : isVideo ? "video" : "document",
        media: mediaUrl,
        caption: caption || "",
      };
      const res = await fetch(url, {
        method: "POST",
        headers: { apikey: s.evolution_api_key, "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      return res.ok;
    }
  } catch (err) {
    console.error("[WA Send Media] Error:", err);
  }

  return false;
}

export function clearSettingsCache() {
  cachedSettings = null;
  cacheTimestamp = 0;
}
