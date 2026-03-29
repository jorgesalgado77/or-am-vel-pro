import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/lib/supabaseClient";
import { toast } from "sonner";
import { playNotificationSound } from "@/lib/notificationSound";
import { getResolvedTenantId } from "@/contexts/TenantContext";

export function useRealtimeMessages(activeView?: string, onNewMessage?: (payload: unknown) => void) {
  const [unreadCount, setUnreadCount] = useState(0);

  const fetchUnreadCount = useCallback(async () => {
    const tenantId = await getResolvedTenantId();

    let query = supabase
      .from("tracking_messages")
      .select("*", { count: "exact", head: true })
      .eq("remetente_tipo", "cliente")
      .eq("lida", false);

    if (tenantId) query = query.eq("tenant_id", tenantId);

    const { count } = await query;
    setUnreadCount(count || 0);
  }, []);

  useEffect(() => {
    let isActive = true;
    let channel: ReturnType<typeof supabase.channel> | null = null;

    const setup = async () => {
      await fetchUnreadCount();
      const tenantId = await getResolvedTenantId();
      if (!isActive) return;

      channel = supabase
        .channel(`tracking-messages-realtime-${tenantId || "global"}`)
        .on(
          "postgres_changes",
          {
            event: "INSERT",
            schema: "public",
            table: "tracking_messages",
            ...(tenantId ? { filter: `tenant_id=eq.${tenantId}` } : {}),
          },
          (payload) => {
            const newMsg = payload.new as { remetente_tipo?: string; mensagem?: string };
            if (newMsg.remetente_tipo === "cliente") {
              playNotificationSound();
              setUnreadCount((prev) => prev + 1);

              if (activeView !== "vendazap-chat") {
                toast.info("Nova mensagem de cliente recebida!", {
                  description: newMsg.mensagem?.substring(0, 60),
                  duration: 5000,
                });
              }
            }
            onNewMessage?.(newMsg);
          }
        )
        .on(
          "postgres_changes",
          {
            event: "UPDATE",
            schema: "public",
            table: "tracking_messages",
            ...(tenantId ? { filter: `tenant_id=eq.${tenantId}` } : {}),
          },
          (payload) => {
            const updated = payload.new as { remetente_tipo?: string; lida?: boolean };
            const previous = payload.old as { lida?: boolean };
            if (updated.remetente_tipo === "cliente" && previous.lida === false && updated.lida === true) {
              void fetchUnreadCount();
            }
          }
        )
        .subscribe();
    };

    const refreshOnReturn = () => {
      if (document.visibilityState === "visible") {
        void fetchUnreadCount();
      }
    };

    void setup();
    window.addEventListener("focus", refreshOnReturn);
    document.addEventListener("visibilitychange", refreshOnReturn);

    return () => {
      isActive = false;
      window.removeEventListener("focus", refreshOnReturn);
      document.removeEventListener("visibilitychange", refreshOnReturn);
      if (channel) supabase.removeChannel(channel);
    };
  }, [activeView, fetchUnreadCount, onNewMessage]);

  return { unreadCount, refreshUnread: fetchUnreadCount };
}
