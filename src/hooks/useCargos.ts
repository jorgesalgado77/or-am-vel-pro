import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";

export interface CargoPermissoes {
  clientes: boolean;
  simulador: boolean;
  configuracoes: boolean;
  desconto1: boolean;
  desconto2: boolean;
  desconto3: boolean;
  plus: boolean;
}

export interface Cargo {
  id: string;
  nome: string;
  permissoes: CargoPermissoes;
  created_at: string;
}

const DEFAULT_PERMISSOES: CargoPermissoes = {
  clientes: true,
  simulador: true,
  configuracoes: false,
  desconto1: true,
  desconto2: true,
  desconto3: false,
  plus: false,
};

export function useCargos() {
  const [cargos, setCargos] = useState<Cargo[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    const { data } = await supabase.from("cargos").select("*").order("nome");
    if (data) setCargos(data.map(c => ({ ...c, permissoes: c.permissoes as unknown as CargoPermissoes })));
    setLoading(false);
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  return { cargos, loading, refresh, DEFAULT_PERMISSOES };
}
