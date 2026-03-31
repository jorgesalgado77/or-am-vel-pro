import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/lib/supabaseClient";
import { toast } from "sonner";
import {
  Save, Eye, EyeOff, MessageSquare, CheckCircle2, XCircle,
  Plus, Trash2, Edit, Send, Wifi, WifiOff,
} from "lucide-react";

type WhatsAppProvider = "evolution" | "twilio" | "zapi";

const ZAPI_PROVIDER_KEY = "zapi_whatsapp_master";

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

interface MessageTemplate {
  id: string;
  nome: string;
  tipo: string;
  conteudo: string;
  ativo: boolean;
  created_at: string;
}

const TEMPLATE_TYPES = [
  { value: "boas_vindas", label: "Boas-vindas" },
  { value: "credenciais", label: "Credenciais de Acesso" },
  { value: "suporte", label: "Suporte Técnico" },
  { value: "notificacao", label: "Notificação" },
  { value: "orcamento", label: "Orçamento" },
  { value: "cobranca", label: "Cobrança" },
  { value: "outro", label: "Outro" },
];

export function AdminWhatsAppConfig() {
  const [settings, setSettings] = useState<WhatsAppSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [showEvolutionKey, setShowEvolutionKey] = useState(false);
  const [showTwilioToken, setShowTwilioToken] = useState(false);
  const [showZapiSecurityToken, setShowZapiSecurityToken] = useState(false);
  const [showZapiToken, setShowZapiToken] = useState(false);
  const [showZapiClientToken, setShowZapiClientToken] = useState(false);

  // Form state
  const [provider, setProvider] = useState<WhatsAppProvider>("evolution");
  const [evolutionUrl, setEvolutionUrl] = useState("");
  const [evolutionKey, setEvolutionKey] = useState("");
  const [evolutionInstance, setEvolutionInstance] = useState("");
  const [twilioSid, setTwilioSid] = useState("");
  const [twilioToken, setTwilioToken] = useState("");
  const [twilioPhone, setTwilioPhone] = useState("");
  const [zapiInstanceId, setZapiInstanceId] = useState("");
  const [zapiToken, setZapiToken] = useState("");
  const [zapiClientToken, setZapiClientToken] = useState("");
  const [zapiSecurityToken, setZapiSecurityToken] = useState("");
  const [zapiWebhookUrl, setZapiWebhookUrl] = useState("");
  const [ativo, setAtivo] = useState(false);
  const [enviarContrato, setEnviarContrato] = useState(true);
  const [enviarNotificacoes, setEnviarNotificacoes] = useState(true);

  // Templates
  const [templates, setTemplates] = useState<MessageTemplate[]>([]);
  const [showTemplateDialog, setShowTemplateDialog] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<MessageTemplate | null>(null);
  const [tNome, setTNome] = useState("");
  const [tTipo, setTTipo] = useState("boas_vindas");
  const [tConteudo, setTConteudo] = useState("");
  const [tAtivo, setTAtivo] = useState(true);

  // Test message
  const [testPhone, setTestPhone] = useState("");
  const [sendingTest, setSendingTest] = useState(false);
  const [connectionTestLog, setConnectionTestLog] = useState("");

  const fetchSettings = async () => {
    const { data } = await supabase
      .from("admin_whatsapp_settings" as any)
      .select("*")
      .limit(1)
      .maybeSingle();

    if (data) {
      const s = data as unknown as WhatsAppSettings;
      setSettings(s);
      setProvider((s.provider as WhatsAppProvider) || "evolution");
      setEvolutionUrl(s.evolution_api_url || "");
      setEvolutionKey(s.evolution_api_key || "");
      setEvolutionInstance(s.evolution_instance_name || "");
      setTwilioSid(s.twilio_account_sid || "");
      setTwilioToken(s.twilio_auth_token || "");
      setTwilioPhone(s.twilio_phone_number || "");
      setAtivo(s.ativo);
      setEnviarContrato(s.enviar_contrato);
      setEnviarNotificacoes(s.enviar_notificacoes);
    } else {
      const { data: created } = await supabase
        .from("admin_whatsapp_settings" as any)
        .insert({} as any)
        .select("*")
        .single();
      if (created) setSettings(created as unknown as WhatsAppSettings);
    }
    setLoading(false);
  };

  const fetchZapiConfig = async () => {
    const { data } = await (supabase as any)
      .from("dealroom_api_configs")
      .select("credenciais, configuracoes, is_active")
      .eq("provider", ZAPI_PROVIDER_KEY)
      .limit(1)
      .maybeSingle();

    if (!data) return;
    const cred = (data.credenciais || {}) as Record<string, string>;
    const cfg = (data.configuracoes || {}) as Record<string, string>;

    setZapiInstanceId(cred.instance_id || "");
    setZapiToken(cred.instance_token || "");
    setZapiClientToken(cred.client_token || "");
    setZapiSecurityToken(cred.security_token || "");
    setZapiWebhookUrl(cfg.webhook_url || "");
    if (data.is_active) setAtivo(true);
  };

  const fetchTemplates = async () => {
    const { data } = await supabase
      .from("admin_message_templates" as any)
      .select("*")
      .order("created_at", { ascending: false });
    if (data) setTemplates(data as unknown as MessageTemplate[]);
  };

  useEffect(() => {
    fetchSettings();
    fetchTemplates();
    fetchZapiConfig();
  }, []);

  const handleSave = async () => {
    if (!settings) return;
    setSaving(true);
    const { error } = await supabase
      .from("admin_whatsapp_settings" as any)
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

    if (!error && provider === "zapi") {
      try {
        await saveZapiProviderConfig();
      } catch (syncError: any) {
        toast.error("Configuração salva, mas falhou ao sincronizar Z-API: " + (syncError?.message || "erro desconhecido"));
      }
    }

    setSaving(false);
    if (error) toast.error("Erro ao salvar configurações");
    else {
      toast.success("Configurações salvas!");
      fetchZapiConfig();
      fetchSettings();
    }
  };

  const handleTestConnection = async () => {
    setTesting(true);
    setConnectionTestLog("");
    try {
      if (provider === "evolution") {
        if (!evolutionUrl || !evolutionKey) {
          toast.error("Preencha a URL e API Key da Evolution API");
          setTesting(false);
          return;
        }
        const url = `${evolutionUrl.replace(/\/$/, "")}/instance/fetchInstances`;
        const res = await fetch(url, { headers: { apikey: evolutionKey } });
        setConnectionTestLog(`[${res.status}] ${res.statusText} - ${url}`);
        if (res.ok) toast.success("Conexão com Evolution API estabelecida!");
        else toast.error(`Erro na conexão: ${res.status} ${res.statusText}`);
      } else if (provider === "twilio") {
        if (!twilioSid || !twilioToken) {
          toast.error("Preencha o Account SID e Auth Token do Twilio");
          setTesting(false);
          return;
        }
        setConnectionTestLog("Twilio: use o botão 'Enviar Teste' para validar envio.");
        toast.info("Para testar o Twilio, use o botão 'Enviar Mensagem de Teste'.");
      } else {
        if (!zapiInstanceId || !zapiToken || !zapiClientToken) {
          toast.error("Preencha Instância, Token e Client Token da Z-API");
          setTesting(false);
          return;
        }

        const statusUrl = `https://api.z-api.io/instances/${zapiInstanceId.trim()}/token/${zapiToken.trim()}/status`;
        const res = await fetch(statusUrl, {
          method: "GET",
          headers: {
            "Client-Token": zapiClientToken.trim(),
            ...(zapiSecurityToken.trim() ? { "Security-Token": zapiSecurityToken.trim() } : {}),
          },
        });

        const payload = await res.json().catch(() => null);
        const statusText = String(payload?.status || payload?.state || "").toLowerCase();
        const isConnected =
          payload?.connected === true ||
          payload?.smartphoneConnected === true ||
          statusText === "connected" ||
          statusText === "open";

        setConnectionTestLog(`[${res.status}] ${res.statusText || "sem status"} - ${statusUrl} :: ${JSON.stringify(payload || {})}`);
        if (res.ok || isConnected) toast.success("Conexão com Z-API estabelecida!");
        else toast.error("Falha ao conectar na Z-API. Verifique Instância, Token e Client Token.");
      }
    } catch {
      toast.error("Erro ao testar conexão. Verifique a URL e credenciais.");
    }
    setTesting(false);
  };

  const handleSendTestMessage = async () => {
    if (!testPhone.replace(/\D/g, "")) {
      toast.error("Informe um número de telefone para teste");
      return;
    }
    setSendingTest(true);
    try {
      if (provider === "evolution" && evolutionUrl && evolutionKey && evolutionInstance) {
        const url = `${evolutionUrl.replace(/\/$/, "")}/message/sendText/${evolutionInstance}`;
        const res = await fetch(url, {
          method: "POST",
          headers: { apikey: evolutionKey, "Content-Type": "application/json" },
          body: JSON.stringify({
            number: "55" + testPhone.replace(/\D/g, ""),
            text: "✅ Mensagem de teste - OrçaMóvel PRO Admin Master",
          }),
        });
        if (res.ok) toast.success("Mensagem de teste enviada!");
        else toast.error("Erro ao enviar mensagem de teste");
      } else if (provider === "zapi" && zapiInstanceId && zapiToken && zapiClientToken) {
        const url = `https://api.z-api.io/instances/${zapiInstanceId.trim()}/token/${zapiToken.trim()}/send-text`;
        const res = await fetch(url, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Client-Token": zapiClientToken.trim(),
            ...(zapiSecurityToken.trim() ? { "Security-Token": zapiSecurityToken.trim() } : {}),
          },
          body: JSON.stringify({
            phone: "55" + testPhone.replace(/\D/g, ""),
            message: "✅ Mensagem de teste - OrçaMóvel PRO Admin Master",
          }),
        });

        if (res.ok) toast.success("Mensagem de teste enviada via Z-API!");
        else toast.error("Erro ao enviar mensagem de teste via Z-API");
      } else {
        toast.error("Configure as credenciais do provedor primeiro");
      }
    } catch {
      toast.error("Erro ao enviar mensagem");
    }
    setSendingTest(false);
  };

  const saveZapiProviderConfig = async () => {
    const payload = {
      provider: ZAPI_PROVIDER_KEY,
      nome: "Z-API WhatsApp",
      categoria: "whatsapp",
      credenciais: {
        instance_id: zapiInstanceId.trim(),
        instance_token: zapiToken.trim(),
        client_token: zapiClientToken.trim(),
        security_token: zapiSecurityToken.trim(),
      },
      configuracoes: {
        webhook_url: (zapiWebhookUrl.trim() || `https://bdhfzjuwtkiexyeusnqq.supabase.co/functions/v1/whatsapp-webhook`),
      },
      is_active: ativo,
      updated_at: new Date().toISOString(),
      created_by: "admin_master",
    };

    const { error } = await (supabase as any)
      .from("dealroom_api_configs")
      .upsert(payload, { onConflict: "provider" });

    if (error) throw new Error(error.message);
  };

  // Template CRUD
  const openNewTemplate = () => {
    setEditingTemplate(null);
    setTNome("");
    setTTipo("boas_vindas");
    setTConteudo("");
    setTAtivo(true);
    setShowTemplateDialog(true);
  };

  const openEditTemplate = (t: MessageTemplate) => {
    setEditingTemplate(t);
    setTNome(t.nome);
    setTTipo(t.tipo);
    setTConteudo(t.conteudo);
    setTAtivo(t.ativo);
    setShowTemplateDialog(true);
  };

  const saveTemplate = async () => {
    if (!tNome.trim() || !tConteudo.trim()) {
      toast.error("Nome e conteúdo são obrigatórios");
      return;
    }
    const payload = { nome: tNome.trim(), tipo: tTipo, conteudo: tConteudo.trim(), ativo: tAtivo };
    if (editingTemplate) {
      const { error } = await supabase
        .from("admin_message_templates" as any)
        .update(payload as any)
        .eq("id", editingTemplate.id);
      if (error) toast.error("Erro ao atualizar template");
      else toast.success("Template atualizado!");
    } else {
      const { error } = await supabase
        .from("admin_message_templates" as any)
        .insert(payload as any);
      if (error) toast.error("Erro ao criar template");
      else toast.success("Template criado!");
    }
    setShowTemplateDialog(false);
    fetchTemplates();
  };

  const deleteTemplate = async (id: string) => {
    if (!confirm("Excluir este template?")) return;
    await supabase.from("admin_message_templates" as any).delete().eq("id", id);
    toast.success("Template excluído");
    fetchTemplates();
  };

  if (loading) {
    return <p className="text-sm text-muted-foreground text-center py-8">Carregando...</p>;
  }

  return (
    <div className="space-y-6">
      {/* Provider & Connection */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base flex items-center gap-2">
              <MessageSquare className="h-5 w-5 text-primary" />
              Configuração do WhatsApp — Admin Master
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
              <button
                onClick={() => setProvider("evolution")}
                className={`p-4 rounded-lg border-2 transition-all text-left ${
                  provider === "evolution" ? "border-primary bg-primary/5" : "border-border hover:border-muted-foreground/30"
                }`}
              >
                <p className="font-semibold text-sm text-foreground">Evolution API</p>
                <p className="text-xs text-muted-foreground mt-1">API gratuita e open-source</p>
              </button>
              <button
                onClick={() => setProvider("zapi")}
                className={`p-4 rounded-lg border-2 transition-all text-left ${
                  provider === "zapi" ? "border-primary bg-primary/5" : "border-border hover:border-muted-foreground/30"
                }`}
              >
                <p className="font-semibold text-sm text-foreground">Z-API</p>
                <p className="text-xs text-muted-foreground mt-1">Oficial Z-API (instância + token)</p>
              </button>
              <button
                onClick={() => setProvider("twilio")}
                className={`p-4 rounded-lg border-2 transition-all text-left ${
                  provider === "twilio" ? "border-primary bg-primary/5" : "border-border hover:border-muted-foreground/30"
                }`}
              >
                <p className="font-semibold text-sm text-foreground">Twilio</p>
                <p className="text-xs text-muted-foreground mt-1">Plataforma em nuvem</p>
              </button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Credentials */}
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
              <div>
                <Label>Instância</Label>
                <Input value={zapiInstanceId} onChange={(e) => setZapiInstanceId(e.target.value)} placeholder="Ex: ORCA" className="mt-1" />
              </div>
              <div>
                <Label>Token</Label>
                <div className="relative mt-1">
                  <Input type={showZapiToken ? "text" : "password"} value={zapiToken} onChange={(e) => setZapiToken(e.target.value)} placeholder="Token da instância" className="pr-10" />
                  <button type="button" className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground" onClick={() => setShowZapiToken(!showZapiToken)}>
                    {showZapiToken ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>
              <div>
                <Label>Client Token</Label>
                <div className="relative mt-1">
                  <Input type={showZapiClientToken ? "text" : "password"} value={zapiClientToken} onChange={(e) => setZapiClientToken(e.target.value)} placeholder="Client-Token" className="pr-10" />
                  <button type="button" className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground" onClick={() => setShowZapiClientToken(!showZapiClientToken)}>
                    {showZapiClientToken ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>
              <div>
                <Label>Security Token (opcional)</Label>
                <div className="relative mt-1">
                  <Input type={showZapiSecurityToken ? "text" : "password"} value={zapiSecurityToken} onChange={(e) => setZapiSecurityToken(e.target.value)} placeholder="Security-Token" className="pr-10" />
                  <button type="button" className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground" onClick={() => setShowZapiSecurityToken(!showZapiSecurityToken)}>
                    {showZapiSecurityToken ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>
              <div>
                <Label>Webhook URL</Label>
                <Input value={zapiWebhookUrl} onChange={(e) => setZapiWebhookUrl(e.target.value)} placeholder="https://.../functions/v1/whatsapp-webhook" className="mt-1" />
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

      {/* Test connection & send */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Wifi className="h-4 w-4" /> Teste de Conexão e Envio
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex gap-3">
            <Button variant="outline" onClick={handleTestConnection} disabled={testing} className="gap-2">
              {testing ? <WifiOff className="h-4 w-4 animate-pulse" /> : <Wifi className="h-4 w-4" />}
              {testing ? "Testando..." : "Testar Conexão"}
            </Button>
          </div>
          {provider === "zapi" && (
            <div>
              <Label>Log do teste Z-API</Label>
              <Textarea
                value={connectionTestLog}
                readOnly
                placeholder="Clique em 'Testar Conexão' para ver o retorno do endpoint de status."
                rows={7}
                className="mt-1 font-mono text-xs"
              />
            </div>
          )}
          <Separator />
          <div>
            <Label>Enviar Mensagem de Teste</Label>
            <p className="text-xs text-muted-foreground mb-2">Informe um número para receber a mensagem de teste</p>
            <div className="flex gap-2">
              <Input
                value={testPhone}
                onChange={(e) => setTestPhone(e.target.value)}
                placeholder="(99) 99999-9999"
                className="max-w-xs"
              />
              <Button onClick={handleSendTestMessage} disabled={sendingTest} className="gap-2">
                <Send className="h-4 w-4" />
                {sendingTest ? "Enviando..." : "Enviar Teste"}
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Features */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Funcionalidades Automáticas</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <Label>Enviar boas-vindas para novas contas</Label>
              <p className="text-xs text-muted-foreground">Ao criar uma nova conta, envia automaticamente as credenciais via WhatsApp</p>
            </div>
            <Switch checked={enviarNotificacoes} onCheckedChange={setEnviarNotificacoes} />
          </div>
          <Separator />
          <div className="flex items-center justify-between">
            <div>
              <Label>Enviar contratos por WhatsApp</Label>
              <p className="text-xs text-muted-foreground">Oferecer envio do contrato PDF ao cliente</p>
            </div>
            <Switch checked={enviarContrato} onCheckedChange={setEnviarContrato} />
          </div>
        </CardContent>
      </Card>

      {/* Save */}
      <div className="flex justify-end">
        <Button onClick={handleSave} disabled={saving} className="gap-2">
          <Save className="h-4 w-4" />
          {saving ? "Salvando..." : "Salvar Configurações"}
        </Button>
      </div>

      <Separator className="my-8" />

      {/* Message Templates */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base flex items-center gap-2">
              <MessageSquare className="h-5 w-5 text-primary" />
              Modelos de Mensagens Pré-definidos
            </CardTitle>
            <Button size="sm" onClick={openNewTemplate} className="gap-2">
              <Plus className="h-3 w-3" /> Novo Modelo
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            Crie modelos de mensagens para suporte técnico, boas-vindas e comunicações com usuários.
            Variáveis disponíveis: {"{nome}"}, {"{codigo_loja}"}, {"{email}"}, {"{senha}"}
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
                    Nenhum modelo criado. Crie o primeiro modelo de mensagem.
                  </TableCell>
                </TableRow>
              ) : (
                templates.map((t) => (
                  <TableRow key={t.id}>
                    <TableCell className="font-medium">{t.nome}</TableCell>
                    <TableCell>
                      <Badge variant="outline">
                        {TEMPLATE_TYPES.find((tt) => tt.value === t.tipo)?.label || t.tipo}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Badge variant={t.ativo ? "default" : "secondary"}>
                        {t.ativo ? "Ativo" : "Inativo"}
                      </Badge>
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
                ))
              )}
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
              <Input value={tNome} onChange={(e) => setTNome(e.target.value)} placeholder="Ex: Boas-vindas ao sistema" className="mt-1" />
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
                Use variáveis: {"{nome}"}, {"{codigo_loja}"}, {"{email}"}, {"{senha}"}
              </p>
              <Textarea
                value={tConteudo}
                onChange={(e) => setTConteudo(e.target.value)}
                placeholder={`Olá {nome}! 👋\n\nBem-vindo ao OrçaMóvel PRO!\n\n🏪 Código da Loja: {codigo_loja}\n👤 Usuário: {email}\n🔑 Senha: {senha}\n\nAcesse: https://seusite.com`}
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
