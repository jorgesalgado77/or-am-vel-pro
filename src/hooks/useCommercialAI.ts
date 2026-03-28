import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/lib/supabaseClient";

export interface SalesMetrics {
  leads_count: number;
  proposals_sent: number;
  deals_closed: number;
  conversion_rate: number;
  revenue: number;
  average_ticket: number;
  avg_close_days: number;
  response_rate: number;
}

export interface AIInsight {
  id: string;
  type: "alert" | "suggestion" | "warning" | "praise";
  message: string;
  priority: "low" | "medium" | "high";
  is_read: boolean;
  action_type?: string;
  action_data?: Record<string, unknown>;
  user_id?: string;
  created_at: string;
}

export interface SellerRanking {
  user_id: string;
  user_name: string;
  score: number;
  deals_closed: number;
  revenue: number;
  badges: string[];
}

export function useCommercialAI(tenantId: string | null, userId?: string, userRole?: string) {
  const [metrics, setMetrics] = useState<SalesMetrics | null>(null);
  const [insights, setInsights] = useState<AIInsight[]>([]);
  const [rankings, setRankings] = useState<SellerRanking[]>([]);
  const [loading, setLoading] = useState(true);
  const [stalledLeads, setStalledLeads] = useState<any[]>([]);
  const [hotLeads, setHotLeads] = useState<any[]>([]);
  const [clientsBySeller, setClientsBySeller] = useState<Record<string, any[]>>({});

  const isAdminOrManager = userRole
    ? ["administrador", "gerente", "admin"].includes(userRole.toLowerCase())
    : false;

  const fetchMetrics = useCallback(async () => {
    if (!tenantId) return;

    // Fetch all clients for the tenant
    const { data: clients, error: clientsError } = await (supabase as any)
      .from("clients")
      .select("id, nome, status, created_at, vendedor, updated_at, telefone1, email")
      .eq("tenant_id", tenantId);

    if (clientsError) { console.error("Clients fetch error:", clientsError); }
    if (!clients) return;

    // Fetch contracts (source of truth for closed deals)
    const { data: contracts } = await (supabase as any)
      .from("client_contracts")
      .select("id, client_id, simulation_id, created_at")
      .eq("tenant_id", tenantId);

    // Fetch tracking records for valor_contrato and data_fechamento
    const { data: tracking } = await (supabase as any)
      .from("client_tracking")
      .select("client_id, valor_contrato, data_fechamento, created_at, status")
      .eq("tenant_id", tenantId);

    // Fetch simulations for valor à vista calculation
    const contractSimIds = (contracts || []).map((c: any) => c.simulation_id).filter(Boolean);
    let simulations: any[] = [];
    if (contractSimIds.length > 0) {
      const { data: sims } = await (supabase as any)
        .from("simulations")
        .select("id, client_id, valor_tela, desconto1, desconto2, desconto3")
        .in("id", contractSimIds);
      simulations = sims || [];
    }

    // User name mapping
    const { data: usuarios } = await (supabase as any)
      .from("usuarios")
      .select("id, nome_completo")
      .eq("tenant_id", tenantId)
      .eq("ativo", true);

    const userNameMap = new Map((usuarios || []).map((u: any) => [u.id, u.nome_completo]));

    // Clients with contracts = FECHADO (source of truth)
    const contractClientIds = new Set((contracts || []).map((c: any) => c.client_id));
    const trackingMap = new Map((tracking || []).map((t: any) => [t.client_id, t]));

    // Calculate valor à vista from simulation: valor_tela * (1 - d1/100) * (1 - d2/100) * (1 - d3/100)
    const simMap = new Map(simulations.map((s: any) => [s.id, s]));
    const contractRevenues: { clientId: string; valor: number; closedAt: string }[] = [];

    for (const contract of (contracts || [])) {
      let valor = 0;
      const sim = contract.simulation_id ? simMap.get(contract.simulation_id) : null;
      if (sim) {
        valor = sim.valor_tela || 0;
        if (sim.desconto1) valor *= (1 - sim.desconto1 / 100);
        if (sim.desconto2) valor *= (1 - sim.desconto2 / 100);
        if (sim.desconto3) valor *= (1 - sim.desconto3 / 100);
      }
      // Fallback to tracking valor_contrato
      const track = trackingMap.get(contract.client_id) as any;
      if (valor === 0 && track?.valor_contrato) {
        valor = Number(track.valor_contrato) || 0;
      }
      const closedAt = track?.data_fechamento || contract.created_at;
      contractRevenues.push({ clientId: contract.client_id, valor, closedAt });
    }

    // Group open clients by seller
    const openStatuses = ["novo", "em_negociacao", "proposta_enviada"];
    const openClients = clients.filter((c: any) => openStatuses.includes(c.status) && !contractClientIds.has(c.id));
    const grouped: Record<string, any[]> = {};
    for (const client of openClients) {
      const sellerName = client.vendedor || "Sem vendedor";
      const sellerId = sellerName;
      if (!grouped[sellerId]) grouped[sellerId] = [];
      grouped[sellerId].push({ ...client, seller_name: sellerName });
    }
    setClientsBySeller(grouped);

    const totalLeads = clients.filter((c: any) => !contractClientIds.has(c.id) && c.status !== "perdido").length;
    const proposalStatuses = ["proposta_enviada", "em_negociacao"];
    const proposals = clients.filter((c: any) => proposalStatuses.includes(c.status) && !contractClientIds.has(c.id));
    const closedCount = contractClientIds.size;
    const totalRevenue = contractRevenues.reduce((sum, cr) => sum + cr.valor, 0);
    const avgTicket = closedCount > 0 ? totalRevenue / closedCount : 0;
    const allClients = totalLeads + closedCount;
    const conversionRate = allClients > 0 ? (closedCount / allClients) * 100 : 0;

    // Avg close days from tracking data_fechamento or contract created_at vs client created_at
    let totalDays = 0;
    let countWithDays = 0;
    for (const cr of contractRevenues) {
      const client = clients.find((c: any) => c.id === cr.clientId);
      if (client) {
        const created = new Date(client.created_at);
        const closed = new Date(cr.closedAt);
        const days = Math.max(0, Math.floor((closed.getTime() - created.getTime()) / 86400000));
        totalDays += days;
        countWithDays++;
      }
    }
    const avgCloseDays = countWithDays > 0 ? Math.round(totalDays / countWithDays) : 0;

    // Stalled leads (no activity > 3 days, not closed/perdido, no contract)
    const threeDaysAgo = new Date();
    threeDaysAgo.setDate(threeDaysAgo.getDate() - 3);
    const stalled = clients.filter((c: any) =>
      !contractClientIds.has(c.id) &&
      c.status !== "fechado" && c.status !== "perdido" &&
      new Date(c.updated_at || c.created_at) < threeDaysAgo
    );
    setStalledLeads(stalled);

    // Hot leads — in negotiation with recent activity, no contract
    const hot = clients.filter((c: any) =>
      !contractClientIds.has(c.id) &&
      ["em_negociacao", "proposta_enviada"].includes(c.status) &&
      new Date(c.updated_at || c.created_at) >= threeDaysAgo
    );
    setHotLeads(hot);

    setMetrics({
      leads_count: totalLeads,
      proposals_sent: proposals.length,
      deals_closed: closedCount,
      conversion_rate: Math.round(conversionRate * 10) / 10,
      revenue: totalRevenue,
      average_ticket: Math.round(avgTicket),
      avg_close_days: avgCloseDays,
      response_rate: allClients > 0 ? Math.round((proposals.length / allClients) * 100) : 0,
    });
  }, [tenantId, userId, isAdminOrManager]);

  const generateInsights = useCallback(async () => {
    if (!tenantId || !metrics) return;

    const newInsights: Omit<AIInsight, "id" | "created_at">[] = [];

    // Alert: stalled leads
    if (stalledLeads.length > 0) {
      // Group stalled by seller
      const stalledBySeller: Record<string, number> = {};
      stalledLeads.forEach((l: any) => {
        const seller = l.vendedor || "Sem vendedor";
        stalledBySeller[seller] = (stalledBySeller[seller] || 0) + 1;
      });
      const sellerDetail = Object.entries(stalledBySeller).map(([s, c]) => `${s}: ${c}`).join(", ");

      newInsights.push({
        type: "alert",
        message: `${stalledLeads.length} lead(s) sem resposta há mais de 3 dias! ${isAdminOrManager ? `Por vendedor: ${sellerDetail}.` : "Atenda agora para não perder a venda."}`,
        priority: "high",
        is_read: false,
        action_type: "follow_up",
      });
    }

    // Warning: low conversion
    if (metrics.conversion_rate < 15 && metrics.leads_count > 5) {
      newInsights.push({
        type: "warning",
        message: `Sua taxa de conversão está em ${metrics.conversion_rate}%. A média do setor é 20-30%. Revise sua abordagem de vendas.`,
        priority: "medium",
        is_read: false,
        action_type: "change_approach",
      });
    }

    // Suggestion: hot leads
    if (hotLeads.length > 0) {
      const hotBySeller: Record<string, string[]> = {};
      hotLeads.forEach((l: any) => {
        const seller = l.vendedor || "Sem vendedor";
        if (!hotBySeller[seller]) hotBySeller[seller] = [];
        hotBySeller[seller].push(l.nome || "Cliente");
      });
      const hotDetail = isAdminOrManager
        ? "\n" + Object.entries(hotBySeller).map(([s, names]) => `• **${s}:** ${names.slice(0, 3).join(", ")}${names.length > 3 ? ` +${names.length - 3}` : ""}`).join("\n")
        : "";

      newInsights.push({
        type: "suggestion",
        message: `${hotLeads.length} lead(s) quente(s) aguardando ação. Foque nesses clientes para fechar vendas rapidamente!${hotDetail}`,
        priority: "high",
        is_read: false,
        action_type: "send_message",
      });
    }

    // Praise: good performance
    if (metrics.conversion_rate >= 25) {
      newInsights.push({
        type: "praise",
        message: `Parabéns! Sua taxa de conversão de ${metrics.conversion_rate}% está acima da média. Continue assim! 🏆`,
        priority: "low",
        is_read: false,
      });
    }

    // Suggestion: upsell
    if (metrics.average_ticket > 0 && metrics.average_ticket < 15000) {
      newInsights.push({
        type: "suggestion",
        message: `Seu ticket médio é R$ ${metrics.average_ticket.toLocaleString("pt-BR")}. Tente incluir produtos complementares do catálogo para aumentar o valor.`,
        priority: "medium",
        is_read: false,
        action_type: "offer_discount",
      });
    }

    setInsights(newInsights.map((ins, i) => ({
      ...ins,
      id: `generated-${i}`,
      created_at: new Date().toISOString(),
    })) as AIInsight[]);
  }, [tenantId, metrics, stalledLeads, hotLeads, isAdminOrManager]);

  const fetchRankings = useCallback(async () => {
    if (!tenantId) return;

    // Build rankings from clients + contracts data
    const { data: clients } = await (supabase as any)
      .from("clients")
      .select("id, vendedor, status")
      .eq("tenant_id", tenantId)
      .eq("status", "fechado");

    // Also get contracts for revenue
    const { data: contractsForRanking } = await (supabase as any)
      .from("client_contracts")
      .select("client_id, simulation_id")
      .eq("tenant_id", tenantId);

    const { data: usuarios } = await (supabase as any)
      .from("usuarios")
      .select("id, nome_completo")
      .eq("tenant_id", tenantId)
      .eq("ativo", true);

    if (!clients || !usuarios) return;

    // Get simulations for revenue
    const simIds = (contractsForRanking || []).map((c: any) => c.simulation_id).filter(Boolean);
    let sims: any[] = [];
    if (simIds.length > 0) {
      const { data: s } = await (supabase as any).from("simulations").select("id, client_id, valor_tela, desconto1, desconto2, desconto3").in("id", simIds);
      sims = s || [];
    }
    const simByClient = new Map(sims.map((s: any) => {
      const contract = (contractsForRanking || []).find((c: any) => c.simulation_id === s.id);
      return [contract?.client_id, s];
    }));

    const scoreMap = new Map<string, { deals: number; revenue: number }>();

    clients.forEach((c: any) => {
      const seller = c.vendedor || "Sem vendedor";
      const existing = scoreMap.get(seller) || { deals: 0, revenue: 0 };
      existing.deals += 1;
      const sim = simByClient.get(c.id);
      if (sim) {
        let valor = sim.valor_tela || 0;
        if (sim.desconto1) valor *= (1 - sim.desconto1 / 100);
        if (sim.desconto2) valor *= (1 - sim.desconto2 / 100);
        if (sim.desconto3) valor *= (1 - sim.desconto3 / 100);
        existing.revenue += valor;
      }
      scoreMap.set(seller, existing);
    });

    const rankingList: SellerRanking[] = Array.from(scoreMap.entries())
      .map(([uid, data]) => ({
        user_id: uid,
        user_name: (userMap.get(uid) as string) || "Desconhecido",
        score: data.deals * 100 + Math.floor(data.revenue / 1000),
        deals_closed: data.deals,
        revenue: data.revenue,
        badges: data.deals >= 10 ? ["🏆 Top Seller"] : data.deals >= 5 ? ["⭐ Destaque"] : [],
      }))
      .sort((a, b) => b.score - a.score);

    setRankings(rankingList);
  }, [tenantId]);

  const markInsightRead = useCallback((id: string) => {
    setInsights(prev => prev.map(ins => ins.id === id ? { ...ins, is_read: true } : ins));
  }, []);

  useEffect(() => {
    if (!tenantId) return;
    setLoading(true);
    Promise.all([fetchMetrics(), fetchRankings()]).finally(() => setLoading(false));
  }, [tenantId, fetchMetrics, fetchRankings]);

  useEffect(() => {
    if (metrics) generateInsights();
  }, [metrics, generateInsights]);

  return {
    metrics,
    insights,
    rankings,
    stalledLeads,
    hotLeads,
    loading,
    markInsightRead,
    refreshMetrics: fetchMetrics,
    clientsBySeller,
    isAdminOrManager,
  };
}
