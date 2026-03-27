import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// Web Push crypto helpers
async function generatePushHeaders(
  endpoint: string,
  vapidPublic: string,
  vapidPrivate: string,
  sub: string,
) {
  // Import VAPID private key
  const privateKeyBytes = base64urlDecode(vapidPrivate);
  const publicKeyBytes = base64urlDecode(vapidPublic);

  const audience = new URL(endpoint).origin;
  const expiry = Math.floor(Date.now() / 1000) + 12 * 3600;

  // Create JWT for VAPID
  const header = base64urlEncode(JSON.stringify({ typ: "JWT", alg: "ES256" }));
  const payload = base64urlEncode(
    JSON.stringify({ aud: audience, exp: expiry, sub }),
  );
  const unsignedToken = `${header}.${payload}`;

  // Import key and sign
  const key = await crypto.subtle.importKey(
    "pkcs8",
    convertECPrivateKeyToPKCS8(privateKeyBytes, publicKeyBytes),
    { name: "ECDSA", namedCurve: "P-256" },
    false,
    ["sign"],
  );

  const signature = await crypto.subtle.sign(
    { name: "ECDSA", hash: "SHA-256" },
    key,
    new TextEncoder().encode(unsignedToken),
  );

  // Convert DER signature to raw r||s
  const sig = new Uint8Array(signature);
  const rawSig = derToRaw(sig);
  const token = `${unsignedToken}.${base64urlEncode(rawSig)}`;

  return {
    Authorization: `vapid t=${token}, k=${vapidPublic}`,
    "Content-Type": "application/octet-stream",
    TTL: "86400",
  };
}

