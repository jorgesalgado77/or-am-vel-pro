import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from "react";
import { supabase } from "@/lib/supabaseClient";
import type { CargoPermissoes } from "@/hooks/useCargos";

export interface AppUser {
  id: string;
  nome_completo: string;
  apelido: string | null;
  email: string | null;
  telefone: string | null;
  cargo_id: string | null;
  cargo_nome: string | null;
  foto_url: string | null;
  tenant_id: string | null;
  auth_user_id: string | null;
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
};

interface AuthContextType {
  user: AppUser | null;
  loading: boolean;
  login: (userId: string) => Promise<AppUser | null>;
  logout: () => void;
  hasPermission: (perm: keyof CargoPermissoes) => boolean;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  loading: true,
  login: async () => null,
  logout: () => {},
  hasPermission: () => true,
});

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AppUser | null>(null);
  const [loading, setLoading] = useState(true);

  const loadUser = useCallback(async (userId: string): Promise<AppUser | null> => {
    const { data: u } = await supabase
      .from("usuarios")
      .select("*")
      .eq("id", userId)
      .single();

    if (!u) return null;

    let permissoes = DEFAULT_PERMS;
    let cargo_nome: string | null = null;

    if (u.cargo_id) {
      const { data: cargo } = await supabase
        .from("cargos")
        .select("nome, permissoes")
        .eq("id", u.cargo_id)
        .single();
      if (cargo) {
        permissoes = cargo.permissoes as unknown as CargoPermissoes;
        cargo_nome = cargo.nome;
      }
    }

    const appUser: AppUser = {
      id: u.id,
      nome_completo: u.nome_completo,
      apelido: u.apelido,
      email: u.email,
      telefone: u.telefone,
      cargo_id: u.cargo_id,
      cargo_nome,
      foto_url: u.foto_url,
      tenant_id: (u as any).tenant_id ?? null,
      auth_user_id: (u as any).auth_user_id ?? null,
      permissoes,
    };

    setUser(appUser);
    localStorage.setItem("current_user_id", userId);
    return appUser;
  }, []);

  const login = useCallback(async (userId: string) => {
    return loadUser(userId);
  }, [loadUser]);

  const logout = useCallback(() => {
    setUser(null);
    localStorage.removeItem("current_user_id");
    localStorage.removeItem("current_tenant_id");
  }, []);

  const hasPermission = useCallback((perm: keyof CargoPermissoes) => {
    if (!user) return true;
    return user.permissoes[perm] ?? false;
  }, [user]);

  useEffect(() => {
    const savedId = localStorage.getItem("current_user_id");
    if (savedId) {
      loadUser(savedId).finally(() => setLoading(false));
    } else {
      setLoading(false);
    }
  }, [loadUser]);

  return (
    <AuthContext.Provider value={{ user, loading, login, logout, hasPermission }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
