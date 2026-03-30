import { useEffect, useRef, useMemo } from "react";
import { motion } from "framer-motion";

interface ParticleBackgroundProps {
  /** Show animated mesh gradient blobs (hidden on mobile for perf) */
  showBlobs?: boolean;
}

/**
 * Reusable animated background with particle canvas + gradient + optional mesh blobs.
 * Used across Login, SignUp, ResetPassword, AdminLogin.
 */
export function ParticleBackground({ showBlobs = true }: ParticleBackgroundProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const isMobile = useMemo(() => typeof window !== "undefined" && window.innerWidth < 768, []);
  const particleCount = isMobile ? 20 : 60;
  const connectionDistance = isMobile ? 80 : 120;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let animId: number;
    const particles: { x: number; y: number; vx: number; vy: number; r: number; o: number }[] = [];

    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = canvas.offsetWidth * dpr;
      canvas.height = canvas.offsetHeight * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();
    window.addEventListener("resize", resize);

    for (let i = 0; i < particleCount; i++) {
      particles.push({
        x: Math.random() * canvas.offsetWidth,
        y: Math.random() * canvas.offsetHeight,
        vx: (Math.random() - 0.5) * 0.4,
        vy: (Math.random() - 0.5) * 0.4,
        r: Math.random() * 2 + 0.5,
        o: Math.random() * 0.4 + 0.1,
      });
    }

    const draw = () => {
      const w = canvas.offsetWidth;
      const h = canvas.offsetHeight;
      ctx.clearRect(0, 0, w, h);

      for (const p of particles) {
        p.x += p.vx;
        p.y += p.vy;
        if (p.x < 0) p.x = w;
        if (p.x > w) p.x = 0;
        if (p.y < 0) p.y = h;
        if (p.y > h) p.y = 0;

        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        ctx.fillStyle = `hsla(199,89%,70%,${p.o})`;
        ctx.fill();
      }

      if (!isMobile || particleCount <= 25) {
        for (let i = 0; i < particles.length; i++) {
          for (let j = i + 1; j < particles.length; j++) {
            const dx = particles[i].x - particles[j].x;
            const dy = particles[i].y - particles[j].y;
            const dist = Math.sqrt(dx * dx + dy * dy);
            if (dist < connectionDistance) {
              ctx.beginPath();
              ctx.moveTo(particles[i].x, particles[i].y);
              ctx.lineTo(particles[j].x, particles[j].y);
              ctx.strokeStyle = `hsla(199,89%,60%,${0.08 * (1 - dist / connectionDistance)})`;
              ctx.lineWidth = 0.5;
              ctx.stroke();
            }
          }
        }
      }

      animId = requestAnimationFrame(draw);
    };
    draw();

    return () => {
      cancelAnimationFrame(animId);
      window.removeEventListener("resize", resize);
    };
  }, [particleCount, connectionDistance, isMobile]);

  return (
    <>
      {/* Dark gradient background */}
      <div className="absolute inset-0 bg-gradient-to-br from-[hsl(199,89%,15%)] via-[hsl(199,89%,25%)] to-[hsl(222,47%,11%)]" />

      {/* Particle canvas */}
      <canvas ref={canvasRef} className="absolute inset-0 z-[1] w-full h-full" />

      {/* Mesh gradient blobs — hidden on mobile for perf */}
      {showBlobs && !isMobile && (
        <div className="absolute inset-0 z-[2] pointer-events-none">
          <motion.div
            animate={{ x: [0, 60, -40, 0], y: [0, -50, 30, 0], scale: [1, 1.2, 0.9, 1] }}
            transition={{ duration: 18, repeat: Infinity, ease: "easeInOut" }}
            className="absolute top-[-10%] left-[-5%] w-[500px] h-[500px] bg-[hsl(199,89%,40%/0.18)] rounded-full blur-3xl"
          />
          <motion.div
            animate={{ x: [0, -70, 50, 0], y: [0, 40, -60, 0], scale: [1, 0.85, 1.15, 1] }}
            transition={{ duration: 22, repeat: Infinity, ease: "easeInOut" }}
            className="absolute bottom-[-15%] right-[-10%] w-[600px] h-[600px] bg-[hsl(160,84%,39%/0.12)] rounded-full blur-3xl"
          />
          <motion.div
            animate={{ x: [0, 40, -30, 0], y: [0, -30, 50, 0] }}
            transition={{ duration: 15, repeat: Infinity, ease: "easeInOut" }}
            className="absolute top-[40%] left-[30%] w-[350px] h-[350px] bg-[hsl(260,70%,50%/0.08)] rounded-full blur-3xl"
          />
        </div>
      )}
    </>
  );
}
