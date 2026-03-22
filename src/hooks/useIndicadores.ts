import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/lib/supabaseClient";
import { getResolvedTenantId } from "@/contexts/TenantContext";

export interface Indicador {
  id: string;
  nome: string;
  comissao_percentual: number;
  ativo: boolean;
  telefone: string | null;
  email: string | null;
  foto_url: string | null;
  created_at: string;
}

export function useIndicadores() {
  const [indicadores, setIndicadores] = useState<Indicador[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    const tenantId = getCurrentTenantId();
    let query = supabase
      .from("indicadores")
      .select("*")
      .order("nome");

    if (tenantId) {
      query = query.eq("tenant_id", tenantId);
    }

    const { data } = await query as { data: Indicador[] | null };

    if (data) setIndicadores(data);
    setLoading(false);
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  const activeIndicadores = indicadores.filter(i => i.ativo);

  return { indicadores, activeIndicadores, loading, refresh };
}
