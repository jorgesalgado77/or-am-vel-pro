import { createContext, useContext, useState, useEffect, useCallback, useRef, type ReactNode } from "react";
import { supabase } from "@/lib/supabaseClient";
import type { CargoPermissoes } from "@/hooks/useCargos";
import { logLoginDiagnostic } from "@/services/system/SystemDiagnosticsService";
import { logAudit } from "@/services/auditService";
import { initializeTheme, resetToDefaultTheme, applyTheme } from "@/lib/colorThemes";
import type { Session, User as SupabaseAuthUser } from "@supabase/supabase-js";
import { InactivityWarningDialog } from "@/components/InactivityWarningDialog";

// Re-export AppUser for consumers
export type { AppUser } from "@/lib/authHelpers";
import type { AppUser } from "@/lib/authHelpers";

import {
  DEFAULT_PERMS,
  withTimeout,
  createTimeoutError,
  normalizeEmail,
  loadAppUser,
  buildFallbackUserFromAuth,
  ensureUserProfile,
  syncGlobalState,
  hashLegacyPassword,
  isEmailNotConfirmedError,
  isAlreadyRegisteredError,
  shouldTryLegacyFallback,
  attemptConfirmedLogin,
  signInWithPasswordFast,
  resolveTenantIdByStoreCode,
  syncLegacyAuthPassword,
} from "@/lib/authHelpers";

