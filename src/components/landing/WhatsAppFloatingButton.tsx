/**
 * WhatsAppFloatingButton — sticky mobile FAB for WhatsApp contact
 */
import { MessageCircle } from "lucide-react";
import { useState } from "react";
import { WhatsAppLeadDialog } from "./WhatsAppLeadDialog";

interface WhatsAppFloatingButtonProps {
  phone: string;
  message: string;
  primaryColor?: string;
}

export function WhatsAppFloatingButton({ phone, message, primaryColor }: WhatsAppFloatingButtonProps) {
  const [dialogOpen, setDialogOpen] = useState(false);

  return (
    <>
      <button
        onClick={() => setDialogOpen(true)}
        className="fixed bottom-6 right-6 z-50 h-14 w-14 rounded-full shadow-xl flex items-center justify-center transition-transform hover:scale-110 active:scale-95 animate-bounce-slow"
        style={{ backgroundColor: "#25D366" }}
        aria-label="Falar no WhatsApp"
      >
        <MessageCircle className="h-7 w-7 text-white" />
      </button>

      <WhatsAppLeadDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        phone={phone}
        message={message}
        primaryColor={primaryColor}
      />
    </>
  );
}
