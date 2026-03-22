/**
 * Shared Module — Common utilities, UI components, and cross-cutting concerns
 */

// UI (re-export all shadcn components)
export * from "@/components/ui/button";
export * from "@/components/ui/card";
export * from "@/components/ui/input";
export * from "@/components/ui/label";
export * from "@/components/ui/badge";
export * from "@/components/ui/dialog";
export * from "@/components/ui/select";
export * from "@/components/ui/separator";
export * from "@/components/ui/tabs";
export * from "@/components/ui/table";
export * from "@/components/ui/toast";
export * from "@/components/ui/tooltip";

// Shared components
export { AppSidebar } from "@/components/AppSidebar";
export { Dashboard } from "@/components/Dashboard";
export { PlanBanner } from "@/components/PlanBanner";
export { SubscriptionPlans } from "@/components/SubscriptionPlans";
export { SupportDialog } from "@/components/SupportDialog";

// Utils
export { cn } from "@/lib/utils";
export { formatCurrency, formatPercent } from "@/lib/financing";
export { maskCpfCnpj, maskPhone } from "@/lib/masks";
export { validateFileUpload } from "@/lib/validation";
export { getDateRange } from "@/lib/dateFilterUtils";

// Hooks
export { useTheme } from "@/hooks/useTheme";
export { usePersistedFormState } from "@/hooks/usePersistedFormState";
export { useIsMobile } from "@/hooks/use-mobile";