interface AuthContextType {
  user: AppUser | null;
  session: Session | null;
  loading: boolean;
  login: (email: string, password: string, storeCode?: string, preResolvedTenantId?: string | null) => Promise<{ user: AppUser | null; error: string | null }>;
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

const EXPLICIT_SIGN_OUT_EVENTS = new Set(["SIGNED_OUT", "USER_DELETED"]);

function normalizeProfileLabel(value: string | null | undefined) {
  return value?.trim().toLowerCase() ?? "";
}

function isGenericProfileLabel(value: string | null | undefined) {
  const normalized = normalizeProfileLabel(value);
  return !normalized || normalized === "admin" || normalized === "admin master" || normalized === "usuário" || normalized === "usuario";
}

/** Load color theme from DB (usuarios.color_theme), fallback to localStorage */
async function loadAndApplyUserTheme(authUserId: string) {
  try {
    const { data } = await supabase
      .from("usuarios")
      .select("color_theme")
      .eq("auth_user_id", authUserId)
      .maybeSingle();
    const dbTheme = (data as any)?.color_theme;
    if (dbTheme && dbTheme !== "default") {
      applyTheme(dbTheme);
      return;
    }
  } catch { /* silent */ }
  // Fallback to localStorage
  initializeTheme();
}

function getProfileCompletenessScore(appUser: AppUser | null | undefined) {
  if (!appUser) return 0;

  let score = 0;
  if (appUser.tenant_id) score += 2;
  if (appUser.cargo_id) score += 2;
  if (appUser.cargo_nome && !isGenericProfileLabel(appUser.cargo_nome)) score += 1;
  if (appUser.foto_url) score += 3;
  if (appUser.email) score += 1;
  if (appUser.telefone) score += 1;
  if (!isGenericProfileLabel(appUser.nome_completo)) score += 3;
  if (appUser.apelido && !isGenericProfileLabel(appUser.apelido)) score += 2;

  return score;
}

function shouldKeepExistingResolvedUser(existingUser: AppUser | null, incomingUser: AppUser | null) {
  if (!existingUser || !incomingUser) return false;

  const existingAuthId = existingUser.auth_user_id ?? existingUser.id;
  const incomingAuthId = incomingUser.auth_user_id ?? incomingUser.id;
  if (!existingAuthId || existingAuthId !== incomingAuthId) return false;

  return getProfileCompletenessScore(existingUser) > getProfileCompletenessScore(incomingUser);
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AppUser | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const loginInProgressRef = useRef(false);

  // Track latest resolved user outside render cycle to avoid stale closures in auth callbacks
  const userRef = useRef<AppUser | null>(null);

  // Track the auth user ID to avoid unnecessary reloads on token refresh
  const currentAuthIdRef = useRef<string | null>(null);

  const hydrateUserFromDatabase = useCallback(async (authUser: SupabaseAuthUser, reason: string) => {
    const retryTimeouts = [2500, 5000];

    for (const timeoutMs of retryTimeouts) {
      const preferTenant = (authUser.user_metadata as any)?.tenant_id as string | undefined ?? null;
      const resolvedUser = await withTimeout(loadAppUser(authUser, preferTenant), timeoutMs, null);
      if (!resolvedUser) continue;
      if (currentAuthIdRef.current !== authUser.id) return null;

      const stableUser = shouldKeepExistingResolvedUser(userRef.current, resolvedUser)
        ? userRef.current
        : resolvedUser;

      if (!stableUser) return null;

      currentAuthIdRef.current = authUser.id;
      userRef.current = stableUser;
      setUser(stableUser);
      syncGlobalState(stableUser);
      return stableUser;
    }

    return null;
  }, []);

  const loadFromSession = useCallback(async (sess: Session | null, event?: string) => {

    if (!sess?.user) {
      if (currentAuthIdRef.current && event && EXPLICIT_SIGN_OUT_EVENTS.has(event)) {
        userRef.current = null;
        setUser(null);
        setSession(null);
        currentAuthIdRef.current = null;
        syncGlobalState(null);
      } else {
      }
      setLoading(false);
      return;
    }

    setSession(sess);

    if (loginInProgressRef.current) {
      return;
    }

    if (currentAuthIdRef.current === sess.user.id && userRef.current) {
      setLoading(false);
      return;
    }


    const sessionTenantId = (sess.user.user_metadata as any)?.tenant_id as string | undefined ?? null;

    let appUser: AppUser | null = null;
    try {
      appUser = await Promise.race([
        loadAppUser(sess.user, sessionTenantId),
        new Promise<null>((resolve) => setTimeout(() => resolve(null), 8000)),
      ]);

      if (!appUser) {
        await withTimeout(
          ensureUserProfile(sess.user, (sess.user.user_metadata as Record<string, unknown>) ?? undefined),
          1800,
          undefined,
        );
        appUser = await withTimeout(loadAppUser(sess.user, sessionTenantId), 2500, null);
      }
    } catch (e) {
      console.warn("[Auth] ⚠️ loadAppUser falhou:", e);
    }

    if (appUser) {
      const stableUser = shouldKeepExistingResolvedUser(userRef.current, appUser)
        ? userRef.current
        : appUser;

      currentAuthIdRef.current = sess.user.id;
      userRef.current = stableUser;
      setUser(stableUser);
      syncGlobalState(stableUser);
      // Load color theme: try from DB first, then localStorage
      loadAndApplyUserTheme(sess.user.id);
    } else {
      const fallbackUser = await buildFallbackUserFromAuth(sess.user);

      if (fallbackUser) {
        const stableUser = shouldKeepExistingResolvedUser(userRef.current, fallbackUser)
          ? userRef.current
          : fallbackUser;

        console.warn("[Auth] ⚠️ Using FALLBACK user:", stableUser?.nome_completo, "— DB lookup failed");
        currentAuthIdRef.current = sess.user.id;
        userRef.current = stableUser;
        setUser(stableUser);
        syncGlobalState(stableUser);
        loadAndApplyUserTheme(sess.user.id);
        void hydrateUserFromDatabase(sess.user, "fallback_recovery");
      } else {
        currentAuthIdRef.current = null;
        userRef.current = null;
        setUser(null);
        syncGlobalState(null);
        resetToDefaultTheme();
        await withTimeout(supabase.auth.signOut(), 1000, undefined as any);
        setSession(null);
      }
    }

    setLoading(false);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hydrateUserFromDatabase]);

  useEffect(() => {
    let initialLoaded = false;

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (_event, sess) => {
        if (_event === "INITIAL_SESSION") {
          if (initialLoaded) return;
          initialLoaded = true;
        }
        window.setTimeout(() => {
          void loadFromSession(sess, _event);
        }, 0);
      }
    );

    supabase.auth.getSession().then(({ data: { session: sess } }) => {
      if (!initialLoaded) {
        initialLoaded = true;
        void loadFromSession(sess);
      }
    });

    const safetyTimeout = setTimeout(() => {
      setLoading((prev) => {
        if (prev) console.warn("[Auth] ⏰ Safety timeout: forçando fim do loading");
        return false;
      });
    }, 12000);

    return () => {
      subscription.unsubscribe();
      clearTimeout(safetyTimeout);
    };
  }, [loadFromSession]);

