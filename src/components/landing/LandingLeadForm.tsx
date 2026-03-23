import { useState, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ArrowRight, CheckCircle, Loader2 } from "lucide-react";
import { supabase } from "@/lib/supabaseClient";
import { toast } from "sonner";
import { z } from "zod";
import { AnimatedSection } from "./AnimatedSection";

const leadSchema = z.object({
  nome: z.string().trim().min(2, "Nome deve ter ao menos 2 caracteres").max(100),
  area_atuacao: z.string().trim().min(1, "Selecione a área de atuação"),
  cargo: z.string().trim().min(1, "Selecione o cargo"),
  telefone: z.string().trim().min(10, "Telefone inválido").max(20),
  email: z.string().trim().email("Email inválido").max(255),
  interesse: z.string().trim().min(1, "Selecione o interesse"),
});

interface LandingLeadFormProps {
  primaryColor: string;
}

export function LandingLeadForm({ primaryColor }: LandingLeadFormProps) {
  const [form, setForm] = useState({ nome: "", area_atuacao: "", cargo: "", telefone: "", email: "", interesse: "" });
  const [honeypot, setHoneypot] = useState("");
  const [loading, setLoading] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const lastSubmitRef = useRef<number>(0);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    const now = Date.now();
    const elapsed = now - lastSubmitRef.current;
    if (elapsed < 30_000 && lastSubmitRef.current > 0) {
      const wait = Math.ceil((30_000 - elapsed) / 1000);
      toast.error(`Aguarde ${wait}s antes de enviar novamente.`);
      return;
    }

    setErrors({});

    const result = leadSchema.safeParse(form);
    if (!result.success) {
      const fieldErrors: Record<string, string> = {};
      result.error.errors.forEach(err => {
        if (err.path[0]) fieldErrors[err.path[0] as string] = err.message;
      });
      setErrors(fieldErrors);
      return;
    }

    lastSubmitRef.current = now;
    setLoading(true);

    try {
      // Usar Edge Function para captura com dedup + classificação + VendaZap
      const { data, error } = await supabase.functions.invoke("lead-capture", {
        body: {
          ...result.data,
          origem: "site",
          telefone: result.data.telefone.replace(/\D/g, ""),
        },
      });

      if (error) throw error;

      if (data?.duplicado) {
        toast.info("Seus dados já foram registrados. Atualizamos suas informações!");
      } else {
        toast.success("Cadastro realizado com sucesso!");
      }
      setSubmitted(true);
    } catch (err) {
      console.error("Lead capture error:", err);
      // Fallback: insert direto se a Edge Function falhar
      const { error: insertError } = await supabase.from("leads").insert({
        ...result.data,
        origem: "site",
        telefone: result.data.telefone.replace(/\D/g, ""),
        status: "novo",
      } as any);

      if (insertError) {
        toast.error("Erro ao enviar. Tente novamente.");
      } else {
        setSubmitted(true);
        toast.success("Cadastro realizado com sucesso!");
      }
    }

    setLoading(false);
  };

  if (submitted) {
    return (
      <section id="lead-form" className="py-20 bg-white">
        <AnimatedSection variant="scaleUp">
          <div className="max-w-lg mx-auto px-4 text-center space-y-6">
            <div className="h-20 w-20 rounded-full mx-auto flex items-center justify-center" style={{ backgroundColor: `${primaryColor}15` }}>
              <CheckCircle className="h-10 w-10" style={{ color: primaryColor }} />
            </div>
            <h2 className="text-3xl font-bold text-gray-900">Obrigado pelo interesse!</h2>
            <p className="text-gray-600 text-lg">
              Nossa equipe entrará em contato em breve para ativar seu período de teste gratuito de 7 dias.
            </p>
          </div>
        </AnimatedSection>
      </section>
    );
  }

  return (
    <section id="lead-form" className="py-20 bg-white">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="grid lg:grid-cols-2 gap-12 items-center">
          <AnimatedSection variant="slideLeft">
            <div className="space-y-6">
              <h2 className="text-3xl md:text-4xl font-bold text-gray-900">
                Comece seu <span style={{ color: primaryColor }}>teste gratuito</span>
              </h2>
              <p className="text-lg text-gray-600 leading-relaxed">
                Preencha seus dados e receba acesso completo ao OrçaMóvel PRO por 7 dias, sem compromisso e sem cartão de crédito.
              </p>
              <ul className="space-y-3">
                {["Acesso a todas as funcionalidades", "Suporte técnico incluído", "Sem cartão de crédito", "Cancele quando quiser"].map((item, i) => (
                  <li key={i} className="flex items-center gap-3 text-gray-700">
                    <CheckCircle className="h-5 w-5" style={{ color: primaryColor }} />
                    {item}
                  </li>
                ))}
              </ul>
            </div>
          </AnimatedSection>

          <AnimatedSection variant="slideRight">
            <div className="bg-gray-50 rounded-2xl p-8 border border-gray-200">
              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <Label className="text-sm font-medium text-gray-700">Nome completo *</Label>
                  <Input
                    value={form.nome}
                    onChange={(e) => setForm({ ...form, nome: e.target.value })}
                    placeholder="Seu nome completo"
                    className="mt-1"
                  />
                  {errors.nome && <p className="text-xs text-red-500 mt-1">{errors.nome}</p>}
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label className="text-sm font-medium text-gray-700">Área de atuação *</Label>
                    <Select value={form.area_atuacao} onValueChange={(v) => setForm({ ...form, area_atuacao: v })}>
                      <SelectTrigger className="mt-1"><SelectValue placeholder="Selecione" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="moveis_planejados">Móveis Planejados</SelectItem>
                        <SelectItem value="marcenaria">Marcenaria</SelectItem>
                        <SelectItem value="loja_moveis">Loja de Móveis</SelectItem>
                        <SelectItem value="design_interiores">Design de Interiores</SelectItem>
                        <SelectItem value="outro">Outro</SelectItem>
                      </SelectContent>
                    </Select>
                    {errors.area_atuacao && <p className="text-xs text-red-500 mt-1">{errors.area_atuacao}</p>}
                  </div>
                  <div>
                    <Label className="text-sm font-medium text-gray-700">Cargo *</Label>
                    <Select value={form.cargo} onValueChange={(v) => setForm({ ...form, cargo: v })}>
                      <SelectTrigger className="mt-1"><SelectValue placeholder="Selecione" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="proprietario">Proprietário</SelectItem>
                        <SelectItem value="gerente">Gerente</SelectItem>
                        <SelectItem value="vendedor">Vendedor</SelectItem>
                        <SelectItem value="projetista">Projetista</SelectItem>
                        <SelectItem value="outro">Outro</SelectItem>
                      </SelectContent>
                    </Select>
                    {errors.cargo && <p className="text-xs text-red-500 mt-1">{errors.cargo}</p>}
                  </div>
                </div>

                <div>
                  <Label className="text-sm font-medium text-gray-700">Qual seu interesse? *</Label>
                  <Select value={form.interesse} onValueChange={(v) => setForm({ ...form, interesse: v })}>
                    <SelectTrigger className="mt-1"><SelectValue placeholder="Selecione" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="comprar_agora">Quero contratar agora</SelectItem>
                      <SelectItem value="orcamento_urgente">Preciso de orçamento urgente</SelectItem>
                      <SelectItem value="pesquisando">Estou pesquisando soluções</SelectItem>
                      <SelectItem value="comparando_precos">Comparando preços</SelectItem>
                      <SelectItem value="apenas_curioso">Apenas curioso</SelectItem>
                      <SelectItem value="futuro">Para o futuro</SelectItem>
                    </SelectContent>
                  </Select>
                  {errors.interesse && <p className="text-xs text-red-500 mt-1">{errors.interesse}</p>}
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label className="text-sm font-medium text-gray-700">Telefone *</Label>
                    <Input
                      value={form.telefone}
                      onChange={(e) => setForm({ ...form, telefone: e.target.value })}
                      placeholder="(00) 00000-0000"
                      className="mt-1"
                    />
                    {errors.telefone && <p className="text-xs text-red-500 mt-1">{errors.telefone}</p>}
                  </div>
                  <div>
                    <Label className="text-sm font-medium text-gray-700">Email *</Label>
                    <Input
                      type="email"
                      value={form.email}
                      onChange={(e) => setForm({ ...form, email: e.target.value })}
                      placeholder="seu@email.com"
                      className="mt-1"
                    />
                    {errors.email && <p className="text-xs text-red-500 mt-1">{errors.email}</p>}
                  </div>
                </div>

                <Button
                  type="submit"
                  disabled={loading}
                  className="w-full text-white text-base py-5 rounded-xl"
                  style={{ backgroundColor: primaryColor }}
                >
                  {loading ? <Loader2 className="mr-2 h-5 w-5 animate-spin" /> : null}
                  Quero testar grátis
                  <ArrowRight className="ml-2 h-5 w-5" />
                </Button>
              </form>
            </div>
          </AnimatedSection>
        </div>
      </div>
    </section>
  );
}
