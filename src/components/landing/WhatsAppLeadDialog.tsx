/**
 * WhatsAppLeadDialog — captures name/email before redirecting to WhatsApp
 */
import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { MessageCircle, ArrowRight } from "lucide-react";
import { openWhatsApp } from "@/lib/whatsappFunnel";
import { supabase } from "@/lib/supabaseClient";
import { toast } from "sonner";

interface WhatsAppLeadDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  phone: string;
  message: string;
  primaryColor?: string;
}

export function WhatsAppLeadDialog({ open, onOpenChange, phone, message, primaryColor }: WhatsAppLeadDialogProps) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [sending, setSending] = useState(false);

  const handleSubmit = async () => {
    setSending(true);

    // Save lead if name provided
    if (name.trim()) {
      try {
        await supabase.from("leads" as any).insert({
          nome: name.trim(),
          email: email.trim() || null,
          origem: "whatsapp_funnel",
          mensagem: message,
        } as any);
      } catch {
        // non-blocking
      }
    }

    openWhatsApp(phone, message);
    setSending(false);
    onOpenChange(false);
    setName("");
    setEmail("");
    toast.success("WhatsApp aberto! Aguarde o atendimento.");
  };

  const handleSkip = () => {
    openWhatsApp(phone, message);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <MessageCircle className="h-5 w-5 text-green-600" />
            Falar com Especialista
          </DialogTitle>
          <DialogDescription>
            Deixe seu contato para um atendimento personalizado (opcional)
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 mt-2">
          <div className="space-y-2">
            <Label htmlFor="lead-name">Seu nome</Label>
            <Input
              id="lead-name"
              placeholder="Como podemos te chamar?"
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={100}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="lead-email">Email (opcional)</Label>
            <Input
              id="lead-email"
              type="email"
              placeholder="seu@email.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              maxLength={255}
            />
          </div>

          <div className="flex flex-col gap-2 pt-2">
            <Button
              onClick={handleSubmit}
              disabled={sending}
              className="w-full text-white"
              style={{ backgroundColor: primaryColor || "#25D366" }}
            >
              <MessageCircle className="mr-2 h-4 w-4" />
              Abrir WhatsApp
              <ArrowRight className="ml-2 h-4 w-4" />
            </Button>
            <Button variant="ghost" size="sm" onClick={handleSkip} className="text-muted-foreground">
              Pular e ir direto ao WhatsApp
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
