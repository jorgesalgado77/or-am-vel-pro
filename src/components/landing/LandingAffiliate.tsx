import { Gift, Share2, DollarSign, ArrowRight } from "lucide-react";
import { AnimatedSection, StaggerContainer, StaggerItem } from "./AnimatedSection";
import affiliateBanner from "@/assets/affiliate-banner.png";

interface LandingAffiliateProps {
  primaryColor: string;
  secondaryColor: string;
}

export function LandingAffiliate({ primaryColor, secondaryColor }: LandingAffiliateProps) {
  return (
    <section className="py-12 sm:py-20 relative overflow-hidden" id="divulgue-e-ganhe">
      {/* Background gradient */}
      <div
        className="absolute inset-0 opacity-[0.06]"
        style={{
          background: `radial-gradient(ellipse at 30% 50%, ${primaryColor}, transparent 70%), radial-gradient(ellipse at 70% 50%, ${secondaryColor}, transparent 70%)`,
        }}
      />

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10">
        <div className="grid lg:grid-cols-2 gap-8 lg:gap-12 items-center">
          {/* Text content */}
          <AnimatedSection variant="slideLeft" className="order-2 lg:order-1">
            <div
              className="inline-flex items-center gap-2 px-3 py-1 sm:px-4 sm:py-1.5 rounded-full text-xs sm:text-sm font-semibold text-white mb-4 sm:mb-6"
              style={{ backgroundColor: primaryColor }}
            >
              <Gift className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
              Programa de Afiliados
            </div>

            <h2 className="text-2xl sm:text-3xl lg:text-4xl font-extrabold text-gray-900 mb-3 sm:mb-4 leading-tight">
              Divulgue e <span style={{ color: primaryColor }}>Ganhe</span> com o OrçaMóvel PRO
            </h2>

            <p className="text-sm sm:text-lg text-gray-600 mb-6 sm:mb-8 leading-relaxed">
              Indique o OrçaMóvel PRO para marcenarias e lojas de móveis planejados e receba{" "}
              <strong className="text-gray-900">5% de comissão</strong> sobre cada nova assinatura.
              Basta compartilhar seu link exclusivo!
            </p>

            {/* Benefits mini-grid */}
            <StaggerContainer className="grid grid-cols-3 gap-2 sm:gap-4 mb-6 sm:mb-10">
              {[
                { icon: Share2, title: "Compartilhe", desc: "Gere seu link exclusivo em segundos" },
                { icon: Gift, title: "Indique", desc: "Envie para amigos e parceiros do setor" },
                { icon: DollarSign, title: "Ganhe", desc: "Receba 5% de comissão via PIX" },
              ].map((item, i) => (
                <StaggerItem key={i}>
                  <div className="bg-white rounded-lg sm:rounded-xl p-2.5 sm:p-4 shadow-sm border border-gray-100 text-center hover:shadow-md transition-shadow">
                    <div
                      className="h-8 w-8 sm:h-10 sm:w-10 rounded-lg flex items-center justify-center mx-auto mb-2 sm:mb-3"
                      style={{ backgroundColor: `${primaryColor}15` }}
                    >
                      <item.icon className="h-4 w-4 sm:h-5 sm:w-5" style={{ color: primaryColor }} />
                    </div>
                    <h4 className="font-bold text-gray-900 text-xs sm:text-sm mb-0.5 sm:mb-1">{item.title}</h4>
                    <p className="text-[10px] sm:text-xs text-gray-500 hidden sm:block">{item.desc}</p>
                  </div>
                </StaggerItem>
              ))}
            </StaggerContainer>

            {/* CTA Button */}
            <a
              href="/afiliado"
              className="inline-flex items-center gap-2 sm:gap-3 px-5 sm:px-8 py-3 sm:py-4 rounded-xl text-white font-bold text-sm sm:text-lg shadow-lg hover:shadow-xl transition-all hover:scale-[1.02] active:scale-[0.98]"
              style={{
                background: `linear-gradient(135deg, ${primaryColor}, ${secondaryColor})`,
              }}
            >
              <Gift className="h-4 w-4 sm:h-5 sm:w-5" />
              Quero Divulgar e Ganhar
              <ArrowRight className="h-4 w-4 sm:h-5 sm:w-5" />
            </a>

            <p className="text-[10px] sm:text-xs text-gray-400 mt-2 sm:mt-3">
              Cadastro gratuito • Sem limite de indicações • Pagamento via PIX
            </p>
          </AnimatedSection>

          {/* Image */}
          <AnimatedSection variant="slideRight" className="order-1 lg:order-2 flex justify-center">
            <div className="relative">
              <div
                className="absolute -inset-4 rounded-3xl opacity-20 blur-2xl"
                style={{ background: `linear-gradient(135deg, ${primaryColor}, ${secondaryColor})` }}
              />
              <img
                src={affiliateBanner}
                alt="Programa de afiliados Divulgue e Ganhe"
                className="relative w-full max-w-[280px] sm:max-w-md rounded-2xl"
                loading="lazy"
              />
            </div>
          </AnimatedSection>
        </div>
      </div>
    </section>
  );
}
