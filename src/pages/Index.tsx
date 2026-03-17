import { useState, useEffect } from "react";
import { AppSidebar } from "@/components/AppSidebar";
import { ClientsTable } from "@/components/ClientsTable";
import { ClientDrawer } from "@/components/ClientDrawer";
import { SimulatorPanel } from "@/components/SimulatorPanel";
import { SimulationHistory } from "@/components/SimulationHistory";
import { SettingsPanel } from "@/components/SettingsPanel";
import { UserSelector } from "@/components/UserSelector";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import type { Database } from "@/integrations/supabase/types";
import { CurrentUserContext, useCurrentUserLoader } from "@/hooks/useCurrentUser";

type Client = Database["public"]["Tables"]["clients"]["Row"];

export default function Index() {
  const userCtx = useCurrentUserLoader();
  const { currentUser, selectUser, logout } = userCtx;

  const hasPermission = (perm: keyof import("@/hooks/useCargos").CargoPermissoes) => {
    if (!currentUser) return true;
    return currentUser.permissoes[perm];
  };

  const [activeView, setActiveView] = useState("clients");
  const [clients, setClients] = useState<Client[]>([]);
  const [loading, setLoading] = useState(true);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editingClient, setEditingClient] = useState<Client | null>(null);
  const [simulatingClient, setSimulatingClient] = useState<Client | null>(null);
  const [historyClient, setHistoryClient] = useState<Client | null>(null);
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

  useEffect(() => { fetchClients(); }, []);

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

  const handleSaveClient = async (data: Record<string, unknown>) => {
    setSaving(true);
    if (editingClient) {
      const { error } = await supabase.from("clients").update(data).eq("id", editingClient.id);
      if (error) toast.error("Erro ao atualizar cliente");
      else toast.success("Cliente atualizado!");
    } else {
      const { error } = await supabase.from("clients").insert(data as Database["public"]["Tables"]["clients"]["Insert"]);
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
  const handleSimulate = (client: Client) => { setSimulatingClient(client); setHistoryClient(null); setActiveView("simulator"); };
  const handleHistory = (client: Client) => { setHistoryClient(client); setSimulatingClient(null); setActiveView("history"); };
  const handleViewChange = (v: string) => { setActiveView(v); setSimulatingClient(null); setHistoryClient(null); };

  const currentTitle = activeView === "clients" ? "Clientes"
    : activeView === "history" ? "Histórico de Simulações"
    : activeView === "settings" ? "Configurações"
    : "Simulador de Financiamento";

  const currentSubtitle = activeView === "clients" ? `${clients.length} clientes cadastrados`
    : activeView === "history" ? "Compare diferentes cenários de financiamento"
    : activeView === "settings" ? "Gerencie empresa, financeiras e operadoras"
    : "Calcule descontos e condições de pagamento";

  const showUserSelector = !currentUser && !userCtx.loading;

  return (
    <CurrentUserContext.Provider value={{ currentUser, selectUser, logout, hasPermission }}>
      <div className="flex min-h-screen bg-background">
        <AppSidebar activeView={activeView} onViewChange={handleViewChange} />

        <main className="flex-1 ml-60 p-6">
          <div className="mb-6">
            <h2 className="text-xl font-semibold text-foreground">{currentTitle}</h2>
            <p className="text-sm text-muted-foreground mt-1">{currentSubtitle}</p>
          </div>

          {activeView === "clients" && (
            <ClientsTable clients={clients} loading={loading} onEdit={handleEdit} onDelete={handleDelete} onAdd={handleAdd} onSimulate={handleSimulate} onHistory={handleHistory} />
          )}

          {activeView === "simulator" && (
            <SimulatorPanel client={simulatingClient} onBack={simulatingClient ? () => { setActiveView("clients"); setSimulatingClient(null); } : undefined} />
          )}

          {activeView === "history" && historyClient && (
            <SimulationHistory client={historyClient} onBack={() => { setActiveView("clients"); setHistoryClient(null); }} />
          )}

          {activeView === "settings" && <SettingsPanel />}

          <ClientDrawer open={drawerOpen} onClose={() => { setDrawerOpen(false); setEditingClient(null); }} onSave={handleSaveClient} client={editingClient} saving={saving} />
        </main>

        <UserSelector open={showUserSelector} onSelect={selectUser} />
      </div>
    </CurrentUserContext.Provider>
  );
}
