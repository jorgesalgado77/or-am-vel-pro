/**
 * WhatsApp Funnel — utility to generate wa.me links and manage funnel config
 */

export interface WhatsAppFunnelConfig {
  enabled: boolean;
  phone: string;
  messages: {
    interest: string;
    qualification: string;
    closing: string;
    support: string;
  };
}

export const DEFAULT_WHATSAPP_FUNNEL: WhatsAppFunnelConfig = {
  enabled: false,
  phone: "",
  messages: {
    interest: "Olá, quero entender como o OrçaMóvel Pro pode me ajudar a vender mais.",
    qualification: "Tenho uma loja de móveis planejados e quero melhorar minhas vendas. Pode me explicar como funciona?",
    closing: "Quero começar agora. Qual plano você recomenda?",
    support: "Olá, gostaria de tirar algumas dúvidas sobre o OrçaMóvel Pro.",
  },
};

/**
 * Sanitize phone to digits only, ensure Brazilian country code
 */
function sanitizePhone(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  if (digits.startsWith("55")) return digits;
  return `55${digits}`;
}

/**
 * Generate a wa.me link with pre-filled message
 */
export function generateWhatsAppLink(phone: string, message: string): string {
  const sanitized = sanitizePhone(phone);
  const encoded = encodeURIComponent(message);
  return `https://wa.me/${sanitized}?text=${encoded}`;
}

/**
 * Open WhatsApp in a new tab
 */
export function openWhatsApp(phone: string, message: string): void {
  const url = generateWhatsAppLink(phone, message);
  window.open(url, "_blank", "noopener,noreferrer");
}
