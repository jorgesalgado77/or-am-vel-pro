import {useState, useEffect} from "react";
import {Card, CardContent, CardHeader, CardTitle} from "@/components/ui/card";
import {Input} from "@/components/ui/input";
import {Label} from "@/components/ui/label";
import {Button} from "@/components/ui/button";
import {Switch} from "@/components/ui/switch";
import {Separator} from "@/components/ui/separator";
import {Badge} from "@/components/ui/badge";
import {Textarea} from "@/components/ui/textarea";
import {Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter} from "@/components/ui/dialog";
import {Table, TableBody, TableCell, TableHead, TableHeader, TableRow} from "@/components/ui/table";
import {Select, SelectContent, SelectItem, SelectTrigger, SelectValue} from "@/components/ui/select";
import {supabase} from "@/lib/supabaseClient";
import {toast} from "sonner";
import {Save, Eye, EyeOff, MessageSquare, CheckCircle2, XCircle, Plus, Trash2, Edit, Bot, Copy, Info} from "lucide-react";
import {getTenantId} from "@/lib/tenantState";
import {WhatsAppBotMonitor} from "@/components/campaigns/WhatsAppBotMonitor";
import {WhatsAppInstanceManager} from "./WhatsAppInstanceManager";

type WhatsAppProvider = "evolution" | "twilio" | "zapi";

interface WhatsAppSettings {
  id: string;
  provider: WhatsAppProvider;
  evolution_api_url: string | null;
  evolution_api_key: string | null;
  evolution_instance_name: string | null;
  twilio_account_sid: string | null;
  twilio_auth_token: string | null;
  twilio_phone_number: string | null;
  zapi_instance_id: string | null;
  zapi_token: string | null;
  zapi_security_token: string | null;
  zapi_webhook_url: string | null;
  zapi_client_token: string | null;
  ativo: boolean;
  enviar_contrato: boolean;
  enviar_notificacoes: boolean;
}

interface MessageTemplate {
  id: string;
  nome: string;
  tipo: string;
  conteudo: string;
  ativo: boolean;
  created_at: string;
}

const TEMPLATE_TYPES = [
  { value: "orcamento", label: "Orçamento" },
  { value: "contrato", label: "Contrato" },
  { value: "cobranca", label: "Cobrança" },
  { value: "acompanhamento", label: "Acompanhamento" },
  { value: "boas_vindas", label: "Boas-vindas ao Cliente" },
  { value: "outro", label: "Outro" },
];

