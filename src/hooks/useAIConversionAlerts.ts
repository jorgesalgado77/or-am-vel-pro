/**
 * useAIConversionAlerts — Monitors strategy conversion rates and
 * triggers toast notifications when a strategy falls below threshold.
 *
 * Runs once per session (per tenant) and checks every 30 minutes.
 */

import { useEffect, useRef } from "react";
import { getLearningEngine } from "@/services/ai/LearningEngine";
import { getResolvedTenantId } from "@/contexts/TenantContext";
import { toast } from "sonner";
import { sendPushIfEnabled } from "@/lib/pushHelper";
import type { StrategyConversion } from "@/services/ai/types";

const STRATEGY_LABELS: Record<string, string> = {
  urgencia: "Urgência",
  valor: "Valor Percebido",
  prova_social: "Prova Social",
  escassez: "Escassez",
  reciprocidade: "Reciprocidade",
  autoridade: "Autoridade",
  empatia: "Empatia",
  desconto: "Desconto",
  parcelamento: "Parcelamento",
  dealroom: "Deal Room",
  reativacao: "Reativação",
  consultiva: "Consultiva",
  outro: "Outro",
};

const MIN_EVENTS_THRESHOLD = 5;
const LOW_CONVERSION_THRESHOLD = 0.10; // 10%
const CHECK_INTERVAL_MS = 30 * 60 * 1000; // 30 min
const ALERT_STORAGE_KEY = "ai_conversion_alerts_last";

function getAlertedStrategies(): Record<string, number> {
  try {
    const stored = localStorage.getItem(ALERT_STORAGE_KEY);
    return stored ? JSON.parse(stored) : {};
  } catch {
    return {};
  }
}

function markAlerted(strategy: string): void {
  const current = getAlertedStrategies();
  current[strategy] = Date.now();
  localStorage.setItem(ALERT_STORAGE_KEY, JSON.stringify(current));
}

function wasRecentlyAlerted(strategy: string): boolean {
  const alerts = getAlertedStrategies();
  const last = alerts[strategy];
  if (!last) return false;
  return Date.now() - last < CHECK_INTERVAL_MS;
}

export function useAIConversionAlerts(userId: string | null) {
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (!userId) return;

    const checkConversions = async () => {
      try {
        const tenantId = await getResolvedTenantId();
        if (!tenantId) return;

        const engine = getLearningEngine(tenantId);
        const { strategies } = await engine.analyzePatterns();

        const lowConversion = strategies.filter(
          (s: StrategyConversion) =>
            s.total_events >= MIN_EVENTS_THRESHOLD &&
            s.conversion_rate < LOW_CONVERSION_THRESHOLD &&
            !wasRecentlyAlerted(s.strategy)
        );

        for (const strategy of lowConversion) {
          const label = STRATEGY_LABELS[strategy.strategy] || strategy.strategy;
          const rate = (strategy.conversion_rate * 100).toFixed(1);

          // Find best alternative
          const best = strategies.find(
            (s: StrategyConversion) =>
              s.strategy !== strategy.strategy &&
              s.conversion_rate > strategy.conversion_rate
          );

          const suggestion = best
            ? `Tente "${STRATEGY_LABELS[best.strategy] || best.strategy}" (${(best.conversion_rate * 100).toFixed(0)}% conversão).`
            : "Considere testar novas abordagens.";

          toast.warning(`⚠️ Estratégia "${label}" com baixa conversão`, {
            description: `Apenas ${rate}% de conversão em ${strategy.total_events} tentativas. ${suggestion}`,
            duration: 12000,
          });

          // Push notification
          void sendPushIfEnabled(
            "leads",
            userId,
            `IA: Estratégia "${label}" com baixa conversão`,
            `Apenas ${rate}% de conversão. ${suggestion}`,
            `ai-low-conversion-${strategy.strategy}`
          );

          markAlerted(strategy.strategy);
        }
      } catch (err) {
        console.error("[AIConversionAlerts] check error:", err);
      }
    };

    // Initial check after 10s
    const timeout = setTimeout(checkConversions, 10_000);

    // Periodic check
    intervalRef.current = setInterval(checkConversions, CHECK_INTERVAL_MS);

    return () => {
      clearTimeout(timeout);
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [userId]);
}
