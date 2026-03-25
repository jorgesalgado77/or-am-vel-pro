/**
 * VendaZapPanel - refactored to use sub-components.
 */
import { useState, useEffect, lazy, Suspense } from "react";
import { AddonPurchaseCard } from "@/components/AddonPurchaseCard";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import {
  Bot, Copy, Sparkles, MessageSquare, Zap, History, Send, ArrowLeft,
  ExternalLink, BookOpen, X, Brain, Calendar, RefreshCw,
} from "lucide-react";
import { useVendaZap } from "@/hooks/useVendaZap";
import { useAutoSuggestion } from "@/hooks/useAutoSuggestion";
import { useVendaZapTriggers, TRIGGER_LABELS } from "@/hooks/useVendaZapTriggers";
import { OnboardingDialog, useOnboarding } from "@/components/OnboardingDialog";
import { useCurrentUser } from "@/hooks/useCurrentUser";
import { supabase } from "@/lib/supabaseClient";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { VendaZapGenerateTab, COPY_TYPES } from "@/components/vendazap/VendaZapGenerateTab";
import type { Database } from "@/integrations/supabase/types";

const AutoPilotAnalyticsLazy = lazy(() => import("@/components/chat/AutoPilotAnalytics").then(m => ({ default: m.AutoPilotAnalytics })));
const FollowUpPanelLazy = lazy(() => import("@/components/chat/FollowUpPanel").then(m => ({ default: m.FollowUpPanel })));

type Client = Database["public"]["Tables"]["clients"]["Row"];

