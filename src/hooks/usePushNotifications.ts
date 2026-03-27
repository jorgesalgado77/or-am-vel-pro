import { useState, useEffect, useCallback, useRef } from "react";
import { supabase } from "@/lib/supabaseClient";

// Public VAPID key — env var with hardcoded fallback for backwards compat
const VAPID_PUBLIC_KEY =
  (typeof import.meta !== "undefined" && (import.meta as any).env?.VITE_VAPID_PUBLIC_KEY) ||
  "BN68Rf1RAmOZq6AMPhbx-0wORSA_6pRoV2FafpNgeyM2IJOIN1SLmnrqu6G9vimg_1j1uao1JJzrMn5YK3srq-s";

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

/** Guards: never register SW inside iframe or Lovable preview */
function shouldRegisterSW(): boolean {
  try {
    if (window.self !== window.top) return false;
  } catch {
    return false;
  }
  const host = window.location.hostname;
  if (host.includes("id-preview--") || host.includes("lovableproject.com")) return false;
  return true;
}

export function usePushNotifications(tenantId: string | null, userId: string | undefined) {
  const [permission, setPermission] = useState<NotificationPermission>("default");
  const [isSubscribed, setIsSubscribed] = useState(false);
  const [loading, setLoading] = useState(false);
  const checkedRef = useRef(false);

  // Lazy check — runs once after mount via requestIdleCallback
  useEffect(() => {
    if (checkedRef.current) return;
    checkedRef.current = true;

    if ("Notification" in window) {
      setPermission(Notification.permission);
    }

    const check = () => {
      if (!("serviceWorker" in navigator) || !shouldRegisterSW()) return;
      navigator.serviceWorker.getRegistration("/sw.js").then((reg) => {
        if (!reg) return;
        reg.pushManager.getSubscription().then((sub) => setIsSubscribed(!!sub));
      }).catch(() => {});
    };

    if ("requestIdleCallback" in window) {
      (window as any).requestIdleCallback(check, { timeout: 3000 });
    } else {
      setTimeout(check, 1500);
    }
  }, []);

  // Listen for foreground push messages from SW
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    const handler = (event: MessageEvent) => {
      if (event.data?.type === "PUSH_FOREGROUND") {
        // Could integrate with sonner/toast here — for now just log
        const { title, body } = event.data.payload || {};
        if (title) {
          import("sonner").then(({ toast }) => toast.info(`${title}${body ? `: ${body}` : ""}`));
        }
      }
    };
    navigator.serviceWorker.addEventListener("message", handler);
    return () => navigator.serviceWorker.removeEventListener("message", handler);
  }, []);

  const subscribe = useCallback(async () => {
    if (!tenantId || !userId || !shouldRegisterSW()) return false;
    setLoading(true);
    try {
      const perm = await Notification.requestPermission();
      setPermission(perm);
      if (perm !== "granted") {
        setLoading(false);
        return false;
      }

      // Lazy SW registration — only at subscribe time
      const registration = await navigator.serviceWorker.register("/sw.js");
      await navigator.serviceWorker.ready;

      const subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY).buffer as ArrayBuffer,
      });

      const { error } = await supabase.functions.invoke("push-notification", {
        body: {
          action: "subscribe",
          tenant_id: tenantId,
          user_id: userId,
          subscription: subscription.toJSON(),
        },
      });

      if (error) throw error;
      setIsSubscribed(true);
      return true;
    } catch (err) {
      console.error("Push subscription failed:", err);
      return false;
    } finally {
      setLoading(false);
    }
  }, [tenantId, userId]);

  const unsubscribe = useCallback(async () => {
    if (!userId) return;
    setLoading(true);
    try {
      const reg = await navigator.serviceWorker.getRegistration("/sw.js");
      if (reg) {
        const sub = await reg.pushManager.getSubscription();
        if (sub) await sub.unsubscribe();
      }

      await supabase.functions.invoke("push-notification", {
        body: { action: "unsubscribe", user_id: userId },
      });

      setIsSubscribed(false);
    } catch (err) {
      console.error("Push unsubscribe failed:", err);
    }
    setLoading(false);
  }, [userId]);

  const supported = "serviceWorker" in navigator && "PushManager" in window && shouldRegisterSW();

  return { supported, permission, isSubscribed, loading, subscribe, unsubscribe };
}
