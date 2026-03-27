/**
 * Hook to fetch client_tracking records for detecting closed contracts.
 */
import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/lib/supabaseClient";
import { getTenantId } from "@/lib/tenantState";

export interface ClientTrackingRecord {
  id: string;
  client_id: string;
  numero_contrato: string;
  nome_cliente: string;
  cpf_cnpj: string | null;
  quantidade_ambientes: number;
  valor_contrato: number;
  data_fechamento: string | null;
  projetista: string | null;
  status: string;
  comissao_percentual: number | null;
  comissao_valor: number | null;
  comissao_status: string | null;
  created_at: string;
}

export function useClientTracking(clientIds?: string[]) {
  const [trackingMap, setTrackingMap] = useState<Record<string, ClientTrackingRecord[]>>({});
  const [loading, setLoading] = useState(false);

  const fetchTrackings = useCallback(async () => {
    const tenantId = getTenantId();
    if (!tenantId) return;

    setLoading(true);
    let query = supabase
      .from("client_tracking")
      .select("*")
      .eq("tenant_id", tenantId);

    if (clientIds && clientIds.length > 0) {
      query = query.in("client_id", clientIds);
    }

    const { data } = await query;
    if (data) {
      const map: Record<string, ClientTrackingRecord[]> = {};
      (data as any[]).forEach((t: ClientTrackingRecord) => {
        if (!map[t.client_id]) map[t.client_id] = [];
        map[t.client_id].push(t);
      });
      setTrackingMap(map);
    }
    setLoading(false);
  }, [clientIds?.join(",")]);

  useEffect(() => {
    fetchTrackings();
  }, [fetchTrackings]);

  return { trackingMap, loading, refresh: fetchTrackings };
}

/**
 * Check if a client has a closed contract in tracking.
 */
export function hasClosedContract(trackings: ClientTrackingRecord[] | undefined): boolean {
  if (!trackings || trackings.length === 0) return false;
  return true; // Any record in client_tracking means contract was closed
}

export function getClientTrackingInfo(trackings: ClientTrackingRecord[] | undefined) {
  if (!trackings || trackings.length === 0) return null;
  // Return the most recent tracking
  const sorted = [...trackings].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
  return sorted[0];
}
