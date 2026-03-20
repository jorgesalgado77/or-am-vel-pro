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
  Save, Eye, EyeOff, Mail, CheckCircle2, XCircle,
  Plus, Trash2, Edit, Send,
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

export function AdminResendConfig() {
  const [settings, setSettings] = useState<ResendSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showApiKey, setShowApiKey] = useState(false);

  const [apiKey, setApiKey] = useState("");
  const [fromEmail, setFromEmail] = useState("");
  const [fromName, setFromName] = useState("");
  const [ativo, setAtivo] = useState(false);

  // Templates
  const [templates, setTemplates] = useState<EmailTemplate[]>([]);
  const [showTemplateDialog, setShowTemplateDialog] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<EmailTemplate | null>(null);
  const [tNome, setTNome] = useState("");
  const [tAssunto, setTAssunto] = useState("");
  const [tConteudo, setTConteudo] = useState("");
  const [tTipo, setTTipo] = useState("comunicado");
  const [tAtivo, setTAtivo] = useState(true);

  // Test
  const [testEmail, setTestEmail] = useState("");
  const [sendingTest, setSendingTest] = useState(false);

  const fetchSettings = async () => {
    const { data } = await supabase
      .from("admin_resend_settings" as any)
      .select("*")
      .limit(1)
      .maybeSingle();

    if (data) {
      const s = data as unknown as ResendSettings;
      setSettings(s);
      setApiKey(s.api_key || "");
      setFromEmail(s.from_email || "");
      setFromName(s.from_name || "");
      setAtivo(s.ativo);
    } else {
      const { data: created } = await supabase
        .from("admin_resend_settings" as any)
        .insert({} as any)
        .select("*")
        .single();
      if (created) setSettings(created as unknown as ResendSettings);
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

  const handleSave = async () => {
    if (!settings) return;
    setSaving(true);
    const { error } = await supabase
      .from("admin_resend_settings" as any)
      .update({
        api_key: apiKey.trim() || null,
        from_email: fromEmail.trim() || null,
        from_name: fromName.trim() || null,
        ativo,
      } as any)
      .eq("id", settings.id);
    setSaving(false);
    if (error) toast.error("Erro ao salvar configurações");
    else {
      toast.success("Configurações do Resend salvas!");
      fetchSettings();
    }
  };

  const handleSendTest = async () => {
    if (!testEmail.trim()) {
      toast.error("Informe um email de destino");
      return;
    }
    setSendingTest(true);
    toast.info("Funcionalidade de envio de teste será ativada após configurar a Edge Function do Resend.");
    setSendingTest(false);
  };

  // Template CRUD
  const openNewTemplate = () => {
    setEditingTemplate(null);
    setTNome(""); setTAssunto(""); setTConteudo(""); setTTipo("comunicado"); setTAtivo(true);
    setShowTemplateDialog(true);
  };

  const openEditTemplate = (t: EmailTemplate) => {
    setEditingTemplate(t);
    setTNome(t.nome); setTAssunto(t.assunto); setTConteudo(t.conteudo); setTTipo(t.tipo); setTAtivo(t.ativo);
    setShowTemplateDialog(true);
  };

  const saveTemplate = async () => {
    if (!tNome.trim() || !tAssunto.trim() || !tConteudo.trim()) {
      toast.error("Nome, assunto e conteúdo são obrigatórios");
      return;
    }
    const payload = { nome: tNome.trim(), assunto: tAssunto.trim(), conteudo: tConteudo.trim(), tipo: tTipo, ativo: tAtivo };
    if (editingTemplate) {
      const { error } = await supabase.from("admin_email_templates" as any).update(payload as any).eq("id", editingTemplate.id);
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

      {/* Test */}
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

      {/* Save */}
      <div className="flex justify-end">
        <Button onClick={handleSave} disabled={saving} className="gap-2">
          <Save className="h-4 w-4" />
          {saving ? "Salvando..." : "Salvar Configurações"}
        </Button>
      </div>

      <Separator className="my-8" />

      {/* Email Templates */}
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

      {/* Template Dialog */}
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
