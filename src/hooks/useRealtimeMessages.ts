import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/lib/supabaseClient";
import { toast } from "sonner";
import { playNotificationSound } from "@/lib/notificationSound";

/**
 * Hook that subscribes to realtime tracking_messages inserts AND updates
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
          if (newMsg.remetente_tipo === "cliente") {
            playNotificationSound();
            toast.info("Nova mensagem de cliente recebida!", {
              description: newMsg.mensagem?.substring(0, 60),
              duration: 5000,
            });
            setUnreadCount((prev) => prev + 1);
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
        },
        (payload) => {
          const updated = payload.new as any;
          const old = payload.old as any;
          // When a client message is marked as read, refresh unread count
          if (updated.remetente_tipo === "cliente" && old.lida === false && updated.lida === true) {
            fetchUnreadCount();
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [onNewMessage, fetchUnreadCount]);

  return { unreadCount, refreshUnread: fetchUnreadCount };
}
