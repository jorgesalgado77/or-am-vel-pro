import { AlertCircle, CreditCard } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

interface SetupFeeGuardProps {
  featureName: string;
  children: React.ReactNode;
  setupFeePaid: boolean;
  loading?: boolean;
}

/**
 * Guards features behind setup fee payment.
 * If setup_fee_paid = false, shows a blocked state instead of the feature.
 */
export function SetupFeeGuard({ featureName, children, setupFeePaid, loading }: SetupFeeGuardProps) {
  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="h-5 w-5 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!setupFeePaid) {
    return (
      <Card className="border-destructive/30 bg-destructive/5 max-w-lg mx-auto mt-8">
        <CardContent className="pt-6 text-center space-y-4">
          <AlertCircle className="h-12 w-12 mx-auto text-destructive" />
          <h3 className="text-lg font-semibold">Taxa de Implantação Pendente</h3>
          <p className="text-sm text-muted-foreground">
            O módulo <strong>{featureName}</strong> está bloqueado até a confirmação do pagamento da taxa de implantação.
          </p>
          <p className="text-xs text-muted-foreground">
            Entre em contato com o suporte para regularizar sua situação.
          </p>
          <Button variant="outline" className="gap-2" disabled>
            <CreditCard className="h-4 w-4" />
            Pagamento Pendente
          </Button>
        </CardContent>
      </Card>
    );
  }

  return <>{children}</>;
}
