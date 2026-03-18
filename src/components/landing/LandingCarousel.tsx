import { useState, useEffect, useCallback } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";

interface LandingCarouselProps {
  images: string[];
  primaryColor: string;
}

export function LandingCarousel({ images, primaryColor }: LandingCarouselProps) {
  const [current, setCurrent] = useState(0);

  const next = useCallback(() => {
    setCurrent(prev => (prev + 1) % images.length);
  }, [images.length]);

  const prev = useCallback(() => {
    setCurrent(prev => (prev - 1 + images.length) % images.length);
  }, [images.length]);

  useEffect(() => {
    if (images.length <= 1) return;
    const interval = setInterval(next, 5000);
    return () => clearInterval(interval);
  }, [next, images.length]);

  if (images.length === 0) return null;

  return (
    <section className="py-20 bg-white">
      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center mb-12">
          <h2 className="text-3xl md:text-4xl font-bold text-gray-900 mb-4">
            Conheça o <span style={{ color: primaryColor }}>sistema</span>
          </h2>
          <p className="text-lg text-gray-600">Veja como o OrçaMóvel PRO funciona na prática.</p>
        </div>

        <div className="relative">
          <div className="rounded-2xl overflow-hidden shadow-2xl border border-gray-200">
            <img
              src={images[current]}
              alt={`Screenshot ${current + 1}`}
              className="w-full h-auto object-cover transition-opacity duration-500"
            />
          </div>

          {images.length > 1 && (
            <>
              <button
                onClick={prev}
                className="absolute left-4 top-1/2 -translate-y-1/2 h-10 w-10 rounded-full bg-white/90 shadow-lg flex items-center justify-center hover:bg-white transition-colors"
              >
                <ChevronLeft className="h-5 w-5 text-gray-700" />
              </button>
              <button
                onClick={next}
                className="absolute right-4 top-1/2 -translate-y-1/2 h-10 w-10 rounded-full bg-white/90 shadow-lg flex items-center justify-center hover:bg-white transition-colors"
              >
                <ChevronRight className="h-5 w-5 text-gray-700" />
              </button>

              <div className="flex justify-center gap-2 mt-6">
                {images.map((_, i) => (
                  <button
                    key={i}
                    onClick={() => setCurrent(i)}
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
      </div>
    </section>
  );
}
