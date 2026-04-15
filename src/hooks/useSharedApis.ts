import { useState, useEffect, useCallback, useMemo } from "react";
import { supabase } from "@/lib/supabaseClient";

export interface SharedApi {
  id: string;
  config_id: string;
  provider: string;
  nome: string;
  is_active: boolean;
  config_active: boolean;
  starts_at: string;
  ends_at: string;
  days_left: number;
  expired: boolean;
  expiring_soon: boolean; // < 7 days
}

export function useSharedApis(tenantId: string | null) {
  const [sharedApis, setSharedApis] = useState<SharedApi[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchShared = useCallback(async () => {
    if (!tenantId) { setLoading(false); return; }
    try {
      const { data: shares } = await (supabase as any)
        .from("dealroom_api_shares")
        .select("id, config_id, starts_at, ends_at, is_active")
        .eq("tenant_id", tenantId);

      if (!shares || shares.length === 0) {
        setSharedApis([]);
        setLoading(false);
        return;
      }

      const configIds = [...new Set(shares.map((s: any) => s.config_id))];
      const { data: configs } = await (supabase as any)
        .from("dealroom_api_configs")
        .select("id, provider, nome, is_active")
        .in("id", configIds);

      const configMap = Object.fromEntries((configs || []).map((c: any) => [c.id, c]));
      const now = new Date();

      const mapped: SharedApi[] = shares.map((s: any) => {
        const config = configMap[s.config_id] || {};
        const endsAt = new Date(s.ends_at);
        const daysLeft = Math.ceil((endsAt.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
        return {
          id: s.id,
          config_id: s.config_id,
          provider: config.provider || "unknown",
          nome: config.nome || "API Desconhecida",
          is_active: s.is_active && (config.is_active !== false),
          config_active: config.is_active !== false,
          starts_at: s.starts_at,
          ends_at: s.ends_at,
          days_left: daysLeft,
          expired: daysLeft < 0,
          expiring_soon: daysLeft >= 0 && daysLeft <= 7,
        };
      });

      setSharedApis(mapped);
    } catch (err) {
      console.error("Error fetching shared APIs:", err);
    }
    setLoading(false);
  }, [tenantId]);

  useEffect(() => {
    fetchShared();
    if (!tenantId) return;
    const channel = supabase
      .channel(`shared-apis-${tenantId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "dealroom_api_shares" }, fetchShared)
      .on("postgres_changes", { event: "*", schema: "public", table: "dealroom_api_configs" }, fetchShared)
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [fetchShared, tenantId]);

  // APIs that are active and not expired
  const activeShared = useMemo(() => sharedApis.filter(a => a.is_active && !a.expired), [sharedApis]);
  const expiredApis = useMemo(() => sharedApis.filter(a => a.expired), [sharedApis]);
  const expiringSoon = useMemo(() => sharedApis.filter(a => a.expiring_soon && !a.expired), [sharedApis]);

  return { sharedApis, activeShared, expiredApis, expiringSoon, loading, refetch: fetchShared };
}

/**
 * Resolve which API key to use: store's own key first, fallback to shared.
 * Returns the provider name if shared API is being used.
 */
export function resolveApiProvider(
  storeKeys: { provider: string; is_active: boolean }[],
  sharedApis: SharedApi[],
  provider: string
): { source: "store" | "shared" | "none"; sharedApiName?: string } {
  const storeKey = storeKeys.find(k => k.provider === provider && k.is_active);
  if (storeKey) return { source: "store" };

  const shared = sharedApis.find(
    a => a.provider === provider && a.is_active && !a.expired
  );
  if (shared) return { source: "shared", sharedApiName: shared.nome };

  return { source: "none" };
}
