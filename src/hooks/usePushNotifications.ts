import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/lib/supabaseClient";

// Public VAPID key - safe to embed in client
const VAPID_PUBLIC_KEY = "BN68Rf1RAmOZq6AMPhbx-0wORSA_6pRoV2FafpNgeyM2IJOIN1SLmnrqu6G9vimg_1j1uao1JJzrMn5YK3srq-s";

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

export function usePushNotifications(tenantId: string | null, userId: string | undefined) {
  const [permission, setPermission] = useState<NotificationPermission>("default");
  const [isSubscribed, setIsSubscribed] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if ("Notification" in window) {
      setPermission(Notification.permission);
    }
    checkExistingSubscription();
  }, []);

  const checkExistingSubscription = useCallback(async () => {
    try {
      if (!("serviceWorker" in navigator)) return;
      const reg = await navigator.serviceWorker.getRegistration("/sw.js");
      if (!reg) return;
      const sub = await reg.pushManager.getSubscription();
      setIsSubscribed(!!sub);
    } catch {
      // ignore
    }
  }, []);

  const subscribe = useCallback(async () => {
    if (!tenantId || !userId) return false;
    setLoading(true);
    try {
      // 1. Request permission
      const perm = await Notification.requestPermission();
      setPermission(perm);
      if (perm !== "granted") {
        setLoading(false);
        return false;
      }

      // 2. Register SW
      const registration = await navigator.serviceWorker.register("/sw.js");
      await navigator.serviceWorker.ready;

      // 3. Subscribe to push
      const subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY).buffer as ArrayBuffer,
      });

      // 4. Store subscription in DB via edge function
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
      setLoading(false);
      return true;
    } catch (err) {
      console.error("Push subscription failed:", err);
      setLoading(false);
      return false;
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

  const supported = "serviceWorker" in navigator && "PushManager" in window;

  return { supported, permission, isSubscribed, loading, subscribe, unsubscribe };
}
