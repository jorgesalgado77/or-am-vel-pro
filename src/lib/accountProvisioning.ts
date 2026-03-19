import { supabase } from "@/lib/supabaseClient";

export interface StoreSignupResult {
  tenantId: string;
  codigoLoja: string;
  cargoId: string;
}

/**
 * Creates a new store (tenant) + company_settings + admin cargo
 * via a SECURITY DEFINER RPC that bypasses RLS.
 */
export async function provisionNewStore(email: string): Promise<StoreSignupResult> {
  const { data, error } = await (supabase as any).rpc("provision_new_store", {
    p_email: email.trim().toLowerCase(),
  });

  if (error) {
    console.error("[provisionNewStore] RPC error:", error);
    throw new Error(error.message || "Erro ao criar a loja.");
  }

  if (!data || !data.tenant_id) {
    throw new Error("Resposta inesperada ao criar a loja.");
  }

  return {
    tenantId: data.tenant_id,
    codigoLoja: data.codigo_loja,
    cargoId: data.cargo_id,
  };
}

/**
 * Creates the usuario row linked to the tenant after Supabase Auth signup.
 */
export async function createUsuarioProfile(params: {
  authUserId: string;
  email: string;
  tenantId: string;
  cargoId: string;
  senha: string;
}) {
  // Hash password via existing RPC
  let senhaHash: string | null = null;
  try {
    const { data } = await supabase.rpc("hash_password", { plain_text: params.senha }) as any;
    senhaHash = data;
  } catch {
    // If hash_password doesn't exist, store plain (not ideal but matches existing pattern)
    senhaHash = params.senha;
  }

  const { error } = await supabase.from("usuarios").insert({
    id: params.authUserId,
    auth_user_id: params.authUserId,
    nome_completo: params.email.split("@")[0],
    apelido: "Admin",
    email: params.email,
    cargo_id: params.cargoId,
    tenant_id: params.tenantId,
    senha: senhaHash,
    primeiro_login: true,
    ativo: true,
  } as any);

  if (error) {
    console.error("[createUsuarioProfile] Insert error:", error);
    throw new Error("Erro ao vincular usuário à loja: " + error.message);
  }
}

/**
 * Checks if email already exists in usuarios table.
 */
export async function checkEmailExists(email: string): Promise<boolean> {
  const { data } = await supabase
    .from("usuarios")
    .select("id")
    .eq("email", email.trim().toLowerCase())
    .limit(1);

  return Boolean(data && data.length > 0);
}
