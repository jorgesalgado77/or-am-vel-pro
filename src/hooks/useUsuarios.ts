import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";

export interface Usuario {
  id: string;
  nome_completo: string;
  apelido: string | null;
  telefone: string | null;
  email: string | null;
  cargo_id: string | null;
  cargo_nome?: string;
  foto_url: string | null;
  ativo: boolean;
  tipo_regime: string | null;
  comissao_percentual: number;
  salario_fixo: number;
  created_at: string;
}

export function useUsuarios() {
  const [usuarios, setUsuarios] = useState<Usuario[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    const { data } = await supabase
      .from("usuarios")
      .select("*, cargos(nome)")
      .order("nome_completo");
    if (data) {
      setUsuarios(data.map((u: any) => ({
        ...u,
        cargo_nome: u.cargos?.nome || null,
      })) as Usuario[]);
    }
    setLoading(false);
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  // Filter only active users with cargo "PROJETISTA" (case-insensitive)
  const projetistas = usuarios.filter(
    u => u.ativo && u.cargo_nome && u.cargo_nome.toLowerCase() === "projetista"
  );

  return { usuarios, projetistas, loading, refresh };
}
