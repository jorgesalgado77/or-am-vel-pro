/**
 * useMetasTetos — Hook to read Metas e Tetos for the current tenant/month
 * Used by Dashboard, CommercialAIPanel, etc.
 */
import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/lib/supabaseClient";
import { getResolvedTenantId } from "@/contexts/TenantContext";

export interface MetaTeto {
  id: string;
  tipo: string;
  label: string;
  valor: number;
  mes_referencia: string;
}

function getCurrentMonth() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

export function useMetasTetos(month?: string) {
  const [metas, setMetas] = useState<MetaTeto[]>([]);
  const [loading, setLoading] = useState(true);
  const targetMonth = month || getCurrentMonth();

  const load = useCallback(async () => {
    setLoading(true);
    const tenantId = await getResolvedTenantId();
    if (!tenantId) { setLoading(false); return; }

    const { data, error } = await supabase
      .from("sales_goals" as any)
      .select("*")
      .eq("tenant_id", tenantId)
      .eq("month", targetMonth)
      .in("goal_type", ["meta_loja", "meta_vendedor", "teto_liberacao", "custom"]);

    if (!error && data && (data as any[]).length > 0) {
      setMetas((data as any[]).map((d: any) => ({
        id: d.id,
        tipo: d.goal_type,
        label: d.user_id || d.goal_type,
        valor: d.target_value,
        mes_referencia: d.month,
      })));
    } else {
      // Fallback localStorage
      const key = `metas_tetos_${tenantId}_${targetMonth}`;
      const stored = localStorage.getItem(key);
      setMetas(stored ? JSON.parse(stored) : []);
    }
    setLoading(false);
  }, [targetMonth]);

  useEffect(() => { load(); }, [load]);

  const metaLoja = metas.find(m => m.tipo === "meta_loja");
  const metaVendedor = metas.find(m => m.tipo === "meta_vendedor");
  const tetoLiberacao = metas.find(m => m.tipo === "teto_liberacao");

  return { metas, metaLoja, metaVendedor, tetoLiberacao, loading, refresh: load };
}
