import { useTenantPlanContext } from "@/hooks/useTenantPlan";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { AlertTriangle, Zap, Crown, Users } from "lucide-react";
import { Button } from "@/components/ui/button";

const PLAN_LABELS: Record<string, string> = {
  trial: "Teste Grátis",
  basico: "Básico",
  premium: "Premium",
};

export function PlanBanner() {
  const { plan } = useTenantPlanContext();

  // Don't show banner for premium with lots of days remaining
  if (plan.plano === "premium" && !plan.expirado && plan.dias_restantes > 30) return null;

  if (plan.expirado) {
    return (
      <Card className="border-destructive/50 bg-destructive/5 mb-4">
        <CardContent className="py-3 flex items-center gap-3">
          <AlertTriangle className="h-5 w-5 text-destructive shrink-0" />
          <div className="flex-1">
            <p className="text-sm font-medium text-destructive">
              Seu plano {PLAN_LABELS[plan.plano] || plan.plano} expirou!
            </p>
            <p className="text-xs text-muted-foreground">
              Entre em contato com o administrador para renovar sua assinatura.
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (plan.plano === "trial" && plan.dias_restantes <= 3) {
    return (
      <Card className="border-primary/30 bg-primary/5 mb-4">
        <CardContent className="py-3 flex items-center gap-3">
          <Zap className="h-5 w-5 text-primary shrink-0" />
          <div className="flex-1">
            <p className="text-sm font-medium text-foreground">
              Período de teste: {plan.dias_restantes} dia{plan.dias_restantes !== 1 ? "s" : ""} restante{plan.dias_restantes !== 1 ? "s" : ""}
            </p>
            <p className="text-xs text-muted-foreground">
              Escolha um plano para continuar usando o sistema.
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (plan.plano === "basico") {
    return (
      <Card className="border-border bg-muted/30 mb-4">
        <CardContent className="py-3 flex items-center gap-3">
          <Users className="h-5 w-5 text-primary shrink-0" />
          <div className="flex-1">
            <p className="text-sm font-medium text-foreground">
              Plano Básico — Até 3 usuários
            </p>
            <p className="text-xs text-muted-foreground">
              Faça upgrade para Premium e desbloqueie todas as funções.
            </p>
          </div>
          <Badge variant="secondary" className="shrink-0">Básico</Badge>
        </CardContent>
      </Card>
    );
  }

  return null;
}
