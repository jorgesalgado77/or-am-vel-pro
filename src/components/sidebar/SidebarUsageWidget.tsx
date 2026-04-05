/**
 * SidebarUsageWidget — compact usage meters for the app sidebar
 */
import { useState, useEffect, useCallback } from "react";
import { Progress } from "@/components/ui/progress";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Zap, MessageSquare, Mail, BarChart3 } from "lucide-react";
import { useTenant } from "@/contexts/TenantContext";
import { checkUsageLimit, type UsageFeature } from "@/services/billing/UsageTracker";
import { BillingDashboard } from "@/components/billing/BillingDashboard";

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
  const [showDetails, setShowDetails] = useState(false);

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
    setMeters(results.filter((r) => r.limit > 0));
  }, [tenantId]);

  useEffect(() => {
    refresh();
    const interval = setInterval(refresh, 5 * 60 * 1000);
    return () => clearInterval(interval);
  }, [refresh]);

  if (meters.length === 0) return null;

  const getColor = (percent: number) => {
    if (percent >= 100) return "bg-destructive";
    if (percent >= 80) return "bg-amber-500";
    return "bg-primary";
  };

  if (collapsed) {
    return (
      <div className="px-2 py-2 space-y-2">
        {meters.map((m) => (
          <Tooltip key={m.feature}>
            <TooltipTrigger asChild>
              <div className="flex justify-center">
                <div className={`h-2 w-2 rounded-full ${getColor(m.percent)}`} />
              </div>
            </TooltipTrigger>
            <TooltipContent side="right" className="text-xs">
              {m.label}: {m.used}/{m.limit} ({Math.round(m.percent)}%)
            </TooltipContent>
          </Tooltip>
        ))}
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              onClick={() => setShowDetails(true)}
              className="flex justify-center w-full mt-1"
            >
              <BarChart3 className="h-3 w-3 text-sidebar-foreground/50 hover:text-primary transition-colors" />
            </button>
          </TooltipTrigger>
          <TooltipContent side="right" className="text-xs">Ver detalhes de consumo</TooltipContent>
        </Tooltip>

        <Dialog open={showDetails} onOpenChange={setShowDetails}>
          <DialogContent className="max-w-4xl max-h-[85vh] overflow-y-auto">
            <DialogTitle className="sr-only">Detalhes de Consumo</DialogTitle>
            <BillingDashboard />
          </DialogContent>
        </Dialog>
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

      <Button
        variant="ghost"
        size="sm"
        onClick={() => setShowDetails(true)}
        className="w-full h-6 text-[10px] text-sidebar-foreground/50 hover:text-primary mt-1"
      >
        <BarChart3 className="h-3 w-3 mr-1" />
        Ver detalhes
      </Button>

      <Dialog open={showDetails} onOpenChange={setShowDetails}>
        <DialogContent className="max-w-4xl max-h-[85vh] overflow-y-auto">
          <DialogTitle className="sr-only">Detalhes de Consumo</DialogTitle>
          <BillingDashboard />
        </DialogContent>
      </Dialog>
    </div>
  );
}
