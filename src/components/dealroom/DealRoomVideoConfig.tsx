import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Video, ExternalLink, Info, CheckCircle, Settings } from "lucide-react";
import { toast } from "sonner";

export type VideoProvider = "jitsi" | "daily" | "twilio" | "livekit";

interface VideoProviderConfig {
  provider: VideoProvider;
  apiKey?: string;
  roomUrl?: string;
  serverUrl?: string;
  token?: string;
}

interface DealRoomVideoConfigProps {
  config: VideoProviderConfig;
  onChange: (config: VideoProviderConfig) => void;
  onSave: () => void;
}

const PROVIDER_INFO: Record<VideoProvider, {
  name: string;
  description: string;
  docsUrl: string;
  signupUrl: string;
  tips: string[];
  fields: { key: string; label: string; placeholder: string; tip: string }[];
  free: boolean;
}> = {
  jitsi: {
    name: "Jitsi Meet",
    description: "Videoconferência gratuita e open-source. Não requer conta.",
    docsUrl: "https://jitsi.github.io/handbook/docs/dev-guide/dev-guide-iframe",
    signupUrl: "https://meet.jit.si",
    tips: [
      "Nenhuma API key é necessária para usar o servidor público meet.jit.si",
      "Para servidor privado, instale o Jitsi em seu próprio servidor",
      "Limite de participantes: depende do servidor (público ~75 pessoas)",
      "Gravação disponível apenas em servidores privados com Jibri",
    ],
    fields: [],
    free: true,
  },
  daily: {
    name: "Daily.co",
    description: "Plataforma de vídeo profissional com API robusta. Plano gratuito disponível.",
    docsUrl: "https://docs.daily.co/reference/rest-api",
    signupUrl: "https://dashboard.daily.co/signup",
    tips: [
      "Crie uma conta gratuita em dashboard.daily.co",
      "Acesse Settings → Developers para copiar sua API Key",
      "O plano gratuito permite até 100 participantes e 10.000 minutos/mês",
      "Suporte nativo a gravação, transcrição e IA",
      "As salas podem ser criadas via API ou dashboard",
    ],
    fields: [
      { key: "apiKey", label: "API Key", placeholder: "sua-api-key-daily", tip: "Dashboard → Settings → Developers" },
    ],
    free: true,
  },
  twilio: {
    name: "Twilio Video",
    description: "SDK de vídeo enterprise da Twilio. Escalável e personalizável.",
    docsUrl: "https://www.twilio.com/docs/video",
    signupUrl: "https://www.twilio.com/try-twilio",
    tips: [
      "Crie uma conta no twilio.com/try-twilio (crédito inicial gratuito)",
      "Acesse Console → Account → API Keys para criar uma API Key",
      "Necessita Account SID + API Key SID + API Key Secret",
      "Cobrado por minuto de participante (~$0.004/min)",
      "Suporte a gravação de composição, rooms em grupo e P2P",
    ],
    fields: [
      { key: "apiKey", label: "Account SID", placeholder: "ACxxxxxxxxxx", tip: "Console → Account Info" },
      { key: "token", label: "API Key Secret", placeholder: "sua-api-secret", tip: "Console → API Keys → Create" },
    ],
    free: false,
  },
  livekit: {
    name: "LiveKit",
    description: "Plataforma open-source de vídeo em tempo real. Auto-hospedável ou cloud.",
    docsUrl: "https://docs.livekit.io",
    signupUrl: "https://cloud.livekit.io",
    tips: [
      "Use LiveKit Cloud (cloud.livekit.io) para setup rápido",
      "Ou instale em seu servidor: Docker disponível",
      "Acesse Settings → Keys no dashboard do LiveKit Cloud",
      "Necessita Server URL + API Key + API Secret",
      "Plano gratuito: 50 GB de tráfego/mês",
      "Suporte nativo a gravação, streaming e egressos",
    ],
    fields: [
      { key: "serverUrl", label: "Server URL", placeholder: "wss://sua-instancia.livekit.cloud", tip: "Dashboard → Settings" },
      { key: "apiKey", label: "API Key", placeholder: "APIxxxxxxxxxx", tip: "Dashboard → Settings → Keys" },
      { key: "token", label: "API Secret", placeholder: "sua-api-secret", tip: "Gerado junto com a API Key" },
    ],
    free: true,
  },
};

