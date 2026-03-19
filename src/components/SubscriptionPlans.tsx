import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Check, X, Crown, Zap, Users, Star, ArrowLeft, AlertTriangle } from "lucide-react";
import { useTenantPlanContext } from "@/hooks/useTenantPlan";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

interface Plan {
  id: string;
  slug: string;
  nome: string;
  descricao: string;
  preco_mensal: number;
  preco_anual_mensal: number;
  max_usuarios: number | null;
  icon: React.ElementType;
  destaque: boolean;
  features: { label: string; included: boolean }[];
}

const ICON_MAP: Record<string, React.ElementType> = {
  trial: Zap,
  basico: Users,
  premium: Crown,
};

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
  const [confirmPlan, setConfirmPlan] = useState<Plan | null>(null);
  const [plans, setPlans] = useState<Plan[]>([]);

  useEffect(() => {
    const fetchPlans = async () => {
      const { data } = await supabase
        .from("subscription_plans" as any)
        .select("*")
        .eq("ativo", true)
        .order("ordem", { ascending: true });
      if (data) {
        setPlans((data as any[]).map(p => ({
          id: p.slug,
          slug: p.slug,
          nome: p.nome,
          descricao: p.descricao,
          preco_mensal: p.preco_mensal,
          preco_anual_mensal: p.preco_anual_mensal,
          max_usuarios: p.max_usuarios >= 999 ? null : p.max_usuarios,
          icon: ICON_MAP[p.slug] || Crown,
          destaque: p.destaque,
          features: p.features_display || [],
        })));
      }
    };
    fetchPlans();

    const channel = supabase
      .channel("subscription-plans-realtime")
      .on("postgres_changes", { event: "*", schema: "public", table: "subscription_plans" }, () => {
        fetchPlans();
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, []);

  const getStartDate = () => {
    const d = new Date();
    return d.toLocaleDateString("pt-BR");
  };

  const getEndDate = () => {
    const d = new Date();
    if (annual) d.setFullYear(d.getFullYear() + 1);
    else d.setMonth(d.getMonth() + 1);
    return d.toLocaleDateString("pt-BR");
  };

  const handleRequestPlan = (planId: string) => {
    if (planId === currentPlan.plano) {
      toast.info("Você já está neste plano.");
      return;
    }
    if (planId === "trial") {
      toast.error("Não é possível voltar ao plano de teste.");
      return;
    }
    const selected = PLANS.find((p) => p.id === planId);
    if (selected) setConfirmPlan(selected);
  };

  const handleConfirmPlan = async () => {
    if (!confirmPlan) return;
    setLoading(confirmPlan.id);
    try {
      const { data: settings } = await supabase
        .from("company_settings")
        .select("tenant_id")
        .limit(1)
        .single();

      const tenantId = (settings as any)?.tenant_id;
      if (!tenantId) {
        toast.error("Configuração de tenant não encontrada.");
        setLoading(null);
        setConfirmPlan(null);
        return;
      }

      const periodo = annual ? "anual" : "mensal";
      const now = new Date();
      const endDate = new Date(now);
      if (annual) endDate.setFullYear(endDate.getFullYear() + 1);
      else endDate.setMonth(endDate.getMonth() + 1);

      const { error } = await supabase
        .from("tenants")
        .update({
          plano: confirmPlan.id,
          plano_periodo: periodo,
          max_usuarios: confirmPlan.max_usuarios ?? 999,
          assinatura_inicio: now.toISOString(),
          assinatura_fim: endDate.toISOString(),
          ativo: true,
        })
        .eq("id", tenantId);

      if (error) {
        toast.error("Erro ao atualizar plano: " + error.message);
      } else {
        toast.success(`Plano alterado para ${confirmPlan.nome} (${periodo})!`);
        await refresh();
      }
    } catch {
      toast.error("Erro inesperado ao trocar de plano.");
    }
    setLoading(null);
    setConfirmPlan(null);
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
                    onClick={() => handleRequestPlan(p.id)}
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

      {/* Confirmation Dialog */}
      <Dialog open={!!confirmPlan} onOpenChange={(open) => !open && setConfirmPlan(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-primary" />
              Confirmar Troca de Plano
            </DialogTitle>
            <DialogDescription>
              Revise os detalhes antes de confirmar a alteração.
            </DialogDescription>
          </DialogHeader>
          {confirmPlan && (
            <div className="space-y-4 py-2">
              <div className="rounded-lg border bg-muted/30 p-4 space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Plano atual:</span>
                  <span className="font-medium">{PLANS.find(p => p.id === currentPlan.plano)?.nome || currentPlan.plano}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Novo plano:</span>
                  <span className="font-semibold text-primary">{confirmPlan.nome}</span>
                </div>
                <div className="border-t pt-2 mt-2" />
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Período:</span>
                  <span className="font-medium">{annual ? "Anual" : "Mensal"}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Valor:</span>
                  <span className="font-bold text-foreground">
                    {formatCurrency(annual ? confirmPlan.preco_anual_mensal : confirmPlan.preco_mensal)}/mês
                  </span>
                </div>
                {annual && (
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Total anual:</span>
                    <span className="font-medium">{formatCurrency(confirmPlan.preco_anual_mensal * 12)}</span>
                  </div>
                )}
                <div className="border-t pt-2 mt-2" />
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Início:</span>
                  <span className="font-medium">{getStartDate()}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Vencimento:</span>
                  <span className="font-medium">{getEndDate()}</span>
                </div>
              </div>
            </div>
          )}
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setConfirmPlan(null)} disabled={!!loading}>
              Cancelar
            </Button>
            <Button onClick={handleConfirmPlan} disabled={!!loading}>
              {loading ? "Processando..." : "Confirmar e Assinar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
