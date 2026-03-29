export interface ChatConversation {
  id: string;
  numero_contrato: string;
  nome_cliente: string;
  unread_count: number;
  last_message?: string;
  last_message_at?: string;
  lead_temperature?: "quente" | "morno" | "frio";
  vendedor_nome?: string | null;
  projetista_nome?: string | null;
  isClientDirect?: boolean;
  isTemporary?: boolean;
  client_id?: string;
  phone?: string; // WhatsApp phone number for direct sending
  relatedTrackingIds?: string[]; // All grouped tracking IDs for this conversation
}

export interface ChatMessage {
  id: string;
  tracking_id: string;
  mensagem: string;
  remetente_tipo: "loja" | "cliente";
  remetente_nome: string | null;
  created_at: string;
  lida: boolean;
  status?: "sent" | "delivered" | "read";
  external_id?: string | null;
  tipo_anexo?: string | null;
  anexo_url?: string | null;
  anexo_nome?: string | null;
}
