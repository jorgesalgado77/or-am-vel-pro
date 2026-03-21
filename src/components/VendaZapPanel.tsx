import { useState, useEffect, useMemo, lazy, Suspense } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { toast } from "sonner";
import {
  Bot, Copy, Sparkles, MessageSquare, Clock, Target,
  RefreshCw, Zap, History, Send, ArrowLeft, Handshake,
  Flame, Snowflake, ExternalLink, BookOpen, Lightbulb, X, Brain, Calendar,
} from "lucide-react";
import { calcLeadTemperature, TEMPERATURE_CONFIG } from "@/lib/leadTemperature";
import { useVendaZap } from "@/hooks/useVendaZap";
import { useAutoSuggestion } from "@/hooks/useAutoSuggestion";
import { useVendaZapTriggers, TRIGGER_LABELS } from "@/hooks/useVendaZapTriggers";
import { OnboardingDialog, useOnboarding } from "@/components/OnboardingDialog";
import { useCurrentUser } from "@/hooks/useCurrentUser";
import { supabase } from "@/lib/supabaseClient";
import type { Database } from "@/integrations/supabase/types";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

const AutoPilotAnalyticsLazy = lazy(() => import("@/components/chat/AutoPilotAnalytics").then(m => ({ default: m.AutoPilotAnalytics })));
const FollowUpPanelLazy = lazy(() => import("@/components/chat/FollowUpPanel").then(m => ({ default: m.FollowUpPanel })));

type Client = Database["public"]["Tables"]["clients"]["Row"];

const COPY_TYPES = [
  { value: "reativacao", label: "Reativação", icon: RefreshCw, description: "Cliente parou de responder" },
  { value: "urgencia", label: "Urgência", icon: Clock, description: "Orçamento expirando" },
  { value: "objecao", label: "Quebra de Objeção", icon: Target, description: "Responder objeções" },
  { value: "reuniao", label: "Convite Reunião", icon: Handshake, description: "Convidar para reunião" },
  { value: "fechamento", label: "Fechamento", icon: Zap, description: "Fechar a venda" },
  { value: "geral", label: "Follow-up", icon: MessageSquare, description: "Mensagem geral" },
];

const TONES = [
  { value: "direto", label: "Direto" },
  { value: "consultivo", label: "Consultivo" },
  { value: "persuasivo", label: "Persuasivo" },
  { value: "amigavel", label: "Amigável" },
];

const READY_COPIES: { label: string; tipo: string; mensagem: string }[] = [
  { label: "Reativação", tipo: "reativacao", mensagem: "Olá [NOME]! 👋 Tudo bem? Estive revendo seu projeto e percebi que ficou muito especial. Ainda tem interesse? Consigo manter as condições por mais alguns dias. Me avise! 😊" },
  { label: "Objeção de preço", tipo: "objecao", mensagem: "Entendo sua preocupação com o valor, [NOME]. Mas pense assim: o investimento se dilui ao longo de anos de uso diário. Posso simular condições de pagamento que caibam no seu orçamento? 💡" },
  { label: "Indecisão", tipo: "objecao", mensagem: "[NOME], sei que é uma decisão importante! Por isso quero te ajudar. Que tal agendarmos uma conversa rápida para tirar todas as suas dúvidas? Sem compromisso! 🤝" },
  { label: "Concorrência", tipo: "objecao", mensagem: "[NOME], antes de decidir, compare não só o preço, mas a qualidade do material, o prazo de entrega e a garantia. Posso te mostrar nossos diferenciais? Vai se surpreender! ✨" },
  { label: "Urgência", tipo: "urgencia", mensagem: "[NOME], seu orçamento expira em breve e as condições especiais que conseguimos podem mudar. Que tal fecharmos essa semana? Garanto o melhor cenário pra você! ⏰" },
  { label: "Convite p/ fechamento", tipo: "fechamento", mensagem: "[NOME], está tudo pronto para o seu projeto! Vamos finalizar? Preparei condições especiais e consigo encaixar a entrega no prazo ideal pra você. Posso enviar o contrato? 📋✅" },
];

function getClientScore(client: Client, diasSemResposta: number): { label: string; emoji: string; color: string } {
  if (client.status === "fechado") return { label: "Fechado", emoji: "✅", color: "text-green-600" };
  const temp = calcLeadTemperature({ status: client.status, diasSemResposta, temSimulacao: true });
  const cfg = TEMPERATURE_CONFIG[temp];
  return { label: cfg.label, emoji: cfg.emoji, color: cfg.color };
}

