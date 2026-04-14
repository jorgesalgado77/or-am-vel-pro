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
      .or("goal_type.in.(meta_loja,meta_vendedor,teto_liberacao,custom),goal_type.like.custom:*");

    if (!error && data && (data as any[]).length > 0) {
      setMetas((data as any[]).map((d: any) => {
        const goalType = d.goal_type as string;
        const isCustom = goalType.startsWith("custom");
        const customLabel = goalType.startsWith("custom:") ? goalType.substring(7) : "";
        return {
          id: d.id,
          tipo: isCustom ? "custom" : goalType,
          label: customLabel || goalType,
          valor: d.target_value,
          mes_referencia: d.month,
        };
      }));
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