export function DealRoomVideoConfig({ config, onChange, onSave }: DealRoomVideoConfigProps) {
  const [activeTab, setActiveTab] = useState<VideoProvider>(config.provider);

  const handleSelectProvider = (provider: VideoProvider) => {
    setActiveTab(provider);
    onChange({ ...config, provider });
  };

  const handleFieldChange = (key: string, value: string) => {
    onChange({ ...config, [key]: value });
  };

  const handleSave = () => {
    const info = PROVIDER_INFO[config.provider];
    if (info.fields.length > 0) {
      const missing = info.fields.filter(f => !config[f.key as keyof VideoProviderConfig]);
      if (missing.length > 0) {
        toast.error(`Preencha: ${missing.map(f => f.label).join(", ")}`);
        return;
      }
    }
    onSave();
    toast.success(`Provedor ${info.name} configurado com sucesso!`);
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-sm flex items-center gap-2">
          <Settings className="h-4 w-4 text-primary" /> Configuração de Vídeo
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <Tabs value={activeTab} onValueChange={(v) => handleSelectProvider(v as VideoProvider)}>
          <TabsList className="w-full grid grid-cols-4">
            {(Object.keys(PROVIDER_INFO) as VideoProvider[]).map(p => (
              <TabsTrigger key={p} value={p} className="text-xs gap-1">
                <Video className="h-3 w-3" />
                {PROVIDER_INFO[p].name.split(" ")[0]}
              </TabsTrigger>
            ))}
          </TabsList>

          {(Object.keys(PROVIDER_INFO) as VideoProvider[]).map(provider => {
            const info = PROVIDER_INFO[provider];
            return (
              <TabsContent key={provider} value={provider} className="space-y-3 mt-3">
                <div className="flex items-start justify-between">
                  <div>
                    <h4 className="text-sm font-semibold text-foreground">{info.name}</h4>
                    <p className="text-xs text-muted-foreground">{info.description}</p>
                  </div>
                  <Badge variant={info.free ? "secondary" : "outline"} className="text-[10px]">
                    {info.free ? "Gratuito" : "Pago"}
                  </Badge>
                </div>

                {/* Tips */}
                <div className="bg-muted/50 rounded-lg p-3 space-y-1.5">
                  <p className="text-xs font-semibold flex items-center gap-1 text-foreground">
                    <Info className="h-3.5 w-3.5 text-primary" /> Como configurar:
                  </p>
                  {info.tips.map((tip, i) => (
                    <p key={i} className="text-[11px] text-muted-foreground flex items-start gap-1.5">
                      <span className="text-primary font-bold">{i + 1}.</span> {tip}
                    </p>
                  ))}
                </div>

                {/* Links */}
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" className="gap-1 text-xs flex-1"
                    onClick={() => window.open(info.signupUrl, "_blank")}>
                    <ExternalLink className="h-3 w-3" /> {info.free ? "Acessar" : "Criar Conta"}
                  </Button>
                  <Button variant="outline" size="sm" className="gap-1 text-xs flex-1"
                    onClick={() => window.open(info.docsUrl, "_blank")}>
                    <ExternalLink className="h-3 w-3" /> Documentação
                  </Button>
                </div>

                {/* Config fields */}
                {info.fields.length > 0 && (
                  <div className="space-y-2 pt-2 border-t">
                    {info.fields.map(field => (
                      <div key={field.key}>
                        <Label className="text-xs">{field.label}</Label>
                        <Input
                          className="h-8 text-xs mt-1"
                          type={field.key.includes("secret") || field.key.includes("Secret") || field.key === "token" ? "password" : "text"}
                          placeholder={field.placeholder}
                          value={(config as any)[field.key] || ""}
                          onChange={e => handleFieldChange(field.key, e.target.value)}
                        />
                        <p className="text-[10px] text-muted-foreground mt-0.5">📌 {field.tip}</p>
                      </div>
                    ))}
                  </div>
                )}

                {/* Active indicator */}
                {config.provider === provider && (
                  <div className="flex items-center gap-1.5 text-xs text-green-600">
                    <CheckCircle className="h-3.5 w-3.5" /> Provedor selecionado
                  </div>
                )}

                <Button size="sm" className="w-full gap-2" onClick={handleSave}>
                  <CheckCircle className="h-3.5 w-3.5" /> Salvar Configuração
                </Button>
              </TabsContent>
            );
          })}
        </Tabs>
      </CardContent>
    </Card>
  );
}
