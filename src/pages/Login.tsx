import { useState } from "react";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { LogIn, Eye, EyeOff, Search, UserPlus, AlertTriangle, CreditCard, Headphones } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { logAudit } from "@/services/auditService";
import { useCompanySettings } from "@/hooks/useCompanySettings";
import { maskCodigoLoja } from "@/lib/masks";
import { ClientTrackingModal } from "@/components/ClientTrackingModal";
import { useNavigate } from "react-router-dom";

interface LoginProps {
  onLogin: (userId: string, primeiroLogin: boolean) => void;
}

interface PlanBlockInfo {
  reason: string;
  tenantId: string;
}

export default function Login({ onLogin }: LoginProps) {
  const navigate = useNavigate();
  const { settings } = useCompanySettings();
  const [codigoLoja, setCodigoLoja] = useState("");
  const [nomeUsuario, setNomeUsuario] = useState("");
  const [senha, setSenha] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [showTracking, setShowTracking] = useState(false);
  const [planBlocked, setPlanBlocked] = useState<PlanBlockInfo | null>(null);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!nomeUsuario.trim() || !senha.trim()) {
      toast.error("Preencha todos os campos");
      return;
    }

    setLoading(true);
    setPlanBlocked(null);

    // Verify store code — find company_settings by codigo_loja
    const trimmedCode = codigoLoja.trim();
    let tenantId: string | null = null;

    if (trimmedCode) {
      const { data: companyData } = await supabase
        .from("company_settings")
        .select("codigo_loja, tenant_id")
        .eq("codigo_loja", trimmedCode)
        .limit(1)
        .single();

      if (!companyData) {
        toast.error("Código da loja inválido");
        setLoading(false);
        return;
      }
      tenantId = (companyData as any)?.tenant_id;
    } else {
      // Fallback: single-tenant check
      const { data: companyData } = await supabase
        .from("company_settings")
        .select("codigo_loja, tenant_id")
        .limit(1)
        .single();

      const storedCode = (companyData as any)?.codigo_loja;
      if (storedCode && storedCode.trim() !== "") {
        toast.error("Informe o código da loja");
        setLoading(false);
        return;
      }
      tenantId = (companyData as any)?.tenant_id;
    }

    // Find user by name, apelido or email
    const { data: users } = await supabase
      .from("usuarios")
      .select("id, nome_completo, apelido, email, ativo, senha, primeiro_login")
      .eq("ativo", true);

    const input = nomeUsuario.trim().toLowerCase();
    const user = (users as any[])?.find(
      (u) =>
        u.apelido?.toLowerCase() === input ||
        u.nome_completo.toLowerCase() === input ||
        u.email?.toLowerCase() === input
    );

    if (!user) {
      toast.error("Usuário não encontrado");
      setLoading(false);
      return;
    }

    if (!user.senha) {
      toast.error("Senha não configurada. Contate o administrador.");
      setLoading(false);
      return;
    }

    // Hash input password using same SHA256 function as admin_master
    const { data: hashResult } = await supabase.rpc("hash_password", { plain_text: senha }) as any;

    if (user.senha !== hashResult) {
      toast.error("Senha incorreta");
      setLoading(false);
      return;
    }

    // === CHECK TENANT PLAN VALIDITY ===
    if (tenantId) {
      const { data: tenant } = await supabase
        .from("tenants")
        .select("*")
        .eq("id", tenantId)
        .single();

      if (tenant) {
        const t = tenant as any;
        const now = new Date();

        // Check if tenant is inactive/banned
        if (!t.ativo) {
          setPlanBlocked({
            reason: "Sua conta foi suspensa ou banida. Entre em contato com o suporte técnico da plataforma para mais informações.",
            tenantId,
          });
          setLoading(false);
          return;
        }

        // Check plan expiration
        if (t.plano === "trial") {
          const trialFim = new Date(t.trial_fim);
          if (now > trialFim) {
            setPlanBlocked({
              reason: "Seu período de teste gratuito expirou. Escolha um plano para continuar usando a plataforma.",
              tenantId,
            });
            setLoading(false);
            return;
          }
        } else if (t.assinatura_fim) {
          const assFim = new Date(t.assinatura_fim);
          if (now > assFim) {
            setPlanBlocked({
              reason: "Sua assinatura expirou. Renove seu plano para continuar tendo acesso à plataforma.",
              tenantId,
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
      detalhes: { nome: user.nome_completo },
    });

    onLogin(user.id, user.primeiro_login ?? true);
  };

  const handleRenewPlan = () => {
    if (planBlocked?.tenantId) {
      localStorage.setItem("renew_tenant_id", planBlocked.tenantId);
      navigate("/renew-plan");
    }
  };

  // === BLOCKED SCREEN ===
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
            <img
              src={settings.logo_url}
              alt="Logo"
              className="h-20 w-auto object-contain mx-auto mb-2"
            />
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
              <Input
                id="codigoLoja"
                value={codigoLoja}
                onChange={(e) => setCodigoLoja(maskCodigoLoja(e.target.value))}
                placeholder="000.000"
                maxLength={7}
                className="mt-1"
              />
            </div>
            <div>
              <Label htmlFor="nomeUsuario">Nome do Usuário</Label>
              <Input
                id="nomeUsuario"
                value={nomeUsuario}
                onChange={(e) => setNomeUsuario(e.target.value)}
                placeholder="Nome, apelido ou email"
                className="mt-1"
                autoComplete="username"
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
