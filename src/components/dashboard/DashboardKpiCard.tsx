import { memo } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

export type KpiColorVariant = "blue" | "cyan" | "violet" | "amber" | "emerald" | "rose" | "orange" | "teal" | "slate" | "indigo";

const COLOR_VARIANTS: Record<KpiColorVariant, { bg: string; icon: string; border: string; cardBg: string }> = {
  blue:    { bg: "bg-blue-500/15 dark:bg-blue-500/20",    icon: "text-blue-600 dark:text-blue-400",    border: "border-blue-500/40 dark:border-blue-400/30",    cardBg: "bg-blue-100/60 dark:bg-blue-950/40" },
  cyan:    { bg: "bg-cyan-500/15 dark:bg-cyan-500/20",    icon: "text-cyan-600 dark:text-cyan-400",    border: "border-cyan-500/40 dark:border-cyan-400/30",    cardBg: "bg-cyan-100/60 dark:bg-cyan-950/40" },
  violet:  { bg: "bg-violet-500/15 dark:bg-violet-500/20",icon: "text-violet-600 dark:text-violet-400",border: "border-violet-500/40 dark:border-violet-400/30",cardBg: "bg-violet-100/60 dark:bg-violet-950/40" },
  amber:   { bg: "bg-amber-500/15 dark:bg-amber-500/20",  icon: "text-amber-600 dark:text-amber-400",  border: "border-amber-500/40 dark:border-amber-400/30",  cardBg: "bg-amber-100/60 dark:bg-amber-950/40" },
  emerald: { bg: "bg-emerald-500/15 dark:bg-emerald-500/20",icon: "text-emerald-600 dark:text-emerald-400",border: "border-emerald-500/40 dark:border-emerald-400/30",cardBg: "bg-emerald-100/60 dark:bg-emerald-950/40" },
  rose:    { bg: "bg-rose-500/15 dark:bg-rose-500/20",    icon: "text-rose-600 dark:text-rose-400",    border: "border-rose-500/40 dark:border-rose-400/30",    cardBg: "bg-rose-100/60 dark:bg-rose-950/40" },
  orange:  { bg: "bg-orange-500/15 dark:bg-orange-500/20",icon: "text-orange-600 dark:text-orange-400",border: "border-orange-500/40 dark:border-orange-400/30",cardBg: "bg-orange-100/60 dark:bg-orange-950/40" },
  teal:    { bg: "bg-teal-500/15 dark:bg-teal-500/20",    icon: "text-teal-600 dark:text-teal-400",    border: "border-teal-500/40 dark:border-teal-400/30",    cardBg: "bg-teal-100/60 dark:bg-teal-950/40" },
  slate:   { bg: "bg-slate-500/15 dark:bg-slate-500/20",  icon: "text-slate-600 dark:text-slate-400",  border: "border-slate-500/40 dark:border-slate-400/30",  cardBg: "bg-slate-100/60 dark:bg-slate-950/40" },
  indigo:  { bg: "bg-indigo-500/15 dark:bg-indigo-500/20",icon: "text-indigo-600 dark:text-indigo-400",border: "border-indigo-500/40 dark:border-indigo-400/30",cardBg: "bg-indigo-100/60 dark:bg-indigo-950/40" },
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

  const borderClass = destructive ? "border-destructive/30 bg-destructive/5" 
    : success ? "border-emerald-500/30 bg-emerald-50/50 dark:bg-emerald-950/20" 
    : variant ? `${variant.border} ${variant.cardBg}` 
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
