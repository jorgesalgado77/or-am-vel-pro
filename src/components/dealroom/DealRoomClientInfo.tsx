import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { User, Phone, Mail, MapPin, FileText, Calendar } from "lucide-react";
import { supabase } from "@/lib/supabaseClient";
import { formatCurrency } from "@/lib/financing";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

interface DealRoomClientInfoProps {
  clientId: string;
  tenantId: string;
  onClose: () => void;
}

export function DealRoomClientInfo({ clientId, tenantId, onClose }: DealRoomClientInfoProps) {
  const [client, setClient] = useState<any>(null);

  useEffect(() => {
    const load = async () => {
      const { data } = await supabase
        .from("clients")
        .select("*")
        .eq("id", clientId)
        .single();
      setClient(data);
    };
    load();
  }, [clientId]);

  if (!client) return null;

  const fields = [
    { icon: User, label: "Nome", value: client.nome },
    { icon: Phone, label: "Telefone", value: client.telefone },
    { icon: Mail, label: "Email", value: client.email },
    { icon: MapPin, label: "Endereço", value: client.endereco },
    { icon: FileText, label: "Nº Orçamento", value: client.numero_orcamento },
    { icon: FileText, label: "CPF/CNPJ", value: client.cpf_cnpj },
    { icon: Calendar, label: "Cadastro", value: client.created_at ? format(new Date(client.created_at), "dd/MM/yyyy", { locale: ptBR }) : "—" },
  ];

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <User className="h-5 w-5 text-primary" /> Dados do Cliente
          </DialogTitle>
        </DialogHeader>
        <ScrollArea className="max-h-[400px]">
          <div className="space-y-3">
            {fields.map(f => (
              <div key={f.label} className="flex items-start gap-3">
                <f.icon className="h-4 w-4 text-muted-foreground mt-0.5 flex-shrink-0" />
                <div>
                  <p className="text-xs text-muted-foreground">{f.label}</p>
                  <p className="text-sm text-foreground">{f.value || "—"}</p>
                </div>
              </div>
            ))}
            {client.status && (
              <div className="flex items-center gap-2">
                <Badge variant="outline">{client.status}</Badge>
                {client.valor_total && (
                  <Badge variant="secondary">{formatCurrency(Number(client.valor_total))}</Badge>
                )}
              </div>
            )}
          </div>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}
