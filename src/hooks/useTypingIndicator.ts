import { useState, useEffect, useCallback, useRef } from "react";
import { supabase } from "@/lib/supabaseClient";

interface TypingUser {
  user_id: string;
  user_name: string;
}

export function useTypingIndicator(trackingId: string | null, currentUserId?: string, currentUserName?: string) {
  const [typingUsers, setTypingUsers] = useState<TypingUser[]>([]);
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);
  const isTypingRef = useRef(false);

  // Listen for typing changes
  useEffect(() => {
    if (!trackingId) return;

    // Fetch current typing state
    const fetchTyping = async () => {
      const { data } = await (supabase as any)
        .from("typing_indicators")
        .select("user_id, user_name")
        .eq("tracking_id", trackingId)
        .eq("is_typing", true);

      if (data) {
        setTypingUsers(
          data.filter((t: any) => t.user_id !== currentUserId).map((t: any) => ({
            user_id: t.user_id,
            user_name: t.user_name,
          }))
        );
      }
    };

    fetchTyping();

    const channel = supabase
      .channel(`typing-${trackingId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "typing_indicators", filter: `tracking_id=eq.${trackingId}` },
        (payload) => {
          const record = (payload.new || payload.old) as any;
          if (!record || record.user_id === currentUserId) return;

          if (payload.eventType === "DELETE" || !record.is_typing) {
            setTypingUsers((prev) => prev.filter((u) => u.user_id !== record.user_id));
          } else if (record.is_typing) {
            setTypingUsers((prev) => {
              if (prev.some((u) => u.user_id === record.user_id)) return prev;
              return [...prev, { user_id: record.user_id, user_name: record.user_name }];
            });
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [trackingId, currentUserId]);

  // Set typing status
  const setTyping = useCallback(async (typing: boolean) => {
    if (!trackingId || !currentUserId || isTypingRef.current === typing) return;
    isTypingRef.current = typing;

    await supabase
      .from("typing_indicators")
      .upsert({
        tracking_id: trackingId,
        user_id: currentUserId,
        user_name: currentUserName || "Loja",
        is_typing: typing,
        updated_at: new Date().toISOString(),
      }, { onConflict: "tracking_id,user_id" });
  }, [trackingId, currentUserId, currentUserName]);

  // Called on each keystroke — sets typing=true and auto-clears after 3s
  const onKeystroke = useCallback(() => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);

    setTyping(true);

    timeoutRef.current = setTimeout(() => {
      setTyping(false);
    }, 3000);
  }, [setTyping]);

  // Stop typing immediately (on send)
  const stopTyping = useCallback(() => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    setTyping(false);
  }, [setTyping]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      if (trackingId && currentUserId) {
        supabase
          .from("typing_indicators")
          .upsert({
            tracking_id: trackingId,
            user_id: currentUserId,
            user_name: currentUserName || "Loja",
            is_typing: false,
            updated_at: new Date().toISOString(),
          }, { onConflict: "tracking_id,user_id" })
          .then();
      }
    };
  }, [trackingId, currentUserId, currentUserName]);

  return { typingUsers, onKeystroke, stopTyping };
}
