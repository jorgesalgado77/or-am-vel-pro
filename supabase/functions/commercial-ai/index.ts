import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

type AiProvider = "openai" | "perplexity";

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

async function getAvailableProviders(adminClient: ReturnType<typeof createClient>, tenantId: string) {
  const { data } = await adminClient
    .from("api_keys")
    .select("provider, api_key, is_active")
    .eq("tenant_id", tenantId)
    .eq("is_active", true);

  const openaiKey = (data || []).find((item: any) => item.provider === "openai")?.api_key 
    || Deno.env.get("OPENAI_API_KEY") 
    || null;

  const perplexityKey = (data || []).find((item: any) => item.provider === "perplexity")?.api_key
    || Deno.env.get("PERPLEXITY_API_KEY")
    || null;

  return {
    openaiKey,
    perplexityKey,
    availableProviders: [
      { value: "openai", label: "OpenAI", active: Boolean(openaiKey) },
      { value: "perplexity", label: "Perplexity", active: Boolean(perplexityKey) },
    ].filter((item) => item.active),
  };
}

/**
 * Fetch AI-learned patterns for a tenant and build a context string.
 */
async function fetchLearningContext(adminClient: ReturnType<typeof createClient>, tenantId: string): Promise<string> {
  try {
    const { data: patterns } = await adminClient
      .from("ai_learned_patterns")
      .select("pattern_type, pattern_key, pattern_data, sample_size, confidence")
      .eq("tenant_id", tenantId)
      .gte("confidence", 30)
      .order("confidence", { ascending: false })
      .limit(20);

    if (!patterns || patterns.length === 0) return "";

    const parts: string[] = ["\n\n=== INSIGHTS DO SISTEMA DE APRENDIZADO (dados reais da loja) ==="];

    // Strategy conversions
    const strategyPatterns = patterns.filter((p: any) => p.pattern_type === "strategy_conversion");
    if (strategyPatterns.length > 0) {
      parts.push("\n📊 Conversão por estratégia:");
      for (const sp of strategyPatterns.slice(0, 5)) {
        const d = sp.pattern_data as any;
        const rate = ((d.conversion_rate || 0) * 100).toFixed(1);
        parts.push(`  • ${sp.pattern_key}: ${rate}% conversão (${d.total_events || 0} eventos, desc médio ${(d.avg_discount || 0).toFixed(1)}%)`);
      }
    }

    // Discount sweet spot
    const discountPattern = patterns.find((p: any) => p.pattern_type === "discount_sweet_spot");
    if (discountPattern) {
      const d = discountPattern.pattern_data as any;
      parts.push(`\n💰 Sweet-spot de desconto: ${d.min_effective || 0}%-${d.max_effective || 15}% (ótimo: ${d.optimal || 8}%, ${d.sample_size || 0} vendas analisadas)`);
      parts.push(`  ⚠️ Descontos acima de ${d.max_effective || 15}% NÃO aumentam conversão nesta loja.`);
    }

    // Vendor performance
    const vendorPatterns = patterns.filter((p: any) => p.pattern_type === "vendor_performance");
    if (vendorPatterns.length > 0) {
      parts.push("\n👤 Performance dos vendedores:");
      for (const vp of vendorPatterns.slice(0, 5)) {
        const d = vp.pattern_data as any;
        const rate = ((d.conversion_rate || 0) * 100).toFixed(0);
        parts.push(`  • ${rate}% conversão, ${d.won_deals || 0} vendas, melhor estratégia: ${d.best_strategy || "—"}`);
      }
    }

    // Temperature conversion
    const tempPatterns = patterns.filter((p: any) => p.pattern_type === "temperature_conversion");
    if (tempPatterns.length > 0) {
      parts.push("\n🌡️ Melhor estratégia por temperatura:");
      for (const tp of tempPatterns) {
        const d = tp.pattern_data as any;
        parts.push(`  • Lead ${tp.pattern_key}: melhor estratégia = "${d.best_strategy || "—"}" (${((d.rate || 0) * 100).toFixed(0)}% conversão)`);
      }
    }

    // DISC strategies
    const discPatterns = patterns.filter((p: any) => p.pattern_type === "disc_strategy");
    if (discPatterns.length > 0) {
      parts.push("\n🧠 Melhor estratégia por perfil DISC:");
      for (const dp of discPatterns) {
        const d = dp.pattern_data as any;
        parts.push(`  • Perfil ${dp.pattern_key}: "${d.best_strategy || "—"}" (${((d.rate || 0) * 100).toFixed(0)}% conversão)`);
      }
    }

    parts.push("\n\nUse estes dados para fundamentar suas recomendações com números reais da loja, não suposições.");
    return parts.join("\n");
  } catch (e) {
    console.error("fetchLearningContext error:", e);
    return "";
  }
}

