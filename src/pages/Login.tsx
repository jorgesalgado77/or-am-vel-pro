import { useState } from "react";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { LogIn, Eye, EyeOff, Search, UserPlus, AlertTriangle, CreditCard, Headphones, Store } from "lucide-react";
import { toast } from "sonner";
import { logAudit } from "@/services/auditService";
import { useCompanySettings } from "@/hooks/useCompanySettings";
import { ClientTrackingModal } from "@/components/ClientTrackingModal";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { maskCodigoLoja, unmask } from "@/lib/masks";

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
      // Use sessionStorage for ephemeral cross-page state (not auth-sensitive)
      sessionStorage.setItem("renew_tenant_id", planBlocked.tenantId);
      navigate("/renew-plan");
    }
  };

  if (planBlocked) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-background p-4">
        <Card className="w-full max-w-sm shadow-lg border-destructive/30">
          <CardHeader className="text-center space-y-3 pb-2">
            <div className="mx-auto h-16 w-16 rounded-full bg-destructive/10 flex items-center justify-center">
              <AlertTriangle className="h-8 w-8 text-destructive" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-foreground">Acesso Bloqueado</h1>
              <p className="text-sm text-muted-foreground mt-2">{planBlocked.reason}</p>
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            <Button className="w-full gap-2" onClick={handleRenewPlan}>
              <CreditCard className="h-4 w-4" />
              Escolher novo plano
            </Button>
            <Button variant="outline" className="w-full gap-2" asChild>
              <a href="mailto:suporte@orcamovel.com.br">
                <Headphones className="h-4 w-4" />
                Contatar suporte técnico
              </a>
            </Button>
            <Button variant="ghost" className="w-full" onClick={() => setPlanBlocked(null)}>
              Voltar ao login
            </Button>
          </CardContent>
        </Card>
        <p className="mt-6 text-xs text-muted-foreground text-center">
          Todos os direitos reservados - 2026 - CNPJ: 58.847.751/0001-28
        </p>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-background p-4">
      <Card className="w-full max-w-sm shadow-lg border-border/50">
        <CardHeader className="text-center space-y-3 pb-2">
          {settings.logo_url && (
            <img src={settings.logo_url} alt="Logo" className="h-20 w-auto object-contain mx-auto mb-2" />
          )}
          <div>
            <h1 className="text-xl font-bold text-foreground">
              {settings.company_name !== "INOVAMAD" ? settings.company_name : "OrçaMóvel PRO"}
            </h1>
            <p className="text-sm text-muted-foreground">
              {settings.company_subtitle && settings.company_subtitle !== "Gestão & Financiamento"
                ? settings.company_subtitle
                : "Orce. Venda. Simplifique"}
            </p>
          </div>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleLogin} className="space-y-4">
            <div>
              <Label htmlFor="codigoLoja">Código da Loja</Label>
              <div className="relative mt-1">
                <Input
                  id="codigoLoja"
                  type="text"
                  inputMode="numeric"
                  value={codigoLoja}
                  onChange={(e) => setCodigoLoja(maskCodigoLoja(e.target.value))}
                  placeholder="000.000"
                  maxLength={7}
                  className="pl-10"
                  autoComplete="off"
                />
                <Store className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              </div>
            </div>
            <div>
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="seu@email.com"
                className="mt-1"
                autoComplete="email"
              />
            </div>
            <div>
              <Label htmlFor="senha">Senha</Label>
              <div className="relative mt-1">
                <Input
                  id="senha"
                  type={showPassword ? "text" : "password"}
                  value={senha}
                  onChange={(e) => setSenha(e.target.value)}
                  placeholder="••••••••"
                  autoComplete="current-password"
                  className="pr-10"
                />
                <button
                  type="button"
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  onClick={() => setShowPassword(!showPassword)}
                  tabIndex={-1}
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>
            <Button type="submit" className="w-full gap-2" disabled={loading}>
              <LogIn className="h-4 w-4" />
              {loading ? "Entrando..." : "Entrar"}
            </Button>
          </form>
          <div className="mt-3 pt-3 border-t border-border space-y-2">
            <Button variant="outline" className="w-full gap-2" onClick={() => navigate("/signup")}>
              <UserPlus className="h-4 w-4" />
              Criar minha conta
            </Button>
            <Button variant="ghost" className="w-full gap-2" onClick={() => setShowTracking(true)}>
              <Search className="h-4 w-4" />
              Acompanhe seu Projeto
            </Button>
          </div>
        </CardContent>
      </Card>

      <p className="mt-6 text-xs text-muted-foreground text-center">
        Todos os direitos reservados - 2026 - CNPJ: 58.847.751/0001-28
      </p>

      <ClientTrackingModal open={showTracking} onClose={() => setShowTracking(false)} />
    </div>
  );
}
