import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { AnimatedSection, StaggerContainer, StaggerItem } from "./AnimatedSection";
import {
  Video, Bot, MessageSquare, Sparkles, Shield,
  FileText, CreditCard, ArrowRight, Zap, Brain,
  Target, BarChart3, Users,
} from "lucide-react";

interface LandingAddonsProps {
  primaryColor: string;
}

const ADDONS = [
  {
    id: "dealroom",
    name: "Deal Room",
    emoji: "🎥",
    price: "R$ 147/mês + 2% por venda",
    description: "Feche vendas em tempo real com apresentações profissionais e pagamento integrado.",
    icon: Video,
    features: [
      { icon: Video, label: "Reunião por vídeo integrada" },
      { icon: Target, label: "Apresentação de projeto ao vivo" },
      { icon: MessageSquare, label: "Negociação em tempo real" },
      { icon: CreditCard, label: "Pagamento integrado na sala" },
      { icon: FileText, label: "Contrato automático pós-venda" },
      { icon: Shield, label: "Ambiente seguro e profissional" },
    ],
    gradient: "from-blue-600 to-indigo-600",
  },
  {
    id: "vendazap",
    name: "VendaZap AI",
    emoji: "🤖",
    price: "R$ 69/mês",
    description: "Assistente inteligente que gera mensagens persuasivas para WhatsApp e aumenta sua conversão.",
    icon: Bot,
    features: [
      { icon: Sparkles, label: "Mensagens prontas para WhatsApp" },
      { icon: Brain, label: "Respostas inteligentes com IA" },
      { icon: MessageSquare, label: "Análise de mensagens do cliente" },
      { icon: Zap, label: "Sugestão automática de abordagem" },
      { icon: BarChart3, label: "Classificação de clientes (🔥🟡❄️)" },
      { icon: Users, label: "Copys prontas por tipo de situação" },
    ],
    gradient: "from-green-600 to-emerald-600",
  },
];

export function LandingAddons({ primaryColor }: LandingAddonsProps) {
  const scrollTo = (id: string) => {
    document.getElementById(id)?.scrollIntoView({ behavior: "smooth" });
  };

  return (
    <section id="addons" className="py-20 bg-gray-900 text-white relative overflow-hidden">
      {/* Background decoration */}
      <div className="absolute inset-0 opacity-10">
        <div className="absolute top-0 left-1/4 w-96 h-96 rounded-full bg-gradient-to-br from-blue-500 to-purple-500 blur-3xl" />
        <div className="absolute bottom-0 right-1/4 w-96 h-96 rounded-full bg-gradient-to-br from-green-500 to-emerald-500 blur-3xl" />
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10">
        <AnimatedSection>
          <div className="text-center mb-16">
            <Badge className="bg-white/10 text-white border-white/20 mb-4 text-sm px-4 py-1.5">
              ⚡ ADD-ONS PREMIUM
            </Badge>
            <h2 className="text-3xl md:text-4xl font-bold mb-4">
              Potencialize suas vendas com{" "}
              <span className="bg-gradient-to-r from-blue-400 to-green-400 bg-clip-text text-transparent">
                inteligência artificial
              </span>
            </h2>
            <p className="text-lg text-gray-400 max-w-2xl mx-auto">
              Ferramentas exclusivas que transformam sua operação comercial e aumentam sua taxa de conversão.
            </p>
          </div>
        </AnimatedSection>

        <StaggerContainer className="grid md:grid-cols-2 gap-8 max-w-5xl mx-auto">
          {ADDONS.map((addon) => (
            <StaggerItem key={addon.id}>
              <div className="bg-white/5 backdrop-blur-sm border border-white/10 rounded-2xl p-8 h-full flex flex-col hover:bg-white/10 transition-all duration-300 group">
                <div className="flex items-center gap-3 mb-4">
                  <div className={`w-12 h-12 rounded-xl bg-gradient-to-br ${addon.gradient} flex items-center justify-center shadow-lg`}>
                    <addon.icon className="h-6 w-6 text-white" />
                  </div>
                  <div>
                    <h3 className="text-xl font-bold flex items-center gap-2">
                      {addon.emoji} {addon.name}
                    </h3>
                    <p className="text-sm text-gray-400">{addon.price}</p>
                  </div>
                </div>

                <p className="text-gray-300 text-sm mb-6">{addon.description}</p>

                <ul className="space-y-3 mb-8 flex-1">
                  {addon.features.map((feature, j) => (
                    <li key={j} className="flex items-center gap-3 text-sm text-gray-300">
                      <div className="w-6 h-6 rounded-md bg-white/10 flex items-center justify-center shrink-0">
                        <feature.icon className="h-3.5 w-3.5 text-white" />
                      </div>
                      {feature.label}
                    </li>
                  ))}
                </ul>

                <Button
                  onClick={() => scrollTo("lead-form")}
                  variant="outline"
                  className="w-full border-white/20 text-white hover:bg-white/10 group-hover:border-white/40 transition-all"
                >
                  Quero ativar
                  <ArrowRight className="ml-2 h-4 w-4" />
                </Button>
              </div>
            </StaggerItem>
          ))}
        </StaggerContainer>

        <AnimatedSection>
          <div className="text-center mt-12">
            <Button
              size="lg"
              onClick={() => scrollTo("lead-form")}
              className="text-base px-8 py-6 rounded-xl shadow-2xl bg-gradient-to-r from-blue-600 to-green-600 hover:from-blue-700 hover:to-green-700 text-white border-0"
            >
              <Zap className="mr-2 h-5 w-5" />
              Ative os add-ons e venda mais todos os dias
            </Button>
            <p className="text-xs text-gray-500 mt-3">
              Add-ons vendidos separadamente. Funcionam com qualquer plano.
            </p>
          </div>
        </AnimatedSection>
      </div>
    </section>
  );
}
