import { EXTERNAL_SUPABASE_URL, supabase } from "@/lib/supabaseClient";

export interface AdminStoreUserPayload {
  id: string;
  nome_completo: string;
  email: string | null;
  telefone: string | null;
  cargo_id: string | null;
  cargo_nome: string | null;
  ativo: boolean;
  tipo_regime: string | null;
  salario_fixo: number | string | null;
  comissao_percentual: number | string | null;
  apelido?: string | null;
  foto_url?: string | null;
}

export interface AdminStoreCargoPayload {
  id: string;
  nome: string;
}

interface AdminStoreActionResponse {
  error?: string;
}

async function callAdminStoreAction<T>(payload: Record<string, unknown>): Promise<T> {
  const { data: sessionData } = await supabase.auth.getSession();
  const token = sessionData.session?.access_token;

  if (!token) {
    throw new Error("Sessão do administrador expirada.");
  }

  const response = await fetch(`${EXTERNAL_SUPABASE_URL}/functions/v1/admin-store`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(payload),
  });

  const json = (await response.json().catch(() => ({}))) as T & AdminStoreActionResponse;

  if (!response.ok) {
    throw new Error(json.error || "Erro ao executar ação administrativa.");
  }

  return json;
}

export const adminListStoreUsers = (tenantId: string) =>
  callAdminStoreAction<AdminStoreUserPayload[]>({ action: "list_store_users", tenant_id: tenantId });

export const adminListStoreCargos = (tenantId: string) =>
  callAdminStoreAction<AdminStoreCargoPayload[]>({ action: "list_store_cargos", tenant_id: tenantId });

export const adminToggleStoreUser = (userId: string, ativo: boolean) =>
  callAdminStoreAction<{ success: true }>({ action: "toggle_store_user", user_id: userId, ativo });

export const adminDeleteStoreUser = (userId: string, tenantId: string) =>
  callAdminStoreAction<{ success: true }>({ action: "delete_store_user", user_id: userId, tenant_id: tenantId });

export const adminResetStoreUserPassword = (userId: string, newPassword: string) =>
  callAdminStoreAction<{ success: true }>({ action: "reset_store_user_password", user_id: userId, new_password: newPassword });

export const adminUpsertStoreUser = (payload: {
  tenant_id: string;
  user_id?: string | null;
  nome_completo: string;
  email?: string | null;
  telefone?: string | null;
  cargo_id?: string | null;
  tipo_regime?: string | null;
  salario_fixo?: number;
  comissao_percentual?: number;
  ativo?: boolean;
}) => callAdminStoreAction<{ user_id: string }>({ action: "upsert_store_user", ...payload });