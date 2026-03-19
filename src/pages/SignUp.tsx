import { useEffect, useRef, useState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { UserPlus, Eye, EyeOff, ArrowLeft, Mail, Lock, ShieldCheck, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { motion } from "framer-motion";
import { createStoreAndAdminAccount } from "@/lib/accountProvisioning";
import { FirstAccessCredentialsCard } from "@/components/auth/FirstAccessCredentialsCard";

interface CreatedAccountState {
  tenantId: string;
  codigoLoja: string;
  email: string;
  password: string;
}

export default function SignUp() {
  const navigate = useNavigate();
  const { login } = useAuth();
  const [email, setEmail] = useState("");
  const [senha, setSenha] = useState("");
  const [confirmarSenha, setConfirmarSenha] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [createdAccount, setCreatedAccount] = useState<CreatedAccountState | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

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

  const handleSignUp = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmedEmail = email.trim().toLowerCase();
    const trimmedSenha = senha.trim();
    const trimmedConfirmacao = confirmarSenha.trim();

    if (!trimmedEmail || !trimmedSenha || !trimmedConfirmacao) {
      toast.error("Preencha todos os campos");
      return;
    }

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmedEmail)) {
      toast.error("Email inválido");
      return;
    }

    if (trimmedSenha.length < 6) {
      toast.error("A senha deve ter pelo menos 6 caracteres");
      return;
    }

    if (trimmedSenha !== trimmedConfirmacao) {
      toast.error("As senhas não conferem");
      return;
    }

    setLoading(true);

    try {
      const account = await createStoreAndAdminAccount(trimmedEmail, trimmedSenha);
      const { user, error } = await login(trimmedEmail, trimmedSenha);

      if (error || !user) {
        throw new Error(error || "Conta criada, mas não foi possível iniciar a sessão.");
      }

      setCreatedAccount({
        tenantId: account.tenantId,
        codigoLoja: account.codigoLoja,
        email: trimmedEmail,
        password: trimmedSenha,
      });
      setSenha("");
      setConfirmarSenha("");
      toast.success("Conta criada com sucesso!");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Erro inesperado ao criar conta");
    } finally {
      setLoading(false);
    }
  };

  const handleContinueToOnboarding = () => {
    if (!createdAccount) return;

    sessionStorage.setItem("onboarding_tenant_id", createdAccount.tenantId);
    sessionStorage.setItem("onboarding_codigo_loja", createdAccount.codigoLoja);
    navigate("/onboarding");
  };

  return (
    <div className="min-h-screen flex relative overflow-hidden">
      <div className="absolute inset-0 bg-gradient-to-br from-[hsl(199,89%,15%)] via-[hsl(199,89%,25%)] to-[hsl(222,47%,11%)]" />
      <canvas ref={canvasRef} className="absolute inset-0 z-[1]" />

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
              <UserPlus className="h-14 w-14 text-white" />
            </div>
          </div>

          <div className="space-y-4">
            <h2 className="text-4xl font-bold text-white tracking-tight">
              {createdAccount ? "Anote seus dados de acesso" : "Comece agora mesmo"}
            </h2>
            <p className="text-lg text-white/60 max-w-sm mx-auto leading-relaxed">
              {createdAccount
                ? "O código da loja, o login e a senha serão exigidos no próximo acesso do administrador."
                : "Crie sua conta gratuita e receba automaticamente o código da sua loja no formato 999.999."}
            </p>
          </div>

          <div className="flex items-center justify-center gap-6 text-white/40">
            <div className="flex items-center gap-2 text-sm">
              <div className="w-2 h-2 rounded-full bg-[hsl(var(--accent))]" />
              Código automático
            </div>
            <div className="flex items-center gap-2 text-sm">
              <div className="w-2 h-2 rounded-full bg-[hsl(var(--primary))]" />
              Primeiro usuário administrador
            </div>
            <div className="flex items-center gap-2 text-sm">
              <div className="w-2 h-2 rounded-full bg-[hsl(160,84%,60%)]" />
              Loja pronta para equipe
            </div>
          </div>
        </motion.div>
      </div>

      <div className="flex-1 flex items-center justify-center relative z-10 p-6">
        <motion.div
          initial={{ opacity: 0, y: 30, scale: 0.95 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{ duration: 0.6, delay: 0.2 }}
          className="w-full max-w-md"
        >
          <div className="bg-white/10 backdrop-blur-xl rounded-2xl border border-white/20 shadow-2xl shadow-black/20 p-8 space-y-6">
            {createdAccount ? (
              <FirstAccessCredentialsCard
                codigoLoja={createdAccount.codigoLoja}
                email={createdAccount.email}
                password={createdAccount.password}
                onContinue={handleContinueToOnboarding}
              />
            ) : (
              <>
                <div className="text-center space-y-3">
                  <div className="lg:hidden mx-auto w-16 h-16 rounded-xl bg-gradient-to-br from-[hsl(var(--primary))] to-[hsl(var(--accent))] flex items-center justify-center shadow-lg shadow-[hsl(var(--primary)/0.3)]">
                    <UserPlus className="h-8 w-8 text-white" />
                  </div>
                  <div>
                    <h1 className="text-2xl font-bold text-white">Criar sua conta</h1>
                    <p className="text-sm text-white/50 mt-1">Preencha os dados para começar</p>
                  </div>
                </div>

                <form onSubmit={handleSignUp} className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="email" className="text-sm font-medium text-white/80">Email</Label>
                    <div className="relative">
                      <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-white/30" />
                      <Input
                        id="email"
                        type="email"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        placeholder="seu@email.com"
                        autoComplete="email"
                        className="pl-10 h-12 bg-white/5 border-white/10 text-white placeholder:text-white/25 focus:border-[hsl(var(--primary))] focus:ring-[hsl(var(--primary)/0.3)] rounded-xl transition-all"
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="senha" className="text-sm font-medium text-white/80">Senha</Label>
                    <div className="relative">
                      <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-white/30" />
                      <Input
                        id="senha"
                        type={showPassword ? "text" : "password"}
                        value={senha}
                        onChange={(e) => setSenha(e.target.value)}
                        placeholder="Mínimo 6 caracteres"
                        autoComplete="new-password"
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

                  <div className="space-y-2">
                    <Label htmlFor="confirmarSenha" className="text-sm font-medium text-white/80">Confirmar Senha</Label>
                    <div className="relative">
                      <ShieldCheck className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-white/30" />
                      <Input
                        id="confirmarSenha"
                        type={showPassword ? "text" : "password"}
                        value={confirmarSenha}
                        onChange={(e) => setConfirmarSenha(e.target.value)}
                        placeholder="Repita a senha"
                        autoComplete="new-password"
                        className="pl-10 h-12 bg-white/5 border-white/10 text-white placeholder:text-white/25 focus:border-[hsl(var(--primary))] focus:ring-[hsl(var(--primary)/0.3)] rounded-xl transition-all"
                      />
                    </div>
                  </div>

                  <Button
                    type="submit"
                    disabled={loading}
                    className="w-full h-12 rounded-xl text-base font-semibold gap-2 bg-gradient-to-r from-[hsl(var(--primary))] to-[hsl(199,89%,50%)] hover:from-[hsl(199,89%,45%)] hover:to-[hsl(199,89%,55%)] shadow-lg shadow-[hsl(var(--primary)/0.3)] transition-all duration-300 hover:shadow-xl hover:shadow-[hsl(var(--primary)/0.4)] hover:scale-[1.02]"
                  >
                    {loading ? <Loader2 className="h-5 w-5 animate-spin" /> : <UserPlus className="h-5 w-5" />}
                    {loading ? "Criando conta..." : "Criar Conta"}
                  </Button>
                </form>

                <div className="relative">
                  <div className="absolute inset-0 flex items-center">
                    <span className="w-full border-t border-white/10" />
                  </div>
                  <div className="relative flex justify-center text-xs">
                    <span className="bg-transparent px-3 text-white/30">ou</span>
                  </div>
                </div>

                <Button
                  variant="outline"
                  className="w-full gap-2 h-11 rounded-xl border-white/15 text-white/80 hover:bg-white/10 hover:text-white bg-transparent transition-colors"
                  onClick={() => navigate("/app")}
                >
                  <ArrowLeft className="h-4 w-4" />
                  Já tenho uma conta
                </Button>
              </>
            )}
          </div>

          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.8 }}
            className="flex items-center justify-center gap-2 mt-6 text-white/25 text-xs"
          >
            <Lock className="h-3 w-3" />
            Conexão protegida · Ambiente seguro
          </motion.div>
        </motion.div>
      </div>
    </div>
  );
}