function base64urlDecode(str: string): Uint8Array {
  const padding = "=".repeat((4 - (str.length % 4)) % 4);
  const base64 = (str + padding).replace(/-/g, "+").replace(/_/g, "/");
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

function base64urlEncode(data: string | Uint8Array): string {
  let binary: string;
  if (typeof data === "string") {
    binary = btoa(data);
  } else {
    binary = btoa(String.fromCharCode(...data));
  }
  return binary.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function convertECPrivateKeyToPKCS8(
  privateKey: Uint8Array,
  publicKey: Uint8Array,
): ArrayBuffer {
  // Construct PKCS8 DER for EC P-256
  const pkcs8Header = new Uint8Array([
    0x30, 0x81, 0x87, 0x02, 0x01, 0x00, 0x30, 0x13, 0x06, 0x07, 0x2a, 0x86,
    0x48, 0xce, 0x3d, 0x02, 0x01, 0x06, 0x08, 0x2a, 0x86, 0x48, 0xce, 0x3d,
    0x03, 0x01, 0x07, 0x04, 0x6d, 0x30, 0x6b, 0x02, 0x01, 0x01, 0x04, 0x20,
  ]);

  const publicKeyPrefix = new Uint8Array([0xa1, 0x44, 0x03, 0x42, 0x00]);

  // Ensure public key has 0x04 prefix (uncompressed)
  let fullPublicKey: Uint8Array;
  if (publicKey[0] !== 0x04) {
    fullPublicKey = new Uint8Array(65);
    fullPublicKey[0] = 0x04;
    fullPublicKey.set(publicKey, 1);
  } else {
    fullPublicKey = publicKey;
  }

  const result = new Uint8Array(
    pkcs8Header.length +
      privateKey.length +
      publicKeyPrefix.length +
      fullPublicKey.length,
  );
  let offset = 0;
  result.set(pkcs8Header, offset);
  offset += pkcs8Header.length;
  result.set(privateKey, offset);
  offset += privateKey.length;
  result.set(publicKeyPrefix, offset);
  offset += publicKeyPrefix.length;
  result.set(fullPublicKey, offset);

  return result.buffer;
}

function derToRaw(der: Uint8Array): Uint8Array {
  // If already 64 bytes, it's raw
  if (der.length === 64) return der;

  const raw = new Uint8Array(64);
  // DER: 0x30 <len> 0x02 <rLen> <r> 0x02 <sLen> <s>
  let offset = 2;
  // skip 0x30 and total length

  // R
  const rLen = der[offset + 1];
  offset += 2;
  const rStart = rLen > 32 ? offset + (rLen - 32) : offset;
  const rDest = rLen < 32 ? 32 - rLen : 0;
  raw.set(der.slice(rStart, offset + rLen), rDest);
  offset += rLen;

  // S
  const sLen = der[offset + 1];
  offset += 2;
  const sStart = sLen > 32 ? offset + (sLen - 32) : offset;
  const sDest = sLen < 32 ? 64 - sLen : 32;
  raw.set(der.slice(sStart, offset + sLen), sDest);

  return raw;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const body = await req.json();
    const { action } = body;

    // === SUBSCRIBE ===
    if (action === "subscribe") {
      const { tenant_id, user_id, subscription } = body;
      if (!tenant_id || !user_id || !subscription) {
        return new Response(
          JSON.stringify({ error: "Missing fields" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }

      // Upsert subscription
      const { error } = await supabase
        .from("push_subscriptions")
        .upsert(
          {
            tenant_id,
            user_id,
            endpoint: subscription.endpoint,
            p256dh: subscription.keys?.p256dh,
            auth: subscription.keys?.auth,
            is_active: true,
          },
          { onConflict: "user_id,endpoint" },
        );

      if (error) throw error;

      return new Response(
        JSON.stringify({ success: true }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // === UNSUBSCRIBE ===
    if (action === "unsubscribe") {
      const { user_id } = body;
      await supabase
        .from("push_subscriptions")
        .update({ is_active: false })
        .eq("user_id", user_id);

      return new Response(
        JSON.stringify({ success: true }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // === SEND PUSH ===
    if (action === "send") {
      const { user_id, title, body: msgBody, tag, url } = body;
      if (!user_id || !title) {
        return new Response(
          JSON.stringify({ error: "Missing user_id or title" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }

      const { data: subs } = await supabase
        .from("push_subscriptions")
        .select("*")
        .eq("user_id", user_id)
        .eq("is_active", true);

      if (!subs || subs.length === 0) {
        return new Response(
          JSON.stringify({ sent: 0 }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }

      const vapidPublic = Deno.env.get("VAPID_PUBLIC_KEY")!;
      const vapidPrivate = Deno.env.get("VAPID_PRIVATE_KEY")!;
      const vapidSub = "mailto:suporte@orcamovelpro.com";

      const payload = JSON.stringify({ title, body: msgBody, tag, url });
      let sent = 0;

      for (const sub of subs) {
        try {
          const headers = await generatePushHeaders(
            sub.endpoint,
            vapidPublic,
            vapidPrivate,
            vapidSub,
          );

          const res = await fetch(sub.endpoint, {
            method: "POST",
            headers: { ...headers },
            body: new TextEncoder().encode(payload),
          });

          if (res.status === 201 || res.status === 200) {
            sent++;
          } else if (res.status === 410 || res.status === 404) {
            // Subscription expired, deactivate
            await supabase
              .from("push_subscriptions")
              .update({ is_active: false })
              .eq("id", sub.id);
          }
        } catch (e) {
          console.error("Push send error:", e);
        }
      }

      // Log the notification
      try {
        const tenantId = subs[0]?.tenant_id;
        await supabase.from("push_notification_logs").insert({
          tenant_id: tenantId,
          user_id,
          title,
          body: msgBody || "",
          tag: tag || "default",
          status: sent > 0 ? "sent" : "failed",
        });
      } catch (_e) {
        // Table may not exist yet
      }

      return new Response(
        JSON.stringify({ sent }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    return new Response(
      JSON.stringify({ error: "Unknown action" }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err) {
    console.error("Push function error:", err);
    return new Response(
      JSON.stringify({ error: err.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
