import { useState, useEffect, createContext, useContext } from "react";
import { supabase } from "@/lib/supabaseClient";
import type { CargoPermissoes } from "@/hooks/useCargos";

export interface CurrentUser {
  id: string;
  nome_completo: string;
  apelido: string | null;
  cargo_id: string | null;
  foto_url: string | null;
  cargo_nome: string | null;
  telefone: string | null;
  email: string | null;
  permissoes: CargoPermissoes;
}

const DEFAULT_PERMS: CargoPermissoes = {
  clientes: true,
  simulador: true,
  configuracoes: true,
  desconto1: true,
  desconto2: true,
  desconto3: true,
  plus: true,
  folha_pagamento: true,
  financeiro: true,
  planos: true,
  funil: true,
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
  medicao: true,
  tutoriais: true,
  email: true,
};

export function useCurrentUserLoader() {
  const [currentUser, setCurrentUser] = useState<CurrentUser | null>(null);
  const [loading, setLoading] = useState(true);

  const selectUser = async (userId: string) => {
    const { data: user } = await supabase
      .from("usuarios")
      .select("*")
      .eq("id", userId)
      .single();
    if (!user) return;

    let permissoes = DEFAULT_PERMS;
    let cargo_nome: string | null = null;
    if (user.cargo_id) {
      const { data: cargo } = await supabase
        .from("cargos")
        .select("nome, permissoes")
        .eq("id", user.cargo_id)
        .single();
      if (cargo) {
        permissoes = cargo.permissoes as unknown as CargoPermissoes;
        cargo_nome = cargo.nome;
      }
    }

    const cu: CurrentUser = {
      id: user.id,
      nome_completo: user.nome_completo,
      apelido: user.apelido,
      cargo_id: user.cargo_id,
      foto_url: (user as any).foto_url ?? null,
      cargo_nome,
      telefone: (user as any).telefone ?? null,
      email: (user as any).email ?? null,
      permissoes,
    };
    setCurrentUser(cu);
    localStorage.setItem("current_user_id", userId);
  };

  const logout = () => {
    setCurrentUser(null);
    localStorage.removeItem("current_user_id");
  };

  useEffect(() => {
    const savedId = localStorage.getItem("current_user_id");
    if (savedId) {
      selectUser(savedId).finally(() => setLoading(false));
    } else {
      setLoading(false);
    }
  }, []);

  return { currentUser, loading, selectUser, logout };
}

// Context
interface CurrentUserContextType {
  currentUser: CurrentUser | null;
  selectUser: (userId: string) => Promise<void>;
  logout: () => void;
  hasPermission: (perm: keyof CargoPermissoes) => boolean;
}

export const CurrentUserContext = createContext<CurrentUserContextType>({
  currentUser: null,
  selectUser: async () => {},
  logout: () => {},
  hasPermission: () => true,
});

export function useCurrentUser() {
  return useContext(CurrentUserContext);
}
