import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { LogIn, Eye, EyeOff } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useCompanySettings } from "@/hooks/useCompanySettings";
import { maskCodigoLoja } from "@/lib/masks";

interface LoginProps {
  onLogin: (userId: string, primeiroLogin: boolean) => void;
}

export default function Login({ onLogin }: LoginProps) {
  const { settings } = useCompanySettings();
  const [codigoLoja, setCodigoLoja] = useState("");
  const [nomeUsuario, setNomeUsuario] = useState("");
  const [senha, setSenha] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!nomeUsuario.trim() || !senha.trim()) {
      toast.error("Preencha todos os campos");
      return;
    }

    setLoading(true);

    // Verify store code
    const { data: companyData } = await supabase
      .from("company_settings")
      .select("codigo_loja")
      .limit(1)
      .single();

    const storedCode = (companyData as any)?.codigo_loja;
    if (storedCode && storedCode.trim() !== "" && storedCode !== codigoLoja.trim()) {
      toast.error("Código da loja inválido");
      setLoading(false);
      return;
    }

    // Find user by name or apelido
    const { data: users } = await supabase
      .from("usuarios")
      .select("id, nome_completo, apelido, ativo, senha, primeiro_login")
      .eq("ativo", true);

    const user = (users as any[])?.find(
      (u) =>
        u.apelido?.toLowerCase() === nomeUsuario.trim().toLowerCase() ||
        u.nome_completo.toLowerCase() === nomeUsuario.trim().toLowerCase()
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

    if (user.senha !== senha) {
      toast.error("Senha incorreta");
      setLoading(false);
      return;
    }

    setLoading(false);
    toast.success(`Bem-vindo, ${user.apelido || user.nome_completo}!`);
    onLogin(user.id, user.primeiro_login ?? true);
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
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
            <h1 className="text-xl font-bold text-foreground">{settings.company_name}</h1>
            {settings.company_subtitle && (
              <p className="text-sm text-muted-foreground">{settings.company_subtitle}</p>
            )}
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
                placeholder="Nome ou apelido"
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
        </CardContent>
      </Card>
    </div>
  );
}
