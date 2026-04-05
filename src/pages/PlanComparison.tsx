/**
 * Plan Comparison Page — side-by-side feature comparison table
 */
import { useState, useEffect } from "react";
import { Check, X, Crown, Users, Building2, Zap, ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/lib/supabaseClient";
import { useNavigate } from "react-router-dom";

interface PlanData {
  id: string;
  slug: string;
  nome: string;
  descricao: string;
  preco_mensal: number;
  preco_anual_mensal: number;
  max_usuarios: number;
  destaque: boolean;
  funcionalidades: Record<string, boolean>;
}

const ICON_MAP: Record<string, React.ElementType> = {
  basico: Users,
  premium: Crown,
  enterprise: Building2,
  trial: Zap,
};

const FEATURE_CATEGORIES: Array<{
  label: string;
  features: Array<{ key: string; label: string }>;
}> = [
  {
    label: "Gestão de Vendas",
    features: [
      { key: "configuracoes", label: "Configurações completas" },
      { key: "contratos", label: "Geração de contratos" },
      { key: "desconto3", label: "Desconto especial (nível 3)" },
      { key: "plus", label: "Acréscimo Plus" },
      { key: "deal_room", label: "Deal Room" },
    ],
  },
  {
    label: "Inteligência Artificial",
    features: [
      { key: "vendazap", label: "VendaZap AI" },
      { key: "ia_gerente", label: "IA Gerente / MIA" },
      { key: "smart_import", label: "3D Smart Import" },
    ],
  },
  {
    label: "Comunicação",
    features: [
      { key: "whatsapp", label: "Integração WhatsApp" },
      { key: "email", label: "Envio de emails" },
    ],
  },
  {
    label: "Recursos Avançados",
    features: [
      { key: "ocultar_indicador", label: "Ocultar indicador" },
      { key: "automacao_vendas", label: "Automação de vendas" },
      { key: "followup_auto", label: "Follow-up automático" },
      { key: "analytics_avancado", label: "Analytics avançado" },
    ],
  },
  {
    label: "Limites de Uso",
    features: [
      { key: "limit_ia", label: "Interações IA / mês" },
      { key: "limit_whatsapp", label: "Mensagens WhatsApp / mês" },
      { key: "limit_email", label: "Envios de email / mês" },
    ],
  },
];

const LIMIT_VALUES: Record<string, Record<string, string>> = {
  basico: { limit_ia: "50", limit_whatsapp: "—", limit_email: "50" },
  premium: { limit_ia: "300", limit_whatsapp: "500", limit_email: "200" },
  enterprise: { limit_ia: "1.000", limit_whatsapp: "1.500", limit_email: "500" },
};

export default function PlanComparison() {
  const [plans, setPlans] = useState<PlanData[]>([]);
  const [annual, setAnnual] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    const fetchPlans = async () => {
      const { data } = await (supabase as ReturnType<typeof supabase["from"]> & { from: (t: string) => ReturnType<typeof supabase["from"]> })
        .from("subscription_plans" as never)
        .select("*")
        .eq("ativo" as never, true as never)
        .order("ordem" as never, { ascending: true } as never);
      if (data) setPlans(data as unknown as PlanData[]);
    };
    fetchPlans();
  }, []);

  const scrollTo = (id: string) => {
    document.getElementById(id)?.scrollIntoView({ behavior: "smooth" });
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-gray-50 to-white">
      {/* Header */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <Button variant="ghost" onClick={() => navigate(-1)} className="mb-6 gap-2">
          <ArrowLeft className="h-4 w-4" />
          Voltar
        </Button>

        <div className="text-center mb-10">
          <h1 className="text-3xl md:text-4xl font-bold text-gray-900 mb-4">
            Compare os Planos
          </h1>
          <p className="text-lg text-gray-600 max-w-2xl mx-auto mb-6">
            Escolha o plano ideal para o crescimento da sua loja de móveis planejados
          </p>

          {/* Period Toggle */}
          <div className="inline-flex items-center gap-3 bg-white rounded-full p-1 shadow-sm border border-gray-200">
            <button
              onClick={() => setAnnual(false)}
              className={`px-5 py-2 rounded-full text-sm font-medium transition-all ${
                !annual ? "bg-primary text-primary-foreground" : "text-muted-foreground"
              }`}
            >
              Mensal
            </button>
            <button
              onClick={() => setAnnual(true)}
              className={`px-5 py-2 rounded-full text-sm font-medium transition-all ${
                annual ? "bg-primary text-primary-foreground" : "text-muted-foreground"
              }`}
            >
              Anual <span className="text-xs opacity-75">(-15%)</span>
            </button>
          </div>
        </div>

        {/* Comparison Table */}
        <div className="overflow-x-auto">
          <table className="w-full border-collapse">
            {/* Plan Headers */}
            <thead>
              <tr>
                <th className="text-left p-4 w-1/4 min-w-[200px]" />
                {plans.map((plan) => {
                  const Icon = ICON_MAP[plan.slug] || Crown;
                  const price = annual ? plan.preco_anual_mensal : plan.preco_mensal;
                  const isEnterprise = plan.slug === "enterprise";
                  const isPremium = plan.destaque;

                  return (
                    <th
                      key={plan.id}
                      className={`p-6 text-center relative rounded-t-2xl min-w-[200px] ${
                        isEnterprise
                          ? "bg-gradient-to-b from-gray-900 to-gray-800 text-white"
                          : isPremium
                            ? "bg-primary/5 border-2 border-primary"
                            : "bg-white border border-gray-200"
                      }`}
                    >
                      {isPremium && !isEnterprise && (
                        <Badge className="absolute -top-3 left-1/2 -translate-x-1/2 bg-primary text-primary-foreground">
                          Mais Popular
                        </Badge>
                      )}
                      {isEnterprise && (
                        <Badge className="absolute -top-3 left-1/2 -translate-x-1/2 bg-amber-500 text-white">
                          Máximo Poder
                        </Badge>
                      )}
                      <div className="flex flex-col items-center gap-2">
                        <div className={`h-10 w-10 rounded-full flex items-center justify-center ${
                          isEnterprise ? "bg-amber-500/20" : "bg-primary/10"
                        }`}>
                          <Icon className={`h-5 w-5 ${isEnterprise ? "text-amber-400" : "text-primary"}`} />
                        </div>
                        <span className="text-lg font-bold">{plan.nome}</span>
                        <div className="flex items-baseline gap-1">
                          {price === 0 ? (
                            <span className="text-2xl font-extrabold">Grátis</span>
                          ) : (
                            <>
                              <span className="text-sm opacity-60">R$</span>
                              <span className="text-2xl font-extrabold">
                                {price.toFixed(2).replace(".", ",")}
                              </span>
                              <span className="text-sm opacity-60">/mês</span>
                            </>
                          )}
                        </div>
                        {plan.max_usuarios < 999 && (
                          <span className="text-xs opacity-60">até {plan.max_usuarios} usuários</span>
                        )}
                        {plan.max_usuarios >= 999 && plan.slug !== "trial" && (
                          <span className="text-xs opacity-60">usuários ilimitados</span>
                        )}
                      </div>
                    </th>
                  );
                })}
              </tr>
            </thead>

            <tbody>
              {FEATURE_CATEGORIES.map((category) => (
                <>
                  {/* Category Header */}
                  <tr key={`cat-${category.label}`}>
                    <td
                      colSpan={plans.length + 1}
                      className="px-4 py-3 bg-gray-100 font-semibold text-sm text-gray-700 uppercase tracking-wide"
                    >
                      {category.label}
                    </td>
                  </tr>

                  {/* Feature Rows */}
                  {category.features.map((feature) => (
                    <tr key={feature.key} className="border-b border-gray-100 hover:bg-gray-50/50">
                      <td className="px-4 py-3 text-sm text-gray-700 font-medium">
                        {feature.label}
                      </td>
                      {plans.map((plan) => {
                        const isEnterprise = plan.slug === "enterprise";
                        const isPremium = plan.destaque;
                        const isLimit = feature.key.startsWith("limit_");

                        if (isLimit) {
                          const val = LIMIT_VALUES[plan.slug]?.[feature.key] || "—";
                          return (
                            <td
                              key={`${plan.id}-${feature.key}`}
                              className={`px-4 py-3 text-center text-sm font-medium ${
                                isEnterprise
                                  ? "bg-gray-900/5"
                                  : isPremium
                                    ? "bg-primary/5"
                                    : ""
                              }`}
                            >
                              <span className={val === "—" ? "text-gray-300" : "text-foreground"}>
                                {val}
                              </span>
                            </td>
                          );
                        }

                        const hasFeature = plan.funcionalidades?.[feature.key] ?? false;
                        return (
                          <td
                            key={`${plan.id}-${feature.key}`}
                            className={`px-4 py-3 text-center ${
                              isEnterprise
                                ? "bg-gray-900/5"
                                : isPremium
                                  ? "bg-primary/5"
                                  : ""
                            }`}
                          >
                            {hasFeature ? (
                              <Check className={`h-5 w-5 mx-auto ${
                                isEnterprise ? "text-amber-500" : "text-primary"
                              }`} />
                            ) : (
                              <X className="h-5 w-5 mx-auto text-gray-300" />
                            )}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </>
              ))}

              {/* CTA Row */}
              <tr>
                <td className="p-4" />
                {plans.map((plan) => {
                  const isEnterprise = plan.slug === "enterprise";
                  const isPremium = plan.destaque;

                  return (
                    <td key={`cta-${plan.id}`} className={`p-6 text-center rounded-b-2xl ${
                      isEnterprise
                        ? "bg-gradient-to-b from-gray-800 to-gray-900"
                        : isPremium
                          ? "bg-primary/5 border-x-2 border-b-2 border-primary"
                          : "bg-white border-x border-b border-gray-200"
                    }`}>
                      <Button
                        className={`w-full ${
                          isEnterprise
                            ? "bg-amber-500 hover:bg-amber-600 text-white"
                            : isPremium
                              ? "bg-primary hover:bg-primary/90 text-primary-foreground"
                              : ""
                        }`}
                        variant={isPremium || isEnterprise ? "default" : "outline"}
                        onClick={() => navigate("/")}
                      >
                        {isEnterprise ? "Falar com consultor" : plan.slug === "trial" ? "Começar grátis" : "Assinar agora"}
                      </Button>
                    </td>
                  );
                })}
              </tr>
            </tbody>
          </table>
        </div>

        {/* Footer */}
        <p className="text-center text-sm text-muted-foreground mt-8">
          Todos os planos incluem 7 dias de teste grátis. Cancele a qualquer momento.
        </p>
      </div>
    </div>
  );
}
