/**
 * Centralized Client Service
 * 
 * Consolidates all client-related Supabase operations.
 */

import { supabase } from "@/lib/supabaseClient";
import { getResolvedTenantId } from "@/contexts/TenantContext";
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
  valor_com_desconto: number;
  created_at: string;
  sim_count: number;
}

/**
 * Fetches all clients ordered by creation date (newest first).
 */
export async function fetchClients(): Promise<FetchClientsResult> {
  // Ensure we have an active session before querying
  const { data: sessionData } = await supabase.auth.getSession();
  if (!sessionData?.session) {
    console.warn("[ClientService] No active session — cannot fetch clients");
    return { clients: [], error: "Sessão expirada. Faça login novamente." };
  }

  // Use async resolved tenant_id with JWT fallback
  const tenantId = await getResolvedTenantId();

  if (!tenantId) {
    console.warn("[ClientService] No tenant_id available — cannot fetch clients");
    return { clients: [], error: "Loja não identificada. Faça login novamente." };
  }

  const { data, error } = await supabase
    .from("clients")
    .select("*")
    .eq("tenant_id", tenantId)
    .order("created_at", { ascending: false });

  if (error) {
    console.error("fetchClients error:", error);
    return { clients: [], error: "Erro ao carregar clientes: " + error.message };
  }
  return { clients: data || [], error: null };
}

/**
 * Creates a new client with auto-generated budget number.
 */
export async function createClient(
  data: Omit<ClientInsert, "numero_orcamento" | "numero_orcamento_seq">
): Promise<{ client: Client | null; error: string | null }> {
  const orcamento = await generateOrcamentoNumber();
  const tenantId = await getResolvedTenantId();
  // Auto-set status to em_negociacao if vendedor is assigned
  const autoStatus = (data as any).vendedor ? { status: "em_negociacao" } : {};
  const insertData = { ...data, ...orcamento, ...autoStatus, ...(tenantId ? { tenant_id: tenantId } : {}) };

  const { data: created, error } = await supabase
    .from("clients")
    .insert(insertData as any)
    .select("*")
    .single();

  if (error) return { client: null, error: error.message || "Erro ao criar cliente" };
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
  allSimulations: { created_at: string; valor_final: number; valor_com_desconto?: number }[];
}> {
  const tenantId = await getResolvedTenantId();

  let query = supabase
    .from("simulations")
    .select("client_id, valor_final, valor_tela, desconto1, desconto2, desconto3, created_at")
    .order("created_at", { ascending: false });

  if (tenantId) {
    query = query.eq("tenant_id", tenantId);
  }

  const { data } = await query;

  if (!data) return { lastSims: {}, allSimulations: [] };

  const lastSims: Record<string, LastSimInfo> = {};
  const allSimulations: { created_at: string; valor_final: number }[] = [];
  const simCounts: Record<string, number> = {};

  data.forEach((s) => {
    allSimulations.push({
      created_at: s.created_at,
      valor_final: Number(s.valor_final) || 0,
    });

    simCounts[s.client_id] = (simCounts[s.client_id] || 0) + 1;

    if (!lastSims[s.client_id]) {
      // Calculate à vista value (valor com desconto)
      const vt = Number(s.valor_tela) || 0;
      const d1 = Number(s.desconto1) || 0;
      const d2 = Number(s.desconto2) || 0;
      const d3 = Number(s.desconto3) || 0;
      const after1 = vt * (1 - d1 / 100);
      const after2 = after1 * (1 - d2 / 100);
      const valorComDesconto = after2 * (1 - d3 / 100);

      lastSims[s.client_id] = {
        valor_final: Number(s.valor_final) || 0,
        valor_com_desconto: valorComDesconto,
        created_at: s.created_at,
        sim_count: 0, // will be filled after
      };
    }
  });

  // Fill sim_count
  Object.keys(lastSims).forEach((clientId) => {
    lastSims[clientId].sim_count = simCounts[clientId] || 0;
  });

  return { lastSims, allSimulations };
}
