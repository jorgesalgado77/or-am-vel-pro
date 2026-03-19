import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { LogIn, Eye, EyeOff, Search, UserPlus, AlertTriangle, CreditCard, Headphones, Store, Mail, Lock } from "lucide-react";
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

    // Validate store code matches user's tenant
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

    // Check tenant plan validity
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
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-primary/10 via-background to-accent/10 p-4">
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.4 }}
          className="w-full max-w-md"
        >
          <div className="rounded-2xl border border-destructive/20 bg-card/80 backdrop-blur-xl shadow-2xl p-8 text-center space-y-6">
            <div className="mx-auto h-20 w-20 rounded-full bg-destructive/10 flex items-center justify-center">
              <AlertTriangle className="h-10 w-10 text-destructive" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-foreground">Acesso Bloqueado</h1>
              <p className="text-sm text-muted-foreground mt-3 leading-relaxed">{planBlocked.reason}</p>
            </div>
            <div className="space-y-3">
              <Button className="w-full gap-2 h-12 text-base" onClick={handleRenewPlan}>
                <CreditCard className="h-5 w-5" />
                Escolher novo plano
              </Button>
              <Button variant="outline" className="w-full gap-2 h-11" asChild>
                <a href="mailto:suporte@orcamovel.com.br">
                  <Headphones className="h-4 w-4" />
                  Contatar suporte técnico
                </a>
              </Button>
              <Button variant="ghost" className="w-full text-muted-foreground" onClick={() => setPlanBlocked(null)}>
                Voltar ao login
              </Button>
            </div>
          </div>
          <p className="mt-8 text-xs text-muted-foreground text-center">
            Todos os direitos reservados – 2026 – CNPJ: 58.847.751/0001-28
          </p>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex">
      {/* Left decorative panel — hidden on mobile */}
      <div className="hidden md:flex md:w-[45%] relative overflow-hidden bg-gradient-to-br from-primary via-primary/90 to-accent items-center justify-center">
        {/* Decorative circles */}
        <div className="absolute -top-20 -left-20 h-72 w-72 rounded-full bg-white/10 blur-3xl" />
        <div className="absolute bottom-10 right-10 h-56 w-56 rounded-full bg-accent/30 blur-2xl" />
        <div className="absolute top-1/2 left-1/3 h-40 w-40 rounded-full bg-white/5 blur-xl" />

        <motion.div
          initial={{ opacity: 0, x: -30 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.6, delay: 0.2 }}
          className="relative z-10 max-w-md px-10 text-primary-foreground"
        >
          <h2 className="text-4xl font-extrabold leading-tight tracking-tight">
            Gerencie suas vendas com inteligência
          </h2>
          <p className="mt-4 text-lg text-primary-foreground/80 leading-relaxed">
            Simulações, contratos e acompanhamento — tudo em um só lugar.
          </p>
          <div className="mt-10 flex gap-6">
            {[
              { value: "+500", label: "Lojas ativas" },
              { value: "98%", label: "Satisfação" },
              { value: "24/7", label: "Suporte" },
            ].map((stat) => (
              <div key={stat.label}>
                <p className="text-2xl font-bold">{stat.value}</p>
                <p className="text-sm text-primary-foreground/70">{stat.label}</p>
              </div>
            ))}
          </div>
        </motion.div>
      </div>

      {/* Right login panel */}
      <div className="flex-1 flex flex-col items-center justify-center bg-gradient-to-br from-background via-background to-primary/5 p-6 sm:p-10">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="w-full max-w-[420px] space-y-8"
        >
          {/* Logo / Brand */}
          <div className="text-center space-y-2">
            {settings.logo_url ? (
              <img src={settings.logo_url} alt="Logo" className="h-16 w-auto object-contain mx-auto" />
            ) : (
              <div className="mx-auto h-14 w-14 rounded-xl bg-primary/10 flex items-center justify-center">
                <Store className="h-7 w-7 text-primary" />
              </div>
            )}
            <h1 className="text-2xl font-bold text-foreground tracking-tight">{companyName}</h1>
            <p className="text-sm text-muted-foreground">{companySubtitle}</p>
          </div>

          {/* Form card */}
          <div className="rounded-2xl border border-border/50 bg-card/70 backdrop-blur-sm shadow-xl p-6 sm:p-8 space-y-5">
            <form onSubmit={handleLogin} className="space-y-4">
              {/* Código da Loja */}
              <div className="space-y-1.5">
                <Label htmlFor="codigoLoja" className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Código da Loja
                </Label>
                <div className="relative">
                  <Input
                    id="codigoLoja"
                    type="text"
                    inputMode="numeric"
                    value={codigoLoja}
                    onChange={(e) => setCodigoLoja(maskCodigoLoja(e.target.value))}
                    placeholder="000.000"
                    maxLength={7}
                    className="pl-10 h-11 bg-background/50 border-border/60 focus:bg-background transition-colors"
                    autoComplete="off"
                  />
                  <Store className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground/60" />
                </div>
              </div>

              {/* Email */}
              <div className="space-y-1.5">
                <Label htmlFor="email" className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Email
                </Label>
                <div className="relative">
                  <Input
                    id="email"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="seu@email.com"
                    className="pl-10 h-11 bg-background/50 border-border/60 focus:bg-background transition-colors"
                    autoComplete="email"
                  />
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground/60" />
                </div>
              </div>

              {/* Senha */}
              <div className="space-y-1.5">
                <Label htmlFor="senha" className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Senha
                </Label>
                <div className="relative">
                  <Input
                    id="senha"
                    type={showPassword ? "text" : "password"}
                    value={senha}
                    onChange={(e) => setSenha(e.target.value)}
                    placeholder="••••••••"
                    autoComplete="current-password"
                    className="pl-10 pr-10 h-11 bg-background/50 border-border/60 focus:bg-background transition-colors"
                  />
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground/60" />
                  <button
                    type="button"
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground/60 hover:text-foreground transition-colors"
                    onClick={() => setShowPassword(!showPassword)}
                    tabIndex={-1}
                  >
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>

              {/* Submit */}
              <Button
                type="submit"
                className="w-full gap-2 h-12 text-base font-semibold shadow-lg shadow-primary/20 hover:shadow-primary/30 transition-shadow"
                disabled={loading}
              >
                <LogIn className="h-5 w-5" />
                {loading ? "Entrando..." : "Entrar"}
              </Button>
            </form>

            {/* Divider */}
            <div className="relative">
              <div className="absolute inset-0 flex items-center">
                <span className="w-full border-t border-border/50" />
              </div>
              <div className="relative flex justify-center text-xs">
                <span className="bg-card/70 px-3 text-muted-foreground">ou</span>
              </div>
            </div>

            {/* Secondary actions */}
            <div className="space-y-2">
              <Button
                variant="outline"
                className="w-full gap-2 h-11 border-border/60 hover:bg-accent/10 transition-colors"
                onClick={() => navigate("/signup")}
              >
                <UserPlus className="h-4 w-4" />
                Criar minha conta
              </Button>
              <Button
                variant="ghost"
                className="w-full gap-2 text-muted-foreground hover:text-foreground"
                onClick={() => setShowTracking(true)}
              >
                <Search className="h-4 w-4" />
                Acompanhe seu Projeto
              </Button>
            </div>
          </div>

          {/* Footer */}
          <p className="text-center text-xs text-muted-foreground/60">
            Todos os direitos reservados – 2026 – CNPJ: 58.847.751/0001-28
          </p>
        </motion.div>
      </div>

      <ClientTrackingModal open={showTracking} onClose={() => setShowTracking(false)} />
    </div>
  );
}
