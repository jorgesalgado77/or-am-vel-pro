/**
 * AdminWhatsAppFunnel — Config panel for WhatsApp conversion funnel on landing page
 */
import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Save, MessageCircle, RefreshCw, ExternalLink } from "lucide-react";
import { useWhatsAppFunnel } from "@/hooks/useWhatsAppFunnel";
import { generateWhatsAppLink } from "@/lib/whatsappFunnel";
import { toast } from "sonner";

export function AdminWhatsAppFunnel() {
  const { config, loading, update } = useWhatsAppFunnel();
  const [form, setForm] = useState(config);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setForm(config);
  }, [config]);

  const handleSave = async () => {
    if (form.enabled && !form.phone.trim()) {
      toast.error("Informe o número de WhatsApp para ativar o funil.");
      return;
    }
    setSaving(true);
    const { error } = await update(form);
    setSaving(false);
    if (error) toast.error("Erro ao salvar configuração");
    else toast.success("Funil WhatsApp atualizado!");
  };

  const testLink = (msg: string) => {
    if (!form.phone) { toast.error("Informe o número primeiro"); return; }
    window.open(generateWhatsAppLink(form.phone, msg), "_blank");
  };

  if (loading) return <div className="text-muted-foreground p-8 text-center animate-pulse">Carregando...</div>;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold flex items-center gap-2">
            <MessageCircle className="h-5 w-5 text-green-600" />
            Funil de Conversão WhatsApp
          </h3>
          <p className="text-sm text-muted-foreground mt-1">
            Configure o funil de WhatsApp na landing page para capturar leads e iniciar conversas.
          </p>
        </div>
        <Badge variant={form.enabled ? "default" : "secondary"}>
          {form.enabled ? "Ativo" : "Inativo"}
        </Badge>
      </div>

      {/* Toggle */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex items-center justify-between">
            <div>
              <Label className="text-base font-medium">Ativar funil WhatsApp</Label>
              <p className="text-sm text-muted-foreground">
                Mostra botões de WhatsApp na landing page e botão flutuante
              </p>
            </div>
            <Switch
              checked={form.enabled}
              onCheckedChange={(checked) => setForm((p) => ({ ...p, enabled: checked }))}
            />
          </div>
        </CardContent>
      </Card>

      {/* Phone */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Número do WhatsApp</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="space-y-2">
            <Label>Número com DDD (sem +55)</Label>
            <Input
              placeholder="11999999999"
              value={form.phone}
              onChange={(e) => setForm((p) => ({ ...p, phone: e.target.value.replace(/\D/g, "") }))}
              maxLength={15}
            />
            <p className="text-xs text-muted-foreground">
              Exemplo: 11999999999 (o sistema adiciona o 55 automaticamente)
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Messages */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Mensagens do Funil</CardTitle>
        </CardHeader>
        <CardContent className="space-y-5">
          {([
            { key: "interest" as const, label: "🔹 Interesse (Hero)", desc: "Usado no botão principal do Hero da landing" },
            { key: "qualification" as const, label: "🔹 Qualificação", desc: "Para seções intermediárias" },
            { key: "closing" as const, label: "🔹 Fechamento (CTA Final)", desc: "Usado no CTA final da página" },
            { key: "support" as const, label: "🔹 Suporte (Botão Flutuante)", desc: "Usado no botão flutuante fixo" },
          ]).map(({ key, label, desc }) => (
            <div key={key} className="space-y-2">
              <div className="flex items-center justify-between">
                <div>
                  <Label className="font-medium">{label}</Label>
                  <p className="text-xs text-muted-foreground">{desc}</p>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => testLink(form.messages[key])}
                  disabled={!form.phone}
                  className="text-green-600 hover:text-green-700"
                >
                  <ExternalLink className="h-3.5 w-3.5 mr-1" />
                  Testar
                </Button>
              </div>
              <Textarea
                value={form.messages[key]}
                onChange={(e) =>
                  setForm((p) => ({
                    ...p,
                    messages: { ...p.messages, [key]: e.target.value },
                  }))
                }
                maxLength={500}
                rows={2}
              />
            </div>
          ))}
        </CardContent>
      </Card>

      {/* Save */}
      <div className="flex justify-end">
        <Button onClick={handleSave} disabled={saving} className="gap-2">
          {saving ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          Salvar Configuração
        </Button>
      </div>
    </div>
  );
}
