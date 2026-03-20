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
  login: (email: string, password: string, storeCode?: string) => Promise<{ user: AppUser | null; error: string | null }>;
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
      // If found by email but ID doesn't match auth UID, try to update the ID
      if (strategy.column === "email" && userRow.id !== authUser.id) {
        console.log("[Auth] 🔄 Atualizando usuarios.id para corresponder ao auth UID:", authUser.id);
        const { error: updateError } = await (supabase as any)
          .from("usuarios")
          .update({ id: authUser.id } as any)
          .eq("id", userRow.id);

        if (updateError) {
          console.warn("[Auth] ⚠️ Não foi possível atualizar ID do usuário:", updateError.message);
          // Still return the user with old ID — better than failing completely
        } else {
          userRow.id = authUser.id;
        }
      }
      return mapAppUser(userRow, authUser.id);
    }
  }

  return null;
}

async function hashLegacyPassword(password: string): Promise<string> {
  try {
    const { data } = await supabase.rpc("hash_password", { plain_text: password }) as any;
    return data || password;
  } catch {
    return password;
  }
}

function isEmailNotConfirmedError(error: { message?: string; code?: string } | null | undefined): boolean {
  const message = error?.message?.toLowerCase() ?? "";
  const code = error?.code?.toLowerCase() ?? "";
  return code === "email_not_confirmed" || message.includes("email not confirmed");
}

function isAlreadyRegisteredError(error: { message?: string; code?: string } | null | undefined): boolean {
  const message = error?.message?.toLowerCase() ?? "";
  const code = error?.code?.toLowerCase() ?? "";
  return code === "user_already_exists" || message.includes("already registered") || message.includes("already been registered");
}

function shouldTryLegacyFallback(error: { message?: string; code?: string } | null | undefined): boolean {
  const message = error?.message?.toLowerCase() ?? "";
  return isEmailNotConfirmedError(error) || message.includes("invalid login credentials");
}

async function attemptConfirmedLogin(userId: string, email: string, password: string) {
  try {
    await (supabase as any).rpc("confirm_user_email", { p_user_id: userId });
  } catch (confirmError) {
    console.warn("[Auth] confirm_user_email retry failed:", confirmError);
  }

  const retry = await supabase.auth.signInWithPassword({ email, password });
  return !retry.error && retry.data.user ? retry.data : null;
}

async function resolveTenantIdByStoreCode(storeCode?: string | null): Promise<string | null> {
  const digits = storeCode?.replace(/\D/g, "") ?? "";
  if (digits.length !== 6) return null;

  const maskedCode = `${digits.slice(0, 3)}.${digits.slice(3)}`;
  const candidates = Array.from(new Set([digits, maskedCode]));

  const { data } = await supabase
    .from("tenants")
    .select("id, codigo_loja")
    .in("codigo_loja", candidates)
    .limit(candidates.length);

  const tenant = data?.find((row) => (row.codigo_loja ?? "").replace(/\D/g, "") === digits);
  return tenant?.id ?? null;
}

