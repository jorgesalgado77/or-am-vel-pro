import { useState, useEffect } from "react";
import { useParams, useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { motion } from "framer-motion";
import { CheckCircle2, Phone, Mail, User, ArrowRight, Loader2, Star, Shield, Palette, Paperclip, FileText } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { maskPhone, unmask } from "@/lib/masks";
import { toast } from "sonner";

interface TenantData {
  id: string;
  nome_loja: string;
  logo_url: string | null;
  primary_color: string;
  subtitle: string;
  telefone_loja: string | null;
  whatsapp_loja: string | null;
  headline: string;
  sub_headline: string;
  cta_text: string;
  benefits: string[];
}

const DEFAULT_BENEFITS = [
  "Projeto 3D gratuito e sem compromisso",
  "Atendimento personalizado por especialista",
  "Orçamento detalhado em até 24h",
  "Melhores condições de pagamento",
];

export default function TenantLanding() {
  const { codigo } = useParams<{ codigo: string }>();
  const [searchParams] = useSearchParams();
  const refCode = searchParams.get("ref") || "";
  const [tenant, setTenant] = useState<TenantData | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  // Form state
  const [nome, setNome] = useState("");
  const [telefone, setTelefone] = useState("");
  const [email, setEmail] = useState("");
  const [descricao, setDescricao] = useState("");
  const [arquivos, setArquivos] = useState<File[]>([]);
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);

  useEffect(() => {
    if (!codigo) return;
    (async () => {
      try {
        // Resolve tenant by code using RPC (bypasses RLS)
        const { data: info } = await (supabase as any).rpc("resolve_tenant_landing", { p_code: codigo });
        if (info) {
          setTenant(info);
        } else {
          setNotFound(true);
        }
      } catch {
        setNotFound(true);
      } finally {
        setLoading(false);
      }
    })();
  }, [codigo]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!nome.trim() || !telefone.trim()) {
      toast.error("Preencha nome e telefone");
      return;
    }
    const cleanPhone = unmask(telefone);
    if (cleanPhone.length < 10) {
      toast.error("Telefone inválido");
      return;
    }

    setSending(true);
    try {
      const res = await supabase.functions.invoke("lead-capture", {
        body: {
          nome: nome.trim(),
          telefone: cleanPhone,
          email: email.trim() || undefined,
          interesse: "Projeto 3D gratuito",
          origem: refCode ? "indicacao" : "funil_loja",
          referral_code: refCode || undefined,
          tenant_id: tenant?.id,
        },
      });

      if (res.error) throw res.error;
      setSent(true);
      toast.success("Cadastro realizado com sucesso!");
    } catch {
      toast.error("Erro ao enviar. Tente novamente.");
    } finally {
      setSending(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-[100dvh] flex items-center justify-center bg-background">
        <div className="h-8 w-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (notFound || !tenant) {
    return (
      <div className="min-h-[100dvh] flex items-center justify-center bg-background">
        <div className="text-center space-y-4 p-8">
          <h1 className="text-2xl font-bold text-foreground">Loja não encontrada</h1>
          <p className="text-muted-foreground">O código informado não corresponde a nenhuma loja cadastrada.</p>
        </div>
      </div>
    );
  }

  const color = tenant.primary_color || "hsl(199,89%,48%)";
  const benefits = tenant.benefits?.length ? tenant.benefits : DEFAULT_BENEFITS;

  if (sent) {
    return (
      <div className="min-h-[100dvh] flex items-center justify-center" style={{ background: `linear-gradient(135deg, ${color}15, ${color}05)` }}>
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          className="max-w-md w-full mx-4 bg-white rounded-2xl shadow-xl p-8 text-center space-y-5"
        >
          <div className="mx-auto w-16 h-16 rounded-full flex items-center justify-center" style={{ backgroundColor: `${color}20` }}>
            <CheckCircle2 className="h-8 w-8" style={{ color }} />
          </div>
          <h2 className="text-2xl font-bold text-gray-900">Recebemos seu cadastro!</h2>
          <p className="text-gray-600">
            A equipe da <strong>{tenant.nome_loja}</strong> entrará em contato em breve para agendar seu projeto 3D gratuito.
          </p>
          {tenant.whatsapp_loja && (
            <a
              href={`https://wa.me/55${unmask(tenant.whatsapp_loja)}`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 px-6 py-3 rounded-xl text-white font-medium shadow-lg transition-transform active:scale-[0.97]"
              style={{ backgroundColor: "#25D366" }}
            >
              <Phone className="h-4 w-4" />
              Falar no WhatsApp
            </a>
          )}
        </motion.div>
      </div>
    );
  }

  return (
    <div className="min-h-[100dvh]" style={{ background: `linear-gradient(180deg, ${color}08 0%, white 40%)` }}>
      {/* Header */}
      <header className="py-6 px-4 sm:px-6">
        <div className="flex flex-col items-center gap-3">
          {tenant.logo_url && (
            <motion.img
              src={tenant.logo_url}
              alt={tenant.nome_loja}
              className="h-16 sm:h-20 w-auto object-contain drop-shadow-lg"
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.5 }}
            />
          )}
          <motion.h1
            className="text-2xl sm:text-3xl font-extrabold text-gray-900 tracking-tight"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2, duration: 0.5 }}
          >
            {tenant.nome_loja}
          </motion.h1>
          <motion.p
            className="text-sm sm:text-base font-semibold tracking-wide uppercase"
            style={{ color }}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.4, duration: 0.5 }}
          >
            Somos especialistas em Móveis Planejados
          </motion.p>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 sm:px-6 py-8 sm:py-16">
        <div className="grid lg:grid-cols-2 gap-10 lg:gap-16 items-center">
          {/* Left: Copy */}
          <motion.div
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.6 }}
            className="space-y-6"
          >
            <div className="space-y-4">
              <h1 className="text-3xl sm:text-4xl lg:text-5xl font-extrabold text-gray-900 leading-[1.1] tracking-tight">
                {tenant.headline || "Ganhe seu Projeto 3D Gratuito"}
              </h1>
              <p className="text-lg text-gray-600 leading-relaxed max-w-lg">
                {tenant.sub_headline || `A ${tenant.nome_loja} cria o projeto ideal para sua casa. Preencha o formulário e receba um projeto 3D exclusivo sem custo.`}
              </p>
            </div>

            <div className="space-y-3">
              {benefits.map((b, i) => (
                <motion.div
                  key={i}
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: 0.2 + i * 0.1, duration: 0.4 }}
                  className="flex items-start gap-3"
                >
                  <div className="mt-0.5 h-5 w-5 rounded-full flex items-center justify-center shrink-0" style={{ backgroundColor: `${color}20` }}>
                    <CheckCircle2 className="h-3.5 w-3.5" style={{ color }} />
                  </div>
                  <span className="text-gray-700">{b}</span>
                </motion.div>
              ))}
            </div>

            {/* Social proof */}
            <div className="flex items-center gap-4 pt-2">
              <div className="flex -space-x-2">
                {[1, 2, 3, 4].map((i) => (
                  <div key={i} className="w-8 h-8 rounded-full border-2 border-white bg-gray-200 flex items-center justify-center text-[10px] font-bold text-gray-500">
                    {String.fromCharCode(64 + i)}
                  </div>
                ))}
              </div>
              <div className="text-sm text-gray-500">
                <span className="font-semibold text-gray-700">+200 clientes</span> já aprovaram
              </div>
            </div>
          </motion.div>

          {/* Right: Form */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.15 }}
          >
            <div className="bg-white rounded-2xl shadow-xl border border-gray-100 p-6 sm:p-8 space-y-5">
              <div className="text-center space-y-1">
                <h2 className="text-xl font-bold text-gray-900">
                  {tenant.cta_text || "Solicite seu Projeto 3D Grátis"}
                </h2>
                <p className="text-sm text-gray-500">Sem compromisso. Retornamos em até 24h.</p>
              </div>

              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="space-y-1.5">
                  <Label htmlFor="lead-nome" className="text-sm font-medium text-gray-700">
                    Seu Nome
                  </Label>
                  <div className="relative">
                    <User className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                    <Input
                      id="lead-nome"
                      value={nome}
                      onChange={(e) => setNome(e.target.value)}
                      placeholder="Como podemos te chamar?"
                      className="pl-10 h-12 rounded-xl border-gray-200 focus:border-primary"
                      required
                    />
                  </div>
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="lead-telefone" className="text-sm font-medium text-gray-700">
                    WhatsApp
                  </Label>
                  <div className="relative">
                    <Phone className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                    <Input
                      id="lead-telefone"
                      type="tel"
                      inputMode="numeric"
                      value={telefone}
                      onChange={(e) => setTelefone(maskPhone(e.target.value))}
                      placeholder="(00) 00000-0000"
                      maxLength={15}
                      className="pl-10 h-12 rounded-xl border-gray-200 focus:border-primary"
                      required
                    />
                  </div>
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="lead-email" className="text-sm font-medium text-gray-700">
                    Email <span className="text-gray-400">(opcional)</span>
                  </Label>
                  <div className="relative">
                    <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                    <Input
                      id="lead-email"
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="seu@email.com"
                      className="pl-10 h-12 rounded-xl border-gray-200 focus:border-primary"
                    />
                  </div>
                </div>

                <Button
                  type="submit"
                  disabled={sending}
                  className="w-full h-13 text-base font-semibold rounded-xl shadow-lg text-white transition-all active:scale-[0.97]"
                  style={{ backgroundColor: color }}
                >
                  {sending ? (
                    <Loader2 className="h-5 w-5 animate-spin" />
                  ) : (
                    <>
                      Quero meu Projeto 3D Grátis
                      <ArrowRight className="ml-2 h-5 w-5" />
                    </>
                  )}
                </Button>
              </form>

              <div className="flex items-center justify-center gap-4 text-xs text-gray-400 pt-1">
                <div className="flex items-center gap-1">
                  <Shield className="h-3.5 w-3.5" />
                  Dados protegidos
                </div>
                <div className="flex items-center gap-1">
                  <Star className="h-3.5 w-3.5" />
                  Sem spam
                </div>
              </div>
            </div>
          </motion.div>
        </div>
      </main>

      {/* Footer */}
      <footer className="py-6 text-center text-xs text-gray-400">
        {tenant.nome_loja} · Powered by OrçaMóvel PRO
      </footer>
    </div>
  );
}