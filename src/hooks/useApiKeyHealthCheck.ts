import { useEffect, useRef } from "react";
import { miaInvoke } from "@/services/mia/MIAInvoke";
import { useApiKeys } from "@/hooks/useApiKeys";
import { sendPushIfEnabled } from "@/lib/pushHelper";
import { toast } from "sonner";

const CHECK_INTERVAL_MS = 30 * 60 * 1000; // 30 minutes

export function useApiKeyHealthCheck(
  tenantId: string | null,
  userId: string | undefined
) {
  const { keys } = useApiKeys(tenantId);
  const lastCheck = useRef<number>(0);

  useEffect(() => {
    if (!tenantId || !userId || keys.length === 0) return;

    const now = Date.now();
    if (now - lastCheck.current < CHECK_INTERVAL_MS) return;

    lastCheck.current = now;

    const activeKeys = keys.filter((k) => k.is_active);
    if (activeKeys.length === 0) return;

    // Validate each active key in the background
    activeKeys.forEach(async (key) => {
      try {
        const { data } = await supabase.functions.invoke("onboarding-ai", {
          body: {
            action: "validate_api_key",
            tenant_id: tenantId,
            provider: key.provider,
            api_key: key.api_key,
            api_url: key.api_url || undefined,
          },
        });

        if (data && !data.valid) {
          const providerLabel = key.provider.toUpperCase();

          // Show in-app toast
          toast.error(`⚠️ API ${providerLabel} falhou na validação: ${data.error || "chave inválida"}`);

          // Send push notification
          await sendPushIfEnabled(
            "api_keys",
            userId,
            `⚠️ API ${providerLabel} com problema`,
            `Sua chave de API ${providerLabel} falhou na validação. Verifique em Configurações > APIs.`,
            `api-key-${key.provider}`
          );
        }
      } catch {
        // Silent fail - don't spam user on network errors
      }
    });
  }, [tenantId, userId, keys]);
}
