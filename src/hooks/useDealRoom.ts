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

export interface DealRoomProposal {
  id: string;
  tenant_id: string;
  client_id: string | null;
  tracking_id: string | null;
  usuario_id: string | null;
  valor_proposta: number;
  descricao: string | null;
  forma_pagamento: string | null;
  status: string;
  stripe_checkout_url: string | null;
  stripe_payment_intent_id: string | null;
  visualizada_em: string | null;
  clicou_em: string | null;
  aceita_em: string | null;
  recusada_em: string | null;
  pago_em: string | null;
  motivo_recusa: string | null;
  created_at: string;
  updated_at: string;
}

export function useDealRoom() {
  const [loading, setLoading] = useState(false);
  const [access, setAccess] = useState<DealRoomAccess | null>(null);

  const validateAccess = useCallback(async (tenantId: string): Promise<DealRoomAccess> => {
    setLoading(true);
    try {
      // Use the existing RPC
      const { data, error } = await supabase.rpc("validate_dealroom_access", {
        p_tenant_id: tenantId,
      });

      if (error) {
        // Fallback: check recursos_vip directly
        const { data: tenant } = await supabase
          .from("tenants")
          .select("recursos_vip, plano, ativo")
          .eq("id", tenantId)
          .single();

        if (!tenant || !tenant.ativo) {
          const result = { allowed: false, reason: "Tenant inativo" };
          setAccess(result);
          return result;
        }

        const recursos = (tenant.recursos_vip as Record<string, any>) || {};
        if (recursos.deal_room) {
          const result = { allowed: true, plano: tenant.plano || "vip" };
          setAccess(result);
          return result;
        }

        const result = { allowed: false, reason: "Deal Room não habilitada no seu plano" };
        setAccess(result);
        return result;
      }

      const result = data as unknown as DealRoomAccess;
      setAccess(result);
      if (!result.allowed) {
        toast.error(result.reason || "Acesso não permitido à Deal Room");
      }
      return result;
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
      const taxa_percentual = 2.5;
      const taxa_valor = transactionData.valor_venda * (taxa_percentual / 100);

      const { data, error } = await supabase.from("dealroom_transactions").insert({
        tenant_id: tenantId,
        valor_venda: transactionData.valor_venda,
        taxa_plataforma_percentual: taxa_percentual,
        taxa_plataforma_valor: taxa_valor,
        client_id: transactionData.client_id || null,
        usuario_id: transactionData.usuario_id || null,
        simulation_id: transactionData.simulation_id || null,
        forma_pagamento: transactionData.forma_pagamento || null,
        numero_contrato: transactionData.numero_contrato || null,
        nome_cliente: transactionData.nome_cliente || null,
        nome_vendedor: transactionData.nome_vendedor || null,
      }).select().single();

      if (error) {
        console.error("Record sale error:", error);
        toast.error("Erro ao registrar venda na Deal Room");
        return null;
      }

      // Record daily usage
      const today = new Date().toISOString().split("T")[0];
      await supabase.from("dealroom_usage").insert({
        tenant_id: tenantId,
        usuario_id: transactionData.usuario_id || null,
        usage_date: today,
      });

      return { success: true, transaction: data };
    } catch {
      toast.error("Erro de conexão");
      return null;
    } finally {
      setLoading(false);
    }
  }, []);

  const getDailyUsage = useCallback(async (tenantId: string): Promise<number> => {
    try {
      const { data } = await supabase.rpc("get_dealroom_daily_usage", {
        p_tenant_id: tenantId,
      });
      return (data as number) || 0;
    } catch {
      return 0;
    }
  }, []);

  const getMetrics = useCallback(async (filters?: {
    tenant_id?: string;
  }): Promise<{ metrics: DealRoomMetrics; ranking: VendorRank[]; transactions: DealRoomTransaction[]; proposalStats?: any } | null> => {
    setLoading(true);
    try {
      const tid = filters?.tenant_id;
      if (!tid) return null;

      // Get ALL transactions for reference
      const { data: transactions } = await supabase
        .from("dealroom_transactions")
        .select("*")
        .eq("tenant_id", tid)
        .order("created_at", { ascending: false });

      const txns = (transactions || []) as DealRoomTransaction[];

      // Only count transactions that originate from PAID proposals (confirmed payment)
      // Transactions with forma_pagamento = "dealroom" are auto-created when proposal is marked as paid
      const confirmedTxns = txns.filter(t => t.forma_pagamento === "dealroom");
      const totalVendas = confirmedTxns.length;
      const totalTransacionado = confirmedTxns.reduce((s, t) => s + (t.valor_venda || 0), 0);
      const totalTaxas = confirmedTxns.reduce((s, t) => s + (t.taxa_plataforma_valor || 0), 0);
      const ticketMedio = totalVendas > 0 ? totalTransacionado / totalVendas : 0;

      // Build vendor ranking from confirmed transactions only
      const vendorMap: Record<string, { nome: string; total: number; vendas: number }> = {};
      confirmedTxns.forEach((t: any) => {
        const key = t.usuario_id || "desconhecido";
        if (!vendorMap[key]) vendorMap[key] = { nome: t.nome_vendedor || "Desconhecido", total: 0, vendas: 0 };
        vendorMap[key].total += t.valor_venda || 0;
        vendorMap[key].vendas += 1;
      });

      const ranking = Object.entries(vendorMap)
        .map(([usuario_id, v]) => ({
          posicao: 0, nome: v.nome, usuario_id, total_vendido: v.total, vendas: v.vendas, taxa_conversao: 0,
        }))
        .sort((a, b) => b.total_vendido - a.total_vendido)
        .map((r, i) => ({ ...r, posicao: i + 1 }));

      // Get proposals from dealroom_proposals table
      let proposalStats = { total: 0, enviadas: 0, visualizadas: 0, aceitas: 0, pagas: 0, recusadas: 0 };
      try {
        const { data: proposals } = await supabase
          .from("dealroom_proposals" as any)
          .select("status, valor_proposta")
          .eq("tenant_id", tid);

        if (proposals && Array.isArray(proposals)) {
          proposalStats = {
            total: proposals.length,
            enviadas: proposals.filter((p: any) => p.status === "enviada").length,
            visualizadas: proposals.filter((p: any) => p.status === "visualizada").length,
            aceitas: proposals.filter((p: any) => p.status === "aceita").length,
            pagas: proposals.filter((p: any) => p.status === "paga").length,
            recusadas: proposals.filter((p: any) => p.status === "recusada").length,
          };
        }
      } catch {
        // Table might not exist yet
      }

      return {
        metrics: { totalVendas, totalTransacionado, totalTaxas, ticketMedio, totalReunioes: 0, taxaConversao: 0 },
        ranking,
        transactions: txns,
        proposalStats,
      };
    } catch {
      return null;
    } finally {
      setLoading(false);
    }
  }, []);

  const listProposals = useCallback(async (tenantId: string): Promise<DealRoomProposal[]> => {
    try {
      const { data, error } = await supabase
        .from("dealroom_proposals" as any)
        .select("*")
        .eq("tenant_id", tenantId)
        .order("created_at", { ascending: false })
        .limit(50);

      if (error) {
        console.error("List proposals error:", error);
        return [];
      }
      return (data || []) as unknown as DealRoomProposal[];
    } catch {
      return [];
    }
  }, []);

  const createProposal = useCallback(async (tenantId: string, proposalData: {
    client_id?: string;
    usuario_id?: string;
    tracking_id?: string;
    valor_proposta: number;
    descricao?: string;
    forma_pagamento?: string;
    numero_contrato?: string;
  }): Promise<DealRoomProposal | null> => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("dealroom_proposals" as any)
        .insert({
          tenant_id: tenantId,
          client_id: proposalData.client_id || null,
          usuario_id: proposalData.usuario_id || null,
          tracking_id: proposalData.tracking_id || null,
          valor_proposta: proposalData.valor_proposta,
          descricao: proposalData.descricao || null,
          forma_pagamento: proposalData.forma_pagamento || null,
          status: "enviada",
        })
        .select()
        .single();

      if (error) {
        console.error("Create proposal error:", error);
        toast.error("Erro ao criar proposta");
        return null;
      }

      return data as unknown as DealRoomProposal;
    } catch {
      toast.error("Erro de conexão");
      return null;
    } finally {
      setLoading(false);
    }
  }, []);

  const trackProposalEvent = useCallback(async (proposalId: string, event: string, motivo?: string) => {
    try {
      const updates: Record<string, any> = { updated_at: new Date().toISOString() };

      if (event === "visualizada") {
        updates.visualizada_em = new Date().toISOString();
        updates.status = "visualizada";
      } else if (event === "clicou") {
        updates.clicou_em = new Date().toISOString();
      } else if (event === "aceita") {
        updates.aceita_em = new Date().toISOString();
        updates.status = "aceita";
      } else if (event === "recusada") {
        updates.recusada_em = new Date().toISOString();
        updates.status = "recusada";
        updates.motivo_recusa = motivo || null;
      } else if (event === "paga") {
        updates.pago_em = new Date().toISOString();
        updates.status = "paga";
      }

      const { error } = await supabase
        .from("dealroom_proposals" as any)
        .update(updates)
        .eq("id", proposalId);

      if (error) {
        console.error("Track proposal error:", error);
        toast.error("Erro ao atualizar proposta");
        return false;
      }

      // If paid or accepted, update client status and record transaction
      if (event === "paga" || event === "aceita") {
        const { data: proposal } = await supabase
          .from("dealroom_proposals" as any)
          .select("tracking_id, client_id, tenant_id, valor_proposta, usuario_id")
          .eq("id", proposalId)
          .single();

        if (proposal) {
          const p = proposal as any;
          if (p.tracking_id) {
            await supabase.from("client_tracking" as any)
              .update({ status: "fechado" })
              .eq("id", p.tracking_id);
          }
          if (p.client_id) {
            await supabase.from("clients")
              .update({ status: "fechado" } as any)
              .eq("id", p.client_id);
          }
          if (event === "paga") {
            await supabase.from("dealroom_transactions").insert({
              tenant_id: p.tenant_id,
              valor_venda: p.valor_proposta,
              taxa_plataforma_percentual: 2.5,
              taxa_plataforma_valor: Number(p.valor_proposta) * 0.025,
              client_id: p.client_id || null,
              usuario_id: p.usuario_id || null,
              forma_pagamento: "dealroom",
            });
          }
        }
      }

      return true;
    } catch {
      toast.error("Erro de conexão");
      return false;
    }
  }, []);

  return { loading, access, validateAccess, recordSale, getDailyUsage, getMetrics, listProposals, createProposal, trackProposalEvent };
}

export type { DealRoomAccess, DealRoomMetrics, VendorRank, DealRoomTransaction };
