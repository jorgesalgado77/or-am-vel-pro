import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Building2, CreditCard, FileText, Users, Shield, FileSignature, MessageSquare, ClipboardList, ScrollText, Mail, Palette, TrendingUp, UserCheck } from "lucide-react";
import { CompanySettingsTab } from "@/components/settings/CompanySettingsTab";
import { CargosTab } from "@/components/settings/CargosTab";
import { UsuariosTab } from "@/components/settings/UsuariosTab";
import { DescontosTab } from "@/components/settings/DescontosTab";
import { ComissaoPolicyTab } from "@/components/settings/ComissaoPolicyTab";
import { IndicadoresTab } from "@/components/settings/IndicadoresTab";
import { BoletoRatesTab } from "@/components/settings/BoletoRatesTab";
import { CreditoRatesTab } from "@/components/settings/CreditoRatesTab";
import { ContratosTab } from "@/components/settings/ContratosTab";
import { WhatsAppTab } from "@/components/settings/WhatsAppTab";
import { ResendTab } from "@/components/settings/ResendTab";
import { AcompanhamentoTab } from "@/components/settings/AcompanhamentoTab";
import { AuditLogsTab } from "@/components/settings/AuditLogsTab";
import { CanvaIntegrationTab } from "@/components/settings/CanvaIntegrationTab";

export function SettingsPanel() {
  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <Tabs defaultValue="company" className="space-y-6">
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
        </TabsList>
        <TabsContent value="company"><CompanySettingsTab /></TabsContent>
        <TabsContent value="cargos"><CargosTab /></TabsContent>
        <TabsContent value="usuarios"><UsuariosTab /></TabsContent>
        <TabsContent value="descontos"><DescontosTab /></TabsContent>
        <TabsContent value="comissoes"><ComissaoPolicyTab /></TabsContent>
        <TabsContent value="indicadores"><IndicadoresTab /></TabsContent>
        <TabsContent value="boleto"><BoletoRatesTab /></TabsContent>
        <TabsContent value="credito"><CreditoRatesTab /></TabsContent>
        <TabsContent value="contratos"><ContratosTab /></TabsContent>
        <TabsContent value="whatsapp"><WhatsAppTab /></TabsContent>
        <TabsContent value="resend"><ResendTab /></TabsContent>
        <TabsContent value="acompanhamento"><AcompanhamentoTab /></TabsContent>
        <TabsContent value="auditoria"><AuditLogsTab /></TabsContent>
        <TabsContent value="canva"><CanvaIntegrationTab /></TabsContent>
      </Tabs>
    </div>
  );
}
