import { useState } from "react";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { UserPlus, Eye, EyeOff, ArrowLeft } from "lucide-react";
import { supabase } from "@/lib/supabaseClient";
import { toast } from "sonner";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";

export default function SignUp() {
  const navigate = useNavigate();
  const { signUp } = useAuth();
  const [email, setEmail] = useState("");
  const [senha, setSenha] = useState("");
  const [confirmarSenha, setConfirmarSenha] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleSignUp = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmedEmail = email.trim().toLowerCase();
    const trimmedSenha = senha.trim();

    if (!trimmedEmail || !trimmedSenha || !confirmarSenha.trim()) {
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

    if (trimmedSenha !== confirmarSenha.trim()) {
      toast.error("As senhas não conferem");
      return;
    }

    setLoading(true);

    try {
      // Check if email already exists in usuarios
      const { data: existingByEmail } = await supabase
        .from("usuarios")
        .select("id")
        .eq("email", trimmedEmail)
        .limit(1);

      if (existingByEmail && existingByEmail.length > 0) {
        toast.error("Este email já está cadastrado.");
        setLoading(false);
        return;
      }

      // Generate unique codigo_loja
      const codigoLoja = await generateCodigoLoja();

      // Create tenant first
      const { data: tenant, error: tenantError } = await supabase
        .from("tenants")
        .insert({
          nome_loja: "Minha Loja",
          codigo_loja: codigoLoja,
          plano: "trial",
          plano_periodo: "mensal",
          max_usuarios: 999,
          ativo: true,
          email_contato: trimmedEmail,
        })
        .select()
        .single();

      if (tenantError || !tenant) {
        toast.error("Erro ao criar conta: " + (tenantError?.message || "Erro desconhecido"));
        setLoading(false);
        return;
      }

      // Create company_settings
      await supabase.from("company_settings").insert({
        company_name: "Minha Loja",
        company_subtitle: "Orce. Venda. Simplifique",
        tenant_id: tenant.id,
        codigo_loja: codigoLoja,
        email_loja: trimmedEmail,
      });

      // Create or find admin cargo
      let cargoId: string | undefined;
      const { data: existingCargo } = await supabase
        .from("cargos")
        .select("id")
        .eq("nome", "Administrador")
        .eq("tenant_id", tenant.id)
        .limit(1)
        .single();

      if (existingCargo) {
        cargoId = existingCargo.id;
      } else {
        const { data: newCargo } = await supabase
          .from("cargos")
          .insert({
            nome: "Administrador",
            comissao_percentual: 0,
            tenant_id: tenant.id,
            permissoes: {
              clientes: true,
              simulador: true,
              configuracoes: true,
              desconto1: true,
              desconto2: true,
              desconto3: true,
              plus: true,
            },
          })
          .select()
          .single();
        cargoId = newCargo?.id;
      }

      // Sign up with Supabase Auth — trigger will auto-create usuario
      const { error: authError } = await signUp(trimmedEmail, trimmedSenha, {
        tenant_id: tenant.id,
        nome_completo: trimmedEmail.split("@")[0],
        apelido: "Admin",
        cargo_id: cargoId,
      });

      if (authError) {
        toast.error("Erro ao criar conta: " + authError);
        setLoading(false);
        return;
      }

      toast.success("Conta criada com sucesso!");

      sessionStorage.setItem("onboarding_tenant_id", tenant.id);
      sessionStorage.setItem("onboarding_codigo_loja", codigoLoja);
      navigate("/onboarding");
    } catch {
      toast.error("Erro inesperado ao criar conta");
    }

    setLoading(false);
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <Card className="w-full max-w-sm shadow-lg border-border/50">
        <CardHeader className="text-center space-y-3 pb-2">
          <div>
            <h1 className="text-xl font-bold text-foreground">OrçaMóvel PRO</h1>
            <p className="text-sm text-muted-foreground">Orce. Venda. Simplifique</p>
          </div>
          <p className="text-sm font-medium text-foreground">Criar sua conta</p>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSignUp} className="space-y-4">
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
                  placeholder="Mínimo 6 caracteres"
                  autoComplete="new-password"
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
            <div>
              <Label htmlFor="confirmarSenha">Confirmar Senha</Label>
              <Input
                id="confirmarSenha"
                type={showPassword ? "text" : "password"}
                value={confirmarSenha}
                onChange={(e) => setConfirmarSenha(e.target.value)}
                placeholder="Repita a senha"
                autoComplete="new-password"
                className="mt-1"
              />
            </div>
            <Button type="submit" className="w-full gap-2" disabled={loading}>
              <UserPlus className="h-4 w-4" />
              {loading ? "Criando conta..." : "Criar Conta"}
            </Button>
          </form>
          <div className="mt-3 pt-3 border-t border-border">
            <Button variant="ghost" className="w-full gap-2" onClick={() => navigate("/app")}>
              <ArrowLeft className="h-4 w-4" />
              Já tenho uma conta
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

async function generateCodigoLoja(): Promise<string> {
  const { supabase } = await import("@/lib/supabaseClient");
  let attempts = 0;
  while (attempts < 10) {
    const num = Math.floor(100000 + Math.random() * 900000);
    const code = `${String(num).slice(0, 3)}.${String(num).slice(3, 6)}`;
    const { data } = await supabase
      .from("tenants")
      .select("id")
      .eq("codigo_loja", code)
      .limit(1);
    if (!data || data.length === 0) return code;
    attempts++;
  }
  const ts = Date.now().toString().slice(-6);
  return `${ts.slice(0, 3)}.${ts.slice(3, 6)}`;
}
