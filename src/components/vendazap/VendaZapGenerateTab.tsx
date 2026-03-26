/**
 * VendaZap message generator tab - extracted from VendaZapPanel.tsx
 */
import { useState, useEffect, useCallback } from "react";
import { usePersistedFormState } from "@/hooks/usePersistedFormState";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Bot, Copy, Sparkles, MessageSquare, Clock, Target,
  RefreshCw, Zap, Send, Handshake, Lightbulb, ExternalLink,
} from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/lib/supabaseClient";
import { getTenantId } from "@/lib/tenantState";
import { calcLeadTemperature, TEMPERATURE_CONFIG } from "@/lib/leadTemperature";
import type { Database } from "@/integrations/supabase/types";

type Client = Database["public"]["Tables"]["clients"]["Row"];

const COPY_TYPES = [
  { value: "reativacao", label: "Reativação", icon: RefreshCw, description: "Cliente parou de responder" },
  { value: "urgencia", label: "Urgência", icon: Clock, description: "Orçamento expirando" },
  { value: "objecao", label: "Quebra de Objeção", icon: Target, description: "Responder objeções" },
  { value: "reuniao", label: "Convite Reunião", icon: Handshake, description: "Convidar para reunião" },
  { value: "fechamento", label: "Fechamento", icon: Zap, description: "Fechar a venda" },
  { value: "geral", label: "Follow-up", icon: MessageSquare, description: "Mensagem geral" },
];

export { COPY_TYPES };

const TONES = [
  { value: "direto", label: "Direto" },
  { value: "consultivo", label: "Consultivo" },
  { value: "persuasivo", label: "Persuasivo" },
  { value: "amigavel", label: "Amigável" },
];

function getClientScore(client: Client, diasSemResposta: number) {
  if (client.status === "fechado") return { label: "Fechado", emoji: "✅", color: "text-green-600" };
  const temp = calcLeadTemperature({ status: client.status, diasSemResposta, temSimulacao: true });
  const cfg = TEMPERATURE_CONFIG[temp];
  return { label: cfg.label, emoji: cfg.emoji, color: cfg.color };
}

export { getClientScore };

interface VendaZapGenerateTabProps {
  generating: boolean;
  generateMessage: (params: any) => Promise<string | null>;
  addon: any;
  autoSugg: any;
  currentUserId?: string;
}

