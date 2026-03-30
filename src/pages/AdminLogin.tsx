import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Shield, Eye, EyeOff, Lock, Mail, Loader2 } from "lucide-react";
import { supabase } from "@/lib/supabaseClient";
import { toast } from "sonner";
import { motion } from "framer-motion";
import { ParticleBackground } from "@/components/auth/ParticleBackground";

interface AdminLoginProps {
  onLogin: (adminId: string, adminName: string) => void;
}

export default function AdminLogin({ onLogin }: AdminLoginProps) {
  const [email, setEmail] = useState("");
  const [senha, setSenha] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);


  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim() || !senha.trim()) {
      toast.error("Preencha todos os campos");
      return;
    }

    setLoading(true);
    const normalizedEmail = email.trim().toLowerCase();

    try {
      // Validate admin credentials via RPC or direct query
      let adminInfo: { id: string; nome: string } | null = null;

      const { data: rpcData, error: rpcError } = await (supabase as any).rpc("admin_login", {
        p_email: normalizedEmail,
        p_senha: senha,
      });

      if (!rpcError) {
        const admin = Array.isArray(rpcData) ? rpcData[0] : rpcData;
        if (admin) adminInfo = { id: admin.id, nome: admin.nome };
      }

      // Fallback: direct query
      if (!adminInfo) {
        const { data, error } = await supabase
          .from("admin_master")
          .select("id, nome, email, senha")
          .eq("email", normalizedEmail)
          .maybeSingle();

        if (error) {
          toast.error("Erro ao validar administrador");
          setLoading(false);
          return;
        }
        if (!data) {
          toast.error("Administrador master ainda não foi configurado no banco");
          setLoading(false);
          return;
        }
        if ((data as any).senha !== senha) {
          toast.error("Senha incorreta");
          setLoading(false);
          return;
        }
        adminInfo = { id: (data as any).id, nome: (data as any).nome };
      }

      if (!adminInfo) {
        toast.error("Credenciais inválidas");
        setLoading(false);
        return;
      }

      // Sign in via Supabase Auth so RPC/RLS policies work
      const { error: authError } = await supabase.auth.signInWithPassword({
        email: normalizedEmail,
        password: senha,
      });

      if (authError) {
        console.warn("[AdminLogin] Auth sign-in failed:", authError.message);
        // Try creating the auth user if it doesn't exist
        const { data: signUpData, error: signUpError } = await supabase.auth.signUp({
          email: normalizedEmail,
          password: senha,
          options: {
            data: { nome_completo: adminInfo.nome, is_admin_master: true },
            emailRedirectTo: window.location.origin,
          },
        });

        if (signUpError) {
          console.warn("[AdminLogin] Could not create Supabase Auth user:", signUpError.message);
          // Still proceed - admin validated via admin_master table
        } else if (signUpData?.user) {
          // Try signing in again after signup
          const { error: retryError } = await supabase.auth.signInWithPassword({
            email: normalizedEmail,
            password: senha,
          });
          if (retryError) {
            console.warn("[AdminLogin] Auth retry failed (email may need confirmation):", retryError.message);
          }
        }
      }

      setLoading(false);
      toast.success(`Bem-vindo, ${adminInfo.nome}!`);
      onLogin(adminInfo.id, adminInfo.nome);
    } catch {
      toast.error("Erro ao conectar. Tente novamente.");
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex relative overflow-hidden">
      {/* Animated background */}
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

      {/* Decorative side panel */}
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
              <Shield className="h-14 w-14 text-white" />
            </div>
          </div>
          <div className="space-y-4">
            <h2 className="text-4xl font-bold text-white tracking-tight">
              Painel Master
            </h2>
            <p className="text-lg text-white/60 max-w-sm mx-auto leading-relaxed">
              Gerencie lojas, planos, pagamentos e configurações globais da plataforma.
            </p>
          </div>
          <div className="flex items-center justify-center gap-6 text-white/40">
            <div className="flex items-center gap-2 text-sm">
              <div className="w-2 h-2 rounded-full bg-[hsl(var(--accent))]" />
              Multi-tenant
            </div>
            <div className="flex items-center gap-2 text-sm">
              <div className="w-2 h-2 rounded-full bg-[hsl(var(--primary))]" />
              Seguro
            </div>
            <div className="flex items-center gap-2 text-sm">
              <div className="w-2 h-2 rounded-full bg-[hsl(160,84%,60%)]" />
              Completo
            </div>
          </div>
        </motion.div>
      </div>

      {/* Login form */}
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
                <Shield className="h-8 w-8 text-white" />
              </div>
              <div>
                <h1 className="text-2xl font-bold text-white">
                  Acesso Administrativo
                </h1>
                <p className="text-sm text-white/50 mt-1">
                  Entre com suas credenciais de administrador master
                </p>
              </div>
            </div>

            {/* Form */}
            <form onSubmit={handleLogin} className="space-y-5">
              <div className="space-y-2">
                <Label htmlFor="adminEmail" className="text-sm font-medium text-white/80">
                  Email
                </Label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-white/30" />
                  <Input
                    id="adminEmail"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="admin@sistema.com"
                    autoComplete="email"
                    className="pl-10 h-12 bg-white/5 border-white/10 text-white placeholder:text-white/25 focus:border-[hsl(var(--primary))] focus:ring-[hsl(var(--primary)/0.3)] rounded-xl transition-all"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="adminSenha" className="text-sm font-medium text-white/80">
                  Senha
                </Label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-white/30" />
                  <Input
                    id="adminSenha"
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

              <Button
                type="submit"
                disabled={loading}
                className="w-full h-12 rounded-xl text-base font-semibold gap-2 bg-gradient-to-r from-[hsl(var(--primary))] to-[hsl(199,89%,50%)] hover:from-[hsl(199,89%,45%)] hover:to-[hsl(199,89%,55%)] shadow-lg shadow-[hsl(var(--primary)/0.3)] transition-all duration-300 hover:shadow-xl hover:shadow-[hsl(var(--primary)/0.4)] hover:scale-[1.02]"
              >
                {loading ? (
                  <Loader2 className="h-5 w-5 animate-spin" />
                ) : (
                  <Shield className="h-5 w-5" />
                )}
                {loading ? "Autenticando..." : "Acessar Painel"}
              </Button>
            </form>

            {/* Footer */}
            <div className="text-center">
              <p className="text-xs text-white/30">
                Acesso exclusivo para administradores autorizados
              </p>
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
            Conexão protegida · Ambiente seguro
          </motion.div>
        </motion.div>
      </div>
    </div>
  );
}
