import { Button } from "@/components/ui/button";
import { ArrowRight, TrendingUp, Shield, Zap, Quote } from "lucide-react";
import { AnimatedSection, StaggerContainer, StaggerItem } from "./AnimatedSection";

interface LandingProofProps {
  text: string;
  primaryColor: string;
  secondaryColor: string;
}

export function LandingProof({ text, primaryColor, secondaryColor }: LandingProofProps) {
  const scrollTo = (id: string) => {
    document.getElementById(id)?.scrollIntoView({ behavior: "smooth" });
  };

  return (
    <section className="py-20 bg-white">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Stats bar */}
        <StaggerContainer className="grid grid-cols-2 md:grid-cols-4 gap-6 mb-16">
          {[
            { value: "+500", label: "Lojas ativas" },
            { value: "98%", label: "Satisfação" },
            { value: "3x", label: "Mais vendas" },
            { value: "70%", label: "Menos tempo" },
          ].map((stat, i) => (
            <StaggerItem key={i}>
              <div className="text-center p-6 rounded-2xl bg-gray-50 border border-gray-100">
                <p className="text-3xl md:text-4xl font-extrabold mb-1" style={{ color: primaryColor }}>{stat.value}</p>
                <p className="text-sm text-gray-600">{stat.label}</p>
              </div>
            </StaggerItem>
          ))}
        </StaggerContainer>

        {/* CTA banner */}
        <AnimatedSection variant="scaleUp">
          <div
            className="rounded-3xl p-12 md:p-16 text-center relative overflow-hidden"
            style={{ background: `linear-gradient(135deg, ${primaryColor}, ${secondaryColor})` }}
          >
            <div className="absolute inset-0 opacity-10">
              <div className="absolute top-10 left-10"><TrendingUp className="h-24 w-24 text-white" /></div>
              <div className="absolute bottom-10 right-10"><Shield className="h-20 w-20 text-white" /></div>
              <div className="absolute top-20 right-20"><Zap className="h-16 w-16 text-white" /></div>
            </div>

            <div className="relative z-10 space-y-6">
              <Quote className="h-10 w-10 text-white/30 mx-auto" />
              <h2 className="text-3xl md:text-4xl font-bold text-white leading-tight max-w-3xl mx-auto">
                {text}
              </h2>
              <p className="text-white/80 text-lg max-w-xl mx-auto">
                Junte-se a centenas de marcenarias e lojas que já transformaram seus resultados.
              </p>
              <Button
                size="lg"
                onClick={() => scrollTo("lead-form")}
                className="bg-white hover:bg-gray-100 text-base px-8 py-6 rounded-xl shadow-lg"
                style={{ color: primaryColor }}
              >
                Quero transformar minhas vendas
                <ArrowRight className="ml-2 h-5 w-5" />
              </Button>
            </div>
          </div>
        </AnimatedSection>
      </div>
    </section>
  );
}
