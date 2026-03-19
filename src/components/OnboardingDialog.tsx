import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Bot, Sparkles, MessageSquare, Target, Copy, Send,
  Video, FileText, CreditCard, Handshake, ArrowRight, Check,
} from "lucide-react";

interface OnboardingStep {
  icon: React.ReactNode;
  title: string;
  description: string;
}

interface OnboardingDialogProps {
  featureKey: "vendazap" | "dealroom";
  open: boolean;
  onClose: () => void;
}

const VENDAZAP_STEPS: OnboardingStep[] = [
  {
    icon: <Bot className="h-8 w-8 text-primary" />,
    title: "Assistente de Vendas com IA",
    description: "O VendaZap AI gera mensagens persuasivas para WhatsApp, analisando o contexto de cada cliente automaticamente.",
  },
  {
    icon: <MessageSquare className="h-8 w-8 text-primary" />,
    title: "Tipos de Mensagem",
    description: "Escolha entre reativação, urgência, quebra de objeção, convite para reunião ou fechamento. A IA adapta o tom ideal.",
  },
  {
    icon: <Target className="h-8 w-8 text-primary" />,
    title: "Análise de Objeções",
    description: "Cole a mensagem do cliente e a IA identifica objeções, gerando a resposta ideal para contornar e avançar a venda.",
  },
  {
    icon: <Copy className="h-8 w-8 text-primary" />,
    title: "Copiar e Enviar",
    description: "Com um clique, copie a mensagem e abra o WhatsApp do cliente direto. Sugestões automáticas aparecem ao abrir cada lead.",
  },
];

const DEALROOM_STEPS: OnboardingStep[] = [
  {
    icon: <Video className="h-8 w-8 text-primary" />,
    title: "Reuniões de Venda",
    description: "A Deal Room permite conduzir reuniões por vídeo com apresentação de projeto e negociação em tempo real.",
  },
  {
    icon: <FileText className="h-8 w-8 text-primary" />,
    title: "Contratos Automáticos",
    description: "Após a negociação, gere contratos automaticamente com os dados do cliente e simulação vinculados.",
  },
  {
    icon: <CreditCard className="h-8 w-8 text-primary" />,
    title: "Pagamento Integrado",
    description: "O cliente pode efetuar o pagamento diretamente pela plataforma, com rastreamento completo.",
  },
  {
    icon: <Handshake className="h-8 w-8 text-primary" />,
    title: "Acompanhamento",
    description: "Visualize métricas de vendas, ranking de vendedores e taxa de conversão no painel da Deal Room.",
  },
];

export function OnboardingDialog({ featureKey, open, onClose }: OnboardingDialogProps) {
  const [step, setStep] = useState(0);

  const steps = featureKey === "vendazap" ? VENDAZAP_STEPS : DEALROOM_STEPS;
  const title = featureKey === "vendazap" ? "VendaZap AI" : "Deal Room";
  const current = steps[step];
  const isLast = step === steps.length - 1;

  useEffect(() => {
    if (open) setStep(0);
  }, [open]);

  const handleNext = () => {
    if (isLast) {
      localStorage.setItem(`onboarding_${featureKey}_done`, "true");
      onClose();
    } else {
      setStep((s) => s + 1);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Badge variant="secondary" className="text-xs font-medium">
              {featureKey === "vendazap" ? "🤖" : "🎥"} {title}
            </Badge>
            <span className="text-xs text-muted-foreground ml-auto">
              {step + 1} / {steps.length}
            </span>
          </DialogTitle>
        </DialogHeader>

        <div className="flex flex-col items-center text-center py-6 space-y-4">
          <div className="h-16 w-16 rounded-2xl bg-primary/10 flex items-center justify-center">
            {current.icon}
          </div>
          <h3 className="text-lg font-semibold text-foreground">{current.title}</h3>
          <p className="text-sm text-muted-foreground leading-relaxed max-w-sm">
            {current.description}
          </p>
        </div>

        {/* Progress dots */}
        <div className="flex justify-center gap-1.5 mb-2">
          {steps.map((_, i) => (
            <div
              key={i}
              className={`h-1.5 rounded-full transition-all duration-300 ${
                i === step ? "w-6 bg-primary" : i < step ? "w-1.5 bg-primary/50" : "w-1.5 bg-muted-foreground/20"
              }`}
            />
          ))}
        </div>

        <div className="flex gap-2">
          {step > 0 && (
            <Button variant="outline" className="flex-1" onClick={() => setStep((s) => s - 1)}>
              Voltar
            </Button>
          )}
          <Button className="flex-1 gap-2" onClick={handleNext}>
            {isLast ? (
              <>
                <Check className="h-4 w-4" /> Começar a usar
              </>
            ) : (
              <>
                Próximo <ArrowRight className="h-4 w-4" />
              </>
            )}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export function useOnboarding(featureKey: "vendazap" | "dealroom") {
  const [showOnboarding, setShowOnboarding] = useState(false);

  useEffect(() => {
    const done = localStorage.getItem(`onboarding_${featureKey}_done`);
    if (!done) {
      const timer = setTimeout(() => setShowOnboarding(true), 500);
      return () => clearTimeout(timer);
    }
  }, [featureKey]);

  return { showOnboarding, setShowOnboarding };
}
