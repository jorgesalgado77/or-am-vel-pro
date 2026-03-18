import type { HowItWorksStep } from "@/hooks/useLandingConfig";

interface LandingHowItWorksProps {
  steps: HowItWorksStep[];
  primaryColor: string;
  secondaryColor: string;
}

export function LandingHowItWorks({ steps, primaryColor }: LandingHowItWorksProps) {
  return (
    <section id="how-it-works" className="py-20 bg-gray-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center mb-16">
          <h2 className="text-3xl md:text-4xl font-bold text-gray-900 mb-4">
            Como <span style={{ color: primaryColor }}>funciona</span>
          </h2>
          <p className="text-lg text-gray-600 max-w-2xl mx-auto">
            Em apenas 3 passos simples, transforme seu processo de vendas.
          </p>
        </div>

        <div className="grid md:grid-cols-3 gap-8 relative">
          {/* Connecting line */}
          <div className="hidden md:block absolute top-16 left-1/6 right-1/6 h-0.5 bg-gray-200" />

          {steps.map((step, i) => (
            <div key={i} className="relative text-center">
              <div
                className="h-16 w-16 rounded-full flex items-center justify-center text-white text-2xl font-bold mx-auto mb-6 relative z-10 shadow-lg"
                style={{ backgroundColor: primaryColor }}
              >
                {step.step}
              </div>
              <h3 className="text-xl font-bold text-gray-900 mb-3">{step.title}</h3>
              <p className="text-gray-600 leading-relaxed max-w-xs mx-auto">{step.description}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
