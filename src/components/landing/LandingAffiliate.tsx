import { Gift, Share2, DollarSign, ArrowRight, Users, Star, Heart } from "lucide-react";
import { AnimatedSection, StaggerContainer, StaggerItem } from "./AnimatedSection";
import affiliateBanner from "@/assets/affiliate-banner.png";
import type { AffiliateConfig } from "@/hooks/useLandingConfig";

interface LandingAffiliateProps {
  primaryColor: string;
  secondaryColor: string;
  affiliateConfig?: AffiliateConfig;
}

const ICON_MAP: Record<string, React.ComponentType<{ className?: string; style?: React.CSSProperties }>> = {
  Share2, Gift, DollarSign, Users, Star, Heart,
};

export function LandingAffiliate({ primaryColor, secondaryColor, affiliateConfig }: LandingAffiliateProps) {
  const cfg = affiliateConfig || {
    badge_text: "Programa de Afiliados",
    title_prefix: "Qualquer pessoa pode",
    title_highlight: "Divulgar e Ganhar",
    title_suffix: "com o OrçaMóvel PRO",
    description: "Indique o OrçaMóvel PRO para Lojas de Móveis Planejados e receba 5% de comissão sobre cada nova assinatura. Basta compartilhar seu link exclusivo!",
    steps: [
      { icon: "Share2", title: "Compartilhe", description: "Gere seu link exclusivo em segundos" },
      { icon: "Gift", title: "Indique", description: "Envie para amigos e parceiros do setor" },
      { icon: "DollarSign", title: "Ganhe", description: "Receba 5% de comissão via PIX" },
    ],
    cta_text: "Quero Divulgar e Ganhar",
    cta_subtext: "Cadastro gratuito • Sem limite de indicações • Pagamento via PIX",
    image_url: null,
  };

  const imageUrl = cfg.image_url || affiliateBanner;

  return (
    <section className="py-12 sm:py-20 relative overflow-hidden" id="divulgue-e-ganhe">
      <div
        className="absolute inset-0 opacity-[0.06]"
        style={{
          background: `radial-gradient(ellipse at 30% 50%, ${primaryColor}, transparent 70%), radial-gradient(ellipse at 70% 50%, ${secondaryColor}, transparent 70%)`,
        }}
      />

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10">
        <div className="grid lg:grid-cols-2 gap-8 lg:gap-12 items-center">
          <AnimatedSection variant="slideLeft" className="order-2 lg:order-1">
            <div
              className="inline-flex items-center gap-2 px-3 py-1 sm:px-4 sm:py-1.5 rounded-full text-xs sm:text-sm font-semibold text-white mb-4 sm:mb-6"
              style={{ backgroundColor: primaryColor }}
            >
              <Gift className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
              {cfg.badge_text}
            </div>

            <h2 className="text-2xl sm:text-3xl lg:text-4xl font-extrabold text-gray-900 mb-3 sm:mb-4 leading-tight">
              {cfg.title_prefix}{" "}
              <span style={{ color: primaryColor }}>{cfg.title_highlight}</span>{" "}
              {cfg.title_suffix}
            </h2>

            <p className="text-sm sm:text-lg text-gray-600 mb-6 sm:mb-8 leading-relaxed">
              {cfg.description}
            </p>

            <StaggerContainer className="grid grid-cols-3 gap-2 sm:gap-4 mb-6 sm:mb-10">
              {cfg.steps.map((item, i) => {
                const IconComp = ICON_MAP[item.icon] || Gift;
                return (
                  <StaggerItem key={i}>
                    <div className="bg-white rounded-lg sm:rounded-xl p-2.5 sm:p-4 shadow-sm border border-gray-100 text-center hover:shadow-md transition-shadow">
                      <div
                        className="h-8 w-8 sm:h-10 sm:w-10 rounded-lg flex items-center justify-center mx-auto mb-2 sm:mb-3"
                        style={{ backgroundColor: `${primaryColor}15` }}
                      >
                        <IconComp className="h-4 w-4 sm:h-5 sm:w-5" style={{ color: primaryColor }} />
                      </div>
                      <h4 className="font-bold text-gray-900 text-xs sm:text-sm mb-0.5 sm:mb-1">{item.title}</h4>
                      <p className="text-[10px] sm:text-xs text-gray-500 hidden sm:block">{item.description}</p>
                    </div>
                  </StaggerItem>
                );
              })}
            </StaggerContainer>

            <a
              href="/afiliado"
              className="inline-flex items-center gap-2 sm:gap-3 px-5 sm:px-8 py-3 sm:py-4 rounded-xl text-white font-bold text-sm sm:text-lg shadow-lg hover:shadow-xl transition-all hover:scale-[1.02] active:scale-[0.98]"
              style={{
                background: `linear-gradient(135deg, ${primaryColor}, ${secondaryColor})`,
              }}
            >
              <Gift className="h-4 w-4 sm:h-5 sm:w-5" />
              {cfg.cta_text}
              <ArrowRight className="h-4 w-4 sm:h-5 sm:w-5" />
            </a>

            <p className="text-[10px] sm:text-xs text-gray-400 mt-2 sm:mt-3">
              {cfg.cta_subtext}
            </p>
          </AnimatedSection>

          <AnimatedSection variant="slideRight" className="order-1 lg:order-2 flex justify-center">
            <div className="relative">
              <div
                className="absolute -inset-4 rounded-3xl opacity-20 blur-2xl"
                style={{ background: `linear-gradient(135deg, ${primaryColor}, ${secondaryColor})` }}
              />
              <img
                src={imageUrl}
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
