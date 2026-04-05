import { useState, useEffect } from "react";
import { addDays, format } from "date-fns";
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
  Save, Eye, EyeOff, Mail, CheckCircle2, XCircle,
  Plus, Trash2, Edit, Send, Share2,
} from "lucide-react";

interface ResendSettings {
  id: string;
  api_key: string | null;
  from_email: string | null;
  from_name: string | null;
  ativo: boolean;
}

interface EmailTemplate {
  id: string;
  nome: string;
  assunto: string;
  conteudo: string;
  tipo: string;
  ativo: boolean;
  created_at: string;
}

const EMAIL_TYPES = [
  { value: "comunicado", label: "Comunicado" },
  { value: "atualizacao", label: "Atualização do Sistema" },
  { value: "cobranca", label: "Cobrança" },
  { value: "suporte", label: "Suporte Técnico" },
  { value: "boas_vindas", label: "Boas-vindas" },
  { value: "outro", label: "Outro" },
];

const RESEND_MASTER_PROVIDER_KEY = "resend_master";

export function AdminResendConfig() {
  const [settings, setSettings] = useState<ResendSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showApiKey, setShowApiKey] = useState(false);

  const [apiKey, setApiKey] = useState("");
  const [fromEmail, setFromEmail] = useState("");
  const [fromName, setFromName] = useState("");
  const [ativo, setAtivo] = useState(false);

  const [templates, setTemplates] = useState<EmailTemplate[]>([]);
  const [showTemplateDialog, setShowTemplateDialog] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<EmailTemplate | null>(null);
  const [tNome, setTNome] = useState("");
  const [tAssunto, setTAssunto] = useState("");
  const [tConteudo, setTConteudo] = useState("");
  const [tTipo, setTTipo] = useState("comunicado");
  const [tAtivo, setTAtivo] = useState(true);

  const [testEmail, setTestEmail] = useState("");
  const [sendingTest, setSendingTest] = useState(false);

  // Sharing state
  interface TenantRow { id: string; nome_loja: string; codigo_loja: string | null; ativo: boolean; }
  interface ShareRow { id: string; config_id: string; tenant_id: string; starts_at: string; ends_at: string; is_active: boolean; }
  const [tenants, setTenants] = useState<TenantRow[]>([]);
  const [shares, setShares] = useState<ShareRow[]>([]);
  const [shareDialogOpen, setShareDialogOpen] = useState(false);
  const [shareTenantId, setShareTenantId] = useState("");
  const [shareStartsAt, setShareStartsAt] = useState("");
  const [shareEndsAt, setShareEndsAt] = useState("");
  const [shareSaving, setShareSaving] = useState(false);

  const getFunctionErrorMessage = async (error: unknown) => {
    const fallback = error instanceof Error ? error.message : "Erro desconhecido";
    const response = (error as { context?: { clone?: () => { json: () => Promise<any> }; json?: () => Promise<any> } })?.context;

    if (!response) return fallback;

    try {
      const readableResponse = typeof response.clone === "function" ? response.clone() : response;
      const payload = await readableResponse.json?.();
      return payload?.error || payload?.message || fallback;
    } catch {
      return fallback;
    }
  };

  const applySettings = (s: ResendSettings | null) => {
    setSettings(s);
    setApiKey(s?.api_key || "");
    setFromEmail(s?.from_email || "");
    setFromName(s?.from_name || "");
    setAtivo(s?.ativo || false);
  };

  const fetchSettings = async () => {
    try {
      const { data: configData } = await (supabase as any)
        .from("dealroom_api_configs")
        .select("id, credenciais, configuracoes, is_active")
        .eq("provider", RESEND_MASTER_PROVIDER_KEY)
        .limit(1)
        .maybeSingle();

      if (configData) {
        const credenciais = (configData.credenciais || {}) as Record<string, string>;
        const configuracoes = (configData.configuracoes || {}) as Record<string, string>;
        applySettings({
          id: configData.id,
          api_key: credenciais.api_key || null,
          from_email: configuracoes.from_email || null,
          from_name: configuracoes.from_name || null,
          ativo: Boolean(configData.is_active),
        });
        setLoading(false);
        return;
      }

      const { data: legacyData } = await supabase
        .from("admin_resend_settings" as any)
        .select("*")
        .limit(1)
        .maybeSingle();

      if (legacyData) {
        applySettings(legacyData as unknown as ResendSettings);
      } else {
        applySettings(null);
      }
    } catch (e) {
      console.error("Erro ao buscar settings:", e);
      applySettings(null);
    }
    setLoading(false);
  };

  const fetchTemplates = async () => {
    const { data } = await supabase
      .from("admin_email_templates" as any)
      .select("*")
      .order("created_at", { ascending: false });
    if (data) setTemplates(data as unknown as EmailTemplate[]);
  };

  useEffect(() => {
    fetchSettings();
    fetchTemplates();
  }, []);

  const persistResendSettings = async (forceActive = ativo) => {
    const trimmedApiKey = apiKey.trim();
    const trimmedFromEmail = fromEmail.trim();
    const trimmedFromName = fromName.trim();

    const payload = {
      provider: RESEND_MASTER_PROVIDER_KEY,
      nome: "Resend Admin Master",
      categoria: "email",
      credenciais: {
        api_key: trimmedApiKey,
      },
      configuracoes: {
        from_email: trimmedFromEmail,
        from_name: trimmedFromName,
      },
      is_active: forceActive,
      updated_at: new Date().toISOString(),
      created_by: "admin_master",
    };

    const { data, error } = await (supabase as any)
      .from("dealroom_api_configs")
      .upsert(payload, { onConflict: "provider" })
      .select("id, credenciais, configuracoes, is_active")
      .single();

    if (error) return { data: null, error };

    const credenciais = (data?.credenciais || {}) as Record<string, string>;
    const configuracoes = (data?.configuracoes || {}) as Record<string, string>;

    const nextSettings = {
      id: data.id,
      api_key: credenciais.api_key || null,
      from_email: configuracoes.from_email || null,
      from_name: configuracoes.from_name || null,
      ativo: Boolean(data.is_active),
    };

    applySettings(nextSettings);
    return { data: nextSettings, error: null };
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const { error } = await persistResendSettings(ativo);

      if (error) {
        toast.error("Erro ao salvar configurações: " + error.message);
      } else {
        toast.success("Configurações do Resend salvas!");
      }
    } catch (e: any) {
      toast.error("Erro ao salvar: " + (e.message || "Erro desconhecido"));
    }
    setSaving(false);
  };

  const invokeResendAdminTest = async (body: Record<string, unknown>) => {
    return supabase.functions.invoke("resend-email", { body });
  };

  const handleSendTest = async () => {
    if (!testEmail.trim()) {
      toast.error("Informe um email de destino");
      return;
    }

    const effectiveApiKey = apiKey.trim() || settings?.api_key || "";
    if (!effectiveApiKey) {
      toast.error("Configure a API Key do Resend antes de enviar um teste.");
      return;
    }

    if (!ativo) {
      toast.error("Ative a integração do Resend antes de enviar um teste.");
      return;
    }

    setSendingTest(true);
    try {
      const effectiveFromEmail = fromEmail.trim() || settings?.from_email || "noreply@resend.dev";
      const effectiveFromName = fromName.trim() || settings?.from_name || "OrçaMóvel PRO";

      const { error: persistError } = await persistResendSettings(true);
      if (persistError) {
        toast.error("Erro ao preparar configurações para o teste: " + persistError.message);
        return;
      }

      const { data: verifyData, error: verifyError } = await invokeResendAdminTest({
        action: "verify",
        _temp_key: effectiveApiKey,
        api_key: effectiveApiKey,
        resend_api_key: effectiveApiKey,
      });

      if (verifyError) {
        const message = await getFunctionErrorMessage(verifyError);
        toast.error("Erro ao validar API Key: " + message);
        return;
      }

      if (!verifyData?.success) {
        toast.error("API Key inválida ou sem acesso aos domínios do Resend.");
        return;
      }

      const { data, error } = await invokeResendAdminTest({
        action: "send",
        _temp_key: effectiveApiKey,
        api_key: effectiveApiKey,
        resend_api_key: effectiveApiKey,
        to: testEmail.trim(),
        subject: "Email de Teste — OrçaMóvel PRO",
        html: `<div style="font-family:Arial,sans-serif;padding:24px;max-width:480px;margin:auto;">
            <h2 style="color:#0f766e;">✅ Email de Teste</h2>
            <p>Este é um email de teste enviado pelo painel do Administrador Master.</p>
            <p style="color:#6b7280;font-size:13px;">Se você recebeu este email, a integração com o Resend está funcionando corretamente.</p>
            <hr style="border:none;border-top:1px solid #e5e7eb;margin:20px 0;" />
            <p style="color:#9ca3af;font-size:12px;">${effectiveFromName}</p>
          </div>`,
        from: `${effectiveFromName} <${effectiveFromEmail}>`,
      });

      if (error) {
        const message = await getFunctionErrorMessage(error);
        toast.error("Erro ao enviar email de teste: " + message);
      } else if (data?.success) {
        toast.success("Email de teste enviado com sucesso para " + testEmail.trim());
      } else {
        toast.error("Falha ao enviar: " + (data?.error || "Erro desconhecido"));
      }
    } catch (err: any) {
      toast.error("Erro ao enviar email de teste: " + (err.message || "Erro desconhecido"));
    } finally {
      setSendingTest(false);
    }
  };

  const openNewTemplate = () => {
    setEditingTemplate(null);
    setTNome("");
    setTAssunto("");
    setTConteudo("");
    setTTipo("comunicado");
    setTAtivo(true);
    setShowTemplateDialog(true);
  };

  const openEditTemplate = (t: EmailTemplate) => {
    setEditingTemplate(t);
    setTNome(t.nome);
    setTAssunto(t.assunto);
    setTConteudo(t.conteudo);
    setTTipo(t.tipo);
    setTAtivo(t.ativo);
    setShowTemplateDialog(true);
  };

  const saveTemplate = async () => {
    if (!tNome.trim() || !tAssunto.trim() || !tConteudo.trim()) {
      toast.error("Nome, assunto e conteúdo são obrigatórios");
      return;
    }

    const payload = {
      nome: tNome.trim(),
      assunto: tAssunto.trim(),
      conteudo: tConteudo.trim(),
      tipo: tTipo,
      ativo: tAtivo,
    };

    if (editingTemplate) {
      const { error } = await supabase
        .from("admin_email_templates" as any)
        .update(payload as any)
        .eq("id", editingTemplate.id);
      if (error) toast.error("Erro ao atualizar"); else toast.success("Template atualizado!");
    } else {
      const { error } = await supabase.from("admin_email_templates" as any).insert(payload as any);
      if (error) toast.error("Erro ao criar"); else toast.success("Template criado!");
    }

    setShowTemplateDialog(false);
    fetchTemplates();
  };

  const deleteTemplate = async (id: string) => {
    if (!confirm("Excluir este template de email?")) return;
    await supabase.from("admin_email_templates" as any).delete().eq("id", id);
    toast.success("Template excluído");
    fetchTemplates();
  };

  if (loading) return <p className="text-sm text-muted-foreground text-center py-8">Carregando...</p>;

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base flex items-center gap-2">
              <Mail className="h-5 w-5 text-primary" />
              Configuração do Resend — Admin Master
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
              <p className="text-xs text-muted-foreground">Habilita o envio de emails via Resend</p>
            </div>
            <Switch checked={ativo} onCheckedChange={setAtivo} />
          </div>
          <Separator />
          <div>
            <Label>API Key</Label>
            <div className="relative mt-1">
              <Input type={showApiKey ? "text" : "password"} value={apiKey} onChange={(e) => setApiKey(e.target.value)} placeholder="re_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx" className="pr-10" />
              <button type="button" className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground" onClick={() => setShowApiKey(!showApiKey)}>
                {showApiKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
            <p className="text-xs text-muted-foreground mt-1">Encontre em resend.com/api-keys</p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <Label>Email Remetente</Label>
              <Input value={fromEmail} onChange={(e) => setFromEmail(e.target.value)} placeholder="noreply@seudominio.com" className="mt-1" />
            </div>
            <div>
              <Label>Nome do Remetente</Label>
              <Input value={fromName} onChange={(e) => setFromName(e.target.value)} placeholder="OrçaMóvel PRO" className="mt-1" />
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Send className="h-4 w-4" /> Enviar Email de Teste
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex gap-2">
            <Input value={testEmail} onChange={(e) => setTestEmail(e.target.value)} placeholder="teste@email.com" className="max-w-xs" />
            <Button onClick={handleSendTest} disabled={sendingTest} className="gap-2">
              <Send className="h-4 w-4" />
              {sendingTest ? "Enviando..." : "Enviar Teste"}
            </Button>
          </div>
        </CardContent>
      </Card>

      <div className="flex justify-end">
        <Button onClick={handleSave} disabled={saving} className="gap-2">
          <Save className="h-4 w-4" />
          {saving ? "Salvando..." : "Salvar Configurações"}
        </Button>
      </div>

      <Separator className="my-8" />

      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base flex items-center gap-2">
              <Mail className="h-5 w-5 text-primary" />
              Modelos de Email
            </CardTitle>
            <Button size="sm" onClick={openNewTemplate} className="gap-2">
              <Plus className="h-3 w-3" /> Novo Modelo
            </Button>
          </div>
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
                  <TableCell colSpan={4} className="text-center text-muted-foreground py-6">Nenhum modelo criado.</TableCell>
                </TableRow>
              ) : templates.map((t) => (
                <TableRow key={t.id}>
                  <TableCell className="font-medium">{t.nome}</TableCell>
                  <TableCell>
                    <Badge variant="outline">{EMAIL_TYPES.find((et) => et.value === t.tipo)?.label || t.tipo}</Badge>
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

      <Dialog open={showTemplateDialog} onOpenChange={setShowTemplateDialog}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{editingTemplate ? "Editar Modelo de Email" : "Novo Modelo de Email"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Nome do Modelo</Label>
              <Input value={tNome} onChange={(e) => setTNome(e.target.value)} placeholder="Ex: Comunicado de atualização" className="mt-1" />
            </div>
            <div>
              <Label>Tipo</Label>
              <Select value={tTipo} onValueChange={setTTipo}>
                <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {EMAIL_TYPES.map((et) => (
                    <SelectItem key={et.value} value={et.value}>{et.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Assunto do Email</Label>
              <Input value={tAssunto} onChange={(e) => setTAssunto(e.target.value)} placeholder="Ex: Novidades do sistema" className="mt-1" />
            </div>
            <div>
              <Label>Conteúdo</Label>
              <Textarea value={tConteudo} onChange={(e) => setTConteudo(e.target.value)} placeholder="Conteúdo do email..." rows={8} className="mt-1" />
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