  const login = useCallback(async (email: string, password: string, storeCode?: string, preResolvedTenantId?: string | null) => {
    loginInProgressRef.current = true;

    try {
      const normalizedEmail_ = email.trim().toLowerCase();
      const normalizedStoreCode = storeCode?.replace(/\D/g, "") ?? "";
      const tenantResolutionPromise = preResolvedTenantId
        ? Promise.resolve(preResolvedTenantId)
        : normalizedStoreCode.length === 6
          ? resolveTenantIdByStoreCode(normalizedStoreCode)
          : Promise.resolve<string | null>(null);

      let resolvedTenantId: string | null = preResolvedTenantId ?? null;

      const lookupStoreUsers = async (tenantId: string, authUserId?: string | null) => {
        const userSelect = "id, tenant_id, ativo, auth_user_id, nome_completo, email";
        const fallbackResponse = { data: null, error: null } as any;

        const queries: Promise<any>[] = [
          withTimeout(
            (supabase as any)
              .from("usuarios")
              .select(userSelect)
              .eq("tenant_id", tenantId)
              .eq("email", normalizedEmail_)
              .limit(20),
            2200,
            fallbackResponse,
          ),
          withTimeout(
            (supabase as any)
              .from("usuarios")
              .select(userSelect)
              .eq("tenant_id", tenantId)
              .ilike("email", normalizedEmail_)
              .limit(20),
            2200,
            fallbackResponse,
          ),
          withTimeout(
            (supabase as any).rpc("validate_legacy_login", {
              p_email: normalizedEmail_,
              p_tenant_id: tenantId,
            }),
            2200,
            fallbackResponse,
          ),
        ];

        if (authUserId) {
          queries.push(
            withTimeout(
              (supabase as any)
                .from("usuarios")
                .select(userSelect)
                .eq("tenant_id", tenantId)
                .eq("auth_user_id", authUserId)
                .limit(20),
              2200,
              fallbackResponse,
            ),
          );
        }

        const results = await Promise.all(queries);
        const rows = results.flatMap((result) => Array.isArray(result?.data) ? result.data : result?.data ? [result.data] : []);
        const mergedRows = Array.from(new Map(
          rows
            .filter(Boolean)
            .map((row: any) => [row.id ?? `${row.tenant_id}:${normalizeEmail(row.email)}:${row.auth_user_id ?? "sem-auth"}`, row]),
        ).values());

        const exactEmailMatches = mergedRows.filter((row: any) => normalizeEmail(row.email) === normalizedEmail_);

        return {
          candidates: exactEmailMatches.length > 0 ? exactEmailMatches : mergedRows,
          hasLookupError: results.some((result) => Boolean(result?.error)),
          tenantIdsEncontrados: [...new Set(mergedRows.map((row: any) => row?.tenant_id).filter(Boolean))],
        };
      };

      const prevalidateStoreMembership = async (): Promise<string | null> => {
        if (normalizedStoreCode.length !== 6) return null;

        resolvedTenantId = resolvedTenantId ?? await withTimeout(tenantResolutionPromise, 2000, null);

        if (!resolvedTenantId) {
          await supabase.auth.signOut().catch(() => {});
          return "Código da loja não encontrado. Verifique o código informado.";
        }

        const storeLookup = await lookupStoreUsers(resolvedTenantId);
        const storeMatches = storeLookup.candidates;

        if (storeMatches.length === 0) {
          if (storeLookup.hasLookupError) {
            console.warn("[Auth] Pré-validação sem confirmação de vínculo; validação final será feita após autenticação.");
            return null;
          }

          console.warn("[Auth] Pré-validação não encontrou vínculo antes da autenticação; seguindo para validação pós-login.", {
            email: normalizedEmail_,
            tenant_id: resolvedTenantId,
            tenant_ids_encontrados: storeLookup.tenantIdsEncontrados,
          });

          logLoginDiagnostic({
            email: normalizedEmail_,
            codigo_loja: normalizedStoreCode,
            tenant_id: resolvedTenantId,
            resultado: "pre_validacao_sem_confirmacao",
            detalhes: {
              fase: "pre_validacao",
              motivo: "Vínculo não confirmado antes da autenticação; validação final será feita após login",
              tenant_ids_encontrados: storeLookup.tenantIdsEncontrados,
            },
          });

          return null;
        }

        const activeStoreMatch = storeMatches.find((candidate: any) => candidate.ativo !== false);
        if (!activeStoreMatch) {
          logLoginDiagnostic({
            email: normalizedEmail_,
            codigo_loja: normalizedStoreCode,
            tenant_id: resolvedTenantId,
            usuario_id: storeMatches[0]?.id,
            resultado: "falha_inativo",
            detalhes: { fase: "pre_validacao", motivo: "Usuário inativo na loja" },
          });
          await supabase.auth.signOut().catch(() => {});
          return "Sua conta está inativa nesta loja. Entre em contato com o administrador.";
        }

        return null;
      };

      const finalizeLogin = async (authData: { user: SupabaseAuthUser | null; session: Session | null }) => {
        if (!authData.user) {
          return { user: null, error: "Usuário autenticado, mas não encontrado na sessão" };
        }

        // Resolve tenant from store code first — do NOT use metadata as fallback
        // when a store code was explicitly provided (prevents cross-store access)
        if (normalizedStoreCode.length === 6 && !resolvedTenantId) {
          resolvedTenantId = await withTimeout(tenantResolutionPromise, 1400, null);

          if (!resolvedTenantId) {
            // Store code invalid — sign out and reject
            await supabase.auth.signOut().catch(() => {});
            return { user: null, error: "Código da loja não encontrado. Verifique o código informado." };
          }
        }

        // Only use metadata tenant as fallback when NO store code was provided
        if (!resolvedTenantId && normalizedStoreCode.length !== 6) {
          const metaTenantId = (authData.user.user_metadata as any)?.tenant_id as string | undefined;
          if (metaTenantId) {
            resolvedTenantId = metaTenantId;
          }
        }

        // CRITICAL SECURITY CHECK: When a store code was provided, verify the auth user
        // is really bound to the informed tenant and never allow cross-store reuse.
        if (normalizedStoreCode.length === 6 && resolvedTenantId) {
          const normalizedLoginEmail = normalizeEmail(authData.user.email);
          const storeLookup = await lookupStoreUsers(resolvedTenantId, authData.user.id);
          const { data: authLinkedUsers } = await withTimeout(
            (supabase as any)
              .from("usuarios")
              .select("id, tenant_id, ativo, auth_user_id, email")
              .eq("auth_user_id", authData.user.id)
              .limit(10),
            2500,
            { data: null } as any,
          );

          const linkedUsers = Array.isArray(authLinkedUsers) ? authLinkedUsers : authLinkedUsers ? [authLinkedUsers] : [];
          const linkedTenantIds = [...new Set(linkedUsers.map((u: any) => u?.tenant_id).filter(Boolean))];
          const matchingUsers = storeLookup.candidates;
          const authorizedUsers = matchingUsers.filter((u: any) => !u.auth_user_id || u.auth_user_id === authData.user.id);

          if (linkedUsers.length > 0 && !linkedUsers.some((u: any) => u.tenant_id === resolvedTenantId) && authorizedUsers.length === 0) {
            logLoginDiagnostic({
              email: normalizedEmail_,
              codigo_loja: normalizedStoreCode,
              tenant_id: resolvedTenantId,
              auth_user_id: authData.user.id,
              resultado: "falha_tenant",
              detalhes: {
                fase: "pos_auth",
                tenant_ids_auth_vinculados: linkedTenantIds,
                tenant_esperado: resolvedTenantId,
                motivo: "Usuário autenticado já está vinculado a outra loja",
              },
            });
            logAudit({
              acao: "usuario_login",
              entidade: "security",
              detalhes: {
                tipo: "acesso_cross_tenant_bloqueado",
                fase: "pos_auth",
                email: normalizedEmail_,
                codigo_loja_digitado: normalizedStoreCode,
                tenant_id_tentado: resolvedTenantId,
                tenant_ids_auth_vinculados: linkedTenantIds,
                auth_user_id: authData.user.id,
                motivo: "Auth user já possui vínculo com outra loja e tentou acessar uma diferente",
                timestamp: new Date().toISOString(),
              },
              tenant_id: resolvedTenantId,
            });
            await supabase.auth.signOut().catch(() => {});
            return { user: null, error: "Este email não está vinculado ao código da loja informado. Verifique o código da loja." };
          }

          if (matchingUsers.length === 0) {
            if (storeLookup.hasLookupError) {
              console.warn("[Auth] Validação pós-login sem confirmação direta do vínculo; seguindo para validação final do perfil.");
            } else {
            logLoginDiagnostic({ email: normalizedEmail_, codigo_loja: normalizedStoreCode, tenant_id: resolvedTenantId, auth_user_id: authData.user.id, resultado: "falha_vinculo", detalhes: { fase: "pos_auth", motivo: "Usuário não pertence à loja informada" } });
            logAudit({
              acao: "usuario_login",
              entidade: "security",
              detalhes: {
                tipo: "acesso_cross_tenant_bloqueado",
                fase: "pos_auth",
                email: normalizedEmail_,
                codigo_loja_digitado: normalizedStoreCode,
                tenant_id_tentado: resolvedTenantId,
                auth_user_id: authData.user.id,
                motivo: "Usuário tentou acessar loja à qual não está vinculado",
                user_agent: navigator?.userAgent || "unknown",
                timestamp: new Date().toISOString(),
              },
              tenant_id: resolvedTenantId,
            });
            await supabase.auth.signOut().catch(() => {});
            return { user: null, error: "Este email não está vinculado ao código da loja informado. Verifique o código da loja." };
            }
          }

          if (authorizedUsers.length === 0) {
            logLoginDiagnostic({
              email: normalizedEmail_,
              codigo_loja: normalizedStoreCode,
              tenant_id: resolvedTenantId,
              auth_user_id: authData.user.id,
              resultado: "falha_vinculo",
              detalhes: {
                fase: "pos_auth",
                motivo: "Registro da loja já vinculado a outro auth_user_id",
              },
            });
            logAudit({
              acao: "usuario_login",
              entidade: "security",
              detalhes: {
                tipo: "acesso_cross_tenant_bloqueado",
                fase: "pos_auth",
                email: normalizedEmail_,
                codigo_loja_digitado: normalizedStoreCode,
                tenant_id_tentado: resolvedTenantId,
                auth_user_id: authData.user.id,
                motivo: "Email encontrado na loja, mas o cadastro já está vinculado a outro acesso",
                timestamp: new Date().toISOString(),
              },
              tenant_id: resolvedTenantId,
            });
            await supabase.auth.signOut().catch(() => {});
            return { user: null, error: "Este email não está vinculado ao código da loja informado. Verifique o código da loja." };
          }

          const activeUser = authorizedUsers.find((u: any) => u.ativo !== false);
          if (!activeUser) {
            logLoginDiagnostic({ email: normalizedEmail_, codigo_loja: normalizedStoreCode, tenant_id: resolvedTenantId, auth_user_id: authData.user.id, resultado: "falha_inativo", detalhes: { fase: "pos_auth", motivo: "Usuário inativo na loja" } });
            await supabase.auth.signOut().catch(() => {});
            return { user: null, error: "Sua conta está inativa nesta loja. Entre em contato com o administrador." };
          }
        }

        // Now that we confirmed the user belongs to the store, sync Auth metadata
        const currentMetaTenant = (authData.user.user_metadata as any)?.tenant_id;
        if (resolvedTenantId && currentMetaTenant !== resolvedTenantId) {
          try {
            await supabase.auth.updateUser({ data: { tenant_id: resolvedTenantId } });
            const { data: refreshed } = await supabase.auth.refreshSession();
            if (refreshed?.user) {
              authData = { user: refreshed.user, session: refreshed.session };
            }
          } catch (e) {
            console.warn("[Auth] Failed to sync tenant metadata:", e);
          }
        }

        const metadata = {
          ...((authData.user.user_metadata as Record<string, unknown>) ?? {}),
          ...(resolvedTenantId ? { tenant_id: resolvedTenantId } : {}),
        };

        let appUser = await withTimeout(loadAppUser(authData.user, resolvedTenantId), 1500, null);
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
          appUser = await withTimeout(loadAppUser(authData.user, resolvedTenantId), 1200, null);

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
          logLoginDiagnostic({ email: normalizedEmail_, codigo_loja: normalizedStoreCode, tenant_id: resolvedTenantId, auth_user_id: authData.user.id, resultado: "falha_vinculo", detalhes: { motivo: "Perfil não encontrado na tabela usuarios" } });
          await supabase.auth.signOut().catch(() => {});
          return { user: null, error: "Usuário autenticado, mas não encontrado na tabela usuarios" };
        }

        if (resolvedTenantId && appUser.tenant_id && appUser.tenant_id !== resolvedTenantId) {
          logLoginDiagnostic({ email: normalizedEmail_, codigo_loja: normalizedStoreCode, tenant_id: resolvedTenantId, usuario_id: appUser.id, cargo_nome: appUser.cargo_nome, resultado: "falha_tenant", detalhes: { tenant_usuario: appUser.tenant_id, tenant_esperado: resolvedTenantId } });
          logAudit({
            acao: "usuario_login",
            entidade: "security",
            usuario_id: appUser.id,
            usuario_nome: appUser.nome_completo,
            detalhes: {
              tipo: "acesso_cross_tenant_bloqueado",
              email: normalizedEmail_,
              codigo_loja_digitado: normalizedStoreCode,
              tenant_id_tentado: resolvedTenantId,
              tenant_id_real_usuario: appUser.tenant_id,
              cargo: appUser.cargo_nome,
              motivo: "Tenant do usuário difere do tenant da loja informada",
              timestamp: new Date().toISOString(),
            },
            tenant_id: resolvedTenantId,
          });
          await supabase.auth.signOut().catch(() => {});
          return { user: null, error: "Este email não está vinculado ao código da loja informado." };
        }

        logLoginDiagnostic({ email: normalizedEmail_, codigo_loja: normalizedStoreCode, tenant_id: appUser.tenant_id, usuario_id: appUser.id, cargo_nome: appUser.cargo_nome, auth_user_id: authData.user.id, resultado: "sucesso" });
        userRef.current = appUser;
        currentAuthIdRef.current = authData.user.id;
        setUser(appUser);
        setSession(authData.session);
        syncGlobalState(appUser);

        // tenant_id metadata already synced above before loadAppUser

        if (usedFallbackUser) {
          void (async () => {
            await withTimeout(ensureUserProfile(authData.user, metadata, password), 1500, undefined);
            const refreshedUser = await withTimeout(loadAppUser(authData.user, resolvedTenantId), 1500, null);

            if (refreshedUser) {
              userRef.current = refreshedUser;
              currentAuthIdRef.current = authData.user.id;
              setUser(refreshedUser);
              syncGlobalState(refreshedUser);
            }
          })();
        }

        return { user: appUser, error: null };
      };

      if (normalizedStoreCode.length === 6) {
        const preValidationError = await prevalidateStoreMembership();
        if (preValidationError) {
          return { user: null, error: preValidationError };
        }
      }

      const { data, error } = await signInWithPasswordFast(normalizedEmail_, password);

      if (!error && data.user) {
        // Only use metadata tenant if we didn't resolve from store code
        if (!resolvedTenantId) {
          resolvedTenantId = (data.user.user_metadata as any)?.tenant_id ?? null;
        }
        return finalizeLogin(data);
      }

      resolvedTenantId = await withTimeout(tenantResolutionPromise, 1400, null);

      if (error && isEmailNotConfirmedError(error)) {
        const { data: emailUsers } = await withTimeout(
          (supabase as any)
            .from("usuarios")
            .select("id")
            .eq("email", normalizedEmail_)
            .limit(5),
          1200,
          { data: null, error: createTimeoutError("email_lookup_for_confirm") } as any,
        );

        const emailUserList = Array.isArray(emailUsers) ? emailUsers : emailUsers ? [emailUsers] : [];

        for (const eu of emailUserList) {
          const result = await attemptConfirmedLogin(eu.id, normalizedEmail_, password);
          if (result) {
            return finalizeLogin(result);
          }
        }

        try {
          const { data: signUpRetry, error: signUpRetryErr } = await supabase.auth.signUp({
            email: normalizedEmail_,
            password,
            options: { emailRedirectTo: window.location.origin },
          });

          if (signUpRetryErr && isAlreadyRegisteredError(signUpRetryErr)) {
            // already registered — try syncing password
            const synced = await syncLegacyAuthPassword(normalizedEmail_, password, "");
            if (synced) {
              const retryAfterSync = await signInWithPasswordFast(normalizedEmail_, password);
              if (!retryAfterSync.error && retryAfterSync.data.user) {
                return finalizeLogin(retryAfterSync.data);
              }
            }
          }

          if (signUpRetry?.user) {
            const result = await attemptConfirmedLogin(signUpRetry.user.id, normalizedEmail_, password);
            if (result) {
              return finalizeLogin(result);
            }
          }
        } catch (e) {
          console.warn("[Auth] ⚠️ Tentativa de re-signup falhou:", e);
        }
      }

      if (error && shouldTryLegacyFallback(error)) {
        try {
          const tenantIdFromCode = resolvedTenantId;

          let legacyUsers: any[] = [];
          let legacyUsersError: any = null;

          try {
            const { data: rpcResult, error: rpcErr } = await withTimeout(
              (supabase as any).rpc("validate_legacy_login", {
                p_email: normalizedEmail_,
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

          if (legacyUsers.length === 0) {
            const directLookups = await Promise.all([
              withTimeout(
                (supabase as any)
                  .from("usuarios")
                  .select("*")
                  .eq("email", normalizedEmail_)
                  .limit(10),
                1400,
                { data: null, error: createTimeoutError("legacy_user_lookup_email_eq") } as any,
              ),
              withTimeout(
                (supabase as any)
                  .from("usuarios")
                  .select("*")
                  .ilike("email", normalizedEmail_)
                  .limit(10),
                1400,
                { data: null, error: createTimeoutError("legacy_user_lookup_email_ilike") } as any,
              ),
            ]);

            for (const lookup of directLookups) {
              if (lookup.error) {
                console.warn("[Auth] Lookup direto de usuários falhou:", lookup.error.message);
                if (!legacyUsersError) legacyUsersError = lookup.error;
                continue;
              }
              const rows = Array.isArray(lookup.data) ? lookup.data : lookup.data ? [lookup.data] : [];
              if (rows.length > 0) {
                legacyUsers = rows;
                break;
              }
            }
          }

          if (legacyUsers.length === 0) {
            logLoginDiagnostic({ email: normalizedEmail_, codigo_loja: normalizedStoreCode, tenant_id: tenantIdFromCode, resultado: "falha_credencial", detalhes: { motivo: "Email não encontrado" } });
            return { user: null, error: "Email não encontrado no sistema. Verifique o email digitado." };
          }

          const legacyUser = legacyUsers.find((candidate: any) => {
            if (!tenantIdFromCode) return true;
            return candidate.tenant_id === tenantIdFromCode;
          }) ?? legacyUsers[0] ?? null;

          if (!legacyUser) {
            return { user: null, error: "Email não encontrado no sistema. Verifique o email digitado." };
          }

          // Use auth_user_id when available (correct UUID for Supabase Auth operations)
          const legacyAuthUserId = legacyUser.auth_user_id || legacyUser.id;

          if (tenantIdFromCode && legacyUser.tenant_id !== tenantIdFromCode) {
            logAudit({
              acao: "usuario_login",
              entidade: "security",
              usuario_id: legacyUser.id,
              detalhes: {
                tipo: "acesso_cross_tenant_bloqueado",
                email: normalizedEmail_,
                codigo_loja_digitado: normalizedStoreCode,
                tenant_id_tentado: tenantIdFromCode,
                tenant_id_real_usuario: legacyUser.tenant_id,
                motivo: "Tentativa de login legado em loja não vinculada",
                timestamp: new Date().toISOString(),
              },
              tenant_id: tenantIdFromCode,
            });
            return { user: null, error: "Este email não está vinculado ao código da loja informado." };
          }

          if (isEmailNotConfirmedError(error)) {
            const confirmedLogin = await attemptConfirmedLogin(legacyAuthUserId, normalizedEmail_, password);
            if (confirmedLogin) {
              return finalizeLogin(confirmedLogin);
            }
          }

          if (legacyUser.ativo === false) {
            logLoginDiagnostic({ email: normalizedEmail_, codigo_loja: normalizedStoreCode, tenant_id: legacyUser.tenant_id, usuario_id: legacyUser.id, resultado: "falha_inativo" });
            return { user: null, error: "Usuário inativo" };
          }

          let passwordValid = false;
          if (legacyUser.senha) {
            if (legacyUser.senha === password) {
              passwordValid = true;
            }
            
            if (!passwordValid) {
              try {
                const { data: hashResult } = await supabase.rpc("hash_password", { plain_text: password }) as any;
                if (hashResult && legacyUser.senha === hashResult) {
                  passwordValid = true;
                }
              } catch (e) {
                console.warn("[Auth] hash_password RPC failed:", e);
              }
            }

            if (!passwordValid) {
              const authAttempt = await signInWithPasswordFast(normalizedEmail_, password);
              if (!authAttempt.error && authAttempt.data?.user) {
                return finalizeLogin(authAttempt.data);
              }
            }
          }

          if (!passwordValid && !legacyUser.senha) {
            const { data: signUpData, error: signUpError } = await supabase.auth.signUp({
              email: normalizedEmail_,
              password,
              options: {
                data: {
                  tenant_id: legacyUser.tenant_id,
                  cargo_id: legacyUser.cargo_id ?? null,
                  nome_completo: legacyUser.nome_completo ?? normalizedEmail_.split("@")[0],
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
              const confirmedLogin = await attemptConfirmedLogin(legacyAuthUserId, normalizedEmail_, password);
              if (confirmedLogin) {
                return finalizeLogin(confirmedLogin);
              }
              // Sync password and retry
              const synced = await syncLegacyAuthPassword(normalizedEmail_, password, legacyUser.id);
              if (synced) {
                const retryAfterSync = await signInWithPasswordFast(normalizedEmail_, password);
                if (!retryAfterSync.error && retryAfterSync.data.user) {
                  return finalizeLogin(retryAfterSync.data);
                }
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

            const retryProvision = await signInWithPasswordFast(normalizedEmail_, password);

            if (!retryProvision.error && retryProvision.data.user) {
              return finalizeLogin(retryProvision.data);
            }

            if (isEmailNotConfirmedError(retryProvision.error)) {
              const confirmedLogin = await attemptConfirmedLogin(legacyAuthUserId, normalizedEmail_, password);
              if (confirmedLogin) {
                return finalizeLogin(confirmedLogin);
              }
            }
          }

          if (!passwordValid) {
            logLoginDiagnostic({ email: normalizedEmail_, codigo_loja: normalizedStoreCode, tenant_id: legacyUser.tenant_id, usuario_id: legacyUser.id, resultado: "falha_credencial", detalhes: { motivo: "Senha incorreta" } });
            return { user: null, error: "Senha incorreta. Verifique sua senha e tente novamente." };
          }

          const { data: signUpData, error: signUpError } = await supabase.auth.signUp({
            email: normalizedEmail_,
            password,
            options: {
              data: {
                tenant_id: legacyUser.tenant_id,
                cargo_id: legacyUser.cargo_id ?? null,
                nome_completo: legacyUser.nome_completo ?? normalizedEmail_.split("@")[0],
                apelido: legacyUser.apelido ?? null,
                telefone: legacyUser.telefone ?? null,
              },
              emailRedirectTo: window.location.origin,
            },
          });

          if (signUpError) {
            console.warn("[Auth] Legacy migration signUp failed:", signUpError.message);

            if (isAlreadyRegisteredError(signUpError)) {
              const confirmedLogin = await attemptConfirmedLogin(legacyAuthUserId, normalizedEmail_, password);
              if (confirmedLogin) {
                return finalizeLogin(confirmedLogin);
              }

              // Auth account exists with a different password — sync the legacy password
              const synced = await syncLegacyAuthPassword(normalizedEmail_, password, legacyUser.id);
              if (synced) {
                const retryAfterSync = await signInWithPasswordFast(normalizedEmail_, password);
                if (!retryAfterSync.error && retryAfterSync.data.user) {
                  return finalizeLogin(retryAfterSync.data);
                }
              }

              // Last resort: return a helpful error instead of raw "User already registered"
              return { user: null, error: "Não foi possível sincronizar seu acesso. Use 'Esqueci minha senha' ou contate o suporte." };
            }

            return { user: null, error: signUpError.message || "Não foi possível concluir o login desta conta." };
          }

          if (signUpData.user) {
            try {
              await (supabase as any).rpc("confirm_user_email", { p_user_id: signUpData.user.id });
            } catch { /* RPC may not exist */ }

            try {
              const senhaHash = await hashLegacyPassword(password);
              await (supabase as any)
                .from("usuarios")
                .update({
                  auth_user_id: signUpData.user.id,
                  senha: senhaHash,
                  email: normalizedEmail_,
                  tenant_id: legacyUser.tenant_id,
                  primeiro_login: legacyUser.primeiro_login ?? true,
                  ativo: legacyUser.ativo ?? true,
                })
                .eq("id", legacyUser.id);
            } catch { /* best effort */ }
          }

          const { data: retryData, error: retryError } = await signInWithPasswordFast(normalizedEmail_, password);

          if (!retryError && retryData.user) {
            return finalizeLogin(retryData);
          }

          if (isEmailNotConfirmedError(retryError)) {
            const confirmedLogin = await attemptConfirmedLogin(legacyAuthUserId, normalizedEmail_, password);
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
    const normalizedEmail_ = email.trim().toLowerCase();
    const { data, error } = await supabase.auth.signUp({
      email: normalizedEmail_,
      password,
      options: {
        data: metadata,
        emailRedirectTo: window.location.origin,
      },
    });

    if (error) return { error: error.message };

    await ensureUserProfile(data.user ?? null, metadata, password);

    if (data.user) {
      try {
        await (supabase as any).rpc("confirm_user_email", { p_user_id: data.user.id });
      } catch (e) {
        console.warn("[Auth] confirm_user_email RPC not available:", e);
      }

      const { data: loginData, error: loginError } = await supabase.auth.signInWithPassword({
        email: normalizedEmail_,
        password,
      });
      if (!loginError && loginData.user) {
        await ensureUserProfile(loginData.user, metadata, password);
        const appUser = await loadAppUser(loginData.user, metadata.tenant_id as string);
        if (appUser) {
          userRef.current = appUser;
          currentAuthIdRef.current = loginData.user.id;
          setUser(appUser);
          setSession(loginData.session);
          syncGlobalState(appUser);
        }
      } else if (isEmailNotConfirmedError(loginError)) {
        const confirmedLogin = await attemptConfirmedLogin(data.user.id, normalizedEmail_, password);
        if (confirmedLogin) {
          await ensureUserProfile(confirmedLogin.user, metadata, password);
          const appUser = await loadAppUser(confirmedLogin.user, metadata.tenant_id as string);
          if (appUser) {
            userRef.current = appUser;
            currentAuthIdRef.current = confirmedLogin.user.id;
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
    currentAuthIdRef.current = null;
    userRef.current = null;
    await supabase.auth.signOut();
    setUser(null);
    setSession(null);
    syncGlobalState(null);
    resetToDefaultTheme();
  }, []);

  const [showInactivityWarning, setShowInactivityWarning] = useState(false);

  useEffect(() => {
    if (!user) return;

    const WARNING_AT = 4 * 60 * 1000;
    const LOGOUT_AT = 5 * 60 * 1000;
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
        currentAuthIdRef.current = null;
        userRef.current = null;
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
    return perm in user.permissoes ? user.permissoes[perm] : true;
  }, [user]);

  const refreshUser = useCallback(async () => {
    if (!session?.user) return;

    const preferTenant = (session.user.user_metadata as any)?.tenant_id as string | undefined ?? null;
    const appUser = await withTimeout(loadAppUser(session.user, preferTenant), 5000, null);
    if (!appUser) return;

    // On explicit refresh (e.g. after profile save), always accept the incoming
    // user from DB — it has the latest data the user just saved.
    userRef.current = appUser;
    currentAuthIdRef.current = session.user.id;
    setUser(appUser);
    syncGlobalState(appUser);
  }, [session]);

  const handleStayConnected = useCallback(() => {
    setShowInactivityWarning(false);
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
