import { useState, useCallback } from "react";
import { supabase } from "@/lib/supabaseClient";
import { toast } from "sonner";

interface DealRoomAccess {
  allowed: boolean;
  reason?: string;
  usage?: number;
  limit?: number;
  plano?: string;
}

interface DealRoomMetrics {
  totalVendas: number;
  totalTransacionado: number;
  totalTaxas: number;
  ticketMedio: number;
  totalReunioes: number;
  taxaConversao: number;
}

interface VendorRank {
  posicao: number;
  nome: string;
  usuario_id: string;
  total_vendido: number;
  vendas: number;
  taxa_conversao: number;
}

interface DealRoomTransaction {
  id: string;
  tenant_id: string;
  valor_venda: number;
  taxa_plataforma_valor: number;
  nome_cliente: string | null;
  nome_vendedor: string | null;
  forma_pagamento: string | null;
  numero_contrato: string | null;
  created_at: string;
}

export function useDealRoom() {
  const [loading, setLoading] = useState(false);
  const [access, setAccess] = useState<DealRoomAccess | null>(null);

  const validateAccess = useCallback(async (tenantId: string, usuarioId?: string): Promise<DealRoomAccess> => {
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("dealroom", {
        body: { action: "validate", tenant_id: tenantId, usuario_id: usuarioId },
      });

      if (error) {
        const result = { allowed: false, reason: "Erro ao validar acesso" };
        setAccess(result);
        return result;
      }

      setAccess(data);
      if (!data.allowed) {
        toast.error(data.reason || "Acesso não permitido à Deal Room");
      }
      return data;
    } catch {
      const result = { allowed: false, reason: "Erro de conexão" };
      setAccess(result);
      return result;
    } finally {
      setLoading(false);
    }
  }, []);

  const recordSale = useCallback(async (tenantId: string, transactionData: {
    valor_venda: number;
    client_id?: string;
    usuario_id?: string;
    simulation_id?: string;
    forma_pagamento?: string;
    numero_contrato?: string;
    nome_cliente?: string;
    nome_vendedor?: string;
  }) => {
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("dealroom", {
        body: { action: "record_sale", tenant_id: tenantId, transaction_data: transactionData },
      });

      if (error || data?.error) {
        toast.error("Erro ao registrar venda na Deal Room");
        return null;
      }

      return data;
    } catch {
      toast.error("Erro de conexão");
      return null;
    } finally {
      setLoading(false);
    }
  }, []);

  const getDailyUsage = useCallback(async (tenantId: string): Promise<number> => {
    try {
      const { data } = await supabase.functions.invoke("dealroom", {
        body: { action: "daily_usage", tenant_id: tenantId },
      });
      return data?.usage || 0;
    } catch {
      return 0;
    }
  }, []);

  const getMetrics = useCallback(async (filters?: {
    tenant_id?: string;
    date_from?: string;
    date_to?: string;
  }): Promise<{ metrics: DealRoomMetrics; ranking: VendorRank[]; transactions: DealRoomTransaction[] } | null> => {
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("dealroom", {
        body: { action: "metrics", tenant_id: filters?.tenant_id, transaction_data: filters },
      });

      if (error || data?.error) return null;
      return data;
    } catch {
      return null;
    } finally {
      setLoading(false);
    }
  }, []);

  return { loading, access, validateAccess, recordSale, getDailyUsage, getMetrics };
}

export type { DealRoomAccess, DealRoomMetrics, VendorRank, DealRoomTransaction };
