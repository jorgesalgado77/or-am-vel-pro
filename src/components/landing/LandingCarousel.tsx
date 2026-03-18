import { useState, useEffect, useCallback, useMemo } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { AnimatedSection } from "./AnimatedSection";
import { motion, AnimatePresence } from "framer-motion";
import screenKanban from "@/assets/screen-kanban.jpg";
import screenDashboard from "@/assets/screen-dashboard.jpg";
import screenSimulator from "@/assets/screen-simulator.jpg";
import screenVendazap from "@/assets/screen-vendazap.jpg";
import screenContratos from "@/assets/screen-contratos.jpg";

const REAL_SLIDES: CarouselSlide[] = [
  {
    src: screenKanban,
    label: "Kanban comercial com funil completo: Novo Lead → Em Negociação → Proposta Enviada → Fechado",
  },
  {
    src: screenDashboard,
    label: "Dashboard com KPIs em tempo real: vendas, clientes ativos, taxa de conversão e ticket médio",
  },
  {
    src: screenSimulator,
    label: "Simulador de financiamento com comparativo entre bandeiras e formas de pagamento",
  },
  {
    src: screenVendazap,
    label: "VendaZap AI: assistente inteligente que gera mensagens persuasivas para WhatsApp",
  },
  {
    src: screenContratos,
    label: "Gerador de contratos com editor visual, templates e envio direto por WhatsApp",
  },
];

const LEGACY_MOCK_PATTERNS = [
  "screenshot-dashboard.jpg",
  "screenshot-clients.jpg",
  "screenshot-simulator.jpg",
];

function buildSlides(images: string[]): CarouselSlide[] {
  const customSlides = images
    .filter(Boolean)
    .filter((image) => !LEGACY_MOCK_PATTERNS.some((pattern) => image.includes(pattern)))
    .map((src, index) => ({
      src,
      label: `Tela real personalizada ${index + 1} do OrçaMovel Pro`,
    }));

  return [...REAL_SLIDES, ...customSlides];
}

export function LandingCarousel({ images, primaryColor }: LandingCarouselProps) {
  const slides = useMemo(() => buildSlides(images), [images]);
  const [current, setCurrent] = useState(0);
  const [direction, setDirection] = useState(0);

  const next = useCallback(() => {
    setDirection(1);
    setCurrent((prev) => (prev + 1) % slides.length);
  }, [slides.length]);

  const prev = useCallback(() => {
    setDirection(-1);
    setCurrent((prev) => (prev - 1 + slides.length) % slides.length);
  }, [slides.length]);

  useEffect(() => {
    setCurrent(0);
  }, [slides.length]);

  useEffect(() => {
    if (slides.length <= 1) return;
    const interval = setInterval(next, 5000);
    return () => clearInterval(interval);
  }, [next, slides.length]);

  if (slides.length === 0) return null;

  const variants = {
    enter: (dir: number) => ({ x: dir > 0 ? 300 : -300, opacity: 0 }),
    center: { x: 0, opacity: 1 },
    exit: (dir: number) => ({ x: dir > 0 ? -300 : 300, opacity: 0 }),
  };

  return (
    <section className="py-20 bg-background">
      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
        <AnimatedSection>
          <div className="text-center mb-12">
            <h2 className="text-3xl md:text-4xl font-bold text-foreground mb-4">
              Veja o <span className="text-primary">sistema</span> em ação
            </h2>
            <p className="text-lg text-muted-foreground">Capturas reais da versão mais recente do OrçaMovel Pro.</p>
          </div>
        </AnimatedSection>

        <AnimatedSection variant="scaleUp">
          <div className="relative">
            <div className="rounded-2xl overflow-hidden shadow-2xl border border-border bg-muted aspect-video relative">
              <AnimatePresence initial={false} custom={direction} mode="wait">
                <motion.img
                  key={slides[current].src}
                  src={slides[current].src}
                  alt={slides[current].label}
                  custom={direction}
                  variants={variants}
                  initial="enter"
                  animate="center"
                  exit="exit"
                  transition={{ duration: 0.4, ease: "easeInOut" }}
                  className="w-full h-full object-cover absolute inset-0"
                  loading="lazy"
                />
              </AnimatePresence>
            </div>

            <AnimatePresence mode="wait">
              <motion.div
                key={`${slides[current].src}-label`}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                transition={{ duration: 0.3 }}
                className="text-center mt-4"
              >
                <span className="text-sm font-medium text-muted-foreground">
                  {slides[current].label}
                </span>
              </motion.div>
            </AnimatePresence>

            {slides.length > 1 && (
              <>
                <button
                  onClick={prev}
                  className="absolute left-4 top-1/2 -translate-y-1/2 h-10 w-10 rounded-full bg-background/90 shadow-lg flex items-center justify-center hover:bg-background transition-colors hover:scale-110"
                  aria-label="Imagem anterior"
                >
                  <ChevronLeft className="h-5 w-5 text-foreground" />
                </button>
                <button
                  onClick={next}
                  className="absolute right-4 top-1/2 -translate-y-1/2 h-10 w-10 rounded-full bg-background/90 shadow-lg flex items-center justify-center hover:bg-background transition-colors hover:scale-110"
                  aria-label="Próxima imagem"
                >
                  <ChevronRight className="h-5 w-5 text-foreground" />
                </button>

                <div className="flex justify-center gap-2 mt-4">
                  {slides.map((slide, index) => (
                    <button
                      key={slide.src}
                      onClick={() => {
                        setDirection(index > current ? 1 : -1);
                        setCurrent(index);
                      }}
                      className="h-2.5 rounded-full transition-all duration-300 bg-muted"
                      style={{
                        width: index === current ? 24 : 10,
                        backgroundColor: index === current ? primaryColor : undefined,
                      }}
                      aria-label={`Ir para imagem ${index + 1}`}
                    />
                  ))}
                </div>
              </>
            )}
          </div>
        </AnimatedSection>
      </div>
    </section>
  );
}
