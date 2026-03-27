import { useState, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { KeyRound, Plus, Trash2, Eye, EyeOff, Shield, CheckCircle2, XCircle, Webhook, Copy, ExternalLink } from "lucide-react";
import { useApiKeys, API_PROVIDERS, type ApiProvider } from "@/hooks/useApiKeys";
import { supabase } from "@/lib/supabaseClient";
import { useTenant } from "@/contexts/TenantContext";
import { toast } from "sonner";

export function ApiKeysTab() {
  const { tenantId } = useTenant();
  const { keys, loading, upsertKey, toggleKey, deleteKey } = useApiKeys(tenantId);
  const [showForm, setShowForm] = useState(false);
  const [selectedProvider, setSelectedProvider] = useState<ApiProvider | "">("");
  const [apiKey, setApiKey] = useState("");
  const [apiUrl, setApiUrl] = useState("");
  const [saving, setSaving] = useState(false);
  const [visibleKeys, setVisibleKeys] = useState<Set<string>>(new Set());

  const availableProviders = API_PROVIDERS.filter(p => !keys.some(k => k.provider === p.value));
  const providerMeta = (provider: string) => API_PROVIDERS.find(p => p.value === provider);

  const [validating, setValidating] = useState(false);
  const [validationResult, setValidationResult] = useState<{ valid: boolean; error?: string } | null>(null);

  const handleSave = async () => {
    if (!selectedProvider || !apiKey.trim()) {
      toast.error("Preencha o provider e a API Key");
      return;
    }
    const meta = providerMeta(selectedProvider);
    if (meta?.urlRequired && !apiUrl.trim()) {
      toast.error("Este provider requer uma URL de API");
      return;
    }
    setSaving(true);
    setValidating(true);
    setValidationResult(null);

    try {
      // Validate API key via edge function
      const { data: result, error: fnError } = await supabase.functions.invoke("onboarding-ai", {
        body: {
          action: "validate_api_key",
          tenant_id: tenantId,
          provider: selectedProvider,
          api_key: apiKey.trim(),
          api_url: apiUrl.trim() || undefined,
        },
      });

      setValidating(false);

      if (fnError || !result?.valid) {
        const errorMsg = result?.error || fnError?.message || "Não foi possível validar";
        setValidationResult({ valid: false, error: errorMsg });
        toast.error(`❌ Validação falhou: ${errorMsg}`);
        setSaving(false);
        return;
      }

      setValidationResult({ valid: true });
      toast.success(`✅ ${meta?.label || selectedProvider} validada com sucesso!`);

      // Key was auto-saved by the edge function, just refresh
      await upsertKey(selectedProvider as ApiProvider, apiKey.trim(), apiUrl.trim() || undefined);
      setShowForm(false);
      setSelectedProvider("");
      setApiKey("");
      setApiUrl("");
      setValidationResult(null);
    } catch (err) {
      setValidating(false);
      toast.error("Erro ao validar API key");
    }

    setSaving(false);
  };

  const maskKey = (key: string) => {
    if (key.length <= 8) return "••••••••";
    return key.slice(0, 4) + "••••••••" + key.slice(-4);
  };

  const toggleVisibility = (id: string) => {
    setVisibleKeys(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="h-5 w-5 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div className="flex items-center gap-2">
            <KeyRound className="h-5 w-5 text-primary" />
            <CardTitle className="text-lg">APIs da Loja</CardTitle>
          </div>
          {availableProviders.length > 0 && (
            <Button size="sm" onClick={() => setShowForm(true)} disabled={showForm}>
              <Plus className="h-4 w-4 mr-1" /> Adicionar API
            </Button>
          )}
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Configure as API keys dos serviços que sua loja utiliza. Cada serviço exige sua própria chave.
          </p>

          {showForm && (
            <Card className="border-primary/30 bg-primary/5">
              <CardContent className="pt-4 space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <Label>Provider</Label>
                    <Select value={selectedProvider} onValueChange={(v) => setSelectedProvider(v as ApiProvider)}>
                      <SelectTrigger><SelectValue placeholder="Selecione..." /></SelectTrigger>
                      <SelectContent>
                        {availableProviders.map(p => (
                          <SelectItem key={p.value} value={p.value}>
                            {p.label} — {p.description}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label>API Key</Label>
                    <Input
                      type="password"
                      value={apiKey}
                      onChange={e => setApiKey(e.target.value)}
                      placeholder="sk-..."
                    />
                  </div>
                </div>
                {selectedProvider && providerMeta(selectedProvider)?.urlRequired && (
                  <div>
                    <Label>URL da API</Label>
                    <Input
                      value={apiUrl}
                      onChange={e => setApiUrl(e.target.value)}
                      placeholder="https://api.exemplo.com"
                    />
                  </div>
                )}
                {validationResult && !validationResult.valid && (
                  <div className="flex items-center gap-2 p-2 rounded-md bg-destructive/10 text-destructive text-xs">
                    <XCircle className="h-4 w-4 shrink-0" />
                    <span>{validationResult.error}</span>
                  </div>
                )}
                {validationResult?.valid && (
                  <div className="flex items-center gap-2 p-2 rounded-md bg-emerald-500/10 text-emerald-600 text-xs">
                    <CheckCircle2 className="h-4 w-4 shrink-0" />
                    <span>API validada com sucesso!</span>
                  </div>
                )}
                <div className="flex gap-2">
                  <Button onClick={handleSave} disabled={saving || validating} size="sm">
                    {validating ? "Validando..." : saving ? "Salvando..." : "Validar e Salvar"}
                  </Button>
                  <Button variant="outline" size="sm" onClick={() => { setShowForm(false); setSelectedProvider(""); setApiKey(""); setApiUrl(""); }}>
                    Cancelar
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}

          {keys.length === 0 && !showForm && (
            <div className="text-center py-8 text-muted-foreground">
              <Shield className="h-12 w-12 mx-auto mb-2 opacity-30" />
              <p>Nenhuma API configurada</p>
              <p className="text-xs">Adicione as APIs necessárias para ativar os módulos do sistema</p>
            </div>
          )}

          <div className="space-y-3">
            {keys.map(k => {
              const meta = providerMeta(k.provider);
              return (
                <div key={k.id} className="flex items-center justify-between p-3 rounded-lg border bg-card">
                  <div className="flex items-center gap-3">
                    <div className="flex items-center gap-2">
                      {k.is_active ? (
                        <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                      ) : (
                        <XCircle className="h-4 w-4 text-destructive" />
                      )}
                      <span className="font-medium">{meta?.label || k.provider}</span>
                    </div>
                    <Badge variant="outline" className="text-xs">
                      {visibleKeys.has(k.id) ? k.api_key : maskKey(k.api_key)}
                    </Badge>
                    {k.api_url && (
                      <span className="text-xs text-muted-foreground truncate max-w-[200px]">{k.api_url}</span>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <Button variant="ghost" size="icon" onClick={() => toggleVisibility(k.id)}>
                      {visibleKeys.has(k.id) ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </Button>
                    <Switch checked={k.is_active} onCheckedChange={(v) => toggleKey(k.id, v)} />
                    <Button variant="ghost" size="icon" onClick={() => deleteKey(k.id)}>
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* Asaas Webhook Configuration */}
      <AsaasWebhookConfig tenantId={tenantId} />
    </div>
  );
}

function AsaasWebhookConfig({ tenantId }: { tenantId: string | null }) {
  const supabaseProjectId = import.meta.env.VITE_SUPABASE_PROJECT_ID || "";
  const webhookUrl = supabaseProjectId
    ? `https://${supabaseProjectId}.supabase.co/functions/v1/asaas-billing`
    : "";

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    toast.success("URL copiada!");
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          <Webhook className="h-5 w-5 text-primary" />
          <CardTitle className="text-lg">Webhook Asaas</CardTitle>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-muted-foreground">
          Configure o webhook no painel do Asaas para receber atualizações automáticas de status de pagamento (PIX e Boleto).
        </p>

        <div className="space-y-3">
          <div>
            <Label className="text-sm font-medium">URL do Webhook</Label>
            <div className="flex items-center gap-2 mt-1">
              <Input
                readOnly
                value={webhookUrl || "Configure VITE_SUPABASE_PROJECT_ID para gerar a URL"}
                className="font-mono text-xs bg-muted"
              />
              {webhookUrl && (
                <Button variant="outline" size="icon" onClick={() => copyToClipboard(webhookUrl)} title="Copiar URL">
                  <Copy className="h-4 w-4" />
                </Button>
              )}
            </div>
          </div>

          <div className="bg-muted/50 rounded-lg p-4 space-y-3">
            <h4 className="text-sm font-semibold text-foreground">📋 Como configurar:</h4>
            <ol className="text-xs text-muted-foreground space-y-2 list-decimal list-inside">
              <li>Acesse o <strong>Painel do Asaas</strong> → Integrações → Webhooks</li>
              <li>Clique em <strong>"Adicionar Webhook"</strong></li>
              <li>Cole a URL acima no campo <strong>"URL"</strong></li>
              <li>Selecione os eventos:
                <ul className="ml-4 mt-1 space-y-0.5 list-disc list-inside">
                  <li><code className="bg-muted px-1 rounded">PAYMENT_RECEIVED</code> — Pagamento confirmado</li>
                  <li><code className="bg-muted px-1 rounded">PAYMENT_CONFIRMED</code> — Pagamento compensado</li>
                  <li><code className="bg-muted px-1 rounded">PAYMENT_OVERDUE</code> — Pagamento vencido</li>
                  <li><code className="bg-muted px-1 rounded">PAYMENT_REFUNDED</code> — Pagamento estornado</li>
                </ul>
              </li>
              <li>Marque <strong>"Ativo"</strong> e salve</li>
            </ol>
          </div>

          <div className="flex items-center gap-2">
            <Badge variant="outline" className="text-xs gap-1">
              <Shield className="h-3 w-3" />
              Método: POST
            </Badge>
            <Badge variant="outline" className="text-xs gap-1">
              Body: JSON (application/json)
            </Badge>
          </div>

          <Button variant="outline" size="sm" className="gap-1.5" asChild>
            <a href="https://docs.asaas.com/docs/webhook" target="_blank" rel="noopener noreferrer">
              <ExternalLink className="h-3.5 w-3.5" />
              Documentação Asaas Webhooks
            </a>
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
