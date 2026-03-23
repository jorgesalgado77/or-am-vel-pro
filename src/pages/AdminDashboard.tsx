import {useState, useEffect} from "react";
import {supabase} from "@/lib/supabaseClient";
import {toast} from "sonner";
import {logAudit} from "@/services/auditService";
import {Card, CardContent, CardHeader, CardTitle} from "@/components/ui/card";
import {Button} from "@/components/ui/button";
import {Input} from "@/components/ui/input";
import {Label} from "@/components/ui/label";
import {Badge} from "@/components/ui/badge";
import {Tabs, TabsContent, TabsList, TabsTrigger} from "@/components/ui/tabs";
import {Table, TableBody, TableCell, TableHead, TableHeader, TableRow} from "@/components/ui/table";
import {Switch} from "@/components/ui/switch";
import {Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter} from "@/components/ui/dialog";
import {Select, SelectContent, SelectItem, SelectTrigger, SelectValue} from "@/components/ui/select";
import {ScrollArea, ScrollBar} from "@/components/ui/scroll-area";
import {
  Shield, Store, CreditCard, LogOut, Users, Crown, Zap, Eye, EyeOff,
  Plus, Edit, Trash2, RefreshCw, Calendar, DollarSign, BarChart3, MessageSquare, Globe, Handshake, Bot, Mail, Activity, Palette, Gift, Film, StoreIcon, XCircle, Box,
} from "lucide-react";
import {AdminUsersModal} from "@/components/admin/AdminUsersModal";
import {AdminClientsModal} from "@/components/admin/AdminClientsModal";
import {AdminInactiveStoresModal} from "@/components/admin/AdminInactiveStoresModal";
import {AdminContractsValueCard} from "@/components/admin/AdminContractsValueCard";
import {AdminTickets} from "@/components/admin/AdminTickets";
import {AdminVendaZap} from "@/components/admin/AdminVendaZap";
import {AdminLandingPage} from "@/components/admin/AdminLandingPage";
import {AdminDealRoom} from "@/components/admin/AdminDealRoom";
import {AdminPlans} from "@/components/admin/AdminPlans";
import {AdminWhatsAppConfig} from "@/components/admin/AdminWhatsAppConfig";
import {AdminResendConfig} from "@/components/admin/AdminResendConfig";
import {AdminLoginDiagnostics} from "@/components/admin/AdminLoginDiagnostics";
import {AdminCanvaConfig} from "@/components/admin/AdminCanvaConfig";
import {AdminAffiliates} from "@/components/admin/AdminAffiliates";
import {AdminTutorials} from "@/components/admin/AdminTutorials";
import {format, isAfter, isBefore} from "date-fns";
import {ptBR} from "date-fns/locale";

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

interface TenantStats {
  [tenantId: string]: { usuarios: number; clientes: number; simulacoes: number };
}

