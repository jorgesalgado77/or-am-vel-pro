import { forwardRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { ArrowRight, MessageCircle } from "lucide-react";
import { WhatsAppLeadDialog } from "./WhatsAppLeadDialog";

interface LandingCTAProps {
  text: string;
  primaryColor: string;
  secondaryColor: string;
  whatsappEnabled?: boolean;
  whatsappPhone?: string;
  whatsappMessage?: string;
}

export const LandingCTA = forwardRef<HTMLElement, LandingCTAProps>(
  function LandingCTA({ text, primaryColor, whatsappEnabled, whatsappPhone, whatsappMessage }, ref) {
  const [whatsappDialog, setWhatsappDialog] = useState(false);

  const scrollTo = (id: string) => {
    document.getElementById(id)?.scrollIntoView({ behavior: "smooth" });
  };

  return (
    <section className="py-20">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center space-y-8">
        <h2 className="text-3xl md:text-4xl font-bold text-gray-900">{text}</h2>
        <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
          <Button
            size="lg"
            onClick={() => scrollTo("lead-form")}
            style={{ backgroundColor: primaryColor }}
            className="text-white hover:opacity-90 text-base px-10 py-6 rounded-xl shadow-lg"
          >
            Escolher meu plano
            <ArrowRight className="ml-2 h-5 w-5" />
          </Button>

          {whatsappEnabled && whatsappPhone && (
            <Button
              variant="outline"
              size="lg"
              onClick={() => setWhatsappDialog(true)}
              className="text-base px-10 py-6 rounded-xl border-2 border-green-500 text-green-700 hover:bg-green-50"
            >
              <MessageCircle className="mr-2 h-5 w-5" />
              Falar agora com especialista
            </Button>
          )}
        </div>
      </div>

      {whatsappEnabled && whatsappPhone && (
        <WhatsAppLeadDialog
          open={whatsappDialog}
          onOpenChange={setWhatsappDialog}
          phone={whatsappPhone}
          message={whatsappMessage || "Quero começar agora. Qual plano você recomenda?"}
          primaryColor={primaryColor}
        />
      )}
    </section>
  );
});
