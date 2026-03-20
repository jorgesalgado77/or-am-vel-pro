import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabaseClient";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Shield, Store, CreditCard, LogOut, Users, Crown, Zap, Eye, EyeOff,
  Plus, Edit, Trash2, RefreshCw, Calendar, DollarSign, BarChart3, MessageSquare, Globe, Handshake, Bot, Mail, Activity,
} from "lucide-react";
import { AdminTickets } from "@/components/admin/AdminTickets";
import { AdminVendaZap } from "@/components/admin/AdminVendaZap";
import { AdminLandingPage } from "@/components/admin/AdminLandingPage";
import { AdminDealRoom } from "@/components/admin/AdminDealRoom";
import { AdminPlans } from "@/components/admin/AdminPlans";
import { AdminWhatsAppConfig } from "@/components/admin/AdminWhatsAppConfig";
import { AdminResendConfig } from "@/components/admin/AdminResendConfig";
import { AdminLoginDiagnostics } from "@/components/admin/AdminLoginDiagnostics";
import { format, isAfter, isBefore, addDays } from "date-fns";
import { ptBR } from "date-fns/locale";

interface AdminDashboardProps {
  adminName: string;
  onLogout: () => void;
}

interface Tenant {
  id: string;
  nome_loja: string;
  codigo_loja: string | null;
  email_contato: string | null;
  telefone_contato: string | null;
  plano: string;
  plano_periodo: string;
  trial_inicio: string;
  trial_fim: string;
  assinatura_inicio: string | null;
  assinatura_fim: string | null;
  max_usuarios: number;
  ativo: boolean;
  created_at: string;
}

interface PaymentSetting {
  id: string;
  gateway_name: string;
  api_key_public: string | null;
  api_key_secret: string | null;
  webhook_url: string | null;
  ativo: boolean;
  configuracoes: any;
}

const PLAN_CONFIG = {
  trial: { label: "Teste Grátis", color: "secondary" as const, icon: Zap },
  basico: { label: "Básico", color: "default" as const, icon: Users },
  premium: { label: "Premium", color: "destructive" as const, icon: Crown },
};

// Plan prices loaded dynamically from subscription_plans table
interface PlanPriceMap {
  [slug: string]: { mensal: number; anual: number };
}

function getPlanStatus(tenant: Tenant) {
  const now = new Date();
  if (tenant.plano === "trial") {
    if (isAfter(now, new Date(tenant.trial_fim))) return { text: "Expirado", variant: "destructive" as const };
    return { text: "Ativo", variant: "default" as const };
  }
  if (tenant.assinatura_fim && isBefore(new Date(tenant.assinatura_fim), now)) {
    return { text: "Vencido", variant: "destructive" as const };
  }
  return { text: "Ativo", variant: "default" as const };
}

