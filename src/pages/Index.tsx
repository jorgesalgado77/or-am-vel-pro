import { useState, useEffect, useMemo } from "react";
import { AppSidebar } from "@/components/AppSidebar";
import { ClientsKanban } from "@/components/ClientsKanban";
import { ClientDrawer } from "@/components/ClientDrawer";
import { SimulatorPanel } from "@/components/SimulatorPanel";
import { SimulationHistory } from "@/components/SimulationHistory";
import { ClientContracts } from "@/components/ClientContracts";
import { SettingsPanel } from "@/components/SettingsPanel";
import { PayrollReport } from "@/components/PayrollReport";
import { Dashboard } from "@/components/Dashboard";
import { ChangePasswordDialog } from "@/components/ChangePasswordDialog";
import { SupportDialog } from "@/components/SupportDialog";
import { MessagesPanel } from "@/components/MessagesPanel";
import { PlanBanner } from "@/components/PlanBanner";
import { SubscriptionPlans } from "@/components/SubscriptionPlans";
import { VendaZapPanel } from "@/components/VendaZapPanel";
import { DealRoomStoreWidget } from "@/components/DealRoomStoreWidget";
import { DealRoomView } from "@/components/DealRoomView";
import Login from "@/pages/Login";
import { CurrentUserContext } from "@/hooks/useCurrentUser";
import { useTenantPlan, TenantPlanContext } from "@/hooks/useTenantPlan";
import { useRealtimeMessages } from "@/hooks/useRealtimeMessages";
import { useClientManager } from "@/hooks/useClientManager";
import { useCompanySettings } from "@/hooks/useCompanySettings";
import { useOnlinePresence } from "@/hooks/useOnlinePresence";
import { useAuth } from "@/contexts/AuthContext";
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
};

export default function Index() {
  const { user: authUser, loading: authLoading, hasPermission, logout } = useAuth();
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

  const { onlineUsers } = useOnlinePresence(authUser?.id ?? null, presenceInfo);

  const [showChangePassword, setShowChangePassword] = useState(false);
  const [showSupport, setShowSupport] = useState(false);
  const { unreadCount: unreadMessages } = useRealtimeMessages();

  const [activeView, setActiveView] = useState("dashboard");
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editingClient, setEditingClient] = useState<Client | null>(null);
  const [simulatingClient, setSimulatingClient] = useState<Client | null>(null);
  const [historyClient, setHistoryClient] = useState<Client | null>(null);
  const [contractsClient, setContractsClient] = useState<Client | null>(null);

  const {
    clients, loading, lastSims, allSimulations, saving,
    fetchClients, handleSaveClient, handleDeleteClient,
  } = useClientManager();

  // Redirect to allowed view
  useEffect(() => {
    if (authUser) {
      if (activeView === "clients" && !hasPermission("clientes")) {
        if (hasPermission("simulador")) setActiveView("simulator");
        else if (hasPermission("configuracoes")) setActiveView("settings");
      }
      if (activeView === "simulator" && !hasPermission("simulador")) {
        if (hasPermission("clientes")) setActiveView("clients");
        else if (hasPermission("configuracoes")) setActiveView("settings");
      }
      if (activeView === "settings" && !hasPermission("configuracoes")) {
        if (hasPermission("clientes")) setActiveView("clients");
        else if (hasPermission("simulador")) setActiveView("simulator");
      }
    }
  }, [authUser]);

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
  const currentTitle = activeView === "dashboard" ? `${storeName} - Dashboard` : viewMeta.title;
  const currentSubtitle = activeView === "clients" ? `${clients.length} clientes cadastrados` : viewMeta.subtitle;

  // Show login if no auth session
  if (!authUser && !authLoading) {
    return <Login />;
  }

  if (authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <p className="text-muted-foreground">Carregando...</p>
      </div>
    );
  }

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
          <AppSidebar
            activeView={activeView}
            onViewChange={handleViewChange}
            onChangePassword={() => setShowChangePassword(true)}
            onSupport={() => setShowSupport(true)}
            unreadMessages={unreadMessages}
            onlineUsers={onlineUsers}
          />

          <main className="flex-1 ml-60 p-6">
            <PlanBanner />
            <div className="mb-6">
              <h2 className="text-xl font-semibold text-foreground">{currentTitle}</h2>
              <p className="text-sm text-muted-foreground mt-1">{currentSubtitle}</p>
            </div>

            {activeView === "dashboard" && (
              <Dashboard clients={clients} lastSims={lastSims} allSimulations={allSimulations} />
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

            {activeView === "vendazap" && (
              <VendaZapPanel
                tenantId={authUser?.tenant_id || null}
                onBack={() => setActiveView("clients")}
              />
            )}

            {activeView === "dealroom" && (
              <DealRoomView tenantId={authUser?.tenant_id || null} onBack={() => setActiveView("dashboard")} />
            )}

            <ClientDrawer open={drawerOpen} onClose={() => { setDrawerOpen(false); setEditingClient(null); }} onSave={onSaveClient} client={editingClient} saving={saving} />
          </main>

          {authUser && (
            <ChangePasswordDialog
              open={showChangePassword}
              userId={authUser.id}
              onClose={() => setShowChangePassword(false)}
            />
          )}
          <SupportDialog open={showSupport} onClose={() => setShowSupport(false)} />
        </div>
      </TenantPlanContext.Provider>
    </CurrentUserContext.Provider>
  );
}
