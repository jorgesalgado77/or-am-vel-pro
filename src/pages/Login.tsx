import { useState, useEffect, useRef } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { LogIn, Eye, EyeOff, Search, UserPlus, AlertTriangle, CreditCard, Headphones, Store, Mail, Lock, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { logAudit } from "@/services/auditService";
import { useCompanySettings } from "@/hooks/useCompanySettings";
import { ClientTrackingModal } from "@/components/ClientTrackingModal";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { maskCodigoLoja, unmask } from "@/lib/masks";
import { motion } from "framer-motion";

interface PlanBlockInfo {
  reason: string;
  tenantId: string;
}

export default function Login() {
  const navigate = useNavigate();
  const { settings } = useCompanySettings();
  const { login } = useAuth();
  const [codigoLoja, setCodigoLoja] = useState("");
  const [email, setEmail] = useState("");
  const [senha, setSenha] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [showTracking, setShowTracking] = useState(false);
  const [planBlocked, setPlanBlocked] = useState<PlanBlockInfo | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // Particle animation effect
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let animId: number;
    const particles: { x: number; y: number; vx: number; vy: number; r: number; o: number }[] = [];
    const count = 60;

    const resize = () => {
      const dpr = window.devicePixelRatio || 1;
      canvas.width = canvas.offsetWidth * dpr;
      canvas.height = canvas.offsetHeight * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();
    window.addEventListener("resize", resize);

    for (let i = 0; i < count; i++) {
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

      for (let i = 0; i < particles.length; i++) {
        for (let j = i + 1; j < particles.length; j++) {
          const dx = particles[i].x - particles[j].x;
          const dy = particles[i].y - particles[j].y;
          const dist = Math.sqrt(dx * dx + dy * dy);
          if (dist < 120) {
            ctx.beginPath();
            ctx.moveTo(particles[i].x, particles[i].y);
            ctx.lineTo(particles[j].x, particles[j].y);
            ctx.strokeStyle = `hsla(199,89%,60%,${0.08 * (1 - dist / 120)})`;
            ctx.lineWidth = 0.5;
            ctx.stroke();
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
  }, []);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    const codigoDigits = unmask(codigoLoja);
    if (!codigoDigits || !email.trim() || !senha.trim()) {
      toast.error("Preencha todos os campos");
      return;
    }

    if (codigoDigits.length < 6) {
      toast.error("Código da loja deve ter 6 dígitos (ex: 123.456)");
      return;
    }

    setLoading(true);
    setPlanBlocked(null);

    const { user, error } = await login(email.trim().toLowerCase(), senha);

    if (error) {
      toast.error(error === "Invalid login credentials" ? "Email ou senha incorretos" : error);
      setLoading(false);
      return;
    }

    if (!user) {
      toast.error("Usuário não encontrado no sistema");
      setLoading(false);
      return;
    }

    if (user.tenant_id) {
      const { data: tenantCheck } = await supabase
        .from("tenants")
        .select("codigo_loja")
        .eq("id", user.tenant_id)
        .single();

      if (!tenantCheck || unmask(tenantCheck.codigo_loja || "") !== codigoDigits) {
        toast.error("Código da loja não corresponde ao seu cadastro");
        setLoading(false);
        return;
      }
    } else {
      toast.error("Usuário sem loja vinculada");
      setLoading(false);
      return;
    }

    if (user.tenant_id) {
      const { data: tenant } = await supabase
        .from("tenants")
        .select("*")
        .eq("id", user.tenant_id)
        .single();

      if (tenant) {
        const t = tenant as any;
        const now = new Date();

        if (!t.ativo) {
          setPlanBlocked({
            reason: "Sua conta foi suspensa ou banida. Entre em contato com o suporte técnico.",
            tenantId: user.tenant_id,
          });
          setLoading(false);
          return;
        }

        if (t.plano === "trial") {
          const trialFim = new Date(t.trial_fim);
          if (now > trialFim) {
            setPlanBlocked({
              reason: "Seu período de teste gratuito expirou. Escolha um plano para continuar.",
              tenantId: user.tenant_id,
            });
            setLoading(false);
            return;
          }
        } else if (t.assinatura_fim) {
          const assFim = new Date(t.assinatura_fim);
          if (now > assFim) {
            setPlanBlocked({
              reason: "Sua assinatura expirou. Renove seu plano para continuar.",
              tenantId: user.tenant_id,
            });
            setLoading(false);
            return;
          }
        }
      }
    }

    setLoading(false);
    toast.success(`Bem-vindo, ${user.apelido || user.nome_completo}!`);

    logAudit({
      acao: "usuario_login",
      entidade: "user",
      entidade_id: user.id,
      usuario_id: user.id,
      usuario_nome: user.apelido || user.nome_completo,
      tenant_id: user.tenant_id,
      detalhes: { nome: user.nome_completo },
    });
  };

  const handleRenewPlan = () => {
    if (planBlocked?.tenantId) {
      sessionStorage.setItem("renew_tenant_id", planBlocked.tenantId);
      navigate("/renew-plan");
    }
  };

  const companyName = settings.company_name !== "INOVAMAD" ? settings.company_name : "OrçaMóvel PRO";
  const companySubtitle =
    settings.company_subtitle && settings.company_subtitle !== "Gestão & Financiamento"
      ? settings.company_subtitle
      : "Orce. Venda. Simplifique";

  if (planBlocked) {
    return (
      <div className="min-h-screen flex items-center justify-center relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-[hsl(199,89%,15%)] via-[hsl(199,89%,25%)] to-[hsl(222,47%,11%)]" />
        <canvas ref={canvasRef} className="absolute inset-0 z-[1]" />
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.4 }}
          className="w-full max-w-md relative z-10 p-4"
        >
          <div className="rounded-2xl border border-white/20 bg-white/10 backdrop-blur-xl shadow-2xl shadow-black/20 p-8 text-center space-y-6">
            <div className="mx-auto h-20 w-20 rounded-full bg-destructive/20 flex items-center justify-center">
              <AlertTriangle className="h-10 w-10 text-red-400" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-white">Acesso Bloqueado</h1>
              <p className="text-sm text-white/60 mt-3 leading-relaxed">{planBlocked.reason}</p>
            </div>
            <div className="space-y-3">
              <Button className="w-full gap-2 h-12 text-base bg-gradient-to-r from-[hsl(var(--primary))] to-[hsl(199,89%,50%)] hover:from-[hsl(199,89%,45%)] hover:to-[hsl(199,89%,55%)] shadow-lg" onClick={handleRenewPlan}>
                <CreditCard className="h-5 w-5" />
                Escolher novo plano
              </Button>
              <Button variant="outline" className="w-full gap-2 h-11 border-white/20 text-white hover:bg-white/10" asChild>
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
    <div className="min-h-screen flex relative overflow-hidden">
      {/* Dark gradient background */}
      <div className="absolute inset-0 bg-gradient-to-br from-[hsl(199,89%,15%)] via-[hsl(199,89%,25%)] to-[hsl(222,47%,11%)]" />

      {/* Particle canvas */}
      <canvas ref={canvasRef} className="absolute inset-0 z-[1]" />

      {/* Mesh gradient blobs */}
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
        <motion.div
          animate={{ x: [0, -50, 30, 0], y: [0, 60, -40, 0] }}
          transition={{ duration: 20, repeat: Infinity, ease: "easeInOut" }}
          className="absolute top-[20%] right-[20%] w-[250px] h-[250px] bg-[hsl(199,89%,60%/0.1)] rounded-full blur-2xl"
        />
      </div>

      {/* Left decorative panel */}
      <div className="hidden lg:flex lg:w-1/2 relative z-10 items-center justify-center p-12">
        <motion.div
          initial={{ opacity: 0, x: -40 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.8 }}
          className="text-center space-y-8"
        >
          <div className="relative mx-auto w-28 h-28">
            <div className="absolute inset-0 rounded-2xl bg-gradient-to-br from-[hsl(var(--primary))] to-[hsl(var(--accent))] opacity-20 blur-xl animate-pulse" />
            <div className="relative w-28 h-28 rounded-2xl bg-white/10 backdrop-blur-sm border border-white/20 flex items-center justify-center">
              {settings.logo_url ? (
                <img src={settings.logo_url} alt="Logo" className="h-14 w-14 object-contain" />
              ) : (
                <Store className="h-14 w-14 text-white" />
              )}
            </div>
          </div>
          <div className="space-y-4">
            <h2 className="text-4xl font-bold text-white tracking-tight">
              Gerencie suas vendas com inteligência
            </h2>
            <p className="text-lg text-white/60 max-w-sm mx-auto leading-relaxed">
              Simulações, contratos e acompanhamento — tudo em um só lugar.
            </p>
          </div>
          <div className="flex items-center justify-center gap-6 text-white/40">
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

      {/* Right login panel */}
      <div className="flex-1 flex items-center justify-center relative z-10 p-6">
        <motion.div
          initial={{ opacity: 0, y: 30, scale: 0.95 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{ duration: 0.6, delay: 0.2 }}
          className="w-full max-w-md"
        >
          <div className="bg-white/10 backdrop-blur-xl rounded-2xl border border-white/20 shadow-2xl shadow-black/20 p-8 space-y-6">
            {/* Header */}
            <div className="text-center space-y-3">
              <div className="lg:hidden mx-auto w-16 h-16 rounded-xl bg-gradient-to-br from-[hsl(var(--primary))] to-[hsl(var(--accent))] flex items-center justify-center shadow-lg shadow-[hsl(var(--primary)/0.3)]">
                {settings.logo_url ? (
                  <img src={settings.logo_url} alt="Logo" className="h-8 w-8 object-contain" />
                ) : (
                  <Store className="h-8 w-8 text-white" />
                )}
              </div>
              <div>
                <h1 className="text-2xl font-bold text-white">{companyName}</h1>
                <p className="text-sm text-white/50 mt-1">{companySubtitle}</p>
              </div>
            </div>

            {/* Form */}
            <form onSubmit={handleLogin} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="codigoLoja" className="text-sm font-medium text-white/80">
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
                    className="pl-10 h-12 bg-white/5 border-white/10 text-white placeholder:text-white/25 focus:border-[hsl(var(--primary))] focus:ring-[hsl(var(--primary)/0.3)] rounded-xl transition-all"
                    autoComplete="off"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="email" className="text-sm font-medium text-white/80">
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
                    className="pl-10 h-12 bg-white/5 border-white/10 text-white placeholder:text-white/25 focus:border-[hsl(var(--primary))] focus:ring-[hsl(var(--primary)/0.3)] rounded-xl transition-all"
                    autoComplete="email"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="senha" className="text-sm font-medium text-white/80">
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
                    className="pl-10 pr-10 h-12 bg-white/5 border-white/10 text-white placeholder:text-white/25 focus:border-[hsl(var(--primary))] focus:ring-[hsl(var(--primary)/0.3)] rounded-xl transition-all"
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
                <button
                  type="button"
                  className="text-xs text-white/40 hover:text-[hsl(var(--primary))] transition-colors"
                  onClick={() => setShowForgotPassword(true)}
                >
                  Esqueci minha senha
                </button>
              </div>

              <Button
                type="submit"
                disabled={loading}
                className="w-full h-12 rounded-xl text-base font-semibold gap-2 bg-gradient-to-r from-[hsl(var(--primary))] to-[hsl(199,89%,50%)] hover:from-[hsl(199,89%,45%)] hover:to-[hsl(199,89%,55%)] shadow-lg shadow-[hsl(var(--primary)/0.3)] transition-all duration-300 hover:shadow-xl hover:shadow-[hsl(var(--primary)/0.4)] hover:scale-[1.02]"
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
                className="w-full gap-2 h-11 rounded-xl border-white/15 text-white/80 hover:bg-white/10 hover:text-white bg-transparent transition-colors"
                onClick={() => navigate("/signup")}
              >
                <UserPlus className="h-4 w-4" />
                Criar minha conta
              </Button>
              <Button
                variant="outline"
                className="w-full gap-2 border-emerald-400/50 bg-emerald-500/10 text-emerald-300 hover:bg-emerald-500/20 hover:text-emerald-200 hover:border-emerald-400/70 transition-all duration-300 font-semibold shadow-[0_0_15px_rgba(16,185,129,0.15)]"
                onClick={() => setShowTracking(true)}
              >
                <Search className="h-4 w-4" />
                📍 Acompanhe seu Projeto
              </Button>
            </div>
          </div>

          {/* Security badge */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.8 }}
            className="flex items-center justify-center gap-2 mt-6 text-white/25 text-xs"
          >
            <Lock className="h-3 w-3" />
            Conexão protegida · {companyName} © 2026
          </motion.div>
        </motion.div>
      </div>

      <ClientTrackingModal open={showTracking} onClose={() => setShowTracking(false)} />
    </div>
  );
}
