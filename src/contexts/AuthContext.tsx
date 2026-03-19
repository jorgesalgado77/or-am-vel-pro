import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";
import { setTenantState } from "@/lib/tenantState";
import type { CargoPermissoes } from "@/hooks/useCargos";
import type { Session } from "@supabase/supabase-js";

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
  session: Session | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<{ user: AppUser | null; error: string | null }>;
  signUp: (email: string, password: string, metadata?: Record<string, unknown>) => Promise<{ error: string | null; tenantId?: string }>;
  logout: () => Promise<void>;
  hasPermission: (perm: keyof CargoPermissoes) => boolean;
  refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  session: null,
  loading: true,
  login: async () => ({ user: null, error: null }),
  signUp: async () => ({ error: null }),
  logout: async () => {},
  hasPermission: () => true,
  refreshUser: async () => {},
});

async function loadAppUser(authUserId: string): Promise<AppUser | null> {
  const { data: u } = await supabase
    .from("usuarios")
    .select("*")
    .eq("auth_user_id", authUserId)
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

  return {
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
}

/** Sync in-memory state for non-React consumers (auditService) */
function syncGlobalState(appUser: AppUser | null) {
  setTenantState(appUser?.tenant_id ?? null, appUser?.id ?? null);
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AppUser | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  const loadFromSession = useCallback(async (sess: Session | null) => {
    if (!sess?.user) {
      setUser(null);
      setSession(null);
      syncGlobalState(null);
      setLoading(false);
      return;
    }

    setSession(sess);
    const appUser = await loadAppUser(sess.user.id);
    if (appUser) {
      setUser(appUser);
      syncGlobalState(appUser);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (_event, sess) => {
        await loadFromSession(sess);
      }
    );

    supabase.auth.getSession().then(({ data: { session: sess } }) => {
      loadFromSession(sess);
    });

    return () => subscription.unsubscribe();
  }, [loadFromSession]);

  const login = useCallback(async (email: string, password: string) => {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) return { user: null, error: error.message };
    
    const appUser = await loadAppUser(data.user.id);
    if (!appUser) return { user: null, error: "Usuário não encontrado no sistema" };
    
    setUser(appUser);
    setSession(data.session);
    syncGlobalState(appUser);
    
    return { user: appUser, error: null };
  }, []);

  const signUp = useCallback(async (email: string, password: string, metadata?: Record<string, unknown>) => {
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: metadata,
        emailRedirectTo: window.location.origin,
      },
    });
    if (error) return { error: error.message };
    return { error: null, tenantId: metadata?.tenant_id as string | undefined };
  }, []);

  const logout = useCallback(async () => {
    await supabase.auth.signOut();
    setUser(null);
    setSession(null);
    syncGlobalState(null);
  }, []);

  const hasPermission = useCallback((perm: keyof CargoPermissoes) => {
    if (!user) return true;
    return user.permissoes[perm] ?? false;
  }, [user]);

  const refreshUser = useCallback(async () => {
    if (session?.user) {
      const appUser = await loadAppUser(session.user.id);
      if (appUser) {
        setUser(appUser);
        syncGlobalState(appUser);
      }
    }
  }, [session]);

  return (
    <AuthContext.Provider value={{ user, session, loading, login, signUp, logout, hasPermission, refreshUser }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