export default function AdminDashboard({ adminName, onLogout }: AdminDashboardProps) {
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [payments, setPayments] = useState<PaymentSetting[]>([]);
  const [planPrices, setPlanPrices] = useState<PlanPriceMap>({});
  const [tenantStats, setTenantStats] = useState<TenantStats>({});
  const [loading, setLoading] = useState(true);
  const [addonInterestCount, setAddonInterestCount] = useState(0);
  const [showTenantDialog, setShowTenantDialog] = useState(false);
  const [showPaymentDialog, setShowPaymentDialog] = useState(false);
  const [editingTenant, setEditingTenant] = useState<Tenant | null>(null);
  const [editingPayment, setEditingPayment] = useState<PaymentSetting | null>(null);
  const [searchTenant, setSearchTenant] = useState("");
  const [filterPlano, setFilterPlano] = useState("all");
  const [showUsersModal, setShowUsersModal] = useState(false);
  const [showClientsModal, setShowClientsModal] = useState(false);
  const [showInactiveModal, setShowInactiveModal] = useState(false);

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
  const [t3dImport, setT3dImport] = useState(false);

  const fetchAddonInterestCount = async () => {
    const { count } = await supabase
      .from("support_tickets")
      .select("*", { count: "exact", head: true })
      .eq("tipo", "addon_interesse")
      .eq("status", "aberto");
    setAddonInterestCount(count || 0);
  };

  const fetchTenantStats = async (tenantIds: string[]) => {
    if (tenantIds.length === 0) return;
    const stats: TenantStats = {};
    tenantIds.forEach(id => { stats[id] = { usuarios: 0, clientes: 0, simulacoes: 0 }; });

    // Try RPC first for admin bypass, fallback to direct queries
    const { data: rpcStats } = await supabase.rpc("admin_tenant_stats" as any, { tenant_ids: tenantIds });
    if (rpcStats && Array.isArray(rpcStats) && rpcStats.length > 0) {
      rpcStats.forEach((r: any) => {
        if (stats[r.tenant_id]) {
          stats[r.tenant_id].usuarios = r.usuarios_count || 0;
          stats[r.tenant_id].clientes = r.clientes_count || 0;
          stats[r.tenant_id].simulacoes = r.simulacoes_count || 0;
        }
      });
    } else {
      // Fallback: query each table individually
      const [usersRes, clientsRes, simsRes] = await Promise.all([
        supabase.from("usuarios").select("tenant_id").in("tenant_id", tenantIds).eq("ativo", true),
        supabase.from("clients").select("tenant_id").in("tenant_id", tenantIds),
        supabase.from("simulations").select("tenant_id").in("tenant_id", tenantIds).gte("created_at", new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString()),
      ]);
      (usersRes.data || []).forEach((u: any) => { if (stats[u.tenant_id]) stats[u.tenant_id].usuarios++; });
      (clientsRes.data || []).forEach((c: any) => { if (stats[c.tenant_id]) stats[c.tenant_id].clientes++; });
      (simsRes.data || []).forEach((s: any) => { if (stats[s.tenant_id]) stats[s.tenant_id].simulacoes++; });
    }
    setTenantStats(stats);
  };

  const [dealRoomCommissions, setDealRoomCommissions] = useState(0);

  const fetchDealRoomCommissions = async () => {
    const { data } = await supabase
      .from("dealroom_proposals" as any)
      .select("commission_value, status")
      .eq("status", "paid");
    if (data && data.length > 0) {
      const total = data.reduce((sum: number, r: any) => sum + (Number(r.commission_value) || 0), 0);
      setDealRoomCommissions(total);
    } else {
      // Fallback: try payroll_commissions with deal_room reference
      const { data: commData } = await supabase
        .from("payroll_commissions" as any)
        .select("valor_comissao")
        .ilike("observacao", "%deal%room%");
      const total = (commData || []).reduce((sum: number, r: any) => sum + (Number(r.valor_comissao) || 0), 0);
      setDealRoomCommissions(total);
    }
  };

  const fetchData = async () => {
    setLoading(true);
    const [tenantsRes, paymentsRes, plansRes] = await Promise.all([
      supabase.rpc("admin_list_all_tenants" as any),
      supabase.from("payment_settings").select("*").order("created_at", { ascending: false }),
      supabase.from("subscription_plans" as any).select("slug, preco_mensal, preco_anual_mensal").eq("ativo", true),
    ]);

    // Fallback: if RPC fails (e.g. no admin auth session), query tenants directly
    let tenantData = (tenantsRes.data || []) as any[];
    if (tenantsRes.error || tenantData.length === 0) {
      console.warn("[Admin] RPC failed, falling back to direct tenants query:", tenantsRes.error?.message);
      const { data: directTenants } = await supabase
        .from("tenants")
        .select("*")
        .order("created_at", { ascending: false });
      tenantData = (directTenants || []) as any[];
    }

    setTenants(tenantData);
    if (paymentsRes.data) setPayments(paymentsRes.data as any);
    if (plansRes.data) {
      const prices: PlanPriceMap = {};
      (plansRes.data as any[]).forEach(p => {
        prices[p.slug] = { mensal: p.preco_mensal, anual: p.preco_anual_mensal * 12 };
      });
      setPlanPrices(prices);
    }
    // Fetch stats for all tenants
    if (tenantData.length > 0) {
      await fetchTenantStats(tenantData.map((t: any) => t.id));
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchData();
    fetchAddonInterestCount();
    fetchDealRoomCommissions();

    const channel = supabase
      .channel("admin-addon-interest")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "support_tickets", filter: "tipo=eq.addon_interesse" },
        (payload) => {
          const ticket = payload.new as any;
          toast.info("🔔 Novo interesse em add-on!", {
            description: `${ticket.usuario_nome} demonstrou interesse. Telefone: ${ticket.usuario_telefone || "N/A"}`,
            duration: 10000,
          });
          setAddonInterestCount((prev) => prev + 1);
        }
      ).subscribe();

    return () => { supabase.removeChannel(channel); };
  }, []);

  const toggleTenantActive = async (tenant: Tenant) => {
    const newAtivo = !tenant.ativo;
    const { error } = await supabase.from("tenants").update({ ativo: newAtivo } as any).eq("id", tenant.id);
    if (error) { toast.error("Erro ao atualizar status"); return; }
    logAudit({
      acao: newAtivo ? "tenant_ativado" : "tenant_desativado",
      entidade: "tenant", entidade_id: tenant.id,
      usuario_nome: adminName, tenant_id: tenant.id,
      detalhes: { loja: tenant.nome_loja },
    });
    toast.success(`${tenant.nome_loja} ${newAtivo ? "ativada" : "desativada"}`);
    fetchData();
  };

  // Filtered tenants
  const filteredTenants = tenants.filter(t => {
    const matchSearch = !searchTenant || t.nome_loja.toLowerCase().includes(searchTenant.toLowerCase()) || (t.codigo_loja || "").includes(searchTenant);
    const matchPlano = filterPlano === "all" || t.plano === filterPlano;
    return matchSearch && matchPlano;
  });

  // Stats
  const totalLojas = tenants.length;
  const lojasAtivas = tenants.filter(t => t.ativo).length;
  const lojasInativas = tenants.filter(t => !t.ativo).length;
  const lojasBasico = tenants.filter(t => t.plano === "basico").length;
  const lojasPremium = tenants.filter(t => t.plano === "premium").length;
  const lojasTrial = tenants.filter(t => t.plano === "trial").length;
  const totalUsuarios = Object.values(tenantStats).reduce((acc, s) => acc + s.usuarios, 0);
  const totalClientes = Object.values(tenantStats).reduce((acc, s) => acc + s.clientes, 0);

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
    setT3dImport(false);
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
    setT3dImport(vip.smart_import_3d || false);
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
      recursos_vip: { ocultar_indicador: tOcultarIndicador, deal_room: tDealRoom, vendazap: tVendaZap, smart_import_3d: t3dImport },
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
    const loja = tenants.find(t => t.id === id);
    const lojaLabel = loja ? `${loja.codigo_loja || ""} - ${loja.nome_fantasia || "Sem nome"}` : id;
    if (!confirm(`Tem certeza que deseja EXCLUIR PERMANENTEMENTE a loja "${lojaLabel}" e TODOS os dados associados?\n\nEsta ação NÃO pode ser desfeita.`)) return;
    
    // Try RPC first for admin bypass (SECURITY DEFINER — full cascade delete)
    const { error: rpcError } = await supabase.rpc("admin_delete_tenant" as any, { target_tenant_id: id });
    if (!rpcError) {
      toast.success(`Loja "${lojaLabel}" excluída permanentemente`);
      logAudit({
        acao: "tenant_excluido",
        entidade: "tenant",
        entidade_id: id,
        usuario_nome: adminName,
        detalhes: { loja_id: id, loja_nome: lojaLabel },
      });
      setTenants(prev => prev.filter(t => t.id !== id));
      return;
    }
    
    console.error("RPC admin_delete_tenant falhou:", rpcError);
    
    // Fallback: direct delete
    const { error } = await supabase.from("tenants").delete().eq("id", id);
    if (error) {
      console.error("Erro ao excluir loja:", error);
      toast.error("Erro ao excluir. Execute a RPC admin_delete_tenant no Supabase SQL Editor.");
      return;
    }
    toast.success(`Loja "${lojaLabel}" excluída com sucesso`);
    setTenants(prev => prev.filter(t => t.id !== id));
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
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 xl:grid-cols-11 gap-3">
          <Card>
            <CardContent className="p-3 flex items-center gap-2">
              <Store className="h-4 w-4 text-primary shrink-0" />
              <div>
                <p className="text-[10px] text-muted-foreground">Total Lojas</p>
                <p className="text-base font-bold text-foreground">{totalLojas}</p>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-3 flex items-center gap-2">
              <Eye className="h-4 w-4 text-accent shrink-0" />
              <div>
                <p className="text-[10px] text-muted-foreground">Ativas</p>
                <p className="text-base font-bold text-foreground">{lojasAtivas}</p>
              </div>
            </CardContent>
          </Card>
          <Card className="cursor-pointer hover:shadow-md transition-shadow" onClick={() => setShowInactiveModal(true)}>
            <CardContent className="p-3 flex items-center gap-2">
              <XCircle className="h-4 w-4 text-destructive shrink-0" />
              <div>
                <p className="text-[10px] text-muted-foreground">Inativas</p>
                <p className="text-base font-bold text-foreground">{lojasInativas}</p>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-3 flex items-center gap-2">
              <Zap className="h-4 w-4 text-muted-foreground shrink-0" />
              <div>
                <p className="text-[10px] text-muted-foreground">Trial</p>
                <p className="text-base font-bold text-foreground">{lojasTrial}</p>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-3 flex items-center gap-2">
              <Crown className="h-4 w-4 text-destructive shrink-0" />
              <div>
                <p className="text-[10px] text-muted-foreground">Premium</p>
                <p className="text-base font-bold text-foreground">{lojasPremium}</p>
              </div>
            </CardContent>
          </Card>
          <Card className="cursor-pointer hover:shadow-md transition-shadow" onClick={() => setShowUsersModal(true)}>
            <CardContent className="p-3 flex items-center gap-2">
              <Users className="h-4 w-4 text-primary shrink-0" />
              <div>
                <p className="text-[10px] text-muted-foreground">Usuários</p>
                <p className="text-base font-bold text-foreground">{totalUsuarios}</p>
              </div>
            </CardContent>
          </Card>
          <Card className="cursor-pointer hover:shadow-md transition-shadow" onClick={() => setShowClientsModal(true)}>
            <CardContent className="p-3 flex items-center gap-2">
              <Users className="h-4 w-4 text-accent shrink-0" />
              <div>
                <p className="text-[10px] text-muted-foreground">Clientes</p>
                <p className="text-base font-bold text-foreground">{totalClientes}</p>
              </div>
            </CardContent>
          </Card>
          <AdminContractsValueCard tenants={tenants} />
          <Card>
            <CardContent className="p-3 flex items-center gap-2">
              <DollarSign className="h-4 w-4 text-accent shrink-0" />
              <div>
                <p className="text-[10px] text-muted-foreground">Receita Mensal</p>
                <p className="text-base font-bold text-foreground">R$ {receitaMensal.toFixed(2)}</p>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-3 flex items-center gap-2">
              <Handshake className="h-4 w-4 text-purple-600 shrink-0" />
              <div>
                <p className="text-[10px] text-muted-foreground">Comissões Deal Room</p>
                <p className="text-base font-bold text-foreground">
                  R$ {dealRoomCommissions.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
                </p>
              </div>
            </CardContent>
          </Card>
        </div>

        <Tabs defaultValue="lojas" className="space-y-4">
          <ScrollArea className="w-full">
            <TabsList className="inline-flex w-max gap-1 p-1">
              <TabsTrigger value="lojas" className="gap-2 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground"><Store className="h-4 w-4" />Lojas</TabsTrigger>
              <TabsTrigger value="dealroom" className="gap-2 data-[state=active]:bg-[hsl(270,60%,50%)] data-[state=active]:text-white"><Handshake className="h-4 w-4" />Deal Room</TabsTrigger>
              <TabsTrigger value="suporte" className="gap-2 relative data-[state=active]:bg-[hsl(200,80%,45%)] data-[state=active]:text-white">
                <MessageSquare className="h-4 w-4" />Suporte
                {addonInterestCount > 0 && (
                  <Badge variant="destructive" className="ml-1 h-5 min-w-[20px] px-1 text-[10px] rounded-full">
                    {addonInterestCount}
                  </Badge>
                )}
              </TabsTrigger>
              <TabsTrigger value="pagamentos" className="gap-2 data-[state=active]:bg-[hsl(150,60%,40%)] data-[state=active]:text-white"><CreditCard className="h-4 w-4" />Pagamentos</TabsTrigger>
              <TabsTrigger value="planos" className="gap-2 data-[state=active]:bg-[hsl(340,70%,50%)] data-[state=active]:text-white"><BarChart3 className="h-4 w-4" />Planos</TabsTrigger>
              <TabsTrigger value="landing" className="gap-2 data-[state=active]:bg-[hsl(30,80%,50%)] data-[state=active]:text-white"><Globe className="h-4 w-4" />Landing Page</TabsTrigger>
              <TabsTrigger value="vendazap" className="gap-2 data-[state=active]:bg-[hsl(120,50%,40%)] data-[state=active]:text-white"><Bot className="h-4 w-4" />VendaZap AI</TabsTrigger>
              <TabsTrigger value="whatsapp" className="gap-2 data-[state=active]:bg-[hsl(142,70%,40%)] data-[state=active]:text-white"><MessageSquare className="h-4 w-4" />WhatsApp</TabsTrigger>
              <TabsTrigger value="resend" className="gap-2 data-[state=active]:bg-[hsl(220,70%,50%)] data-[state=active]:text-white"><Mail className="h-4 w-4" />Resend</TabsTrigger>
              <TabsTrigger value="diagnostics" className="gap-2 data-[state=active]:bg-[hsl(280,60%,50%)] data-[state=active]:text-white"><Activity className="h-4 w-4" />Diagnóstico Login</TabsTrigger>
              <TabsTrigger value="canva" className="gap-2 data-[state=active]:bg-[hsl(180,60%,40%)] data-[state=active]:text-white"><Palette className="h-4 w-4" />Canva</TabsTrigger>
              <TabsTrigger value="affiliates" className="gap-2 data-[state=active]:bg-[hsl(45,80%,45%)] data-[state=active]:text-white"><Gift className="h-4 w-4" />Afiliados</TabsTrigger>
              <TabsTrigger value="tutorials" className="gap-2 data-[state=active]:bg-[hsl(0,60%,50%)] data-[state=active]:text-white"><Film className="h-4 w-4" />Tutoriais</TabsTrigger>
            </TabsList>
            <ScrollBar orientation="horizontal" />
          </ScrollArea>



          {/* TAB: Lojas */}
          <TabsContent value="lojas" className="space-y-4">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <h3 className="text-lg font-semibold text-foreground">Lojas Cadastradas ({filteredTenants.length})</h3>
              <div className="flex gap-2 flex-wrap">
                <Input placeholder="Buscar loja..." value={searchTenant} onChange={e => setSearchTenant(e.target.value)} className="w-48 h-8 text-sm" />
                <Select value={filterPlano} onValueChange={setFilterPlano}>
                  <SelectTrigger className="w-32 h-8 text-sm"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todos</SelectItem>
                    <SelectItem value="trial">Trial</SelectItem>
                    <SelectItem value="basico">Básico</SelectItem>
                    <SelectItem value="premium">Premium</SelectItem>
                  </SelectContent>
                </Select>
                <Button variant="outline" size="sm" onClick={fetchData} className="gap-2 h-8">
                  <RefreshCw className="h-3 w-3" /> Atualizar
                </Button>
                <Button size="sm" onClick={openNewTenant} className="gap-2 h-8">
                  <Plus className="h-3 w-3" /> Nova Loja
                </Button>
              </div>
            </div>
            <Card>
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Ativa</TableHead>
                      <TableHead>Loja</TableHead>
                      <TableHead>Código</TableHead>
                      <TableHead>Plano</TableHead>
                      <TableHead className="text-center">Usuários</TableHead>
                      <TableHead className="text-center">Clientes</TableHead>
                      <TableHead className="text-center">Sims/Mês</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Validade</TableHead>
                      <TableHead className="text-center">Add-ons</TableHead>
                      <TableHead className="w-20">Ações</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {loading ? (
                      <TableRow><TableCell colSpan={11} className="text-center text-muted-foreground py-8">Carregando...</TableCell></TableRow>
                    ) : filteredTenants.length === 0 ? (
                      <TableRow><TableCell colSpan={11} className="text-center text-muted-foreground py-8">Nenhuma loja encontrada</TableCell></TableRow>
                    ) : filteredTenants.map((t) => {
                      const status = getPlanStatus(t);
                      const planCfg = PLAN_CONFIG[t.plano as keyof typeof PLAN_CONFIG] || PLAN_CONFIG.trial;
                      const PlanIcon = planCfg.icon;
                      const validadeDate = t.plano === "trial" ? t.trial_fim : t.assinatura_fim;
                      const vip = (t as any).recursos_vip || {};
                      return (
                        <TableRow key={t.id} className={!t.ativo ? "opacity-50" : ""}>
                          <TableCell>
                            <Switch checked={t.ativo} onCheckedChange={() => toggleTenantActive(t)} />
                          </TableCell>
                          <TableCell>
                            <div>
                              <p className="font-medium text-foreground">{t.nome_loja}</p>
                              {t.email_contato && <p className="text-xs text-muted-foreground">{t.email_contato}</p>}
                            </div>
                          </TableCell>
                          <TableCell className="text-muted-foreground font-mono text-xs">{t.codigo_loja || "—"}</TableCell>
                          <TableCell>
                            <Badge variant={planCfg.color} className="gap-1">
                              <PlanIcon className="h-3 w-3" />{planCfg.label}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-center text-sm">{tenantStats[t.id]?.usuarios ?? 0}</TableCell>
                          <TableCell className="text-center text-sm">{tenantStats[t.id]?.clientes ?? 0}</TableCell>
                          <TableCell className="text-center text-sm">{tenantStats[t.id]?.simulacoes ?? 0}</TableCell>
                          <TableCell>
                            <Badge variant={status.variant}>{status.text}</Badge>
                          </TableCell>
                          <TableCell className="text-muted-foreground">
                            {validadeDate ? format(new Date(validadeDate), "dd/MM/yyyy", { locale: ptBR }) : "—"}
                          </TableCell>
                          <TableCell>
                            <div className="flex gap-1 justify-center">
                              <Button
                                variant={vip.vendazap ? "default" : "outline"}
                                size="sm"
                                className={`h-7 text-[10px] gap-1 px-2 ${vip.vendazap ? "bg-primary text-primary-foreground" : ""}`}
                                title={vip.vendazap ? "Clique para revogar VendaZap AI" : "Clique para liberar VendaZap AI"}
                                onClick={async () => {
                                  const newVip = { ...vip, vendazap: !vip.vendazap };
                                  await supabase.from("tenants").update({ recursos_vip: newVip } as any).eq("id", t.id);
                                  logAudit({
                                    acao: !vip.vendazap ? "addon_liberado" : "addon_revogado",
                                    entidade: "tenant",
                                    entidade_id: t.id,
                                    usuario_nome: adminName,
                                    tenant_id: t.id,
                                    detalhes: { addon: "vendazap_ai", loja: t.nome_loja },
                                  });
                                  toast.success(`VendaZap AI ${!vip.vendazap ? "liberado" : "revogado"} para ${t.nome_loja}`);
                                  fetchData();
                                }}
                              >
                                <Bot className="h-3 w-3" />VZ
                              </Button>
                              <Button
                                variant={vip.deal_room ? "default" : "outline"}
                                size="sm"
                                className={`h-7 text-[10px] gap-1 px-2 ${vip.deal_room ? "bg-primary text-primary-foreground" : ""}`}
                                title={vip.deal_room ? "Clique para revogar Deal Room" : "Clique para liberar Deal Room"}
                                onClick={async () => {
                                  const newVip = { ...vip, deal_room: !vip.deal_room };
                                  await supabase.from("tenants").update({ recursos_vip: newVip } as any).eq("id", t.id);
                                  logAudit({
                                    acao: !vip.deal_room ? "addon_liberado" : "addon_revogado",
                                    entidade: "tenant",
                                    entidade_id: t.id,
                                    usuario_nome: adminName,
                                    tenant_id: t.id,
                                    detalhes: { addon: "deal_room", loja: t.nome_loja },
                                  });
                                  toast.success(`Deal Room ${!vip.deal_room ? "liberado" : "revogado"} para ${t.nome_loja}`);
                                  fetchData();
                                }}
                              >
                                <Handshake className="h-3 w-3" />DR
                              </Button>
                              <Button
                                variant={vip.smart_import_3d ? "default" : "outline"}
                                size="sm"
                                className={`h-7 text-[10px] gap-1 px-2 ${vip.smart_import_3d ? "bg-primary text-primary-foreground" : ""}`}
                                title={vip.smart_import_3d ? "Clique para revogar 3D Smart Import" : "Clique para liberar 3D Smart Import"}
                                onClick={async () => {
                                  const newVip = { ...vip, smart_import_3d: !vip.smart_import_3d };
                                  await supabase.from("tenants").update({ recursos_vip: newVip } as any).eq("id", t.id);
                                  logAudit({
                                    acao: !vip.smart_import_3d ? "addon_liberado" : "addon_revogado",
                                    entidade: "tenant",
                                    entidade_id: t.id,
                                    usuario_nome: adminName,
                                    tenant_id: t.id,
                                    detalhes: { addon: "smart_import_3d", loja: t.nome_loja },
                                  });
                                  toast.success(`3D Smart Import ${!vip.smart_import_3d ? "liberado" : "revogado"} para ${t.nome_loja}`);
                                  fetchData();
                                }}
                              >
                                <Box className="h-3 w-3" />3D
                              </Button>
                            </div>
                          </TableCell>
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

          {/* TAB: Canva */}
          <TabsContent value="canva">
            <AdminCanvaConfig />
          </TabsContent>

          {/* TAB: Afiliados */}
          <TabsContent value="affiliates">
            <AdminAffiliates />
          </TabsContent>

          {/* TAB: Tutoriais */}
          <TabsContent value="tutorials">
            <AdminTutorials />
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
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Box className="h-4 w-4 text-muted-foreground" />
                  <div>
                    <p className="text-sm font-medium text-foreground">3D Smart Import</p>
                    <p className="text-xs text-muted-foreground">Importação 3D, orçamento inteligente e biblioteca de módulos</p>
                  </div>
                </div>
                <Switch checked={t3dImport} onCheckedChange={setT3dImport} />
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

      {/* Drill-down Modals */}
      <AdminUsersModal open={showUsersModal} onOpenChange={setShowUsersModal} tenants={tenants} />
      <AdminClientsModal open={showClientsModal} onOpenChange={setShowClientsModal} tenants={tenants} />
      <AdminInactiveStoresModal open={showInactiveModal} onOpenChange={setShowInactiveModal} tenants={tenants} />
    </div>
  );
}
