import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Check, Star } from "lucide-react";
import type { PlanItem } from "@/hooks/useLandingConfig";

interface LandingPlansProps {
  plans: PlanItem[];
  primaryColor: string;
}

export function LandingPlans({ plans, primaryColor }: LandingPlansProps) {
  const [annual, setAnnual] = useState(false);

  const scrollTo = (id: string) => {
    document.getElementById(id)?.scrollIntoView({ behavior: "smooth" });
  };

  return (
    <section id="plans" className="py-20 bg-gray-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center mb-12">
          <h2 className="text-3xl md:text-4xl font-bold text-gray-900 mb-4">
            Escolha o plano <span style={{ color: primaryColor }}>ideal</span>
          </h2>
          <p className="text-lg text-gray-600 max-w-2xl mx-auto mb-8">
            Comece com 7 dias grátis. Sem compromisso, sem cartão de crédito.
          </p>

          {/* Toggle */}
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

        <div className="grid md:grid-cols-3 gap-8 max-w-5xl mx-auto">
          {plans.map((plan, i) => (
            <div
              key={i}
              className={`bg-white rounded-2xl p-8 border-2 relative transition-all duration-300 ${
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
                  Recomendado
                </div>
              )}

              <div className="text-center mb-6">
                <h3 className="text-xl font-bold text-gray-900 mb-2">{plan.name}</h3>
                <div className="flex items-baseline justify-center gap-1">
                  <span className="text-sm text-gray-500">R$</span>
                  <span className="text-5xl font-extrabold text-gray-900">
                    {annual ? plan.price_yearly : plan.price_monthly}
                  </span>
                  <span className="text-sm text-gray-500">/mês</span>
                </div>
                {plan.max_users < 999 && (
                  <p className="text-xs text-gray-500 mt-1">até {plan.max_users} usuários</p>
                )}
                {plan.max_users >= 999 && (
                  <p className="text-xs text-gray-500 mt-1">usuários ilimitados</p>
                )}
              </div>

              <ul className="space-y-3 mb-8">
                {plan.features.map((f, j) => (
                  <li key={j} className="flex items-start gap-3 text-sm text-gray-700">
                    <Check className="h-5 w-5 shrink-0 mt-0.5" style={{ color: primaryColor }} />
                    {f}
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
                Começar teste grátis
              </Button>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
