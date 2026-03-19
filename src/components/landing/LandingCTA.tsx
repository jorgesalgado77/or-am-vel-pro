import { Button } from "@/components/ui/button";
import { ArrowRight } from "lucide-react";

interface LandingCTAProps {
  text: string;
  primaryColor: string;
  secondaryColor: string;
}

export function LandingCTA({ text, primaryColor, secondaryColor }: LandingCTAProps) {
  const scrollTo = (id: string) => {
    document.getElementById(id)?.scrollIntoView({ behavior: "smooth" });
  };

  return (
    <section className="py-20">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center space-y-8">
        <h2 className="text-3xl md:text-4xl font-bold text-gray-900">{text}</h2>
        <Button
          size="lg"
          onClick={() => scrollTo("lead-form")}
          style={{ backgroundColor: primaryColor }}
          className="text-white hover:opacity-90 text-base px-10 py-6 rounded-xl shadow-lg"
        >
          Testar grátis por 7 dias
          <ArrowRight className="ml-2 h-5 w-5" />
        </Button>
      </div>
    </section>
  );
}
