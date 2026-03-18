import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Save, Eye, EyeOff, MessageSquare, CheckCircle2, XCircle } from "lucide-react";

type WhatsAppProvider = "evolution" | "twilio";

interface WhatsAppSettings {
  id: string;
  provider: WhatsAppProvider;
  evolution_api_url: string | null;
  evolution_api_key: string | null;
  evolution_instance_name: string | null;
  twilio_account_sid: string | null;
  twilio_auth_token: string | null;
  twilio_phone_number: string | null;
  ativo: boolean;
  enviar_contrato: boolean;
  enviar_notificacoes: boolean;
}

export function WhatsAppTab() {
  const [settings, setSettings] = useState<WhatsAppSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [showEvolutionKey, setShowEvolutionKey] = useState(false);
  const [showTwilioToken, setShowTwilioToken] = useState(false);

  // Form state
  const [provider, setProvider] = useState<WhatsAppProvider>("evolution");
  const [evolutionUrl, setEvolutionUrl] = useState("");
  const [evolutionKey, setEvolutionKey] = useState("");
  const [evolutionInstance, setEvolutionInstance] = useState("");
  const [twilioSid, setTwilioSid] = useState("");
  const [twilioToken, setTwilioToken] = useState("");
  const [twilioPhone, setTwilioPhone] = useState("");
  const [ativo, setAtivo] = useState(false);
  const [enviarContrato, setEnviarContrato] = useState(true);
  const [enviarNotificacoes, setEnviarNotificacoes] = useState(true);

  const fetchSettings = async () => {
    const { data } = await supabase
      .from("whatsapp_settings")
      .select("*")
      .limit(1)
      .single();
    if (data) {
      const s = data as unknown as WhatsAppSettings;
      setSettings(s);
      setProvider(s.provider);
      setEvolutionUrl(s.evolution_api_url || "");
      setEvolutionKey(s.evolution_api_key || "");
      setEvolutionInstance(s.evolution_instance_name || "");
      setTwilioSid(s.twilio_account_sid || "");
      setTwilioToken(s.twilio_auth_token || "");
      setTwilioPhone(s.twilio_phone_number || "");
      setAtivo(s.ativo);
      setEnviarContrato(s.enviar_contrato);
      setEnviarNotificacoes(s.enviar_notificacoes);
    }
    setLoading(false);
  };

  useEffect(() => { fetchSettings(); }, []);

  const handleSave = async () => {
    if (!settings) return;
    setSaving(true);
    const { error } = await supabase
      .from("whatsapp_settings")
      .update({
        provider,
        evolution_api_url: evolutionUrl.trim() || null,
        evolution_api_key: evolutionKey.trim() || null,
        evolution_instance_name: evolutionInstance.trim() || null,
        twilio_account_sid: twilioSid.trim() || null,
        twilio_auth_token: twilioToken.trim() || null,
        twilio_phone_number: twilioPhone.trim() || null,
        ativo,
        enviar_contrato: enviarContrato,
        enviar_notificacoes: enviarNotificacoes,
      } as any)
      .eq("id", settings.id);
    setSaving(false);
    if (error) toast.error("Erro ao salvar configurações");
    else { toast.success("Configurações do WhatsApp salvas!"); fetchSettings(); }
  };

  const handleTestConnection = async () => {
    setTesting(true);
    try {
      if (provider === "evolution") {
        if (!evolutionUrl || !evolutionKey) {
          toast.error("Preencha a URL e API Key da Evolution API");
          setTesting(false);
          return;
        }
        const url = `${evolutionUrl.replace(/\/$/, "")}/instance/fetchInstances`;
        const res = await fetch(url, {
          headers: { apikey: evolutionKey },
        });
        if (res.ok) {
          toast.success("Conexão com Evolution API estabelecida!");
        } else {
          toast.error(`Erro na conexão: ${res.status} ${res.statusText}`);
        }
      } else {
        if (!twilioSid || !twilioToken) {
          toast.error("Preencha o Account SID e Auth Token do Twilio");
          setTesting(false);
          return;
        }
        toast.info("Para testar o Twilio, salve as configurações e envie uma mensagem de teste.");
      }
    } catch (err) {
      toast.error("Erro ao testar conexão. Verifique a URL e credenciais.");
    }
    setTesting(false);
  };

  if (loading) {
    return <p className="text-sm text-muted-foreground text-center py-8">Carregando...</p>;
  }

  return (
    <div className="space-y-6">
      {/* Provider Selection */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base flex items-center gap-2">
              <MessageSquare className="h-5 w-5 text-primary" />
              Configuração do WhatsApp
            </CardTitle>
            <div className="flex items-center gap-2">
              {ativo ? (
                <Badge variant="default" className="gap-1 bg-success text-success-foreground">
                  <CheckCircle2 className="h-3 w-3" />Ativo
                </Badge>
              ) : (
                <Badge variant="secondary" className="gap-1">
                  <XCircle className="h-3 w-3" />Inativo
                </Badge>
              )}
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <Label>Integração Ativa</Label>
              <p className="text-xs text-muted-foreground">Habilita o envio de mensagens via WhatsApp</p>
            </div>
            <Switch checked={ativo} onCheckedChange={setAtivo} />
          </div>

          <Separator />

          <div>
            <Label className="text-sm font-medium mb-3 block">Provedor da API</Label>
            <div className="grid grid-cols-2 gap-3">
              <button
                onClick={() => setProvider("evolution")}
                className={`p-4 rounded-lg border-2 transition-all text-left ${
                  provider === "evolution"
                    ? "border-primary bg-primary/5"
                    : "border-border hover:border-muted-foreground/30"
                }`}
              >
                <p className="font-semibold text-sm text-foreground">Evolution API</p>
                <p className="text-xs text-muted-foreground mt-1">
                  API gratuita e open-source para WhatsApp
                </p>
              </button>
              <button
                onClick={() => setProvider("twilio")}
                className={`p-4 rounded-lg border-2 transition-all text-left ${
                  provider === "twilio"
                    ? "border-primary bg-primary/5"
                    : "border-border hover:border-muted-foreground/30"
                }`}
              >
                <p className="font-semibold text-sm text-foreground">Twilio</p>
                <p className="text-xs text-muted-foreground mt-1">
                  Plataforma de comunicação em nuvem
                </p>
              </button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Provider-specific settings */}
      {provider === "evolution" ? (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Evolution API — Credenciais</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label>URL da API</Label>
              <Input
                value={evolutionUrl}
                onChange={(e) => setEvolutionUrl(e.target.value)}
                placeholder="https://sua-evolution-api.com"
                className="mt-1"
              />
              <p className="text-xs text-muted-foreground mt-1">
                URL base do seu servidor Evolution API
              </p>
            </div>
            <div>
              <Label>API Key</Label>
              <div className="relative mt-1">
                <Input
                  type={showEvolutionKey ? "text" : "password"}
                  value={evolutionKey}
                  onChange={(e) => setEvolutionKey(e.target.value)}
                  placeholder="Sua chave de API"
                  className="pr-10"
                />
                <button
                  type="button"
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  onClick={() => setShowEvolutionKey(!showEvolutionKey)}
                >
                  {showEvolutionKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>
            <div>
              <Label>Nome da Instância</Label>
              <Input
                value={evolutionInstance}
                onChange={(e) => setEvolutionInstance(e.target.value)}
                placeholder="Ex: minha-instancia"
                className="mt-1"
              />
              <p className="text-xs text-muted-foreground mt-1">
                Nome da instância configurada no Evolution API
              </p>
            </div>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Twilio — Credenciais</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label>Account SID</Label>
              <Input
                value={twilioSid}
                onChange={(e) => setTwilioSid(e.target.value)}
                placeholder="ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
                className="mt-1"
              />
              <p className="text-xs text-muted-foreground mt-1">
                Encontre no painel do Twilio em Account Info
              </p>
            </div>
            <div>
              <Label>Auth Token</Label>
              <div className="relative mt-1">
                <Input
                  type={showTwilioToken ? "text" : "password"}
                  value={twilioToken}
                  onChange={(e) => setTwilioToken(e.target.value)}
                  placeholder="Token de autenticação"
                  className="pr-10"
                />
                <button
                  type="button"
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  onClick={() => setShowTwilioToken(!showTwilioToken)}
                >
                  {showTwilioToken ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>
            <div>
              <Label>Número de Telefone</Label>
              <Input
                value={twilioPhone}
                onChange={(e) => setTwilioPhone(e.target.value)}
                placeholder="+5511999999999"
                className="mt-1"
              />
              <p className="text-xs text-muted-foreground mt-1">
                Número do WhatsApp Business cadastrado no Twilio (formato E.164)
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Features toggle */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Funcionalidades</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <Label>Enviar Contrato por WhatsApp</Label>
              <p className="text-xs text-muted-foreground">
                Após fechar venda, oferecer opção de enviar o contrato PDF ao cliente
              </p>
            </div>
            <Switch checked={enviarContrato} onCheckedChange={setEnviarContrato} />
          </div>
          <Separator />
          <div className="flex items-center justify-between">
            <div>
              <Label>Notificações Automáticas</Label>
              <p className="text-xs text-muted-foreground">
                Enviar alertas de orçamento criado, vencimento próximo, etc.
              </p>
            </div>
            <Switch checked={enviarNotificacoes} onCheckedChange={setEnviarNotificacoes} />
          </div>
        </CardContent>
      </Card>

      {/* Actions */}
      <div className="flex gap-3 justify-end">
        <Button variant="outline" onClick={handleTestConnection} disabled={testing} className="gap-2">
          {testing ? "Testando..." : "Testar Conexão"}
        </Button>
        <Button onClick={handleSave} disabled={saving} className="gap-2">
          <Save className="h-4 w-4" />
          {saving ? "Salvando..." : "Salvar Configurações"}
        </Button>
      </div>
    </div>
  );
}
