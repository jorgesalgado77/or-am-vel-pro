/**
 * useWhatsAppFunnel — hook to load WhatsApp funnel config from landing_page_config
 */
import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/lib/supabaseClient";
import { DEFAULT_WHATSAPP_FUNNEL, type WhatsAppFunnelConfig } from "@/lib/whatsappFunnel";

export function useWhatsAppFunnel() {
  const [config, setConfig] = useState<WhatsAppFunnelConfig>(DEFAULT_WHATSAPP_FUNNEL);
  const [loading, setLoading] = useState(true);

  const fetch = useCallback(async () => {
    try {
      const { data } = await supabase
        .from("landing_page_config")
        .select("whatsapp_funnel")
        .limit(1)
        .maybeSingle();

      if (data && (data as any).whatsapp_funnel) {
        setConfig({ ...DEFAULT_WHATSAPP_FUNNEL, ...(data as any).whatsapp_funnel });
      }
    } catch {
      // use defaults
    }
    setLoading(false);
  }, []);

  useEffect(() => { fetch(); }, [fetch]);

  const update = useCallback(async (updates: Partial<WhatsAppFunnelConfig>) => {
    const merged = { ...config, ...updates };
    const { error } = await supabase
      .from("landing_page_config")
      .update({ whatsapp_funnel: merged, updated_at: new Date().toISOString() } as any)
      .neq("id", "00000000-0000-0000-0000-000000000000"); // update all rows
    if (!error) setConfig(merged);
    return { error };
  }, [config]);

  return { config, loading, update, refresh: fetch };
}
