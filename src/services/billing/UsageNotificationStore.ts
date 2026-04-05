/**
 * Usage Notification Store — persists usage alerts beyond toasts
 * so tenants can review their consumption history.
 */
import { type UsageFeature } from "@/services/billing/UsageTracker";

export interface UsageNotification {
  id: string;
  feature: UsageFeature;
  type: "warning" | "exceeded";
  percentUsed: number;
  message: string;
  description: string;
  timestamp: number;
  read: boolean;
}

const STORAGE_KEY = "usage_notifications";
const MAX_NOTIFICATIONS = 50;

type Listener = () => void;
const listeners = new Set<Listener>();

function notify() {
  listeners.forEach((fn) => fn());
}

export function subscribeNotifications(fn: Listener): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function getNotifications(): UsageNotification[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export function addNotification(n: Omit<UsageNotification, "id" | "timestamp" | "read">): void {
  const list = getNotifications();

  // Deduplicate: don't add same feature+type if already exists within last hour
  const oneHourAgo = Date.now() - 3600_000;
  const duplicate = list.find(
    (existing) =>
      existing.feature === n.feature &&
      existing.type === n.type &&
      existing.timestamp > oneHourAgo,
  );
  if (duplicate) return;

  const entry: UsageNotification = {
    ...n,
    id: crypto.randomUUID(),
    timestamp: Date.now(),
    read: false,
  };

  const updated = [entry, ...list].slice(0, MAX_NOTIFICATIONS);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
  notify();
}

export function markNotificationRead(id: string): void {
  const list = getNotifications();
  const updated = list.map((n) => (n.id === id ? { ...n, read: true } : n));
  localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
  notify();
}

export function markAllNotificationsRead(): void {
  const list = getNotifications();
  const updated = list.map((n) => ({ ...n, read: true }));
  localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
  notify();
}

export function clearNotifications(): void {
  localStorage.removeItem(STORAGE_KEY);
  notify();
}

export function getUnreadCount(): number {
  return getNotifications().filter((n) => !n.read).length;
}
