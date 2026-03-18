import { useState, useEffect, useCallback } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { AnimatedSection } from "./AnimatedSection";
import { motion, AnimatePresence } from "framer-motion";
import screenshotDashboard from "@/assets/screenshot-dashboard.jpg";
import screenshotClients from "@/assets/screenshot-clients.jpg";
import screenshotSimulator from "@/assets/screenshot-simulator.jpg";

const FALLBACK_IMAGES = [screenshotDashboard, screenshotClients, screenshotSimulator];

interface LandingCarouselProps {
  images: string[];
  primaryColor: string;
}

const LABELS = ["Dashboard com KPIs e gráficos", "Gestão completa de clientes", "Simulador de financiamento"];

export function LandingCarousel({ images, primaryColor }: LandingCarouselProps) {
  const displayImages = images.length > 0 ? images : FALLBACK_IMAGES;
  const [current, setCurrent] = useState(0);
  const [direction, setDirection] = useState(0);

  const next = useCallback(() => {
    setDirection(1);
    setCurrent(prev => (prev + 1) % displayImages.length);
  }, [displayImages.length]);

  const prev = useCallback(() => {
    setDirection(-1);
    setCurrent(prev => (prev - 1 + displayImages.length) % displayImages.length);
  }, [displayImages.length]);

  useEffect(() => {
    if (displayImages.length <= 1) return;
    const interval = setInterval(next, 5000);
    return () => clearInterval(interval);
  }, [next, displayImages.length]);

  if (displayImages.length === 0) return null;

  const variants = {
    enter: (dir: number) => ({ x: dir > 0 ? 300 : -300, opacity: 0 }),
    center: { x: 0, opacity: 1 },
    exit: (dir: number) => ({ x: dir > 0 ? -300 : 300, opacity: 0 }),
  };

  return (
    <section className="py-20 bg-white">
      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
        <AnimatedSection>
          <div className="text-center mb-12">
            <h2 className="text-3xl md:text-4xl font-bold text-gray-900 mb-4">
              Veja o <span style={{ color: primaryColor }}>sistema</span> em ação
            </h2>
            <p className="text-lg text-gray-600">Interface intuitiva, resultados profissionais.</p>
          </div>
        </AnimatedSection>

        <AnimatedSection variant="scaleUp">
          <div className="relative">
            <div className="rounded-2xl overflow-hidden shadow-2xl border border-gray-200 bg-gray-100 aspect-video relative">
              <AnimatePresence initial={false} custom={direction} mode="wait">
                <motion.img
                  key={current}
                  src={displayImages[current]}
                  alt={LABELS[current] || `Screenshot ${current + 1}`}
                  custom={direction}
                  variants={variants}
                  initial="enter"
                  animate="center"
                  exit="exit"
                  transition={{ duration: 0.4, ease: "easeInOut" }}
                  className="w-full h-full object-cover absolute inset-0"
                />
              </AnimatePresence>
            </div>

            {/* Label */}
            <AnimatePresence mode="wait">
              <motion.div
                key={current}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                transition={{ duration: 0.3 }}
                className="text-center mt-4"
              >
                <span className="text-sm font-medium text-gray-600">
                  {LABELS[current] || `Screenshot ${current + 1}`}
                </span>
              </motion.div>
            </AnimatePresence>

            {displayImages.length > 1 && (
              <>
                <button
                  onClick={prev}
                  className="absolute left-4 top-1/2 -translate-y-1/2 h-10 w-10 rounded-full bg-white/90 shadow-lg flex items-center justify-center hover:bg-white transition-colors hover:scale-110"
                >
                  <ChevronLeft className="h-5 w-5 text-gray-700" />
                </button>
                <button
                  onClick={next}
                  className="absolute right-4 top-1/2 -translate-y-1/2 h-10 w-10 rounded-full bg-white/90 shadow-lg flex items-center justify-center hover:bg-white transition-colors hover:scale-110"
                >
                  <ChevronRight className="h-5 w-5 text-gray-700" />
                </button>

                <div className="flex justify-center gap-2 mt-4">
                  {displayImages.map((_, i) => (
                    <button
                      key={i}
                      onClick={() => {
                        setDirection(i > current ? 1 : -1);
                        setCurrent(i);
                      }}
                      className="h-2.5 rounded-full transition-all duration-300"
                      style={{
                        width: i === current ? 24 : 10,
                        backgroundColor: i === current ? primaryColor : "#d1d5db",
                      }}
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
