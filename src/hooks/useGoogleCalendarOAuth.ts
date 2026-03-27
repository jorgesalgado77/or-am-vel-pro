import { useCallback, useState, useEffect } from "react";
import { supabase } from "@/lib/supabaseClient";
import { toast } from "sonner";

interface OAuthStatus {
  connected: boolean;
  google_email?: string;
  expires_at?: string;
}

export function useGoogleCalendarOAuth(tenantId: string | null, userId?: string) {
  const [status, setStatus] = useState<OAuthStatus>({ connected: false });
  const [loading, setLoading] = useState(false);
  const [checking, setChecking] = useState(true);

  const checkStatus = useCallback(async () => {
    if (!tenantId || !userId) { setChecking(false); return; }
    setChecking(true);
    try {
      const { data, error } = await supabase.functions.invoke("google-calendar-auth", {
        body: { action: "getStatus", tenant_id: tenantId, user_id: userId },
      });
      if (!error && data) {
        setStatus(data);
      }
    } catch (_e) { /* silent */ }
    setChecking(false);
  }, [tenantId, userId]);

  useEffect(() => { checkStatus(); }, [checkStatus]);

  const startOAuth = useCallback(async () => {
    if (!tenantId || !userId) return;
    setLoading(true);
    try {
      const redirectUri = `${window.location.origin}/app?gcal_callback=1`;

      const { data, error } = await supabase.functions.invoke("google-calendar-auth", {
        body: {
          action: "getAuthUrl",
          tenant_id: tenantId,
          user_id: userId,
          redirect_uri: redirectUri,
        },
      });

      if (error || data?.error) {
        toast.error(data?.error || "Erro ao iniciar autenticação Google");
        setLoading(false);
        return;
      }

      if (data?.url) {
        // Store state for callback
        sessionStorage.setItem("gcal_oauth_state", JSON.stringify({ tenantId, userId, redirectUri }));
        window.location.href = data.url;
      }
    } catch (err) {
      console.error("OAuth start error:", err);
      toast.error("Erro ao conectar com Google Calendar");
    }
    setLoading(false);
  }, [tenantId, userId]);

  const handleCallback = useCallback(async (code: string) => {
    const stateStr = sessionStorage.getItem("gcal_oauth_state");
    if (!stateStr) return false;

    const state = JSON.parse(stateStr);
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("google-calendar-auth", {
        body: {
          action: "handleCallback",
          tenant_id: state.tenantId,
          user_id: state.userId,
          code,
          redirect_uri: state.redirectUri,
        },
      });

      sessionStorage.removeItem("gcal_oauth_state");

      if (error || data?.error) {
        toast.error(data?.error || "Erro ao finalizar autenticação");
        setLoading(false);
        return false;
      }

      toast.success(`✅ Google Calendar conectado! (${data?.google_email || ""})`);
      setStatus({ connected: true, google_email: data?.google_email });
      setLoading(false);
      return true;
    } catch (err) {
      console.error("OAuth callback error:", err);
      toast.error("Erro ao processar callback");
      setLoading(false);
      return false;
    }
  }, []);

  const disconnect = useCallback(async () => {
    if (!tenantId || !userId) return;
    setLoading(true);
    try {
      await supabase.functions.invoke("google-calendar-auth", {
        body: { action: "disconnect", tenant_id: tenantId, user_id: userId },
      });
      setStatus({ connected: false });
      toast.success("Google Calendar desconectado");
    } catch (_e) {
      toast.error("Erro ao desconectar");
    }
    setLoading(false);
  }, [tenantId, userId]);

  return { status, loading, checking, startOAuth, handleCallback, disconnect, checkStatus };
}
