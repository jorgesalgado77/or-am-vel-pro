/**
 * Pure utility functions extracted from AuthContext to reduce file size.
 * These handle user resolution, tenant lookup, legacy login, etc.
 */
import { supabase } from "@/lib/supabaseClient";
import { setTenantState } from "@/lib/tenantState";
import type { CargoPermissoes } from "@/hooks/useCargos";
import type { User as SupabaseAuthUser } from "@supabase/supabase-js";

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

export const DEFAULT_PERMS: CargoPermissoes = {
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
  liberacao: true,
  tutoriais: true,
  email: true,
  cadastrar_produtos: true,
};

export async function withTimeout<T>(promise: Promise<T>, ms: number, fallback: T): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((resolve) => setTimeout(() => resolve(fallback), ms)),
  ]);
}

export function createTimeoutError(label: string) {
  return { message: `timeout_${label}`, code: "TIMEOUT" };
}

export function normalizeEmail(value: string | null | undefined): string | null {
  const normalized = value?.trim().toLowerCase();
  return normalized || null;
}

export async function resolveCargo(cargoId: string | null): Promise<{ cargo_nome: string | null; permissoes: CargoPermissoes }> {
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

export async function mapAppUser(userRow: any, authUserId?: string | null): Promise<AppUser> {
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

export function mapRpcAppUser(userRow: any, authUserId?: string | null): AppUser {
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

export async function buildFallbackUserFromAuth(
  authUser: Pick<SupabaseAuthUser, "id" | "email" | "user_metadata">
): Promise<AppUser | null> {
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

  // Admin master users don't have a tenant_id — return a valid AppUser so AuthContext
  // doesn't sign them out. The Admin dashboard manages its own data loading.
  const isAdminMaster = metadata?.is_admin_master === true;
  if (!tenantId && !isAdminMaster) return null;

  if (isAdminMaster && !tenantId) {
    return {
      id: authUser.id,
      nome_completo: (metadata?.nome_completo as string) || "Admin Master",
      apelido: null,
      email: normalizeEmail(authUser.email),
      telefone: null,
      cargo_id: null,
      cargo_nome: "Admin Master",
      foto_url: null,
      tenant_id: null,
      auth_user_id: authUser.id,
      permissoes: DEFAULT_PERMS,
    };
  }

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

export async function loadAppUserViaRpc(
  authUser: Pick<SupabaseAuthUser, "id" | "email">
): Promise<AppUser | null> {
  try {
    const { data, error } = await withTimeout(
      (supabase as any).rpc("get_current_app_user"),
      8000,
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

export async function loadAppUser(authUser: Pick<SupabaseAuthUser, "id" | "email" | "user_metadata">, preferTenantId?: string | null): Promise<AppUser | null> {
  const rpcUser = await loadAppUserViaRpc(authUser);
  if (rpcUser) {
    // If we have a preferred tenant and the RPC user is from a different tenant, skip it
    if (preferTenantId && rpcUser.tenant_id && rpcUser.tenant_id !== preferTenantId) {
      console.warn("[Auth] RPC user tenant mismatch, falling back to direct lookup");
    } else {
      return rpcUser;
    }
  }

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
        .limit(10),
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
      3000,
      { data: null, error: { message: `timeout_${strategy.label}` } } as any,
    );
    const userList = Array.isArray(data) ? data : data ? [data] : [];

    if (error) {
      console.warn(`[Auth] Failed to load user by ${strategy.label}:`, error.message);
      continue;
    }

    if (userList.length === 0) continue;

    // When we have a preferred tenant, always try to find the matching record first
    let userRow: any = null;
    if (preferTenantId) {
      userRow = userList.find((c: any) => c.tenant_id === preferTenantId) ?? null;
    }
    if (!userRow) {
      userRow = strategy.label === "email"
        ? userList.find((candidate: any) => normalizeEmail(candidate?.email) === normalizedEmail) ?? userList[0]
        : userList[0];
    }

    if (userRow) {
      // If we found the user but it's from a different tenant and we have a preferred one, skip to next strategy
      if (preferTenantId && userRow.tenant_id && userRow.tenant_id !== preferTenantId) {
        console.warn(`[Auth] Found user by ${strategy.label} but tenant mismatch (${userRow.tenant_id} vs ${preferTenantId}), trying next strategy`);
        continue;
      }

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
          2000,
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

export async function hashLegacyPassword(password: string): Promise<string> {
  try {
    const { data } = await supabase.rpc("hash_password", { plain_text: password }) as any;
    return data || password;
  } catch {
    return password;
  }
}

export function isEmailNotConfirmedError(error: { message?: string; code?: string } | null | undefined): boolean {
  const message = error?.message?.toLowerCase() ?? "";
  const code = error?.code?.toLowerCase() ?? "";
  return code === "email_not_confirmed" || message.includes("email not confirmed");
}

export function isAlreadyRegisteredError(error: { message?: string; code?: string } | null | undefined): boolean {
  const message = error?.message?.toLowerCase() ?? "";
  const code = error?.code?.toLowerCase() ?? "";
  return code === "user_already_exists" || message.includes("already registered") || message.includes("already been registered");
}

export function shouldTryLegacyFallback(error: { message?: string; code?: string } | null | undefined): boolean {
  const message = error?.message?.toLowerCase() ?? "";
  return isEmailNotConfirmedError(error) || message.includes("invalid login credentials");
}

export async function attemptConfirmedLogin(userId: string, email: string, password: string) {
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

export async function signInWithPasswordFast(email: string, password: string) {
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

export async function resolveTenantIdByStoreCode(storeCode?: string | null): Promise<string | null> {
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
  }

  return null;
}

export async function ensureUserProfile(authUser: SupabaseAuthUser | null, metadata?: Record<string, unknown>, password?: string) {
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
    const linkPayload: Record<string, unknown> = {
      auth_user_id: authUser.id,
      email: authUser.email?.trim().toLowerCase() || existingUser.email,
      tenant_id: metadata.tenant_id as string,
    };

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

/**
 * Attempt to sync legacy password into Supabase Auth when the Auth account
 * exists with a different password. Uses SECURITY DEFINER RPC.
 */
export async function syncLegacyAuthPassword(
  email: string,
  newPassword: string,
  legacyUserId: string,
): Promise<boolean> {
  try {
    const { error } = await withTimeout(
      (supabase as any).rpc("sync_legacy_auth_password", {
        p_email: email,
        p_new_password: newPassword,
        p_legacy_user_id: legacyUserId,
      }),
      3000,
      { error: createTimeoutError("sync_legacy_auth_password") } as any,
    );
    if (error) {
      console.warn("[Auth] sync_legacy_auth_password failed:", error.message);
      return false;
    }
    return true;
  } catch (e) {
    console.warn("[Auth] sync_legacy_auth_password unavailable:", e);
    return false;
  }
}

/** Sync in-memory state for non-React consumers (auditService) */
export function syncGlobalState(appUser: AppUser | null) {
  setTenantState(appUser?.tenant_id ?? null, appUser?.id ?? null);
}
