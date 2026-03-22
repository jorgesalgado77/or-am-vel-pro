import { createContext, useContext, useState, useEffect, useCallback, useRef, type ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";
import { setTenantState } from "@/lib/tenantState";
import type { CargoPermissoes } from "@/hooks/useCargos";
import { logLoginDiagnostic } from "@/services/loginDiagnosticService";
import type { Session, User as SupabaseAuthUser } from "@supabase/supabase-js";
import { InactivityWarningDialog } from "@/components/InactivityWarningDialog";

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
  folha_pagamento: true,
  financeiro: true,
  planos: true,
  funil: true,
  campanhas: true,
  indicacoes: true,
  vendazap: true,
  chat_vendas: true,
  dealroom: true,
  divulgue_ganhe: true,
  mensagens: true,
  suporte: true,
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

  const { data: cargo } = await withTimeout(
    (async () => await supabase
      .from("cargos")
      .select("nome, permissoes")
      .eq("id", cargoId)
      .maybeSingle())(),
    1200,
    { data: null, error: null } as any,
  );

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
    telefone: userRow.telefone ?? userRow.telefone_whatsapp ?? null,
    cargo_id: userRow.cargo_id,
    cargo_nome,
    foto_url: userRow.foto_url,
    tenant_id: userRow.tenant_id ?? null,
    auth_user_id: userRow.auth_user_id ?? authUserId ?? null,
    permissoes,
  };
}

function normalizeEmail(value: string | null | undefined): string | null {
  const normalized = value?.trim().toLowerCase();
  return normalized || null;
}

async function withTimeout<T>(promise: Promise<T>, ms: number, fallback: T): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((resolve) => setTimeout(() => resolve(fallback), ms)),
  ]);
}

function createTimeoutError(label: string) {
  return { message: `timeout_${label}`, code: "TIMEOUT" };
}

function mapRpcAppUser(userRow: any, authUserId?: string | null): AppUser {
  return {
    id: userRow.id ?? authUserId ?? "",
    nome_completo: userRow.nome_completo ?? "Usuário",
    apelido: userRow.apelido ?? null,
    email: userRow.email ?? null,
    telefone: userRow.telefone ?? userRow.telefone_whatsapp ?? null,
    cargo_id: userRow.cargo_id ?? null,
    cargo_nome: userRow.cargo_nome ?? null,
    foto_url: userRow.foto_url ?? null,
    tenant_id: userRow.tenant_id ?? null,
    auth_user_id: userRow.auth_user_id ?? authUserId ?? null,
    permissoes: (userRow.permissoes as CargoPermissoes) ?? DEFAULT_PERMS,
  };
}

async function buildFallbackUserFromAuth(
  authUser: Pick<SupabaseAuthUser, "id" | "email" | "user_metadata">
): Promise<AppUser | null> {
  // Try direct DB lookup first to get real user data
  try {
    const { data: dbUser, error } = await withTimeout(
      (async () => await supabase
        .from("usuarios")
        .select("*")
        .eq("auth_user_id", authUser.id)
        .maybeSingle())(),
      1200,
      { data: null, error: createTimeoutError("fallback_user_lookup") } as any,
    );

    if (error) {
      console.warn("[Auth] Fallback lookup por auth_user_id falhou:", error.message);
    }

    if (dbUser) {
      return mapAppUser(dbUser, authUser.id);
    }
  } catch {
    // fall through to metadata fallback
  }

  const metadata = (authUser.user_metadata as Record<string, unknown> | undefined) ?? undefined;
  const tenantId = (metadata?.tenant_id as string | undefined) ?? null;

  if (!tenantId) return null;

  const cargoId = (metadata?.cargo_id as string | undefined) ?? null;
  const { cargo_nome, permissoes } = await resolveCargo(cargoId);

  return {
    id: authUser.id,
    nome_completo: (metadata?.nome_completo as string) || authUser.email?.split("@")[0] || "Usuário",
    apelido: (metadata?.apelido as string) || null,
    email: normalizeEmail(authUser.email),
    telefone: (metadata?.telefone as string) || null,
    cargo_id: cargoId,
    cargo_nome: cargo_nome ?? (cargoId ? "Administrador" : null),
    foto_url: null,
    tenant_id: tenantId,
    auth_user_id: authUser.id,
    permissoes,
  };
}

