import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/lib/supabaseClient";

export interface OnlineUser {
  userId: string;
  nome: string;
  cargo: string | null;
  fotoUrl: string | null;
}

export function useOnlinePresence(currentUserId: string | null, userInfo?: { nome: string; cargo: string | null; fotoUrl: string | null }) {
  const [onlineUsers, setOnlineUsers] = useState<OnlineUser[]>([]);

  const syncPresence = useCallback((state: Record<string, any[]>) => {
    const users: OnlineUser[] = [];
    const seen = new Set<string>();
    Object.values(state).forEach((presences) => {
      presences.forEach((p) => {
        if (!seen.has(p.userId)) {
          seen.add(p.userId);
          users.push({
            userId: p.userId,
            nome: p.nome,
            cargo: p.cargo,
            fotoUrl: p.fotoUrl,
          });
        }
      });
    });
    setOnlineUsers(users);
  }, []);

  useEffect(() => {
    if (!currentUserId || !userInfo) return;

    const channel = supabase.channel("online-presence", {
      config: { presence: { key: currentUserId } },
    });

    channel
      .on("presence", { event: "sync" }, () => {
        syncPresence(channel.presenceState());
      })
      .subscribe(async (status) => {
        if (status === "SUBSCRIBED") {
          await channel.track({
            userId: currentUserId,
            nome: userInfo.nome,
            cargo: userInfo.cargo,
            fotoUrl: userInfo.fotoUrl,
            online_at: new Date().toISOString(),
          });
        }
      });

    return () => {
      supabase.removeChannel(channel);
    };
  }, [currentUserId, userInfo?.nome, userInfo?.cargo, userInfo?.fotoUrl, syncPresence]);

  return { onlineUsers };
}
