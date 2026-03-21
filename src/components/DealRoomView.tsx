import { useState, useEffect } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Video, Lock, ArrowLeft, Sparkles, CreditCard, FileText, CheckCircle, Send, Handshake } from "lucide-react";

import { AddonPurchaseCard } from "@/components/AddonPurchaseCard";
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
      <AddonPurchaseCard
        addonName="Deal Room"
        addonSlug="dealroom"
        price="R$ 147"
        priceExtra="+ 2% por venda"
        description="Feche vendas em tempo real com apresentações profissionais, pagamento integrado e contratos automáticos."
        features={[
          { label: "Reuniões por vídeo", icon: <Video className="h-5 w-5" /> },
          { label: "Pagamento integrado", icon: <CreditCard className="h-5 w-5" /> },
          { label: "Contratos automáticos", icon: <FileText className="h-5 w-5" /> },
        ]}
        icon={<Handshake className="h-8 w-8 text-primary" />}
        onBack={onBack}
      />
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
