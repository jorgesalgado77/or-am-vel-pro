import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Crown, AlertTriangle } from "lucide-react";

interface UpgradePlanDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  message: string;
}

export function UpgradePlanDialog({ open, onOpenChange, message }: UpgradePlanDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <div className="flex items-center gap-3 mb-2">
            <div className="p-3 rounded-full bg-amber-100 dark:bg-amber-900/30">
              <AlertTriangle className="h-6 w-6 text-amber-600" />
            </div>
            <div>
              <DialogTitle className="text-lg">Limite do Plano Atingido</DialogTitle>
              <DialogDescription className="text-sm text-muted-foreground">
                Faça upgrade para continuar crescendo
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>
        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">{message}</p>
          <div className="rounded-lg border p-4 space-y-3">
            <div className="flex items-center gap-2">
              <Crown className="h-5 w-5 text-primary" />
              <span className="font-medium">Vantagens do upgrade:</span>
            </div>
            <ul className="text-sm text-muted-foreground space-y-1 ml-7 list-disc">
              <li>Mais usuários na equipe</li>
              <li>Mais clientes cadastrados</li>
              <li>Simulações ilimitadas</li>
              <li>Suporte prioritário</li>
            </ul>
          </div>
        </div>
        <DialogFooter className="flex-col sm:flex-row gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Voltar
          </Button>
          <Button
            className="bg-gradient-to-r from-primary to-accent"
            onClick={() => {
              onOpenChange(false);
              window.dispatchEvent(new CustomEvent("navigate-to", { detail: "planos" }));
            }}
          >
            <Crown className="h-4 w-4 mr-2" />
            Ver Planos de Upgrade
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/**
 * Checks if an error message indicates a plan limit was reached.
 * Returns the upgrade message if it is, or null otherwise.
 */
export function parsePlanLimitError(errorMessage: string): string | null {
  const patterns = [
    /Limite de (\w+) atingido.*plano.*\((\d+) de (\d+)\)/i,
    /Limite de (\w+) atingido/i,
  ];
  
  for (const pattern of patterns) {
    if (pattern.test(errorMessage)) {
      return errorMessage;
    }
  }
  return null;
}
