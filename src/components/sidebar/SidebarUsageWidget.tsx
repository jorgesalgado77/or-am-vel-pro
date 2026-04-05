/**
 * SidebarUsageWidget — compact usage meters for the app sidebar
 */
import { useState, useEffect, useCallback } from "react";
import { Progress } from "@/components/ui/progress";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Zap, MessageSquare, Mail } from "lucide-react";
import { useTenant } from "@/contexts/TenantContext";
import { checkUsageLimit, type UsageFeature } from "@/services/billing/UsageTracker";

interface FeatureMeter {
  feature: UsageFeature;
  label: string;
  shortLabel: string;
  icon: React.ElementType;
  used: number;
  limit: number;
  percent: number;
}

const TRACKED_FEATURES: Array<{
  feature: UsageFeature;
  label: string;
  shortLabel: string;
  icon: React.ElementType;
}> = [
  { feature: "ia_interactions", label: "Interações IA", shortLabel: "IA", icon: Zap },
  { feature: "whatsapp_messages", label: "WhatsApp", shortLabel: "WA", icon: MessageSquare },
  { feature: "email_sends", label: "Email", shortLabel: "Em", icon: Mail },
];

export function SidebarUsageWidget({ collapsed }: { collapsed: boolean }) {
  const { tenantId } = useTenant();
  const [meters, setMeters] = useState<FeatureMeter[]>([]);

  const refresh = useCallback(async () => {
    if (!tenantId) return;
    const results = await Promise.all(
      TRACKED_FEATURES.map(async (f) => {
        const usage = await checkUsageLimit(tenantId, f.feature);
        return {
          ...f,
          used: usage?.total_used ?? 0,
          limit: usage?.limit_value ?? 0,
          percent: usage?.percent_used ?? 0,
        };
      }),
    );
    // Only show features with limit > 0
    setMeters(results.filter((r) => r.limit > 0));
  }, [tenantId]);

  useEffect(() => {
    refresh();
    const interval = setInterval(refresh, 5 * 60 * 1000); // refresh every 5 min
    return () => clearInterval(interval);
  }, [refresh]);

  if (meters.length === 0) return null;

  const getColor = (percent: number) => {
    if (percent >= 100) return "bg-destructive";
    if (percent >= 80) return "bg-amber-500";
    return "bg-primary";
  };

  if (collapsed) {
    // Collapsed: show tiny dots
    return (
      <div className="px-2 py-2 space-y-2">
        {meters.map((m) => (
          <Tooltip key={m.feature}>
            <TooltipTrigger asChild>
              <div className="flex justify-center">
                <div
                  className={`h-2 w-2 rounded-full ${getColor(m.percent)}`}
                />
              </div>
            </TooltipTrigger>
            <TooltipContent side="right" className="text-xs">
              {m.label}: {m.used}/{m.limit} ({Math.round(m.percent)}%)
            </TooltipContent>
          </Tooltip>
        ))}
      </div>
    );
  }

  return (
    <div className="px-3 py-2 space-y-2">
      <p className="text-[10px] font-semibold uppercase tracking-wider text-sidebar-foreground/50">
        Consumo
      </p>
      {meters.map((m) => {
        const Icon = m.icon;
        const exceeded = m.percent >= 100;
        const warning = m.percent >= 80;

        return (
          <Tooltip key={m.feature}>
            <TooltipTrigger asChild>
              <div className="space-y-1">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5">
                    <Icon className="h-3 w-3 text-sidebar-foreground/60" />
                    <span className="text-[11px] text-sidebar-foreground/80">{m.shortLabel}</span>
                  </div>
                  <span className={`text-[10px] font-medium ${
                    exceeded ? "text-destructive" : warning ? "text-amber-500" : "text-sidebar-foreground/60"
                  }`}>
                    {m.used}/{m.limit}
                  </span>
                </div>
                <Progress
                  value={Math.min(100, m.percent)}
                  className="h-1"
                  style={{
                    ["--progress-color" as string]: exceeded
                      ? "hsl(var(--destructive))"
                      : warning
                        ? "hsl(30, 80%, 50%)"
                        : "hsl(var(--primary))",
                  }}
                />
              </div>
            </TooltipTrigger>
            <TooltipContent side="right" className="text-xs">
              {m.label}: {m.used} de {m.limit} ({Math.round(m.percent)}%)
              {exceeded && " — Limite excedido!"}
            </TooltipContent>
          </Tooltip>
        );
      })}
    </div>
  );
}
