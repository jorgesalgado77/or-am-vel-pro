import { useState, useEffect } from "react";
import { Clock, Flame } from "lucide-react";
import { motion } from "framer-motion";

interface LandingUrgencyBannerProps {
  primaryColor: string;
}

export function LandingUrgencyBanner({ primaryColor }: LandingUrgencyBannerProps) {
  const [timeLeft, setTimeLeft] = useState({ hours: 0, minutes: 0, seconds: 0 });

  useEffect(() => {
    // Calculate end of current promotional window (resets daily at midnight)
    const getEndOfDay = () => {
      const now = new Date();
      const end = new Date(now);
      end.setHours(23, 59, 59, 999);
      return end;
    };

    const updateTimer = () => {
      const now = new Date();
      const end = getEndOfDay();
      const diff = end.getTime() - now.getTime();

      if (diff <= 0) {
        setTimeLeft({ hours: 23, minutes: 59, seconds: 59 });
        return;
      }

      setTimeLeft({
        hours: Math.floor(diff / (1000 * 60 * 60)),
        minutes: Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60)),
        seconds: Math.floor((diff % (1000 * 60)) / 1000),
      });
    };

    updateTimer();
    const interval = setInterval(updateTimer, 1000);
    return () => clearInterval(interval);
  }, []);

  const pad = (n: number) => n.toString().padStart(2, "0");

  return (
    <motion.div
      initial={{ y: -50, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={{ duration: 0.5, delay: 0.3 }}
      className="fixed top-16 left-0 right-0 z-40"
      style={{ background: `linear-gradient(90deg, ${primaryColor}, #dc2626)` }}
    >
      <div className="max-w-7xl mx-auto px-4 py-2.5 flex items-center justify-center gap-3 flex-wrap text-white text-sm font-medium">
        <Flame className="h-4 w-4 animate-pulse" />
        <span className="hidden sm:inline">🔥 Oferta por tempo limitado:</span>
        <span className="sm:hidden">🔥 Oferta limitada:</span>
        <span className="font-bold">7 dias grátis + 15% OFF no plano anual</span>
        <div className="flex items-center gap-1.5 ml-2">
          <Clock className="h-3.5 w-3.5" />
          <div className="flex items-center gap-1 font-mono font-bold">
            <span className="bg-white/20 rounded px-1.5 py-0.5 text-xs">{pad(timeLeft.hours)}</span>
            <span>:</span>
            <span className="bg-white/20 rounded px-1.5 py-0.5 text-xs">{pad(timeLeft.minutes)}</span>
            <span>:</span>
            <span className="bg-white/20 rounded px-1.5 py-0.5 text-xs">{pad(timeLeft.seconds)}</span>
          </div>
        </div>
      </div>
    </motion.div>
  );
}
