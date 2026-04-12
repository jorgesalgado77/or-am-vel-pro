import { memo } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

export type KpiColorVariant = "blue" | "cyan" | "violet" | "amber" | "emerald" | "rose" | "orange" | "teal" | "slate" | "indigo";

const COLOR_VARIANTS: Record<KpiColorVariant, { bg: string; icon: string; border: string; cardBg: string }> = {
  blue:    { bg: "bg-blue-500/10 dark:bg-blue-500/15",    icon: "text-blue-600 dark:text-blue-400",    border: "border-blue-500/25 dark:border-blue-400/20",    cardBg: "bg-blue-50/50 dark:bg-blue-950/20" },
  cyan:    { bg: "bg-cyan-500/10 dark:bg-cyan-500/15",    icon: "text-cyan-600 dark:text-cyan-400",    border: "border-cyan-500/25 dark:border-cyan-400/20",    cardBg: "bg-cyan-50/50 dark:bg-cyan-950/20" },
  violet:  { bg: "bg-violet-500/10 dark:bg-violet-500/15",icon: "text-violet-600 dark:text-violet-400",border: "border-violet-500/25 dark:border-violet-400/20",cardBg: "bg-violet-50/50 dark:bg-violet-950/20" },
  amber:   { bg: "bg-amber-500/10 dark:bg-amber-500/15",  icon: "text-amber-600 dark:text-amber-400",  border: "border-amber-500/25 dark:border-amber-400/20",  cardBg: "bg-amber-50/50 dark:bg-amber-950/20" },
  emerald: { bg: "bg-emerald-500/10 dark:bg-emerald-500/15",icon: "text-emerald-600 dark:text-emerald-400",border: "border-emerald-500/25 dark:border-emerald-400/20",cardBg: "bg-emerald-50/50 dark:bg-emerald-950/20" },
  rose:    { bg: "bg-rose-500/10 dark:bg-rose-500/15",    icon: "text-rose-600 dark:text-rose-400",    border: "border-rose-500/25 dark:border-rose-400/20",    cardBg: "bg-rose-50/50 dark:bg-rose-950/20" },
  orange:  { bg: "bg-orange-500/10 dark:bg-orange-500/15",icon: "text-orange-600 dark:text-orange-400",border: "border-orange-500/25 dark:border-orange-400/20",cardBg: "bg-orange-50/50 dark:bg-orange-950/20" },
  teal:    { bg: "bg-teal-500/10 dark:bg-teal-500/15",    icon: "text-teal-600 dark:text-teal-400",    border: "border-teal-500/25 dark:border-teal-400/20",    cardBg: "bg-teal-50/50 dark:bg-teal-950/20" },
  slate:   { bg: "bg-slate-500/10 dark:bg-slate-500/15",  icon: "text-slate-600 dark:text-slate-400",  border: "border-slate-500/25 dark:border-slate-400/20",  cardBg: "bg-slate-50/50 dark:bg-slate-950/20" },
  indigo:  { bg: "bg-indigo-500/10 dark:bg-indigo-500/15",icon: "text-indigo-600 dark:text-indigo-400",border: "border-indigo-500/25 dark:border-indigo-400/20",cardBg: "bg-indigo-50/50 dark:bg-indigo-950/20" },
};

interface KpiCardProps {
  icon: React.ElementType;
  label: string;
  value: string;
  accent?: boolean;
  destructive?: boolean;
  success?: boolean;
  tooltip?: string;
  colorVariant?: KpiColorVariant;
}

export const KpiCard = memo(function KpiCard({ icon: Icon, label, value, accent, destructive, success, tooltip, colorVariant }: KpiCardProps) {
  const variant = colorVariant ? COLOR_VARIANTS[colorVariant] : null;

  const borderClass = destructive ? "border-destructive/30" 
    : success ? "border-emerald-500/30" 
    : variant ? variant.border 
    : "";

  const iconBgClass = destructive ? "bg-destructive/10" 
    : success ? "bg-emerald-500/10" 
    : variant ? variant.bg 
    : accent ? "bg-primary/10" 
    : "bg-secondary";

  const iconColorClass = destructive ? "text-destructive" 
    : success ? "text-emerald-600" 
    : variant ? variant.icon 
    : accent ? "text-primary" 
    : "text-muted-foreground";

  const card = (
    <Card className={borderClass}>
      <CardContent className="p-4 flex items-center gap-3">
        <div className={`p-2 rounded-lg ${iconBgClass}`}>
          <Icon className={`h-5 w-5 ${iconColorClass}`} />
        </div>
        <div>
          <p className="text-xs text-muted-foreground">{label}</p>
          <p className={`text-lg font-bold ${destructive ? "text-destructive" : "text-foreground"}`}>{value}</p>
        </div>
      </CardContent>
    </Card>
  );

  if (!tooltip) return card;

  return (
    <TooltipProvider delayDuration={300}>
      <Tooltip>
        <TooltipTrigger asChild>{card}</TooltipTrigger>
        <TooltipContent side="bottom" className="max-w-[220px] text-xs">
          <p>{tooltip}</p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
});
