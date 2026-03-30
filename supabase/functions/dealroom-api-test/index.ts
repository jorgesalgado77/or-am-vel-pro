import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { provider, credenciais, configuracoes } = await req.json();

    if (!provider) {
      return respond({ valid: false, error: "Provider é obrigatório" }, 400);
    }

    let valid = false;
    let error = "";
    let details = "";

    switch (provider) {
      case "openai": {
        const apiKey = credenciais?.api_key;
        if (!apiKey) {
          return respond({ valid: false, error: "API Key não informada" });
        }
        try {
          const res = await fetch("https://api.openai.com/v1/models", {
            headers: { Authorization: `Bearer ${apiKey}` },
          });
          if (res.ok) {
            valid = true;
            details = "Autenticação confirmada";
          } else {
            const body = await res.text();
            error = res.status === 401 ? "API Key inválida ou expirada" : `Erro ${res.status}: ${body.slice(0, 100)}`;
          }
        } catch (e) {
          error = `Erro de rede: ${e.message}`;
        }
        break;
      }

      case "daily": {
        const apiKey = credenciais?.api_key;
        if (!apiKey) {
          return respond({ valid: false, error: "API Key não informada" });
        }
        try {
          const res = await fetch("https://api.daily.co/v1/rooms?limit=1", {
            headers: { Authorization: `Bearer ${apiKey}` },
          });
          if (res.ok) {
            valid = true;
            details = "Autenticação confirmada";
          } else {
            const body = await res.text();
            error = res.status === 401 ? "API Key inválida" : `Erro ${res.status}: ${body.slice(0, 100)}`;
          }
        } catch (e) {
          error = `Erro de rede: ${e.message}`;
        }
        break;
      }

      case "stripe": {
        const secretKey = credenciais?.secret_key;
        if (!secretKey) {
          return respond({ valid: false, error: "Secret Key não informada" });
        }
        try {
          const res = await fetch("https://api.stripe.com/v1/balance", {
            headers: { Authorization: `Bearer ${secretKey}` },
          });
          if (res.ok) {
            valid = true;
            const data = await res.json();
            const available = data.available?.[0];
            details = available ? `Saldo disponível: ${(available.amount / 100).toFixed(2)} ${available.currency?.toUpperCase()}` : "Autenticação confirmada";
          } else {
            const body = await res.text();
            error = res.status === 401 ? "Secret Key inválida" : `Erro ${res.status}: ${body.slice(0, 100)}`;
          }
        } catch (e) {
          error = `Erro de rede: ${e.message}`;
        }
        break;
      }

      case "livekit": {
        const wsUrl = configuracoes?.ws_url;
        const apiKey = credenciais?.api_key;
        if (!apiKey) {
          return respond({ valid: false, error: "API Key não informada" });
        }
        if (!wsUrl) {
          return respond({ valid: false, error: "WebSocket URL não informada" });
        }
        try {
          // Convert wss:// to https:// to check if the server is reachable
          const httpUrl = wsUrl.replace("wss://", "https://").replace("ws://", "http://");
          const res = await fetch(httpUrl, { method: "HEAD" });
          // LiveKit servers return various status codes but being reachable is the key
          if (res.status < 500) {
            valid = true;
            details = `Servidor acessível (${httpUrl})`;
          } else {
            error = `Servidor retornou erro ${res.status}`;
          }
        } catch (e) {
          error = `Servidor inacessível: ${e.message}`;
        }
        break;
      }

      case "twilio_video": {
        const accountSid = credenciais?.account_sid;
        const authToken = credenciais?.auth_token;
        if (!accountSid || !authToken) {
          return respond({ valid: false, error: "Account SID e Auth Token são obrigatórios" });
        }
        try {
          const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${accountSid}.json`, {
            headers: {
              Authorization: "Basic " + btoa(`${accountSid}:${authToken}`),
            },
          });
          if (res.ok) {
            valid = true;
            const data = await res.json();
            details = `Conta: ${data.friendly_name || accountSid}`;
          } else {
            error = res.status === 401 ? "Credenciais inválidas" : `Erro ${res.status}`;
          }
        } catch (e) {
          error = `Erro de rede: ${e.message}`;
        }
        break;
      }

      case "jitsi": {
        // Jitsi public doesn't require auth; just validate fields
        valid = true;
        details = "Campos validados (Jitsi público não requer autenticação)";
        break;
      }

      case "govbr_signature": {
        const baseUrl = configuracoes?.base_url;
        const apiKey = credenciais?.api_key;
        if (!baseUrl && !apiKey) {
          return respond({ valid: false, error: "Preencha ao menos a Base URL ou API Key" });
        }
        if (baseUrl) {
          try {
            const res = await fetch(baseUrl, { method: "HEAD" });
            if (res.status < 500) {
              valid = true;
              details = "Endpoint acessível";
            } else {
              error = `Endpoint retornou erro ${res.status}`;
            }
          } catch (e) {
            error = `Endpoint inacessível: ${e.message}`;
          }
        } else {
          valid = true;
          details = "API Key preenchida (sem URL para testar)";
        }
        break;
      }

      default:
        return respond({ valid: false, error: `Provider "${provider}" não suportado para teste` });
    }

    return respond({ valid, error: error || undefined, details: details || undefined });
  } catch (e) {
    console.error("dealroom-api-test error:", e);
    return respond({ valid: false, error: "Erro interno no teste" }, 500);
  }

  function respond(body: unknown, status = 200) {
    return new Response(JSON.stringify(body), {
      status,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
