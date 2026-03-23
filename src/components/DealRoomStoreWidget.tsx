import { useState, useEffect, useCallback } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  DollarSign, TrendingUp, Target, Percent, Trophy, Plus,
  Send, Eye, CheckCircle, XCircle, FileText, ExternalLink,
  Handshake, BarChart3, RefreshCw, Video, Calendar,
} from "lucide-react";
import { useDealRoom, type DealRoomProposal } from "@/hooks/useDealRoom";
import { OnboardingDialog, useOnboarding } from "@/components/OnboardingDialog";
import { formatCurrency } from "@/lib/financing";
import { supabase } from "@/lib/supabaseClient";
import { toast } from "sonner";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { DealRoomMeeting } from "./dealroom/DealRoomMeeting";
import { DealRoomScheduler } from "./dealroom/DealRoomScheduler";

interface DealRoomStoreWidgetProps {
  tenantId: string;
}

interface ClientOption {
  id: string;
  nome: string;
  numero_orcamento: string | null;
}

const STATUS_CONFIG: Record<string, { label: string; color: string; icon: any }> = {
  enviada: { label: "Enviada", color: "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200", icon: Send },
  visualizada: { label: "Visualizada", color: "bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200", icon: Eye },
  aceita: { label: "Aceita", color: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200", icon: CheckCircle },
  paga: { label: "Paga", color: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900 dark:text-emerald-200", icon: DollarSign },
  recusada: { label: "Recusada", color: "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200", icon: XCircle },
};

export function DealRoomStoreWidget({ tenantId }: DealRoomStoreWidgetProps) {
  const { getMetrics, listProposals, createProposal, trackProposalEvent, loading: hookLoading } = useDealRoom();
  const { showOnboarding, setShowOnboarding } = useOnboarding("dealroom");

  const [metrics, setMetrics] = useState<{
    totalVendas: number; totalTransacionado: number; totalTaxas: number;
    ticketMedio: number; totalReunioes: number; taxaConversao: number;
  } | null>(null);
  const [proposalStats, setProposalStats] = useState<any>(null);
  const [ranking, setRanking] = useState<any[]>([]);
  const [proposals, setProposals] = useState<DealRoomProposal[]>([]);
  const [clients, setClients] = useState<ClientOption[]>([]);
  const [loadingData, setLoadingData] = useState(true);

  // Meeting state
  const [activeMeeting, setActiveMeeting] = useState<{
    sessionId: string; roomName: string; clientName: string;
    clientId?: string; proposalId?: string; proposalValue?: number;
  } | null>(null);

  // Quick meeting dialog
  const [showQuickMeeting, setShowQuickMeeting] = useState(false);
  const [quickMeetingClient, setQuickMeetingClient] = useState("");

  const [showNewProposal, setShowNewProposal] = useState(false);
  const [newProposal, setNewProposal] = useState({
    client_id: "", valor_proposta: "", descricao: "", forma_pagamento: "pix",
  });
  const [creatingProposal, setCreatingProposal] = useState(false);

  const loadData = useCallback(async () => {
    setLoadingData(true);
    try {
      const result = await getMetrics({ tenant_id: tenantId });
      if (result) {
        setMetrics(result.metrics);
        setRanking(result.ranking?.slice(0, 5) || []);
        setProposalStats(result.proposalStats || null);
      } else {
        setMetrics({ totalVendas: 0, totalTransacionado: 0, totalTaxas: 0, ticketMedio: 0, totalReunioes: 0, taxaConversao: 0 });
      }

      const proposalsList = await listProposals(tenantId);
      setProposals(proposalsList);

      const { data: clientsData } = await supabase
        .from("clients")
        .select("id, nome, numero_orcamento")
        .eq("tenant_id", tenantId)
        .order("created_at", { ascending: false })
        .limit(100);
      setClients(clientsData || []);
    } catch (err) {
      console.error("Error loading deal room data:", err);
      setMetrics({ totalVendas: 0, totalTransacionado: 0, totalTaxas: 0, ticketMedio: 0, totalReunioes: 0, taxaConversao: 0 });
    }
    setLoadingData(false);
  }, [tenantId, getMetrics, listProposals]);

  useEffect(() => {
    if (!tenantId) return;
    loadData();
  }, [tenantId, loadData]);

  const handleCreateProposal = async () => {
    if (!newProposal.valor_proposta || Number(newProposal.valor_proposta) <= 0) {
      toast.error("Informe um valor válido para a proposta");
      return;
    }
    setCreatingProposal(true);
    const selectedClient = clients.find(c => c.id === newProposal.client_id);

    const proposal = await createProposal(tenantId, {
      client_id: newProposal.client_id || undefined,
      valor_proposta: Number(newProposal.valor_proposta),
      descricao: newProposal.descricao || `Proposta para ${selectedClient?.nome || "Cliente"}`,
      forma_pagamento: newProposal.forma_pagamento,
      numero_contrato: selectedClient?.numero_orcamento || undefined,
    });

    setCreatingProposal(false);
    if (!proposal) return;

    toast.success("Proposta criada com sucesso!");
    setShowNewProposal(false);
    setNewProposal({ client_id: "", valor_proposta: "", descricao: "", forma_pagamento: "pix" });
    loadData();
  };

  const handleTrackEvent = async (proposalId: string, event: string) => {
    const success = await trackProposalEvent(proposalId, event);
    if (success) {
      toast.success(`Proposta marcada como "${event}"`);
      loadData();
    }
  };

  const startMeeting = (sessionId: string, clientName: string, clientId?: string, proposalId?: string, proposalValue?: number) => {
    const roomName = sessionId.replace(/-/g, "").slice(0, 16);
    setActiveMeeting({ sessionId, roomName, clientName, clientId, proposalId, proposalValue });
  };

  const handleQuickStart = () => {
    const sessionId = crypto.randomUUID();
    const selectedClient = clients.find(c => c.id === quickMeetingClient);
    startMeeting(sessionId, selectedClient?.nome || "Convidado", quickMeetingClient || undefined);
    setShowQuickMeeting(false);
    setQuickMeetingClient("");
  };

  // If meeting is active, render the meeting room
  if (activeMeeting) {
    return (
      <DealRoomMeeting
        tenantId={tenantId}
        sessionId={activeMeeting.sessionId}
        roomName={activeMeeting.roomName}
        clientName={activeMeeting.clientName}
        clientId={activeMeeting.clientId}
        proposalId={activeMeeting.proposalId}
        proposalValue={activeMeeting.proposalValue}
        onClose={() => setActiveMeeting(null)}
      />
    );
  }

  if (loadingData && !metrics) {
    return (
      <div className="flex items-center justify-center py-20 text-muted-foreground">
        <RefreshCw className="h-5 w-5 animate-spin mr-2" /> Carregando Deal Room...
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold text-foreground flex items-center gap-2">
          <Handshake className="h-6 w-6 text-primary" />
          Deal Room
        </h2>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={loadData} className="gap-2">
            <RefreshCw className="h-3.5 w-3.5" /> Atualizar
          </Button>
          <Button variant="default" size="sm" onClick={() => setShowQuickMeeting(true)} className="gap-2">
            <Video className="h-3.5 w-3.5" /> Iniciar Sala
          </Button>
          <Button size="sm" onClick={() => setShowNewProposal(true)} className="gap-2">
            <Plus className="h-3.5 w-3.5" /> Nova Proposta
          </Button>
        </div>
      </div>

      <Tabs defaultValue="propostas" className="space-y-4">
        <TabsList className="overflow-x-auto">
          <TabsTrigger value="propostas" className="gap-2"><FileText className="h-4 w-4" /> Propostas</TabsTrigger>
          <TabsTrigger value="metricas" className="gap-2"><BarChart3 className="h-4 w-4" /> Métricas</TabsTrigger>
          <TabsTrigger value="ranking" className="gap-2"><Trophy className="h-4 w-4" /> Ranking</TabsTrigger>
          <TabsTrigger value="agenda" className="gap-2"><Calendar className="h-4 w-4" /> Agenda</TabsTrigger>
        </TabsList>

        {/* KPI Cards */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          {[
            { label: "Propostas", value: proposalStats?.total ?? proposals.length, icon: FileText, color: "text-primary" },
            { label: "Vendas", value: metrics?.totalVendas ?? 0, icon: TrendingUp, color: "text-primary" },
            { label: "Valor Vendido", value: formatCurrency(metrics?.totalTransacionado ?? 0), icon: DollarSign, color: "text-primary" },
            { label: "Taxa Plataforma", value: formatCurrency(metrics?.totalTaxas ?? 0), icon: Percent, color: "text-primary" },
            { label: "Ticket Médio", value: formatCurrency(metrics?.ticketMedio ?? 0), icon: Target, color: "text-primary" },
          ].map(kpi => (
            <Card key={kpi.label}>
              <CardContent className="p-3">
                <div className="flex items-center gap-1.5 mb-1">
                  <kpi.icon className={`h-3.5 w-3.5 ${kpi.color}`} />
                  <span className="text-[11px] text-muted-foreground">{kpi.label}</span>
                </div>
                <p className="text-sm font-bold text-foreground">{kpi.value}</p>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Propostas Tab */}
        <TabsContent value="propostas" className="space-y-4">
          {proposals.length === 0 ? (
            <Card>
              <CardContent className="p-8 text-center space-y-3">
                <Handshake className="h-12 w-12 text-muted-foreground mx-auto" />
                <h4 className="font-semibold text-foreground">Nenhuma proposta criada</h4>
                <p className="text-sm text-muted-foreground max-w-md mx-auto">
                  Crie sua primeira proposta comercial para enviar aos seus clientes.
                </p>
                <Button onClick={() => setShowNewProposal(true)} className="gap-2 mt-2">
                  <Plus className="h-4 w-4" /> Criar Primeira Proposta
                </Button>
              </CardContent>
            </Card>
          ) : (
            <Card>
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Data</TableHead>
                      <TableHead>Descrição</TableHead>
                      <TableHead className="text-right">Valor</TableHead>
                      <TableHead>Pagamento</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Ações</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {proposals.map(p => {
                      const statusCfg = STATUS_CONFIG[p.status] || STATUS_CONFIG.enviada;
                      const StatusIcon = statusCfg.icon;
                      return (
                        <TableRow key={p.id}>
                          <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                            {format(new Date(p.created_at), "dd/MM/yy HH:mm", { locale: ptBR })}
                          </TableCell>
                          <TableCell className="max-w-[200px] truncate text-sm">
                            {p.descricao || "—"}
                          </TableCell>
                          <TableCell className="text-right font-mono text-sm font-semibold whitespace-nowrap">
                            {formatCurrency(p.valor_proposta)}
                          </TableCell>
                          <TableCell className="text-xs capitalize">{p.forma_pagamento || "—"}</TableCell>
                          <TableCell>
                            <Badge className={`gap-1 text-[10px] ${statusCfg.color}`}>
                              <StatusIcon className="h-3 w-3" /> {statusCfg.label}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            <div className="flex gap-1">
                              {/* Start meeting for this proposal */}
                              <Button variant="ghost" size="sm" className="h-7 text-xs gap-1"
                                onClick={() => startMeeting(crypto.randomUUID(), p.descricao || "Cliente", p.client_id || undefined, p.id, p.valor_proposta)}>
                                <Video className="h-3 w-3" /> Sala
                              </Button>
                              {p.status === "enviada" && (
                                <>
                                  <Button variant="ghost" size="sm" className="h-7 text-xs gap-1"
                                    onClick={() => handleTrackEvent(p.id, "visualizada")}>
                                    <Eye className="h-3 w-3" /> Vista
                                  </Button>
                                  <Button variant="ghost" size="sm" className="h-7 text-xs gap-1 text-destructive"
                                    onClick={() => handleTrackEvent(p.id, "recusada")}>
                                    <XCircle className="h-3 w-3" /> Recusar
                                  </Button>
                                </>
                              )}
                              {p.status === "visualizada" && (
                                <>
                                  <Button variant="ghost" size="sm" className="h-7 text-xs gap-1"
                                    onClick={() => handleTrackEvent(p.id, "aceita")}>
                                    <CheckCircle className="h-3 w-3" /> Aceitar
                                  </Button>
                                  <Button variant="ghost" size="sm" className="h-7 text-xs gap-1 text-destructive"
                                    onClick={() => handleTrackEvent(p.id, "recusada")}>
                                    <XCircle className="h-3 w-3" /> Recusar
                                  </Button>
                                </>
                              )}
                              {p.status === "aceita" && (
                                <Button variant="ghost" size="sm" className="h-7 text-xs gap-1"
                                  onClick={() => handleTrackEvent(p.id, "paga")}>
                                  <DollarSign className="h-3 w-3" /> Confirmar Pgto
                                </Button>
                              )}
                              {p.stripe_checkout_url && (
                                <Button variant="ghost" size="sm" className="h-7 text-xs gap-1"
                                  onClick={() => window.open(p.stripe_checkout_url!, "_blank")}>
                                  <ExternalLink className="h-3 w-3" /> Link
                                </Button>
                              )}
                            </div>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* Métricas Tab */}
        <TabsContent value="metricas" className="space-y-4">
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
            {[
              { label: "Total Propostas", value: proposalStats?.total ?? proposals.length, icon: FileText },
              { label: "Enviadas", value: proposalStats?.enviadas ?? 0, icon: Send },
              { label: "Visualizadas", value: proposalStats?.visualizadas ?? 0, icon: Eye },
              { label: "Aceitas", value: proposalStats?.aceitas ?? 0, icon: CheckCircle },
              { label: "Pagas", value: proposalStats?.pagas ?? 0, icon: DollarSign },
              { label: "Recusadas", value: proposalStats?.recusadas ?? 0, icon: XCircle },
            ].map(s => (
              <Card key={s.label}>
                <CardContent className="p-3 text-center">
                  <s.icon className="h-5 w-5 text-muted-foreground mx-auto mb-1" />
                  <p className="text-lg font-bold text-foreground">{s.value}</p>
                  <p className="text-[10px] text-muted-foreground">{s.label}</p>
                </CardContent>
              </Card>
            ))}
          </div>
        </TabsContent>

        {/* Ranking Tab */}
        <TabsContent value="ranking" className="space-y-4">
          {ranking.length === 0 ? (
            <Card>
              <CardContent className="p-8 text-center">
                <Trophy className="h-10 w-10 text-muted-foreground mx-auto mb-2" />
                <p className="text-sm text-muted-foreground">Nenhuma venda registrada ainda.</p>
              </CardContent>
            </Card>
          ) : (
            <Card>
              <CardContent className="px-4 py-3 space-y-3">
                {ranking.map((v: any) => (
                  <div key={v.posicao} className="flex items-center justify-between text-sm">
                    <div className="flex items-center gap-3">
                      <span className="text-base font-bold w-6 text-center">
                        {v.posicao === 1 ? "🥇" : v.posicao === 2 ? "🥈" : v.posicao === 3 ? "🥉" : `${v.posicao}º`}
                      </span>
                      <span className="text-foreground font-medium">{v.nome}</span>
                    </div>
                    <div className="flex items-center gap-3">
                      <Badge variant="secondary" className="text-[10px]">{v.vendas} vendas</Badge>
                      <span className="font-semibold text-foreground">{formatCurrency(v.total_vendido)}</span>
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* Agenda Tab */}
        <TabsContent value="agenda">
          <DealRoomScheduler
            tenantId={tenantId}
            clients={clients.map(c => ({ id: c.id, nome: c.nome }))}
            onStartMeeting={(sessionId, clientName, clientId) => startMeeting(sessionId, clientName, clientId)}
          />
        </TabsContent>
      </Tabs>

      {/* Quick Meeting Dialog */}
      <Dialog open={showQuickMeeting} onOpenChange={setShowQuickMeeting}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Video className="h-5 w-5 text-primary" /> Iniciar Sala de Reunião
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label className="text-sm">Cliente (opcional)</Label>
              <Select value={quickMeetingClient} onValueChange={setQuickMeetingClient}>
                <SelectTrigger className="h-9 text-sm">
                  <SelectValue placeholder="Selecione um cliente..." />
                </SelectTrigger>
                <SelectContent>
                  {clients.map(c => (
                    <SelectItem key={c.id} value={c.id}>{c.nome}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowQuickMeeting(false)}>Cancelar</Button>
            <Button onClick={handleQuickStart} className="gap-2">
              <Video className="h-4 w-4" /> Iniciar Agora
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* New Proposal Dialog */}
      <Dialog open={showNewProposal} onOpenChange={setShowNewProposal}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Handshake className="h-5 w-5 text-primary" /> Nova Proposta Comercial
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label className="text-sm">Cliente (opcional)</Label>
              <Select value={newProposal.client_id} onValueChange={v => setNewProposal(p => ({ ...p, client_id: v }))}>
                <SelectTrigger className="h-9 text-sm">
                  <SelectValue placeholder="Selecione um cliente..." />
                </SelectTrigger>
                <SelectContent>
                  {clients.map(c => (
                    <SelectItem key={c.id} value={c.id}>{c.nome}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-sm">Valor da Proposta (R$) *</Label>
              <Input
                type="number" step="0.01" min="0" placeholder="0,00"
                value={newProposal.valor_proposta}
                onChange={e => setNewProposal(p => ({ ...p, valor_proposta: e.target.value }))}
                className="h-9"
              />
            </div>
            <div>
              <Label className="text-sm">Descrição</Label>
              <Textarea
                placeholder="Descrição da proposta..."
                value={newProposal.descricao}
                onChange={e => setNewProposal(p => ({ ...p, descricao: e.target.value }))}
                rows={3}
              />
            </div>
            <div>
              <Label className="text-sm">Forma de Pagamento</Label>
              <Select value={newProposal.forma_pagamento} onValueChange={v => setNewProposal(p => ({ ...p, forma_pagamento: v }))}>
                <SelectTrigger className="h-9 text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="pix">PIX</SelectItem>
                  <SelectItem value="cartao">Cartão de Crédito</SelectItem>
                  <SelectItem value="boleto">Boleto</SelectItem>
                  <SelectItem value="transferencia">Transferência</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowNewProposal(false)}>Cancelar</Button>
            <Button onClick={handleCreateProposal} disabled={creatingProposal} className="gap-2">
              {creatingProposal ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              Criar Proposta
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <OnboardingDialog featureKey="dealroom" open={showOnboarding} onClose={() => setShowOnboarding(false)} />
    </div>
  );
}
