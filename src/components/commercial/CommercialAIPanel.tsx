import { useState, useRef, useEffect, useCallback } from "react";
import ReactMarkdown from "react-markdown";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

import {
  TrendingUp, TrendingDown, Users, Target, DollarSign, Clock,
  AlertTriangle, Lightbulb, Trophy, MessageCircle, Send, Bot,
  Flame, Snowflake, Star, ArrowUp, ArrowDown, Loader2, Bell,
} from "lucide-react";
import { useCommercialAI, type AIInsight } from "@/hooks/useCommercialAI";
import { SalesGoalsPanel } from "@/components/commercial/SalesGoalsPanel";
import { useTenant } from "@/contexts/TenantContext";
import { useAuth } from "@/contexts/AuthContext";
import { cn } from "@/lib/utils";
import { supabase } from "@/lib/supabaseClient";
import { sendPushIfEnabled } from "@/lib/pushHelper";
import { toast } from "sonner";

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

type ChatMsg = { role: "user" | "assistant"; content: string };

const SUPABASE_URL = "https://bdhfzjuwtkiexyeusnqq.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJkaGZ6anV3dGtpZXh5ZXVzbnFxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzM5MjcwOTEsImV4cCI6MjA4OTUwMzA5MX0.xnbTV67kuEgvz9nNKAPHEcCAzAiYpf1xIsdEvM7OB44";
const CHAT_URL = `${SUPABASE_URL}/functions/v1/commercial-ai`;

async function streamChat(opts: {
  tenantId: string;
  messages: ChatMsg[];
  metricsSummary: string;
  preferredProvider?: "openai" | "perplexity";
  onDelta: (text: string) => void;
  onDone: () => void;
  onError: (msg: string) => void;
}) {
  try {
    // Get current session token for proper auth
    const { data: sessionData } = await supabase.auth.getSession();
    const accessToken = sessionData?.session?.access_token;

    const resp = await fetch(CHAT_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: SUPABASE_ANON_KEY,
        Authorization: `Bearer ${accessToken || SUPABASE_ANON_KEY}`,
      },
      body: JSON.stringify({
        action: "chat",
        tenant_id: opts.tenantId,
        messages: opts.messages,
        metrics_summary: opts.metricsSummary,
        preferred_provider: opts.preferredProvider,
      }),
    });

    if (!resp.ok) {
      const err = await resp.json().catch(() => ({ error: "Erro desconhecido" }));
      if (resp.status === 429) {
        opts.onError("Limite de requisições excedido. Aguarde um momento e tente novamente.");
      } else if (resp.status === 402) {
        opts.onError("Créditos de IA esgotados. Adicione créditos em Configurações > Workspace > Usage.");
      } else {
        opts.onError(err.error || `Erro ${resp.status}`);
      }
      return;
    }

    if (!resp.body) { opts.onError("Sem resposta"); return; }

    const reader = resp.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      let idx: number;
      while ((idx = buffer.indexOf("\n")) !== -1) {
        let line = buffer.slice(0, idx);
        buffer = buffer.slice(idx + 1);
        if (line.endsWith("\r")) line = line.slice(0, -1);
        if (!line.startsWith("data: ")) continue;
        const json = line.slice(6).trim();
        if (json === "[DONE]") { opts.onDone(); return; }
        try {
          const parsed = JSON.parse(json);
          const content = parsed.choices?.[0]?.delta?.content;
          if (content) opts.onDelta(content);
        } catch { /* partial json */ }
      }
    }
    opts.onDone();
  } catch (e) {
    opts.onError("Falha na conexão com a IA");
  }
}

