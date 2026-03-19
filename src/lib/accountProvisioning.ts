import { supabase } from "@/lib/supabaseClient";

export interface StoreSignupResult {
  tenantId: string;
  codigoLoja: string;
}

export interface CreateTenantUserPayload {
  nomeCompleto: string;
  email: string;
  password: string;
  apelido?: string;
  telefone?: string;
  cargoId?: string | null;
  fotoUrl?: string | null;
  tipoRegime?: string | null;
  comissaoPercentual?: number;
  salarioFixo?: number;
}

interface CreateTenantUserResult {
  userId: string;
  codigoLoja: string | null;
}

async function invokeProvisioning<T>(body: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.functions.invoke("store-signup", {
    body,
  });

  if (error) {
    throw new Error(error.message || "Não foi possível concluir a operação.");
  }

  if (!data?.success) {
    throw new Error(data?.error || "Não foi possível concluir a operação.");
  }

  return data.data as T;
}

export async function createStoreAndAdminAccount(email: string, password: string) {
  return invokeProvisioning<StoreSignupResult>({
    action: "create_store_admin",
    email,
    password,
  });
}

export async function createTenantUser(payload: CreateTenantUserPayload) {
  return invokeProvisioning<CreateTenantUserResult>({
    action: "create_tenant_user",
    ...payload,
  });
}