/**
 * Build a director-level context from pipeline + forecast data.
 */
async function fetchDirectorContext(adminClient: ReturnType<typeof createClient>, tenantId: string): Promise<string> {
  try {
    const currentMonth = `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, "0")}`;

    // Parallel fetches
    const [clientsRes, contractsRes, goalsRes, forecastRes, trackingRes] = await Promise.all([
      adminClient.from("clients").select("id, status, updated_at, created_at, vendedor").eq("tenant_id", tenantId),
      adminClient.from("client_contracts").select("id, client_id, created_at").eq("tenant_id", tenantId),
      adminClient.from("sales_goals").select("*").eq("tenant_id", tenantId).eq("month", currentMonth),
      adminClient.from("revenue_forecast").select("*").eq("tenant_id", tenantId).eq("month", currentMonth).maybeSingle(),
      adminClient.from("client_tracking").select("client_id, valor_contrato").eq("tenant_id", tenantId),
    ]);

    const clients = clientsRes.data || [];
    const contracts = contractsRes.data || [];
    const goals = goalsRes.data || [];
    const forecast = forecastRes.data;
    const trackings = trackingRes.data || [];

    const contractIds = new Set(contracts.map((c: any) => c.client_id));
    const threeDaysAgo = new Date();
    threeDaysAgo.setDate(threeDaysAgo.getDate() - 3);

    const openClients = clients.filter((c: any) => !contractIds.has(c.id) && c.status !== "perdido" && c.status !== "fechado");
    const stalled = openClients.filter((c: any) => new Date(c.updated_at || c.created_at) < threeDaysAgo);
    const hot = openClients.filter((c: any) => ["em_negociacao", "proposta_enviada"].includes(c.status) && new Date(c.updated_at || c.created_at) >= threeDaysAgo);

    const trackingMap = new Map(trackings.map((t: any) => [t.client_id, Number(t.valor_contrato) || 0]));
    const pipelineValue = openClients.reduce((sum: number, c: any) => sum + (trackingMap.get(c.id) || 0), 0);

    const metaLoja = goals.find((g: any) => g.goal_type === "meta_loja");
    const metaValue = metaLoja?.target_value || 0;
    const now = new Date();
    const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
    const daysRemaining = Math.max(0, daysInMonth - now.getDate());

    // Sellers breakdown
    const sellerMap: Record<string, { total: number; stalled: number; hot: number }> = {};
    for (const c of openClients) {
      const seller = (c as any).vendedor || "Sem vendedor";
      if (!sellerMap[seller]) sellerMap[seller] = { total: 0, stalled: 0, hot: 0 };
      sellerMap[seller].total++;
      if (stalled.some((s: any) => s.id === c.id)) sellerMap[seller].stalled++;
      if (hot.some((h: any) => h.id === c.id)) sellerMap[seller].hot++;
    }

    const parts: string[] = ["\n\n=== ANÁLISE DA DIRETORA COMERCIAL ==="];
    parts.push(`📊 Pipeline: ${openClients.length} leads (${hot.length} 🔥 quentes, ${stalled.length} ❄️ parados)`);
    parts.push(`   Valor pipeline: R$ ${pipelineValue.toFixed(2)}`);
    if (metaValue > 0) {
      parts.push(`🎯 Meta loja: R$ ${metaValue.toFixed(2)} | ${daysRemaining} dias restantes`);
    }

    if (forecast) {
      parts.push(`📈 Previsão: Otimista R$ ${(forecast.previsao_otimista || 0).toFixed(2)} | Realista R$ ${(forecast.previsao_realista || 0).toFixed(2)} | Pessimista R$ ${(forecast.previsao_pessimista || 0).toFixed(2)}`);
      parts.push(`   Risco: ${(forecast.risco || "desconhecido").toUpperCase()} | Confiança: ${forecast.confianca || 0}%`);
    }

    if (Object.keys(sellerMap).length > 0) {
      parts.push("\n👥 Por vendedor:");
      for (const [seller, data] of Object.entries(sellerMap)) {
        parts.push(`   • ${seller}: ${data.total} leads, ${data.hot} quentes, ${data.stalled} parados`);
      }
    }

    parts.push("\nComo DIRETORA COMERCIAL, use dados acima para decisões estratégicas, cobrança de resultados e ações por vendedor.");
    return parts.join("\n");
  } catch (e) {
    console.error("fetchDirectorContext error:", e);
    return "";
  }
}