export function WhatsAppTab() {
  const [settings, setSettings] = useState<WhatsAppSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [showEvolutionKey, setShowEvolutionKey] = useState(false);
  const [showTwilioToken, setShowTwilioToken] = useState(false);
  const [showZapiToken, setShowZapiToken] = useState(false);
  const [showZapiSecurityToken, setShowZapiSecurityToken] = useState(false);

  const [provider, setProvider] = useState<WhatsAppProvider>("evolution");
  const [evolutionUrl, setEvolutionUrl] = useState("");
  const [evolutionKey, setEvolutionKey] = useState("");
  const [evolutionInstance, setEvolutionInstance] = useState("");
  const [twilioSid, setTwilioSid] = useState("");
  const [twilioToken, setTwilioToken] = useState("");
  const [twilioPhone, setTwilioPhone] = useState("");
  const [zapiInstanceId, setZapiInstanceId] = useState("");
  const [zapiToken, setZapiToken] = useState("");
  const [zapiSecurityToken, setZapiSecurityToken] = useState("");
  const [zapiWebhookUrl, setZapiWebhookUrl] = useState("");
  const [zapiClientToken, setZapiClientToken] = useState("");
  const [ativo, setAtivo] = useState(false);
  const [enviarContrato, setEnviarContrato] = useState(true);
  const [enviarNotificacoes, setEnviarNotificacoes] = useState(true);

  // Templates
  const [templates, setTemplates] = useState<MessageTemplate[]>([]);
  const [showTemplateDialog, setShowTemplateDialog] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<MessageTemplate | null>(null);
  const [tNome, setTNome] = useState("");
  const [tTipo, setTTipo] = useState("orcamento");
  const [tConteudo, setTConteudo] = useState("");
  const [tAtivo, setTAtivo] = useState(true);

  const tenantId = getTenantId();

  const isMissingTenantColumnError = (error: { code?: string; message?: string } | null) => {
    if (!error) return false;
    return error.code === "42703" || error.code === "PGRST204" || error.message?.includes("tenant_id") === true;
  };

  const applySettings = (rawSettings: WhatsAppSettings) => {
    setSettings(rawSettings);
    setProvider(rawSettings.provider);
    setEvolutionUrl(rawSettings.evolution_api_url || "");
    setEvolutionKey(rawSettings.evolution_api_key || "");
    setEvolutionInstance(rawSettings.evolution_instance_name || "");
    setTwilioSid(rawSettings.twilio_account_sid || "");
    setTwilioToken(rawSettings.twilio_auth_token || "");
    setTwilioPhone(rawSettings.twilio_phone_number || "");
    setZapiInstanceId(rawSettings.zapi_instance_id || "");
    setZapiToken(rawSettings.zapi_token || "");
    setZapiSecurityToken(rawSettings.zapi_security_token || "");
    setZapiWebhookUrl(rawSettings.zapi_webhook_url || "");
    setZapiClientToken(rawSettings.zapi_client_token || "");
    setAtivo(rawSettings.ativo);
    setEnviarContrato(rawSettings.enviar_contrato);
    setEnviarNotificacoes(rawSettings.enviar_notificacoes);
  };

  const fetchSettings = async () => {
    if (!tenantId) {
      setLoading(false);
      return;
    }

    // Try with tenant_id first, then without if column doesn't exist
    let response = await supabase
      .from("whatsapp_settings")
      .select("*")
      .eq("tenant_id", tenantId)
      .limit(1)
      .maybeSingle();

    if (isMissingTenantColumnError(response.error)) {
      response = await supabase
        .from("whatsapp_settings")
        .select("*")
        .limit(1)
        .maybeSingle();
    }

    if (response.data) {
      applySettings(response.data as unknown as WhatsAppSettings);
      setLoading(false);
      return;
    }

    // No existing record — just finish loading. 
    // The user can fill in the form and we'll upsert on save.
    setLoading(false);
  };

  const fetchTemplates = async () => {
    if (!tenantId) return;
    const { data } = await supabase
      .from("tenant_message_templates" as any)
      .select("*")
      .eq("tenant_id", tenantId)
      .order("created_at", { ascending: false });
    if (data) setTemplates(data as unknown as MessageTemplate[]);
  };

  useEffect(() => {
    fetchSettings();
    fetchTemplates();
  }, []);

  const handleSave = async () => {
    setSaving(true);
    const payload = {
      provider,
      evolution_api_url: evolutionUrl.trim() || null,
      evolution_api_key: evolutionKey.trim() || null,
      evolution_instance_name: evolutionInstance.trim() || null,
      twilio_account_sid: twilioSid.trim() || null,
      twilio_auth_token: twilioToken.trim() || null,
      twilio_phone_number: twilioPhone.trim() || null,
      zapi_instance_id: zapiInstanceId.trim() || null,
      zapi_token: zapiToken.trim() || null,
      zapi_security_token: zapiSecurityToken.trim() || null,
      zapi_webhook_url: zapiWebhookUrl.trim() || null,
      zapi_client_token: zapiClientToken.trim() || null,
      ativo,
      enviar_contrato: enviarContrato,
      enviar_notificacoes: enviarNotificacoes,
    } as any;

    let error: any = null;

    if (settings?.id) {
      // Update existing record
      const res = await supabase
        .from("whatsapp_settings")
        .update(payload)
        .eq("id", settings.id);
      error = res.error;
    } else {
      // No record exists — try to insert
      const res = await supabase
        .from("whatsapp_settings")
        .insert(payload)
        .select("*")
        .single();
      error = res.error;
      if (res.data) {
        applySettings(res.data as unknown as WhatsAppSettings);
      }
    }

    setSaving(false);
    if (error) {
      console.error("WhatsApp save error:", error);
      toast.error("Erro ao salvar configurações. Verifique as permissões do banco.");
    } else {
      toast.success("Configurações do WhatsApp salvas!");
      fetchSettings();
    }
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
        const res = await fetch(url, { headers: { apikey: evolutionKey } });
        if (res.ok) toast.success("Conexão com Evolution API estabelecida!");
        else toast.error(`Erro na conexão: ${res.status} ${res.statusText}`);
      } else if (provider === "twilio") {
        if (!twilioSid || !twilioToken) {
          toast.error("Preencha o Account SID e Auth Token do Twilio");
          setTesting(false);
          return;
        }
        toast.info("Para testar o Twilio, salve as configurações e envie uma mensagem de teste.");
      } else if (provider === "zapi") {
        if (!zapiInstanceId || !zapiToken) {
          toast.error("Preencha o Instance ID e Token do Z-API");
          setTesting(false);
          return;
        }
        if (!zapiClientToken) {
          toast.error("O Client-Token é obrigatório para a Z-API. Copie-o no painel Z-API → Dados da instância web.");
          setTesting(false);
          return;
        }

        const url = `https://api.z-api.io/instances/${zapiInstanceId}/token/${zapiToken}/status`;
        const res = await fetch(url, {
          headers: {
            "Client-Token": zapiClientToken,
            ...(zapiSecurityToken ? { "Security-Token": zapiSecurityToken } : {}),
          },
        });
        const data = await res.json().catch(() => null);

        const status = String(data?.status || "").toLowerCase();
        const connected =
          data?.connected === true ||
          data?.authenticated === true ||
          data?.smartphoneConnected === true ||
          status === "connected" ||
          status === "open";
        const alreadyConnected = typeof data?.error === "string" && data.error.toLowerCase().includes("already connected");

        if (!res.ok || (data?.error && !connected && !alreadyConnected)) {
          const detail = data?.message || data?.error || `${res.status} ${res.statusText}`;
          toast.error(`Erro na conexão Z-API: ${detail}`);
          setTesting(false);
          return;
        }

        if (connected || alreadyConnected) {
          toast.success("Z-API conectada e autenticada!");
        } else {
          toast.warning("Z-API acessível, mas a instância ainda não está conectada. Escaneie o QR Code no painel Z-API.");
        }
      }
    } catch {
      toast.error("Erro ao testar conexão. Verifique as credenciais.");
    }
    setTesting(false);
  };

  // Template CRUD
  const openNewTemplate = () => {
    setEditingTemplate(null);
    setTNome(""); setTTipo("orcamento"); setTConteudo(""); setTAtivo(true);
    setShowTemplateDialog(true);
  };

  const openEditTemplate = (t: MessageTemplate) => {
    setEditingTemplate(t);
    setTNome(t.nome); setTTipo(t.tipo); setTConteudo(t.conteudo); setTAtivo(t.ativo);
    setShowTemplateDialog(true);
  };

  const saveTemplate = async () => {
    if (!tNome.trim() || !tConteudo.trim()) {
      toast.error("Nome e conteúdo são obrigatórios");
      return;
    }
    const payload = { nome: tNome.trim(), tipo: tTipo, conteudo: tConteudo.trim(), ativo: tAtivo, tenant_id: tenantId };
    if (editingTemplate) {
      const { error } = await supabase.from("tenant_message_templates" as any).update(payload as any).eq("id", editingTemplate.id);
      if (error) toast.error("Erro ao atualizar"); else toast.success("Modelo atualizado!");
    } else {
      const { error } = await supabase.from("tenant_message_templates" as any).insert(payload as any);
      if (error) toast.error("Erro ao criar"); else toast.success("Modelo criado!");
    }
    setShowTemplateDialog(false);
    fetchTemplates();
  };

  const deleteTemplate = async (id: string) => {
    if (!confirm("Excluir este modelo?")) return;
    await supabase.from("tenant_message_templates" as any).delete().eq("id", id);
    toast.success("Modelo excluído");
    fetchTemplates();
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
            <Badge variant={ativo ? "default" : "secondary"} className={`gap-1 ${ativo ? "bg-green-600 text-white" : ""}`}>
              {ativo ? <><CheckCircle2 className="h-3 w-3" />Ativo</> : <><XCircle className="h-3 w-3" />Inativo</>}
            </Badge>
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
            <div className="grid grid-cols-3 gap-3">
              <button onClick={() => setProvider("evolution")} className={`p-4 rounded-lg border-2 transition-all text-left ${provider === "evolution" ? "border-primary bg-primary/5" : "border-border hover:border-muted-foreground/30"}`}>
                <p className="font-semibold text-sm text-foreground">Evolution API</p>
                <p className="text-xs text-muted-foreground mt-1">Open-source para WhatsApp</p>
              </button>
              <button onClick={() => setProvider("zapi")} className={`p-4 rounded-lg border-2 transition-all text-left ${provider === "zapi" ? "border-primary bg-primary/5" : "border-border hover:border-muted-foreground/30"}`}>
                <p className="font-semibold text-sm text-foreground">Z-API</p>
                <p className="text-xs text-muted-foreground mt-1">API brasileira estável e confiável</p>
              </button>
              <button onClick={() => setProvider("twilio")} className={`p-4 rounded-lg border-2 transition-all text-left ${provider === "twilio" ? "border-primary bg-primary/5" : "border-border hover:border-muted-foreground/30"}`}>
                <p className="font-semibold text-sm text-foreground">Twilio</p>
                <p className="text-xs text-muted-foreground mt-1">Comunicação em nuvem</p>
              </button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Provider-specific settings */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">
            {provider === "evolution" ? "Evolution API — Credenciais" : provider === "zapi" ? "Z-API — Credenciais" : "Twilio — Credenciais"}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {provider === "evolution" ? (
            <>
              <div>
                <Label>URL da API</Label>
                <Input value={evolutionUrl} onChange={(e) => setEvolutionUrl(e.target.value)} placeholder="https://sua-evolution-api.com" className="mt-1" />
              </div>
              <div>
                <Label>API Key</Label>
                <div className="relative mt-1">
                  <Input type={showEvolutionKey ? "text" : "password"} value={evolutionKey} onChange={(e) => setEvolutionKey(e.target.value)} placeholder="Sua chave de API" className="pr-10" />
                  <button type="button" className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground" onClick={() => setShowEvolutionKey(!showEvolutionKey)}>
                    {showEvolutionKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>
              <div>
                <Label>Nome da Instância</Label>
                <Input value={evolutionInstance} onChange={(e) => setEvolutionInstance(e.target.value)} placeholder="Ex: minha-instancia" className="mt-1" />
              </div>
            </>
          ) : provider === "zapi" ? (
            <>
              <div className="bg-muted/50 rounded-lg p-3 mb-2">
                <p className="text-xs text-muted-foreground flex items-center gap-1.5">
                  <Info className="h-3.5 w-3.5 text-primary flex-shrink-0" />
                  Acesse <strong>painel.z-api.io</strong> para obter suas credenciais. O Instance ID e Token ficam na tela principal da sua instância.
                </p>
              </div>
              <div>
                <Label>Instance ID</Label>
                <Input value={zapiInstanceId} onChange={(e) => setZapiInstanceId(e.target.value)} placeholder="Ex: 3C2A1B4D5E6F7G8H9I0J" className="mt-1" />
                <p className="text-[11px] text-muted-foreground mt-1">Identificador único da sua instância no painel Z-API</p>
              </div>
              <div>
                <Label>Token da Instância</Label>
                <div className="relative mt-1">
                  <Input type={showZapiToken ? "text" : "password"} value={zapiToken} onChange={(e) => setZapiToken(e.target.value)} placeholder="Token de autenticação da instância" className="pr-10" />
                  <button type="button" className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground" onClick={() => setShowZapiToken(!showZapiToken)}>
                    {showZapiToken ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
                <p className="text-[11px] text-muted-foreground mt-1">Token gerado automaticamente pelo Z-API para autenticar requisições</p>
              </div>
              <div>
                <Label>Security Token (Opcional)</Label>
                <div className="relative mt-1">
                  <Input type={showZapiSecurityToken ? "text" : "password"} value={zapiSecurityToken} onChange={(e) => setZapiSecurityToken(e.target.value)} placeholder="Token de segurança para webhooks" className="pr-10" />
                  <button type="button" className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground" onClick={() => setShowZapiSecurityToken(!showZapiSecurityToken)}>
                    {showZapiSecurityToken ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
                <p className="text-[11px] text-muted-foreground mt-1">Token extra para validar webhooks recebidos (recomendado para produção)</p>
              </div>
              <div>
                <Label>Client Token <span className="text-destructive">*</span></Label>
                <Input value={zapiClientToken} onChange={(e) => setZapiClientToken(e.target.value)} placeholder="Token do cliente Z-API (obrigatório)" className="mt-1" />
                <p className="text-[11px] text-muted-foreground mt-1">Obrigatório para autenticar na API. Encontre em painel.z-api.io → Dados da instância web</p>
              </div>
              <Separator />
              <div>
                <Label>URL do Webhook (Recebimento)</Label>
                <Input value={zapiWebhookUrl} onChange={(e) => setZapiWebhookUrl(e.target.value)} placeholder="https://seu-servidor.com/webhook/zapi" className="mt-1" />
                <p className="text-[11px] text-muted-foreground mt-1">URL para onde o Z-API enviará as mensagens recebidas. Configure no painel Z-API → Webhooks</p>
              </div>
            </>
          ) : (
            <>
              <div>
                <Label>Account SID</Label>
                <Input value={twilioSid} onChange={(e) => setTwilioSid(e.target.value)} placeholder="ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx" className="mt-1" />
              </div>
              <div>
                <Label>Auth Token</Label>
                <div className="relative mt-1">
                  <Input type={showTwilioToken ? "text" : "password"} value={twilioToken} onChange={(e) => setTwilioToken(e.target.value)} placeholder="Token de autenticação" className="pr-10" />
                  <button type="button" className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground" onClick={() => setShowTwilioToken(!showTwilioToken)}>
                    {showTwilioToken ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>
              <div>
                <Label>Número de Telefone</Label>
                <Input value={twilioPhone} onChange={(e) => setTwilioPhone(e.target.value)} placeholder="+5511999999999" className="mt-1" />
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {/* Features toggle */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Funcionalidades</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <Label>Enviar Contrato por WhatsApp</Label>
              <p className="text-xs text-muted-foreground">Após fechar venda, oferecer opção de enviar o contrato PDF ao cliente</p>
            </div>
            <Switch checked={enviarContrato} onCheckedChange={setEnviarContrato} />
          </div>
          <Separator />
          <div className="flex items-center justify-between">
            <div>
              <Label>Notificações Automáticas</Label>
              <p className="text-xs text-muted-foreground">Enviar alertas de orçamento criado, vencimento próximo, etc.</p>
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

      <Separator className="my-8" />

      {/* Webhook Bot Configuration */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Bot className="h-5 w-5 text-primary" />
            Webhook do Bot de Captação
          </CardTitle>
          <p className="text-xs text-muted-foreground">
            Configure o webhook para receber mensagens do WhatsApp automaticamente e qualificar leads.
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <Label className="text-xs font-medium text-muted-foreground">URL do Webhook (copie e cole no seu provedor)</Label>
            <div className="flex gap-2 mt-1">
              <Input
                readOnly
                value={`${window.location.origin.replace('localhost:8080', 'bdhfzjuwtkiexyeusnqq.supabase.co')}/functions/v1/whatsapp-bot`}
                className="font-mono text-xs bg-muted"
              />
              <Button variant="outline" size="sm" className="gap-1.5 shrink-0" onClick={() => {
                navigator.clipboard.writeText(`${window.location.origin.replace('localhost:8080', 'bdhfzjuwtkiexyeusnqq.supabase.co')}/functions/v1/whatsapp-bot`);
                toast.success("URL copiada!");
              }}>
                <Copy className="h-3.5 w-3.5" /> Copiar
              </Button>
            </div>
          </div>

          <div className="bg-muted/50 rounded-lg p-4 space-y-3">
            <h4 className="text-sm font-medium flex items-center gap-1.5"><Info className="h-4 w-4 text-primary" /> Como integrar</h4>
            <ol className="space-y-2 text-xs text-muted-foreground">
              <li className="flex gap-2">
                <span className="flex-shrink-0 h-5 w-5 rounded-full bg-primary/10 text-primary text-[10px] flex items-center justify-center font-bold">1</span>
                <span><strong>Evolution API:</strong> Vá em Configurações da Instância → Webhook → Cole a URL acima → Ative eventos de mensagem recebida</span>
              </li>
              <li className="flex gap-2">
                <span className="flex-shrink-0 h-5 w-5 rounded-full bg-primary/10 text-primary text-[10px] flex items-center justify-center font-bold">2</span>
                <span><strong>Twilio:</strong> Vá no Console Twilio → Messaging → Settings → Webhook URL → Cole a URL acima como "When a message comes in"</span>
              </li>
              <li className="flex gap-2">
                <span className="flex-shrink-0 h-5 w-5 rounded-full bg-primary/10 text-primary text-[10px] flex items-center justify-center font-bold">3</span>
                <span>Adicione o parâmetro <code className="bg-muted px-1 rounded">tenant_id</code> no body ou configure no painel do provedor para identificar sua loja</span>
              </li>
              <li className="flex gap-2">
                <span className="flex-shrink-0 h-5 w-5 rounded-full bg-primary/10 text-primary text-[10px] flex items-center justify-center font-bold">4</span>
                <span>O bot irá automaticamente: perguntar nome → ambiente → orçamento → salvar como lead qualificado</span>
              </li>
            </ol>
          </div>

          <div className="bg-primary/5 rounded-lg p-3">
            <p className="text-xs text-muted-foreground">
              <strong>Payload esperado (JSON):</strong>
            </p>
            <pre className="text-[10px] font-mono mt-1 text-muted-foreground overflow-x-auto">{`{
  "phone": "5511999999999",
  "message": "Olá, quero um orçamento",
  "tenant_id": "${tenantId || 'SEU_TENANT_ID'}"
}`}</pre>
          </div>
        </CardContent>
      </Card>

      <Separator className="my-8" />

      {/* Instance Manager */}
      {provider === "evolution" && (
        <WhatsAppInstanceManager tenantId={tenantId} />
      )}

      <Separator className="my-8" />

      {/* Bot Monitor */}
      <div>
        <h3 className="text-base font-semibold mb-4 flex items-center gap-2">
          <Bot className="h-5 w-5 text-primary" /> Monitoramento do Bot
        </h3>
        <WhatsAppBotMonitor />
      </div>

      <Separator className="my-8" />

      {/* Message Templates */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base flex items-center gap-2">
              <MessageSquare className="h-5 w-5 text-primary" />
              Modelos de Mensagens para Clientes
            </CardTitle>
            <Button size="sm" onClick={openNewTemplate} className="gap-2">
              <Plus className="h-3 w-3" /> Novo Modelo
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            Crie modelos de mensagens para orçamentos, contratos e comunicações com clientes.
            Variáveis: {"{nome_cliente}"}, {"{valor}"}, {"{data}"}, {"{numero_orcamento}"}
          </p>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nome</TableHead>
                <TableHead>Tipo</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="w-24">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {templates.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={4} className="text-center text-muted-foreground py-6">
                    Nenhum modelo criado. Crie modelos para agilizar o envio de mensagens.
                  </TableCell>
                </TableRow>
              ) : templates.map((t) => (
                <TableRow key={t.id}>
                  <TableCell className="font-medium">{t.nome}</TableCell>
                  <TableCell>
                    <Badge variant="outline">{TEMPLATE_TYPES.find((tt) => tt.value === t.tipo)?.label || t.tipo}</Badge>
                  </TableCell>
                  <TableCell>
                    <Badge variant={t.ativo ? "default" : "secondary"}>{t.ativo ? "Ativo" : "Inativo"}</Badge>
                  </TableCell>
                  <TableCell>
                    <div className="flex gap-1">
                      <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEditTemplate(t)}>
                        <Edit className="h-3 w-3" />
                      </Button>
                      <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => deleteTemplate(t.id)}>
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Template Dialog */}
      <Dialog open={showTemplateDialog} onOpenChange={setShowTemplateDialog}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{editingTemplate ? "Editar Modelo" : "Novo Modelo de Mensagem"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Nome do Modelo</Label>
              <Input value={tNome} onChange={(e) => setTNome(e.target.value)} placeholder="Ex: Envio de Orçamento" className="mt-1" />
            </div>
            <div>
              <Label>Tipo</Label>
              <Select value={tTipo} onValueChange={setTTipo}>
                <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {TEMPLATE_TYPES.map((tt) => (
                    <SelectItem key={tt.value} value={tt.value}>{tt.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Conteúdo da Mensagem</Label>
              <p className="text-xs text-muted-foreground mb-1">
                Use variáveis: {"{nome_cliente}"}, {"{valor}"}, {"{data}"}, {"{numero_orcamento}"}
              </p>
              <Textarea
                value={tConteudo}
                onChange={(e) => setTConteudo(e.target.value)}
                placeholder={`Olá {nome_cliente}! 👋\n\nSegue seu orçamento nº {numero_orcamento}:\n💰 Valor: {valor}\n📅 Validade: {data}\n\nDúvidas? Estamos à disposição!`}
                rows={8}
                className="mt-1"
              />
            </div>
            <div className="flex items-center gap-3">
              <Switch checked={tAtivo} onCheckedChange={setTAtivo} />
              <Label>Modelo ativo</Label>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowTemplateDialog(false)}>Cancelar</Button>
            <Button onClick={saveTemplate}>Salvar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
