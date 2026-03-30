/**
 * useWhatsAppConnection — WhatsApp connection status hook + status badge.
 * Extracted from VendaZapChat.tsx.
 */
import { useState, useEffect, useRef } from "react";
import { supabase } from "@/lib/supabaseClient";
import { Badge } from "@/components/ui/badge";
import { Wifi, WifiOff, Loader2 } from "lucide-react";

export type WhatsAppConnectionStatus = "checking" | "online" | "offline" | "not_configured";

export function useWhatsAppConnectionStatus(tenantId: string | null) {
  const [status, setStatus] = useState<WhatsAppConnectionStatus>("checking");
  const [provider, setProvider] = useState<string | null>(null);
  const syncedWebhookRef = useRef<string | null>(null);

  useEffect(() => {
    if (!tenantId) { setStatus("not_configured"); return; }

    const checkConnection = async () => {
      setStatus("checking");

      let response = await supabase
        .from("whatsapp_settings")
        .select("*")
        .eq("tenant_id", tenantId)
        .limit(1)
        .maybeSingle();

      if (response.error?.code === "42703" || response.error?.code === "PGRST204") {
        response = await supabase
          .from("whatsapp_settings")
          .select("*")
          .limit(1)
          .maybeSingle();
      }

      const settings = response.data as any;

      if (!settings || !settings.ativo) {
        setStatus("not_configured");
        return;
      }

      const defaultWebhookUrl = "https://bdhfzjuwtkiexyeusnqq.supabase.co/functions/v1/whatsapp-webhook";
      if (!settings.zapi_webhook_url || settings.zapi_webhook_url.includes("whatsapp-bot")) {
        const correctedUrl = (settings.zapi_webhook_url || defaultWebhookUrl).replace("whatsapp-bot", "whatsapp-webhook");
        settings.zapi_webhook_url = correctedUrl;
        await supabase
          .from("whatsapp_settings")
          .update({ zapi_webhook_url: correctedUrl } as any)
          .eq("id", settings.id);
        console.log("[WhatsApp] Auto-corrected webhook URL on chat open:", correctedUrl);
      }

      setProvider(settings.provider);

      if (settings.provider === "zapi" && settings.zapi_instance_id && settings.zapi_token && settings.zapi_client_token) {
        try {
          if (settings.zapi_webhook_url) {
            const webhookUrl = settings.zapi_webhook_url.includes("whatsapp-bot")
              ? settings.zapi_webhook_url.replace("whatsapp-bot", "whatsapp-webhook")
              : settings.zapi_webhook_url;
            
            const syncKey = `${settings.zapi_instance_id}:${webhookUrl}`;
            if (syncedWebhookRef.current !== syncKey) {
              const headers = {
                "Content-Type": "application/json",
                "Client-Token": settings.zapi_client_token,
                ...(settings.zapi_security_token ? { "Security-Token": settings.zapi_security_token } : {}),
              };

              const baseUrl = `https://api.z-api.io/instances/${settings.zapi_instance_id}/token/${settings.zapi_token}`;

              const [receivedRes, deliveryRes, notifyRes] = await Promise.all([
                fetch(`${baseUrl}/update-webhook-received`, { method: "PUT", headers, body: JSON.stringify({ value: webhookUrl }) }),
                fetch(`${baseUrl}/update-webhook-received-delivery`, { method: "PUT", headers, body: JSON.stringify({ value: webhookUrl }) }),
                fetch(`${baseUrl}/update-notify-sent-by-me`, { method: "PUT", headers, body: JSON.stringify({ notifySentByMe: true }) }),
              ]);

              console.log("[WhatsApp] Webhook sync:", { received: receivedRes.ok, delivery: deliveryRes.ok, notify: notifyRes.ok, url: webhookUrl });

              if (receivedRes.ok && deliveryRes.ok && notifyRes.ok) {
                syncedWebhookRef.current = syncKey;
              }
            }
          }

          const res = await fetch(
            `https://api.z-api.io/instances/${settings.zapi_instance_id}/token/${settings.zapi_token}/status`,
            {
              headers: {
                "Client-Token": settings.zapi_client_token,
                ...(settings.zapi_security_token ? { "Security-Token": settings.zapi_security_token } : {}),
              },
            }
          );
          const data = await res.json().catch(() => null);
          const connected = data?.connected === true || data?.smartphoneConnected === true || (typeof data?.error === "string" && data.error.toLowerCase().includes("already connected"));
          setStatus(connected ? "online" : "offline");
        } catch {
          setStatus("offline");
        }
      } else if (settings.provider === "evolution" && settings.evolution_api_url && settings.evolution_api_key) {
        try {
          const instanceName = settings.evolution_instance_name || "default";
          const res = await fetch(
            `${settings.evolution_api_url.replace(/\/$/, "")}/instance/connectionState/${instanceName}`,
            { headers: { apikey: settings.evolution_api_key } }
          );
          const data = await res.json().catch(() => null);
          const state = data?.instance?.state || data?.state || "";
          setStatus(state === "open" || state === "connected" ? "online" : "offline");
        } catch {
          setStatus("offline");
        }
      } else {
        setStatus("not_configured");
      }
    };

    checkConnection();
    const interval = setInterval(checkConnection, 60000);
    return () => clearInterval(interval);
  }, [tenantId]);

  return { status, provider };
}

export function WhatsAppStatusTag({ status, provider }: { status: WhatsAppConnectionStatus; provider: string | null }) {
  if (status === "checking") {
    return (
      <Badge variant="outline" className="gap-1.5 text-[10px] px-2 py-0.5 border-muted-foreground/30 text-muted-foreground animate-pulse">
        <Loader2 className="h-3 w-3 animate-spin" />
        Verificando...
      </Badge>
    );
  }
  if (status === "online") {
    const label = provider === "zapi" ? "Z-API Online" : provider === "evolution" ? "Evolution Online" : "WhatsApp Online";
    return (
      <Badge className="gap-1.5 text-[10px] px-2 py-0.5 bg-emerald-500/15 text-emerald-700 border border-emerald-500/30 hover:bg-emerald-500/20">
        <Wifi className="h-3 w-3" />
        {label}
      </Badge>
    );
  }
  if (status === "offline") {
    const label = provider === "zapi" ? "Z-API Offline" : provider === "evolution" ? "Evolution Offline" : "WhatsApp Offline";
    return (
      <Badge variant="destructive" className="gap-1.5 text-[10px] px-2 py-0.5">
        <WifiOff className="h-3 w-3" />
        {label}
      </Badge>
    );
  }
  return (
    <Badge variant="outline" className="gap-1.5 text-[10px] px-2 py-0.5 text-muted-foreground">
      <WifiOff className="h-3 w-3" />
      Não configurado
    </Badge>
  );
}
