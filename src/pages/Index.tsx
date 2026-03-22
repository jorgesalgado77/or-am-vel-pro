import { useState, useEffect, useMemo, lazy, Suspense } from "react";
import { cn } from "@/lib/utils";
import { useIsMobile } from "@/hooks/use-mobile";
import { AppSidebar } from "@/components/AppSidebar";
import { PlanBanner } from "@/components/PlanBanner";
import Login from "@/pages/Login";

// Lazy load heavy view components via module paths
const Dashboard = lazy(() => import("@/components/Dashboard").then(m => ({ default: m.Dashboard })));
const ClientsKanban = lazy(() => import("@/components/ClientsKanban").then(m => ({ default: m.ClientsKanban })));
const ClientDrawer = lazy(() => import("@/components/ClientDrawer").then(m => ({ default: m.ClientDrawer })));
const SimulatorPanel = lazy(() => import("@/components/SimulatorPanel").then(m => ({ default: m.SimulatorPanel })));
const SimulationHistory = lazy(() => import("@/components/SimulationHistory").then(m => ({ default: m.SimulationHistory })));
const ClientContracts = lazy(() => import("@/components/ClientContracts").then(m => ({ default: m.ClientContracts })));
const SettingsPanel = lazy(() => import("@/components/SettingsPanel").then(m => ({ default: m.SettingsPanel })));
const PayrollReport = lazy(() => import("@/components/PayrollReport").then(m => ({ default: m.PayrollReport })));
const ChangePasswordDialog = lazy(() => import("@/components/ChangePasswordDialog").then(m => ({ default: m.ChangePasswordDialog })));
const SupportDialog = lazy(() => import("@/components/SupportDialog").then(m => ({ default: m.SupportDialog })));
const MessagesPanel = lazy(() => import("@/components/MessagesPanel").then(m => ({ default: m.MessagesPanel })));
const VendaZapChat = lazy(() => import("@/components/chat/VendaZapChat").then(m => ({ default: m.VendaZapChat })));
const SubscriptionPlans = lazy(() => import("@/components/SubscriptionPlans").then(m => ({ default: m.SubscriptionPlans })));
const VendaZapPanel = lazy(() => import("@/components/VendaZapPanel").then(m => ({ default: m.VendaZapPanel })));
const UserProfileModal = lazy(() => import("@/components/UserProfileModal").then(m => ({ default: m.UserProfileModal })));
const DealRoomView = lazy(() => import("@/components/DealRoomView").then(m => ({ default: m.DealRoomView })));
const FunnelPanel = lazy(() => import("@/components/FunnelPanel").then(m => ({ default: m.FunnelPanel })));
const CampaignLibrary = lazy(() => import("@/components/CampaignLibrary").then(m => ({ default: m.CampaignLibrary })));
const ReferralPanel = lazy(() => import("@/components/ReferralPanel").then(m => ({ default: m.ReferralPanel })));
const FinancialPanel = lazy(() => import("@/components/FinancialPanel").then(m => ({ default: m.FinancialPanel })));

import { CurrentUserContext } from "@/hooks/useCurrentUser";
import { useTenantPlan, TenantPlanContext } from "@/modules/auth";
import { useRealtimeMessages } from "@/modules/chat";
import { useClientManager } from "@/modules/sales";
import { useCompanySettings } from "@/modules/settings";
import { useOnlinePresence, useAuth } from "@/modules/auth";
import type { Database } from "@/integrations/supabase/types";

type Client = Database["public"]["Tables"]["clients"]["Row"];

