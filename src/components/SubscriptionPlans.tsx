import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Check, X, Crown, Zap, Users, Star, ArrowLeft } from "lucide-react";
import { useTenantPlanContext } from "@/hooks/useTenantPlan";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

interface Plan {
  id: string;
  nome: string;
  descricao: string;
  preco_mensal: number;
  preco_anual_mensal: number;
  max_usuarios: number | null;
  icon: React.ElementType;
  destaque: boolean;
  features: { label: string; included: boolean }[];
}

const PLANS: Plan[] = [
  {
    id: "trial",
    nome: "Teste Grátis",
    descricao: "Experimente todas as funcionalidades por 7 dias",
    preco_mensal: 0,
    preco_anual_mensal: 0,
    max_usuarios: 999,
    icon: Zap,
    destaque: false,
    features: [
      { label: "Acesso completo por 7 dias", included: true },
      { label: "Clientes ilimitados", included: true },
      { label: "Simulador de financiamento", included: true },
      { label: "Desconto 1 e 2", included: true },
      { label: "Desconto 3 (especial)", included: true },
      { label: "Plus percentual", included: true },
      { label: "Contratos digitais", included: true },
      { label: "Configurações avançadas", included: true },
      { label: "Suporte prioritário", included: false },
    ],
  },
  {
    id: "basico",
    nome: "Básico",
    descricao: "Ideal para lojas pequenas com até 3 colaboradores",
    preco_mensal: 59.90,
    preco_anual_mensal: 50.92,
    max_usuarios: 3,
    icon: Users,
    destaque: false,
    features: [
      { label: "Até 3 usuários", included: true },
      { label: "Clientes ilimitados", included: true },
      { label: "Simulador de financiamento", included: true },
      { label: "Desconto 1 e 2", included: true },
      { label: "Desconto 3 (especial)", included: false },
      { label: "Plus percentual", included: false },
      { label: "Contratos digitais", included: false },
      { label: "Configurações avançadas", included: true },
      { label: "Suporte por ticket", included: true },
    ],
  },
  {
    id: "premium",
    nome: "Premium",
    descricao: "Para lojas que precisam de tudo, sem limites",
    preco_mensal: 149.90,
    preco_anual_mensal: 127.42,
    max_usuarios: null,
    icon: Crown,
    destaque: true,
    features: [
      { label: "Usuários ilimitados", included: true },
      { label: "Clientes ilimitados", included: true },
      { label: "Simulador de financiamento", included: true },
      { label: "Desconto 1 e 2", included: true },
      { label: "Desconto 3 (especial)", included: true },
      { label: "Plus percentual", included: true },
      { label: "Contratos digitais", included: true },
      { label: "Configurações avançadas", included: true },
      { label: "Suporte prioritário", included: true },
    ],
  },
];

