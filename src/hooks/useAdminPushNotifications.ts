import { useEffect, useRef, useCallback } from "react";
import { supabase } from "@/lib/supabaseClient";
import { differenceInDays } from "date-fns";

const SW_PATH = "/admin-sw.js";
const CHECK_INTERVAL = 5 * 60 * 1000; // 5 minutes

async function registerSW(): Promise<ServiceWorkerRegistration | null> {
  if (!("serviceWorker" in navigator) || !("Notification" in window)) return null;
  try {
    const reg = await navigator.serviceWorker.register(SW_PATH, { scope: "/" });
    return reg;
  } catch (e) {
    console.warn("[AdminPush] SW registration failed:", e);
    return null;
  }
}

async function requestPermission(): Promise<boolean> {
  if (!("Notification" in window)) return false;
  if (Notification.permission === "granted") return true;
  if (Notification.permission === "denied") return false;
  const result = await Notification.requestPermission();
  return result === "granted";
}

function sendLocalNotification(title: string, body: string, tag: string, requireInteraction = false) {
  if (!("serviceWorker" in navigator)) return;
  navigator.serviceWorker.ready.then((reg) => {
    const options: NotificationOptions & Record<string, unknown> = {
      body,
      icon: "/favicon.ico",
      badge: "/favicon.ico",
      tag,
      requireInteraction,
      data: { url: "/admin" },
    };
    (options as any).vibrate = [200, 100, 200];
    reg.showNotification(title, options);
  });
}

export function useAdminPushNotifications(enabled: boolean = true) {
  const swRef = useRef<ServiceWorkerRegistration | null>(null);
  const lastStuckIdsRef = useRef<Set<string>>(new Set());
  const lastSupportIdsRef = useRef<Set<string>>(new Set());
  const initializedRef = useRef(false);

  const checkStuckTasks = useCallback(async () => {
    const { data } = await supabase
      .from("admin_tasks" as any)
      .select("id, titulo, coluna, moved_at")
      .eq("coluna", "pendente");

    if (!data) return;
    const now = new Date();
    const stuck = (data as any[]).filter(
      (t) => differenceInDays(now, new Date(t.moved_at)) >= 2
    );

    stuck.forEach((t) => {
      if (!lastStuckIdsRef.current.has(t.id)) {
        const days = differenceInDays(now, new Date(t.moved_at));
        sendLocalNotification(
          "⏰ Tarefa Parada",
          `"${t.titulo}" está pendente há ${days} dias`,
          `stuck-${t.id}`,
          true
        );
      }
    });

    lastStuckIdsRef.current = new Set(stuck.map((t) => t.id));
  }, []);

  const setupRealtimeSupport = useCallback(() => {
    const channel = supabase
      .channel("admin-push-support")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "support_tickets" },
        (payload) => {
          const ticket = payload.new as any;
          if (!lastSupportIdsRef.current.has(ticket.id)) {
            sendLocalNotification(
              "💬 Nova Mensagem de Suporte",
              `${ticket.usuario_nome || "Usuário"}: ${ticket.assunto || ticket.mensagem?.substring(0, 80) || "Nova solicitação"}`,
              `support-${ticket.id}`
            );
            lastSupportIdsRef.current.add(ticket.id);
          }
        }
      )
      .subscribe();

    return channel;
  }, []);

  useEffect(() => {
    if (!enabled || initializedRef.current) return;

    let intervalId: ReturnType<typeof setInterval>;
    let supportChannel: any;

    const init = async () => {
      const granted = await requestPermission();
      if (!granted) {
        console.log("[AdminPush] Permission not granted");
        return;
      }

      swRef.current = await registerSW();
      if (!swRef.current) return;

      initializedRef.current = true;

      // Initial check
      await checkStuckTasks();

      // Periodic check for stuck tasks
      intervalId = setInterval(checkStuckTasks, CHECK_INTERVAL);

      // Realtime support tickets
      supportChannel = setupRealtimeSupport();
    };

    init();

    return () => {
      if (intervalId) clearInterval(intervalId);
      if (supportChannel) supabase.removeChannel(supportChannel);
    };
  }, [enabled, checkStuckTasks, setupRealtimeSupport]);

  const requestPushPermission = useCallback(async () => {
    const granted = await requestPermission();
    if (granted) {
      swRef.current = await registerSW();
      await checkStuckTasks();
    }
    return granted;
  }, [checkStuckTasks]);

  return { requestPushPermission };
}
