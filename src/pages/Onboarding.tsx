import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Check, X, Crown, Zap, Users, Building2, User, ArrowLeft, ArrowRight, Store, Mail, KeyRound, ShieldCheck } from "lucide-react";
import { supabase } from "@/lib/supabaseClient";
import { validateCpfCnpj } from "@/lib/validation";
import { toast } from "sonner";
import { useNavigate } from "react-router-dom";
import { maskCpfCnpj, maskPhone, unmask } from "@/lib/masks";
import { cn } from "@/lib/utils";
import { getUserId } from "@/lib/tenantState";

const UF_OPTIONS = [
  "AC","AL","AP","AM","BA","CE","DF","ES","GO","MA","MT","MS","MG","PA",
  "PB","PR","PE","PI","RJ","RN","RS","RO","RR","SC","SP","SE","TO"
];

interface PlanInfo {
  id: string;
  nome: string;
  descricao: string;
  preco_mensal: number;
  preco_anual_mensal: number;
  max_usuarios: number | null;
  icon: React.ElementType;
  destaque: boolean;
  features: { label: string; included: boolean }[];
}

const PLANS: PlanInfo[] = [
  {
    id: "trial",
    nome: "Teste Grátis",
    descricao: "Experimente todas as funcionalidades por 7 dias",
    preco_mensal: 0,
    preco_anual_mensal: 0,
    max_usuarios: 999,
    icon: Zap,
    destaque: false,
    features: [
      { label: "Acesso completo por 7 dias", included: true },
      { label: "Clientes ilimitados", included: true },
      { label: "Simulador de financiamento", included: true },
      { label: "Configurações avançadas", included: true },
    ],
  },
  {
    id: "basico",
    nome: "Básico",
    descricao: "Ideal para lojas pequenas com até 3 colaboradores",
    preco_mensal: 59.90,
    preco_anual_mensal: 50.92,
    max_usuarios: 3,
    icon: Users,
    destaque: false,
    features: [
      { label: "Até 3 usuários", included: true },
      { label: "Clientes ilimitados", included: true },
      { label: "Simulador de financiamento", included: true },
      { label: "Suporte por ticket", included: true },
    ],
  },
  {
    id: "premium",
    nome: "Premium",
    descricao: "Para lojas que precisam de tudo, sem limites",
    preco_mensal: 149.90,
    preco_anual_mensal: 127.42,
    max_usuarios: null,
    icon: Crown,
    destaque: true,
    features: [
      { label: "Usuários ilimitados", included: true },
      { label: "Todas as funcionalidades", included: true },
      { label: "Contratos digitais", included: true },
      { label: "Suporte prioritário", included: true },
    ],
  },
];

