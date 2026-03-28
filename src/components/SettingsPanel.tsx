import { lazy, Suspense, useState, useEffect } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Building2, CreditCard, FileText, Users, Shield, FileSignature, MessageSquare, ClipboardList, ScrollText, Mail, Palette, TrendingUp, UserCheck, FileQuestion, Lightbulb, Clock, Factory, KeyRound, BellRing, CalendarSync, ShieldCheck, Database } from "lucide-react";
import { useCurrentUser } from "@/hooks/useCurrentUser";

// Lazy load each tab to reduce initial chunk from 1.5MB
const CompanySettingsTab = lazy(() => import("@/components/settings/CompanySettingsTab").then(m => ({ default: m.CompanySettingsTab })));
const CargosTab = lazy(() => import("@/components/settings/CargosTab").then(m => ({ default: m.CargosTab })));
const UsuariosTab = lazy(() => import("@/components/settings/UsuariosTab").then(m => ({ default: m.UsuariosTab })));
const DescontosTab = lazy(() => import("@/components/settings/DescontosTab").then(m => ({ default: m.DescontosTab })));
const ComissaoPolicyTab = lazy(() => import("@/components/settings/ComissaoPolicyTab").then(m => ({ default: m.ComissaoPolicyTab })));
const IndicadoresTab = lazy(() => import("@/components/settings/IndicadoresTab").then(m => ({ default: m.IndicadoresTab })));
const BoletoRatesTab = lazy(() => import("@/components/settings/BoletoRatesTab").then(m => ({ default: m.BoletoRatesTab })));
const CreditoRatesTab = lazy(() => import("@/components/settings/CreditoRatesTab").then(m => ({ default: m.CreditoRatesTab })));
const ContratosTab = lazy(() => import("@/components/settings/ContratosTab").then(m => ({ default: m.ContratosTab })));
const WhatsAppTab = lazy(() => import("@/components/settings/WhatsAppTab").then(m => ({ default: m.WhatsAppTab })));
const ResendTab = lazy(() => import("@/components/settings/ResendTab").then(m => ({ default: m.ResendTab })));
const AcompanhamentoTab = lazy(() => import("@/components/settings/AcompanhamentoTab").then(m => ({ default: m.AcompanhamentoTab })));
const AuditLogsTab = lazy(() => import("@/components/settings/AuditLogsTab").then(m => ({ default: m.AuditLogsTab })));
const CanvaIntegrationTab = lazy(() => import("@/components/settings/CanvaIntegrationTab").then(m => ({ default: m.CanvaIntegrationTab })));
const BriefingTab = lazy(() => import("@/components/settings/BriefingTab").then(m => ({ default: m.BriefingTab })));
const ArgumentBankTab = lazy(() => import("@/components/settings/ArgumentBankTab").then(m => ({ default: m.ArgumentBankTab })));
const PrazosEntregaTab = lazy(() => import("@/components/settings/PrazosEntregaTab").then(m => ({ default: m.PrazosEntregaTab })));
const FornecedoresTab = lazy(() => import("@/components/settings/FornecedoresTab").then(m => ({ default: m.FornecedoresTab })));
const ApiKeysTab = lazy(() => import("@/components/settings/ApiKeysTab").then(m => ({ default: m.ApiKeysTab })));
const PushNotificationsTab = lazy(() => import("@/components/settings/PushNotificationsTab").then(m => ({ default: m.PushNotificationsTab })));
const GoogleCalendarTab = lazy(() => import("@/components/settings/GoogleCalendarTab").then(m => ({ default: m.GoogleCalendarTab })));
const SalesRulesTab = lazy(() => import("@/components/settings/SalesRulesTab").then(m => ({ default: m.SalesRulesTab })));
const BackupTab = lazy(() => import("@/components/settings/BackupTab").then(m => ({ default: m.BackupTab })));

const TabLoader = () => (
  <div className="flex items-center justify-center py-12">
    <div className="h-5 w-5 border-2 border-primary border-t-transparent rounded-full animate-spin" />
  </div>
);

