/**
 * usePromoExpirationAlerts — Notifies sellers when promotions are about to expire (≤2 days)
 * Runs once on mount and every 30 minutes.
 */
import { useEffect, useRef } from "react";
import { supabase } from "@/lib/supabaseClient";
import { getTenantId, getUserId } from "@/lib/tenantState";
import { toast } from "sonner";
import { differenceInDays, differenceInHours, format } from "date-fns";
import { sendPushIfEnabled } from "@/lib/pushHelper";

const ALERT_STORAGE_KEY = "promo_expiration_alerted";
const CHECK_INTERVAL = 30 * 60 * 1000; // 30 min

export function usePromoExpirationAlerts() {
  const intervalRef = useRef<ReturnType<typeof setInterval>>();

  useEffect(() => {
    const check = async () => {
      const tenantId = getTenantId();
      const userId = getUserId();
      if (!tenantId) return;

      const { data } = await supabase
        .from("product_promotions" as any)
        .select("id, product_id, validade, desconto_percentual")
        .eq("tenant_id", tenantId)
        .eq("ativo", true)
        .gt("validade", new Date().toISOString());

      if (!data || (data as any[]).length === 0) return;

      const now = new Date();
      const expiring = (data as any[]).filter(p => {
        const days = differenceInDays(new Date(p.validade), now);
        return days <= 2;
      });

      if (expiring.length === 0) return;

      // Deduplicate alerts per session
      const alerted = new Set<string>(
        JSON.parse(sessionStorage.getItem(ALERT_STORAGE_KEY) || "[]")
      );
      const newAlerts = expiring.filter(p => !alerted.has(p.id));
      if (newAlerts.length === 0) return;

      // Get product names
      const ids = newAlerts.map((p: any) => p.product_id);
      const { data: prods } = await supabase
        .from("products" as any)
        .select("id, name")
        .in("id", ids);
      const nameMap: Record<string, string> = {};
      if (prods) (prods as any[]).forEach((p: any) => { nameMap[p.id] = p.name; });

      newAlerts.forEach((p: any) => {
        const validade = new Date(p.validade);
        const days = differenceInDays(validade, now);
        const hours = differenceInHours(validade, now);
        const name = nameMap[p.product_id] || "Produto";
        const timeText = days > 0 ? `${days} dia${days > 1 ? "s" : ""}` : `${hours}h`;

        toast.warning(
          `⏰ Promoção de "${name}" (-${Number(p.desconto_percentual)}%) expira em ${timeText}!`,
          { duration: 8000 }
        );

        // Push notification
        if (userId) {
          sendPushIfEnabled(
            "tasks" as any,
            userId,
            "⏰ Promoção Expirando",
            `A promoção de "${name}" (-${Number(p.desconto_percentual)}%) expira em ${timeText}!`,
            `promo-expiring-${p.id}`
          );
        }

        alerted.add(p.id);
      });

      sessionStorage.setItem(ALERT_STORAGE_KEY, JSON.stringify([...alerted]));
    };

    check();
    intervalRef.current = setInterval(check, CHECK_INTERVAL);
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, []);
}
