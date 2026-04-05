/**
 * Usage-aware wrapper — tracks feature usage and shows alert toasts
 * at 80% and 100% thresholds.
 */
import { trackUsage, checkUsageLimit, type UsageFeature } from "@/services/billing/UsageTracker";
import { toast } from "sonner";
import { addNotification } from "@/services/billing/UsageNotificationStore";

const FEATURE_LABELS: Record<UsageFeature, string> = {
  ia_interactions: "Interações IA",
  whatsapp_messages: "Mensagens WhatsApp",
  email_sends: "Envios de Email",
  pdf_generation: "Geração de PDF",
  proposal_generation: "Propostas",
  smart_import: "Smart Import 3D",
};

// Prevent spamming: track which alerts were shown this session
const alertsShown = new Set<string>();

function showUsageAlert(feature: UsageFeature, percentUsed: number, isExceeded: boolean) {
  const label = FEATURE_LABELS[feature] || feature;
  const key100 = `${feature}-100`;
  const key80 = `${feature}-80`;

  if (isExceeded && !alertsShown.has(key100)) {
    alertsShown.add(key100);
    const message = `⚠️ Limite de ${label} excedido!`;
    const description = "O uso adicional será cobrado como excedente. Considere fazer upgrade do plano.";
    toast.error(message, { description, duration: 8000 });
    addNotification({ feature, type: "exceeded", percentUsed, message, description });
  } else if (percentUsed >= 80 && !isExceeded && !alertsShown.has(key80)) {
    alertsShown.add(key80);
    const message = `${label}: ${Math.round(percentUsed)}% do limite utilizado`;
    const description = "Você está próximo do limite do seu plano.";
    toast.warning(message, { description, duration: 6000 });
    addNotification({ feature, type: "warning", percentUsed, message, description });
  }
}

/**
 * Track usage and show alerts. Returns true if usage is allowed.
 */
export async function trackAndAlert(params: {
  tenant_id: string;
  user_id: string;
  feature: UsageFeature;
  quantity?: number;
  metadata?: Record<string, unknown>;
}): Promise<boolean> {
  try {
    const { allowed, usage } = await trackUsage(params);
    if (usage) {
      showUsageAlert(params.feature, usage.percent_used, usage.is_exceeded);
    }
    return allowed;
  } catch (err) {
    console.warn("[UsageAlert] tracking error:", err);
    return true; // fail-open
  }
}

/**
 * Check-only (no tracking). Used for pre-flight checks.
 */
export async function checkAndAlert(
  tenant_id: string,
  feature: UsageFeature,
): Promise<boolean> {
  try {
    const usage = await checkUsageLimit(tenant_id, feature);
    if (usage) {
      showUsageAlert(feature, usage.percent_used, usage.is_exceeded);
      return !usage.is_exceeded;
    }
    return true;
  } catch {
    return true;
  }
}
