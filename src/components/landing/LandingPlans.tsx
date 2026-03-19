import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Check, X, Star, Zap, Users, Crown } from "lucide-react";
import { AnimatedSection, StaggerContainer, StaggerItem } from "./AnimatedSection";
import { supabase } from "@/integrations/supabase/client";

interface LandingPlansProps {
  plans: any[];
  primaryColor: string;
}

interface DynamicPlan {
  id: string;
  slug: string;
  nome: string;
  descricao: string;
  preco_mensal: number;
  preco_anual_mensal: number;
  max_usuarios: number;
  destaque: boolean;
  ativo: boolean;
  ordem: number;
  trial_dias: number;
  features_display: { label: string; included: boolean }[];
}

const ICON_MAP: Record<string, React.ElementType> = {
  trial: Zap,
  basico: Users,
  premium: Crown,
};

export function LandingPlans({ primaryColor }: LandingPlansProps) {
  const [annual, setAnnual] = useState(false);
  const [dynamicPlans, setDynamicPlans] = useState<DynamicPlan[]>([]);
  const [loaded, setLoaded] = useState(false);

  const fetchPlans = async () => {
    const { data } = await supabase
      .from("subscription_plans" as any)
      .select("*")
      .eq("ativo", true)
      .order("ordem", { ascending: true });
    if (data) setDynamicPlans(data as any);
    setLoaded(true);
  };

  useEffect(() => {
    fetchPlans();

    const channel = supabase
      .channel("landing-plans-realtime")
      .on("postgres_changes", { event: "*", schema: "public", table: "subscription_plans" }, () => {
        fetchPlans();
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, []);

  const scrollTo = (id: string) => {
    document.getElementById(id)?.scrollIntoView({ behavior: "smooth" });
  };

  if (!loaded) return null;

  return (
    <section id="plans" className="py-20 bg-gray-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <AnimatedSection>
          <div className="text-center mb-12">
            <h2 className="text-3xl md:text-4xl font-bold text-gray-900 mb-4">
              Invista no <span style={{ color: primaryColor }}>crescimento</span> da sua loja
            </h2>
            <p className="text-lg text-gray-600 max-w-2xl mx-auto mb-8">
              Planos acessíveis que se pagam na primeira venda. Comece grátis, sem cartão de crédito.
            </p>

            <div className="inline-flex items-center gap-3 bg-white rounded-full p-1 shadow-sm border border-gray-200">
              <button
                onClick={() => setAnnual(false)}
                className="px-5 py-2 rounded-full text-sm font-medium transition-all"
                style={!annual ? { backgroundColor: primaryColor, color: "white" } : { color: "#6b7280" }}
              >
                Mensal
              </button>
              <button
                onClick={() => setAnnual(true)}
                className="px-5 py-2 rounded-full text-sm font-medium transition-all"
                style={annual ? { backgroundColor: primaryColor, color: "white" } : { color: "#6b7280" }}
              >
                Anual <span className="text-xs opacity-75">(-15%)</span>
              </button>
            </div>
          </div>
        </AnimatedSection>

        <StaggerContainer className={`grid gap-8 max-w-5xl mx-auto ${dynamicPlans.length <= 3 ? "md:grid-cols-3" : `md:grid-cols-${Math.min(dynamicPlans.length, 4)}`}`}>
          {dynamicPlans.map((plan) => {
            const price = annual ? plan.preco_anual_mensal : plan.preco_mensal;
            const Icon = ICON_MAP[plan.slug] || Crown;
            return (
              <StaggerItem key={plan.id}>
                <div
                  className={`bg-white rounded-2xl p-8 border-2 relative transition-all duration-300 h-full flex flex-col ${
                    plan.destaque
                      ? "shadow-xl scale-105"
                      : "shadow-sm hover:shadow-lg border-gray-100"
                  }`}
                  style={plan.destaque ? { borderColor: primaryColor } : {}}
                >
                  {plan.destaque && (
                    <div
                      className="absolute -top-4 left-1/2 -translate-x-1/2 flex items-center gap-1.5 px-4 py-1.5 rounded-full text-white text-xs font-bold shadow-lg"
                      style={{ backgroundColor: primaryColor }}
                    >
                      <Star className="h-3.5 w-3.5 fill-white" />
                      Mais Popular
                    </div>
                  )}

                  <div className="text-center mb-6">
                    <div
                      className="h-12 w-12 rounded-full flex items-center justify-center mx-auto mb-3"
                      style={{ backgroundColor: `${primaryColor}12` }}
                    >
                      <Icon className="h-6 w-6" style={{ color: primaryColor }} />
                    </div>
                    <h3 className="text-xl font-bold text-gray-900 mb-1">{plan.nome}</h3>
                    <p className="text-xs text-gray-500 mb-4">{plan.descricao}</p>
                    <div className="flex items-baseline justify-center gap-1">
                      {price === 0 ? (
                        <span className="text-4xl font-extrabold text-gray-900">Grátis</span>
                      ) : (
                        <>
                          <span className="text-sm text-gray-500">R$</span>
                          <span className="text-4xl font-extrabold text-gray-900">
                            {price.toFixed(2).replace(".", ",")}
                          </span>
                          <span className="text-sm text-gray-500">/mês</span>
                        </>
                      )}
                    </div>
                    {plan.max_usuarios < 999 && (
                      <p className="text-xs text-gray-500 mt-1">até {plan.max_usuarios} usuários</p>
                    )}
                    {plan.max_usuarios >= 999 && plan.slug !== "trial" && (
                      <p className="text-xs text-gray-500 mt-1">usuários ilimitados</p>
                    )}
                    {plan.trial_dias > 0 && (
                      <p className="text-xs text-green-600 font-medium mt-1">{plan.trial_dias} dias sem compromisso</p>
                    )}
                  </div>

                  <ul className="space-y-2.5 mb-8 flex-1">
                    {(plan.features_display || []).map((f: any, j: number) => (
                      <li key={j} className="flex items-start gap-3 text-sm">
                        {f.included ? (
                          <Check className="h-4 w-4 shrink-0 mt-0.5" style={{ color: primaryColor }} />
                        ) : (
                          <X className="h-4 w-4 shrink-0 mt-0.5 text-gray-300" />
                        )}
                        <span className={f.included ? "text-gray-700" : "text-gray-400"}>{f.label}</span>
                      </li>
                    ))}
                  </ul>

                  <Button
                    className="w-full text-base py-5 rounded-xl"
                    onClick={() => scrollTo("lead-form")}
                    style={
                      plan.destaque
                        ? { backgroundColor: primaryColor, color: "white" }
                        : { borderColor: primaryColor, color: primaryColor }
                    }
                    variant={plan.destaque ? "default" : "outline"}
                  >
                    {plan.slug === "trial" ? "Começar grátis" : "Começar teste grátis"}
                  </Button>
                </div>
              </StaggerItem>
            );
          })}
        </StaggerContainer>

        <AnimatedSection>
          <p className="text-center text-sm text-gray-500 mt-8">
            Todos os planos incluem 7 dias de teste grátis. Cancele a qualquer momento.
          </p>
        </AnimatedSection>
      </div>
    </section>
  );
}
