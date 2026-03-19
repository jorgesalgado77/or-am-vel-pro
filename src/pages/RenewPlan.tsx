import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Check, X, Crown, Users, ArrowLeft, Zap, Loader2 } from "lucide-react";
import { supabase } from "@/lib/supabaseClient";
import { toast } from "sonner";
import { useNavigate } from "react-router-dom";
import { cn } from "@/lib/utils";

interface PlanFromDB {
  id: string;
  slug: string;
  nome: string;
  descricao: string;
  preco_mensal: number;
  preco_anual_mensal: number;
  max_usuarios: number;
  destaque: boolean;
  features_display: { label: string; included: boolean }[];
}

const ICON_MAP: Record<string, React.ElementType> = {
  trial: Zap,
  basico: Users,
  premium: Crown,
};

function formatCurrency(value: number) {
  return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

export default function RenewPlan() {
  const navigate = useNavigate();
  const [annual, setAnnual] = useState(false);
  const [loading, setLoading] = useState<string | null>(null);
  const [plans, setPlans] = useState<PlanFromDB[]>([]);
  const [loadingPlans, setLoadingPlans] = useState(true);
  const tenantId = localStorage.getItem("renew_tenant_id");

  useEffect(() => {
    if (!tenantId) navigate("/");
  }, [tenantId, navigate]);

  useEffect(() => {
    const fetchPlans = async () => {
      const { data, error } = await supabase
        .from("subscription_plans" as any)
        .select("*")
        .eq("ativo", true)
        .neq("slug", "trial")
        .order("ordem", { ascending: true });
      if (!error && data) {
        setPlans((data as any[]).map(p => ({
          id: p.id,
          slug: p.slug,
          nome: p.nome,
          descricao: p.descricao,
          preco_mensal: p.preco_mensal,
          preco_anual_mensal: p.preco_anual_mensal,
          max_usuarios: p.max_usuarios,
          destaque: p.destaque,
          features_display: p.features_display || [],
        })));
      }
      setLoadingPlans(false);
    };
    fetchPlans();
  }, []);

  const handleSelectPlan = async (plan: PlanFromDB) => {
    if (!tenantId) return;
    setLoading(plan.slug);

    const periodo = annual ? "anual" : "mensal";
    const now = new Date();
    const endDate = new Date(now);
    if (annual) endDate.setFullYear(endDate.getFullYear() + 1);
    else endDate.setMonth(endDate.getMonth() + 1);

    const { error } = await supabase
      .from("tenants")
      .update({
        plano: plan.slug,
        plano_periodo: periodo,
        max_usuarios: plan.max_usuarios >= 999 ? 999 : plan.max_usuarios,
        assinatura_inicio: now.toISOString(),
        assinatura_fim: endDate.toISOString(),
        ativo: true,
      })
      .eq("id", tenantId);

    if (error) {
      toast.error("Erro ao atualizar plano: " + error.message);
      setLoading(null);
      return;
    }

    localStorage.removeItem("renew_tenant_id");
    toast.success(`Plano ${plan.nome} ativado com sucesso! Faça login novamente.`);
    navigate("/");
    setLoading(null);
  };

  if (loadingPlans) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background p-4 md:p-8">
      <div className="max-w-4xl mx-auto space-y-6">
        <div className="text-center space-y-2">
          <h1 className="text-2xl font-bold text-foreground">Renovar Assinatura</h1>
          <p className="text-muted-foreground">Escolha um plano para reativar o acesso à plataforma</p>
        </div>

        <div className="flex items-center justify-center gap-3">
          <Label className={cn("text-sm", !annual && "font-semibold text-foreground")}>Mensal</Label>
          <Switch checked={annual} onCheckedChange={setAnnual} />
          <Label className={cn("text-sm", annual && "font-semibold text-foreground")}>Anual</Label>
          {annual && <Badge variant="secondary" className="ml-2 text-xs">Economia de 15%</Badge>}
        </div>

        <div className={cn(
          "grid gap-6",
          plans.length === 1 ? "grid-cols-1 max-w-md mx-auto" :
          plans.length === 2 ? "grid-cols-1 md:grid-cols-2" :
          "grid-cols-1 md:grid-cols-3"
        )}>
          {plans.map((p) => {
            const price = annual ? p.preco_anual_mensal : p.preco_mensal;
            const Icon = ICON_MAP[p.slug] || Crown;
            return (
              <Card key={p.id} className={cn(
                "relative flex flex-col transition-all duration-200",
                p.destaque && "border-primary shadow-lg shadow-primary/10 scale-[1.02]"
              )}>
                {p.destaque && (
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                    <Badge className="bg-primary text-primary-foreground shadow-sm">Recomendado</Badge>
                  </div>
                )}
                <CardHeader className="text-center pb-2">
                  <div className="mx-auto mb-2 h-12 w-12 rounded-full bg-primary/10 flex items-center justify-center">
                    <Icon className="h-6 w-6 text-primary" />
                  </div>
                  <CardTitle className="text-lg">{p.nome}</CardTitle>
                  <CardDescription className="text-xs">{p.descricao}</CardDescription>
                </CardHeader>
                <CardContent className="flex-1 space-y-4">
                  <div className="text-center">
                    <p className="text-3xl font-bold text-foreground">{formatCurrency(price)}</p>
                    <p className="text-xs text-muted-foreground">/mês</p>
                    {annual && (
                      <p className="text-xs text-muted-foreground mt-1">Total: {formatCurrency(price * 12)}/ano</p>
                    )}
                  </div>
                  {p.features_display.length > 0 && (
                    <ul className="space-y-2">
                      {p.features_display.map((f) => (
                        <li key={f.label} className="flex items-center gap-2 text-sm">
                          {f.included ? <Check className="h-4 w-4 text-primary shrink-0" /> : <X className="h-4 w-4 text-muted-foreground/40 shrink-0" />}
                          <span className={cn(!f.included && "text-muted-foreground/60")}>{f.label}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                  <div className="text-center">
                    <Badge variant="outline" className="text-xs">
                      {p.max_usuarios >= 999 ? "Usuários ilimitados" : `Até ${p.max_usuarios} usuários`}
                    </Badge>
                  </div>
                </CardContent>
                <CardFooter className="pt-2">
                  <Button
                    className={cn("w-full", p.destaque && "bg-primary hover:bg-primary/90")}
                    variant={p.destaque ? "default" : "outline"}
                    onClick={() => handleSelectPlan(p)}
                    disabled={loading === p.slug}
                  >
                    {loading === p.slug ? "Processando..." : `Assinar ${p.nome}`}
                  </Button>
                </CardFooter>
              </Card>
            );
          })}
        </div>

        <div className="text-center">
          <Button variant="ghost" onClick={() => navigate("/")} className="gap-2">
            <ArrowLeft className="h-4 w-4" /> Voltar ao login
          </Button>
        </div>

        <p className="text-xs text-center text-muted-foreground">
          Todos os direitos reservados - 2026 - CNPJ: 58.847.751/0001-28
        </p>
      </div>
    </div>
  );
}
