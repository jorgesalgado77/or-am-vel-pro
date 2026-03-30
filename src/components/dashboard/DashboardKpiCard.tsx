import { memo } from "react";
import { Card, CardContent } from "@/components/ui/card";

interface KpiCardProps {
  icon: React.ElementType;
  label: string;
  value: string;
  accent?: boolean;
  destructive?: boolean;
  success?: boolean;
}

export const KpiCard = memo(function KpiCard({ icon: Icon, label, value, accent, destructive, success }: KpiCardProps) {
  return (
    <Card className={destructive ? "border-destructive/30" : success ? "border-emerald-500/30" : ""}>
      <CardContent className="p-4 flex items-center gap-3">
        <div className={`p-2 rounded-lg ${
          destructive ? "bg-destructive/10" : 
          success ? "bg-emerald-500/10" : 
          accent ? "bg-primary/10" : "bg-secondary"
        }`}>
          <Icon className={`h-5 w-5 ${
            destructive ? "text-destructive" : 
            success ? "text-emerald-600" : 
            accent ? "text-primary" : "text-muted-foreground"
          }`} />
        </div>
        <div>
          <p className="text-xs text-muted-foreground">{label}</p>
          <p className={`text-lg font-bold ${destructive ? "text-destructive" : "text-foreground"}`}>{value}</p>
        </div>
      </CardContent>
    </Card>
  );
});
