import { useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { toast } from "sonner";
import { AddonPurchaseCard } from "@/components/AddonPurchaseCard";
import { Video, CreditCard, FileText, Handshake } from "lucide-react";

interface DealRoomInterestFormProps {
  onBack: () => void;
}

export function DealRoomInterestForm({ onBack }: DealRoomInterestFormProps) {
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
