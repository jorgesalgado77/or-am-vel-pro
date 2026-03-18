import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Check, X, Star, Zap, Users, Crown } from "lucide-react";
import { AnimatedSection, StaggerContainer, StaggerItem } from "./AnimatedSection";

interface LandingPlansProps {
  plans: any[];
  primaryColor: string;
}

interface SystemPlan {
  id: string;
  name: string;
  description: string;
  price_monthly: number;
  price_yearly: number;
  max_users: number | null;
  recommended: boolean;
  icon: React.ElementType;
  features: { label: string; included: boolean }[];
}

const SYSTEM_PLANS: SystemPlan[] = [
  {
    id: "trial",
    name: "Teste Grátis",
    description: "Experimente tudo por 7 dias",
    price_monthly: 0,
    price_yearly: 0,
    max_users: 999,
    recommended: false,
    icon: Zap,
    features: [
      { label: "Acesso completo por 7 dias", included: true },
      { label: "Clientes ilimitados", included: true },
      { label: "Simulador de financiamento", included: true },
      { label: "Desconto 1 e 2", included: true },
      { label: "Contratos digitais", included: true },
      { label: "Suporte por ticket", included: true },
      { label: "Desconto 3 (especial)", included: false },
      { label: "Plus percentual", included: false },
    ],
  },
  {
    id: "basico",
    name: "Básico",
    description: "Ideal para lojas pequenas com até 3 colaboradores",
    price_monthly: 59.90,
    price_yearly: 50.92,
    max_users: 3,
    recommended: false,
    icon: Users,
    features: [
      { label: "Até 3 usuários", included: true },
      { label: "Clientes ilimitados", included: true },
      { label: "Simulador de financiamento", included: true },
      { label: "Desconto 1 e 2", included: true },
      { label: "Configurações avançadas", included: true },
      { label: "Suporte por ticket", included: true },
      { label: "Desconto 3 (especial)", included: false },
      { label: "Plus percentual", included: false },
      { label: "Contratos digitais", included: false },
    ],
  },
  {
    id: "premium",
    name: "Premium",
    description: "Para lojas que precisam de tudo, sem limites",
    price_monthly: 149.90,
    price_yearly: 127.42,
    max_users: null,
    recommended: true,
    icon: Crown,
    features: [
      { label: "Usuários ilimitados", included: true },
      { label: "Clientes ilimitados", included: true },
      { label: "Simulador de financiamento", included: true },
      { label: "Desconto 1, 2 e 3 (especial)", included: true },
      { label: "Plus percentual", included: true },
      { label: "Contratos digitais", included: true },
      { label: "Configurações avançadas", included: true },
      { label: "Suporte prioritário", included: true },
    ],
  },
];

export function LandingPlans({ primaryColor }: LandingPlansProps) {
  const [annual, setAnnual] = useState(false);

  const scrollTo = (id: string) => {
    document.getElementById(id)?.scrollIntoView({ behavior: "smooth" });
  };

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

        <StaggerContainer className="grid md:grid-cols-3 gap-8 max-w-5xl mx-auto">
          {SYSTEM_PLANS.map((plan) => {
            const price = annual ? plan.price_yearly : plan.price_monthly;
            return (
              <StaggerItem key={plan.id}>
                <div
                  className={`bg-white rounded-2xl p-8 border-2 relative transition-all duration-300 h-full flex flex-col ${
                    plan.recommended
                      ? "shadow-xl scale-105"
                      : "shadow-sm hover:shadow-lg border-gray-100"
                  }`}
                  style={plan.recommended ? { borderColor: primaryColor } : {}}
                >
                  {plan.recommended && (
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
                      <plan.icon className="h-6 w-6" style={{ color: primaryColor }} />
                    </div>
                    <h3 className="text-xl font-bold text-gray-900 mb-1">{plan.name}</h3>
                    <p className="text-xs text-gray-500 mb-4">{plan.description}</p>
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
                    {plan.max_users && plan.max_users < 999 && (
                      <p className="text-xs text-gray-500 mt-1">até {plan.max_users} usuários</p>
                    )}
                    {(!plan.max_users || plan.max_users >= 999) && plan.id !== "trial" && (
                      <p className="text-xs text-gray-500 mt-1">usuários ilimitados</p>
                    )}
                    {plan.id === "trial" && (
                      <p className="text-xs text-green-600 font-medium mt-1">7 dias sem compromisso</p>
                    )}
                  </div>

                  <ul className="space-y-2.5 mb-8 flex-1">
                    {plan.features.map((f, j) => (
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
                      plan.recommended
                        ? { backgroundColor: primaryColor, color: "white" }
                        : { borderColor: primaryColor, color: primaryColor }
                    }
                    variant={plan.recommended ? "default" : "outline"}
                  >
                    {plan.id === "trial" ? "Começar grátis" : "Começar teste grátis"}
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