function formatCurrency(value: number) {
  return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

interface SubscriptionPlansProps {
  onBack?: () => void;
}

export function SubscriptionPlans({ onBack }: SubscriptionPlansProps) {
  const { plan: currentPlan, refresh } = useTenantPlanContext();
  const [annual, setAnnual] = useState(currentPlan.plano_periodo === "anual");
  const [loading, setLoading] = useState<string | null>(null);

  const handleSelectPlan = async (planId: string) => {
    if (planId === currentPlan.plano) {
      toast.info("Você já está neste plano.");
      return;
    }
    if (planId === "trial") {
      toast.error("Não é possível voltar ao plano de teste.");
      return;
    }

    setLoading(planId);
    try {
      // Get tenant_id from company_settings
      const { data: settings } = await supabase
        .from("company_settings")
        .select("tenant_id")
        .limit(1)
        .single();

      const tenantId = (settings as any)?.tenant_id;
      if (!tenantId) {
        toast.error("Configuração de tenant não encontrada.");
        setLoading(null);
        return;
      }

      const periodo = annual ? "anual" : "mensal";
      const selectedPlan = PLANS.find((p) => p.id === planId);
      const now = new Date();
      const endDate = new Date(now);
      if (annual) {
        endDate.setFullYear(endDate.getFullYear() + 1);
      } else {
        endDate.setMonth(endDate.getMonth() + 1);
      }

      const { error } = await supabase
        .from("tenants")
        .update({
          plano: planId,
          plano_periodo: periodo,
          max_usuarios: selectedPlan?.max_usuarios ?? 999,
          assinatura_inicio: now.toISOString(),
          assinatura_fim: endDate.toISOString(),
          ativo: true,
        })
        .eq("id", tenantId);

      if (error) {
        toast.error("Erro ao atualizar plano: " + error.message);
      } else {
        toast.success(`Plano alterado para ${selectedPlan?.nome} (${periodo})!`);
        await refresh();
      }
    } catch (err) {
      toast.error("Erro inesperado ao trocar de plano.");
    }
    setLoading(null);
  };

  return (
    <div className="space-y-6">
      {onBack && (
        <Button variant="ghost" size="sm" onClick={onBack} className="gap-2 text-muted-foreground mb-2">
          <ArrowLeft className="h-4 w-4" /> Voltar
        </Button>
      )}

      {/* Current plan info */}
      <Card className="border-primary/30 bg-primary/5">
        <CardContent className="py-4 flex items-center gap-4">
          <Star className="h-6 w-6 text-primary shrink-0" />
          <div className="flex-1">
            <p className="text-sm font-semibold text-foreground">
              Seu plano atual: <span className="text-primary">{PLANS.find(p => p.id === currentPlan.plano)?.nome || currentPlan.plano}</span>
            </p>
            <p className="text-xs text-muted-foreground">
              Período: {currentPlan.plano_periodo === "anual" ? "Anual" : "Mensal"}
              {currentPlan.dias_restantes > 0 && ` — ${currentPlan.dias_restantes} dias restantes`}
              {currentPlan.expirado && " — Expirado"}
            </p>
          </div>
          <Badge variant={currentPlan.expirado ? "destructive" : "default"}>
            {currentPlan.expirado ? "Expirado" : "Ativo"}
          </Badge>
        </CardContent>
      </Card>

      {/* Annual toggle */}
      <div className="flex items-center justify-center gap-3">
        <Label htmlFor="billing-toggle" className={cn("text-sm", !annual && "font-semibold text-foreground")}>
          Mensal
        </Label>
        <Switch id="billing-toggle" checked={annual} onCheckedChange={setAnnual} />
        <Label htmlFor="billing-toggle" className={cn("text-sm", annual && "font-semibold text-foreground")}>
          Anual
        </Label>
        {annual && (
          <Badge variant="secondary" className="ml-2 text-xs">Economia de 15%</Badge>
        )}
      </div>

      {/* Plan cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {PLANS.map((p) => {
          const isCurrent = p.id === currentPlan.plano;
          const price = annual ? p.preco_anual_mensal : p.preco_mensal;

          return (
            <Card
              key={p.id}
              className={cn(
                "relative flex flex-col transition-all duration-200",
                p.destaque && "border-primary shadow-lg shadow-primary/10 scale-[1.02]",
                isCurrent && "ring-2 ring-primary/50"
              )}
            >
              {p.destaque && (
                <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                  <Badge className="bg-primary text-primary-foreground shadow-sm">
                    Mais Popular
                  </Badge>
                </div>
              )}
              {isCurrent && (
                <div className="absolute -top-3 right-4">
                  <Badge variant="outline" className="border-primary text-primary bg-background shadow-sm">
                    Plano Atual
                  </Badge>
                </div>
              )}

              <CardHeader className="text-center pb-2">
                <div className="mx-auto mb-2 h-12 w-12 rounded-full bg-primary/10 flex items-center justify-center">
                  <p.icon className="h-6 w-6 text-primary" />
                </div>
                <CardTitle className="text-lg">{p.nome}</CardTitle>
                <CardDescription className="text-xs">{p.descricao}</CardDescription>
              </CardHeader>

              <CardContent className="flex-1 space-y-4">
                <div className="text-center">
                  {p.preco_mensal === 0 ? (
                    <p className="text-3xl font-bold text-foreground">Grátis</p>
                  ) : (
                    <>
                      <p className="text-3xl font-bold text-foreground">
                        {formatCurrency(price)}
                      </p>
                      <p className="text-xs text-muted-foreground">/mês</p>
                      {annual && (
                        <p className="text-xs text-muted-foreground mt-1">
                          Total: {formatCurrency(price * 12)}/ano
                        </p>
                      )}
                    </>
                  )}
                </div>

                <ul className="space-y-2">
                  {p.features.map((f) => (
                    <li key={f.label} className="flex items-center gap-2 text-sm">
                      {f.included ? (
                        <Check className="h-4 w-4 text-primary shrink-0" />
                      ) : (
                        <X className="h-4 w-4 text-muted-foreground/40 shrink-0" />
                      )}
                      <span className={cn(!f.included && "text-muted-foreground/60")}>
                        {f.label}
                      </span>
                    </li>
                  ))}
                </ul>
              </CardContent>

              <CardFooter className="pt-2">
                {p.id === "trial" ? (
                  <Button variant="outline" className="w-full" disabled>
                    {isCurrent ? "Em uso" : "Indisponível"}
                  </Button>
                ) : isCurrent ? (
                  <Button variant="outline" className="w-full" disabled>
                    Plano Atual
                  </Button>
                ) : (
                  <Button
                    className={cn("w-full", p.destaque && "bg-primary hover:bg-primary/90")}
                    variant={p.destaque ? "default" : "outline"}
                    onClick={() => handleSelectPlan(p.id)}
                    disabled={loading === p.id}
                  >
                    {loading === p.id ? "Processando..." : `Assinar ${p.nome}`}
                  </Button>
                )}
              </CardFooter>
            </Card>
          );
        })}
      </div>

      <p className="text-xs text-center text-muted-foreground">
        Os pagamentos são processados de forma segura. Você pode alterar ou cancelar seu plano a qualquer momento.
      </p>
    </div>
  );
}
