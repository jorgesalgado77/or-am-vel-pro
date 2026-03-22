import { Gift, Share2, DollarSign, ArrowRight } from "lucide-react";
import affiliateBanner from "@/assets/affiliate-banner.png";

interface LandingAffiliateProps {
  primaryColor: string;
  secondaryColor: string;
}

export function LandingAffiliate({ primaryColor, secondaryColor }: LandingAffiliateProps) {
  return (
    <section className="py-20 relative overflow-hidden" id="divulgue-e-ganhe">
      {/* Background gradient */}
      <div
        className="absolute inset-0 opacity-[0.06]"
        style={{
          background: `radial-gradient(ellipse at 30% 50%, ${primaryColor}, transparent 70%), radial-gradient(ellipse at 70% 50%, ${secondaryColor}, transparent 70%)`,
        }}
      />

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10">
        <div className="grid lg:grid-cols-2 gap-12 items-center">
          {/* Text content */}
          <div className="order-2 lg:order-1">
            <div
              className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full text-sm font-semibold text-white mb-6"
              style={{ backgroundColor: primaryColor }}
            >
              <Gift className="h-4 w-4" />
              Programa de Afiliados
            </div>

            <h2 className="text-3xl sm:text-4xl font-extrabold text-gray-900 mb-4 leading-tight">
              Divulgue e <span style={{ color: primaryColor }}>Ganhe</span> com o OrçaMóvel PRO
            </h2>

            <p className="text-lg text-gray-600 mb-8 leading-relaxed">
              Indique o OrçaMóvel PRO para marcenarias e lojas de móveis planejados e receba{" "}
              <strong className="text-gray-900">5% de comissão</strong> sobre cada nova assinatura.
              Basta compartilhar seu link exclusivo!
            </p>

            {/* Benefits mini-grid */}
            <div className="grid sm:grid-cols-3 gap-4 mb-10">
              {[
                { icon: Share2, title: "Compartilhe", desc: "Gere seu link exclusivo em segundos" },
                { icon: Gift, title: "Indique", desc: "Envie para amigos e parceiros do setor" },
                { icon: DollarSign, title: "Ganhe", desc: "Receba 5% de comissão via PIX" },
              ].map((item, i) => (
                <div
                  key={i}
                  className="bg-white rounded-xl p-4 shadow-sm border border-gray-100 text-center hover:shadow-md transition-shadow"
                >
                  <div
                    className="h-10 w-10 rounded-lg flex items-center justify-center mx-auto mb-3"
                    style={{ backgroundColor: `${primaryColor}15` }}
                  >
                    <item.icon className="h-5 w-5" style={{ color: primaryColor }} />
                  </div>
                  <h4 className="font-bold text-gray-900 text-sm mb-1">{item.title}</h4>
                  <p className="text-xs text-gray-500">{item.desc}</p>
                </div>
              ))}
            </div>

            {/* CTA Button */}
            <a
              href="/afiliado"
              className="inline-flex items-center gap-3 px-8 py-4 rounded-xl text-white font-bold text-lg shadow-lg hover:shadow-xl transition-all hover:scale-[1.02] active:scale-[0.98]"
              style={{
                background: `linear-gradient(135deg, ${primaryColor}, ${secondaryColor})`,
              }}
            >
              <Gift className="h-5 w-5" />
              Quero Divulgar e Ganhar
              <ArrowRight className="h-5 w-5" />
            </a>

            <p className="text-xs text-gray-400 mt-3">
              Cadastro gratuito • Sem limite de indicações • Pagamento via PIX
            </p>
          </div>

          {/* Image */}
          <div className="order-1 lg:order-2 flex justify-center">
            <div className="relative">
              <div
                className="absolute -inset-4 rounded-3xl opacity-20 blur-2xl"
                style={{ background: `linear-gradient(135deg, ${primaryColor}, ${secondaryColor})` }}
              />
              <img
                src={affiliateBanner}
                alt="Programa de afiliados Divulgue e Ganhe"
                className="relative w-full max-w-md rounded-2xl"
                loading="lazy"
              />
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
