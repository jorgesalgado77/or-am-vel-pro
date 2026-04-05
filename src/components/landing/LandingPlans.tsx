import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Check, X, Star, Zap, Users, Crown, Building2, MessageCircle } from "lucide-react";
import { AnimatedSection, StaggerContainer, StaggerItem } from "./AnimatedSection";
import { supabase } from "@/lib/supabaseClient";

interface LandingPlansProps {
  plans: unknown[];
  primaryColor: string;
}

interface FeatureDisplay {
  label: string;
  included: boolean;
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
  features_display: FeatureDisplay[];
}

const ICON_MAP: Record<string, React.ElementType> = {
  trial: Zap,
  basico: Users,
  premium: Crown,
  enterprise: Building2,
};

const PLAN_STYLES: Record<string, {
  gradient: string;
  border: string;
  badge: string;
  cardBg: string;
  textColor: string;
  priceColor: string;
}> = {
  basico: {
    gradient: "",
    border: "border-gray-200",
    badge: "",
    cardBg: "bg-white",
    textColor: "text-gray-900",
    priceColor: "text-gray-900",
  },
  premium: {
    gradient: "",
    border: "",
    badge: "",
    cardBg: "bg-white",
    textColor: "text-gray-900",
    priceColor: "text-gray-900",
  },
  enterprise: {
    gradient: "bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900",
    border: "border-gray-700",
    badge: "bg-amber-500",
    cardBg: "",
    textColor: "text-white",
    priceColor: "text-white",
  },
};

