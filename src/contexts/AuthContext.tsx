import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";
import { setTenantState } from "@/lib/tenantState";
import type { CargoPermissoes } from "@/hooks/useCargos";
import type { Session, User as SupabaseAuthUser } from "@supabase/supabase-js";

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

async function resolveCargo(cargoId: string | null): Promise<{ cargo_nome: string | null; permissoes: CargoPermissoes }> {
  if (!cargoId) {
    return { cargo_nome: null, permissoes: DEFAULT_PERMS };
  }

  const { data: cargo } = await supabase
    .from("cargos")
    .select("nome, permissoes")
    .eq("id", cargoId)
    .maybeSingle();

  if (!cargo) {
    return { cargo_nome: null, permissoes: DEFAULT_PERMS };
  }

  return {
    cargo_nome: cargo.nome,
    permissoes: cargo.permissoes as unknown as CargoPermissoes,
  };
}

async function mapAppUser(userRow: any, authUserId?: string | null): Promise<AppUser> {
  const { cargo_nome, permissoes } = await resolveCargo(userRow.cargo_id ?? null);

  return {
    id: userRow.id,
    nome_completo: userRow.nome_completo,
    apelido: userRow.apelido,
    email: userRow.email,
    telefone: userRow.telefone,
    cargo_id: userRow.cargo_id,
    cargo_nome,
    foto_url: userRow.foto_url,
    tenant_id: userRow.tenant_id ?? null,
    auth_user_id: authUserId ?? userRow.id ?? null,
    permissoes,
  };
}

/**
 * Compat layer for external databases:
 * - prefers usuarios.id = auth.uid()
 * - falls back to usuarios.email when the schema does not store auth_user_id
 */
async function loadAppUser(authUser: Pick<SupabaseAuthUser, "id" | "email">): Promise<AppUser | null> {
  const lookupStrategies: Array<{ column: string; value: string | null | undefined }> = [
    { column: "id", value: authUser.id },
    { column: "email", value: authUser.email?.trim().toLowerCase() },
  ];

  for (const strategy of lookupStrategies) {
    if (!strategy.value) continue;

    const query = (supabase as any)
      .from("usuarios")
      .select("*")
      .eq(strategy.column, strategy.value)
      .limit(1);

    const { data, error } = await query;
    const userRow = Array.isArray(data) ? data[0] : data;

    if (error) {
      console.warn(`[Auth] Failed to load user by ${strategy.column}:`, error.message);
      continue;
    }

    if (userRow) {
      return mapAppUser(userRow, authUser.id);
    }
  }

  return null;
}

