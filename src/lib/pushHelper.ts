import { supabase } from "@/lib/supabaseClient";
import type { PushCategory } from "@/hooks/usePushPreferences";

const STORAGE_KEY = "push_notification_preferences";

function isPushEnabled(category: PushCategory): boolean {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (!stored) return true;
    const prefs = JSON.parse(stored);
    return prefs[category] ?? true;
  } catch {
    return true;
  }
}

export async function sendPushIfEnabled(
  category: PushCategory,
  userId: string,
  title: string,
  body: string,
  tag?: string,
) {
  if (!isPushEnabled(category)) return;

  try {
    await supabase.functions.invoke("push-notification", {
      body: {
        action: "send",
        user_id: userId,
        title,
        body,
        tag: tag || category,
        url: "/app",
      },
    });
  } catch {
    // silent fail for push
  }
}
