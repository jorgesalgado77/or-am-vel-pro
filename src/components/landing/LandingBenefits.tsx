import { Calculator, Handshake, CreditCard, FileText, Users, LayoutDashboard, type LucideIcon } from "lucide-react";
import type { BenefitItem } from "@/hooks/useLandingConfig";

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
        <div className="text-center mb-16">
          <h2 className="text-3xl md:text-4xl font-bold text-gray-900 mb-4">
            Tudo que você precisa para <span style={{ color: primaryColor }}>vender mais</span>
          </h2>
          <p className="text-lg text-gray-600 max-w-2xl mx-auto">
            Ferramentas poderosas reunidas em uma plataforma simples e intuitiva.
          </p>
        </div>

        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8">
          {benefits.map((benefit, i) => {
            const IconComp = ICON_MAP[benefit.icon] || Calculator;
            return (
              <div
                key={i}
                className="bg-white rounded-2xl p-8 shadow-sm border border-gray-100 hover:shadow-lg hover:border-gray-200 transition-all duration-300 group"
              >
                <div
                  className="h-14 w-14 rounded-xl flex items-center justify-center mb-6 group-hover:scale-110 transition-transform duration-300"
                  style={{ backgroundColor: `${primaryColor}12` }}
                >
                  <IconComp className="h-7 w-7" style={{ color: primaryColor }} />
                </div>
                <h3 className="text-lg font-bold text-gray-900 mb-2">{benefit.title}</h3>
                <p className="text-gray-600 leading-relaxed">{benefit.description}</p>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
