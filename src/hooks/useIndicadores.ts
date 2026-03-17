import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";

export interface Indicador {
  id: string;
  nome: string;
  comissao_percentual: number;
  ativo: boolean;
  created_at: string;
}

export function useIndicadores() {
  const [indicadores, setIndicadores] = useState<Indicador[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    const { data } = await supabase
      .from("indicadores")
      .select("*")
      .order("nome") as { data: Indicador[] | null };
    if (data) setIndicadores(data);
    setLoading(false);
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  const activeIndicadores = indicadores.filter(i => i.ativo);

  return { indicadores, activeIndicadores, loading, refresh };
}
