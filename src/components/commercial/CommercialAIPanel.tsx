import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  TrendingUp, TrendingDown, Users, Target, DollarSign, Clock,
  AlertTriangle, Lightbulb, Trophy, MessageCircle, Send, Bot,
  Flame, Snowflake, Star, ArrowUp, ArrowDown,
} from "lucide-react";
import { useCommercialAI, type AIInsight } from "@/hooks/useCommercialAI";
import { useTenant } from "@/contexts/TenantContext";
import { useAuth } from "@/contexts/AuthContext";
import { cn } from "@/lib/utils";

function formatCurrency(val: number) {
  return val.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

const INSIGHT_CONFIG: Record<string, { icon: typeof AlertTriangle; color: string; bgColor: string; label: string }> = {
  alert: { icon: AlertTriangle, color: "text-destructive", bgColor: "bg-destructive/10", label: "Alerta" },
  warning: { icon: TrendingDown, color: "text-yellow-600", bgColor: "bg-yellow-500/10", label: "Atenção" },
  suggestion: { icon: Lightbulb, color: "text-blue-600", bgColor: "bg-blue-500/10", label: "Sugestão" },
  praise: { icon: Trophy, color: "text-emerald-600", bgColor: "bg-emerald-500/10", label: "Destaque" },
};

const PRIORITY_BADGE: Record<string, { variant: "destructive" | "secondary" | "outline"; label: string }> = {
  high: { variant: "destructive", label: "Urgente" },
  medium: { variant: "secondary", label: "Média" },
  low: { variant: "outline", label: "Baixa" },
};

export function CommercialAIPanel() {
  const { tenantId } = useTenant();
  const { user } = useAuth();
  const { metrics, insights, rankings, stalledLeads, hotLeads, loading, markInsightRead } = useCommercialAI(tenantId, user?.id);
  const [chatMessages, setChatMessages] = useState<{ role: "user" | "assistant"; content: string }[]>([
    { role: "assistant", content: "Olá! Sou sua IA Gerente Comercial 🤖. Posso analisar suas vendas, identificar oportunidades e sugerir ações. Pergunte-me algo!" },
  ]);
  const [chatInput, setChatInput] = useState("");

  const handleChat = () => {
    if (!chatInput.trim() || !metrics) return;
    const userMsg = chatInput.trim();
    setChatInput("");
    setChatMessages(prev => [...prev, { role: "user", content: userMsg }]);

    // Smart responses based on real data
    let response = "";
    const lower = userMsg.toLowerCase();

    if (lower.includes("vendas") || lower.includes("desempenho") || lower.includes("como estão")) {
      response = `📊 **Resumo das Vendas:**\n\n` +
        `• **${metrics.leads_count}** leads no funil\n` +
        `• **${metrics.proposals_sent}** propostas enviadas\n` +
        `• **${metrics.deals_closed}** vendas fechadas\n` +
        `• Taxa de conversão: **${metrics.conversion_rate}%**\n` +
        `• Faturamento: **${formatCurrency(metrics.revenue)}**\n` +
        `• Ticket médio: **${formatCurrency(metrics.average_ticket)}**\n\n` +
        (metrics.conversion_rate < 20 ? "⚠️ Sua conversão está abaixo da média. Sugiro focar nos leads quentes!" : "✅ Bom desempenho! Continue assim.");
    } else if (lower.includes("quente") || lower.includes("atender") || lower.includes("prioridade")) {
      if (hotLeads.length > 0) {
        response = `🔥 Você tem **${hotLeads.length} lead(s) quente(s)** que devem ser priorizados agora!\n\nEstes são clientes em negociação ativa nos últimos 3 dias. Envie uma mensagem de follow-up para manter o interesse.`;
      } else {
        response = "No momento não há leads em negociação recente. Foque em qualificar os novos leads do funil.";
      }
    } else if (lower.includes("parado") || lower.includes("sem resposta") || lower.includes("gargalo")) {
      response = stalledLeads.length > 0
        ? `⚠️ **${stalledLeads.length} lead(s) parado(s)** há mais de 3 dias sem atividade.\n\nSugestão: Envie uma mensagem oferecendo condições especiais ou agende uma visita técnica.`
        : "✅ Nenhum lead parado no momento. Bom trabalho mantendo o funil ativo!";
    } else if (lower.includes("meta") || lower.includes("ranking") || lower.includes("equipe")) {
      if (rankings.length > 0) {
        const top = rankings.slice(0, 3).map((r, i) => `${i + 1}. **${r.user_name}** — ${r.deals_closed} vendas, ${formatCurrency(r.revenue)}`).join("\n");
        response = `🏆 **Ranking de Vendedores:**\n\n${top}\n\n${rankings.length > 3 ? `E mais ${rankings.length - 3} vendedor(es).` : ""}`;
      } else {
        response = "Ainda não há dados de ranking disponíveis. Incentive a equipe a registrar vendas no sistema.";
      }
    } else if (lower.includes("dica") || lower.includes("sugest") || lower.includes("aumentar")) {
      response = `💡 **Dicas para Aumentar Vendas:**\n\n` +
        `1. **Follow-up em 24h** — Clientes respondidos rapidamente convertem 3x mais\n` +
        `2. **Produtos complementares** — Ofereça itens do catálogo junto com o projeto\n` +
        `3. **Desconto progressivo** — Use o simulador para criar propostas atrativas\n` +
        `4. **WhatsApp ativo** — Mantenha contato via VendaZap para não esfriar o lead\n` +
        `5. **Visita técnica** — Agende medições para clientes em dúvida`;
    } else {
      response = `Entendi! Com base nos seus dados:\n\n` +
        `• Faturamento atual: **${formatCurrency(metrics.revenue)}**\n` +
        `• ${stalledLeads.length} leads precisam de atenção\n` +
        `• ${hotLeads.length} leads quentes aguardando\n\n` +
        `Posso ajudar com: desempenho de vendas, leads quentes, gargalos, ranking da equipe ou dicas de venda.`;
    }

    setTimeout(() => {
      setChatMessages(prev => [...prev, { role: "assistant", content: response }]);
    }, 500);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <div className="flex flex-col items-center gap-3">
          <div className="h-8 w-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
          <p className="text-muted-foreground text-sm">Analisando dados comerciais...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center justify-between">
              <Users className="h-5 w-5 text-muted-foreground" />
              {metrics && metrics.leads_count > 10 && <ArrowUp className="h-4 w-4 text-emerald-500" />}
            </div>
            <p className="text-2xl font-bold mt-2">{metrics?.leads_count || 0}</p>
            <p className="text-xs text-muted-foreground">Leads no Funil</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center justify-between">
              <Target className="h-5 w-5 text-muted-foreground" />
              {metrics && metrics.conversion_rate >= 20 ? (
                <ArrowUp className="h-4 w-4 text-emerald-500" />
              ) : (
                <ArrowDown className="h-4 w-4 text-destructive" />
              )}
            </div>
            <p className="text-2xl font-bold mt-2">{metrics?.conversion_rate || 0}%</p>
            <p className="text-xs text-muted-foreground">Taxa de Conversão</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center justify-between">
              <DollarSign className="h-5 w-5 text-muted-foreground" />
              <TrendingUp className="h-4 w-4 text-emerald-500" />
            </div>
            <p className="text-2xl font-bold mt-2">{formatCurrency(metrics?.revenue || 0)}</p>
            <p className="text-xs text-muted-foreground">Faturamento</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center justify-between">
              <Clock className="h-5 w-5 text-muted-foreground" />
            </div>
            <p className="text-2xl font-bold mt-2">{metrics?.avg_close_days || 0}d</p>
            <p className="text-xs text-muted-foreground">Tempo Médio Fechamento</p>
          </CardContent>
        </Card>
      </div>

      <Tabs defaultValue="insights" className="space-y-4">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="insights" className="gap-1">
            <Lightbulb className="h-4 w-4" /> Insights
            {insights.filter(i => !i.is_read).length > 0 && (
              <Badge variant="destructive" className="ml-1 h-5 text-[10px]">{insights.filter(i => !i.is_read).length}</Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="ranking" className="gap-1"><Trophy className="h-4 w-4" /> Ranking</TabsTrigger>
          <TabsTrigger value="chat" className="gap-1"><Bot className="h-4 w-4" /> Assistente IA</TabsTrigger>
        </TabsList>

        {/* Insights Tab */}
        <TabsContent value="insights" className="space-y-3">
          {insights.length === 0 ? (
            <Card>
              <CardContent className="py-8 text-center text-muted-foreground">
                <Lightbulb className="h-10 w-10 mx-auto mb-2 opacity-30" />
                <p>Nenhum insight disponível no momento</p>
                <p className="text-xs">A IA está monitorando seus dados e gerará alertas automaticamente</p>
              </CardContent>
            </Card>
          ) : (
            insights
              .sort((a, b) => {
                const pOrder = { high: 0, medium: 1, low: 2 };
                return pOrder[a.priority] - pOrder[b.priority];
              })
              .map((insight) => {
                const config = INSIGHT_CONFIG[insight.type] || INSIGHT_CONFIG.suggestion;
                const priority = PRIORITY_BADGE[insight.priority];
                const Icon = config.icon;
                return (
                  <Card
                    key={insight.id}
                    className={cn("transition-all", !insight.is_read && "border-l-4 border-l-primary")}
                  >
                    <CardContent className="pt-4">
                      <div className="flex items-start gap-3">
                        <div className={cn("p-2 rounded-lg shrink-0", config.bgColor)}>
                          <Icon className={cn("h-5 w-5", config.color)} />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            <Badge variant="outline" className="text-[10px]">{config.label}</Badge>
                            <Badge variant={priority.variant} className="text-[10px]">{priority.label}</Badge>
                          </div>
                          <p className="text-sm text-foreground">{insight.message}</p>
                          {insight.action_type && (
                            <div className="mt-2 flex gap-2">
                              <Button
                                size="sm"
                                variant="outline"
                                className="text-xs h-7"
                                onClick={() => markInsightRead(insight.id)}
                              >
                                ✓ Entendido
                              </Button>
                            </div>
                          )}
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                );
              })
          )}

          {/* Stalled & Hot Leads Summary */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center gap-2">
                  <Snowflake className="h-4 w-4 text-blue-400" /> Leads Parados
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-3xl font-bold text-blue-500">{stalledLeads.length}</p>
                <p className="text-xs text-muted-foreground">Sem atividade há +3 dias</p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center gap-2">
                  <Flame className="h-4 w-4 text-red-500" /> Leads Quentes
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-3xl font-bold text-red-500">{hotLeads.length}</p>
                <p className="text-xs text-muted-foreground">Em negociação ativa</p>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* Ranking Tab */}
        <TabsContent value="ranking" className="space-y-3">
          {rankings.length === 0 ? (
            <Card>
              <CardContent className="py-8 text-center text-muted-foreground">
                <Trophy className="h-10 w-10 mx-auto mb-2 opacity-30" />
                <p>Nenhum ranking disponível</p>
                <p className="text-xs">Registre vendas no sistema para gerar o ranking da equipe</p>
              </CardContent>
            </Card>
          ) : (
            rankings.map((r, idx) => (
              <Card key={r.user_id} className={cn(idx === 0 && "border-yellow-500/50 bg-yellow-500/5")}>
                <CardContent className="pt-4">
                  <div className="flex items-center gap-3">
                    <div className={cn(
                      "h-10 w-10 rounded-full flex items-center justify-center font-bold text-sm shrink-0",
                      idx === 0 ? "bg-yellow-500 text-white" :
                      idx === 1 ? "bg-gray-400 text-white" :
                      idx === 2 ? "bg-amber-700 text-white" :
                      "bg-muted text-muted-foreground"
                    )}>
                      {idx + 1}º
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="font-medium text-sm truncate">{r.user_name}</p>
                        {r.badges.map((b, i) => (
                          <Badge key={i} variant="secondary" className="text-[10px]">{b}</Badge>
                        ))}
                      </div>
                      <div className="flex items-center gap-4 mt-1">
                        <span className="text-xs text-muted-foreground">{r.deals_closed} vendas</span>
                        <span className="text-xs font-medium text-emerald-600">{formatCurrency(r.revenue)}</span>
                        <span className="text-xs text-muted-foreground">{r.score} pts</span>
                      </div>
                    </div>
                    {idx === 0 && <Star className="h-6 w-6 text-yellow-500 fill-yellow-500 shrink-0" />}
                  </div>
                </CardContent>
              </Card>
            ))
          )}
        </TabsContent>

        {/* Chat Tab */}
        <TabsContent value="chat">
          <Card className="h-[500px] flex flex-col">
            <CardHeader className="pb-2 border-b border-border">
              <CardTitle className="text-sm flex items-center gap-2">
                <Bot className="h-4 w-4 text-primary" /> IA Gerente Comercial
              </CardTitle>
            </CardHeader>
            <ScrollArea className="flex-1 p-4">
              <div className="space-y-3">
                {chatMessages.map((msg, i) => (
                  <div key={i} className={cn("flex", msg.role === "user" ? "justify-end" : "justify-start")}>
                    <div className={cn(
                      "max-w-[80%] rounded-lg px-3 py-2 text-sm",
                      msg.role === "user"
                        ? "bg-primary text-primary-foreground"
                        : "bg-muted text-foreground"
                    )}>
                      <p className="whitespace-pre-wrap">{msg.content}</p>
                    </div>
                  </div>
                ))}
              </div>
            </ScrollArea>
            <div className="p-3 border-t border-border flex gap-2">
              <Input
                value={chatInput}
                onChange={e => setChatInput(e.target.value)}
                placeholder="Pergunte sobre suas vendas..."
                onKeyDown={e => e.key === "Enter" && handleChat()}
                className="text-sm"
              />
              <Button size="icon" onClick={handleChat} disabled={!chatInput.trim()}>
                <Send className="h-4 w-4" />
              </Button>
            </div>
          </Card>

          {/* Quick Actions */}
          <div className="flex flex-wrap gap-2 mt-3">
            {["Como estão minhas vendas?", "Quem devo atender agora?", "Ranking da equipe", "Dicas para vender mais"].map(q => (
              <Button
                key={q}
                variant="outline"
                size="sm"
                className="text-xs"
                onClick={() => {
                  setChatMessages(prev => [...prev, { role: "user", content: q }]);
                  // Simulate response
                  setTimeout(() => {
                    setChatInput(q);
                    // Will be processed by handleChat via useEffect-like pattern
                  }, 50);
                }}
              >
                {q}
              </Button>
            ))}
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
