import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { toast } from "sonner";
import {
  Bot, Copy, Sparkles, MessageSquare, Clock, Target,
  RefreshCw, Zap, History, Send, ArrowLeft, Handshake,
} from "lucide-react";
import { useVendaZap } from "@/hooks/useVendaZap";
import { useCurrentUser } from "@/hooks/useCurrentUser";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

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

interface VendaZapPanelProps {
  tenantId: string | null;
  onBack?: () => void;
}

export function VendaZapPanel({ tenantId, onBack }: VendaZapPanelProps) {
  const { currentUser } = useCurrentUser();
  const { addon, messages, loading, generating, dailyUsage, generateMessage, fetchMessages } = useVendaZap(tenantId);

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
      // Fetch last simulation for context
      supabase
        .from("simulations")
        .select("*")
        .eq("client_id", selectedClient.id)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle()
        .then(({ data }) => setLastSim(data));
    }
  }, [selectedClient?.id]);

  const diasSemResposta = selectedClient
    ? Math.floor((Date.now() - new Date(selectedClient.updated_at).getTime()) / (1000 * 60 * 60 * 24))
    : 0;

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

  const handleCopy = () => {
    navigator.clipboard.writeText(mensagemGerada);
    toast.success("Mensagem copiada!");
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
      <div className="flex flex-col items-center justify-center py-16 space-y-4">
        <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center">
          <Bot className="h-8 w-8 text-primary" />
        </div>
        <h3 className="text-lg font-semibold text-foreground">VendaZap AI</h3>
        <p className="text-sm text-muted-foreground text-center max-w-md">
          Assistente inteligente de vendas para WhatsApp. Este add-on não está ativo para sua loja.
          Entre em contato com o suporte para adquirir.
        </p>
        {onBack && <Button variant="outline" onClick={onBack} className="gap-2"><ArrowLeft className="h-4 w-4" />Voltar</Button>}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {onBack && (
        <Button variant="ghost" size="sm" onClick={onBack} className="gap-2 mb-2">
          <ArrowLeft className="h-4 w-4" />Voltar
        </Button>
      )}

      {/* Header with usage */}
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
        <TabsList>
          <TabsTrigger value="gerar" className="gap-2"><Sparkles className="h-4 w-4" />Gerar Mensagem</TabsTrigger>
          <TabsTrigger value="historico" className="gap-2"><History className="h-4 w-4" />Histórico</TabsTrigger>
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
                      {filteredClients.slice(0, 8).map(c => (
                        <button
                          key={c.id}
                          onClick={() => { setSelectedClient(c); setSearchClient(""); }}
                          className="w-full text-left px-3 py-2 hover:bg-secondary transition-colors text-sm"
                        >
                          <span className="font-medium text-foreground">{c.nome}</span>
                          {c.numero_orcamento && (
                            <span className="text-muted-foreground ml-2">#{c.numero_orcamento}</span>
                          )}
                        </button>
                      ))}
                    </ScrollArea>
                  )}
                  {selectedClient && (
                    <div className="bg-secondary/50 rounded-lg p-3 space-y-1">
                      <div className="flex items-center justify-between">
                        <p className="font-medium text-sm text-foreground">{selectedClient.nome}</p>
                        <Button variant="ghost" size="sm" onClick={() => setSelectedClient(null)} className="h-6 text-xs">
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

              {/* Copy Type Selection */}
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
              {tipoCopy === "objecao" && (
                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-sm">Mensagem do Cliente</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <Textarea
                      placeholder="Cole aqui a mensagem do cliente para análise..."
                      value={mensagemCliente}
                      onChange={(e) => setMensagemCliente(e.target.value)}
                      rows={3}
                    />
                  </CardContent>
                </Card>
              )}

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
                      <Button variant="outline" size="sm" onClick={handleCopy} className="gap-1 h-7">
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
                      <p className="text-sm">Selecione um cliente e tipo de mensagem, depois clique em "Gerar Mensagem"</p>
                    </div>
                  )}
                </CardContent>
              </Card>

              {mensagemGerada && (
                <div className="flex gap-2">
                  <Button variant="outline" onClick={handleGenerate} disabled={generating} className="flex-1 gap-2">
                    <RefreshCw className="h-4 w-4" />Regenerar
                  </Button>
                  <Button variant="outline" onClick={handleCopy} className="flex-1 gap-2">
                    <Copy className="h-4 w-4" />Copiar para WhatsApp
                  </Button>
                </div>
              )}
            </div>
          </div>
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
                          <Button variant="ghost" size="sm" className="h-6 text-xs gap-1" onClick={() => {
                            navigator.clipboard.writeText(msg.mensagem_gerada);
                            toast.success("Copiada!");
                          }}>
                            <Copy className="h-3 w-3" />Copiar
                          </Button>
                        </div>
                      );
                    })}
                  </div>
                </ScrollArea>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
