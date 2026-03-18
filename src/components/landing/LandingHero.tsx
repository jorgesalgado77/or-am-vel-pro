import { Button } from "@/components/ui/button";
import { ArrowRight, Play } from "lucide-react";

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

  return (
    <section id="hero" className="relative pt-24 pb-16 md:pt-32 md:pb-24 overflow-hidden">
      {/* Background gradient */}
      <div
        className="absolute inset-0 opacity-5"
        style={{
          background: `radial-gradient(ellipse at 30% 20%, ${primaryColor}, transparent 70%), radial-gradient(ellipse at 70% 80%, ${secondaryColor}, transparent 70%)`,
        }}
      />

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10">
        <div className="grid lg:grid-cols-2 gap-12 items-center">
          <div className="space-y-8">
            <div className="space-y-4">
              <h1 className="text-4xl md:text-5xl lg:text-6xl font-extrabold text-gray-900 leading-tight tracking-tight">
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

            <div className="flex items-center gap-6 text-sm text-gray-500">
              <div className="flex items-center gap-2">
                <div className="h-2 w-2 rounded-full bg-green-500" />
                Sem cartão de crédito
              </div>
              <div className="flex items-center gap-2">
                <div className="h-2 w-2 rounded-full bg-green-500" />
                Cancele quando quiser
              </div>
            </div>
          </div>

          <div className="relative">
            {videoUrl ? (
              <div className="rounded-2xl overflow-hidden shadow-2xl border border-gray-200">
                <video src={videoUrl} controls className="w-full" poster={imageUrl || undefined} />
              </div>
            ) : imageUrl ? (
              <div className="rounded-2xl overflow-hidden shadow-2xl border border-gray-200">
                <img src={imageUrl} alt="OrçaMóvel PRO" className="w-full h-auto" />
              </div>
            ) : (
              <div
                className="rounded-2xl p-8 shadow-2xl border border-gray-200"
                style={{ background: `linear-gradient(135deg, ${primaryColor}08, ${secondaryColor}15)` }}
              >
                <div className="bg-white rounded-xl shadow-lg p-6 space-y-4">
                  <div className="flex items-center gap-3">
                    <div className="h-3 w-3 rounded-full bg-red-400" />
                    <div className="h-3 w-3 rounded-full bg-yellow-400" />
                    <div className="h-3 w-3 rounded-full bg-green-400" />
                    <div className="flex-1 h-6 bg-gray-100 rounded ml-2" />
                  </div>
                  <div className="grid grid-cols-4 gap-3">
                    {[1, 2, 3, 4].map(i => (
                      <div key={i} className="h-20 rounded-lg" style={{ backgroundColor: i === 1 ? `${primaryColor}15` : "#f3f4f6" }} />
                    ))}
                  </div>
                  <div className="space-y-2">
                    <div className="h-4 bg-gray-100 rounded w-3/4" />
                    <div className="h-4 bg-gray-100 rounded w-1/2" />
                    <div className="h-32 rounded-lg" style={{ backgroundColor: `${secondaryColor}10` }} />
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