export function SettingsPanel() {
  const [activeTab, setActiveTab] = useState("company");
  const { currentUser } = useCurrentUser();
  const isAdmin = currentUser?.cargo_nome?.toLowerCase() === "administrador";

  // Listen for navigate-to-settings events to auto-select subtab
  useEffect(() => {
    const handler = (e: Event) => {
      const subtab = (e as CustomEvent)?.detail?.subtab;
      if (subtab === "apis") setActiveTab("apikeys");
      else if (subtab) setActiveTab(subtab);
    };
    window.addEventListener("navigate-to-settings", handler);
    return () => window.removeEventListener("navigate-to-settings", handler);
  }, []);

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
        <TabsList className="flex-wrap h-auto gap-1">
          <TabsTrigger value="company" className="gap-2"><Building2 className="h-4 w-4" />Empresa</TabsTrigger>
          <TabsTrigger value="cargos" className="gap-2"><Shield className="h-4 w-4" />Cargos</TabsTrigger>
          <TabsTrigger value="usuarios" className="gap-2"><Users className="h-4 w-4" />Usuários</TabsTrigger>
          <TabsTrigger value="descontos" className="gap-2"><FileText className="h-4 w-4" />Descontos</TabsTrigger>
          <TabsTrigger value="comissoes" className="gap-2"><TrendingUp className="h-4 w-4" />Comissões</TabsTrigger>
          <TabsTrigger value="indicadores" className="gap-2"><UserCheck className="h-4 w-4" />Indicadores</TabsTrigger>
          <TabsTrigger value="boleto" className="gap-2"><FileText className="h-4 w-4" />Financeiras (Boleto)</TabsTrigger>
          <TabsTrigger value="credito" className="gap-2"><CreditCard className="h-4 w-4" />Operadoras (Crédito)</TabsTrigger>
          <TabsTrigger value="contratos" className="gap-2"><FileSignature className="h-4 w-4" />Contratos</TabsTrigger>
          <TabsTrigger value="whatsapp" className="gap-2"><MessageSquare className="h-4 w-4" />WhatsApp</TabsTrigger>
          <TabsTrigger value="resend" className="gap-2"><Mail className="h-4 w-4" />Resend</TabsTrigger>
          <TabsTrigger value="acompanhamento" className="gap-2"><ClipboardList className="h-4 w-4" />Acompanhamento</TabsTrigger>
          <TabsTrigger value="auditoria" className="gap-2"><ScrollText className="h-4 w-4" />Auditoria</TabsTrigger>
          <TabsTrigger value="canva" className="gap-2"><Palette className="h-4 w-4" />Canva</TabsTrigger>
          <TabsTrigger value="briefing" className="gap-2"><FileQuestion className="h-4 w-4" />Briefing</TabsTrigger>
          <TabsTrigger value="argumentos" className="gap-2"><Lightbulb className="h-4 w-4" />Argumentos</TabsTrigger>
          <TabsTrigger value="prazos" className="gap-2"><Clock className="h-4 w-4" />Prazos Entrega</TabsTrigger>
          <TabsTrigger value="fornecedores" className="gap-2"><Factory className="h-4 w-4" />Fornecedor Planejados</TabsTrigger>
          <TabsTrigger value="apikeys" className="gap-2"><KeyRound className="h-4 w-4" />APIs</TabsTrigger>
          <TabsTrigger value="push" className="gap-2"><BellRing className="h-4 w-4" />Push</TabsTrigger>
          <TabsTrigger value="google_calendar" className="gap-2"><CalendarSync className="h-4 w-4" />Google Agenda</TabsTrigger>
          <TabsTrigger value="sales_rules" className="gap-2"><ShieldCheck className="h-4 w-4" />Regras Comerciais</TabsTrigger>
          {isAdmin && <TabsTrigger value="backup" className="gap-2"><Database className="h-4 w-4" />Backup</TabsTrigger>}
        </TabsList>

        <Suspense fallback={<TabLoader />}>
          {activeTab === "company" && <TabsContent value="company" forceMount><CompanySettingsTab /></TabsContent>}
          {activeTab === "cargos" && <TabsContent value="cargos" forceMount><CargosTab /></TabsContent>}
          {activeTab === "usuarios" && <TabsContent value="usuarios" forceMount><UsuariosTab /></TabsContent>}
          {activeTab === "descontos" && <TabsContent value="descontos" forceMount><DescontosTab /></TabsContent>}
          {activeTab === "comissoes" && <TabsContent value="comissoes" forceMount><ComissaoPolicyTab /></TabsContent>}
          {activeTab === "indicadores" && <TabsContent value="indicadores" forceMount><IndicadoresTab /></TabsContent>}
          {activeTab === "boleto" && <TabsContent value="boleto" forceMount><BoletoRatesTab /></TabsContent>}
          {activeTab === "credito" && <TabsContent value="credito" forceMount><CreditoRatesTab /></TabsContent>}
          {activeTab === "contratos" && <TabsContent value="contratos" forceMount><ContratosTab /></TabsContent>}
          {activeTab === "whatsapp" && <TabsContent value="whatsapp" forceMount><WhatsAppTab /></TabsContent>}
          {activeTab === "resend" && <TabsContent value="resend" forceMount><ResendTab /></TabsContent>}
          {activeTab === "acompanhamento" && <TabsContent value="acompanhamento" forceMount><AcompanhamentoTab /></TabsContent>}
          {activeTab === "auditoria" && <TabsContent value="auditoria" forceMount><AuditLogsTab /></TabsContent>}
          {activeTab === "canva" && <TabsContent value="canva" forceMount><CanvaIntegrationTab /></TabsContent>}
          {activeTab === "briefing" && <TabsContent value="briefing" forceMount><BriefingTab /></TabsContent>}
          {activeTab === "argumentos" && <TabsContent value="argumentos" forceMount><ArgumentBankTab /></TabsContent>}
          {activeTab === "prazos" && <TabsContent value="prazos" forceMount><PrazosEntregaTab /></TabsContent>}
          {activeTab === "fornecedores" && <TabsContent value="fornecedores" forceMount><FornecedoresTab /></TabsContent>}
          {activeTab === "apikeys" && <TabsContent value="apikeys" forceMount><ApiKeysTab /></TabsContent>}
          {activeTab === "push" && <TabsContent value="push" forceMount><PushNotificationsTab /></TabsContent>}
          {activeTab === "google_calendar" && <TabsContent value="google_calendar" forceMount><GoogleCalendarTab /></TabsContent>}
          {activeTab === "sales_rules" && <TabsContent value="sales_rules" forceMount><SalesRulesTab /></TabsContent>}
          {activeTab === "backup" && isAdmin && <TabsContent value="backup" forceMount><BackupTab /></TabsContent>}
        </Suspense>
      </Tabs>
    </div>
  );
}
