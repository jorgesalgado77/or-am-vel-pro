import { Button } from "@/components/ui/button";
import { ArrowRight, Play, CheckCircle2 } from "lucide-react";
import heroImg from "@/assets/hero-furniture.jpg";

interface LandingHeroProps {
  title: string;
  subtitle: string;
  imageUrl: string | null;
  videoUrl: string | null;
  primaryColor: string;
  secondaryColor: string;
}

export function LandingHero({ title, subtitle, imageUrl, videoUrl, primaryColor, secondaryColor }: LandingHeroProps) {
  const scrollTo = (id: string) => {
    document.getElementById(id)?.scrollIntoView({ behavior: "smooth" });
  };

  const displayImage = imageUrl || heroImg;

  return (
    <section id="hero" className="relative pt-24 pb-16 md:pt-32 md:pb-24 overflow-hidden">
      {/* Background gradient */}
      <div
        className="absolute inset-0 opacity-[0.03]"
        style={{
          background: `radial-gradient(ellipse at 30% 20%, ${primaryColor}, transparent 70%), radial-gradient(ellipse at 70% 80%, ${secondaryColor}, transparent 70%)`,
        }}
      />

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10">
        <div className="grid lg:grid-cols-2 gap-12 items-center">
          <div className="space-y-8">
            {/* Trust badge */}
            <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-green-50 border border-green-200">
              <CheckCircle2 className="h-4 w-4 text-green-600" />
              <span className="text-sm font-medium text-green-700">+500 lojas já confiam no OrçaMóvel PRO</span>
            </div>

            <div className="space-y-5">
              <h1 className="text-4xl md:text-5xl lg:text-[3.5rem] font-extrabold text-gray-900 leading-[1.1] tracking-tight">
                {title}
              </h1>
              <p className="text-lg md:text-xl text-gray-600 leading-relaxed max-w-xl">
                {subtitle}
              </p>
            </div>

            <div className="flex flex-col sm:flex-row gap-4">
              <Button
                size="lg"
                onClick={() => scrollTo("lead-form")}
                style={{ backgroundColor: primaryColor }}
                className="text-white hover:opacity-90 transition-opacity text-base px-8 py-6 rounded-xl shadow-lg"
              >
                Testar grátis por 7 dias
                <ArrowRight className="ml-2 h-5 w-5" />
              </Button>
              <Button
                variant="outline"
                size="lg"
                onClick={() => scrollTo("how-it-works")}
                className="text-base px-8 py-6 rounded-xl border-2"
                style={{ borderColor: primaryColor, color: primaryColor }}
              >
                <Play className="mr-2 h-5 w-5" />
                Ver como funciona
              </Button>
            </div>

            <div className="flex flex-wrap items-center gap-6 text-sm text-gray-500">
              <div className="flex items-center gap-2">
                <div className="h-2 w-2 rounded-full bg-green-500" />
                Sem cartão de crédito
              </div>
              <div className="flex items-center gap-2">
                <div className="h-2 w-2 rounded-full bg-green-500" />
                Cancele quando quiser
              </div>
              <div className="flex items-center gap-2">
                <div className="h-2 w-2 rounded-full bg-green-500" />
                Suporte humanizado
              </div>
            </div>
          </div>

          <div className="relative">
            {videoUrl ? (
              <div className="rounded-2xl overflow-hidden shadow-2xl border border-gray-200">
                <video src={videoUrl} controls className="w-full" poster={displayImage} />
              </div>
            ) : (
              <div className="relative">
                <div className="rounded-2xl overflow-hidden shadow-2xl">
                  <img src={displayImage} alt="Móveis planejados de alta qualidade" className="w-full h-auto object-cover" />
                </div>
                {/* Floating stat card */}
                <div className="absolute -bottom-4 -left-4 bg-white rounded-xl shadow-lg p-4 border border-gray-100">
                  <p className="text-2xl font-bold" style={{ color: primaryColor }}>98%</p>
                  <p className="text-xs text-gray-500">de satisfação</p>
                </div>
                <div className="absolute -top-4 -right-4 bg-white rounded-xl shadow-lg p-4 border border-gray-100">
                  <p className="text-2xl font-bold text-green-600">3x</p>
                  <p className="text-xs text-gray-500">mais vendas</p>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
