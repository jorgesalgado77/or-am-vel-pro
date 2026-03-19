import { useState, useEffect } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Video, Lock, ArrowLeft, Sparkles, CreditCard, FileText, CheckCircle, Send } from "lucide-react";
import { DealRoomStoreWidget } from "@/components/DealRoomStoreWidget";
import { useDealRoom } from "@/hooks/useDealRoom";
import { supabase } from "@/lib/supabaseClient";
import { toast } from "sonner";

interface DealRoomViewProps {
  tenantId: string | null;
  onBack: () => void;
}

export function DealRoomView({ tenantId, onBack }: DealRoomViewProps) {
  const { validateAccess } = useDealRoom();
  const [access, setAccess] = useState<{ allowed: boolean; reason?: string; plano?: string } | null>(null);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [formSent, setFormSent] = useState(false);
  const [formLoading, setFormLoading] = useState(false);
  const [formData, setFormData] = useState({ nome: "", email: "", telefone: "", mensagem: "" });

  useEffect(() => {
    if (!tenantId) {
      setAccess({ allowed: false, reason: "Tenant não encontrado" });
      setLoading(false);
      return;
    }
    const check = async () => {
      setLoading(true);
      const result = await validateAccess(tenantId);
      setAccess(result);
      setLoading(false);
    };
    check();
  }, [tenantId]);

  const handleSubmitInterest = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.nome.trim() || !formData.telefone.trim()) {
      toast.error("Preencha nome e telefone");
      return;
    }
    setFormLoading(true);
    const { error } = await supabase.from("support_tickets").insert({
      tipo: "addon_interesse",
      usuario_nome: formData.nome,
      usuario_email: formData.email || null,
      usuario_telefone: formData.telefone,
      mensagem: `Interesse no add-on Deal Room. ${formData.mensagem}`.trim(),
      status: "aberto",
    });
    setFormLoading(false);
    if (error) {
      toast.error("Erro ao enviar. Tente novamente.");
    } else {
      setFormSent(true);
      toast.success("Interesse registrado! Entraremos em contato em breve.");
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20 text-muted-foreground">
        Verificando acesso...
      </div>
    );
  }

  if (!access?.allowed) {
    return (
      <div className="max-w-2xl mx-auto mt-8">
        <Button variant="ghost" size="sm" className="gap-2 mb-6" onClick={onBack}>
          <ArrowLeft className="h-4 w-4" /> Voltar
        </Button>

        <Card className="border-2 border-dashed border-primary/30 bg-gradient-to-br from-primary/5 to-background">
          <CardContent className="flex flex-col items-center text-center py-12 px-8">
            <div className="h-16 w-16 rounded-2xl bg-primary/10 flex items-center justify-center mb-6">
              <Lock className="h-8 w-8 text-primary" />
            </div>

            <Badge variant="secondary" className="mb-4 text-xs">
              🎥 ADD-ON PREMIUM
            </Badge>

            <h3 className="text-2xl font-bold text-foreground mb-2">Deal Room</h3>
            <p className="text-muted-foreground mb-6 max-w-md">
              Feche vendas em tempo real com apresentações profissionais, pagamento integrado e contratos automáticos.
            </p>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8 w-full max-w-lg">
              {[
                { icon: Video, label: "Reuniões por vídeo", desc: "Apresente projetos ao vivo" },
                { icon: CreditCard, label: "Pagamento integrado", desc: "Receba na hora da venda" },
                { icon: FileText, label: "Contratos automáticos", desc: "Gere e envie por WhatsApp" },
              ].map((feat) => (
                <div key={feat.label} className="flex flex-col items-center gap-2 p-3 rounded-lg bg-muted/50">
                  <feat.icon className="h-5 w-5 text-primary" />
                  <span className="text-xs font-semibold text-foreground">{feat.label}</span>
                  <span className="text-[10px] text-muted-foreground text-center">{feat.desc}</span>
                </div>
              ))}
            </div>

            {formSent ? (
              <div className="flex flex-col items-center gap-3 py-4">
                <CheckCircle className="h-12 w-12 text-green-500" />
                <h4 className="text-lg font-semibold text-foreground">Interesse Registrado!</h4>
                <p className="text-sm text-muted-foreground">Nossa equipe entrará em contato em breve.</p>
              </div>
            ) : showForm ? (
              <form onSubmit={handleSubmitInterest} className="w-full max-w-sm space-y-3 text-left">
                <div>
                  <Label htmlFor="dr-nome">Nome *</Label>
                  <Input id="dr-nome" value={formData.nome} onChange={(e) => setFormData(p => ({ ...p, nome: e.target.value }))} placeholder="Seu nome" className="mt-1" />
                </div>
                <div>
                  <Label htmlFor="dr-tel">Telefone *</Label>
                  <Input id="dr-tel" value={formData.telefone} onChange={(e) => setFormData(p => ({ ...p, telefone: e.target.value }))} placeholder="(00) 00000-0000" className="mt-1" />
                </div>
                <div>
                  <Label htmlFor="dr-email">Email</Label>
                  <Input id="dr-email" type="email" value={formData.email} onChange={(e) => setFormData(p => ({ ...p, email: e.target.value }))} placeholder="seu@email.com" className="mt-1" />
                </div>
                <div>
                  <Label htmlFor="dr-msg">Mensagem (opcional)</Label>
                  <Textarea id="dr-msg" value={formData.mensagem} onChange={(e) => setFormData(p => ({ ...p, mensagem: e.target.value }))} placeholder="Conte-nos sobre sua necessidade..." rows={3} className="mt-1" />
                </div>
                <div className="flex gap-2 pt-2">
                  <Button type="button" variant="outline" className="flex-1" onClick={() => setShowForm(false)}>Cancelar</Button>
                  <Button type="submit" className="flex-1 gap-2" disabled={formLoading}>
                    <Send className="h-4 w-4" /> {formLoading ? "Enviando..." : "Enviar"}
                  </Button>
                </div>
              </form>
            ) : (
              <div className="flex flex-col items-center gap-3">
                <div className="flex items-baseline gap-1">
                  <span className="text-3xl font-bold text-foreground">R$ 147</span>
                  <span className="text-sm text-muted-foreground">/mês + 2% por venda</span>
                </div>
                <Button size="lg" className="gap-2" onClick={() => setShowForm(true)}>
                  <Sparkles className="h-4 w-4" /> Adquirir Deal Room
                </Button>
                <p className="text-xs text-muted-foreground">
                  {access?.reason || "Entre em contato com o administrador para ativar este add-on."}
                </p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div>
      <Button variant="ghost" size="sm" className="gap-2 mb-4" onClick={onBack}>
        <ArrowLeft className="h-4 w-4" /> Voltar
      </Button>
      <DealRoomStoreWidget tenantId={tenantId!} />
    </div>
  );
}