interface VendaZapPanelProps {
  tenantId: string | null;
  onBack?: () => void;
}

export function VendaZapPanel({ tenantId, onBack }: VendaZapPanelProps) {
  const { currentUser } = useCurrentUser();
  const { addon, messages, loading, generating, dailyUsage, generateMessage, fetchMessages } = useVendaZap(tenantId);
  const { showOnboarding, setShowOnboarding } = useOnboarding("vendazap");
  const autoSugg = useAutoSuggestion({ tenantId, addon, userId: currentUser?.id });
  const { pendingTriggers, loading: triggersLoading, markSent, dismiss } = useVendaZapTriggers(tenantId);

  const [selectedClient, setSelectedClient] = useState<Client | null>(null);
  const [clients, setClients] = useState<Client[]>([]);
  const [searchClient, setSearchClient] = useState("");
  const [tipoCopy, setTipoCopy] = useState("geral");
  const [tom, setTom] = useState("persuasivo");
  const [mensagemCliente, setMensagemCliente] = useState("");
  const [mensagemGerada, setMensagemGerada] = useState("");
  const [lastSim, setLastSim] = useState<any>(null);

  useEffect(() => {
    const fetchClients = async () => {
      const { data } = await supabase.from("clients").select("*").order("created_at", { ascending: false });
      if (data) setClients(data);
    };
    fetchClients();
  }, []);

  useEffect(() => {
    if (selectedClient) {
      fetchMessages(selectedClient.id);
      supabase
        .from("simulations")
        .select("*")
        .eq("client_id", selectedClient.id)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle()
        .then(({ data }) => {
          setLastSim(data);
          // Auto-suggestion when opening client
          if (addon?.ativo) {
            autoSugg.generate(selectedClient, data);
          }
        });
    } else {
      autoSugg.clear();
    }
  }, [selectedClient?.id]);

  const diasSemResposta = selectedClient
    ? Math.floor((Date.now() - new Date(selectedClient.updated_at).getTime()) / (1000 * 60 * 60 * 24))
    : 0;

  const clientScore = selectedClient ? getClientScore(selectedClient, diasSemResposta) : null;

  const handleGenerate = async () => {
    const result = await generateMessage({
      nome_cliente: selectedClient?.nome,
      valor_orcamento: lastSim?.valor_final || lastSim?.valor_tela,
      status_negociacao: selectedClient?.status || "novo",
      dias_sem_resposta: diasSemResposta,
      mensagem_cliente: mensagemCliente || undefined,
      tipo_copy: tipoCopy,
      tom,
      client_id: selectedClient?.id,
      usuario_id: currentUser?.id,
    });
    if (result) setMensagemGerada(result);
  };

  const handleCopy = (text: string) => {
    navigator.clipboard.writeText(text);
    toast.success("Mensagem copiada!");
  };

  const handleCopyAndOpenWhatsApp = (text: string, phone?: string | null) => {
    navigator.clipboard.writeText(text);
    const encodedText = encodeURIComponent(text);
    const cleanPhone = phone?.replace(/\D/g, "") || "";
    const waUrl = cleanPhone
      ? `https://wa.me/55${cleanPhone}?text=${encodedText}`
      : `https://wa.me/?text=${encodedText}`;
    window.open(waUrl, "_blank");
    toast.success("Mensagem copiada e WhatsApp aberto!");
  };

  const handleUseReadyCopy = (copy: typeof READY_COPIES[0]) => {
    const replaced = selectedClient
      ? copy.mensagem.replace(/\[NOME\]/g, selectedClient.nome.split(" ")[0])
      : copy.mensagem.replace(/\[NOME\]/g, "Cliente");
    setMensagemGerada(replaced);
    setTipoCopy(copy.tipo);
  };

  const filteredClients = clients.filter(c =>
    c.nome.toLowerCase().includes(searchClient.toLowerCase()) ||
    c.numero_orcamento?.toLowerCase().includes(searchClient.toLowerCase())
  );

  if (loading) {
    return <p className="text-sm text-muted-foreground text-center py-8">Carregando VendaZap AI...</p>;
  }

  if (!addon || !addon.ativo) {
    return (
      <AddonPurchaseCard
        addonName="VendaZap AI"
        addonSlug="vendazap_ai"
        price="R$ 69"
        description="Assistente inteligente de vendas para WhatsApp. Gere mensagens persuasivas, receba sugestões da IA e automatize follow-ups."
        features={[
          "Geração ilimitada de copys de vendas",
          "Sugestões automáticas por IA",
          "Gatilhos inteligentes de reativação",
          "Auto Pilot — IA responde sozinha",
          "Follow-up automático com lembretes",
          "Analytics de conversão por mensagem",
        ]}
        icon={<Bot className="h-8 w-8 text-primary" />}
        onBack={onBack}
      />
    );
  }

  return (
    <div className="space-y-4">
      {onBack && (
        <Button variant="ghost" size="sm" onClick={onBack} className="gap-2 mb-2">
          <ArrowLeft className="h-4 w-4" />Voltar
        </Button>
      )}

      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-green-500 to-emerald-600 flex items-center justify-center">
            <Bot className="h-5 w-5 text-white" />
          </div>
          <div>
            <h3 className="text-lg font-semibold text-foreground">VendaZap AI</h3>
            <p className="text-xs text-muted-foreground">Assistente de vendas para WhatsApp</p>
          </div>
        </div>
        <Badge variant="secondary" className="gap-1">
          <Sparkles className="h-3 w-3" />
          {dailyUsage}/{addon.max_mensagens_dia > 0 ? addon.max_mensagens_dia : "∞"} hoje
        </Badge>
      </div>

      <Tabs defaultValue="gerar" className="space-y-4">
        <TabsList className="grid grid-cols-6 w-full">
          <TabsTrigger value="gerar" className="gap-2"><Sparkles className="h-4 w-4" />Gerar</TabsTrigger>
          <TabsTrigger value="gatilhos" className="gap-2 relative">
            <Zap className="h-4 w-4" />Gatilhos
            {pendingTriggers.length > 0 && (
              <Badge variant="destructive" className="absolute -top-1 -right-1 h-4 w-4 p-0 flex items-center justify-center text-[9px]">
                {pendingTriggers.length}
              </Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="followup" className="gap-2"><Calendar className="h-4 w-4" />Follow-Up</TabsTrigger>
          <TabsTrigger value="prontas" className="gap-2"><BookOpen className="h-4 w-4" />Copys</TabsTrigger>
          <TabsTrigger value="historico" className="gap-2"><History className="h-4 w-4" />Histórico</TabsTrigger>
          <TabsTrigger value="analytics" className="gap-2"><Brain className="h-4 w-4" />Analytics IA</TabsTrigger>
        </TabsList>

        <TabsContent value="gerar" className="space-y-4">
          <div className="grid md:grid-cols-2 gap-4">
            {/* Left: Config */}
            <div className="space-y-4">
              {/* Client Selection */}
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm">Cliente</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <Input
                    placeholder="Buscar cliente por nome ou orçamento..."
                    value={searchClient}
                    onChange={(e) => setSearchClient(e.target.value)}
                  />
                  {searchClient && !selectedClient && (
                    <ScrollArea className="h-32 border rounded-md">
                      {filteredClients.slice(0, 8).map(c => {
                        const days = Math.floor((Date.now() - new Date(c.updated_at).getTime()) / (1000 * 60 * 60 * 24));
                        const score = getClientScore(c, days);
                        return (
                          <button
                            key={c.id}
                            onClick={() => { setSelectedClient(c); setSearchClient(""); setMensagemGerada(""); }}
                            className="w-full text-left px-3 py-2 hover:bg-secondary transition-colors text-sm flex items-center justify-between"
                          >
                            <div>
                              <span className="font-medium text-foreground">{c.nome}</span>
                              {c.numero_orcamento && (
                                <span className="text-muted-foreground ml-2">#{c.numero_orcamento}</span>
                              )}
                            </div>
                            <span className="text-xs">{score.emoji} {score.label}</span>
                          </button>
                        );
                      })}
                    </ScrollArea>
                  )}
                  {selectedClient && (
                    <div className="bg-secondary/50 rounded-lg p-3 space-y-1">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <p className="font-medium text-sm text-foreground">{selectedClient.nome}</p>
                          {clientScore && (
                            <Badge variant="outline" className={`text-[10px] ${clientScore.color}`}>
                              {clientScore.emoji} {clientScore.label}
                            </Badge>
                          )}
                        </div>
                        <Button variant="ghost" size="sm" onClick={() => { setSelectedClient(null); autoSugg.clear(); setMensagemGerada(""); }} className="h-6 text-xs">
                          Trocar
                        </Button>
                      </div>
                      {selectedClient.numero_orcamento && (
                        <p className="text-xs text-muted-foreground">Orçamento: #{selectedClient.numero_orcamento}</p>
                      )}
                      <p className="text-xs text-muted-foreground">Status: {selectedClient.status}</p>
                      {lastSim?.valor_final && (
                        <p className="text-xs text-muted-foreground">
                          Valor: R$ {Number(lastSim.valor_final).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
                        </p>
                      )}
                      {diasSemResposta > 0 && (
                        <p className="text-xs text-orange-600">{diasSemResposta} dias sem atualização</p>
                      )}
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Auto Suggestion */}
              {selectedClient && (autoSugg.suggestion || autoSugg.loading) && (
                <Card className="border-primary/30 bg-primary/5 dark:bg-primary/10">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm flex items-center gap-2 text-primary">
                      <Lightbulb className="h-4 w-4" />
                      💡 Sugestão da IA
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    {autoSugg.loading ? (
                      <div className="flex items-center gap-2 text-sm text-muted-foreground">
                        <RefreshCw className="h-3 w-3 animate-spin" />
                        Analisando contexto do cliente...
                      </div>
                    ) : (
                      <div className="space-y-3">
                        <p className="text-sm text-foreground whitespace-pre-wrap leading-relaxed">{autoSugg.suggestion}</p>
                        <div className="flex flex-wrap gap-2">
                          <Button
                            size="sm"
                            className="h-8 text-xs gap-1.5"
                            onClick={() => {
                              setMensagemGerada(autoSugg.suggestion);
                              if (selectedClient) autoSugg.markUsed(selectedClient.id);
                              toast.success("Sugestão aplicada!");
                            }}
                          >
                            <Sparkles className="h-3 w-3" />
                            Usar resposta
                          </Button>
                          <Button variant="outline" size="sm" className="h-8 text-xs gap-1" onClick={() => handleCopy(autoSugg.suggestion)}>
                            <Copy className="h-3 w-3" />Copiar
                          </Button>
                          <Button variant="outline" size="sm" className="h-8 text-xs gap-1" onClick={() => handleCopyAndOpenWhatsApp(autoSugg.suggestion, selectedClient?.telefone1)}>
                            <ExternalLink className="h-3 w-3" />WhatsApp
                          </Button>
                        </div>
                      </div>
                    )}
                  </CardContent>
                </Card>
              )}

              {/* Copy Type */}
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm">Tipo de Mensagem</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-2 gap-2">
                    {COPY_TYPES.map(ct => {
                      const Icon = ct.icon;
                      return (
                        <button
                          key={ct.value}
                          onClick={() => setTipoCopy(ct.value)}
                          className={`p-2.5 rounded-lg border text-left transition-all ${
                            tipoCopy === ct.value
                              ? "border-primary bg-primary/5"
                              : "border-border hover:border-muted-foreground/30"
                          }`}
                        >
                          <div className="flex items-center gap-2">
                            <Icon className="h-3.5 w-3.5 text-primary shrink-0" />
                            <span className="text-xs font-medium text-foreground">{ct.label}</span>
                          </div>
                          <p className="text-[10px] text-muted-foreground mt-0.5">{ct.description}</p>
                        </button>
                      );
                    })}
                  </div>
                </CardContent>
              </Card>

              {/* Tone */}
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm">Tom da Mensagem</CardTitle>
                </CardHeader>
                <CardContent>
                  <Select value={tom} onValueChange={setTom}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {TONES.map(t => (
                        <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </CardContent>
              </Card>

              {/* Client Message Analysis */}
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm">Mensagem do Cliente (opcional)</CardTitle>
                </CardHeader>
                <CardContent>
                  <Textarea
                    placeholder="Cole aqui a mensagem do cliente para a IA analisar e gerar a melhor resposta..."
                    value={mensagemCliente}
                    onChange={(e) => setMensagemCliente(e.target.value)}
                    rows={3}
                  />
                </CardContent>
              </Card>

              <Button
                onClick={handleGenerate}
                disabled={generating}
                className="w-full gap-2 bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-700 hover:to-emerald-700"
                size="lg"
              >
                {generating ? (
                  <>
                    <RefreshCw className="h-4 w-4 animate-spin" />
                    Gerando...
                  </>
                ) : (
                  <>
                    <Sparkles className="h-4 w-4" />
                    Gerar Mensagem
                  </>
                )}
              </Button>
            </div>

            {/* Right: Result */}
            <div className="space-y-4">
              <Card className="min-h-[300px]">
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-sm flex items-center gap-2">
                      <Send className="h-4 w-4 text-green-600" />
                      Mensagem Gerada
                    </CardTitle>
                    {mensagemGerada && (
                      <Button variant="outline" size="sm" onClick={() => handleCopy(mensagemGerada)} className="gap-1 h-7">
                        <Copy className="h-3 w-3" />Copiar
                      </Button>
                    )}
                  </div>
                </CardHeader>
                <CardContent>
                  {mensagemGerada ? (
                    <div className="bg-green-50 dark:bg-green-950/20 border border-green-200 dark:border-green-900 rounded-xl p-4 relative">
                      <div className="absolute -top-2 -left-2 w-6 h-6 bg-green-500 rounded-full flex items-center justify-center">
                        <MessageSquare className="h-3 w-3 text-white" />
                      </div>
                      <p className="text-sm text-foreground whitespace-pre-wrap leading-relaxed">{mensagemGerada}</p>
                    </div>
                  ) : (
                    <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
                      <Bot className="h-12 w-12 mb-3 opacity-30" />
                      <p className="text-sm text-center">Selecione um cliente e tipo de mensagem, depois clique em "Gerar Mensagem"</p>
                    </div>
                  )}
                </CardContent>
              </Card>

              {mensagemGerada && (
                <div className="flex flex-col gap-2">
                  <div className="flex gap-2">
                    <Button variant="outline" onClick={handleGenerate} disabled={generating} className="flex-1 gap-2">
                      <RefreshCw className="h-4 w-4" />Regenerar
                    </Button>
                    <Button variant="outline" onClick={() => handleCopy(mensagemGerada)} className="flex-1 gap-2">
                      <Copy className="h-4 w-4" />Copiar
                    </Button>
                  </div>
                  <Button
                    onClick={() => handleCopyAndOpenWhatsApp(mensagemGerada, selectedClient?.telefone1)}
                    className="w-full gap-2 bg-green-600 hover:bg-green-700 text-white"
                  >
                    <ExternalLink className="h-4 w-4" />
                    Copiar + Abrir WhatsApp
                  </Button>
                </div>
              )}
            </div>
          </div>
        </TabsContent>

        {/* Gatilhos Tab */}
        <TabsContent value="gatilhos" className="space-y-4">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm flex items-center gap-2">
                <Zap className="h-4 w-4 text-primary" />
                Gatilhos Automáticos
              </CardTitle>
              <p className="text-xs text-muted-foreground">
                Mensagens geradas automaticamente com base no comportamento dos clientes
              </p>
            </CardHeader>
            <CardContent>
              {triggersLoading ? (
                <div className="flex items-center gap-2 text-sm text-muted-foreground py-8 justify-center">
                  <RefreshCw className="h-4 w-4 animate-spin" />
                  Carregando gatilhos...
                </div>
              ) : pendingTriggers.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-8">
                  Nenhum gatilho pendente. Os gatilhos são gerados automaticamente quando clientes ficam sem resposta, orçamentos estão expirando ou propostas são visualizadas sem retorno.
                </p>
              ) : (
                <ScrollArea className="h-[500px]">
                  <div className="space-y-3">
                    {pendingTriggers.map(trigger => {
                      const triggerInfo = TRIGGER_LABELS[trigger.trigger_type] || { label: trigger.trigger_type, emoji: "📌" };
                      return (
                        <div key={trigger.id} className="border rounded-lg p-3 space-y-2 hover:border-primary/30 transition-colors">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                              <span className="text-sm">{triggerInfo.emoji}</span>
                              <Badge variant="secondary" className="text-[10px]">{triggerInfo.label}</Badge>
                            </div>
                            <span className="text-[10px] text-muted-foreground">
                              {format(new Date(trigger.created_at), "dd/MM HH:mm", { locale: ptBR })}
                            </span>
                          </div>
                          <p className="text-xs text-muted-foreground font-medium">{trigger.client_nome}</p>
                          <p className="text-sm text-foreground whitespace-pre-wrap leading-relaxed">{trigger.generated_message}</p>
                          <div className="flex gap-2">
                            <Button
                              size="sm"
                              className="h-7 text-xs gap-1"
                              onClick={() => {
                                const phone = clients.find(c => c.id === trigger.client_id)?.telefone1;
                                handleCopyAndOpenWhatsApp(trigger.generated_message, phone);
                                markSent(trigger.id, currentUser?.id);
                              }}
                            >
                              <Send className="h-3 w-3" />Enviar via WhatsApp
                            </Button>
                            <Button variant="outline" size="sm" className="h-7 text-xs gap-1" onClick={() => handleCopy(trigger.generated_message)}>
                              <Copy className="h-3 w-3" />Copiar
                            </Button>
                            <Button variant="ghost" size="sm" className="h-7 text-xs gap-1 text-muted-foreground" onClick={() => dismiss(trigger.id)}>
                              <X className="h-3 w-3" />Ignorar
                            </Button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </ScrollArea>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="followup">
          <Suspense fallback={<div className="text-center py-8 text-sm text-muted-foreground">Carregando...</div>}>
            <FollowUpPanelLazy tenantId={tenantId} userId={currentUser?.id} />
          </Suspense>
        </TabsContent>

        {/* Copys Prontas Tab */}
        <TabsContent value="prontas" className="space-y-4">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm flex items-center gap-2">
                <BookOpen className="h-4 w-4 text-primary" />
                Copys Prontas — Clique para usar
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid md:grid-cols-2 gap-3">
                {READY_COPIES.map((copy, i) => (
                  <div key={i} className="border rounded-lg p-3 space-y-2 hover:border-primary/50 transition-colors">
                    <div className="flex items-center justify-between">
                      <Badge variant="secondary" className="text-[10px]">{copy.label}</Badge>
                    </div>
                    <p className="text-xs text-muted-foreground leading-relaxed">{copy.mensagem.substring(0, 100)}...</p>
                    <div className="flex gap-2">
                      <Button variant="outline" size="sm" className="h-7 text-xs gap-1" onClick={() => handleUseReadyCopy(copy)}>
                        <Sparkles className="h-3 w-3" />Usar
                      </Button>
                      <Button variant="ghost" size="sm" className="h-7 text-xs gap-1" onClick={() => {
                        const text = selectedClient
                          ? copy.mensagem.replace(/\[NOME\]/g, selectedClient.nome.split(" ")[0])
                          : copy.mensagem.replace(/\[NOME\]/g, "Cliente");
                        handleCopy(text);
                      }}>
                        <Copy className="h-3 w-3" />Copiar
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="historico">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm">Mensagens Recentes</CardTitle>
            </CardHeader>
            <CardContent>
              {messages.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-8">Nenhuma mensagem gerada ainda</p>
              ) : (
                <ScrollArea className="h-[500px]">
                  <div className="space-y-3">
                    {messages.map(msg => {
                      const copyType = COPY_TYPES.find(ct => ct.value === msg.tipo_copy);
                      return (
                        <div key={msg.id} className="border rounded-lg p-3 space-y-2">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                              <Badge variant="secondary" className="text-[10px]">{copyType?.label || msg.tipo_copy}</Badge>
                              <Badge variant="outline" className="text-[10px]">{msg.tom}</Badge>
                            </div>
                            <span className="text-[10px] text-muted-foreground">
                              {format(new Date(msg.created_at), "dd/MM HH:mm", { locale: ptBR })}
                            </span>
                          </div>
                          {(msg.contexto as any)?.nome_cliente && (
                            <p className="text-xs text-muted-foreground">Cliente: {(msg.contexto as any).nome_cliente}</p>
                          )}
                          <p className="text-sm text-foreground whitespace-pre-wrap">{msg.mensagem_gerada}</p>
                          <div className="flex gap-2">
                            <Button variant="ghost" size="sm" className="h-6 text-xs gap-1" onClick={() => handleCopy(msg.mensagem_gerada)}>
                              <Copy className="h-3 w-3" />Copiar
                            </Button>
                            <Button variant="ghost" size="sm" className="h-6 text-xs gap-1" onClick={() => handleCopyAndOpenWhatsApp(msg.mensagem_gerada)}>
                              <ExternalLink className="h-3 w-3" />WhatsApp
                            </Button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </ScrollArea>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="analytics">
          <Suspense fallback={<div className="text-center py-8 text-sm text-muted-foreground">Carregando...</div>}>
            <AutoPilotAnalyticsLazy tenantId={tenantId} />
          </Suspense>
        </TabsContent>
      </Tabs>
      <OnboardingDialog featureKey="vendazap" open={showOnboarding} onClose={() => setShowOnboarding(false)} />
    </div>
  );
}