export function LandingPlans({ primaryColor }: LandingPlansProps) {
  const [annual, setAnnual] = useState(false);
  const [dynamicPlans, setDynamicPlans] = useState<DynamicPlan[]>([]);
  const [loaded, setLoaded] = useState(false);

  const fetchPlans = async () => {
    const { data } = await (supabase as any)
      .from("subscription_plans")
      .select("*")
      .eq("ativo", true)
      .order("ordem", { ascending: true });
    if (data) setDynamicPlans(data as DynamicPlan[]);
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

        <StaggerContainer className={`grid gap-8 max-w-6xl mx-auto ${
          dynamicPlans.length <= 3 ? "md:grid-cols-3" : `md:grid-cols-${Math.min(dynamicPlans.length, 4)}`
        }`}>
          {dynamicPlans.map((plan) => {
            const price = annual ? plan.preco_anual_mensal : plan.preco_mensal;
            const Icon = ICON_MAP[plan.slug] || Crown;
            const style = PLAN_STYLES[plan.slug] || PLAN_STYLES.basico;
            const isEnterprise = plan.slug === "enterprise";
            const isPremium = plan.destaque;

            return (
              <StaggerItem key={plan.id}>
                <div
                  className={`rounded-2xl p-8 border-2 relative transition-all duration-300 h-full flex flex-col ${
                    isEnterprise
                      ? `${style.gradient} ${style.border} shadow-2xl`
                      : isPremium
                        ? `${style.cardBg} shadow-xl scale-105`
                        : `${style.cardBg} shadow-sm hover:shadow-lg ${style.border}`
                  }`}
                  style={isPremium && !isEnterprise ? { borderColor: primaryColor } : {}}
                >
                  {/* Badge */}
                  {isPremium && !isEnterprise && (
                    <div
                      className="absolute -top-4 left-1/2 -translate-x-1/2 flex items-center gap-1.5 px-4 py-1.5 rounded-full text-white text-xs font-bold shadow-lg"
                      style={{ backgroundColor: primaryColor }}
                    >
                      <Star className="h-3.5 w-3.5 fill-white" />
                      Mais Popular
                    </div>
                  )}

                  {isEnterprise && (
                    <div className="absolute -top-4 left-1/2 -translate-x-1/2 flex items-center gap-1.5 px-4 py-1.5 rounded-full text-white text-xs font-bold shadow-lg bg-amber-500">
                      <Building2 className="h-3.5 w-3.5" />
                      Máximo Poder
                    </div>
                  )}

                  {/* Header */}
                  <div className="text-center mb-6">
                    <div
                      className={`h-12 w-12 rounded-full flex items-center justify-center mx-auto mb-3 ${
                        isEnterprise ? "bg-amber-500/20" : ""
                      }`}
                      style={!isEnterprise ? { backgroundColor: `${primaryColor}12` } : {}}
                    >
                      <Icon
                        className="h-6 w-6"
                        style={isEnterprise ? { color: "#f59e0b" } : { color: primaryColor }}
                      />
                    </div>
                    <h3 className={`text-xl font-bold mb-1 ${style.textColor}`}>{plan.nome}</h3>
                    <p className={`text-xs mb-4 ${isEnterprise ? "text-gray-400" : "text-gray-500"}`}>
                      {plan.descricao}
                    </p>

                    {/* Price */}
                    <div className="flex items-baseline justify-center gap-1">
                      {price === 0 ? (
                        <span className={`text-4xl font-extrabold ${style.priceColor}`}>Grátis</span>
                      ) : (
                        <>
                          <span className={`text-sm ${isEnterprise ? "text-gray-400" : "text-gray-500"}`}>R$</span>
                          <span className={`text-4xl font-extrabold ${style.priceColor}`}>
                            {price.toFixed(2).replace(".", ",")}
                          </span>
                          <span className={`text-sm ${isEnterprise ? "text-gray-400" : "text-gray-500"}`}>/mês</span>
                        </>
                      )}
                    </div>

                    {/* User limit */}
                    {plan.max_usuarios < 999 && (
                      <p className={`text-xs mt-1 ${isEnterprise ? "text-gray-400" : "text-gray-500"}`}>
                        até {plan.max_usuarios} usuários
                      </p>
                    )}
                    {plan.max_usuarios >= 999 && plan.slug !== "trial" && (
                      <p className={`text-xs mt-1 ${isEnterprise ? "text-gray-400" : "text-gray-500"}`}>
                        usuários ilimitados
                      </p>
                    )}
                    {plan.trial_dias > 0 && (
                      <p className={`text-xs font-medium mt-1 ${isEnterprise ? "text-amber-400" : "text-green-600"}`}>
                        {plan.trial_dias} dias sem compromisso
                      </p>
                    )}
                  </div>

                  {/* Features */}
                  <ul className="space-y-2.5 mb-8 flex-1">
                    {(plan.features_display || []).map((f: FeatureDisplay, j: number) => (
                      <li key={j} className="flex items-start gap-3 text-sm">
                        {f.included ? (
                          <Check
                            className="h-4 w-4 shrink-0 mt-0.5"
                            style={{ color: isEnterprise ? "#f59e0b" : primaryColor }}
                          />
                        ) : (
                          <X className={`h-4 w-4 shrink-0 mt-0.5 ${isEnterprise ? "text-gray-600" : "text-gray-300"}`} />
                        )}
                        <span className={
                          f.included
                            ? isEnterprise ? "text-gray-200" : "text-gray-700"
                            : isEnterprise ? "text-gray-600" : "text-gray-400"
                        }>
                          {f.label}
                        </span>
                      </li>
                    ))}
                  </ul>

                  {/* CTA Buttons */}
                  <div className="space-y-2">
                    {isEnterprise ? (
                      <>
                        <Button
                          className="w-full text-base py-5 rounded-xl bg-amber-500 hover:bg-amber-600 text-white border-0"
                          onClick={() => scrollTo("lead-form")}
                        >
                          <MessageCircle className="h-4 w-4 mr-2" />
                          Falar com consultor
                        </Button>
                        <p className="text-center text-xs text-gray-500">
                          Atendimento personalizado para sua empresa
                        </p>
                      </>
                    ) : (
                      <Button
                        className="w-full text-base py-5 rounded-xl"
                        onClick={() => scrollTo("lead-form")}
                        style={
                          isPremium
                            ? { backgroundColor: primaryColor, color: "white" }
                            : { borderColor: primaryColor, color: primaryColor }
                        }
                        variant={isPremium ? "default" : "outline"}
                      >
                        {plan.slug === "trial" ? "Começar grátis" : "Assinar agora"}
                      </Button>
                    )}
                  </div>
                </div>
              </StaggerItem>
            );
          })}
        </StaggerContainer>

        <AnimatedSection>
          <div className="text-center mt-8 space-y-3">
            <p className="text-sm text-gray-500">
              Todos os planos incluem 7 dias de teste grátis. Cancele a qualquer momento.
            </p>
            <a
              href="/planos"
              className="inline-flex items-center gap-1.5 text-sm font-medium hover:underline"
              style={{ color: primaryColor }}
            >
              Comparar todos os planos em detalhe →
            </a>
          </div>
        </AnimatedSection>
      </div>
    </section>
  );
}