export function CommercialAIPanel() {
  const { tenantId } = useTenant();
  const { user } = useAuth();
  const userRole = user?.cargo_nome || "";
  const { metrics, insights, rankings, stalledLeads, hotLeads, loading, markInsightRead, clientsBySeller, isAdminOrManager } = useCommercialAI(tenantId, user?.id, userRole);
  const [chatMessages, setChatMessages] = useState<ChatMsg[]>([
    { role: "assistant", content: "Olá! Sou sua **IA Gerente Comercial** 🤖. Posso analisar suas vendas, identificar oportunidades e sugerir ações com base nos seus dados reais. Pergunte-me algo!" },
  ]);
  const [chatInput, setChatInput] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);
  const [aiConnected, setAiConnected] = useState(false);
  const [availableProviders, setAvailableProviders] = useState<Array<{ value: "openai" | "perplexity"; label: string }>>([]);
  const [preferredProvider, setPreferredProvider] = useState<"openai" | "perplexity">("openai");
  const scrollRef = useRef<HTMLDivElement>(null);
  const pushChecked = useRef(false);

  useEffect(() => {
    if (!tenantId) return;
    const storageKey = `commercial_ai_provider_${tenantId}`;
    const saved = localStorage.getItem(storageKey);
    if (saved === "openai" || saved === "perplexity") setPreferredProvider(saved);

    (async () => {
      const { data, error } = await supabase.functions.invoke("commercial-ai", {
        body: { action: "get_available_providers", tenant_id: tenantId },
      });
      if (!error && data?.providers) {
        setAvailableProviders(data.providers);
        setAiConnected(data.providers.length > 0);
        const nextProvider = saved && data.providers.some((p: any) => p.value === saved)
          ? saved
          : (data.default_provider || data.providers[0]?.value || "openai");
        setPreferredProvider(nextProvider);
        localStorage.setItem(storageKey, nextProvider);
      } else {
        setAiConnected(false);
      }
    })();
  }, [tenantId]);

  // Build metrics summary for AI context
  const metricsSummary = metrics
    ? `Leads: ${metrics.leads_count}, Propostas: ${metrics.proposals_sent}, Fechados: ${metrics.deals_closed}, ` +
      `Conversão: ${metrics.conversion_rate}%, Faturamento: R$${metrics.revenue.toFixed(2)}, ` +
      `Ticket Médio: R$${metrics.average_ticket.toFixed(2)}, Tempo Médio: ${metrics.avg_close_days}d, ` +
      `Leads Parados: ${stalledLeads.length}, Leads Quentes: ${hotLeads.length}`
    : "";

  // Auto-scroll chat
  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [chatMessages]);

  // Check alerts for push notifications (once per session)
  useEffect(() => {
    if (!tenantId || !user?.id || pushChecked.current) return;
    pushChecked.current = true;

    (async () => {
      try {
        const { data } = await supabase.functions.invoke("commercial-ai", {
          body: { action: "check_alerts", tenant_id: tenantId },
        });
        if (data?.alerts) {
          for (const alert of data.alerts) {
            sendPushIfEnabled("leads", user.id, alert.title, alert.body, `commercial-ai-${alert.type}`);
          }
        }
      } catch { /* silent */ }
    })();
  }, [tenantId, user?.id]);

  const handleChat = useCallback(async (overrideMsg?: string) => {
    const userMsg = overrideMsg || chatInput.trim();
    if (!userMsg || !tenantId || isStreaming) return;
    setChatInput("");
    setIsStreaming(true);

    const newMessages = [...chatMessages, { role: "user" as const, content: userMsg }];
    setChatMessages(newMessages);

    let assistantText = "";
    const updateAssistant = (chunk: string) => {
      assistantText += chunk;
      setChatMessages(prev => {
        const last = prev[prev.length - 1];
        if (last?.role === "assistant" && prev.length === newMessages.length + 1) {
          return prev.map((m, i) => i === prev.length - 1 ? { ...m, content: assistantText } : m);
        }
        return [...prev, { role: "assistant", content: assistantText }];
      });
    };

    await streamChat({
      tenantId,
      messages: newMessages.filter(m => m.role === "user" || m.role === "assistant").slice(-10),
      metricsSummary,
      preferredProvider,
      onDelta: updateAssistant,
      onDone: () => setIsStreaming(false),
      onError: (msg) => {
        toast.error(msg);
        setChatMessages(prev => [...prev, { role: "assistant", content: `❌ ${msg}` }]);
        setIsStreaming(false);
      },
    });
  }, [chatInput, chatMessages, tenantId, isStreaming, metricsSummary, preferredProvider]);

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
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="insights" className="gap-1 text-xs">
            <Lightbulb className="h-3.5 w-3.5" /> Insights
            {insights.filter(i => !i.is_read).length > 0 && (
              <Badge variant="destructive" className="ml-1 h-5 text-[10px]">{insights.filter(i => !i.is_read).length}</Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="goals" className="gap-1 text-xs"><Target className="h-3.5 w-3.5" /> Metas</TabsTrigger>
          <TabsTrigger value="ranking" className="gap-1 text-xs"><Trophy className="h-3.5 w-3.5" /> Ranking</TabsTrigger>
          <TabsTrigger value="chat" className="gap-1 text-xs"><Bot className="h-3.5 w-3.5" /> IA</TabsTrigger>
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
                  <Card key={insight.id} className={cn("transition-all", !insight.is_read && "border-l-4 border-l-primary")}>
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
                            <div className="mt-2">
                              <Button size="sm" variant="outline" className="text-xs h-7" onClick={() => markInsightRead(insight.id)}>
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

          {/* Stalled & Hot Leads Detail */}
          {stalledLeads.length > 0 && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center gap-2">
                  <Snowflake className="h-4 w-4 text-blue-400" /> Leads Parados — Detalhes
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-1">
                {stalledLeads.slice(0, 8).map((l: any) => {
                  const days = Math.floor((Date.now() - new Date(l.created_at).getTime()) / 86400000);
                  return (
                    <div key={l.id} className="flex items-center justify-between text-xs py-1 border-b border-border last:border-0">
                      <span className="truncate max-w-[40%] text-foreground">{l.nome || "Sem nome"}</span>
                      <span className="text-muted-foreground">{l.vendedor || "Sem vendedor"}</span>
                      <Badge variant="outline" className="text-[9px]">{days}d parado</Badge>
                    </div>
                  );
                })}
                {stalledLeads.length > 8 && <p className="text-[10px] text-muted-foreground">+{stalledLeads.length - 8} mais...</p>}
              </CardContent>
            </Card>
          )}

          {hotLeads.length > 0 && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center gap-2">
                  <Flame className="h-4 w-4 text-red-500" /> Leads Quentes — Detalhes
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-1">
                {hotLeads.slice(0, 8).map((l: any) => (
                  <div key={l.id} className="flex items-center justify-between text-xs py-1 border-b border-border last:border-0">
                    <span className="truncate max-w-[40%] text-foreground">{l.nome || "Sem nome"}</span>
                    <span className="text-muted-foreground">{l.vendedor || "Sem vendedor"}</span>
                    <Badge variant="secondary" className="text-[9px]">
                      {l.status === "em_negociacao" ? "Negociando" : "Proposta"}
                    </Badge>
                  </div>
                ))}
                {hotLeads.length > 8 && <p className="text-[10px] text-muted-foreground">+{hotLeads.length - 8} mais...</p>}
              </CardContent>
            </Card>
          )}

          {/* Clients by Seller — admin/manager full view */}
          {isAdminOrManager && Object.keys(clientsBySeller).length > 0 && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center gap-2">
                  <Users className="h-4 w-4 text-primary" /> Clientes em Aberto por Vendedor
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {Object.entries(clientsBySeller).map(([sellerId, sellerClients]) => {
                  const sellerName = sellerClients[0]?.seller_name || "Sem vendedor";
                  return (
                    <div key={sellerId} className="border border-border rounded-lg p-3">
                      <div className="flex items-center justify-between mb-2">
                        <p className="text-sm font-medium text-foreground">{sellerName}</p>
                        <Badge variant="secondary" className="text-[10px]">{sellerClients.length} lead{sellerClients.length > 1 ? "s" : ""}</Badge>
                      </div>
                      <div className="space-y-1">
                        {sellerClients.slice(0, 5).map((c: any) => (
                          <div key={c.id} className="flex items-center justify-between text-xs">
                            <span className="text-foreground truncate max-w-[60%]">{c.nome}</span>
                            <div className="flex items-center gap-2">
                              <Badge variant="outline" className="text-[9px] py-0">
                                {c.status === "novo" ? "Novo" : c.status === "em_negociacao" ? "Negociando" : "Proposta"}
                              </Badge>
                              {c.updated_at && (
                                <span className="text-muted-foreground text-[10px]">
                                  {Math.floor((Date.now() - new Date(c.updated_at).getTime()) / 86400000)}d atrás
                                </span>
                              )}
                            </div>
                          </div>
                        ))}
                        {sellerClients.length > 5 && (
                          <p className="text-[10px] text-muted-foreground">+{sellerClients.length - 5} mais...</p>
                        )}
                      </div>
                    </div>
                  );
                })}
              </CardContent>
            </Card>
          )}

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

        {/* Goals Tab */}
        <TabsContent value="goals">
          <SalesGoalsPanel tenantId={tenantId} />
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

        {/* Chat Tab — Streaming AI */}
        <TabsContent value="chat">
          <Card className="h-[500px] flex flex-col">
            <CardHeader className="pb-2 border-b border-border">
              <CardTitle className="text-sm flex items-center gap-2">
                <Bot className="h-4 w-4 text-primary" /> IA Gerente Comercial
                <div className="ml-auto flex items-center gap-2 flex-wrap justify-end">
                  {availableProviders.map((provider) => (
                    <Button
                      key={provider.value}
                      type="button"
                      variant={preferredProvider === provider.value ? "default" : "outline"}
                      className="h-6 px-2 text-[10px]"
                      onClick={() => {
                        setPreferredProvider(provider.value);
                        if (tenantId) localStorage.setItem(`commercial_ai_provider_${tenantId}`, provider.value);
                      }}
                    >
                      {provider.label}
                    </Button>
                  ))}
                  <Badge variant="outline" className="text-[10px] gap-1">
                    <span className={cn("h-1.5 w-1.5 rounded-full", aiConnected ? "bg-emerald-500" : "bg-destructive")} />
                    {aiConnected ? "Conectada" : "Desconectada"}
                  </Badge>
                </div>
              </CardTitle>
            </CardHeader>
            <div className="flex-1 overflow-y-auto p-4" ref={scrollRef}>
              <div className="space-y-3">
                {chatMessages.map((msg, i) => (
                  <div key={i} className={cn("flex", msg.role === "user" ? "justify-end" : "justify-start")}>
                    <div className={cn(
                      "max-w-[80%] rounded-lg px-3 py-2 text-sm",
                      msg.role === "user"
                        ? "bg-primary text-primary-foreground"
                        : "bg-muted text-foreground"
                    )}>
                      <div className="prose prose-sm prose-invert max-w-none">
                        <ReactMarkdown>{msg.content}</ReactMarkdown>
                      </div>
                    </div>
                  </div>
                ))}
                {isStreaming && chatMessages[chatMessages.length - 1]?.role !== "assistant" && (
                  <div className="flex justify-start">
                    <div className="bg-muted rounded-lg px-3 py-2">
                      <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                    </div>
                  </div>
                )}
              </div>
            </div>
            <div className="p-3 border-t border-border flex gap-2">
              <Input
                value={chatInput}
                onChange={e => setChatInput(e.target.value)}
                placeholder="Pergunte sobre suas vendas..."
                onKeyDown={e => e.key === "Enter" && !e.shiftKey && handleChat()}
                className="text-sm"
                disabled={isStreaming}
              />
              <Button size="icon" onClick={() => handleChat()} disabled={!chatInput.trim() || isStreaming}>
                {isStreaming ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              </Button>
            </div>
          </Card>

          {/* Quick Actions */}
          <div className="flex flex-wrap gap-2 mt-3">
            {["Como estão minhas vendas?", "Quem devo atender agora?", "Ranking da equipe", "Dicas para vender mais", "Analise meus gargalos"].map(q => (
              <Button
                key={q}
                variant="outline"
                size="sm"
                className="text-xs"
                disabled={isStreaming}
                onClick={() => handleChat(q)}
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
