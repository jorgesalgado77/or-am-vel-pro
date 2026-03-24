import { createContext, useContext, useState, useEffect, useCallback, useRef, type ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { CargoPermissoes } from "@/hooks/useCargos";
import { logLoginDiagnostic } from "@/services/loginDiagnosticService";
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
} from "@/lib/authHelpers";

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

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AppUser | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const loginInProgressRef = useRef(false);

  // Track latest resolved user outside render cycle to avoid stale closures in auth callbacks
  const userRef = useRef<AppUser | null>(null);

  // Track the auth user ID to avoid unnecessary reloads on token refresh
  const currentAuthIdRef = useRef<string | null>(null);

  const loadFromSession = useCallback(async (sess: Session | null, event?: string) => {
    console.log("[Auth] loadFromSession called", { event, hasSession: !!sess?.user, currentRef: currentAuthIdRef.current, currentUserRef: userRef.current?.nome_completo });

    if (!sess?.user) {
      if (currentAuthIdRef.current && event !== "TOKEN_REFRESHED") {
        console.log("[Auth] ⛔ Clearing user (no session, event:", event, ")");
        userRef.current = null;
        setUser(null);
        setSession(null);
        currentAuthIdRef.current = null;
        syncGlobalState(null);
      } else {
        console.log("[Auth] ✅ Ignoring null session (token refresh or no ref)");
      }
      setLoading(false);
      return;
    }

    setSession(sess);

    if (loginInProgressRef.current) {
      console.log("[Auth] ⏳ Login in progress, skipping");
      return;
    }

    if (currentAuthIdRef.current === sess.user.id && userRef.current) {
      console.log("[Auth] ✅ Same user already loaded:", userRef.current.nome_completo, "— skipping reload");
      setLoading(false);
      return;
    }

    console.log("[Auth] 🔄 Loading user profile for:", sess.user.email);

    let appUser: AppUser | null = null;
    try {
      appUser = await Promise.race([
        loadAppUser(sess.user),
        new Promise<null>((resolve) => setTimeout(() => resolve(null), 8000)),
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
      console.log("[Auth] ✅ User loaded from DB:", appUser.nome_completo, "cargo:", appUser.cargo_nome);
      currentAuthIdRef.current = sess.user.id;
      userRef.current = appUser;
      setUser(appUser);
      syncGlobalState(appUser);
    } else {
      const fallbackUser = await buildFallbackUserFromAuth(sess.user);

      if (fallbackUser) {
        console.warn("[Auth] ⚠️ Using FALLBACK user:", fallbackUser.nome_completo, "— DB lookup failed");
        currentAuthIdRef.current = sess.user.id;
        userRef.current = fallbackUser;
        setUser(fallbackUser);
        syncGlobalState(fallbackUser);
      } else {
        currentAuthIdRef.current = null;
        userRef.current = null;
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
        loadFromSession(sess);
      }
    });

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
      const normalizedEmail_ = email.trim().toLowerCase();
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
          logLoginDiagnostic({ email: normalizedEmail_, codigo_loja: normalizedStoreCode, tenant_id: resolvedTenantId, auth_user_id: authData.user.id, resultado: "falha_vinculo", detalhes: { motivo: "Perfil não encontrado na tabela usuarios" } });
          return { user: null, error: "Usuário autenticado, mas não encontrado na tabela usuarios" };
        }

        if (resolvedTenantId && appUser.tenant_id && appUser.tenant_id !== resolvedTenantId) {
          logLoginDiagnostic({ email: normalizedEmail_, codigo_loja: normalizedStoreCode, tenant_id: resolvedTenantId, usuario_id: appUser.id, cargo_nome: appUser.cargo_nome, resultado: "falha_tenant", detalhes: { tenant_usuario: appUser.tenant_id, tenant_esperado: resolvedTenantId } });
          return { user: null, error: "Este email não está vinculado ao código da loja informado." };
        }

        logLoginDiagnostic({ email: normalizedEmail_, codigo_loja: normalizedStoreCode, tenant_id: appUser.tenant_id, usuario_id: appUser.id, cargo_nome: appUser.cargo_nome, auth_user_id: authData.user.id, resultado: "sucesso" });
        userRef.current = appUser;
        currentAuthIdRef.current = authData.user.id;
        setUser(appUser);
        setSession(authData.session);
        syncGlobalState(appUser);

        if (usedFallbackUser) {
          void (async () => {
            await withTimeout(ensureUserProfile(authData.user, metadata, password), 1500, undefined);
            const refreshedUser = await withTimeout(loadAppUser(authData.user), 1500, null);

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

      const { data, error } = await signInWithPasswordFast(normalizedEmail_, password);

      if (!error && data.user) {
        resolvedTenantId = (data.user.user_metadata as any)?.tenant_id ?? null;
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
            // already registered — expected
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
            const { data: directData, error: directErr } = await withTimeout(
              (supabase as any)
                .from("usuarios")
                .select("*")
                .eq("email", normalizedEmail_)
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

          if (tenantIdFromCode && legacyUser.tenant_id !== tenantIdFromCode) {
            return { user: null, error: "Este email não está vinculado ao código da loja informado." };
          }

          if (isEmailNotConfirmedError(error)) {
            const confirmedLogin = await attemptConfirmedLogin(legacyUser.id, normalizedEmail_, password);
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
              const confirmedLogin = await attemptConfirmedLogin(legacyUser.id, normalizedEmail_, password);
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

            const retryProvision = await signInWithPasswordFast(normalizedEmail_, password);

            if (!retryProvision.error && retryProvision.data.user) {
              return finalizeLogin(retryProvision.data);
            }

            if (isEmailNotConfirmedError(retryProvision.error)) {
              const confirmedLogin = await attemptConfirmedLogin(legacyUser.id, normalizedEmail_, password);
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
              const confirmedLogin = await attemptConfirmedLogin(legacyUser.id, normalizedEmail_, password);
              if (confirmedLogin) {
                return finalizeLogin(confirmedLogin);
              }
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
                .update({ auth_user_id: signUpData.user.id, senha: senhaHash })
                .eq("id", legacyUser.id);
            } catch { /* best effort */ }
          }

          const { data: retryData, error: retryError } = await signInWithPasswordFast(normalizedEmail_, password);

          if (!retryError && retryData.user) {
            return finalizeLogin(retryData);
          }

          if (isEmailNotConfirmedError(retryError)) {
            const confirmedLogin = await attemptConfirmedLogin(legacyUser.id, normalizedEmail_, password);
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
        const appUser = await loadAppUser(loginData.user);
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
          const appUser = await loadAppUser(confirmedLogin.user);
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
    if (session?.user) {
      const appUser = await loadAppUser(session.user);
      if (appUser) {
        userRef.current = appUser;
        currentAuthIdRef.current = session.user.id;
        setUser(appUser);
        syncGlobalState(appUser);
      }
    }
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