export default function AdminDashboard({ adminName, onLogout }: AdminDashboardProps) {
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [payments, setPayments] = useState<PaymentSetting[]>([]);
  const [planPrices, setPlanPrices] = useState<PlanPriceMap>({});
  const [loading, setLoading] = useState(true);
  const [addonInterestCount, setAddonInterestCount] = useState(0);
  const [showTenantDialog, setShowTenantDialog] = useState(false);
  const [showPaymentDialog, setShowPaymentDialog] = useState(false);
  const [editingTenant, setEditingTenant] = useState<Tenant | null>(null);
  const [editingPayment, setEditingPayment] = useState<PaymentSetting | null>(null);

  // Tenant form
  const [tNome, setTNome] = useState("");
  const [tCodigo, setTCodigo] = useState("");
  const [tEmail, setTEmail] = useState("");
  const [tTelefone, setTTelefone] = useState("");
  const [tPlano, setTPlano] = useState("trial");
  const [tPeriodo, setTPeriodo] = useState("mensal");
  const [tAtivo, setTAtivo] = useState(true);

  // Payment form
  const [pGateway, setPGateway] = useState("stripe");
  const [pKeyPublic, setPKeyPublic] = useState("");
  const [pKeySecret, setPKeySecret] = useState("");
  const [pWebhook, setPWebhook] = useState("");
  const [pAtivo, setPAtivo] = useState(false);
  const [tOcultarIndicador, setTOcultarIndicador] = useState(false);
  const [tDealRoom, setTDealRoom] = useState(false);
  const [tVendaZap, setTVendaZap] = useState(false);

  const fetchAddonInterestCount = async () => {
    const { count } = await supabase
      .from("support_tickets")
      .select("*", { count: "exact", head: true })
      .eq("tipo", "addon_interesse")
      .eq("status", "aberto");
    setAddonInterestCount(count || 0);
  };

  const fetchData = async () => {
    setLoading(true);
    const [tenantsRes, paymentsRes, plansRes] = await Promise.all([
      supabase.from("tenants").select("*").order("created_at", { ascending: false }),
      supabase.from("payment_settings").select("*").order("created_at", { ascending: false }),
      supabase.from("subscription_plans" as any).select("slug, preco_mensal, preco_anual_mensal").eq("ativo", true),
    ]);
    if (tenantsRes.data) setTenants(tenantsRes.data as any);
    if (paymentsRes.data) setPayments(paymentsRes.data as any);
    if (plansRes.data) {
      const prices: PlanPriceMap = {};
      (plansRes.data as any[]).forEach(p => {
        prices[p.slug] = { mensal: p.preco_mensal, anual: p.preco_anual_mensal * 12 };
      });
      setPlanPrices(prices);
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchData();
    fetchAddonInterestCount();

    // Realtime: notify on new addon interest tickets
    const channel = supabase
      .channel("admin-addon-interest")
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "support_tickets",
          filter: "tipo=eq.addon_interesse",
        },
        (payload) => {
          const ticket = payload.new as any;
          toast.info("🔔 Novo interesse em add-on!", {
            description: `${ticket.usuario_nome} demonstrou interesse. Telefone: ${ticket.usuario_telefone || "N/A"}`,
            duration: 10000,
          });
          setAddonInterestCount((prev) => prev + 1);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  // Stats
  const totalLojas = tenants.length;
  const lojasAtivas = tenants.filter(t => t.ativo).length;
  const lojasBasico = tenants.filter(t => t.plano === "basico").length;
  const lojasPremium = tenants.filter(t => t.plano === "premium").length;
  const lojasTrial = tenants.filter(t => t.plano === "trial").length;

  const receitaMensal = tenants.reduce((acc, t) => {
    if (t.plano === "trial" || !t.ativo) return acc;
    const price = planPrices[t.plano]?.mensal || 0;
    return acc + price;
  }, 0);

  // Tenant CRUD
  const openNewTenant = () => {
    setEditingTenant(null);
    setTNome(""); setTCodigo(""); setTEmail(""); setTTelefone("");
    setTPlano("trial"); setTPeriodo("mensal"); setTAtivo(true);
    setTOcultarIndicador(false);
    setTDealRoom(false);
    setTVendaZap(false);
    setShowTenantDialog(true);
  };

  const openEditTenant = (t: Tenant) => {
    setEditingTenant(t);
    setTNome(t.nome_loja); setTCodigo(t.codigo_loja || ""); setTEmail(t.email_contato || "");
    setTTelefone(t.telefone_contato || ""); setTPlano(t.plano); setTPeriodo(t.plano_periodo);
    setTAtivo(t.ativo);
    const vip = (t as any).recursos_vip || {};
    setTOcultarIndicador(vip.ocultar_indicador || false);
    setTDealRoom(vip.deal_room || false);
    setTVendaZap(vip.vendazap || false);
    setShowTenantDialog(true);
  };

  const saveTenant = async () => {
    if (!tNome.trim()) { toast.error("Nome da loja é obrigatório"); return; }
    const maxUsers = tPlano === "basico" ? 3 : tPlano === "premium" ? 999 : 999;
    const payload: any = {
      nome_loja: tNome.trim(),
      codigo_loja: tCodigo.trim() || null,
      email_contato: tEmail.trim() || null,
      telefone_contato: tTelefone.trim() || null,
      plano: tPlano,
      plano_periodo: tPeriodo,
      max_usuarios: maxUsers,
      ativo: tAtivo,
      recursos_vip: { ocultar_indicador: tOcultarIndicador, deal_room: tDealRoom, vendazap: tVendaZap },
    };

    if (editingTenant) {
      const { error } = await supabase.from("tenants").update(payload).eq("id", editingTenant.id);
      if (error) toast.error("Erro ao atualizar loja");
      else toast.success("Loja atualizada!");
    } else {
      const { error } = await supabase.from("tenants").insert(payload);
      if (error) toast.error("Erro ao criar loja");
      else toast.success("Loja criada!");
    }
    setShowTenantDialog(false);
    fetchData();
  };

  const deleteTenant = async (id: string) => {
    if (!confirm("Tem certeza que deseja excluir esta loja?")) return;
    await supabase.from("tenants").delete().eq("id", id);
    toast.success("Loja excluída");
    fetchData();
  };

  // Payment CRUD
  const openNewPayment = () => {
    setEditingPayment(null);
    setPGateway("stripe"); setPKeyPublic(""); setPKeySecret(""); setPWebhook(""); setPAtivo(false);
    setShowPaymentDialog(true);
  };

  const openEditPayment = (p: PaymentSetting) => {
    setEditingPayment(p);
    setPGateway(p.gateway_name); setPKeyPublic(p.api_key_public || ""); setPKeySecret(p.api_key_secret || "");
    setPWebhook(p.webhook_url || ""); setPAtivo(p.ativo);
    setShowPaymentDialog(true);
  };

  const savePayment = async () => {
    const payload: any = {
      gateway_name: pGateway,
      api_key_public: pKeyPublic.trim() || null,
      api_key_secret: pKeySecret.trim() || null,
      webhook_url: pWebhook.trim() || null,
      ativo: pAtivo,
    };
    if (editingPayment) {
      await supabase.from("payment_settings").update(payload).eq("id", editingPayment.id);
      toast.success("Gateway atualizado!");
    } else {
      await supabase.from("payment_settings").insert(payload);
      toast.success("Gateway adicionado!");
    }
    setShowPaymentDialog(false);
    fetchData();
  };

  const deletePayment = async (id: string) => {
    if (!confirm("Excluir esta configuração de pagamento?")) return;
    await supabase.from("payment_settings").delete().eq("id", id);
    toast.success("Gateway excluído");
    fetchData();
  };

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b border-border bg-card px-6 py-3 flex items-center justify-between sticky top-0 z-10">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center">
            <Shield className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h1 className="text-lg font-semibold text-foreground">Painel Admin Master</h1>
            <p className="text-xs text-muted-foreground">Olá, {adminName}</p>
          </div>
        </div>
        <Button variant="ghost" size="sm" onClick={onLogout} className="gap-2 text-muted-foreground">
          <LogOut className="h-4 w-4" /> Sair
        </Button>
      </header>

      <main className="max-w-7xl mx-auto p-6 space-y-6">
        {/* KPI Cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
          {[
            { label: "Total Lojas", value: totalLojas, icon: Store, color: "text-primary" },
            { label: "Ativas", value: lojasAtivas, icon: Eye, color: "text-accent" },
            { label: "Trial", value: lojasTrial, icon: Zap, color: "text-muted-foreground" },
            { label: "Básico", value: lojasBasico, icon: Users, color: "text-primary" },
            { label: "Premium", value: lojasPremium, icon: Crown, color: "text-destructive" },
            { label: "Receita Mensal", value: `R$ ${receitaMensal.toFixed(2)}`, icon: DollarSign, color: "text-accent" },
          ].map((kpi) => (
            <Card key={kpi.label}>
              <CardContent className="p-4 flex items-center gap-3">
                <kpi.icon className={`h-5 w-5 ${kpi.color} shrink-0`} />
                <div>
                  <p className="text-xs text-muted-foreground">{kpi.label}</p>
                  <p className="text-lg font-bold text-foreground">{kpi.value}</p>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        <Tabs defaultValue="lojas" className="space-y-4">
          <TabsList>
            <TabsTrigger value="lojas" className="gap-2"><Store className="h-4 w-4" />Lojas</TabsTrigger>
            <TabsTrigger value="dealroom" className="gap-2"><Handshake className="h-4 w-4" />Deal Room</TabsTrigger>
            <TabsTrigger value="suporte" className="gap-2 relative">
              <MessageSquare className="h-4 w-4" />Suporte
              {addonInterestCount > 0 && (
                <Badge variant="destructive" className="ml-1 h-5 min-w-[20px] px-1 text-[10px] rounded-full">
                  {addonInterestCount}
                </Badge>
              )}
            </TabsTrigger>
            <TabsTrigger value="pagamentos" className="gap-2"><CreditCard className="h-4 w-4" />Pagamentos</TabsTrigger>
            <TabsTrigger value="planos" className="gap-2"><BarChart3 className="h-4 w-4" />Planos</TabsTrigger>
            <TabsTrigger value="landing" className="gap-2"><Globe className="h-4 w-4" />Landing Page</TabsTrigger>
            <TabsTrigger value="vendazap" className="gap-2"><Bot className="h-4 w-4" />VendaZap AI</TabsTrigger>
            <TabsTrigger value="whatsapp" className="gap-2"><MessageSquare className="h-4 w-4" />WhatsApp</TabsTrigger>
            <TabsTrigger value="resend" className="gap-2"><Mail className="h-4 w-4" />Resend</TabsTrigger>
            <TabsTrigger value="diagnostics" className="gap-2"><Activity className="h-4 w-4" />Diagnóstico Login</TabsTrigger>
          </TabsList>

          {/* TAB: Lojas */}
          <TabsContent value="lojas" className="space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-semibold text-foreground">Lojas Cadastradas</h3>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={fetchData} className="gap-2">
                  <RefreshCw className="h-3 w-3" /> Atualizar
                </Button>
                <Button size="sm" onClick={openNewTenant} className="gap-2">
                  <Plus className="h-3 w-3" /> Nova Loja
                </Button>
              </div>
            </div>
            <Card>
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Loja</TableHead>
                      <TableHead>Código</TableHead>
                      <TableHead>Plano</TableHead>
                      <TableHead>Período</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Validade</TableHead>
                      <TableHead>Máx. Usuários</TableHead>
                      <TableHead className="w-24">Ações</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {loading ? (
                      <TableRow><TableCell colSpan={8} className="text-center text-muted-foreground py-8">Carregando...</TableCell></TableRow>
                    ) : tenants.length === 0 ? (
                      <TableRow><TableCell colSpan={8} className="text-center text-muted-foreground py-8">Nenhuma loja cadastrada</TableCell></TableRow>
                    ) : tenants.map((t) => {
                      const status = getPlanStatus(t);
                      const planCfg = PLAN_CONFIG[t.plano as keyof typeof PLAN_CONFIG] || PLAN_CONFIG.trial;
                      const PlanIcon = planCfg.icon;
                      const validadeDate = t.plano === "trial" ? t.trial_fim : t.assinatura_fim;
                      return (
                        <TableRow key={t.id}>
                          <TableCell>
                            <div>
                              <p className="font-medium text-foreground">{t.nome_loja}</p>
                              {t.email_contato && <p className="text-xs text-muted-foreground">{t.email_contato}</p>}
                            </div>
                          </TableCell>
                          <TableCell className="text-muted-foreground">{t.codigo_loja || "—"}</TableCell>
                          <TableCell>
                            <Badge variant={planCfg.color} className="gap-1">
                              <PlanIcon className="h-3 w-3" />{planCfg.label}
                            </Badge>
                          </TableCell>
                          <TableCell className="capitalize text-muted-foreground">{t.plano_periodo}</TableCell>
                          <TableCell>
                            <Badge variant={status.variant}>{status.text}</Badge>
                          </TableCell>
                          <TableCell className="text-muted-foreground">
                            {validadeDate ? format(new Date(validadeDate), "dd/MM/yyyy", { locale: ptBR }) : "—"}
                          </TableCell>
                          <TableCell className="text-center">{t.plano === "premium" ? "∞" : t.max_usuarios}</TableCell>
                          <TableCell>
                            <div className="flex gap-1">
                              <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEditTenant(t)}>
                                <Edit className="h-3 w-3" />
                              </Button>
                              <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => deleteTenant(t.id)}>
                                <Trash2 className="h-3 w-3" />
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>

          {/* TAB: Deal Room */}
          <TabsContent value="dealroom">
            <AdminDealRoom />
          </TabsContent>

          {/* TAB: Suporte */}
          <TabsContent value="suporte">
            <AdminTickets adminName={adminName} />
          </TabsContent>

          {/* TAB: Pagamentos */}
          <TabsContent value="pagamentos" className="space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-semibold text-foreground">Gateways de Pagamento</h3>
              <Button size="sm" onClick={openNewPayment} className="gap-2">
                <Plus className="h-3 w-3" /> Adicionar Gateway
              </Button>
            </div>
            <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
              {payments.length === 0 ? (
                <Card className="col-span-full">
                  <CardContent className="py-8 text-center text-muted-foreground">
                    Nenhum gateway configurado. Adicione um para habilitar pagamentos.
                  </CardContent>
                </Card>
              ) : payments.map((p) => (
                <Card key={p.id} className={p.ativo ? "border-accent/50" : ""}>
                  <CardHeader className="pb-2 flex flex-row items-center justify-between">
                    <CardTitle className="text-base flex items-center gap-2">
                      <CreditCard className="h-4 w-4" />
                      {p.gateway_name.charAt(0).toUpperCase() + p.gateway_name.slice(1).replace("_", " ")}
                    </CardTitle>
                    <Badge variant={p.ativo ? "default" : "secondary"}>{p.ativo ? "Ativo" : "Inativo"}</Badge>
                  </CardHeader>
                  <CardContent className="space-y-2">
                    <p className="text-xs text-muted-foreground">
                      Chave Pública: {p.api_key_public ? `${p.api_key_public.slice(0, 12)}...` : "Não configurada"}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Webhook: {p.webhook_url ? `${p.webhook_url.slice(0, 30)}...` : "Não configurado"}
                    </p>
                    <div className="flex gap-2 pt-2">
                      <Button variant="outline" size="sm" onClick={() => openEditPayment(p)} className="gap-1">
                        <Edit className="h-3 w-3" /> Editar
                      </Button>
                      <Button variant="ghost" size="sm" className="text-destructive gap-1" onClick={() => deletePayment(p.id)}>
                        <Trash2 className="h-3 w-3" /> Excluir
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </TabsContent>

          {/* TAB: Planos */}
          <TabsContent value="planos" className="space-y-4">
            <AdminPlans />
          </TabsContent>

          {/* TAB: Landing Page */}
          <TabsContent value="landing">
            <AdminLandingPage />
          </TabsContent>

          {/* TAB: VendaZap AI */}
          <TabsContent value="vendazap">
            <AdminVendaZap />
          </TabsContent>

          {/* TAB: WhatsApp Admin */}
          <TabsContent value="whatsapp">
            <AdminWhatsAppConfig />
          </TabsContent>

          {/* TAB: Resend Admin */}
          <TabsContent value="resend">
            <AdminResendConfig />
          </TabsContent>

          {/* TAB: Login Diagnostics */}
          <TabsContent value="diagnostics">
            <AdminLoginDiagnostics />
          </TabsContent>
        </Tabs>
      </main>

      {/* Tenant Dialog */}
      <Dialog open={showTenantDialog} onOpenChange={setShowTenantDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{editingTenant ? "Editar Loja" : "Nova Loja"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Nome da Loja *</Label>
              <Input value={tNome} onChange={(e) => setTNome(e.target.value)} className="mt-1" />
            </div>
            <div>
              <Label>Código da Loja</Label>
              <Input value={tCodigo} onChange={(e) => setTCodigo(e.target.value)} className="mt-1" placeholder="000.000" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Email</Label>
                <Input value={tEmail} onChange={(e) => setTEmail(e.target.value)} className="mt-1" type="email" />
              </div>
              <div>
                <Label>Telefone</Label>
                <Input value={tTelefone} onChange={(e) => setTTelefone(e.target.value)} className="mt-1" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Plano</Label>
                <Select value={tPlano} onValueChange={setTPlano}>
                  <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="trial">Teste Grátis</SelectItem>
                    <SelectItem value="basico">Básico</SelectItem>
                    <SelectItem value="premium">Premium</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Período</Label>
                <Select value={tPeriodo} onValueChange={setTPeriodo}>
                  <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="mensal">Mensal</SelectItem>
                    <SelectItem value="anual">Anual</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <Switch checked={tAtivo} onCheckedChange={setTAtivo} />
              <Label>Loja ativa</Label>
            </div>
            <div className="border rounded-lg p-3 space-y-3">
              <p className="text-sm font-semibold text-foreground flex items-center gap-2">
                <Crown className="h-4 w-4 text-primary" /> Recursos VIP
              </p>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <EyeOff className="h-4 w-4 text-muted-foreground" />
                  <div>
                    <p className="text-sm font-medium text-foreground">Ocultar Indicador</p>
                    <p className="text-xs text-muted-foreground">Permite ocultar informações do indicador no simulador</p>
                  </div>
                </div>
                <Switch checked={tOcultarIndicador} onCheckedChange={setTOcultarIndicador} />
              </div>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Handshake className="h-4 w-4 text-muted-foreground" />
                  <div>
                    <p className="text-sm font-medium text-foreground">Deal Room</p>
                    <p className="text-xs text-muted-foreground">Libera acesso à Deal Room mesmo no plano Trial</p>
                  </div>
                </div>
                <Switch checked={tDealRoom} onCheckedChange={setTDealRoom} />
              </div>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Bot className="h-4 w-4 text-muted-foreground" />
                  <div>
                    <p className="text-sm font-medium text-foreground">VendaZap AI</p>
                    <p className="text-xs text-muted-foreground">Libera assistente de vendas IA para WhatsApp</p>
                  </div>
                </div>
                <Switch checked={tVendaZap} onCheckedChange={setTVendaZap} />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowTenantDialog(false)}>Cancelar</Button>
            <Button onClick={saveTenant}>Salvar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Payment Dialog */}
      <Dialog open={showPaymentDialog} onOpenChange={setShowPaymentDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{editingPayment ? "Editar Gateway" : "Novo Gateway"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Gateway</Label>
              <Select value={pGateway} onValueChange={setPGateway}>
                <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="stripe">Stripe</SelectItem>
                  <SelectItem value="mercado_pago">Mercado Pago</SelectItem>
                  <SelectItem value="pagseguro">PagSeguro</SelectItem>
                  <SelectItem value="pix">PIX</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Chave Pública (API Key)</Label>
              <Input value={pKeyPublic} onChange={(e) => setPKeyPublic(e.target.value)} className="mt-1" placeholder="pk_..." />
            </div>
            <div>
              <Label>Chave Secreta (Secret Key)</Label>
              <Input value={pKeySecret} onChange={(e) => setPKeySecret(e.target.value)} className="mt-1" type="password" placeholder="sk_..." />
            </div>
            <div>
              <Label>Webhook URL</Label>
              <Input value={pWebhook} onChange={(e) => setPWebhook(e.target.value)} className="mt-1" placeholder="https://..." />
            </div>
            <div className="flex items-center gap-3">
              <Switch checked={pAtivo} onCheckedChange={setPAtivo} />
              <Label>Gateway ativo</Label>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowPaymentDialog(false)}>Cancelar</Button>
            <Button onClick={savePayment}>Salvar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
