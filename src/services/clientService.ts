/**
 * Centralized Client Service
 * 
 * Consolidates all client-related Supabase operations.
 */

import { supabase } from "@/lib/supabaseClient";
import { getCurrentTenantId } from "@/contexts/TenantContext";
import { generateOrcamentoNumber } from "@/services/financialService";
import type { Database } from "@/integrations/supabase/types";

type Client = Database["public"]["Tables"]["clients"]["Row"];
type ClientInsert = Database["public"]["Tables"]["clients"]["Insert"];

export interface FetchClientsResult {
  clients: Client[];
  error: string | null;
}

export interface LastSimInfo {
  valor_final: number;
  created_at: string;
}

/**
 * Fetches all clients ordered by creation date (newest first).
 */
export async function fetchClients(): Promise<FetchClientsResult> {
  const { data, error } = await supabase
    .from("clients")
    .select("*")
    .order("created_at", { ascending: false });

  if (error) return { clients: [], error: "Erro ao carregar clientes" };
  return { clients: data || [], error: null };
}

/**
 * Creates a new client with auto-generated budget number.
 */
export async function createClient(
  data: Omit<ClientInsert, "numero_orcamento" | "numero_orcamento_seq">
): Promise<{ client: Client | null; error: string | null }> {
  const orcamento = await generateOrcamentoNumber();
  const tenantId = getCurrentTenantId();
  const insertData = { ...data, ...orcamento, ...(tenantId ? { tenant_id: tenantId } : {}) };

  const { data: created, error } = await supabase
    .from("clients")
    .insert(insertData as any)
    .select("*")
    .single();

  if (error) return { client: null, error: "Erro ao criar cliente" };
  return { client: created as Client, error: null };
}

/**
 * Updates an existing client.
 */
export async function updateClient(
  id: string,
  data: Record<string, unknown>
): Promise<{ error: string | null }> {
  const { error } = await supabase.from("clients").update(data).eq("id", id);
  if (error) return { error: "Erro ao atualizar cliente" };
  return { error: null };
}

/**
 * Deletes a client by ID.
 */
export async function deleteClient(id: string): Promise<{ error: string | null }> {
  const { error } = await supabase.from("clients").delete().eq("id", id);
  if (error) return { error: "Erro ao excluir cliente" };
  return { error: null };
}

/**
 * Fetches the last simulation info for all clients.
 */
export async function fetchLastSimulations(): Promise<{
  lastSims: Record<string, LastSimInfo>;
  allSimulations: { created_at: string; valor_final: number }[];
}> {
  const { data } = await supabase
    .from("simulations")
    .select("client_id, valor_final, created_at")
    .order("created_at", { ascending: false });

  if (!data) return { lastSims: {}, allSimulations: [] };

  const lastSims: Record<string, LastSimInfo> = {};
  const allSimulations: { created_at: string; valor_final: number }[] = [];

  data.forEach((s) => {
    allSimulations.push({
      created_at: s.created_at,
      valor_final: Number(s.valor_final) || 0,
    });
    if (!lastSims[s.client_id]) {
      lastSims[s.client_id] = {
        valor_final: Number(s.valor_final) || 0,
        created_at: s.created_at,
      };
    }
  });

  return { lastSims, allSimulations };
}