const READY_COPIES = [
  { label: "Reativação", tipo: "reativacao", mensagem: "Olá [NOME]! 👋 Tudo bem? Estive revendo seu projeto e percebi que ficou muito especial. Ainda tem interesse? Consigo manter as condições por mais alguns dias. Me avise! 😊" },
  { label: "Objeção de preço", tipo: "objecao", mensagem: "Entendo sua preocupação com o valor, [NOME]. Mas pense assim: o investimento se dilui ao longo de anos de uso diário. Posso simular condições de pagamento que caibam no seu orçamento? 💡" },
  { label: "Indecisão", tipo: "objecao", mensagem: "[NOME], sei que é uma decisão importante! Por isso quero te ajudar. Que tal agendarmos uma conversa rápida para tirar todas as suas dúvidas? Sem compromisso! 🤝" },
  { label: "Concorrência", tipo: "objecao", mensagem: "[NOME], antes de decidir, compare não só o preço, mas a qualidade do material, o prazo de entrega e a garantia. Posso te mostrar nossos diferenciais? Vai se surpreender! ✨" },
  { label: "Urgência", tipo: "urgencia", mensagem: "[NOME], seu orçamento expira em breve e as condições especiais que conseguimos podem mudar. Que tal fecharmos essa semana? Garanto o melhor cenário pra você! ⏰" },
  { label: "Convite p/ fechamento", tipo: "fechamento", mensagem: "[NOME], está tudo pronto para o seu projeto! Vamos finalizar? Preparei condições especiais e consigo encaixar a entrega no prazo ideal pra você. Posso enviar o contrato? 📋✅" },
];

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
  const [clients, setClients] = useState<Client[]>([]);

  useEffect(() => {
    if (!tenantId) return;
    supabase.from("clients").select("*").eq("tenant_id", tenantId).order("created_at", { ascending: false }).then(({ data }) => { if (data) setClients(data); });
  }, [tenantId]);

  const handleCopy = (text: string) => { navigator.clipboard.writeText(text); toast.success("Mensagem copiada!"); };
  const handleCopyAndOpenWhatsApp = (text: string, phone?: string | null) => {
    navigator.clipboard.writeText(text);
    const cleanPhone = phone?.replace(/\D/g, "") || "";
    window.open(cleanPhone ? `https://wa.me/55${cleanPhone}?text=${encodeURIComponent(text)}` : `https://wa.me/?text=${encodeURIComponent(text)}`, "_blank");
    toast.success("Mensagem copiada e WhatsApp aberto!");
  };

  if (loading) return <p className="text-sm text-muted-foreground text-center py-8">Carregando VendaZap AI...</p>;

  if (!addon || !addon.ativo) {
    return (
      <AddonPurchaseCard addonName="VendaZap AI" addonSlug="vendazap_ai" price="R$ 69"
        description="Assistente inteligente de vendas para WhatsApp."
        features={[
          { label: "Copys de vendas ilimitadas", icon: <MessageSquare className="h-5 w-5" /> },
          { label: "Sugestões automáticas", icon: <Brain className="h-5 w-5" /> },
          { label: "Follow-up inteligente", icon: <Calendar className="h-5 w-5" /> },
        ]}
        icon={<Bot className="h-8 w-8 text-primary" />} onBack={onBack}
      />
    );
  }

  return (
    <div className="space-y-4">
      {onBack && <Button variant="ghost" size="sm" onClick={onBack} className="gap-2 mb-2"><ArrowLeft className="h-4 w-4" />Voltar</Button>}

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
        <Badge variant="secondary" className="gap-1"><Sparkles className="h-3 w-3" />{dailyUsage}/{addon.max_mensagens_dia > 0 ? addon.max_mensagens_dia : "∞"} hoje</Badge>
      </div>

      <Tabs defaultValue="gerar" className="space-y-4">
        <TabsList className="grid grid-cols-6 w-full">
          <TabsTrigger value="gerar" className="gap-2"><Sparkles className="h-4 w-4" />Gerar</TabsTrigger>
          <TabsTrigger value="gatilhos" className="gap-2 relative">
            <Zap className="h-4 w-4" />Gatilhos
            {pendingTriggers.length > 0 && <Badge variant="destructive" className="absolute -top-1 -right-1 h-4 w-4 p-0 flex items-center justify-center text-[9px]">{pendingTriggers.length}</Badge>}
          </TabsTrigger>
          <TabsTrigger value="followup" className="gap-2"><Calendar className="h-4 w-4" />Follow-Up</TabsTrigger>
          <TabsTrigger value="prontas" className="gap-2"><BookOpen className="h-4 w-4" />Copys</TabsTrigger>
          <TabsTrigger value="historico" className="gap-2"><History className="h-4 w-4" />Histórico</TabsTrigger>
          <TabsTrigger value="analytics" className="gap-2"><Brain className="h-4 w-4" />Analytics IA</TabsTrigger>
        </TabsList>

        <TabsContent value="gerar" className="space-y-4">
          <VendaZapGenerateTab generating={generating} generateMessage={generateMessage} addon={addon} autoSugg={autoSugg} currentUserId={currentUser?.id} />
        </TabsContent>

        <TabsContent value="gatilhos" className="space-y-4">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm flex items-center gap-2"><Zap className="h-4 w-4 text-primary" />Gatilhos Automáticos</CardTitle>
              <p className="text-xs text-muted-foreground">Mensagens geradas automaticamente com base no comportamento dos clientes</p>
            </CardHeader>
            <CardContent>
              {triggersLoading ? (
                <div className="flex items-center gap-2 text-sm text-muted-foreground py-8 justify-center"><RefreshCw className="h-4 w-4 animate-spin" />Carregando...</div>
              ) : pendingTriggers.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-8">Nenhum gatilho pendente.</p>
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
                            <span className="text-[10px] text-muted-foreground">{format(new Date(trigger.created_at), "dd/MM HH:mm", { locale: ptBR })}</span>
                          </div>
                          <p className="text-xs text-muted-foreground font-medium">{trigger.client_nome}</p>
                          <p className="text-sm text-foreground whitespace-pre-wrap leading-relaxed">{trigger.generated_message}</p>
                          <div className="flex gap-2">
                            <Button size="sm" className="h-7 text-xs gap-1" onClick={() => { const phone = clients.find(c => c.id === trigger.client_id)?.telefone1; handleCopyAndOpenWhatsApp(trigger.generated_message, phone); markSent(trigger.id, currentUser?.id); }}>
                              <Send className="h-3 w-3" />Enviar via WhatsApp
                            </Button>
                            <Button variant="outline" size="sm" className="h-7 text-xs gap-1" onClick={() => handleCopy(trigger.generated_message)}><Copy className="h-3 w-3" />Copiar</Button>
                            <Button variant="ghost" size="sm" className="h-7 text-xs gap-1 text-muted-foreground" onClick={() => dismiss(trigger.id)}><X className="h-3 w-3" />Ignorar</Button>
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

        <TabsContent value="prontas" className="space-y-4">
          <Card>
            <CardHeader className="pb-3"><CardTitle className="text-sm flex items-center gap-2"><BookOpen className="h-4 w-4 text-primary" />Copys Prontas</CardTitle></CardHeader>
            <CardContent>
              <div className="grid md:grid-cols-2 gap-3">
                {READY_COPIES.map((copy, i) => (
                  <div key={i} className="border rounded-lg p-3 space-y-2 hover:border-primary/50 transition-colors">
                    <Badge variant="secondary" className="text-[10px]">{copy.label}</Badge>
                    <p className="text-xs text-muted-foreground leading-relaxed">{copy.mensagem.substring(0, 100)}...</p>
                    <div className="flex gap-2">
                      <Button variant="outline" size="sm" className="h-7 text-xs gap-1" onClick={() => toast.success("Copy aplicada!")}><Sparkles className="h-3 w-3" />Usar</Button>
                      <Button variant="ghost" size="sm" className="h-7 text-xs gap-1" onClick={() => handleCopy(copy.mensagem.replace(/\[NOME\]/g, "Cliente"))}><Copy className="h-3 w-3" />Copiar</Button>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="historico">
          <Card>
            <CardHeader className="pb-3"><CardTitle className="text-sm">Mensagens Recentes</CardTitle></CardHeader>
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
                            <span className="text-[10px] text-muted-foreground">{format(new Date(msg.created_at), "dd/MM HH:mm", { locale: ptBR })}</span>
                          </div>
                          {(msg.contexto as any)?.nome_cliente && <p className="text-xs text-muted-foreground">Cliente: {(msg.contexto as any).nome_cliente}</p>}
                          <p className="text-sm text-foreground whitespace-pre-wrap">{msg.mensagem_gerada}</p>
                          <div className="flex gap-2">
                            <Button variant="ghost" size="sm" className="h-6 text-xs gap-1" onClick={() => handleCopy(msg.mensagem_gerada)}><Copy className="h-3 w-3" />Copiar</Button>
                            <Button variant="ghost" size="sm" className="h-6 text-xs gap-1" onClick={() => handleCopyAndOpenWhatsApp(msg.mensagem_gerada)}><ExternalLink className="h-3 w-3" />WhatsApp</Button>
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
