import { useState, useEffect, useRef, useMemo } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { LogIn, Eye, EyeOff, Search, UserPlus, AlertTriangle, CreditCard, Headphones, Store, Mail, Lock, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { logAudit } from "@/services/auditService";
import { ClientTrackingModal } from "@/components/ClientTrackingModal";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { maskCodigoLoja, unmask } from "@/lib/masks";
import { motion } from "framer-motion";
import bannerCompleto from "@/assets/banner-completo-orcamovel.png";

interface PlanBlockInfo {
  reason: string;
  tenantId: string;
}

async function withTimeout<T>(promise: Promise<T>, ms: number, fallback: T): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((resolve) => setTimeout(() => resolve(fallback), ms)),
  ]);
}

export default function Login() {
  const navigate = useNavigate();
  const { login } = useAuth();
  const [codigoLoja, setCodigoLoja] = useState("");
  const [email, setEmail] = useState("");
  const [senha, setSenha] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [showTracking, setShowTracking] = useState(false);
  const [showForgotPassword, setShowForgotPassword] = useState(false);
  const [forgotEmail, setForgotEmail] = useState("");
  const [forgotLoading, setForgotLoading] = useState(false);
  const [planBlocked, setPlanBlocked] = useState<PlanBlockInfo | null>(null);
  const [tenantInfo, setTenantInfo] = useState<{ nome: string; subtitulo: string } | null>(null);
  const [highlightForgotPassword, setHighlightForgotPassword] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // Detect low-end device for reduced effects
  const isMobile = useMemo(() => typeof window !== "undefined" && window.innerWidth < 768, []);
  const particleCount = isMobile ? 20 : 60;
  const connectionDistance = isMobile ? 80 : 120;

  // Particle animation — lightweight for mobile
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let animId: number;
    const particles: { x: number; y: number; vx: number; vy: number; r: number; o: number }[] = [];

    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2); // cap DPR for perf
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

      // Connection lines — skip on very small screens for perf
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

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    const codigoDigits = unmask(codigoLoja);
    const normalizedEmail = email.trim().toLowerCase();

    if (!codigoDigits || !normalizedEmail || !senha.trim()) {
      toast.error("Preencha todos os campos");
      return;
    }

    if (codigoDigits.length < 6) {
      toast.error("Código da loja deve ter 6 dígitos (ex: 123.456)");
      return;
    }

    setLoading(true);
    setPlanBlocked(null);
    setHighlightForgotPassword(false);

    try {
      const { user, error } = await withTimeout(
        login(normalizedEmail, senha, codigoDigits),
        12000,
        { user: null, error: "Tempo de login excedido. Tente novamente." },
      );

      if (error) {
        const msg = error.toLowerCase();
        const isPasswordError = msg.includes("invalid login credentials") || 
          msg.includes("senha incorreta") || 
          msg.includes("sincronizar seu acesso") ||
          msg.includes("already registered");

        if (isPasswordError) {
          setHighlightForgotPassword(true);
        }

        if (msg.includes("email not confirmed")) {
          toast.error("Email ainda não confirmado. Tente novamente em alguns instantes.");
        } else if (msg.includes("invalid login credentials")) {
          toast.error("Email ou senha incorretos");
        } else if (msg.includes("código da loja não encontrado")) {
          toast.error("Código da loja não encontrado. Verifique o código informado.");
        } else if (msg.includes("email não encontrado")) {
          toast.error("Email não encontrado no sistema. Verifique o email digitado.");
        } else if (msg.includes("não está vinculado")) {
          toast.error("Este email não pertence à loja informada. Verifique o código da loja.");
        } else if (msg.includes("senha incorreta")) {
          toast.error("Senha incorreta. Verifique sua senha e tente novamente.");
        } else if (msg.includes("usuário inativo")) {
          toast.error("Sua conta está inativa. Entre em contato com o administrador da loja.");
        } else {
          toast.error(error);
        }
        return;
      }

      if (!user) {
        toast.error("Usuário não encontrado no sistema");
        return;
      }

      if (!user.tenant_id) {
        toast.error("Usuário sem loja vinculada");
        return;
      }

      const { data: tenant } = await withTimeout(
        (async () => await supabase
          .from("tenants")
          .select("ativo, plano, trial_fim, assinatura_fim")
          .eq("id", user.tenant_id)
          .maybeSingle())(),
        1200,
        {
          data: null,
          error: null,
          count: null,
          status: 200,
          statusText: "timeout-fallback",
        },
      );

      if (tenant) {
        const t = tenant as any;
        const now = new Date();

        if (!t.ativo) {
          setPlanBlocked({
            reason: "Sua conta foi suspensa ou banida. Entre em contato com o suporte técnico.",
            tenantId: user.tenant_id,
          });
          return;
        }

        if (t.plano === "trial" && t.trial_fim) {
          const trialFim = new Date(t.trial_fim);
          if (now > trialFim) {
            setPlanBlocked({
              reason: "Seu período de teste gratuito expirou. Escolha um plano para continuar.",
              tenantId: user.tenant_id,
            });
            return;
          }
        } else if (t.assinatura_fim) {
          const assFim = new Date(t.assinatura_fim);
          if (now > assFim) {
            setPlanBlocked({
              reason: "Sua assinatura expirou. Renove seu plano para continuar.",
              tenantId: user.tenant_id,
            });
            return;
          }
        }
      }

      toast.success(`Bem-vindo, ${user.apelido || user.nome_completo}!`);

      void Promise.resolve(
        logAudit({
          acao: "usuario_login",
          entidade: "user",
          entidade_id: user.id,
          usuario_id: user.id,
          usuario_nome: user.apelido || user.nome_completo,
          tenant_id: user.tenant_id,
          detalhes: { nome: user.nome_completo },
        })
      );
    } catch (err: any) {
      toast.error(err?.message || "Não foi possível concluir o login.");
    } finally {
      setLoading(false);
    }
  };

  const handleRenewPlan = () => {
    if (planBlocked?.tenantId) {
      sessionStorage.setItem("renew_tenant_id", planBlocked.tenantId);
      navigate("/renew-plan");
    }
  };

  // Fetch tenant info when store code is complete (uses RPC to bypass RLS)
  useEffect(() => {
    const digits = unmask(codigoLoja);

    if (digits.length < 6) {
      setTenantInfo(null);
      return;
    }

    let cancelled = false;
    const formattedCode = digits.replace(/(\d{3})(\d{3})/, "$1.$2");

    (async () => {
      try {
        // Strategy 1: RPC resolve_tenant_info_by_code (returns {nome, subtitulo})
        const { data: rpcInfo } = await (supabase as unknown as { rpc: (fn: string, params: Record<string, string>) => Promise<{ data: unknown }> })
          .rpc("resolve_tenant_info_by_code", { p_code: formattedCode });

        const row = Array.isArray(rpcInfo) ? rpcInfo[0] : rpcInfo;
        if (!cancelled && row && typeof row === "object") {
          const r = row as Record<string, string>;
          if (r.nome || r.company_name || r.nome_empresa || r.nome_loja) {
            setTenantInfo({
              nome: r.nome || r.company_name || r.nome_empresa || r.nome_loja,
              subtitulo: r.subtitulo || r.company_subtitle || "",
            });
            return;
          }
        }

        // Strategy 2: Direct query tenants → company_settings
        const { data: tenantData } = await supabase
          .from("tenants")
          .select("id, nome_loja")
          .or(`codigo_loja.eq.${formattedCode},codigo_loja.eq.${digits}`)
          .limit(1)
          .maybeSingle();

        if (!cancelled && tenantData?.id) {
          const { data: csData } = await supabase
            .from("company_settings" as unknown as "clients")
            .select("company_name, nome_empresa, company_subtitle")
            .eq("tenant_id", tenantData.id)
            .maybeSingle();

          const cs = csData as unknown as { company_name?: string; nome_empresa?: string; company_subtitle?: string } | null;

          if (!cancelled) {
            const nome = cs?.company_name || cs?.nome_empresa || (tenantData as unknown as { nome_loja: string }).nome_loja;
            if (nome) {
              setTenantInfo({
                nome,
                subtitulo: cs?.company_subtitle || "",
              });
              return;
            }
          }
        }

        // Strategy 3: RPC resolve_tenant_by_code → fetch name
        const { data: rpcData } = await (supabase as unknown as { rpc: (fn: string, params: Record<string, string>) => Promise<{ data: unknown }> })
          .rpc("resolve_tenant_by_code", { p_code: formattedCode });
        const resolved = Array.isArray(rpcData) ? rpcData[0] : rpcData;
        const tid = typeof resolved === "string" ? resolved : (resolved as Record<string, string>)?.tenant_id || (resolved as Record<string, string>)?.id;

        if (!cancelled && tid) {
          const { data: csData3 } = await supabase
            .from("company_settings" as unknown as "clients")
            .select("company_name, nome_empresa, company_subtitle")
            .eq("tenant_id", tid)
            .maybeSingle();

          const cs3 = csData3 as unknown as { company_name?: string; nome_empresa?: string; company_subtitle?: string } | null;

          if (!cancelled) {
            setTenantInfo({
              nome: cs3?.company_name || cs3?.nome_empresa || "Loja",
              subtitulo: cs3?.company_subtitle || "",
            });
          }
        } else if (!cancelled) {
          setTenantInfo(null);
        }
      } catch (err) {
        console.warn("[Login] Branding fetch failed:", err);
        if (!cancelled) setTenantInfo(null);
      }
    })();
    return () => { cancelled = true; };
  }, [codigoLoja]);

  const companyName = tenantInfo?.nome || "OrçaMóvel PRO";
  const companySubtitle = tenantInfo?.subtitulo || "Orce. Venda. Simplifique";

  if (planBlocked) {
    return (
      <div className="min-h-[100dvh] flex items-center justify-center relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-[hsl(199,89%,15%)] via-[hsl(199,89%,25%)] to-[hsl(222,47%,11%)]" />
        <canvas ref={canvasRef} className="absolute inset-0 z-[1] w-full h-full" />
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.4 }}
          className="w-full max-w-md relative z-10 p-4"
        >
          <div className="rounded-2xl border border-white/20 bg-white/10 backdrop-blur-xl shadow-2xl shadow-black/20 p-6 sm:p-8 text-center space-y-5">
            <div className="mx-auto h-16 w-16 sm:h-20 sm:w-20 rounded-full bg-destructive/20 flex items-center justify-center">
              <AlertTriangle className="h-8 w-8 sm:h-10 sm:w-10 text-destructive" />
            </div>
            <div>
              <h1 className="text-xl sm:text-2xl font-bold text-white">Acesso Bloqueado</h1>
              <p className="text-sm text-white/60 mt-3 leading-relaxed">{planBlocked.reason}</p>
            </div>
            <div className="space-y-3">
              <Button className="w-full gap-2 h-11 sm:h-12 text-sm sm:text-base bg-gradient-to-r from-[hsl(var(--primary))] to-[hsl(199,89%,50%)] hover:from-[hsl(199,89%,45%)] hover:to-[hsl(199,89%,55%)] shadow-lg" onClick={handleRenewPlan}>
                <CreditCard className="h-5 w-5" />
                Escolher novo plano
              </Button>
              <Button variant="outline" className="w-full gap-2 h-10 sm:h-11 border-white/20 text-white hover:bg-white/10" asChild>
                <a href="mailto:suporte@orcamovel.com.br">
                  <Headphones className="h-4 w-4" />
                  Contatar suporte técnico
                </a>
              </Button>
              <Button variant="ghost" className="w-full text-white/50 hover:text-white hover:bg-white/10" onClick={() => setPlanBlocked(null)}>
                Voltar ao login
              </Button>
            </div>
          </div>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="min-h-[100dvh] flex flex-col lg:flex-row relative overflow-hidden">
      {/* Dark gradient background */}
      <div className="absolute inset-0 bg-gradient-to-br from-[hsl(199,89%,15%)] via-[hsl(199,89%,25%)] to-[hsl(222,47%,11%)]" />

      {/* Particle canvas */}
      <canvas ref={canvasRef} className="absolute inset-0 z-[1] w-full h-full" />

      {/* Mesh gradient blobs — hidden on mobile for perf */}
      {!isMobile && (
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

      {/* Left decorative panel — desktop only */}
      <div className="hidden lg:flex lg:w-[55%] relative z-10 items-center justify-center p-2 xl:p-3">
        <motion.div
          initial={{ opacity: 0, x: -40 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.8 }}
          className="w-full space-y-4"
        >
          {/* Banner completo with glow and hover effects */}
          <motion.div
            className="relative group"
            whileHover={{ scale: 1.015 }}
            transition={{ type: "spring", stiffness: 300, damping: 25 }}
          >
            <div className="absolute -inset-4 rounded-3xl bg-gradient-to-r from-[hsl(199,89%,50%/0.3)] via-[hsl(160,84%,45%/0.2)] to-[hsl(199,89%,50%/0.3)] blur-2xl opacity-50 group-hover:opacity-80 transition-opacity duration-700" />

            <motion.div
              className="relative overflow-hidden rounded-xl border border-white/10 shadow-2xl shadow-black/30"
              animate={{
                boxShadow: [
                  "0 25px 50px -12px rgba(0,0,0,0.3), 0 0 30px hsla(199,89%,50%,0.1)",
                  "0 25px 50px -12px rgba(0,0,0,0.3), 0 0 50px hsla(199,89%,50%,0.2)",
                  "0 25px 50px -12px rgba(0,0,0,0.3), 0 0 30px hsla(199,89%,50%,0.1)",
                ],
              }}
              transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}
            >
              <img
                src={bannerCompleto}
                alt="OrçaMóvel PRO — Sistema de Vendas com I.A."
                className="w-full h-auto object-contain"
              />
              <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/10 to-transparent -translate-x-full group-hover:translate-x-full transition-transform duration-1000 ease-out" />
            </motion.div>
          </motion.div>

          {/* Stats row */}
          <div className="flex items-center justify-center gap-6 text-white/40 pt-2">
            {[
              { value: "+500", label: "Lojas ativas", color: "bg-[hsl(var(--accent))]" },
              { value: "98%", label: "Satisfação", color: "bg-[hsl(var(--primary))]" },
              { value: "24/7", label: "Suporte", color: "bg-[hsl(160,84%,60%)]" },
            ].map((stat) => (
              <div key={stat.label} className="text-center">
                <p className="text-2xl font-bold text-white">{stat.value}</p>
                <div className="flex items-center gap-1.5 text-sm mt-1">
                  <div className={`w-2 h-2 rounded-full ${stat.color}`} />
                  {stat.label}
                </div>
              </div>
            ))}
          </div>
        </motion.div>
      </div>

      {/* Right login panel — scrollable on all screens */}
      <div className="flex-1 lg:w-[45%] relative z-10 flex items-start lg:items-center justify-center overflow-y-auto py-6 px-4 sm:px-6">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.15 }}
          className="w-full max-w-md my-auto"
        >
          <div className="bg-white/10 backdrop-blur-xl rounded-2xl border border-white/20 shadow-2xl shadow-black/20 p-5 sm:p-8 space-y-5">
            {/* Header */}
            <div className="text-center space-y-2">
              <div className="mx-auto w-14 h-14 sm:w-16 sm:h-16 rounded-xl bg-gradient-to-br from-[hsl(var(--primary))] to-[hsl(var(--accent))] flex items-center justify-center shadow-lg shadow-[hsl(var(--primary)/0.3)]">
                <Store className="h-7 w-7 sm:h-8 sm:w-8 text-white" />
              </div>
              <div>
                <h1 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight">{companyName}</h1>
                <p className="text-xs sm:text-sm text-white/50 mt-1">{companySubtitle}</p>
              </div>
            </div>

            {/* Form */}
            <form onSubmit={handleLogin} className="space-y-3 sm:space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="codigoLoja" className="text-xs sm:text-sm font-medium text-white/80">
                  Código da Loja
                </Label>
                <div className="relative">
                  <Store className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-white/30" />
                  <Input
                    id="codigoLoja"
                    type="text"
                    inputMode="numeric"
                    value={codigoLoja}
                    onChange={(e) => setCodigoLoja(maskCodigoLoja(e.target.value))}
                    placeholder="000.000"
                    maxLength={7}
                    className="pl-10 h-11 sm:h-12 bg-white/5 border-white/10 text-white placeholder:text-white/25 focus:border-[hsl(var(--primary))] focus:ring-[hsl(var(--primary)/0.3)] rounded-xl transition-all text-base"
                    autoComplete="off"
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="email" className="text-xs sm:text-sm font-medium text-white/80">
                  Email
                </Label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-white/30" />
                  <Input
                    id="email"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="seu@email.com"
                    className="pl-10 h-11 sm:h-12 bg-white/5 border-white/10 text-white placeholder:text-white/25 focus:border-[hsl(var(--primary))] focus:ring-[hsl(var(--primary)/0.3)] rounded-xl transition-all text-base"
                    autoComplete="email"
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="senha" className="text-xs sm:text-sm font-medium text-white/80">
                  Senha
                </Label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-white/30" />
                  <Input
                    id="senha"
                    type={showPassword ? "text" : "password"}
                    value={senha}
                    onChange={(e) => setSenha(e.target.value)}
                    placeholder="••••••••"
                    autoComplete="current-password"
                    className="pl-10 pr-10 h-11 sm:h-12 bg-white/5 border-white/10 text-white placeholder:text-white/25 focus:border-[hsl(var(--primary))] focus:ring-[hsl(var(--primary)/0.3)] rounded-xl transition-all text-base"
                  />
                  <button
                    type="button"
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-white/30 hover:text-white/60 transition-colors"
                    onClick={() => setShowPassword(!showPassword)}
                    tabIndex={-1}
                  >
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>

              <div className="flex justify-end">
                {highlightForgotPassword ? (
                  <motion.button
                    type="button"
                    initial={{ scale: 1 }}
                    animate={{ scale: [1, 1.08, 1], opacity: [0.8, 1, 0.8] }}
                    transition={{ duration: 1.5, repeat: Infinity, ease: "easeInOut" }}
                    className="text-sm font-semibold text-[hsl(var(--primary))] underline underline-offset-2 px-3 py-1.5 rounded-lg bg-[hsl(var(--primary)/0.15)] border border-[hsl(var(--primary)/0.3)]"
                    onClick={() => { setShowForgotPassword(true); setHighlightForgotPassword(false); }}
                  >
                    🔑 Esqueci minha senha
                  </motion.button>
                ) : (
                  <button
                    type="button"
                    className="text-xs text-white/40 hover:text-[hsl(var(--primary))] transition-colors"
                    onClick={() => setShowForgotPassword(true)}
                  >
                    Esqueci minha senha
                  </button>
                )}
              </div>

              <Button
                type="submit"
                disabled={loading}
                className="w-full h-11 sm:h-12 rounded-xl text-sm sm:text-base font-semibold gap-2 bg-gradient-to-r from-[hsl(var(--primary))] to-[hsl(199,89%,50%)] hover:from-[hsl(199,89%,45%)] hover:to-[hsl(199,89%,55%)] shadow-lg shadow-[hsl(var(--primary)/0.3)] transition-all duration-300 hover:shadow-xl hover:shadow-[hsl(var(--primary)/0.4)] active:scale-[0.97]"
              >
                {loading ? (
                  <Loader2 className="h-5 w-5 animate-spin" />
                ) : (
                  <LogIn className="h-5 w-5" />
                )}
                {loading ? "Entrando..." : "Entrar"}
              </Button>
            </form>

            {/* Divider */}
            <div className="relative">
              <div className="absolute inset-0 flex items-center">
                <span className="w-full border-t border-white/10" />
              </div>
              <div className="relative flex justify-center text-xs">
                <span className="bg-transparent px-3 text-white/30">ou</span>
              </div>
            </div>

            {/* Secondary actions */}
            <div className="space-y-2">
              <Button
                variant="outline"
                className="w-full gap-2 h-10 sm:h-11 rounded-xl border-white/15 text-white/80 hover:bg-white/10 hover:text-white bg-transparent transition-colors text-sm"
                onClick={() => navigate("/signup")}
              >
                <UserPlus className="h-4 w-4" />
                Criar minha conta
              </Button>
              <Button
                variant="outline"
                className="w-full gap-2 h-10 sm:h-11 rounded-xl border-emerald-400/50 bg-emerald-500/10 text-emerald-300 hover:bg-emerald-500/20 hover:text-emerald-200 hover:border-emerald-400/70 transition-all duration-300 font-semibold shadow-[0_0_15px_rgba(16,185,129,0.15)] text-sm"
                onClick={() => setShowTracking(true)}
              >
                <Search className="h-4 w-4" />
                📍 Acompanhe seu Projeto
              </Button>
            </div>
          </div>

          {/* Security badge */}
          <div className="mt-4 sm:mt-6 space-y-2 pb-2 text-center">
            <div className="flex items-center justify-center gap-2 text-white/25 text-xs">
              <Lock className="h-3 w-3" />
              Conexão protegida · {companyName} © 2026
            </div>
            <div className="space-y-1 text-[11px] sm:text-xs text-white/45">
              <p>Todos os direitos reservados</p>
              <p>CNPJ 58.847.751/0001-28</p>
            </div>
          </div>
        </motion.div>
      </div>

      <ClientTrackingModal open={showTracking} onClose={() => setShowTracking(false)} />

      {/* Forgot Password Dialog */}
      {showForgotPassword && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="w-full max-w-sm backdrop-blur-xl bg-[#0f1d32]/95 border border-white/10 rounded-2xl p-5 sm:p-6 shadow-2xl space-y-4"
          >
            <div className="text-center space-y-1">
              <Mail className="h-8 w-8 sm:h-10 sm:w-10 text-[hsl(var(--primary))] mx-auto" />
              <h3 className="text-base sm:text-lg font-bold text-white">Recuperar Senha</h3>
              <p className="text-white/40 text-xs">Informe seu email para receber o link de redefinição</p>
            </div>
            <div className="space-y-2">
              <Label className="text-white/70 text-xs sm:text-sm">Email</Label>
              <Input
                type="email"
                value={forgotEmail}
                onChange={(e) => setForgotEmail(e.target.value)}
                placeholder="seu@email.com"
                className="h-11 bg-white/5 border-white/10 text-white placeholder:text-white/25 rounded-xl focus:border-[hsl(var(--primary))] text-base"
              />
            </div>
            <div className="flex gap-2">
              <Button
                variant="outline"
                className="flex-1 h-10 sm:h-11 border-white/15 text-white/60 hover:bg-white/10 bg-transparent rounded-xl text-sm"
                onClick={() => { setShowForgotPassword(false); setForgotEmail(""); }}
              >
                Cancelar
              </Button>
              <Button
                disabled={forgotLoading || !forgotEmail}
                className="flex-1 h-10 sm:h-11 rounded-xl bg-gradient-to-r from-[hsl(var(--primary))] to-[hsl(199,89%,50%)] font-semibold text-sm"
                onClick={async () => {
                  setForgotLoading(true);
                  try {
                    const { error } = await supabase.auth.resetPasswordForEmail(forgotEmail.trim().toLowerCase(), {
                      redirectTo: `${window.location.origin}/reset-password`,
                    });
                    if (error) throw error;
                    toast.success("Email de recuperação enviado! Verifique sua caixa de entrada.");
                    setShowForgotPassword(false);
                    setForgotEmail("");
                  } catch (err: any) {
                    toast.error(err.message || "Erro ao enviar email de recuperação.");
                  } finally {
                    setForgotLoading(false);
                  }
                }}
              >
                {forgotLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Enviar"}
              </Button>
            </div>
          </motion.div>
        </div>
      )}
    </div>
  );
}