export function VendaZapGenerateTab({ generating, generateMessage, addon, autoSugg, currentUserId }: VendaZapGenerateTabProps) {
  const [selectedClient, setSelectedClient] = useState<Client | null>(null);
  const [clients, setClients] = useState<Client[]>([]);
  const [searchClient, setSearchClient] = useState("");
  const [tipoCopy, setTipoCopy] = useState("geral");
  const [tom, setTom] = useState("persuasivo");
  const [mensagemCliente, setMensagemCliente] = useState("");
  const [mensagemGerada, setMensagemGerada] = useState("");
  const [lastSim, setLastSim] = useState<any>(null);

  useEffect(() => {
    const tenantId = getTenantId();
    let query = supabase.from("clients").select("*").order("created_at", { ascending: false });
    if (tenantId) query = query.eq("tenant_id", tenantId);
    query.then(({ data }) => { if (data) setClients(data); });
  }, []);

  useEffect(() => {
    if (selectedClient) {
      supabase.from("simulations").select("*").eq("client_id", selectedClient.id)
        .order("created_at", { ascending: false }).limit(1).maybeSingle()
        .then(({ data }) => {
          setLastSim(data);
          if (addon?.ativo) autoSugg.generate(selectedClient, data);
        });
    } else {
      autoSugg.clear();
    }
  }, [selectedClient?.id]);

  const diasSemResposta = selectedClient ? Math.floor((Date.now() - new Date(selectedClient.updated_at).getTime()) / (1000 * 60 * 60 * 24)) : 0;
  const clientScore = selectedClient ? getClientScore(selectedClient, diasSemResposta) : null;

  const handleGenerate = async () => {
    const result = await generateMessage({
      nome_cliente: selectedClient?.nome, valor_orcamento: lastSim?.valor_final || lastSim?.valor_tela,
      status_negociacao: selectedClient?.status || "novo", dias_sem_resposta: diasSemResposta,
      mensagem_cliente: mensagemCliente || undefined, tipo_copy: tipoCopy, tom,
      client_id: selectedClient?.id, usuario_id: currentUserId,
    });
    if (result) setMensagemGerada(result);
  };

  const handleCopy = (text: string) => { navigator.clipboard.writeText(text); toast.success("Mensagem copiada!"); };

  const handleCopyAndOpenWhatsApp = (text: string, phone?: string | null) => {
    navigator.clipboard.writeText(text);
    const cleanPhone = phone?.replace(/\D/g, "") || "";
    const waUrl = cleanPhone ? `https://wa.me/55${cleanPhone}?text=${encodeURIComponent(text)}` : `https://wa.me/?text=${encodeURIComponent(text)}`;
    window.open(waUrl, "_blank");
    toast.success("Mensagem copiada e WhatsApp aberto!");
  };

  const filteredClients = clients.filter(c =>
    c.nome.toLowerCase().includes(searchClient.toLowerCase()) ||
    c.numero_orcamento?.toLowerCase().includes(searchClient.toLowerCase())
  );

  return (
    <div className="grid md:grid-cols-2 gap-4">
      <div className="space-y-4">
        {/* Client Selection */}
        <Card>
          <CardHeader className="pb-3"><CardTitle className="text-sm">Cliente</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <Input placeholder="Buscar cliente por nome ou orçamento..." value={searchClient} onChange={(e) => setSearchClient(e.target.value)} />
            {searchClient && !selectedClient && (
              <ScrollArea className="h-32 border rounded-md">
                {filteredClients.slice(0, 8).map(c => {
                  const days = Math.floor((Date.now() - new Date(c.updated_at).getTime()) / (1000 * 60 * 60 * 24));
                  const score = getClientScore(c, days);
                  return (
                    <button key={c.id} onClick={() => { setSelectedClient(c); setSearchClient(""); setMensagemGerada(""); }}
                      className="w-full text-left px-3 py-2 hover:bg-secondary transition-colors text-sm flex items-center justify-between">
                      <div>
                        <span className="font-medium text-foreground">{c.nome}</span>
                        {c.numero_orcamento && <span className="text-muted-foreground ml-2">#{c.numero_orcamento}</span>}
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
                    {clientScore && <Badge variant="outline" className={`text-[10px] ${clientScore.color}`}>{clientScore.emoji} {clientScore.label}</Badge>}
                  </div>
                  <Button variant="ghost" size="sm" onClick={() => { setSelectedClient(null); autoSugg.clear(); setMensagemGerada(""); }} className="h-6 text-xs">Trocar</Button>
                </div>
                {selectedClient.numero_orcamento && <p className="text-xs text-muted-foreground">Orçamento: #{selectedClient.numero_orcamento}</p>}
                <p className="text-xs text-muted-foreground">Status: {selectedClient.status}</p>
                {lastSim?.valor_final && <p className="text-xs text-muted-foreground">Valor: R$ {Number(lastSim.valor_final).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}</p>}
                {diasSemResposta > 0 && <p className="text-xs text-orange-600">{diasSemResposta} dias sem atualização</p>}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Auto Suggestion */}
        {selectedClient && (autoSugg.suggestion || autoSugg.loading) && (
          <Card className="border-primary/30 bg-primary/5 dark:bg-primary/10">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2 text-primary"><Lightbulb className="h-4 w-4" />💡 Sugestão da IA</CardTitle>
            </CardHeader>
            <CardContent>
              {autoSugg.loading ? (
                <div className="flex items-center gap-2 text-sm text-muted-foreground"><RefreshCw className="h-3 w-3 animate-spin" />Analisando...</div>
              ) : (
                <div className="space-y-3">
                  <p className="text-sm text-foreground whitespace-pre-wrap leading-relaxed">{autoSugg.suggestion}</p>
                  <div className="flex flex-wrap gap-2">
                    <Button size="sm" className="h-8 text-xs gap-1.5" onClick={() => { setMensagemGerada(autoSugg.suggestion); if (selectedClient) autoSugg.markUsed(selectedClient.id); toast.success("Sugestão aplicada!"); }}>
                      <Sparkles className="h-3 w-3" />Usar resposta
                    </Button>
                    <Button variant="outline" size="sm" className="h-8 text-xs gap-1" onClick={() => handleCopy(autoSugg.suggestion)}><Copy className="h-3 w-3" />Copiar</Button>
                    <Button variant="outline" size="sm" className="h-8 text-xs gap-1" onClick={() => handleCopyAndOpenWhatsApp(autoSugg.suggestion, selectedClient?.telefone1)}><ExternalLink className="h-3 w-3" />WhatsApp</Button>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {/* Copy Type */}
        <Card>
          <CardHeader className="pb-3"><CardTitle className="text-sm">Tipo de Mensagem</CardTitle></CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 gap-2">
              {COPY_TYPES.map(ct => {
                const Icon = ct.icon;
                return (
                  <button key={ct.value} onClick={() => setTipoCopy(ct.value)}
                    className={`p-2.5 rounded-lg border text-left transition-all ${tipoCopy === ct.value ? "border-primary bg-primary/5" : "border-border hover:border-muted-foreground/30"}`}>
                    <div className="flex items-center gap-2"><Icon className="h-3.5 w-3.5 text-primary shrink-0" /><span className="text-xs font-medium text-foreground">{ct.label}</span></div>
                    <p className="text-[10px] text-muted-foreground mt-0.5">{ct.description}</p>
                  </button>
                );
              })}
            </div>
          </CardContent>
        </Card>

        {/* Tone */}
        <Card>
          <CardHeader className="pb-3"><CardTitle className="text-sm">Tom da Mensagem</CardTitle></CardHeader>
          <CardContent>
            <Select value={tom} onValueChange={setTom}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{TONES.map(t => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}</SelectContent>
            </Select>
          </CardContent>
        </Card>

        {/* Client Message */}
        <Card>
          <CardHeader className="pb-3"><CardTitle className="text-sm">Mensagem do Cliente (opcional)</CardTitle></CardHeader>
          <CardContent>
            <Textarea placeholder="Cole aqui a mensagem do cliente..." value={mensagemCliente} onChange={(e) => setMensagemCliente(e.target.value)} rows={3} />
          </CardContent>
        </Card>

        <Button onClick={handleGenerate} disabled={generating} className="w-full gap-2 bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-700 hover:to-emerald-700" size="lg">
          {generating ? <><RefreshCw className="h-4 w-4 animate-spin" />Gerando...</> : <><Sparkles className="h-4 w-4" />Gerar Mensagem</>}
        </Button>
      </div>

      {/* Result */}
      <div className="space-y-4">
        <Card className="min-h-[300px]">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm flex items-center gap-2"><Send className="h-4 w-4 text-green-600" />Mensagem Gerada</CardTitle>
              {mensagemGerada && <Button variant="outline" size="sm" onClick={() => handleCopy(mensagemGerada)} className="gap-1 h-7"><Copy className="h-3 w-3" />Copiar</Button>}
            </div>
          </CardHeader>
          <CardContent>
            {mensagemGerada ? (
              <div className="bg-green-50 dark:bg-green-950/20 border border-green-200 dark:border-green-900 rounded-xl p-4 relative">
                <div className="absolute -top-2 -left-2 w-6 h-6 bg-green-500 rounded-full flex items-center justify-center"><MessageSquare className="h-3 w-3 text-white" /></div>
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
              <Button variant="outline" onClick={handleGenerate} disabled={generating} className="flex-1 gap-2"><RefreshCw className="h-4 w-4" />Regenerar</Button>
              <Button variant="outline" onClick={() => handleCopy(mensagemGerada)} className="flex-1 gap-2"><Copy className="h-4 w-4" />Copiar</Button>
            </div>
            <Button onClick={() => handleCopyAndOpenWhatsApp(mensagemGerada, selectedClient?.telefone1)} className="w-full gap-2 bg-green-600 hover:bg-green-700 text-white">
              <ExternalLink className="h-4 w-4" />Copiar + Abrir WhatsApp
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
