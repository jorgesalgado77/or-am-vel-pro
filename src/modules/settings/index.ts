/**
 * Settings Module — All settings panel tabs
 */

// SettingsPanel is lazy-loaded in Index.tsx — import directly from @/components/SettingsPanel
// export { SettingsPanel } from "@/components/SettingsPanel";
export { CompanySettingsTab } from "@/components/settings/CompanySettingsTab";
export { BoletoRatesTab } from "@/components/settings/BoletoRatesTab";
export { CreditoRatesTab } from "@/components/settings/CreditoRatesTab";
export { CargosTab } from "@/components/settings/CargosTab";
export { UsuariosTab } from "@/components/settings/UsuariosTab";
export { IndicadoresTab } from "@/components/settings/IndicadoresTab";
export { ContratosTab } from "@/components/settings/ContratosTab";
export { DescontosTab } from "@/components/settings/DescontosTab";
export { AcompanhamentoTab } from "@/components/settings/AcompanhamentoTab";
export { AuditLogsTab } from "@/components/settings/AuditLogsTab";
export { WhatsAppTab } from "@/components/settings/WhatsAppTab";
export { CanvaIntegrationTab } from "@/components/settings/CanvaIntegrationTab";
export { ResendTab } from "@/components/settings/ResendTab";
export { ComissaoPolicyTab } from "@/components/settings/ComissaoPolicyTab";
export { ComissoesIndicadores } from "@/components/settings/ComissoesIndicadores";
export { ApiKeysTab } from "@/components/settings/ApiKeysTab";

// Hooks
export { useCompanySettings } from "@/hooks/useCompanySettings";
export { useIndicadores } from "@/hooks/useIndicadores";
export { useApiKeys } from "@/hooks/useApiKeys";
export { useTenantOnboarding } from "@/hooks/useTenantOnboarding";