const VIEW_TITLES: Record<string, { title: string; subtitle: string }> = {
  dashboard: { title: "Dashboard", subtitle: "Visão geral do sistema" },
  clients: { title: "Clientes", subtitle: "" },
  history: { title: "Histórico de Simulações", subtitle: "Compare diferentes cenários de financiamento" },
  contracts: { title: "Contratos do Cliente", subtitle: "Visualize e edite contratos gerados" },
  payroll: { title: "Folha de Pagamento", subtitle: "Relatório com dados de regime, salário e comissão" },
  settings: { title: "Configurações", subtitle: "Gerencie empresa, financeiras e operadoras" },
  messages: { title: "Mensagens", subtitle: "Comunicação com clientes" },
  plans: { title: "Planos de Assinatura", subtitle: "Gerencie seu plano e pagamentos" },
  simulator: { title: "Negociação e Simulação de Financiamentos", subtitle: "Calcule descontos e condições de pagamento" },
  vendazap: { title: "VendaZap AI", subtitle: "Assistente inteligente de vendas para WhatsApp" },
  dealroom: { title: "Deal Room", subtitle: "Sala de negociação com apresentação e pagamento integrado" },
  "vendazap-chat": { title: "Chat de Vendas", subtitle: "Converse com clientes com sugestões de IA em tempo real" },
  funnel: { title: "Funil de Captação", subtitle: "Sua máquina de captação de leads pronta para usar" },
  campaigns: { title: "Biblioteca de Campanhas", subtitle: "Anúncios prontos para copiar e ativar em minutos" },
  referrals: { title: "Programa de Indicações", subtitle: "Gere links, acompanhe indicações e recompense seus clientes" },
  financial: { title: "Módulo Financeiro", subtitle: "Contas a pagar, folha de pagamento e ponto de equilíbrio" },
};

