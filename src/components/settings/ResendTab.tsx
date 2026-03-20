import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/lib/supabaseClient";
import { toast } from "sonner";
import { Save, Eye, EyeOff, Mail, CheckCircle2, XCircle, Send } from "lucide-react";
import { getTenantId } from "@/lib/tenantState";

interface TenantResendSettings {
  id: string;
  tenant_id: string;
  api_key: string | null;
  from_email: string | null;
  from_name: string | null;
  ativo: boolean;
}

export function ResendTab() {
  const [settings, setSettings] = useState<TenantResendSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showApiKey, setShowApiKey] = useState(false);

  const [apiKey, setApiKey] = useState("");
  const [fromEmail, setFromEmail] = useState("");
  const [fromName, setFromName] = useState("");
  const [ativo, setAtivo] = useState(false);

  const [testEmail, setTestEmail] = useState("");
  const [sendingTest, setSendingTest] = useState(false);

  const tenantId = getTenantId();

  const fetchSettings = async () => {
    if (!tenantId) { setLoading(false); return; }
    const { data } = await supabase
      .from("tenant_resend_settings" as any)
      .select("*")
      .eq("tenant_id", tenantId)
      .limit(1)
      .maybeSingle();

    if (data) {
      const s = data as unknown as TenantResendSettings;
      setSettings(s);
      setApiKey(s.api_key || "");
      setFromEmail(s.from_email || "");
      setFromName(s.from_name || "");
      setAtivo(s.ativo);
    } else {
      const { data: created } = await supabase
        .from("tenant_resend_settings" as any)
        .insert({ tenant_id: tenantId } as any)
        .select("*")
        .single();
      if (created) setSettings(created as unknown as TenantResendSettings);
    }
    setLoading(false);
  };

  useEffect(() => { fetchSettings(); }, []);

  const handleSave = async () => {
    if (!settings) return;
    setSaving(true);
    const { error } = await supabase
      .from("tenant_resend_settings" as any)
      .update({
        api_key: apiKey.trim() || null,
        from_email: fromEmail.trim() || null,
        from_name: fromName.trim() || null,
        ativo,
      } as any)
      .eq("id", settings.id);
    setSaving(false);
    if (error) toast.error("Erro ao salvar configurações");
    else { toast.success("Configurações do Resend salvas!"); fetchSettings(); }
  };

  const handleSendTest = async () => {
    if (!testEmail.trim()) { toast.error("Informe um email de destino"); return; }
    setSendingTest(true);
    toast.info("O envio de teste será habilitado após a configuração da Edge Function.");
    setSendingTest(false);
  };

  if (loading) return <p className="text-sm text-muted-foreground text-center py-8">Carregando...</p>;

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base flex items-center gap-2">
              <Mail className="h-5 w-5 text-primary" />
              Configuração do Resend — Envio de Emails
            </CardTitle>
            <Badge variant={ativo ? "default" : "secondary"} className={`gap-1 ${ativo ? "bg-green-600 text-white" : ""}`}>
              {ativo ? <><CheckCircle2 className="h-3 w-3" />Ativo</> : <><XCircle className="h-3 w-3" />Inativo</>}
            </Badge>
          </div>
          <p className="text-xs text-muted-foreground">
            Configure o Resend para enviar emails de orçamentos, comunicações e notificações aos seus clientes.
          </p>
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
            <p className="text-xs text-muted-foreground mt-1">Obtenha sua chave em resend.com/api-keys</p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <Label>Email Remetente</Label>
              <Input value={fromEmail} onChange={(e) => setFromEmail(e.target.value)} placeholder="noreply@seudominio.com" className="mt-1" />
            </div>
            <div>
              <Label>Nome do Remetente</Label>
              <Input value={fromName} onChange={(e) => setFromName(e.target.value)} placeholder="Minha Loja" className="mt-1" />
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
    </div>
  );
}
