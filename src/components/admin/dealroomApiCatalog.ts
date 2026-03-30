export type DealRoomProviderKey =
  | "jitsi"
  | "daily"
  | "twilio_video"
  | "livekit"
  | "stripe"
  | "openai"
  | "govbr_signature";

export interface DealRoomApiField {
  key: string;
  label: string;
  type?: "text" | "password" | "url";
  placeholder?: string;
  required?: boolean;
  group?: "credenciais" | "configuracoes";
}

export interface DealRoomApiProviderDefinition {
  provider: DealRoomProviderKey;
  label: string;
  badge: string;
  category: string;
  description: string;
  fields: DealRoomApiField[];
}

export const DEALROOM_API_CATALOG: DealRoomApiProviderDefinition[] = [
  {
    provider: "jitsi",
    label: "Jitsi Meet",
    badge: "Gratuito",
    category: "video",
    description: "Videoconferência pública ou JaaS com App ID e domínio personalizado.",
    fields: [
      { key: "app_id", label: "App ID", placeholder: "Seu App ID JaaS" },
      { key: "api_key", label: "API Key", type: "password", placeholder: "Chave Jitsi/JaaS" },
      { key: "domain", label: "Domínio / Server URL", type: "url", placeholder: "https://meet.jit.si", group: "configuracoes" },
    ],
  },
  {
    provider: "daily",
    label: "Daily.co",
    badge: "Freemium",
    category: "video",
    description: "Provider de vídeo com salas escaláveis, gravação e WebRTC pronto.",
    fields: [
      { key: "api_key", label: "API Key", type: "password", placeholder: "Daily API Key", required: true },
      { key: "domain", label: "Domain / Subdomínio", type: "url", placeholder: "https://sualoja.daily.co", group: "configuracoes" },
    ],
  },
  {
    provider: "twilio_video",
    label: "Twilio Video",
    badge: "Pago",
    category: "video",
    description: "Videoconferência corporativa com Account SID, tokens e rooms gerenciadas.",
    fields: [
      { key: "account_sid", label: "Account SID", placeholder: "AC...", required: true },
      { key: "auth_token", label: "Auth Token", type: "password", placeholder: "Twilio Auth Token", required: true },
      { key: "api_key_sid", label: "API Key SID", placeholder: "SK...", required: true },
      { key: "api_key_secret", label: "API Key Secret", type: "password", placeholder: "Twilio API Secret", required: true },
    ],
  },
  {
    provider: "livekit",
    label: "LiveKit",
    badge: "Open Source / Cloud",
    category: "video",
    description: "Infraestrutura moderna para vídeo, áudio e streaming com WebSocket dedicado.",
    fields: [
      { key: "api_key", label: "API Key", placeholder: "LiveKit API Key", required: true },
      { key: "api_secret", label: "API Secret", type: "password", placeholder: "LiveKit API Secret", required: true },
      { key: "ws_url", label: "WebSocket URL", type: "url", placeholder: "wss://...", required: true, group: "configuracoes" },
    ],
  },
  {
    provider: "stripe",
    label: "Stripe (Pagamentos)",
    badge: "Obrigatório",
    category: "pagamento",
    description: "Checkout, cobranças e webhooks do Deal Room.",
    fields: [
      { key: "publishable_key", label: "Publishable Key", placeholder: "pk_live_...", required: true },
      { key: "secret_key", label: "Secret Key", type: "password", placeholder: "sk_live_...", required: true },
      { key: "webhook_url", label: "Webhook URL", type: "url", placeholder: "https://...", group: "configuracoes" },
    ],
  },
  {
    provider: "openai",
    label: "OpenAI (Agente IA)",
    badge: "Obrigatório",
    category: "ia",
    description: "Assistente IA, coaching comercial e automações inteligentes da reunião.",
    fields: [
      { key: "api_key", label: "API Key", type: "password", placeholder: "sk-...", required: true },
      { key: "model", label: "Modelo padrão", placeholder: "gpt-4o-mini", group: "configuracoes" },
    ],
  },
  {
    provider: "govbr_signature",
    label: "Gov.br / ICP-Brasil",
    badge: "Opcional",
    category: "assinatura",
    description: "Assinatura digital via provedor compatível com ICP-Brasil.",
    fields: [
      { key: "provider_name", label: "Provedor", placeholder: "D4Sign / Clicksign / DocuSign", group: "configuracoes" },
      { key: "api_key", label: "API Key", type: "password", placeholder: "Chave do provedor" },
      { key: "api_secret", label: "API Secret", type: "password", placeholder: "Segredo do provedor" },
      { key: "base_url", label: "Base URL", type: "url", placeholder: "https://api...", group: "configuracoes" },
    ],
  },
];

export const getDealRoomProviderLabel = (provider: string) =>
  DEALROOM_API_CATALOG.find((item) => item.provider === provider)?.label || provider;