/**
 * Sales Module — Kanban, clients, contracts, simulator, close sale
 * Re-exports for gradual migration to modular architecture.
 */

// Components
export { ClientsKanban } from "@/components/ClientsKanban";
export { ClientDrawer } from "@/components/ClientDrawer";
export { ClientContracts } from "@/components/ClientContracts";
export { ClientTrackingModal } from "@/components/ClientTrackingModal";
export { CloseSaleModal } from "@/components/CloseSaleModal";
export { ContractEditorDialog } from "@/components/ContractEditorDialog";
export { SimulatorPanel } from "@/components/SimulatorPanel";
export { SimulationHistory } from "@/components/SimulationHistory";
export { AIStrategyPanel } from "@/components/AIStrategyPanel";

// Sub-components
export { KanbanCard } from "@/components/kanban/KanbanCard";
export { KanbanFilters } from "@/components/kanban/KanbanFilters";
export { KanbanClientDialog } from "@/components/kanban/KanbanClientDialog";
export { SimulatorResultCard } from "@/components/simulator/SimulatorResultCard";
export { SimulatorClientForm } from "@/components/simulator/SimulatorClientForm";
export { SimulatorEnvironmentsTable } from "@/components/simulator/SimulatorEnvironmentsTable";

// Hooks
export { useClientManager } from "@/hooks/useClientManager";
export { useConversionHistory } from "@/hooks/useConversionHistory";
export { useFollowUp } from "@/hooks/useFollowUp";
export { useDiscountOptions } from "@/hooks/useDiscountOptions";

// Services
export * from "@/services/clientService";
export * from "@/services/contractService";
export * from "@/services/commissionService";

// Types
export type { Client, LastSimInfo, ClientsKanbanProps } from "@/components/kanban/kanbanTypes";
export { KANBAN_COLUMNS } from "@/components/kanban/kanbanTypes";

// Utils
export { calcLeadTemperature, TEMPERATURE_CONFIG } from "@/lib/leadTemperature";
export type { LeadTemperature } from "@/lib/leadTemperature";
export { calculateSimulation, formatCurrency } from "@/lib/financing";
export type { FormaPagamento, SimulationInput, BoletoRateData } from "@/lib/financing";
export { buildContractHtml } from "@/services/contractService";
export { generateSimulationPdf } from "@/lib/generatePdf";
