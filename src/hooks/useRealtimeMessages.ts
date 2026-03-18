import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { playNotificationSound } from "@/lib/notificationSound";

/**
 * Hook that subscribes to realtime tracking_messages inserts
 * and provides unread count for loja-side (messages from clients).
 */
export function useRealtimeMessages(onNewMessage?: (payload: any) => void) {
  const [unreadCount, setUnreadCount] = useState(0);

  const fetchUnreadCount = useCallback(async () => {
    const { count } = await supabase
      .from("tracking_messages")
      .select("*", { count: "exact", head: true })
      .eq("remetente_tipo", "cliente")
      .eq("lida", false);
    setUnreadCount(count || 0);
  }, []);

  useEffect(() => {
    fetchUnreadCount();

    const channel = supabase
      .channel("tracking-messages-realtime")
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "tracking_messages",
        },
        (payload) => {
          const newMsg = payload.new as any;
          // Only notify for client messages (loja receives)
          if (newMsg.remetente_tipo === "cliente") {
            toast.info("Nova mensagem de cliente recebida!", {
              description: newMsg.mensagem?.substring(0, 60),
              duration: 5000,
            });
            setUnreadCount((prev) => prev + 1);
          }
          onNewMessage?.(newMsg);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [onNewMessage, fetchUnreadCount]);

  return { unreadCount, refreshUnread: fetchUnreadCount };
}