async function ensureUserProfile(authUser: SupabaseAuthUser | null, metadata?: Record<string, unknown>, password?: string) {
  if (!authUser || !metadata?.tenant_id) return;

  const normalizedEmail = authUser.email?.trim().toLowerCase() ?? null;

  const { data: byId } = await (supabase as any)
    .from("usuarios")
    .select("id, email, senha")
    .eq("id", authUser.id)
    .limit(1);

  let existingUser = Array.isArray(byId) ? byId[0] : byId;

  if (!existingUser && normalizedEmail) {
    const { data: byEmail } = await (supabase as any)
      .from("usuarios")
      .select("id, email, senha")
      .eq("email", normalizedEmail)
      .limit(1);

    existingUser = Array.isArray(byEmail) ? byEmail[0] : byEmail;
  }

  const senhaHash = password ? await hashLegacyPassword(password) : null;

  const basePayload = {
    nome_completo: (metadata.nome_completo as string) || authUser.email?.split("@")[0] || "Usuário",
    apelido: (metadata.apelido as string) || null,
    email: authUser.email?.trim().toLowerCase() || null,
    cargo_id: (metadata.cargo_id as string) || null,
    tenant_id: metadata.tenant_id as string,
    primeiro_login: true,
    ativo: true,
    ...(senhaHash ? { senha: senhaHash } : {}),
  };

  if (existingUser) {
    const updatePayload: Record<string, unknown> = {
      ...basePayload,
      ...(existingUser.id !== authUser.id ? { id: authUser.id } : {}),
    };

    let { error } = await supabase
      .from("usuarios")
      .update(updatePayload as any)
      .eq("id", existingUser.id);

    if (error && existingUser.id !== authUser.id) {
      const { id: _ignored, ...fallbackPayload } = updatePayload;
      const retry = await supabase
        .from("usuarios")
        .update(fallbackPayload as any)
        .eq("id", existingUser.id);

      error = retry.error;
    }

    if (error) {
      console.warn("[Auth] Failed to update existing user profile after sign up:", error.message);
    }

    return;
  }

  const payload = {
    id: authUser.id,
    ...basePayload,
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
    console.log("[Auth] 🔄 loadFromSession: carregando usuário para auth UID:", sess.user.id, "email:", sess.user.email);

    let appUser: AppUser | null = null;
    try {
      appUser = await Promise.race([
        loadAppUser(sess.user),
        new Promise<null>((resolve) => setTimeout(() => resolve(null), 8000)),
      ]);
    } catch (e) {
      console.warn("[Auth] ⚠️ loadAppUser falhou:", e);
    }

    if (appUser) {
      console.log("[Auth] ✅ Usuário carregado da sessão:", appUser.nome_completo);
      setUser(appUser);
      syncGlobalState(appUser);
    } else {
      console.log("[Auth] ⚠️ Usuário não encontrado para sessão, fazendo signout...");
      setUser(null);
      syncGlobalState(null);
      // Sign out invalid session to avoid infinite loading
      await supabase.auth.signOut();
      setSession(null);
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

  const login = useCallback(async (email: string, password: string, storeCode?: string) => {
    const normalizedEmail = email.trim().toLowerCase();
    const normalizedStoreCode = storeCode?.replace(/\D/g, "") ?? "";

    const finalizeLogin = async (authData: { user: SupabaseAuthUser | null; session: Session | null }) => {
      if (!authData.user) {
        return { user: null, error: "Usuário autenticado, mas não encontrado na sessão" };
      }

      const appUser = await loadAppUser(authData.user);
      if (!appUser) {
        return { user: null, error: "Usuário autenticado, mas não encontrado na tabela usuarios" };
      }

      setUser(appUser);
      setSession(authData.session);
      syncGlobalState(appUser);
      return { user: appUser, error: null };
    };

    // 1. Try Supabase Auth first
    const { data, error } = await supabase.auth.signInWithPassword({ email: normalizedEmail, password });

    if (!error && data.user) {
      console.log("[Auth] ✅ Login direto via Supabase Auth bem-sucedido para:", normalizedEmail);
      return finalizeLogin(data);
    }

    console.log("[Auth] ⚠️ Login direto falhou:", error?.code, error?.message, "| Tentando fallback legado...");

    // 2. If email_not_confirmed, try to confirm and retry BEFORE legacy fallback
    if (error && isEmailNotConfirmedError(error)) {
      console.log("[Auth] 📧 Email não confirmado — tentando buscar usuário e confirmar...");

      // Look up user by email in usuarios to get their ID for confirm RPC
      const { data: emailUsers } = await (supabase as any)
        .from("usuarios")
        .select("id")
        .eq("email", normalizedEmail)
        .limit(5);

      const emailUserList = Array.isArray(emailUsers) ? emailUsers : emailUsers ? [emailUsers] : [];

      for (const eu of emailUserList) {
        console.log("[Auth] 📧 Tentando confirmar email para user id:", eu.id);
        const result = await attemptConfirmedLogin(eu.id, normalizedEmail, password);
        if (result) {
          console.log("[Auth] ✅ Login após confirmação de email bem-sucedido para:", normalizedEmail);
          return finalizeLogin(result);
        }
      }

      // Also try with the email itself as user ID (some schemas use auth UUID directly)
      try {
        // Try to get auth user ID from admin API or just attempt confirm with a direct signUp approach
        const { data: signUpRetry, error: signUpRetryErr } = await supabase.auth.signUp({
          email: normalizedEmail,
          password,
          options: { emailRedirectTo: window.location.origin },
        });

        if (signUpRetryErr && isAlreadyRegisteredError(signUpRetryErr)) {
          console.log("[Auth] 📧 Usuário já registrado, tentando confirmar via lista de IDs conhecidos...");
        }

        if (signUpRetry?.user) {
          console.log("[Auth] 📧 Confirmando email do auth user:", signUpRetry.user.id);
          const result = await attemptConfirmedLogin(signUpRetry.user.id, normalizedEmail, password);
          if (result) {
            console.log("[Auth] ✅ Login após re-signup e confirmação bem-sucedido");
            return finalizeLogin(result);
          }
        }
      } catch (e) {
        console.warn("[Auth] ⚠️ Tentativa de re-signup falhou:", e);
      }

      console.log("[Auth] ⚠️ Não foi possível confirmar email automaticamente");
    }

    // 3. Fallback: check usuarios table directly (for legacy users not yet in auth.users)
    if (error && shouldTryLegacyFallback(error)) {
      try {
        const tenantIdFromCode = normalizedStoreCode.length === 6
          ? await resolveTenantIdByStoreCode(normalizedStoreCode)
          : null;

        console.log("[Auth] 🔍 Código da loja resolvido para tenant_id:", tenantIdFromCode);

        if (normalizedStoreCode.length === 6 && !tenantIdFromCode) {
          console.log("[Auth] ❌ Código da loja não encontrado no banco");
          return { user: null, error: "Código da loja não encontrado. Verifique o código informado." };
        }

        const { data: legacyUsers } = await (supabase as any)
          .from("usuarios")
          .select("*")
          .eq("email", normalizedEmail)
          .limit(10);

        const legacyList = Array.isArray(legacyUsers) ? legacyUsers : legacyUsers ? [legacyUsers] : [];

        console.log("[Auth] 🔍 Usuários encontrados com email", normalizedEmail, ":", legacyList.length);

        if (legacyList.length === 0) {
          return { user: null, error: "Email não encontrado no sistema. Verifique o email digitado." };
        }

        const legacyUser = legacyList.find((candidate) => {
          if (!tenantIdFromCode) return true;
          return candidate.tenant_id === tenantIdFromCode;
        }) ?? legacyList[0] ?? null;

        if (!legacyUser) {
          return { user: null, error: "Email não encontrado no sistema. Verifique o email digitado." };
        }

        if (tenantIdFromCode && legacyUser.tenant_id !== tenantIdFromCode) {
          console.log("[Auth] ❌ Usuário existe mas não pertence à loja informada. tenant esperado:", tenantIdFromCode, "| tenant do usuário:", legacyUser.tenant_id);
          return { user: null, error: "Este email não está vinculado ao código da loja informado." };
        }

        console.log("[Auth] 👤 Usuário legado encontrado:", legacyUser.id, legacyUser.nome_completo, "| tenant:", legacyUser.tenant_id);

        if (isEmailNotConfirmedError(error)) {
          console.log("[Auth] 📧 Tentando confirmar email e relogar...");
          const confirmedLogin = await attemptConfirmedLogin(legacyUser.id, normalizedEmail, password);
          if (confirmedLogin) {
            console.log("[Auth] ✅ Login após confirmação de email bem-sucedido");
            return finalizeLogin(confirmedLogin);
          }
          console.log("[Auth] ⚠️ Confirmação de email falhou, continuando fluxo legado...");
        }

        if (legacyUser.ativo === false) {
          console.log("[Auth] ❌ Usuário inativo:", legacyUser.id);
          return { user: null, error: "Usuário inativo" };
        }

        // Verify password against stored hash via RPC
        let passwordValid = false;
        if (legacyUser.senha) {
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
        }

        if (!passwordValid && !legacyUser.senha) {
          const { data: signUpData, error: signUpError } = await supabase.auth.signUp({
            email: normalizedEmail,
            password,
            options: {
              data: {
                tenant_id: legacyUser.tenant_id,
                cargo_id: legacyUser.cargo_id ?? null,
                nome_completo: legacyUser.nome_completo ?? normalizedEmail.split("@")[0],
                apelido: legacyUser.apelido ?? null,
              },
              emailRedirectTo: window.location.origin,
            },
          });

          if (signUpError && !isAlreadyRegisteredError(signUpError)) {
            console.warn("[Auth] Failed to recreate missing auth account:", signUpError.message);
          }

          if (signUpError && isAlreadyRegisteredError(signUpError)) {
            const confirmedLogin = await attemptConfirmedLogin(legacyUser.id, normalizedEmail, password);
            if (confirmedLogin) {
              return finalizeLogin(confirmedLogin);
            }
          }

          if (signUpData.user) {
            try {
              await (supabase as any).rpc("confirm_user_email", { p_user_id: signUpData.user.id });
            } catch { /* RPC may not exist */ }

            try {
              const senhaHash = await hashLegacyPassword(password);
              await (supabase as any)
                .from("usuarios")
                .update({ senha: senhaHash, id: signUpData.user.id })
                .eq("id", legacyUser.id);
            } catch {
              /* best effort */
            }
          }

          const retryProvision = await supabase.auth.signInWithPassword({
            email: normalizedEmail,
            password,
          });

          if (!retryProvision.error && retryProvision.data.user) {
            return finalizeLogin(retryProvision.data);
          }

          if (isEmailNotConfirmedError(retryProvision.error)) {
            const confirmedLogin = await attemptConfirmedLogin(legacyUser.id, normalizedEmail, password);
            if (confirmedLogin) {
              return finalizeLogin(confirmedLogin);
            }
          }
        }

        if (!passwordValid) {
          console.log("[Auth] ❌ Senha inválida para usuário legado:", legacyUser.id);
          return { user: null, error: "Senha incorreta. Verifique sua senha e tente novamente." };
        }

        // Password matches — migrate user to Supabase Auth
        console.log("[Auth] 🔄 Senha válida, migrando usuário para Supabase Auth...");
        const { data: signUpData, error: signUpError } = await supabase.auth.signUp({
          email: normalizedEmail,
          password,
          options: { data: { tenant_id: legacyUser.tenant_id } },
        });

        if (signUpError) {
          console.warn("[Auth] Legacy migration signUp failed:", signUpError.message);

          if (isAlreadyRegisteredError(signUpError)) {
            const confirmedLogin = await attemptConfirmedLogin(legacyUser.id, normalizedEmail, password);
            if (confirmedLogin) {
              return finalizeLogin(confirmedLogin);
            }
          }

          return { user: null, error: signUpError.message || "Não foi possível concluir o login desta conta." };
        }

        // Confirm email automatically
        if (signUpData.user) {
          try {
            await (supabase as any).rpc("confirm_user_email", { p_user_id: signUpData.user.id });
          } catch { /* RPC may not exist */ }

          // Update usuarios row with the auth user id for JWT-based flows
          try {
            const senhaHash = await hashLegacyPassword(password);
            await (supabase as any)
              .from("usuarios")
              .update({ id: signUpData.user.id, senha: senhaHash })
              .eq("id", legacyUser.id);
          } catch { /* best effort */ }
        }

        // Try login again after migration
        const { data: retryData, error: retryError } = await supabase.auth.signInWithPassword({
          email: normalizedEmail,
          password,
        });

        if (!retryError && retryData.user) {
          return finalizeLogin(retryData);
        }

        if (isEmailNotConfirmedError(retryError)) {
          const confirmedLogin = await attemptConfirmedLogin(legacyUser.id, normalizedEmail, password);
          if (confirmedLogin) {
            return finalizeLogin(confirmedLogin);
          }
        }

        return { user: null, error: "Não foi possível concluir o login desta conta." };
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

    await ensureUserProfile(data.user ?? null, metadata, password);

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
      } else if (isEmailNotConfirmedError(loginError)) {
        const confirmedLogin = await attemptConfirmedLogin(data.user.id, normalizedEmail, password);
        if (confirmedLogin) {
          const appUser = await loadAppUser(confirmedLogin.user);
          if (appUser) {
            setUser(appUser);
            setSession(confirmedLogin.session);
            syncGlobalState(appUser);
          }
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
