import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/lib/supabaseClient";
import { getResolvedTenantId } from "@/contexts/TenantContext";

export interface CargoPermissoes {
  clientes: boolean;
  simulador: boolean;
  configuracoes: boolean;
  desconto1: boolean;
  desconto2: boolean;
  desconto3: boolean;
  plus: boolean;
  // Sidebar menu permissions
  folha_pagamento: boolean;
  financeiro: boolean;
  planos: boolean;
  funil: boolean;
  campanhas: boolean;
  indicacoes: boolean;
  vendazap: boolean;
  chat_vendas: boolean;
  dealroom: boolean;
  smart3d: boolean;
  divulgue_ganhe: boolean;
  mensagens: boolean;
  suporte: boolean;
  // Additional feature permissions
  ia_gerente: boolean;
  catalogo: boolean;
  medicao: boolean;
  tutoriais: boolean;
  email: boolean;
  cadastrar_produtos: boolean;
}

const DEFAULT_PERMISSOES: CargoPermissoes = {
  clientes: true,
  simulador: true,
  configuracoes: false,
  desconto1: true,
  desconto2: true,
  desconto3: false,
  plus: false,
  folha_pagamento: false,
  financeiro: false,
  planos: false,
  funil: false,
  campanhas: true,
  indicacoes: true,
  vendazap: true,
  chat_vendas: true,
  dealroom: true,
  smart3d: true,
  divulgue_ganhe: true,
  mensagens: true,
  suporte: true,
  ia_gerente: true,
  catalogo: true,
  medicao: false,
  tutoriais: true,
  email: true,
  cadastrar_produtos: false,
};

export interface Cargo {
  id: string;
  nome: string;
  permissoes: CargoPermissoes;
  comissao_percentual: number;
  created_at: string;
}

export function useCargos() {
  const [cargos, setCargos] = useState<Cargo[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    const tenantId = await getResolvedTenantId();
    let query = supabase.from("cargos").select("*").order("nome");
    if (tenantId) query = query.eq("tenant_id", tenantId);
    const { data } = await query;
    if (data) setCargos(data.map(c => ({
      ...c,
      permissoes: c.permissoes as unknown as CargoPermissoes,
      comissao_percentual: Number((c as any).comissao_percentual) || 0,
    })));
    setLoading(false);
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  return { cargos, loading, refresh, DEFAULT_PERMISSOES };
}
