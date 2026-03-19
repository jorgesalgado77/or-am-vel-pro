import { Calculator, Handshake, CreditCard, FileText, Users, LayoutDashboard, type LucideIcon } from "lucide-react";
import type { BenefitItem } from "@/hooks/useLandingConfig";
import { AnimatedSection, StaggerContainer, StaggerItem } from "./AnimatedSection";
import benefitLiving from "@/assets/benefit-living.jpg";
import benefitCloset from "@/assets/benefit-closet.jpg";

const ICON_MAP: Record<string, LucideIcon> = {
  Calculator, Handshake, CreditCard, FileText, Users, LayoutDashboard,
};

interface LandingBenefitsProps {
  benefits: BenefitItem[];
  primaryColor: string;
  secondaryColor: string;
}

export function LandingBenefits({ benefits, primaryColor }: LandingBenefitsProps) {
  return (
    <section id="benefits" className="py-20 bg-gray-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <AnimatedSection>
          <div className="text-center mb-16">
            <span
              className="inline-block text-sm font-semibold tracking-wider uppercase mb-3 px-4 py-1 rounded-full"
              style={{ backgroundColor: `${primaryColor}10`, color: primaryColor }}
            >
              Por que escolher o OrçaMóvel PRO?
            </span>
            <h2 className="text-3xl md:text-4xl font-bold text-gray-900 mb-4">
              Tudo que você precisa para <span style={{ color: primaryColor }}>vender mais</span>
            </h2>
            <p className="text-lg text-gray-600 max-w-2xl mx-auto">
              Ferramentas poderosas que transformam seu processo comercial em uma máquina de vendas.
            </p>
          </div>
        </AnimatedSection>

        {/* Image showcase */}
        <div className="grid md:grid-cols-2 gap-6 mb-16">
          <AnimatedSection variant="slideLeft">
            <div className="relative rounded-2xl overflow-hidden shadow-lg group">
              <img src={benefitLiving} alt="Sala planejada sob medida" className="w-full h-64 object-cover group-hover:scale-105 transition-transform duration-500" />
              <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent flex items-end p-6">
                <div>
                  <p className="text-white font-bold text-lg">Seus projetos merecem um orçamento à altura</p>
                  <p className="text-white/80 text-sm">Orçamentos profissionais que impressionam seus clientes</p>
                </div>
              </div>
            </div>
          </AnimatedSection>
          <AnimatedSection variant="slideRight">
            <div className="relative rounded-2xl overflow-hidden shadow-lg group">
              <img src={benefitCloset} alt="Closet sob medida premium" className="w-full h-64 object-cover group-hover:scale-105 transition-transform duration-500" />
              <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent flex items-end p-6">
                <div>
                  <p className="text-white font-bold text-lg">Do orçamento ao contrato em minutos</p>
                  <p className="text-white/80 text-sm">Automatize e feche mais vendas com menos esforço</p>
                </div>
              </div>
            </div>
          </AnimatedSection>
        </div>

        <StaggerContainer className="grid md:grid-cols-2 lg:grid-cols-3 gap-8">
          {benefits.map((benefit, i) => {
            const IconComp = ICON_MAP[benefit.icon] || Calculator;
            return (
              <StaggerItem key={i}>
                <div className="bg-white rounded-2xl p-8 shadow-sm border border-gray-100 hover:shadow-lg hover:border-gray-200 transition-all duration-300 group h-full">
                  <div
                    className="h-14 w-14 rounded-xl flex items-center justify-center mb-6 group-hover:scale-110 transition-transform duration-300"
                    style={{ backgroundColor: `${primaryColor}12` }}
                  >
                    <IconComp className="h-7 w-7" style={{ color: primaryColor }} />
                  </div>
                  <h3 className="text-lg font-bold text-gray-900 mb-2">{benefit.title}</h3>
                  <p className="text-gray-600 leading-relaxed">{benefit.description}</p>
                </div>
              </StaggerItem>
            );
          })}
        </StaggerContainer>
      </div>
    </section>
  );
}
