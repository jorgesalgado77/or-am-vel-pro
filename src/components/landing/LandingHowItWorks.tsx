import type { HowItWorksStep } from "@/hooks/useLandingConfig";
import { ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { AnimatedSection, StaggerContainer, StaggerItem } from "./AnimatedSection";

interface LandingHowItWorksProps {
  steps: HowItWorksStep[];
  primaryColor: string;
  secondaryColor: string;
}

export function LandingHowItWorks({ steps, primaryColor }: LandingHowItWorksProps) {
  const scrollTo = (id: string) => {
    document.getElementById(id)?.scrollIntoView({ behavior: "smooth" });
  };

  return (
    <section id="how-it-works" className="py-20 bg-gray-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <AnimatedSection>
          <div className="text-center mb-16">
            <span
              className="inline-block text-sm font-semibold tracking-wider uppercase mb-3 px-4 py-1 rounded-full"
              style={{ backgroundColor: `${primaryColor}10`, color: primaryColor }}
            >
              Simples e rápido
            </span>
            <h2 className="text-3xl md:text-4xl font-bold text-gray-900 mb-4">
              Comece a vender mais em <span style={{ color: primaryColor }}>3 passos</span>
            </h2>
            <p className="text-lg text-gray-600 max-w-2xl mx-auto">
              Chega de planilhas e anotações perdidas. Tenha controle total do seu processo comercial.
            </p>
          </div>
        </AnimatedSection>

        <StaggerContainer className="grid md:grid-cols-3 gap-8 relative mb-12">
          {/* Connecting line */}
          <div className="hidden md:block absolute top-16 left-[16%] right-[16%] h-0.5" style={{ backgroundColor: `${primaryColor}20` }} />

          {steps.map((step, i) => (
            <StaggerItem key={i}>
              <div className="relative text-center group">
                <div
                  className="h-16 w-16 rounded-full flex items-center justify-center text-white text-2xl font-bold mx-auto mb-6 relative z-10 shadow-lg group-hover:scale-110 transition-transform duration-300"
                  style={{ backgroundColor: primaryColor }}
                >
                  {step.step}
                </div>
                <h3 className="text-xl font-bold text-gray-900 mb-3">{step.title}</h3>
                <p className="text-gray-600 leading-relaxed max-w-xs mx-auto">{step.description}</p>
              </div>
            </StaggerItem>
          ))}
        </StaggerContainer>

        <AnimatedSection>
          <div className="text-center">
            <Button
              size="lg"
              onClick={() => scrollTo("lead-form")}
              style={{ backgroundColor: primaryColor }}
              className="text-white hover:opacity-90 text-base px-8 py-6 rounded-xl shadow-lg"
            >
              Começar agora
              <ArrowRight className="ml-2 h-5 w-5" />
            </Button>
          </div>
        </AnimatedSection>
      </div>
    </section>
  );
}
