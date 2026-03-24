import { useState } from "react";
import { useTenantPlanContext } from "@/hooks/useTenantPlan";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { AlertTriangle, Zap, Users, X, ArrowRight } from "lucide-react";

const PLAN_LABELS: Record<string, string> = {
  trial: "Teste Grátis",
  basico: "Básico",
  premium: "Premium",
};

interface PlanBannerProps {
  onNavigateToPlans?: () => void;
}

export function PlanBanner({ onNavigateToPlans }: PlanBannerProps) {
  const { plan } = useTenantPlanContext();
  const { user } = useAuth();
  const [dismissed, setDismissed] = useState(false);

  // Only show for administrators
  const isAdmin = user?.cargo_nome?.toLowerCase()?.includes("admin") || 
                  user?.cargo_nome?.toLowerCase()?.includes("administrador");
  if (!isAdmin) return null;

  if (dismissed) return null;

  // Don't show banner for premium with lots of days remaining
  if (plan.plano === "premium" && !plan.expirado && plan.dias_restantes > 30) return null;

  if (plan.expirado) {
    return (
      <Card
        className="border-destructive/50 bg-destructive/5 mb-4 cursor-pointer hover:shadow-md transition-shadow"
        onClick={onNavigateToPlans}
      >
        <CardContent className="py-3 flex items-center gap-3">
          <AlertTriangle className="h-5 w-5 text-destructive shrink-0" />
          <div className="flex-1">
            <p className="text-sm font-medium text-destructive">
              Seu plano {PLAN_LABELS[plan.plano] || plan.plano} expirou!
            </p>
            <p className="text-xs text-muted-foreground">
              Clique para escolher um plano e continuar usando o sistema.
            </p>
          </div>
          <ArrowRight className="h-4 w-4 text-destructive shrink-0" />
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6 shrink-0"
            onClick={(e) => { e.stopPropagation(); setDismissed(true); }}
          >
            <X className="h-4 w-4" />
          </Button>
        </CardContent>
      </Card>
    );
  }

  if (plan.plano === "trial") {
    return (
      <Card
        className="border-primary/30 bg-primary/5 mb-4 cursor-pointer hover:shadow-md transition-shadow"
        onClick={onNavigateToPlans}
      >
        <CardContent className="py-3 flex items-center gap-3">
          <Zap className="h-5 w-5 text-primary shrink-0" />
          <div className="flex-1">
            <p className="text-sm font-medium text-foreground">
              Período de teste: {plan.dias_restantes} dia{plan.dias_restantes !== 1 ? "s" : ""} restante{plan.dias_restantes !== 1 ? "s" : ""}
            </p>
            <p className="text-xs text-muted-foreground">
              Clique para escolher um plano e continuar usando o sistema.
            </p>
          </div>
          <ArrowRight className="h-4 w-4 text-primary shrink-0" />
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6 shrink-0"
            onClick={(e) => { e.stopPropagation(); setDismissed(true); }}
          >
            <X className="h-4 w-4" />
          </Button>
        </CardContent>
      </Card>
    );
  }

  if (plan.plano === "basico") {
    return (
      <Card
        className="border-border bg-muted/30 mb-4 cursor-pointer hover:shadow-md transition-shadow"
        onClick={onNavigateToPlans}
      >
        <CardContent className="py-3 flex items-center gap-3">
          <Users className="h-5 w-5 text-primary shrink-0" />
          <div className="flex-1">
            <p className="text-sm font-medium text-foreground">
              Plano Básico — Até 3 usuários
            </p>
            <p className="text-xs text-muted-foreground">
              Clique para fazer upgrade e desbloquear todas as funções.
            </p>
          </div>
          <Badge variant="secondary" className="shrink-0">Básico</Badge>
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6 shrink-0"
            onClick={(e) => { e.stopPropagation(); setDismissed(true); }}
          >
            <X className="h-4 w-4" />
          </Button>
        </CardContent>
      </Card>
    );
  }

  return null;
}