function formatCurrency(value: number) {
  return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

type Step = "plan" | "company";

export default function Onboarding() {
  const navigate = useNavigate();
  const [step, setStep] = useState<Step>("plan");
  const [selectedPlan, setSelectedPlan] = useState<string>("trial");
  const [annual, setAnnual] = useState(false);

  // Company form
  const [tipoPessoa, setTipoPessoa] = useState<"pj" | "pf">("pj");
  const [nomeEmpresa, setNomeEmpresa] = useState("");
  const [cnpjCpf, setCnpjCpf] = useState("");
  const [endereco, setEndereco] = useState("");
  const [bairro, setBairro] = useState("");
  const [cidade, setCidade] = useState("");
  const [uf, setUf] = useState("");
  const [cep, setCep] = useState("");
  const [telefone, setTelefone] = useState("");
  const [emailContato, setEmailContato] = useState("");
  const [loading, setLoading] = useState(false);

  const tenantId = sessionStorage.getItem("onboarding_tenant_id");
  const codigoLoja = sessionStorage.getItem("onboarding_codigo_loja");
  const storedEmail = sessionStorage.getItem("onboarding_email");
  const storedPassword = sessionStorage.getItem("onboarding_password");

  useEffect(() => {
    if (!tenantId) {
      navigate("/");
    }
  }, [tenantId, navigate]);

  // Auto-fill email from stored user
  useEffect(() => {
    const userId = getUserId();
    if (userId) {
      supabase.from("usuarios").select("email").eq("id", userId).single().then(({ data }) => {
        if (data?.email) setEmailContato(data.email);
      });
    }
  }, []);

  // CEP lookup
  const handleCepBlur = async () => {
    const digits = unmask(cep);
    if (digits.length === 8) {
      try {
        const resp = await fetch(`https://viacep.com.br/ws/${digits}/json/`);
        const data = await resp.json();
        if (!data.erro) {
          setEndereco(data.logradouro || "");
          setBairro(data.bairro || "");
          setCidade(data.localidade || "");
          setUf(data.uf || "");
        }
      } catch { /* ignore */ }
    }
  };

  const maskCep = (value: string) => {
    const digits = value.replace(/\D/g, "").slice(0, 8);
    return digits.replace(/(\d{5})(\d)/, "$1-$2");
  };

  const handleSelectPlan = async (planId: string) => {
    setSelectedPlan(planId);

    if (!tenantId) return;

    // Update tenant with selected plan
    const plan = PLANS.find(p => p.id === planId);
    if (!plan) return;

    const periodo = annual ? "anual" : "mensal";
    const now = new Date();
    const endDate = new Date(now);

    if (planId === "trial") {
      endDate.setDate(endDate.getDate() + 7);
    } else if (annual) {
      endDate.setFullYear(endDate.getFullYear() + 1);
    } else {
      endDate.setMonth(endDate.getMonth() + 1);
    }

    await supabase.from("tenants").update({
      plano: planId,
      plano_periodo: periodo,
      max_usuarios: plan.max_usuarios ?? 999,
      assinatura_inicio: planId !== "trial" ? now.toISOString() : null,
      assinatura_fim: planId !== "trial" ? endDate.toISOString() : null,
    }).eq("id", tenantId);

    setStep("company");
  };

  const handleSaveCompany = async (e: React.FormEvent) => {
    e.preventDefault();

    // Validate all required fields
    if (!nomeEmpresa.trim()) { toast.error(tipoPessoa === "pj" ? "Nome da empresa é obrigatório" : "Nome completo é obrigatório"); return; }
    if (!cnpjCpf.trim()) { toast.error(tipoPessoa === "pj" ? "CNPJ é obrigatório" : "CPF é obrigatório"); return; }
    const cpfCnpjValidation = validateCpfCnpj(cnpjCpf, tipoPessoa);
    if (!cpfCnpjValidation.valid) { toast.error(cpfCnpjValidation.message!); return; }
    if (!endereco.trim()) { toast.error("Endereço é obrigatório"); return; }
    if (!bairro.trim()) { toast.error("Bairro é obrigatório"); return; }
    if (!cidade.trim()) { toast.error("Cidade é obrigatória"); return; }
    if (!uf) { toast.error("UF é obrigatório"); return; }
    if (!cep.trim()) { toast.error("CEP é obrigatório"); return; }
    if (!telefone.trim()) { toast.error("Telefone é obrigatório"); return; }
    if (!emailContato.trim()) { toast.error("Email é obrigatório"); return; }

    setLoading(true);

    try {
      // Update company_settings
      const { error: settingsError } = await supabase
        .from("company_settings")
        .update({
          company_name: nomeEmpresa.trim(),
          cnpj_loja: cnpjCpf.trim(),
          endereco_loja: endereco.trim(),
          bairro_loja: bairro.trim(),
          cidade_loja: cidade.trim(),
          uf_loja: uf,
          cep_loja: cep.trim(),
          telefone_loja: telefone.trim(),
          email_loja: emailContato.trim(),
        })
        .eq("tenant_id", tenantId!);

      if (settingsError) {
        toast.error("Erro ao salvar dados: " + settingsError.message);
        setLoading(false);
        return;
      }

      // Update tenant nome_loja
      await supabase.from("tenants").update({
        nome_loja: nomeEmpresa.trim(),
        telefone_contato: telefone.trim(),
        email_contato: emailContato.trim(),
      }).eq("id", tenantId!);

      // Update usuario nome
      const userId = getUserId();
      if (userId) {
        await supabase.from("usuarios").update({
          nome_completo: nomeEmpresa.trim(),
          apelido: tipoPessoa === "pf" ? nomeEmpresa.trim().split(" ")[0] : "Admin",
        }).eq("id", userId);
      }

      // Clean up onboarding state
      sessionStorage.removeItem("onboarding_tenant_id");
      sessionStorage.removeItem("onboarding_codigo_loja");
      sessionStorage.removeItem("onboarding_email");
      sessionStorage.removeItem("onboarding_password");

      toast.success("Configuração concluída! Bem-vindo ao OrçaMóvel PRO!");
      navigate("/app");
    } catch {
      toast.error("Erro inesperado ao salvar dados");
    }

    setLoading(false);
  };

  if (step === "plan") {
    return (
      <div className="min-h-screen bg-background p-4 md:p-8">
        <div className="max-w-4xl mx-auto space-y-6">
          <div className="text-center space-y-2">
            <h1 className="text-2xl font-bold text-foreground">OrçaMóvel PRO</h1>
            <p className="text-muted-foreground">Escolha seu plano para começar</p>
          </div>

          {/* Credentials reminder banner */}
          {codigoLoja && (
            <Card className="border-primary/30 bg-primary/5 shadow-sm">
              <CardContent className="pt-5 pb-4">
                <div className="flex items-start gap-3 mb-3">
                  <div className="rounded-lg bg-primary/10 p-2 text-primary shrink-0">
                    <ShieldCheck className="h-5 w-5" />
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-foreground">Seus dados de acesso — guarde com atenção!</p>
                    <p className="text-xs text-muted-foreground mt-0.5">Estes dados serão exigidos em todos os acessos à sua loja.</p>
                  </div>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div className="rounded-lg border border-border bg-background p-3 space-y-1">
                    <div className="flex items-center gap-2 text-xs text-muted-foreground uppercase tracking-wider">
                      <Store className="h-3.5 w-3.5" />
                      Código da Loja
                    </div>
                    <p className="font-mono text-lg font-bold text-foreground">{codigoLoja}</p>
                  </div>
                  {storedEmail && (
                    <div className="rounded-lg border border-border bg-background p-3 space-y-1">
                      <div className="flex items-center gap-2 text-xs text-muted-foreground uppercase tracking-wider">
                        <Mail className="h-3.5 w-3.5" />
                        Login
                      </div>
                      <p className="text-sm font-semibold text-foreground truncate">{storedEmail}</p>
                    </div>
                  )}
                  {storedPassword && (
                    <div className="rounded-lg border border-border bg-background p-3 space-y-1">
                      <div className="flex items-center gap-2 text-xs text-muted-foreground uppercase tracking-wider">
                        <KeyRound className="h-3.5 w-3.5" />
                        Senha
                      </div>
                      <p className="text-sm font-semibold text-foreground font-mono">{storedPassword}</p>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Annual toggle */}
          <div className="flex items-center justify-center gap-3">
            <Label className={cn("text-sm", !annual && "font-semibold text-foreground")}>Mensal</Label>
            <Switch checked={annual} onCheckedChange={setAnnual} />
            <Label className={cn("text-sm", annual && "font-semibold text-foreground")}>Anual</Label>
            {annual && <Badge variant="secondary" className="ml-2 text-xs">Economia de 15%</Badge>}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {PLANS.map((p) => {
              const price = annual ? p.preco_anual_mensal : p.preco_mensal;
              return (
                <Card key={p.id} className={cn(
                  "relative flex flex-col transition-all duration-200",
                  p.destaque && "border-primary shadow-lg shadow-primary/10 scale-[1.02]"
                )}>
                  {p.destaque && (
                    <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                      <Badge className="bg-primary text-primary-foreground shadow-sm">Mais Popular</Badge>
                    </div>
                  )}
                  <CardHeader className="text-center pb-2">
                    <div className="mx-auto mb-2 h-12 w-12 rounded-full bg-primary/10 flex items-center justify-center">
                      <p.icon className="h-6 w-6 text-primary" />
                    </div>
                    <CardTitle className="text-lg">{p.nome}</CardTitle>
                    <CardDescription className="text-xs">{p.descricao}</CardDescription>
                  </CardHeader>
                  <CardContent className="flex-1 space-y-4">
                    <div className="text-center">
                      {p.preco_mensal === 0 ? (
                        <p className="text-3xl font-bold text-foreground">Grátis</p>
                      ) : (
                        <>
                          <p className="text-3xl font-bold text-foreground">{formatCurrency(price)}</p>
                          <p className="text-xs text-muted-foreground">/mês</p>
                        </>
                      )}
                    </div>
                    <ul className="space-y-2">
                      {p.features.map((f) => (
                        <li key={f.label} className="flex items-center gap-2 text-sm">
                          {f.included ? <Check className="h-4 w-4 text-primary shrink-0" /> : <X className="h-4 w-4 text-muted-foreground/40 shrink-0" />}
                          <span className={cn(!f.included && "text-muted-foreground/60")}>{f.label}</span>
                        </li>
                      ))}
                    </ul>
                  </CardContent>
                  <CardFooter className="pt-2">
                    <Button
                      className={cn("w-full", p.destaque && "bg-primary hover:bg-primary/90")}
                      variant={p.destaque ? "default" : "outline"}
                      onClick={() => handleSelectPlan(p.id)}
                    >
                      {p.id === "trial" ? "Começar Grátis" : `Assinar ${p.nome}`}
                    </Button>
                  </CardFooter>
                </Card>
              );
            })}
          </div>
        </div>
      </div>
    );
  }

  // Step: Company details
  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <Card className="w-full max-w-lg shadow-lg border-border/50">
        <CardHeader className="text-center space-y-2 pb-2">
          <h1 className="text-xl font-bold text-foreground">OrçaMóvel PRO</h1>
          <p className="text-sm text-muted-foreground">Configure os dados da sua loja</p>
          {codigoLoja && (
            <p className="text-xs text-muted-foreground">
              Código da loja: <span className="font-mono font-semibold text-foreground">{codigoLoja}</span>
            </p>
          )}
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSaveCompany} className="space-y-4">
            {/* PF / PJ toggle */}
            <div className="flex items-center gap-3 justify-center mb-2">
              <Button
                type="button"
                variant={tipoPessoa === "pj" ? "default" : "outline"}
                size="sm"
                className="gap-2"
                onClick={() => setTipoPessoa("pj")}
              >
                <Building2 className="h-4 w-4" /> Pessoa Jurídica
              </Button>
              <Button
                type="button"
                variant={tipoPessoa === "pf" ? "default" : "outline"}
                size="sm"
                className="gap-2"
                onClick={() => setTipoPessoa("pf")}
              >
                <User className="h-4 w-4" /> Pessoa Física
              </Button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <Label>{tipoPessoa === "pj" ? "Nome da Empresa *" : "Nome Completo *"}</Label>
                <Input
                  value={nomeEmpresa}
                  onChange={(e) => setNomeEmpresa(e.target.value)}
                  placeholder={tipoPessoa === "pj" ? "Razão Social" : "Seu nome completo"}
                  className="mt-1"
                />
              </div>
              <div>
                <Label>{tipoPessoa === "pj" ? "CNPJ *" : "CPF *"}</Label>
                <Input
                  value={cnpjCpf}
                  onChange={(e) => setCnpjCpf(maskCpfCnpj(e.target.value))}
                  placeholder={tipoPessoa === "pj" ? "00.000.000/0000-00" : "000.000.000-00"}
                  maxLength={tipoPessoa === "pj" ? 18 : 14}
                  className="mt-1"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <Label>CEP *</Label>
                <Input
                  value={cep}
                  onChange={(e) => setCep(maskCep(e.target.value))}
                  onBlur={handleCepBlur}
                  placeholder="00000-000"
                  maxLength={9}
                  className="mt-1"
                />
              </div>
              <div className="md:col-span-2">
                <Label>Endereço *</Label>
                <Input
                  value={endereco}
                  onChange={(e) => setEndereco(e.target.value)}
                  placeholder="Rua, número"
                  className="mt-1"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <Label>Bairro *</Label>
                <Input
                  value={bairro}
                  onChange={(e) => setBairro(e.target.value)}
                  placeholder="Bairro"
                  className="mt-1"
                />
              </div>
              <div>
                <Label>Cidade *</Label>
                <Input
                  value={cidade}
                  onChange={(e) => setCidade(e.target.value)}
                  placeholder="Cidade"
                  className="mt-1"
                />
              </div>
              <div>
                <Label>UF *</Label>
                <Select value={uf} onValueChange={setUf}>
                  <SelectTrigger className="mt-1">
                    <SelectValue placeholder="UF" />
                  </SelectTrigger>
                  <SelectContent>
                    {UF_OPTIONS.map((u) => (
                      <SelectItem key={u} value={u}>{u}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <Label>Telefone *</Label>
                <Input
                  value={telefone}
                  onChange={(e) => setTelefone(maskPhone(e.target.value))}
                  placeholder="(00) 00000-0000"
                  maxLength={15}
                  className="mt-1"
                />
              </div>
              <div>
                <Label>Email *</Label>
                <Input
                  type="email"
                  value={emailContato}
                  onChange={(e) => setEmailContato(e.target.value)}
                  placeholder="contato@empresa.com"
                  className="mt-1"
                />
              </div>
            </div>

            <div className="flex gap-3 pt-2">
              <Button type="button" variant="outline" onClick={() => setStep("plan")} className="gap-2">
                <ArrowLeft className="h-4 w-4" /> Voltar
              </Button>
              <Button type="submit" className="flex-1 gap-2" disabled={loading}>
                <ArrowRight className="h-4 w-4" />
                {loading ? "Salvando..." : "Concluir e Acessar"}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
