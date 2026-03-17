import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";

export interface Usuario {
  id: string;
  nome_completo: string;
  apelido: string | null;
  telefone: string | null;
  email: string | null;
  cargo_id: string | null;
  created_at: string;
}

export function useUsuarios() {
  const [usuarios, setUsuarios] = useState<Usuario[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    const { data } = await supabase.from("usuarios").select("*").order("nome_completo");
    if (data) setUsuarios(data as Usuario[]);
    setLoading(false);
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  return { usuarios, loading, refresh };
}