export default function Index() {
  const { user: authUser, loading: authLoading, hasPermission, logout } = useAuth();
  const isMobile = useIsMobile();
  const tenantPlan = useTenantPlan();
  const { settings } = useCompanySettings();

  const presenceInfo = useMemo(() => {
    if (!authUser) return undefined;
    return {
      nome: authUser.apelido || authUser.nome_completo,
      cargo: authUser.cargo_nome,
      fotoUrl: authUser.foto_url,
    };
  }, [authUser?.id, authUser?.apelido, authUser?.nome_completo, authUser?.cargo_nome, authUser?.foto_url]);

  const isAdmin = authUser?.cargo_nome?.toUpperCase().includes("ADMIN") ?? false;
  const { onlineUsers } = useOnlinePresence(authUser?.id ?? null, presenceInfo);

  const [showChangePassword, setShowChangePassword] = useState(false);
  const [showSupport, setShowSupport] = useState(false);
  const [showProfile, setShowProfile] = useState(false);
  const { unreadCount: unreadMessages } = useRealtimeMessages();

  const [activeView, setActiveView] = useState("dashboard");
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => {
    if (typeof window !== "undefined" && window.innerWidth < 768) return true;
    const saved = localStorage.getItem("sidebar-collapsed");
    return saved === "true";
  });
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editingClient, setEditingClient] = useState<Client | null>(null);
  const [simulatingClient, setSimulatingClient] = useState<Client | null>(null);
  const [historyClient, setHistoryClient] = useState<Client | null>(null);
  const [contractsClient, setContractsClient] = useState<Client | null>(null);

  const {
    clients, loading, lastSims, allSimulations, saving,
    fetchClients, handleSaveClient, handleDeleteClient,
  } = useClientManager();

  useEffect(() => {
    if (authUser) {
      if (activeView === "clients" && !hasPermission("clientes")) {
        if (hasPermission("simulador")) setActiveView("simulator");
        else if (isAdmin && hasPermission("configuracoes")) setActiveView("settings");
      }
      if (activeView === "simulator" && !hasPermission("simulador")) {
        if (hasPermission("clientes")) setActiveView("clients");
        else if (isAdmin && hasPermission("configuracoes")) setActiveView("settings");
      }
      if (activeView === "settings" && (!hasPermission("configuracoes") || !isAdmin)) {
        if (hasPermission("clientes")) setActiveView("clients");
        else if (hasPermission("simulador")) setActiveView("simulator");
      }
    }
  }, [activeView, authUser, hasPermission, isAdmin]);

  const onSaveClient = async (data: Record<string, unknown>) => {
    handleSaveClient(data, editingClient, () => {
      setDrawerOpen(false);
      setEditingClient(null);
    });
  };

  const handleEdit = (client: Client) => { setEditingClient(client); setDrawerOpen(true); };
  const handleAdd = () => { setEditingClient(null); setDrawerOpen(true); };
  const handleSimulate = (client: Client) => { setSimulatingClient(client); setHistoryClient(null); setContractsClient(null); setActiveView("simulator"); };
  const handleHistory = (client: Client) => { setHistoryClient(client); setSimulatingClient(null); setContractsClient(null); setActiveView("history"); };
  const handleContracts = (client: Client) => { setContractsClient(client); setSimulatingClient(null); setHistoryClient(null); setActiveView("contracts"); };
  const handleViewChange = (v: string) => { setActiveView(v); setSimulatingClient(null); setHistoryClient(null); setContractsClient(null); };

  const viewMeta = VIEW_TITLES[activeView] || VIEW_TITLES.simulator;
  const storeName = settings.company_name || "OrçaMóvel PRO";
  const cargoLabel = authUser?.cargo_nome || "Usuário";
  const currentTitle = activeView === "dashboard" ? `${storeName} - Dashboard` : viewMeta.title;

  // Greeting based on time of day
  const now = new Date();
  const hour = now.getHours();
  const greeting = hour < 12 ? "Bom dia" : hour < 18 ? "Boa tarde" : "Boa noite";
  const firstName = (authUser?.apelido || authUser?.nome_completo || "").split(" ")[0];
  const weekday = now.toLocaleDateString("pt-BR", { weekday: "long" });
  const weekdayCapitalized = weekday.charAt(0).toUpperCase() + weekday.slice(1);
  const dateStr = now.toLocaleDateString("pt-BR", { day: "numeric", month: "long", year: "numeric" }) + " - " + weekdayCapitalized;

  const currentSubtitle = activeView === "dashboard"
    ? `${greeting}, ${firstName}! Hoje é ${dateStr}`
    : activeView === "clients"
      ? `${clients.length} clientes cadastrados`
      : viewMeta.subtitle;

  // Show login if no auth session
  if (!authUser && !authLoading) {
    return <Login />;
  }

  if (authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-3">
          <div className="h-8 w-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
          <p className="text-muted-foreground text-sm animate-pulse">Carregando sistema...</p>
        </div>
      </div>
    );
  }

  const ViewLoader = () => (
    <div className="flex items-center justify-center py-16">
      <div className="h-6 w-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
    </div>
  );

  // Bridge for legacy CurrentUserContext
  const currentUserCompat = authUser ? {
    id: authUser.id,
    nome_completo: authUser.nome_completo,
    apelido: authUser.apelido,
    cargo_id: authUser.cargo_id,
    foto_url: authUser.foto_url,
    cargo_nome: authUser.cargo_nome,
    telefone: authUser.telefone,
    email: authUser.email,
    permissoes: authUser.permissoes,
  } : null;

  return (
    <CurrentUserContext.Provider value={{
      currentUser: currentUserCompat,
      selectUser: async () => {},
      logout,
      hasPermission,
    }}>
      <TenantPlanContext.Provider value={tenantPlan}>
        <div className="flex min-h-screen bg-background">
          {/* Mobile overlay backdrop */}
          {isMobile && mobileMenuOpen && (
            <div
              className="fixed inset-0 bg-black/50 z-20 transition-opacity"
              onClick={() => setMobileMenuOpen(false)}
            />
          )}

          <AppSidebar
            activeView={activeView}
            onViewChange={(view) => {
              handleViewChange(view);
              if (isMobile) setMobileMenuOpen(false);
            }}
            onChangePassword={() => setShowChangePassword(true)}
            onSupport={() => setShowSupport(true)}
            onProfile={() => setShowProfile(true)}
            unreadMessages={unreadMessages}
            onlineUsers={onlineUsers}
            collapsed={isMobile ? !mobileMenuOpen : sidebarCollapsed}
            onToggleCollapse={() => {
              if (isMobile) {
                setMobileMenuOpen(prev => !prev);
              } else {
                setSidebarCollapsed(prev => {
                  const next = !prev;
                  localStorage.setItem("sidebar-collapsed", String(next));
                  return next;
                });
              }
            }}
          />

          <main className={cn(
            "flex-1 transition-all duration-300",
            isMobile ? "ml-[60px] p-3" : sidebarCollapsed ? "ml-[60px] p-6" : "ml-60 p-6"
          )}>
            <PlanBanner />
            <div className="mb-4 md:mb-6">
              <div className="flex items-center gap-2 md:gap-3 flex-wrap">
                <h2 className="text-base md:text-xl font-semibold text-foreground">{currentTitle}</h2>
                {settings.codigo_loja && (
                  <span className="text-[10px] md:text-xs font-medium bg-muted text-muted-foreground px-1.5 md:px-2 py-0.5 rounded-md font-mono tabular-nums">
                    Cód. {settings.codigo_loja}
                  </span>
                )}
                {activeView === "dashboard" && (
                  <span className="text-[10px] md:text-xs font-medium bg-primary/10 text-primary px-2 md:px-2.5 py-0.5 rounded-full">{cargoLabel}</span>
                )}
              </div>
              <p className="text-xs md:text-sm text-muted-foreground mt-1">{currentSubtitle}</p>
            </div>

            <Suspense fallback={<ViewLoader />}>
              {activeView === "dashboard" && (
                <Dashboard clients={clients} lastSims={lastSims} allSimulations={allSimulations} onOpenProfile={() => setShowProfile(true)} onOpenSettings={() => handleViewChange("settings")} />
              )}

              {activeView === "clients" && (
                <ClientsKanban clients={clients} loading={loading} onEdit={handleEdit} onDelete={handleDeleteClient} onAdd={handleAdd} onSimulate={handleSimulate} onHistory={handleHistory} onContracts={handleContracts} />
              )}

              {activeView === "simulator" && (
                <SimulatorPanel
                  client={simulatingClient}
                  onBack={simulatingClient ? () => { setActiveView("clients"); setSimulatingClient(null); } : undefined}
                  onClientCreated={fetchClients}
                />
              )}

              {activeView === "history" && historyClient && (
                <SimulationHistory client={historyClient} onBack={() => { setActiveView("clients"); setHistoryClient(null); }} />
              )}

              {activeView === "contracts" && contractsClient && (
                <ClientContracts client={contractsClient} onBack={() => { setActiveView("clients"); setContractsClient(null); }} />
              )}

              {activeView === "payroll" && (
                <PayrollReport onBack={() => setActiveView("dashboard")} />
              )}

              {activeView === "settings" && <SettingsPanel />}

              {activeView === "plans" && (
                <SubscriptionPlans onBack={() => setActiveView("dashboard")} />
              )}

              {activeView === "messages" && <MessagesPanel />}

              {activeView === "vendazap-chat" && (
                <VendaZapChat
                  tenantId={authUser?.tenant_id || null}
                  userId={authUser?.id}
                  onDealRoom={(clientName, contractId) => {
                    setActiveView("dealroom");
                  }}
                />
              )}

              {activeView === "vendazap" && (
                <VendaZapPanel
                  tenantId={authUser?.tenant_id || null}
                  onBack={() => setActiveView("clients")}
                />
              )}

              {activeView === "dealroom" && (
                <DealRoomView tenantId={authUser?.tenant_id || null} onBack={() => setActiveView("dashboard")} />
              )}

              {activeView === "funnel" && <FunnelPanel />}
              {activeView === "campaigns" && <CampaignLibrary />}
              {activeView === "referrals" && <ReferralPanel />}
              {activeView === "financial" && <FinancialPanel />}

              <ClientDrawer open={drawerOpen} onClose={() => { setDrawerOpen(false); setEditingClient(null); }} onSave={onSaveClient} client={editingClient} saving={saving} />
            </Suspense>
          </main>

          <Suspense fallback={null}>
            {authUser && (
              <ChangePasswordDialog
                open={showChangePassword}
                userId={authUser.id}
                onClose={() => setShowChangePassword(false)}
              />
            )}
            <SupportDialog open={showSupport} onClose={() => setShowSupport(false)} />
            <UserProfileModal open={showProfile} onClose={() => setShowProfile(false)} />
          </Suspense>
        </div>
      </TenantPlanContext.Provider>
    </CurrentUserContext.Provider>
  );
}
