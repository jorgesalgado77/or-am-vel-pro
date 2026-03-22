/**
 * Financial Module — Financial panel, payroll, rates, commissions
 */

// Components
export { FinancialPanel } from "@/components/FinancialPanel";
export { PayrollReport } from "@/components/PayrollReport";

// Sub-components
export { BoletoRatesTab } from "@/components/settings/BoletoRatesTab";
export { CreditoRatesTab } from "@/components/settings/CreditoRatesTab";

// Hooks
export { useFinancialData } from "@/hooks/useFinancialData";
export { useFinancingRates } from "@/hooks/useFinancingRates";
export { useComissaoPolicy } from "@/hooks/useComissaoPolicy";

// Services
export { generateSaleCommissions } from "@/services/commissionService";
export * from "@/services/financialService";
export { parseFinancingExcel } from "@/services/fileImportService";
