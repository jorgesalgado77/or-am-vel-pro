import { useState, useEffect } from "react";
import { AppSidebar } from "@/components/AppSidebar";
import { ClientsTable } from "@/components/ClientsTable";
import { ClientDrawer } from "@/components/ClientDrawer";
import { SimulatorPanel } from "@/components/SimulatorPanel";
import { SimulationHistory } from "@/components/SimulationHistory";
import { ClientContracts } from "@/components/ClientContracts";
import { SettingsPanel } from "@/components/SettingsPanel";
import { Dashboard } from "@/components/Dashboard";
import { ChangePasswordDialog } from "@/components/ChangePasswordDialog";
import Login from "@/pages/Login";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import type { Database } from "@/integrations/supabase/types";
import { CurrentUserContext, useCurrentUserLoader } from "@/hooks/useCurrentUser";

type Client = Database["public"]["Tables"]["clients"]["Row"];

export default function Index() {
  const userCtx = useCurrentUserLoader();
  const { currentUser, selectUser, logout } = userCtx;

  const [showChangePassword, setShowChangePassword] = useState(false);
  const [forcedPasswordChange, setForcedPasswordChange] = useState(false);

  const hasPermission = (perm: keyof import("@/hooks/useCargos").CargoPermissoes) => {
    if (!currentUser) return true;
    return currentUser.permissoes[perm];
  };

  const [activeView, setActiveView] = useState("dashboard");
  const [lastSims, setLastSims] = useState<Record<string, { valor_final: number; created_at: string }>>({});
  const [allSimulations, setAllSimulations] = useState<{ created_at: string; valor_final: number }[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [loading, setLoading] = useState(true);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editingClient, setEditingClient] = useState<Client | null>(null);
  const [simulatingClient, setSimulatingClient] = useState<Client | null>(null);
  const [historyClient, setHistoryClient] = useState<Client | null>(null);
  const [contractsClient, setContractsClient] = useState<Client | null>(null);
  const [saving, setSaving] = useState(false);

  const fetchClients = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("clients")
      .select("*")
      .order("created_at", { ascending: false });
    if (error) toast.error("Erro ao carregar clientes");
    else setClients(data || []);
    setLoading(false);
  };

  const fetchLastSims = async () => {
    const { data } = await supabase
      .from("simulations")
      .select("client_id, valor_final, created_at")
      .order("created_at", { ascending: false });
    if (!data) return;
    const map: Record<string, { valor_final: number; created_at: string }> = {};
    const allSims: { created_at: string; valor_final: number }[] = [];
    data.forEach((s) => {
      allSims.push({ created_at: s.created_at, valor_final: Number(s.valor_final) || 0 });
      if (!map[s.client_id]) {
        map[s.client_id] = { valor_final: Number(s.valor_final) || 0, created_at: s.created_at };
      }
    });
    setLastSims(map);
    setAllSimulations(allSims);
  };

  useEffect(() => { fetchClients(); fetchLastSims(); }, []);

  // Redirect to allowed view when user changes
  useEffect(() => {
    if (currentUser) {
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
  }, [currentUser]);

  const handleLogin = (userId: string, primeiroLogin: boolean) => {
    selectUser(userId);
    if (primeiroLogin) {
      setForcedPasswordChange(true);
      setShowChangePassword(true);
    }
  };

  const handlePasswordChanged = () => {
    setShowChangePassword(false);
    setForcedPasswordChange(false);
  };

  const generateOrcamentoNumber = async (): Promise<{ numero_orcamento: string; numero_orcamento_seq: number }> => {
    const { data: maxData } = await supabase
      .from("clients")
      .select("numero_orcamento_seq")
      .order("numero_orcamento_seq", { ascending: false })
      .limit(1)
      .single() as any;

    let nextSeq: number;
    if (!maxData?.numero_orcamento_seq) {
      const { data: settingsData } = await supabase.from("company_settings").select("orcamento_numero_inicial").limit(1).single() as any;
      nextSeq = settingsData?.orcamento_numero_inicial || 1;
    } else {
      nextSeq = (maxData.numero_orcamento_seq as number) + 1;
    }

    const padded = String(nextSeq).padStart(9, "0");
    const formatted = `${padded.slice(0, 3)}.${padded.slice(3, 6)}.${padded.slice(6, 9)}`;
    return { numero_orcamento: formatted, numero_orcamento_seq: nextSeq };
  };

  const handleSaveClient = async (data: Record<string, unknown>) => {
    setSaving(true);
    if (editingClient) {
      const { error } = await supabase.from("clients").update(data).eq("id", editingClient.id);
      if (error) toast.error("Erro ao atualizar cliente");
      else toast.success("Cliente atualizado!");
    } else {
      const orcamento = await generateOrcamentoNumber();
      const insertData = { ...data, ...orcamento } as any;
      const { error } = await supabase.from("clients").insert(insertData);
      if (error) toast.error("Erro ao criar cliente");
      else toast.success("Cliente criado!");
    }
    setSaving(false);
    setDrawerOpen(false);
    setEditingClient(null);
    fetchClients();
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Tem certeza que deseja excluir este cliente?")) return;
    const { error } = await supabase.from("clients").delete().eq("id", id);
    if (error) toast.error("Erro ao excluir cliente");
    else { toast.success("Cliente excluído"); fetchClients(); }
  };

  const handleEdit = (client: Client) => { setEditingClient(client); setDrawerOpen(true); };
  const handleAdd = () => { setEditingClient(null); setDrawerOpen(true); };
  const handleSimulate = (client: Client) => { setSimulatingClient(client); setHistoryClient(null); setContractsClient(null); setActiveView("simulator"); };
  const handleHistory = (client: Client) => { setHistoryClient(client); setSimulatingClient(null); setContractsClient(null); setActiveView("history"); };
  const handleContracts = (client: Client) => { setContractsClient(client); setSimulatingClient(null); setHistoryClient(null); setActiveView("contracts"); };
  const handleViewChange = (v: string) => { setActiveView(v); setSimulatingClient(null); setHistoryClient(null); setContractsClient(null); };

  const currentTitle = activeView === "dashboard" ? "Dashboard"
    : activeView === "clients" ? "Clientes"
    : activeView === "history" ? "Histórico de Simulações"
    : activeView === "settings" ? "Configurações"
    : "Simulador de Financiamento";

  const currentSubtitle = activeView === "dashboard" ? "Visão geral do sistema"
    : activeView === "clients" ? `${clients.length} clientes cadastrados`
    : activeView === "history" ? "Compare diferentes cenários de financiamento"
    : activeView === "settings" ? "Gerencie empresa, financeiras e operadoras"
    : "Calcule descontos e condições de pagamento";

  // Show login if no user is logged in
  if (!currentUser && !userCtx.loading) {
    return <Login onLogin={handleLogin} />;
  }

  // Loading state
  if (userCtx.loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <p className="text-muted-foreground">Carregando...</p>
      </div>
    );
  }

  return (
    <CurrentUserContext.Provider value={{ currentUser, selectUser, logout, hasPermission }}>
      <div className="flex min-h-screen bg-background">
        <AppSidebar
          activeView={activeView}
          onViewChange={handleViewChange}
          onChangePassword={() => { setForcedPasswordChange(false); setShowChangePassword(true); }}
        />

        <main className="flex-1 ml-60 p-6">
          <div className="mb-6">
            <h2 className="text-xl font-semibold text-foreground">{currentTitle}</h2>
            <p className="text-sm text-muted-foreground mt-1">{currentSubtitle}</p>
          </div>

          {activeView === "dashboard" && (
            <Dashboard clients={clients} lastSims={lastSims} allSimulations={allSimulations} />
          )}

          {activeView === "clients" && (
            <ClientsTable clients={clients} loading={loading} onEdit={handleEdit} onDelete={handleDelete} onAdd={handleAdd} onSimulate={handleSimulate} onHistory={handleHistory} />
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

          {activeView === "settings" && <SettingsPanel />}

          <ClientDrawer open={drawerOpen} onClose={() => { setDrawerOpen(false); setEditingClient(null); }} onSave={handleSaveClient} client={editingClient} saving={saving} />
        </main>

        {currentUser && (
          <ChangePasswordDialog
            open={showChangePassword}
            userId={currentUser.id}
            forced={forcedPasswordChange}
            onClose={handlePasswordChanged}
          />
        )}
      </div>
    </CurrentUserContext.Provider>
  );
}
