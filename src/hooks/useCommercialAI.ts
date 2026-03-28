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

    // Compute metrics from real CRM data
    const { data: clients } = await (supabase as any)
      .from("clients")
      .select("id, nome, status, created_at, valor_fechamento, responsavel_id, vendedor, updated_at, telefone, email")
      .eq("tenant_id", tenantId);

    if (!clients) return;

    // Fetch user info for mapping
    const { data: usuarios } = await (supabase as any)
      .from("usuarios")
      .select("id, nome_completo")
      .eq("tenant_id", tenantId)
      .eq("ativo", true);

    const userNameMap = new Map((usuarios || []).map((u: any) => [u.id, u.nome_completo]));

    // Group clients by seller/responsavel for individual tracking
    const grouped: Record<string, any[]> = {};
    const openStatuses = ["novo", "em_negociacao", "proposta_enviada"];
    const openClients = clients.filter((c: any) => openStatuses.includes(c.status));

    for (const client of openClients) {
      const sellerId = client.responsavel_id || "sem_responsavel";
      const sellerName = client.vendedor || (client.responsavel_id ? userNameMap.get(client.responsavel_id) : null) || "Sem vendedor";
      if (!grouped[sellerId]) grouped[sellerId] = [];
      grouped[sellerId].push({ ...client, seller_name: sellerName });
    }
    setClientsBySeller(grouped);

    const totalLeads = clients.length;
    const proposalStatuses = ["proposta_enviada", "em_negociacao", "fechado"];
    const proposals = clients.filter((c: any) => proposalStatuses.includes(c.status));
    const closed = clients.filter((c: any) => c.status === "fechado");
    const totalRevenue = closed.reduce((sum: number, c: any) => sum + (Number(c.valor_fechamento) || 0), 0);
    const avgTicket = closed.length > 0 ? totalRevenue / closed.length : 0;
    const conversionRate = totalLeads > 0 ? (closed.length / totalLeads) * 100 : 0;

    // Avg close days
    let totalDays = 0;
    closed.forEach((c: any) => {
      const created = new Date(c.created_at);
      const now = new Date();
      totalDays += Math.floor((now.getTime() - created.getTime()) / (1000 * 60 * 60 * 24));
    });
    const avgCloseDays = closed.length > 0 ? totalDays / closed.length : 0;

    // Stalled leads (no activity > 3 days, not closed)
    const threeDaysAgo = new Date();
    threeDaysAgo.setDate(threeDaysAgo.getDate() - 3);
    const stalled = clients.filter((c: any) =>
      c.status !== "fechado" && c.status !== "perdido" &&
      new Date(c.created_at) < threeDaysAgo
    );
    setStalledLeads(stalled);

    // Hot leads
    const hot = clients.filter((c: any) =>
      ["em_negociacao", "proposta_enviada"].includes(c.status) &&
      new Date(c.created_at) >= threeDaysAgo
    );
    setHotLeads(hot);

    setMetrics({
      leads_count: totalLeads,
      proposals_sent: proposals.length,
      deals_closed: closed.length,
      conversion_rate: Math.round(conversionRate * 10) / 10,
      revenue: totalRevenue,
      average_ticket: Math.round(avgTicket),
      avg_close_days: Math.round(avgCloseDays),
      response_rate: totalLeads > 0 ? Math.round((proposals.length / totalLeads) * 100) : 0,
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

    // Build rankings from clients data
    const { data: clients } = await (supabase as any)
      .from("clients")
      .select("responsavel_id, status, valor_fechamento")
      .eq("tenant_id", tenantId)
      .eq("status", "fechado");

    const { data: usuarios } = await (supabase as any)
      .from("usuarios")
      .select("id, nome_completo")
      .eq("tenant_id", tenantId)
      .eq("ativo", true);

    if (!clients || !usuarios) return;

    const userMap = new Map(usuarios.map((u: any) => [u.id, u.nome_completo]));
    const scoreMap = new Map<string, { deals: number; revenue: number }>();

    clients.forEach((c: any) => {
      if (!c.responsavel_id) return;
      const existing = scoreMap.get(c.responsavel_id) || { deals: 0, revenue: 0 };
      existing.deals += 1;
      existing.revenue += Number(c.valor_fechamento) || 0;
      scoreMap.set(c.responsavel_id, existing);
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
