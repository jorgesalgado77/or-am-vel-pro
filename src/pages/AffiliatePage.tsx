import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { supabase } from "@/lib/supabaseClient";
import { toast } from "sonner";
import { maskPhone, maskCpfCnpj } from "@/lib/masks";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import {
  Gift, Link2, Copy, CheckCircle2, Users, TrendingUp, DollarSign,
  Share2, ArrowLeft, Loader2, MessageCircle, Eye, EyeOff, LogIn
} from "lucide-react";
import { useNavigate, useSearchParams, useParams } from "react-router-dom";

function generateAffiliateCode(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "";
  for (let i = 0; i < 6; i++) code += chars[Math.floor(Math.random() * chars.length)];
  return code;
}

interface AffiliateData {
  id: string;
  name: string;
  email: string;
  whatsapp: string;
  cpf: string;
  pix_key: string;
  affiliate_code: string;
  status: string;
  created_at: string;
}

interface AffiliateClick {
  id: string;
  created_at: string;
}

interface AffiliateConversion {
  id: string;
  plan: string;
  amount: number;
  commission_amount: number;
  status: string;
  created_at: string;
}

type ViewState = "form" | "result" | "dashboard";

export default function AffiliatePage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { code: refCode } = useParams<{ code?: string }>();
  const [view, setView] = useState<ViewState>("form");
  const [loading, setLoading] = useState(false);
  const [affiliate, setAffiliate] = useState<AffiliateData | null>(null);
  const [clicks, setClicks] = useState<AffiliateClick[]>([]);
  const [conversions, setConversions] = useState<AffiliateConversion[]>([]);
  const [copied, setCopied] = useState(false);

  // Form state
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [whatsapp, setWhatsapp] = useState("");
  const [cpf, setCpf] = useState("");
  const [pixKey, setPixKey] = useState("");

  // Login state
  const [loginEmail, setLoginEmail] = useState("");
  const [loginCpf, setLoginCpf] = useState("");
  const [loginCode, setLoginCode] = useState("");
  const [loginMode, setLoginMode] = useState<"code" | "email">("code");
  const [showLogin, setShowLogin] = useState(false);

  // Handle /ref/:code — track click and redirect to landing
  useEffect(() => {
    if (refCode) {
      trackClickAndRedirect(refCode);
    }
    const qCode = searchParams.get("code");
    if (qCode) {
      loadAffiliateByCode(qCode);
    }
  }, [refCode, searchParams]);

  async function trackClickAndRedirect(code: string) {
    // Save to localStorage for 30 days
    localStorage.setItem("affiliate_code", code.toUpperCase());
    localStorage.setItem("affiliate_code_expires", String(Date.now() + 30 * 24 * 60 * 60 * 1000));

    // Register click in DB (best effort)
    try {
      await supabase.from("affiliate_clicks" as any).insert({
        affiliate_code: code.toUpperCase(),
        user_agent: navigator.userAgent,
      } as any);
    } catch { /* best effort */ }

    // Redirect to landing page
    navigate("/", { replace: true });
  }

  async function loadAffiliateByCode(code: string) {
    setLoading(true);
    const { data } = await supabase
      .from("affiliates" as any)
      .select("*")
      .eq("affiliate_code", code.toUpperCase())
      .limit(1);

    if (data && data.length > 0) {
      const a = data[0] as any;
      setAffiliate({
        id: a.id, name: a.name, email: a.email, whatsapp: a.whatsapp,
        cpf: a.cpf, pix_key: a.pix_key, affiliate_code: a.affiliate_code,
        status: a.status, created_at: a.created_at,
      });
      await loadAffiliateStats(a.affiliate_code, a.id);
      setView("dashboard");
    } else {
      toast.error("Código de afiliado não encontrado.");
    }
    setLoading(false);
  }

  async function loadAffiliateStats(code: string, affiliateId: string) {
    const [clicksRes, convsRes] = await Promise.all([
      supabase.from("affiliate_clicks" as any).select("id, created_at").eq("affiliate_code", code).order("created_at", { ascending: false }),
      supabase.from("affiliate_conversions" as any).select("*").eq("affiliate_id", affiliateId).order("created_at", { ascending: false }),
    ]);
    if (clicksRes.data) setClicks(clicksRes.data as any);
    if (convsRes.data) setConversions(convsRes.data as any);
  }

  async function handleLoginByCode() {
    if (!loginCode.trim()) {
      toast.error("Informe seu código de afiliado.");
      return;
    }
    setLoading(true);
    await loadAffiliateByCode(loginCode.trim().toUpperCase());
    setLoading(false);
  }

  async function handleLogin() {
    if (loginMode === "code") {
      return handleLoginByCode();
    }
    if (!loginEmail.trim() || !loginCpf.trim()) {
      toast.error("Preencha email e CPF para acessar.");
      return;
    }
    setLoading(true);
    const cleanCpf = loginCpf.replace(/\D/g, "");
    const { data } = await supabase
      .from("affiliates" as any)
      .select("*")
      .eq("email", loginEmail.trim().toLowerCase())
      .eq("cpf", cleanCpf)
      .limit(1);

    if (data && data.length > 0) {
      const a = data[0] as any;
      setAffiliate({
        id: a.id, name: a.name, email: a.email, whatsapp: a.whatsapp,
        cpf: a.cpf, pix_key: a.pix_key, affiliate_code: a.affiliate_code,
        status: a.status, created_at: a.created_at,
      });
      await loadAffiliateStats(a.affiliate_code, a.id);
      setView("dashboard");
    } else {
      toast.error("Afiliado não encontrado. Verifique os dados.");
    }
    setLoading(false);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim() || !email.trim() || !whatsapp.trim() || !cpf.trim() || !pixKey.trim()) {
      toast.error("Preencha todos os campos.");
      return;
    }

    const cleanCpf = cpf.replace(/\D/g, "");
    if (cleanCpf.length !== 11) {
      toast.error("CPF inválido.");
      return;
    }

    setLoading(true);

    // Check duplicates
    const { data: existing } = await supabase
      .from("affiliates" as any)
      .select("id, email, cpf")
      .or(`email.eq.${email.trim().toLowerCase()},cpf.eq.${cleanCpf}`)
      .limit(1);

    if (existing && existing.length > 0) {
      toast.error("Já existe um afiliado com este email ou CPF.");
      setLoading(false);
      return;
    }

    const code = generateAffiliateCode();
    const { data, error } = await supabase
      .from("affiliates" as any)
      .insert({
        name: name.trim(),
        email: email.trim().toLowerCase(),
        whatsapp: whatsapp.replace(/\D/g, ""),
        cpf: cleanCpf,
        pix_key: pixKey.trim(),
        affiliate_code: code,
        status: "active",
      } as any)
      .select()
      .single();

    if (error) {
      console.error("Affiliate insert error:", error);
      toast.error("Erro ao criar conta de afiliado.");
      setLoading(false);
      return;
    }

    const a = data as any;
    setAffiliate({
      id: a.id, name: a.name, email: a.email, whatsapp: a.whatsapp,
      cpf: a.cpf, pix_key: a.pix_key, affiliate_code: a.affiliate_code,
      status: a.status, created_at: a.created_at,
    });
    setView("result");
    toast.success("Conta de afiliado criada com sucesso!");
    setLoading(false);
  }

  function getAffiliateLink() {
    if (!affiliate) return "";
    return `${window.location.origin}/ref/${affiliate.affiliate_code}`;
  }

  function getWhatsAppMessage() {
    return encodeURIComponent(
      `🚀 Conheça o OrçaMóvel PRO - o sistema completo para lojas de móveis planejados!\n\n` +
      `✅ Orçamentos rápidos\n✅ Gestão de clientes\n✅ Kanban de vendas\n✅ Relatórios inteligentes\n\n` +
      `Teste grátis por 7 dias:\n${getAffiliateLink()}`
    );
  }

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(getAffiliateLink());
      setCopied(true);
      toast.success("Link copiado!");
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error("Erro ao copiar.");
    }
  }

  const totalCommission = conversions
    .filter(c => c.status === "approved" || c.status === "paid")
    .reduce((sum, c) => sum + (c.commission_amount || 0), 0);

  const pendingCommission = conversions
    .filter(c => c.status === "pending")
    .reduce((sum, c) => sum + (c.commission_amount || 0), 0);

  const STATUS_MAP: Record<string, { label: string; class: string }> = {
    pending: { label: "Pendente", class: "bg-amber-100 text-amber-800" },
    approved: { label: "Aprovada", class: "bg-blue-100 text-blue-800" },
    paid: { label: "Paga", class: "bg-green-100 text-green-800" },
    rejected: { label: "Rejeitada", class: "bg-red-100 text-red-800" },
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-blue-950 to-slate-900">
      {/* Header */}
      <header className="border-b border-white/10 bg-black/20">
        <div className="max-w-5xl mx-auto px-3 sm:px-4 py-3 sm:py-4 flex items-center justify-between">
          <div className="flex items-center gap-2 sm:gap-3">
            <button onClick={() => navigate("/")} className="text-white/60 hover:text-white transition p-1">
              <ArrowLeft className="w-5 h-5" />
            </button>
            <div className="flex items-center gap-2">
              <Gift className="w-5 h-5 sm:w-6 sm:h-6 text-emerald-400" />
              <span className="text-lg sm:text-xl font-bold text-white">Divulgue e Ganhe</span>
            </div>
          </div>
          {view === "form" && (
            <Button
              onClick={() => setShowLogin(!showLogin)}
              className={showLogin
                ? "bg-white/10 hover:bg-white/20 text-white border border-white/20 text-xs sm:text-sm px-3 sm:px-4"
                : "bg-emerald-500 hover:bg-emerald-600 text-white font-semibold shadow-lg shadow-emerald-500/30 text-xs sm:text-sm px-3 sm:px-5 py-2 sm:py-2.5 animate-pulse"
              }
              size="sm"
            >
              {showLogin ? (
                <>Cadastrar</>
              ) : (
                <><LogIn className="w-4 h-4 mr-1.5" /> Já sou afiliado</>
              )}
            </Button>
          )}
          {(view === "result" || view === "dashboard") && (
            <Button variant="ghost" size="sm" className="text-white/70 hover:text-white text-xs sm:text-sm" onClick={() => { setView("form"); setAffiliate(null); }}>
              Novo cadastro
            </Button>
          )}
        </div>
      </header>

      <div className="max-w-5xl mx-auto px-3 sm:px-4 py-4 sm:py-8">
        {/* FORM / LOGIN */}
        {view === "form" && (
          <div className="animate-fadeIn">
            {!showLogin ? (
              <div className="max-w-lg mx-auto">
                <div className="text-center mb-5 sm:mb-8">
                  <h1 className="text-2xl sm:text-3xl font-bold text-white mb-2">Seja um Afiliado</h1>
                  <p className="text-sm sm:text-base text-white/60">Divulgue o OrçaMóvel PRO e ganhe <span className="text-emerald-400 font-semibold">5% de comissão</span> sobre cada nova assinatura!</p>
                </div>

                {/* Highlighted access button for mobile */}
                <div className="mb-5 sm:hidden">
                  <Button
                    onClick={() => setShowLogin(true)}
                    className="w-full bg-emerald-500 hover:bg-emerald-600 text-white font-semibold shadow-lg shadow-emerald-500/30 py-3 text-base"
                  >
                    <LogIn className="w-5 h-5 mr-2" /> Já sou afiliado? Acesse aqui
                  </Button>
                </div>

                <Card className="border-white/10 bg-white/5">
                  <CardContent className="pt-5 sm:pt-6">
                    <form onSubmit={handleSubmit} className="space-y-3 sm:space-y-4">
                      <div>
                        <Label className="text-white/80 text-sm">Nome Completo *</Label>
                        <Input value={name} onChange={e => setName(e.target.value)} placeholder="Seu nome" className="bg-white/10 border-white/20 text-white placeholder:text-white/40" />
                      </div>
                      <div>
                        <Label className="text-white/80 text-sm">Email *</Label>
                        <Input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="seu@email.com" className="bg-white/10 border-white/20 text-white placeholder:text-white/40" />
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div>
                          <Label className="text-white/80 text-sm">WhatsApp *</Label>
                          <Input value={whatsapp} onChange={e => setWhatsapp(maskPhone(e.target.value))} placeholder="(00) 00000-0000" className="bg-white/10 border-white/20 text-white placeholder:text-white/40" />
                        </div>
                        <div>
                          <Label className="text-white/80 text-sm">CPF *</Label>
                          <Input value={cpf} onChange={e => setCpf(maskCpfCnpj(e.target.value))} placeholder="000.000.000-00" className="bg-white/10 border-white/20 text-white placeholder:text-white/40" />
                        </div>
                      </div>
                      <div>
                        <Label className="text-white/80 text-sm">Chave PIX *</Label>
                        <Input value={pixKey} onChange={e => setPixKey(e.target.value)} placeholder="CPF, email, telefone ou chave aleatória" className="bg-white/10 border-white/20 text-white placeholder:text-white/40" />
                      </div>
                      <Button type="submit" disabled={loading} className="w-full bg-emerald-600 hover:bg-emerald-700 text-white py-2.5">
                        {loading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Gift className="w-4 h-4 mr-2" />}
                        Criar minha conta de afiliado
                      </Button>
                    </form>
                  </CardContent>
                </Card>
              </div>
            ) : (
              <div className="max-w-md mx-auto animate-fadeIn">
                <div className="text-center mb-5 sm:mb-8">
                  <h1 className="text-2xl sm:text-3xl font-bold text-white mb-2">Acessar Painel</h1>
                  <p className="text-sm sm:text-base text-white/60">Informe seu código de afiliado ou email e CPF.</p>
                </div>
                <Card className="border-white/10 bg-white/5">
                  <CardContent className="pt-5 sm:pt-6 space-y-4">
                    {/* Toggle between code and email login */}
                    <div className="flex rounded-lg overflow-hidden border border-white/20">
                      <button
                        onClick={() => setLoginMode("code")}
                        className={`flex-1 py-2.5 text-xs sm:text-sm font-medium transition-colors ${loginMode === "code" ? "bg-emerald-600 text-white" : "bg-white/5 text-white/60 active:bg-white/10"}`}
                      >
                        Código de Afiliado
                      </button>
                      <button
                        onClick={() => setLoginMode("email")}
                        className={`flex-1 py-2.5 text-xs sm:text-sm font-medium transition-colors ${loginMode === "email" ? "bg-emerald-600 text-white" : "bg-white/5 text-white/60 active:bg-white/10"}`}
                      >
                        Email + CPF
                      </button>
                    </div>

                    {loginMode === "code" ? (
                      <div>
                        <Label className="text-white/80 text-sm">Código de Afiliado</Label>
                        <Input
                          value={loginCode}
                          onChange={e => setLoginCode(e.target.value.toUpperCase())}
                          placeholder="Ex: ABC123"
                          maxLength={10}
                          className="bg-white/10 border-white/20 text-white placeholder:text-white/40 font-mono text-lg tracking-widest text-center"
                        />
                      </div>
                    ) : (
                      <>
                        <div>
                          <Label className="text-white/80 text-sm">Email</Label>
                          <Input type="email" value={loginEmail} onChange={e => setLoginEmail(e.target.value)} placeholder="seu@email.com" className="bg-white/10 border-white/20 text-white placeholder:text-white/40" />
                        </div>
                        <div>
                          <Label className="text-white/80 text-sm">CPF</Label>
                          <Input value={loginCpf} onChange={e => setLoginCpf(maskCpfCnpj(e.target.value))} placeholder="000.000.000-00" className="bg-white/10 border-white/20 text-white placeholder:text-white/40" />
                        </div>
                      </>
                    )}

                    <Button onClick={handleLogin} disabled={loading} className="w-full bg-emerald-600 hover:bg-emerald-700 text-white py-2.5">
                      {loading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <LogIn className="w-4 h-4 mr-2" />}
                      Acessar meu painel
                    </Button>
                  </CardContent>
                </Card>
              </div>
            )}
          </div>
        )}

        {/* RESULT */}
        {view === "result" && affiliate && (
          <div className="max-w-lg mx-auto animate-fadeIn">
            <div className="text-center mb-5 sm:mb-8">
              <CheckCircle2 className="w-12 h-12 sm:w-16 sm:h-16 text-emerald-400 mx-auto mb-3 sm:mb-4" />
              <h1 className="text-2xl sm:text-3xl font-bold text-white mb-2">Parabéns, {affiliate.name.split(" ")[0]}!</h1>
              <p className="text-sm sm:text-base text-white/60">Sua conta de afiliado foi criada. Compartilhe seu link exclusivo:</p>
            </div>

            <Card className="border-white/10 bg-white/5">
              <CardContent className="pt-5 sm:pt-6 space-y-4">
                <div>
                  <Label className="text-white/60 text-xs">Seu código de afiliado</Label>
                  <div className="text-xl sm:text-2xl font-mono font-bold text-emerald-400 tracking-widest">{affiliate.affiliate_code}</div>
                </div>

                <div>
                  <Label className="text-white/60 text-xs">Seu link exclusivo</Label>
                  <div className="flex gap-2">
                    <Input readOnly value={getAffiliateLink()} className="bg-white/10 border-white/20 text-white font-mono text-xs sm:text-sm" />
                    <Button onClick={copyLink} variant="outline" className="border-emerald-500/50 text-emerald-400 hover:bg-emerald-500/10 shrink-0">
                      {copied ? <CheckCircle2 className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                    </Button>
                  </div>
                </div>

                <Separator className="bg-white/10" />

                <div className="grid grid-cols-2 gap-3">
                  <Button onClick={copyLink} className="bg-emerald-600 hover:bg-emerald-700 text-white text-sm">
                    <Copy className="w-4 h-4 mr-1.5" /> Copiar
                  </Button>
                  <Button asChild className="bg-green-600 hover:bg-green-700 text-white text-sm">
                    <a href={`https://wa.me/?text=${getWhatsAppMessage()}`} target="_blank" rel="noopener noreferrer">
                      <MessageCircle className="w-4 h-4 mr-1.5" /> WhatsApp
                    </a>
                  </Button>
                </div>

                <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-lg p-3">
                  <p className="text-emerald-300 text-xs sm:text-sm">
                    💡 Cada pessoa que assinar pelo seu link te dará <strong>5% de comissão</strong>!
                  </p>
                </div>

                <Button onClick={() => { loadAffiliateStats(affiliate.affiliate_code, affiliate.id); setView("dashboard"); }} variant="outline" className="w-full border-white/20 text-white/80 hover:bg-white/5">
                  <TrendingUp className="w-4 h-4 mr-2" /> Ver meu painel
                </Button>
              </CardContent>
            </Card>
          </div>
        )}

        {/* DASHBOARD */}
        {view === "dashboard" && affiliate && (
          <div className="animate-fadeIn">
            <div className="mb-4 sm:mb-6">
              <h1 className="text-xl sm:text-2xl font-bold text-white">Olá, {affiliate.name.split(" ")[0]}!</h1>
              <p className="text-sm text-white/60">Código: <span className="font-mono text-emerald-400">{affiliate.affiliate_code}</span></p>
            </div>

            {/* Link sharing */}
            <Card className="border-white/10 bg-white/5 mb-4 sm:mb-6">
              <CardContent className="pt-3 sm:pt-4 pb-3">
                <div className="flex flex-col sm:flex-row gap-2 sm:gap-3">
                  <Input readOnly value={getAffiliateLink()} className="bg-white/10 border-white/20 text-white font-mono text-xs sm:text-sm flex-1" />
                  <div className="flex gap-2">
                    <Button onClick={copyLink} size="sm" className="bg-emerald-600 hover:bg-emerald-700 flex-1 sm:flex-none">
                      {copied ? <CheckCircle2 className="w-4 h-4" /> : <><Copy className="w-4 h-4 mr-1" /> <span className="sm:hidden">Copiar</span></>}
                    </Button>
                    <Button asChild size="sm" className="bg-green-600 hover:bg-green-700 flex-1 sm:flex-none">
                      <a href={`https://wa.me/?text=${getWhatsAppMessage()}`} target="_blank" rel="noopener noreferrer">
                        <MessageCircle className="w-4 h-4 mr-1" /> <span className="sm:hidden">WhatsApp</span>
                      </a>
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* KPIs */}
            <div className="grid grid-cols-2 gap-3 sm:gap-4 mb-4 sm:mb-6">
              {[
                { label: "Cliques", value: clicks.length, icon: Eye, color: "text-blue-400" },
                { label: "Conversões", value: conversions.length, icon: Users, color: "text-purple-400" },
                { label: "Aprovada", value: `R$ ${totalCommission.toFixed(2)}`, icon: DollarSign, color: "text-emerald-400" },
                { label: "Pendente", value: `R$ ${pendingCommission.toFixed(2)}`, icon: TrendingUp, color: "text-amber-400" },
              ].map((kpi) => (
                <Card key={kpi.label} className="border-white/10 bg-white/5">
                  <CardContent className="pt-3 pb-2 sm:pt-4 sm:pb-3 px-3 sm:px-6">
                    <kpi.icon className={`w-4 h-4 sm:w-5 sm:h-5 ${kpi.color} mb-1`} />
                    <p className="text-lg sm:text-2xl font-bold text-white truncate">{kpi.value}</p>
                    <p className="text-[10px] sm:text-xs text-white/50">{kpi.label}</p>
                  </CardContent>
                </Card>
              ))}
            </div>

            {/* Conversions - cards on mobile, table on desktop */}
            {conversions.length > 0 && (
              <Card className="border-white/10 bg-white/5">
                <CardHeader className="pb-2 px-3 sm:px-6">
                  <CardTitle className="text-white text-base sm:text-lg">Minhas Conversões</CardTitle>
                </CardHeader>
                <CardContent className="px-3 sm:px-6">
                  {/* Mobile: cards */}
                  <div className="sm:hidden space-y-2">
                    {conversions.map((c) => (
                      <div key={c.id} className="bg-white/5 rounded-lg p-3 border border-white/10">
                        <div className="flex justify-between items-start mb-1">
                          <span className="text-white/80 text-xs">{format(new Date(c.created_at), "dd/MM/yyyy")}</span>
                          <Badge className={STATUS_MAP[c.status]?.class || "bg-gray-100 text-gray-800"} >{STATUS_MAP[c.status]?.label || c.status}</Badge>
                        </div>
                        <p className="text-white text-sm font-medium">{c.plan}</p>
                        <div className="flex justify-between mt-1">
                          <span className="text-white/50 text-xs">Valor: R$ {(c.amount || 0).toFixed(2)}</span>
                          <span className="text-emerald-400 font-semibold text-xs">Comissão: R$ {(c.commission_amount || 0).toFixed(2)}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                  {/* Desktop: table */}
                  <div className="hidden sm:block">
                    <Table>
                      <TableHeader>
                        <TableRow className="border-white/10">
                          <TableHead className="text-white/60">Data</TableHead>
                          <TableHead className="text-white/60">Plano</TableHead>
                          <TableHead className="text-white/60">Valor</TableHead>
                          <TableHead className="text-white/60">Comissão</TableHead>
                          <TableHead className="text-white/60">Status</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {conversions.map((c) => (
                          <TableRow key={c.id} className="border-white/10">
                            <TableCell className="text-white/80 text-sm">{format(new Date(c.created_at), "dd/MM/yyyy", { locale: ptBR })}</TableCell>
                            <TableCell className="text-white/80 text-sm">{c.plan}</TableCell>
                            <TableCell className="text-white/80 text-sm">R$ {(c.amount || 0).toFixed(2)}</TableCell>
                            <TableCell className="text-emerald-400 font-semibold text-sm">R$ {(c.commission_amount || 0).toFixed(2)}</TableCell>
                            <TableCell>
                              <Badge className={STATUS_MAP[c.status]?.class || "bg-gray-100 text-gray-800"}>{STATUS_MAP[c.status]?.label || c.status}</Badge>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                </CardContent>
              </Card>
            )}

            {conversions.length === 0 && (
              <Card className="border-white/10 bg-white/5">
                <CardContent className="py-8 sm:py-12 text-center">
                  <Share2 className="w-10 h-10 sm:w-12 sm:h-12 text-white/20 mx-auto mb-3" />
                  <p className="text-white/40 text-sm">Nenhuma conversão ainda. Compartilhe seu link para começar a ganhar!</p>
                </CardContent>
              </Card>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
