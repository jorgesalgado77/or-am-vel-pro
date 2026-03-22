/**
 * Auth Module — Authentication, user management, tenant resolution
 */

// Context
export { AuthProvider, useAuth } from "@/contexts/AuthContext";
export { TenantProvider, useTenant } from "@/contexts/TenantContext";

// Components
export { ChangePasswordDialog } from "@/components/ChangePasswordDialog";
export { UserProfileModal } from "@/components/UserProfileModal";
export { OnboardingDialog } from "@/components/OnboardingDialog";
export { InactivityWarningDialog } from "@/components/InactivityWarningDialog";
export { ProfileCompletenessCard } from "@/components/ProfileCompletenessCard";
export { FirstAccessCredentialsCard } from "@/components/auth/FirstAccessCredentialsCard";

// Hooks
export { useCurrentUser } from "@/hooks/useCurrentUser";
export { useOnlinePresence } from "@/hooks/useOnlinePresence";
export { useTenantPlan } from "@/hooks/useTenantPlan";
export { useUsuarios } from "@/hooks/useUsuarios";
export { useCargos } from "@/hooks/useCargos";

// Services
export { logAudit, getAuditUserInfo } from "@/services/auditService";
export { logLoginDiagnostic } from "@/services/loginDiagnosticService";

// Utils
export { setTenantState, getTenantId, getUserId } from "@/lib/tenantState";
export * from "@/lib/authHelpers";
export { provisionNewStore, createUsuarioProfile, checkEmailExists } from "@/lib/accountProvisioning";
export { supabase } from "@/lib/supabaseClient";