async function ensureUserProfile(authUser: SupabaseAuthUser | null, metadata?: Record<string, unknown>) {
  if (!authUser || !metadata?.tenant_id) return;

  const { data } = await (supabase as any)
    .from("usuarios")
    .select("id")
    .eq("id", authUser.id)
    .limit(1);

  const existingUser = Array.isArray(data) ? data[0] : data;

  if (existingUser) return;

  const payload = {
    id: authUser.id,
    nome_completo: (metadata.nome_completo as string) || authUser.email?.split("@")[0] || "Usuário",
    apelido: (metadata.apelido as string) || null,
    email: authUser.email || null,
    cargo_id: (metadata.cargo_id as string) || null,
    tenant_id: metadata.tenant_id as string,
    primeiro_login: true,
    ativo: true,
  };

  const { error } = await supabase.from("usuarios").insert(payload as any);

  if (error) {
    console.warn("[Auth] Failed to create user profile after sign up:", error.message);
  }
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
    const appUser = await loadAppUser(sess.user);

    if (appUser) {
      setUser(appUser);
      syncGlobalState(appUser);
    } else {
      setUser(null);
      syncGlobalState(null);
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
    const normalizedEmail = email.trim().toLowerCase();

    // 1. Try Supabase Auth first
    const { data, error } = await supabase.auth.signInWithPassword({ email: normalizedEmail, password });

    if (!error && data.user) {
      const appUser = await loadAppUser(data.user);
      if (!appUser) {
        return { user: null, error: "Usuário autenticado, mas não encontrado na tabela usuarios" };
      }
      setUser(appUser);
      setSession(data.session);
      syncGlobalState(appUser);
      return { user: appUser, error: null };
    }

    // 2. Fallback: check usuarios table directly (for legacy users not yet in auth.users)
    if (error && error.message.toLowerCase().includes("invalid login credentials")) {
      try {
        const { data: legacyUsers } = await (supabase as any)
          .from("usuarios")
          .select("*")
          .eq("email", normalizedEmail)
          .limit(1);

        const legacyUser = Array.isArray(legacyUsers) ? legacyUsers[0] : null;

        if (!legacyUser) {
          return { user: null, error: "Invalid login credentials" };
        }

        // Verify password against stored hash via RPC
        let passwordValid = false;
        try {
          const { data: hashResult } = await supabase.rpc("hash_password", { plain_text: password }) as any;
          if (hashResult && legacyUser.senha === hashResult) {
            passwordValid = true;
          }
        } catch {
          // If hash_password RPC doesn't exist, compare plain text
          if (legacyUser.senha === password) {
            passwordValid = true;
          }
        }

        if (!passwordValid) {
          return { user: null, error: "Invalid login credentials" };
        }

        // Password matches — migrate user to Supabase Auth
        const { data: signUpData, error: signUpError } = await supabase.auth.signUp({
          email: normalizedEmail,
          password,
          options: { data: { tenant_id: legacyUser.tenant_id } },
        });

        if (signUpError) {
          console.warn("[Auth] Legacy migration signUp failed:", signUpError.message);
          // Even if signup fails, build AppUser from legacy data
          const appUser = await mapAppUser(legacyUser);
          setUser(appUser);
          syncGlobalState(appUser);
          return { user: appUser, error: null };
        }

        // Confirm email automatically
        if (signUpData.user) {
          try {
            await (supabase as any).rpc("confirm_user_email", { p_user_id: signUpData.user.id });
          } catch { /* RPC may not exist */ }

          // Update usuarios row with new auth_user_id
          try {
            await (supabase as any)
              .from("usuarios")
              .update({ id: signUpData.user.id, auth_user_id: signUpData.user.id })
              .eq("email", normalizedEmail);
          } catch { /* best effort */ }
        }

        // Try login again after migration
        const { data: retryData, error: retryError } = await supabase.auth.signInWithPassword({
          email: normalizedEmail,
          password,
        });

        if (!retryError && retryData.user) {
          const appUser = await loadAppUser(retryData.user);
          if (appUser) {
            setUser(appUser);
            setSession(retryData.session);
            syncGlobalState(appUser);
            return { user: appUser, error: null };
          }
        }

        // Final fallback: return legacy user without session
        const appUser = await mapAppUser(legacyUser);
        setUser(appUser);
        syncGlobalState(appUser);
        return { user: appUser, error: null };
      } catch (fallbackErr) {
        console.error("[Auth] Legacy fallback failed:", fallbackErr);
      }
    }

    return { user: null, error: error?.message || "Erro desconhecido" };
  }, []);

  const signUp = useCallback(async (email: string, password: string, metadata?: Record<string, unknown>) => {
    const normalizedEmail = email.trim().toLowerCase();
    const { data, error } = await supabase.auth.signUp({
      email: normalizedEmail,
      password,
      options: {
        data: metadata,
        emailRedirectTo: window.location.origin,
      },
    });

    if (error) return { error: error.message };

    await ensureUserProfile(data.user ?? null, metadata);

    // Auto-confirm email via RPC (bypasses email verification requirement)
    if (data.user) {
      try {
        await (supabase as any).rpc("confirm_user_email", { p_user_id: data.user.id });
      } catch (e) {
        console.warn("[Auth] confirm_user_email RPC not available:", e);
      }

      // Auto-login after signup
      const { data: loginData, error: loginError } = await supabase.auth.signInWithPassword({
        email: normalizedEmail,
        password,
      });
      if (!loginError && loginData.user) {
        const appUser = await loadAppUser(loginData.user);
        if (appUser) {
          setUser(appUser);
          setSession(loginData.session);
          syncGlobalState(appUser);
        }
      }
    }

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
      const appUser = await loadAppUser(session.user);
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