async function loadAppUserViaRpc(
  authUser: Pick<SupabaseAuthUser, "id" | "email">
): Promise<AppUser | null> {
  try {
    const { data, error } = await withTimeout(
      (supabase as any).rpc("get_current_app_user"),
      1200,
      { data: null, error: createTimeoutError("get_current_app_user") } as any,
    );
    const userRow = Array.isArray(data) ? data[0] : data;

    if (error) {
      console.warn("[Auth] RPC get_current_app_user falhou:", error.message);
      return null;
    }

    if (!userRow) return null;
    return mapRpcAppUser(userRow, authUser.id);
  } catch (error) {
    console.warn("[Auth] RPC get_current_app_user indisponível:", error);
    return null;
  }
}

/**
 * Compat layer for external databases:
 * - prefers usuarios.id = auth.uid()
 * - falls back to usuarios.email when the schema does not store auth_user_id
 * - falls back to RPC / JWT metadata when RLS blocks direct reads
 */
async function loadAppUser(authUser: Pick<SupabaseAuthUser, "id" | "email" | "user_metadata">): Promise<AppUser | null> {
  // Try RPC first — it bypasses RLS issues and returns cargo_nome directly
  const rpcUser = await loadAppUserViaRpc(authUser);
  if (rpcUser) return rpcUser;

  // Fallback: direct queries when RPC is unavailable
  const normalizedEmail = normalizeEmail(authUser.email);
  const lookupStrategies: Array<{ label: string; query: (() => Promise<{ data: any; error: any }>) | null }> = [
    {
      label: "id",
      query: () => (supabase as any)
        .from("usuarios")
        .select("*")
        .eq("id", authUser.id)
        .limit(1),
    },
    {
      label: "auth_user_id",
      query: () => (supabase as any)
        .from("usuarios")
        .select("*")
        .eq("auth_user_id", authUser.id)
        .limit(1),
    },
    normalizedEmail ? {
      label: "email",
      query: () => (supabase as any)
        .from("usuarios")
        .select("*")
        .ilike("email", normalizedEmail)
        .limit(10),
    } : null,
  ];

  for (const strategy of lookupStrategies) {
    if (!strategy?.query) continue;

    const { data, error } = await withTimeout(
      strategy.query(),
      1800,
      { data: null, error: { message: `timeout_${strategy.label}` } } as any,
    );
    const userList = Array.isArray(data) ? data : data ? [data] : [];
    const userRow = strategy.label === "email"
      ? userList.find((candidate) => normalizeEmail(candidate?.email) === normalizedEmail) ?? userList[0]
      : userList[0];

    if (error) {
      console.warn(`[Auth] Failed to load user by ${strategy.label}:`, error.message);
      continue;
    }

    if (userRow) {
      const needsAuthLink = userRow.auth_user_id !== authUser.id;
      const needsEmailNormalization = normalizedEmail && normalizeEmail(userRow.email) !== normalizedEmail;

      if (needsAuthLink || needsEmailNormalization) {
        const { error: updateError } = await withTimeout(
          (supabase as any)
            .from("usuarios")
            .update({
              ...(needsAuthLink ? { auth_user_id: authUser.id } : {}),
              ...(needsEmailNormalization ? { email: normalizedEmail } : {}),
            } as any)
            .eq("id", userRow.id),
          1200,
          { error: { message: "timeout_update_usuario" } } as any,
        );

        if (updateError) {
          console.warn("[Auth] ⚠️ Não foi possível sincronizar vínculo do usuário:", updateError.message);
        } else {
          if (needsAuthLink) userRow.auth_user_id = authUser.id;
          if (needsEmailNormalization) userRow.email = normalizedEmail;
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

  const retry = await withTimeout(
    supabase.auth.signInWithPassword({ email, password }),
    4500,
    {
      data: { user: null, session: null },
      error: createTimeoutError("confirmed_sign_in"),
    } as any,
  );
  return !retry.error && retry.data.user ? retry.data : null;
}

async function signInWithPasswordFast(email: string, password: string) {
  try {
    return await withTimeout(
      supabase.auth.signInWithPassword({ email, password }),
      4500,
      {
        data: { user: null, session: null },
        error: createTimeoutError("sign_in"),
      } as any,
    );
  } catch (error: any) {
    console.warn("[Auth] signInWithPassword lançou exceção:", error?.message || error);
    return {
      data: { user: null, session: null },
      error: {
        message: error?.message || "sign_in_exception",
        code: error?.code || "SIGN_IN_EXCEPTION",
      },
    } as any;
  }
}

async function resolveTenantIdByStoreCode(storeCode?: string | null): Promise<string | null> {
  const digits = storeCode?.replace(/\D/g, "") ?? "";
  if (digits.length !== 6) return null;

  const maskedCode = `${digits.slice(0, 3)}.${digits.slice(3)}`;
  const candidates = Array.from(new Set([digits, maskedCode]));


  const [directResult, rpcResult] = await Promise.all([
    withTimeout(
      (async () => await supabase
        .from("tenants")
        .select("id, codigo_loja")
        .in("codigo_loja", candidates)
        .limit(candidates.length))(),
      1200,
      { data: null, error: createTimeoutError("tenant_direct_lookup") } as any,
    ),
    withTimeout(
      (supabase as any).rpc("resolve_tenant_by_code", { p_code: maskedCode }),
      1200,
      { data: null, error: createTimeoutError("tenant_rpc_lookup") } as any,
    ),
  ]);

  if (directResult.error) {
    console.warn("[Auth:TenantResolve] ❌ Strategy 1 (direct query) FALHOU:", directResult.error.message);
  } else {
  }

  const tenant = directResult.data?.find((row) => (row.codigo_loja ?? "").replace(/\D/g, "") === digits);
  if (tenant) {
    return tenant.id;
  }

  const rpcData = rpcResult.data;
  const rpcError = rpcResult.error;
  if (rpcError) {
    console.warn("[Auth:TenantResolve] ❌ Strategy 2 FALHOU:", rpcError.message);
  } else if (rpcData) {
    const resolvedId = typeof rpcData === "string" ? rpcData : rpcData?.tenant_id ?? rpcData?.id ?? null;
    if (resolvedId) {
      return resolvedId;
    }
  } else {
  }

  return null;
}

async function ensureUserProfile(authUser: SupabaseAuthUser | null, metadata?: Record<string, unknown>, password?: string) {
  if (!authUser || !metadata?.tenant_id) return;

  const normalizedEmail = normalizeEmail(authUser.email);
  let existingUser: any = null;

  const existingLookups: Array<(() => Promise<{ data: any; error: any }>) | null> = [
    () => (supabase as any)
      .from("usuarios")
      .select("id, auth_user_id, email, senha")
      .eq("id", authUser.id)
      .limit(1),
    () => (supabase as any)
      .from("usuarios")
      .select("id, auth_user_id, email, senha")
      .eq("auth_user_id", authUser.id)
      .limit(1),
    normalizedEmail ? () => (supabase as any)
      .from("usuarios")
      .select("id, auth_user_id, email, senha")
      .ilike("email", normalizedEmail)
      .limit(10) : null,
  ];

  for (const lookup of existingLookups) {
    if (!lookup || existingUser) continue;
    const { data } = await lookup();
    const resultList = Array.isArray(data) ? data : data ? [data] : [];
    existingUser = resultList.find((candidate) => normalizeEmail(candidate?.email) === normalizedEmail) ?? resultList[0] ?? null;
  }

  const senhaHash = password ? await hashLegacyPassword(password) : null;

  // If no cargo_id provided, try to find an admin cargo for this tenant
  let cargoId = (metadata.cargo_id as string) || null;
  if (!cargoId && metadata.tenant_id) {
    const { data: adminCargo } = await supabase
      .from("cargos")
      .select("id")
      .eq("tenant_id", metadata.tenant_id as string)
      .ilike("nome", "%admin%")
      .limit(1)
      .maybeSingle();
    if (adminCargo) cargoId = adminCargo.id;
  }

  const basePayload = {
    nome_completo: (metadata.nome_completo as string) || authUser.email?.split("@")[0] || "Usuário",
    apelido: (metadata.apelido as string) || null,
    email: authUser.email?.trim().toLowerCase() || null,
    cargo_id: cargoId,
    tenant_id: metadata.tenant_id as string,
    telefone: (metadata.telefone as string) || null,
    primeiro_login: true,
    ativo: true,
    ...(senhaHash ? { senha: senhaHash } : {}),
  };

  if (existingUser) {
    // Only update auth linkage fields — never overwrite nome_completo or other
    // user-editable fields that may have been customized after initial creation.
    const linkPayload: Record<string, unknown> = {
      auth_user_id: authUser.id,
      email: authUser.email?.trim().toLowerCase() || existingUser.email,
      tenant_id: metadata.tenant_id as string,
    };

    // Only set nome_completo if the existing one is empty/default
    if (!existingUser.nome_completo || existingUser.nome_completo === "Usuário") {
      linkPayload.nome_completo = basePayload.nome_completo;
    }

    const { error } = await supabase
      .from("usuarios")
      .update(linkPayload as any)
      .eq("id", existingUser.id);

    if (error) {
      console.warn("[Auth] Failed to update existing user profile after sign up:", error.message);
    }

    return;
  }

  const payload = {
    id: authUser.id,
    auth_user_id: authUser.id,
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
  const loginInProgressRef = useRef(false);

  const loadFromSession = useCallback(async (sess: Session | null) => {
    if (!sess?.user) {
      setUser(null);
      setSession(null);
      syncGlobalState(null);
      setLoading(false);
      return;
    }

    setSession(sess);

    if (loginInProgressRef.current) {
      return;
    }


    let appUser: AppUser | null = null;
    try {
      appUser = await Promise.race([
        loadAppUser(sess.user),
        new Promise<null>((resolve) => setTimeout(() => resolve(null), 4000)),
      ]);

      if (!appUser) {
        await withTimeout(
          ensureUserProfile(sess.user, (sess.user.user_metadata as Record<string, unknown>) ?? undefined),
          1200,
          undefined,
        );
        appUser = await withTimeout(loadAppUser(sess.user), 1500, null);
      }
    } catch (e) {
      console.warn("[Auth] ⚠️ loadAppUser falhou:", e);
    }

    if (appUser) {
      setUser(appUser);
      syncGlobalState(appUser);
    } else {
      const fallbackUser = await buildFallbackUserFromAuth(sess.user);

      if (fallbackUser) {
        setUser(fallbackUser);
        syncGlobalState(fallbackUser);
      } else {
        setUser(null);
        syncGlobalState(null);
        await withTimeout(supabase.auth.signOut(), 1000, undefined as any);
        setSession(null);
      }
    }

    setLoading(false);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    let initialLoaded = false;

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (_event, sess) => {
        // Skip if this is the initial session event and getSession already handled it
        if (_event === "INITIAL_SESSION") {
          if (initialLoaded) return;
          initialLoaded = true;
        }
        await loadFromSession(sess);
      }
    );

    supabase.auth.getSession().then(({ data: { session: sess } }) => {
      if (!initialLoaded) {
        initialLoaded = true;
        loadFromSession(sess);
      }
    });

    // Safety net: if nothing resolves in 5s, stop loading
    const safetyTimeout = setTimeout(() => {
      setLoading((prev) => {
        if (prev) console.warn("[Auth] ⏰ Safety timeout: forçando fim do loading");
        return false;
      });
    }, 5000);

    return () => {
      subscription.unsubscribe();
      clearTimeout(safetyTimeout);
    };
  }, [loadFromSession]);

  const login = useCallback(async (email: string, password: string, storeCode?: string) => {
    loginInProgressRef.current = true;

    try {
      const normalizedEmail = email.trim().toLowerCase();
      const normalizedStoreCode = storeCode?.replace(/\D/g, "") ?? "";
      const tenantResolutionPromise = normalizedStoreCode.length === 6
        ? resolveTenantIdByStoreCode(normalizedStoreCode)
        : Promise.resolve<string | null>(null);

      let resolvedTenantId: string | null = null;

      const finalizeLogin = async (authData: { user: SupabaseAuthUser | null; session: Session | null }) => {
        if (!authData.user) {
          return { user: null, error: "Usuário autenticado, mas não encontrado na sessão" };
        }

        const metaTenantId = (authData.user.user_metadata as any)?.tenant_id as string | undefined;
        if (!resolvedTenantId && metaTenantId) {
          resolvedTenantId = metaTenantId;
        }

        if (normalizedStoreCode.length === 6 && !resolvedTenantId) {
          resolvedTenantId = await withTimeout(tenantResolutionPromise, 1400, null);

          if (!resolvedTenantId) {
            const fallbackMetaTenantId = (authData.user.user_metadata as any)?.tenant_id as string | undefined;
            if (fallbackMetaTenantId) {
              resolvedTenantId = fallbackMetaTenantId;
            }
          }

          if (!resolvedTenantId) {
            return { user: null, error: "Código da loja não encontrado. Verifique o código informado." };
          }

        }

        const metadata = {
          ...((authData.user.user_metadata as Record<string, unknown>) ?? {}),
          ...(resolvedTenantId ? { tenant_id: resolvedTenantId } : {}),
        };

        let appUser = await withTimeout(loadAppUser(authData.user), 1500, null);
        let usedFallbackUser = false;

        if (!appUser) {
          appUser = await buildFallbackUserFromAuth({
            id: authData.user.id,
            email: authData.user.email,
            user_metadata: metadata,
          });
          usedFallbackUser = Boolean(appUser);
        }

        if (!appUser) {
          await withTimeout(ensureUserProfile(authData.user, metadata, password), 1200, undefined);
          appUser = await withTimeout(loadAppUser(authData.user), 1200, null);

          if (!appUser) {
            appUser = await buildFallbackUserFromAuth({
              id: authData.user.id,
              email: authData.user.email,
              user_metadata: metadata,
            });
            usedFallbackUser = Boolean(appUser);
          }
        }

        if (!appUser) {
          logLoginDiagnostic({ email: normalizedEmail, codigo_loja: normalizedStoreCode, tenant_id: resolvedTenantId, auth_user_id: authData.user.id, resultado: "falha_vinculo", detalhes: { motivo: "Perfil não encontrado na tabela usuarios" } });
          return { user: null, error: "Usuário autenticado, mas não encontrado na tabela usuarios" };
        }

        if (resolvedTenantId && appUser.tenant_id && appUser.tenant_id !== resolvedTenantId) {
          logLoginDiagnostic({ email: normalizedEmail, codigo_loja: normalizedStoreCode, tenant_id: resolvedTenantId, usuario_id: appUser.id, cargo_nome: appUser.cargo_nome, resultado: "falha_tenant", detalhes: { tenant_usuario: appUser.tenant_id, tenant_esperado: resolvedTenantId } });
          return { user: null, error: "Este email não está vinculado ao código da loja informado." };
        }

        logLoginDiagnostic({ email: normalizedEmail, codigo_loja: normalizedStoreCode, tenant_id: appUser.tenant_id, usuario_id: appUser.id, cargo_nome: appUser.cargo_nome, auth_user_id: authData.user.id, resultado: "sucesso" });
        setUser(appUser);
        setSession(authData.session);
        syncGlobalState(appUser);

        if (usedFallbackUser) {
          void (async () => {
            await withTimeout(ensureUserProfile(authData.user, metadata, password), 1500, undefined);
            const refreshedUser = await withTimeout(loadAppUser(authData.user), 1500, null);

            if (refreshedUser) {
              setUser(refreshedUser);
              syncGlobalState(refreshedUser);
            }
          })();
        }

        return { user: appUser, error: null };
      };

      const { data, error } = await signInWithPasswordFast(normalizedEmail, password);

      if (!error && data.user) {
        resolvedTenantId = (data.user.user_metadata as any)?.tenant_id ?? null;
        return finalizeLogin(data);
      }

      resolvedTenantId = await withTimeout(tenantResolutionPromise, 1400, null);

      // 2. If email_not_confirmed, try to confirm and retry BEFORE legacy fallback
    if (error && isEmailNotConfirmedError(error)) {

      // Look up user by email in usuarios to get their ID for confirm RPC
      const { data: emailUsers } = await withTimeout(
        (supabase as any)
          .from("usuarios")
          .select("id")
          .eq("email", normalizedEmail)
          .limit(5),
        1200,
        { data: null, error: createTimeoutError("email_lookup_for_confirm") } as any,
      );

      const emailUserList = Array.isArray(emailUsers) ? emailUsers : emailUsers ? [emailUsers] : [];

      for (const eu of emailUserList) {
        const result = await attemptConfirmedLogin(eu.id, normalizedEmail, password);
        if (result) {
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
        }

        if (signUpRetry?.user) {
          const result = await attemptConfirmedLogin(signUpRetry.user.id, normalizedEmail, password);
          if (result) {
            return finalizeLogin(result);
          }
        }
      } catch (e) {
        console.warn("[Auth] ⚠️ Tentativa de re-signup falhou:", e);
      }

    }

    // 3. Fallback: check usuarios table via SECURITY DEFINER RPC (bypasses RLS for unauthenticated users)
    if (error && shouldTryLegacyFallback(error)) {
      try {
        const tenantIdFromCode = resolvedTenantId;


          // Use RPC that bypasses RLS, then fallback to direct query
          let legacyUsers: any[] = [];
          let legacyUsersError: any = null;

          // Strategy 1: RPC validate_legacy_login (SECURITY DEFINER — bypasses RLS)
          try {
            const { data: rpcResult, error: rpcErr } = await withTimeout(
              (supabase as any).rpc("validate_legacy_login", {
                p_email: normalizedEmail,
                p_tenant_id: tenantIdFromCode || null,
              }),
              1800,
              { data: null, error: createTimeoutError("legacy_rpc_lookup") } as any,
            );

            if (rpcErr) {
              console.warn("[Auth] RPC validate_legacy_login falhou:", rpcErr.message, "| Tentando query direta...");
              legacyUsersError = rpcErr;
            } else {
              legacyUsers = Array.isArray(rpcResult) ? rpcResult : rpcResult ? [rpcResult] : [];
            }
          } catch (rpcCatchErr) {
            console.warn("[Auth] RPC validate_legacy_login indisponível:", rpcCatchErr);
          }

          // Strategy 2: Direct query fallback (works if there's a residual session)
          if (legacyUsers.length === 0) {
            const { data: directData, error: directErr } = await withTimeout(
              (supabase as any)
                .from("usuarios")
                .select("*")
                .eq("email", normalizedEmail)
                .limit(10),
              1400,
              { data: null, error: createTimeoutError("legacy_user_lookup") } as any,
            );

            if (directErr) {
              console.warn("[Auth] Lookup direto de usuários falhou:", directErr.message);
              if (!legacyUsersError) legacyUsersError = directErr;
            } else {
              legacyUsers = Array.isArray(directData) ? directData : directData ? [directData] : [];
            }
          }


        if (legacyUsers.length === 0) {
          logLoginDiagnostic({ email: normalizedEmail, codigo_loja: normalizedStoreCode, tenant_id: tenantIdFromCode, resultado: "falha_credencial", detalhes: { motivo: "Email não encontrado" } });
          return { user: null, error: "Email não encontrado no sistema. Verifique o email digitado." };
        }

        const legacyUser = legacyUsers.find((candidate: any) => {
          if (!tenantIdFromCode) return true;
          return candidate.tenant_id === tenantIdFromCode;
        }) ?? legacyUsers[0] ?? null;

        if (!legacyUser) {
          return { user: null, error: "Email não encontrado no sistema. Verifique o email digitado." };
        }

        if (tenantIdFromCode && legacyUser.tenant_id !== tenantIdFromCode) {
          return { user: null, error: "Este email não está vinculado ao código da loja informado." };
        }


        if (isEmailNotConfirmedError(error)) {
          const confirmedLogin = await attemptConfirmedLogin(legacyUser.id, normalizedEmail, password);
          if (confirmedLogin) {
            return finalizeLogin(confirmedLogin);
          }
        }

        if (legacyUser.ativo === false) {
          logLoginDiagnostic({ email: normalizedEmail, codigo_loja: normalizedStoreCode, tenant_id: legacyUser.tenant_id, usuario_id: legacyUser.id, resultado: "falha_inativo" });
          return { user: null, error: "Usuário inativo" };
        }

        // Verify password against stored hash via RPC
        let passwordValid = false;
        if (legacyUser.senha) {
          // 1. Direct plain text comparison
          if (legacyUser.senha === password) {
            passwordValid = true;
          }
          
          // 2. Try hash comparison via RPC
          if (!passwordValid) {
            try {
              const { data: hashResult } = await supabase.rpc("hash_password", { plain_text: password }) as any;
              if (hashResult && legacyUser.senha === hashResult) {
                passwordValid = true;
              } else {
              }
            } catch (e) {
              console.warn("[Auth] hash_password RPC failed:", e);
            }
          }

          // 3. Try Supabase Auth login (user may have been partially migrated)
          if (!passwordValid) {
            const authAttempt = await signInWithPasswordFast(normalizedEmail, password);
            if (!authAttempt.error && authAttempt.data?.user) {
              return finalizeLogin(authAttempt.data);
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
                telefone: legacyUser.telefone ?? null,
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
                .update({ senha: senhaHash, auth_user_id: signUpData.user.id })
                .eq("id", legacyUser.id);
            } catch {
              /* best effort */
            }
          }

          const retryProvision = await signInWithPasswordFast(
            normalizedEmail,
            password,
          );

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
          logLoginDiagnostic({ email: normalizedEmail, codigo_loja: normalizedStoreCode, tenant_id: legacyUser.tenant_id, usuario_id: legacyUser.id, resultado: "falha_credencial", detalhes: { motivo: "Senha incorreta" } });
          return { user: null, error: "Senha incorreta. Verifique sua senha e tente novamente." };
        }

        // Password matches — migrate user to Supabase Auth
        const { data: signUpData, error: signUpError } = await supabase.auth.signUp({
          email: normalizedEmail,
          password,
          options: {
            data: {
              tenant_id: legacyUser.tenant_id,
              cargo_id: legacyUser.cargo_id ?? null,
              nome_completo: legacyUser.nome_completo ?? normalizedEmail.split("@")[0],
              apelido: legacyUser.apelido ?? null,
              telefone: legacyUser.telefone ?? null,
            },
            emailRedirectTo: window.location.origin,
          },
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
              .update({ auth_user_id: signUpData.user.id, senha: senhaHash })
              .eq("id", legacyUser.id);
          } catch { /* best effort */ }
        }

        // Try login again after migration
        const { data: retryData, error: retryError } = await signInWithPasswordFast(normalizedEmail, password);

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
    } finally {
      loginInProgressRef.current = false;
    }
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
        await ensureUserProfile(loginData.user, metadata, password);
        const appUser = await loadAppUser(loginData.user);
        if (appUser) {
          setUser(appUser);
          setSession(loginData.session);
          syncGlobalState(appUser);
        }
      } else if (isEmailNotConfirmedError(loginError)) {
        const confirmedLogin = await attemptConfirmedLogin(data.user.id, normalizedEmail, password);
        if (confirmedLogin) {
          await ensureUserProfile(confirmedLogin.user, metadata, password);
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

  // Auto-logout after 5 minutes of inactivity with 1-min warning
  const [showInactivityWarning, setShowInactivityWarning] = useState(false);

  useEffect(() => {
    if (!user) return;

    const WARNING_AT = 4 * 60 * 1000; // 4 minutes — show warning
    const LOGOUT_AT = 5 * 60 * 1000;  // 5 minutes — force logout
    let warningTimer: ReturnType<typeof setTimeout>;
    let logoutTimer: ReturnType<typeof setTimeout>;

    const resetTimers = () => {
      clearTimeout(warningTimer);
      clearTimeout(logoutTimer);
      setShowInactivityWarning(false);

      warningTimer = setTimeout(() => {
        setShowInactivityWarning(true);
      }, WARNING_AT);

      logoutTimer = setTimeout(async () => {
        setShowInactivityWarning(false);
        await supabase.auth.signOut();
        setUser(null);
        setSession(null);
        syncGlobalState(null);
        window.location.href = "/";
      }, LOGOUT_AT);
    };

    const events = ["mousedown", "mousemove", "keydown", "scroll", "touchstart", "click"];
    events.forEach((e) => window.addEventListener(e, resetTimers, { passive: true }));
    resetTimers();

    return () => {
      clearTimeout(warningTimer);
      clearTimeout(logoutTimer);
      events.forEach((e) => window.removeEventListener(e, resetTimers));
    };
  }, [user]);

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

  const handleStayConnected = useCallback(() => {
    setShowInactivityWarning(false);
    // Dispatch a synthetic event to reset timers
    window.dispatchEvent(new MouseEvent("mousedown"));
  }, []);

  return (
    <AuthContext.Provider value={{ user, session, loading, login, signUp, logout, hasPermission, refreshUser }}>
      {children}
      <InactivityWarningDialog open={showInactivityWarning} onStayConnected={handleStayConnected} />
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