async function fetchPreviousMonthsData(adminClient: ReturnType<typeof createClient>, tenantId: string) {
  const now = new Date();
  const months: string[] = [];
  for (let i = 1; i <= 3; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    months.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`);
  }

  const { data: prevGoals } = await adminClient
    .from("sales_goals")
    .select("*")
    .eq("tenant_id", tenantId)
    .in("month", months);

  const { data: prevContracts } = await adminClient
    .from("client_contracts")
    .select("id, created_at, client_id")
    .eq("tenant_id", tenantId);

  const summary: string[] = [];
  for (const month of months) {
    const mGoals = (prevGoals || []).filter((g: any) => g.month === month);
    const mContracts = (prevContracts || []).filter((c: any) => (c.created_at || "").substring(0, 7) === month);
    if (mGoals.length > 0 || mContracts.length > 0) {
      summary.push(`Mês ${month}: ${mContracts.length} vendas fechadas, ${mGoals.length} metas definidas`);
    }
  }
  return summary.length > 0 ? `\n\nHistórico meses anteriores:\n${summary.join("\n")}` : "";
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { action, tenant_id, messages, metrics_summary, preferred_provider } = await req.json();
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || anonKey;
    const adminClient = createClient(supabaseUrl, serviceRoleKey);

    if (!tenant_id) return jsonResponse({ error: "tenant_id obrigatório" }, 400);

    const { openaiKey, perplexityKey, availableProviders } = await getAvailableProviders(adminClient, tenant_id);

    if (action === "get_available_providers") {
      return jsonResponse({ providers: availableProviders, default_provider: openaiKey ? "openai" : perplexityKey ? "perplexity" : null });
    }

    if (action === "check_alerts") {
      const { data: clients } = await adminClient
        .from("clients")
        .select("id, status, created_at, updated_at, nome, responsavel_id")
        .eq("tenant_id", tenant_id)
        .not("status", "in", '("fechado","perdido")');

      const threeDaysAgo = new Date();
      threeDaysAgo.setDate(threeDaysAgo.getDate() - 3);
      const stalled = (clients || []).filter((c: any) => new Date(c.updated_at || c.created_at) < threeDaysAgo);

      const { count: totalCount } = await adminClient
        .from("clients")
        .select("id", { count: "exact", head: true })
        .eq("tenant_id", tenant_id);

      const { count: closedCount } = await adminClient
        .from("clients")
        .select("id", { count: "exact", head: true })
        .eq("tenant_id", tenant_id)
        .eq("status", "fechado");

      const conversionRate = (totalCount && totalCount > 0) ? ((closedCount || 0) / totalCount) * 100 : 0;
      const alerts = [];

      if (stalled.length > 0) {
        alerts.push({
          type: "stalled_leads",
          priority: "high",
          title: "⚠️ Leads Parados",
          body: `${stalled.length} lead(s) sem resposta há mais de 3 dias!`,
          count: stalled.length,
        });
      }

      if (conversionRate < 15 && (totalCount || 0) > 5) {
        alerts.push({
          type: "low_conversion",
          priority: "high",
          title: "📉 Conversão em Queda",
          body: `Taxa de conversão em ${conversionRate.toFixed(1)}% — abaixo da média do setor.`,
          rate: conversionRate,
        });
      }

      return jsonResponse({ success: true, alerts, providers: availableProviders, connected: availableProviders.length > 0 });
    }

    let selectedProvider: AiProvider;
    if (preferred_provider === "perplexity" && perplexityKey) {
      selectedProvider = "perplexity";
    } else if (openaiKey) {
      selectedProvider = "openai";
    } else if (perplexityKey) {
      selectedProvider = "perplexity";
    } else {
      return jsonResponse({ error: "Nenhuma IA configurada. Adicione sua chave OpenAI ou Perplexity em Configurações > APIs.", providers: availableProviders }, 500);
    }

    const apiKey = selectedProvider === "openai" ? openaiKey : perplexityKey;

    // Fetch historical data, learning insights, and director context in parallel
    const [historyContext, learningContext, directorContext] = await Promise.all([
      fetchPreviousMonthsData(adminClient, tenant_id),
      fetchLearningContext(adminClient, tenant_id),
      fetchDirectorContext(adminClient, tenant_id),
    ]);

    const systemPrompt = `Você é a IA DIRETORA COMERCIAL do OrçaMóvel PRO.

Seu papel ESTRATÉGICO é:
- Definir e monitorar metas de vendas da loja e de cada vendedor
- Prever faturamento mensal e identificar riscos antecipadamente
- Gerenciar a equipe de vendas: cobrar resultados, identificar baixa performance
- Analisar pipeline e sugerir priorização de leads
- Intervir em negociações quando necessário (sugerir preço, desconto, abordagem)
- Otimizar estratégias de vendas baseada em dados REAIS (não genéricas)
- Aprender continuamente com resultados anteriores
- Sugerir ações ESPECÍFICAS por vendedor com base nos dados
- Alertar riscos de não bater a meta com antecedência
- Sugerir links de treinamento e vídeos do YouTube quando relevante

Dados atuais do CRM:
${metrics_summary || "Dados não disponíveis no momento."}
${historyContext}
${learningContext}
${directorContext}

Regras:
- Responda em português brasileiro
- Seja direto, prático e ASSERTIVO como uma diretora comercial
- Use Markdown com formatação rica
- Baseie-se SEMPRE nos dados fornecidos, insights de aprendizado E análise da diretora
- Sugira ações específicas e mensuráveis POR VENDEDOR quando possível
- Quando tiver dados de conversão por estratégia, CITE-OS nas recomendações
- Quando o sweet-spot de desconto estiver disponível, USE-O para orientar negociações
- Quando relevante, inclua links para vídeos de treinamento de vendas no YouTube
- Formate links como: [Título do vídeo/artigo](URL)
- Compare com meses anteriores para identificar tendências
- Elabore estratégias concretas para atingir a meta da loja
- Priorize decisões baseadas em dados reais da loja, não em suposições
- Cobre resultados dos vendedores com dados específicos
- Sugira redistribuição de leads quando identificar sobrecarga ou ociosidade`;

    const aiUrl = selectedProvider === "openai"
      ? "https://api.openai.com/v1/chat/completions"
      : "https://api.perplexity.ai/chat/completions";

    const aiModel = selectedProvider === "openai" ? "gpt-4o-mini" : "sonar";

    const response = await fetch(aiUrl, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: aiModel,
        messages: [{ role: "system", content: systemPrompt }, ...(messages || [])],
        stream: true,
      }),
    });

    if (!response.ok) {
      const text = await response.text();
      console.error(`commercial-ai ${selectedProvider} error:`, response.status, text);
      const errorMessage = response.status === 429
        ? "Limite de requisições excedido."
        : "Erro ao conectar com a IA.";
      return jsonResponse({ error: errorMessage, provider: selectedProvider, providers: availableProviders }, response.status >= 400 && response.status < 600 ? response.status : 500);
    }

    return new Response(response.body, { headers: { ...corsHeaders, "Content-Type": "text/event-stream" } });
  } catch (e) {
    console.error("commercial-ai error:", e);
    return jsonResponse({ error: e instanceof Error ? e.message : "Erro interno" }, 500);
  }
});
